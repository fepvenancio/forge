import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/coordination/conflict-detector.js", () => ({
  checkConflicts: vi.fn(),
}));

// Import the functions under test
import { isGsdBranch, handlePullRequestOpened } from "../../../packages/webhook/src/server.js";

describe("PR conflict handler", () => {
  describe("isGsdBranch", () => {
    it("CONFLICT-04: returns true for valid gsd branch names", () => {
      expect(isGsdBranch("gsd/phase-1-foundation")).toBe(true);
      expect(isGsdBranch("gsd/phase-02-conflict-detection")).toBe(true);
      expect(isGsdBranch("gsd/phase-10-final-stage")).toBe(true);
    });

    it("CONFLICT-04: returns false for non-gsd branches", () => {
      expect(isGsdBranch("main")).toBe(false);
      expect(isGsdBranch("feature/something")).toBe(false);
      expect(isGsdBranch("gsd/not-a-phase")).toBe(false);
    });
  });

  describe("handlePullRequestOpened", () => {
    it("CONFLICT-04: skips non-gsd branches with message", async () => {
      const result = await handlePullRequestOpened({
        action: "opened",
        number: 1,
        pull_request: { head: { ref: "feature/something" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      expect(result).toContain("Skipping non-GSD branch");
    });

    it("CONFLICT-04: triggers conflict check for gsd phase branches", async () => {
      const { checkConflicts } = await import("../../../packages/orchestrator/src/coordination/conflict-detector.js");
      vi.mocked(checkConflicts).mockResolvedValue({
        conflicts: [],
        lockWarnings: [],
        declaredOnlyFiles: new Map(),
        actualOnlyFiles: new Map(),
        timestamp: Date.now(),
      });

      const result = await handlePullRequestOpened({
        action: "opened",
        number: 42,
        pull_request: { head: { ref: "gsd/phase-1-foundation" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      expect(result).toContain("Conflict check completed");
    });
  });
});
