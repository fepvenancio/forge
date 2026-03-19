import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/utils/git.js", () => ({
  showFile: vi.fn(),
  diffNameOnly: vi.fn(),
  listTree: vi.fn(),
  listLocalBranches: vi.fn(),
  createBranch: vi.fn(),
  getGitConfigValue: vi.fn(),
}));

import {
  readFileFromBranch,
  parsePlanFromBranch,
  parseSummaryFromBranch,
  parseConfigFromBranch,
  discoverPlanFiles,
} from "../../../packages/orchestrator/src/coordination/gsd-reader.js";

import * as git from "../../../packages/orchestrator/src/utils/git.js";

const mockedGit = vi.mocked(git);

describe("gsd-reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("readFileFromBranch", () => {
    it("GSD-01: reads ROADMAP.md from a branch via git.showFile", async () => {
      mockedGit.showFile.mockResolvedValue("# Roadmap content");
      const result = await readFileFromBranch("gsd/phase-1-foundation", ".planning/ROADMAP.md");
      expect(mockedGit.showFile).toHaveBeenCalledWith("gsd/phase-1-foundation", ".planning/ROADMAP.md");
      expect(result).toBe("# Roadmap content");
    });

    it("GSD-01: returns null when file does not exist on branch", async () => {
      mockedGit.showFile.mockRejectedValue(new Error("fatal: Path does not exist"));
      const result = await readFileFromBranch("gsd/phase-1-foundation", "nonexistent.md");
      expect(result).toBeNull();
    });
  });

  describe("parsePlanFromBranch", () => {
    const PLAN_CONTENT = `---
phase: 03-dashboard-ui
plan: 1
files_modified:
  - packages/dashboard/app.py
  - packages/dashboard/pages/phase_map.py
requirements:
  - DASH-01
  - DASH-02
wave: 1
depends_on: []
---
# Plan content here
`;

    it("GSD-02: extracts files_modified array from PLAN.md frontmatter", async () => {
      mockedGit.showFile.mockResolvedValue(PLAN_CONTENT);
      const result = await parsePlanFromBranch("gsd/phase-3-dashboard-ui", ".planning/phases/03-dashboard-ui/03-01-PLAN.md");
      expect(result).not.toBeNull();
      expect(result!.filesModified).toEqual([
        "packages/dashboard/app.py",
        "packages/dashboard/pages/phase_map.py",
      ]);
    });

    it("GSD-02: extracts requirements array from PLAN.md frontmatter", async () => {
      mockedGit.showFile.mockResolvedValue(PLAN_CONTENT);
      const result = await parsePlanFromBranch("gsd/phase-3-dashboard-ui", ".planning/phases/03-dashboard-ui/03-01-PLAN.md");
      expect(result).not.toBeNull();
      expect(result!.requirements).toEqual(["DASH-01", "DASH-02"]);
      expect(result!.phase).toBe("03-dashboard-ui");
      expect(result!.plan).toBe(1);
      expect(result!.wave).toBe(1);
      expect(result!.dependsOn).toEqual([]);
    });

    it("GSD-02: returns null when PLAN.md does not exist on branch", async () => {
      mockedGit.showFile.mockRejectedValue(new Error("fatal: Path does not exist"));
      const result = await parsePlanFromBranch("gsd/phase-3-dashboard-ui", "nonexistent-PLAN.md");
      expect(result).toBeNull();
    });
  });

  describe("parseSummaryFromBranch", () => {
    const SUMMARY_CONTENT = `---
phase: 01-foundation
plan: 1
requirements-completed:
  - SCHEMA-01
  - SCHEMA-02
duration: 3min
completed: "2026-03-18T22:00:00Z"
---
# Summary content here
`;

    it("GSD-03: extracts requirements-completed from SUMMARY.md frontmatter", async () => {
      mockedGit.showFile.mockResolvedValue(SUMMARY_CONTENT);
      const result = await parseSummaryFromBranch("gsd/phase-1-foundation", ".planning/phases/01-foundation/01-01-SUMMARY.md");
      expect(result).not.toBeNull();
      expect(result!.requirementsCompleted).toEqual(["SCHEMA-01", "SCHEMA-02"]);
    });

    it("GSD-03: extracts duration and completed fields from SUMMARY.md", async () => {
      mockedGit.showFile.mockResolvedValue(SUMMARY_CONTENT);
      const result = await parseSummaryFromBranch("gsd/phase-1-foundation", ".planning/phases/01-foundation/01-01-SUMMARY.md");
      expect(result).not.toBeNull();
      expect(result!.duration).toBe("3min");
      expect(result!.completed).toBe("2026-03-18T22:00:00Z");
      expect(result!.phase).toBe("01-foundation");
      expect(result!.plan).toBe(1);
    });

    it("GSD-03: returns null when SUMMARY.md does not exist on branch", async () => {
      mockedGit.showFile.mockRejectedValue(new Error("fatal: Path does not exist"));
      const result = await parseSummaryFromBranch("gsd/phase-1-foundation", "nonexistent-SUMMARY.md");
      expect(result).toBeNull();
    });
  });

  describe("parseConfigFromBranch", () => {
    const VALID_CONFIG = JSON.stringify({
      mode: "interactive",
      granularity: "standard",
      workflow: {
        research: true,
        plan_check: true,
        verifier: true,
        auto_advance: false,
      },
      git: {
        branching_strategy: "phase",
        phase_branch_template: "gsd/phase-{phase}-{slug}",
      },
    });

    it("GSD-04: parses config.json and returns typed config object", async () => {
      mockedGit.showFile.mockResolvedValue(VALID_CONFIG);
      const result = await parseConfigFromBranch("gsd/phase-1-foundation");
      expect(result.valid).toBe(true);
      expect(result.config).not.toBeNull();
      expect(result.config!.mode).toBe("interactive");
      expect(result.config!.granularity).toBe("standard");
      expect(result.config!.workflow.research).toBe(true);
      expect(result.config!.workflow.auto_advance).toBe(false);
      expect(result.config!.git.branching_strategy).toBe("phase");
      expect(result.errors).toEqual([]);
    });

    it("GSD-04: returns errors when config.json does not exist on branch", async () => {
      mockedGit.showFile.mockRejectedValue(new Error("fatal: Path does not exist"));
      const result = await parseConfigFromBranch("gsd/phase-1-foundation");
      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors).toContain("config.json not found on branch");
    });

    it("GSD-04: returns validation errors for non-conforming config", async () => {
      const badConfig = JSON.stringify({
        mode: "interactive",
        granularity: "standard",
        git: { branching_strategy: "trunk" },
      });
      mockedGit.showFile.mockResolvedValue(badConfig);
      const result = await parseConfigFromBranch("gsd/phase-1-foundation");
      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain("missing or invalid 'workflow' object");
      expect(result.errors).toContain("git.branching_strategy must be 'phase'");
    });

    it("GSD-04: returns error for invalid JSON", async () => {
      mockedGit.showFile.mockResolvedValue("not valid json {{{");
      const result = await parseConfigFromBranch("gsd/phase-1-foundation");
      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors[0]).toMatch(/Invalid JSON/);
    });
  });

  describe("discoverPlanFiles", () => {
    it("GSD-02: discovers all PLAN.md files on a branch via git ls-tree", async () => {
      mockedGit.listTree.mockResolvedValue([
        ".planning/phases/01-foundation/01-01-PLAN.md",
        ".planning/phases/01-foundation/01-01-SUMMARY.md",
        ".planning/phases/01-foundation/01-02-PLAN.md",
      ]);
      const result = await discoverPlanFiles("gsd/phase-1-foundation");
      expect(mockedGit.listTree).toHaveBeenCalledWith("gsd/phase-1-foundation", ".planning/");
      expect(result).toEqual([
        ".planning/phases/01-foundation/01-01-PLAN.md",
        ".planning/phases/01-foundation/01-02-PLAN.md",
      ]);
    });

    it("returns empty array when no plan files exist", async () => {
      mockedGit.listTree.mockResolvedValue([]);
      const result = await discoverPlanFiles("gsd/phase-1-foundation");
      expect(result).toEqual([]);
    });
  });
});
