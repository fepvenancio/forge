import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/utils/git.js", () => ({
  showFile: vi.fn(),
  diffNameOnly: vi.fn(),
  listTree: vi.fn(),
  raw: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getAllPhaseAssignments: vi.fn(),
  getAllFileLocks: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/coordination/gsd-reader.js", () => ({
  parsePlanFromBranch: vi.fn(),
  discoverPlanFiles: vi.fn(),
}));

import { collectPhaseFiles, findConflicts, checkConflicts } from "../../../packages/orchestrator/src/coordination/conflict-detector.js";
import type { PhaseFileSet } from "../../../packages/orchestrator/src/coordination/conflict-detector.js";
import * as queries from "../../../packages/orchestrator/src/dolt/queries.js";
import * as gsdReader from "../../../packages/orchestrator/src/coordination/gsd-reader.js";
import * as git from "../../../packages/orchestrator/src/utils/git.js";
import type { PhaseAssignment, FileLock } from "../../../packages/orchestrator/src/dolt/schema.js";

const mockedQueries = vi.mocked(queries);
const mockedGsd = vi.mocked(gsdReader);
const mockedGit = vi.mocked(git);

describe("conflict-detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("collectPhaseFiles", () => {
    it("CONFLICT-01: collects declared files from PLAN.md frontmatter for each active phase", async () => {
      const assignment: PhaseAssignment = {
        phase_id: 1,
        assignee: "alice",
        assigned_at: Date.now(),
        status: "in_progress",
        branch_name: "gsd/phase-1-foundation",
        pr_number: null,
      };

      mockedGsd.discoverPlanFiles.mockResolvedValue([".planning/phases/01-foundation/01-01-PLAN.md"]);
      mockedGsd.parsePlanFromBranch.mockResolvedValue({
        phase: "01-foundation",
        plan: 1,
        filesModified: ["src/auth.ts", "src/db.ts"],
        requirements: [],
        wave: 1,
        dependsOn: [],
        raw: "",
      });
      mockedGit.diffNameOnly.mockResolvedValue(["src/auth.ts", "src/index.ts"]);

      const result = await collectPhaseFiles(assignment);

      expect(result.phaseId).toBe(1);
      expect(result.branch).toBe("gsd/phase-1-foundation");
      expect(result.declared).toContain("src/auth.ts");
      expect(result.declared).toContain("src/db.ts");
    });

    it("CONFLICT-02: collects actual files from git diff for each active phase", async () => {
      const assignment: PhaseAssignment = {
        phase_id: 2,
        assignee: "bob",
        assigned_at: Date.now(),
        status: "in_progress",
        branch_name: "gsd/phase-2-api",
        pr_number: null,
      };

      mockedGsd.discoverPlanFiles.mockResolvedValue([]);
      mockedGit.diffNameOnly.mockResolvedValue(["src/api.ts", "src/routes.ts"]);

      const result = await collectPhaseFiles(assignment);

      expect(result.actual).toContain("src/api.ts");
      expect(result.actual).toContain("src/routes.ts");
    });

    it("CONFLICT-01: skips phases with no branch or no .planning/ files", async () => {
      const assignment: PhaseAssignment = {
        phase_id: 3,
        assignee: "charlie",
        assigned_at: Date.now(),
        status: "assigned",
        branch_name: "gsd/phase-3-ui",
        pr_number: null,
      };

      mockedGsd.discoverPlanFiles.mockRejectedValue(new Error("branch not found"));
      mockedGit.diffNameOnly.mockRejectedValue(new Error("branch not found"));

      const result = await collectPhaseFiles(assignment);

      expect(result.declared).toEqual([]);
      expect(result.actual).toEqual([]);
    });
  });

  describe("findConflicts", () => {
    it("CONFLICT-01: finds file overlaps across two phases", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: ["src/shared.ts", "src/a.ts"], actual: ["src/shared.ts"] },
        { phaseId: 2, branch: "gsd/phase-2-b", declared: ["src/shared.ts", "src/b.ts"], actual: ["src/shared.ts"] },
      ];

      const report = findConflicts(phaseSets, []);

      expect(report.conflicts.length).toBeGreaterThan(0);
      const sharedConflict = report.conflicts.find(c => c.filePath === "src/shared.ts");
      expect(sharedConflict).toBeDefined();
      expect(sharedConflict!.phases).toHaveLength(2);
    });

    it("CONFLICT-01: returns empty conflicts when no overlaps exist", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: ["src/a.ts"], actual: ["src/a.ts"] },
        { phaseId: 2, branch: "gsd/phase-2-b", declared: ["src/b.ts"], actual: ["src/b.ts"] },
      ];

      const report = findConflicts(phaseSets, []);

      expect(report.conflicts).toEqual([]);
    });

    it("CONFLICT-02: detects conflicts from actual git diff files not in declared touch maps", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: [], actual: ["src/common.ts"] },
        { phaseId: 2, branch: "gsd/phase-2-b", declared: [], actual: ["src/common.ts"] },
      ];

      const report = findConflicts(phaseSets, []);

      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0].filePath).toBe("src/common.ts");
      expect(report.conflicts[0].phases[0].source).toBe("actual");
    });

    it("CONFLICT-03: reports conflicts at file level with phase identifiers and source (declared/actual)", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: ["src/shared.ts"], actual: [] },
        { phaseId: 2, branch: "gsd/phase-2-b", declared: [], actual: ["src/shared.ts"] },
      ];

      const report = findConflicts(phaseSets, []);

      expect(report.conflicts).toHaveLength(1);
      const conflict = report.conflicts[0];
      expect(conflict.filePath).toBe("src/shared.ts");

      const phase1Source = conflict.phases.find(p => p.phaseId === 1);
      const phase2Source = conflict.phases.find(p => p.phaseId === 2);
      expect(phase1Source!.source).toBe("declared");
      expect(phase2Source!.source).toBe("actual");
    });
  });

  describe("buildConflictReport", () => {
    it("CONFLICT-03: ConflictReport includes filePath, phases array with phaseId/branch/source", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: ["src/shared.ts"], actual: ["src/shared.ts"] },
        { phaseId: 2, branch: "gsd/phase-2-b", declared: ["src/shared.ts"], actual: [] },
      ];

      const report = findConflicts(phaseSets, []);

      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.conflicts[0].phases[0]).toHaveProperty("phaseId");
      expect(report.conflicts[0].phases[0]).toHaveProperty("branch");
      expect(report.conflicts[0].phases[0]).toHaveProperty("source");
    });

    it("LOCK-04: ConflictReport includes lockWarnings that are advisory (never block)", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: ["src/locked.ts"], actual: [] },
        { phaseId: 2, branch: "gsd/phase-2-b", declared: ["src/locked.ts"], actual: [] },
      ];
      const locks: FileLock[] = [{
        file_path: "src/locked.ts",
        locked_by: "alice",
        phase_id: 1,
        locked_at: Date.now(),
        reason: "working on it",
      }];

      const report = findConflicts(phaseSets, locks);

      expect(report.lockWarnings).toHaveLength(1);
      expect(report.lockWarnings[0].filePath).toBe("src/locked.ts");
      expect(report.lockWarnings[0].lockedBy).toBe("alice");
      expect(report.lockWarnings[0].conflictingPhases).toContain(2);
    });

    it("CONFLICT-02: ConflictReport includes declaredOnlyFiles and actualOnlyFiles for staleness detection", () => {
      const phaseSets: PhaseFileSet[] = [
        { phaseId: 1, branch: "gsd/phase-1-a", declared: ["src/planned.ts"], actual: ["src/surprise.ts"] },
      ];

      const report = findConflicts(phaseSets, []);

      expect(report.declaredOnlyFiles.get(1)).toContain("src/planned.ts");
      expect(report.actualOnlyFiles.get(1)).toContain("src/surprise.ts");
    });
  });
});
