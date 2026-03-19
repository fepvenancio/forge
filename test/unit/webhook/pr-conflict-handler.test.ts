import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/coordination/conflict-detector.js", () => ({
  checkConflicts: vi.fn(),
}));

describe("PR conflict handler", () => {
  describe("handlePullRequestEvent", () => {
    it.todo("CONFLICT-04: triggers conflict check when pull_request event with action=opened is received");
    it.todo("CONFLICT-04: extracts branch name from pull_request payload head.ref");
    it.todo("CONFLICT-04: posts conflict report as PR comment via @octokit/rest");
    it.todo("CONFLICT-04: handles missing or invalid payload gracefully");
    it.todo("CONFLICT-04: skips non-gsd branches (branch name does not match gsd/phase-* pattern)");
  });
});
