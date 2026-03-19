import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/utils/git.js", () => ({
  showFile: vi.fn(),
  raw: vi.fn(),
}));

describe("gsd-reader", () => {
  describe("readFileFromBranch", () => {
    it.todo("GSD-01: reads ROADMAP.md from a branch via git.showFile");
    it.todo("GSD-01: returns null when file does not exist on branch");
  });

  describe("parsePlanFromBranch", () => {
    it.todo("GSD-02: extracts files_modified array from PLAN.md frontmatter");
    it.todo("GSD-02: extracts requirements array from PLAN.md frontmatter");
    it.todo("GSD-02: returns null when PLAN.md does not exist on branch");
  });

  describe("parseSummaryFromBranch", () => {
    it.todo("GSD-03: extracts requirements-completed from SUMMARY.md frontmatter");
    it.todo("GSD-03: extracts duration and completed fields from SUMMARY.md");
    it.todo("GSD-03: returns null when SUMMARY.md does not exist on branch");
  });

  describe("parseConfigFromBranch", () => {
    it.todo("GSD-04: parses config.json and returns typed config object");
    it.todo("GSD-04: returns null when config.json does not exist on branch");
    it.todo("GSD-04: returns validation errors for non-conforming config");
  });

  describe("discoverPlanFiles", () => {
    it.todo("GSD-02: discovers all PLAN.md files on a branch via git ls-tree");
  });
});
