import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/utils/git.js", () => ({
  showFile: vi.fn(),
  diffNameOnly: vi.fn(),
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

describe("conflict-detector", () => {
  describe("collectPhaseFiles", () => {
    it.todo("CONFLICT-01: collects declared files from PLAN.md frontmatter for each active phase");
    it.todo("CONFLICT-02: collects actual files from git diff for each active phase");
    it.todo("CONFLICT-01: skips phases with no branch or no .planning/ files");
  });

  describe("findConflicts", () => {
    it.todo("CONFLICT-01: finds file overlaps across two phases");
    it.todo("CONFLICT-01: returns empty conflicts when no overlaps exist");
    it.todo("CONFLICT-02: detects conflicts from actual git diff files not in declared touch maps");
    it.todo("CONFLICT-03: reports conflicts at file level with phase identifiers and source (declared/actual)");
  });

  describe("buildConflictReport", () => {
    it.todo("CONFLICT-03: ConflictReport includes filePath, phases array with phaseId/branch/source");
    it.todo("LOCK-04: ConflictReport includes lockWarnings that are advisory (never block)");
    it.todo("CONFLICT-02: ConflictReport includes declaredOnlyFiles and actualOnlyFiles for staleness detection");
  });
});
