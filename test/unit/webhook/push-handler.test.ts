import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getFlowsForFile: vi.fn(),
  markFlowStale: vi.fn(),
  getAllPhaseAssignments: vi.fn(),
  getAllDevelopers: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/coordination/conflict-detector.js", () => ({
  checkConflicts: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/coordination/merge-engine.js", () => ({
  getMergeOrderForOpenPRs: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/coordination/escalation.js", () => ({
  escalateConflicts: vi.fn(),
}));

// Shared mock instances so we can inspect calls across the test
const mockCreateComment = vi.fn().mockResolvedValue({});
const mockListComments = vi.fn().mockResolvedValue({ data: [] });
const mockUpdateComment = vi.fn().mockResolvedValue({});

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    issues: {
      createComment: mockCreateComment,
      listComments: mockListComments,
      updateComment: mockUpdateComment,
    },
  })),
}));

import { handlePushEvent, extractChangedFiles, handlePullRequestOpened } from "../../../packages/webhook/src/server.js";

describe("push event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores push events for non-GSD branches", async () => {
    const result = await handlePushEvent({
      ref: "refs/heads/main",
      commits: [],
      repository: { owner: { login: "org" }, name: "repo" },
    });

    expect(result).toContain("Skipping non-GSD branch");
  });

  it("extracts changed files from push payload commits", () => {
    const files = extractChangedFiles({
      ref: "refs/heads/gsd/phase-1-foundation",
      commits: [
        { added: ["a.ts", "b.ts"], modified: ["c.ts"], removed: [] },
        { added: [], modified: ["c.ts", "d.ts"], removed: ["e.ts"] },
      ],
      repository: { owner: { login: "org" }, name: "repo" },
    });

    // Deduplicated: a.ts, b.ts, c.ts, d.ts, e.ts
    expect(files).toHaveLength(5);
    expect(files).toContain("a.ts");
    expect(files).toContain("b.ts");
    expect(files).toContain("c.ts");
    expect(files).toContain("d.ts");
    expect(files).toContain("e.ts");
  });

  it("marks matching flows as stale in Dolt", async () => {
    const queries = await import("../../../packages/orchestrator/src/dolt/queries.js");
    vi.mocked(queries.getFlowsForFile).mockResolvedValue([
      { id: "flow-1", flow_path: ".flows/auth.md", title: "Auth", criticality: "high", last_reviewed: null, last_modified: 1000, stale: false },
    ]);
    vi.mocked(queries.markFlowStale).mockResolvedValue(undefined);

    const result = await handlePushEvent({
      ref: "refs/heads/gsd/phase-1-foundation",
      commits: [{ added: [], modified: ["src/auth/login.ts"], removed: [] }],
      repository: { owner: { login: "org" }, name: "repo" },
    });

    expect(queries.getFlowsForFile).toHaveBeenCalledWith("src/auth/login.ts");
    expect(queries.markFlowStale).toHaveBeenCalledWith("flow-1");
    expect(result).toContain("Marked 1 flow(s) as stale");
  });

  it("handles push with no matching flow file refs", async () => {
    const queries = await import("../../../packages/orchestrator/src/dolt/queries.js");
    vi.mocked(queries.getFlowsForFile).mockResolvedValue([]);

    const result = await handlePushEvent({
      ref: "refs/heads/gsd/phase-1-foundation",
      commits: [{ added: ["readme.md"], modified: [], removed: [] }],
      repository: { owner: { login: "org" }, name: "repo" },
    });

    expect(result).toContain("No flows affected");
  });

  it("returns success even when Dolt is unavailable", async () => {
    const queries = await import("../../../packages/orchestrator/src/dolt/queries.js");
    vi.mocked(queries.getFlowsForFile).mockRejectedValue(new Error("Connection refused"));

    const result = await handlePushEvent({
      ref: "refs/heads/gsd/phase-1-foundation",
      commits: [{ added: ["src/x.ts"], modified: [], removed: [] }],
      repository: { owner: { login: "org" }, name: "repo" },
    });

    expect(result).toContain("Dolt unavailable");
  });

  describe("merge order PR comment", () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = "test-token";
    });

    it("posts merge order PR comment when multiple PRs are open", async () => {
      const { checkConflicts } = await import("../../../packages/orchestrator/src/coordination/conflict-detector.js");
      const { getMergeOrderForOpenPRs } = await import("../../../packages/orchestrator/src/coordination/merge-engine.js");

      vi.mocked(checkConflicts).mockResolvedValue({
        conflicts: [],
        lockWarnings: [],
        declaredOnlyFiles: new Map(),
        actualOnlyFiles: new Map(),
        timestamp: Date.now(),
      });

      vi.mocked(getMergeOrderForOpenPRs).mockResolvedValue({
        order: [1, 3],
        cycles: [],
        reasoning: ["Phase 1 before Phase 3 (shared files: src/auth.ts)"],
      });

      mockListComments.mockResolvedValue({ data: [] });

      const result = await handlePullRequestOpened({
        action: "opened",
        number: 42,
        pull_request: { head: { ref: "gsd/phase-1-foundation" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      expect(result).toContain("PR #42");
      expect(getMergeOrderForOpenPRs).toHaveBeenCalled();
    });

    it("uses <!-- forge-merge-order --> marker for update-or-create", async () => {
      const { checkConflicts } = await import("../../../packages/orchestrator/src/coordination/conflict-detector.js");
      const { getMergeOrderForOpenPRs } = await import("../../../packages/orchestrator/src/coordination/merge-engine.js");

      vi.mocked(checkConflicts).mockResolvedValue({
        conflicts: [],
        lockWarnings: [],
        declaredOnlyFiles: new Map(),
        actualOnlyFiles: new Map(),
        timestamp: Date.now(),
      });

      vi.mocked(getMergeOrderForOpenPRs).mockResolvedValue({
        order: [1, 3],
        cycles: [],
        reasoning: ["Phase 1 before Phase 3 (shared files: src/auth.ts)"],
      });

      // Simulate existing merge order comment for update path
      mockListComments.mockResolvedValue({
        data: [{ id: 99, body: "<!-- forge-merge-order -->\nOld content" }],
      });

      await handlePullRequestOpened({
        action: "opened",
        number: 42,
        pull_request: { head: { ref: "gsd/phase-1-foundation" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      // Check shared mock calls for merge-order marker
      const createBodies = mockCreateComment.mock.calls.map((c: any) => c[0]?.body || "");
      const updateBodies = mockUpdateComment.mock.calls.map((c: any) => c[0]?.body || "");
      const allBodies = [...createBodies, ...updateBodies];

      const hasMergeOrderMarker = allBodies.some((b: string) => b.includes("<!-- forge-merge-order -->"));
      expect(hasMergeOrderMarker).toBe(true);
    });

    it("skips merge order comment when fewer than 2 PRs are open", async () => {
      const { checkConflicts } = await import("../../../packages/orchestrator/src/coordination/conflict-detector.js");
      const { getMergeOrderForOpenPRs } = await import("../../../packages/orchestrator/src/coordination/merge-engine.js");

      vi.mocked(checkConflicts).mockResolvedValue({
        conflicts: [],
        lockWarnings: [],
        declaredOnlyFiles: new Map(),
        actualOnlyFiles: new Map(),
        timestamp: Date.now(),
      });

      vi.mocked(getMergeOrderForOpenPRs).mockResolvedValue({
        order: [1],
        cycles: [],
        reasoning: [],
      });

      mockListComments.mockResolvedValue({ data: [] });

      await handlePullRequestOpened({
        action: "opened",
        number: 42,
        pull_request: { head: { ref: "gsd/phase-1-foundation" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      // Should have conflict comment but NOT merge order (only 1 phase)
      const createBodies = mockCreateComment.mock.calls.map((c: any) => c[0]?.body || "");
      const hasMergeOrderMarker = createBodies.some((b: string) => b.includes("<!-- forge-merge-order -->"));
      expect(hasMergeOrderMarker).toBe(false);
    });
  });

  describe("escalation wiring", () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = "test-token";
    });

    it("triggers escalateConflicts when conflict report has conflicts", async () => {
      const { checkConflicts } = await import("../../../packages/orchestrator/src/coordination/conflict-detector.js");
      const { escalateConflicts } = await import("../../../packages/orchestrator/src/coordination/escalation.js");
      const queries = await import("../../../packages/orchestrator/src/dolt/queries.js");
      const { getMergeOrderForOpenPRs } = await import("../../../packages/orchestrator/src/coordination/merge-engine.js");

      const mockReport = {
        conflicts: [
          { filePath: "src/auth.ts", phases: [{ phaseId: 1, source: "declared" }, { phaseId: 3, source: "actual" }] },
        ],
        lockWarnings: [],
        declaredOnlyFiles: new Map(),
        actualOnlyFiles: new Map(),
        timestamp: Date.now(),
      };

      vi.mocked(checkConflicts).mockResolvedValue(mockReport);
      vi.mocked(getMergeOrderForOpenPRs).mockResolvedValue({ order: [1], cycles: [], reasoning: [] });
      vi.mocked(queries.getAllPhaseAssignments).mockResolvedValue([]);
      vi.mocked(queries.getAllDevelopers).mockResolvedValue([]);
      vi.mocked(escalateConflicts).mockResolvedValue(true);

      await handlePullRequestOpened({
        action: "opened",
        number: 42,
        pull_request: { head: { ref: "gsd/phase-1-foundation" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      expect(escalateConflicts).toHaveBeenCalledWith(mockReport, [], []);
    });

    it("does not fail webhook response when escalation fails", async () => {
      const { checkConflicts } = await import("../../../packages/orchestrator/src/coordination/conflict-detector.js");
      const { escalateConflicts } = await import("../../../packages/orchestrator/src/coordination/escalation.js");
      const queries = await import("../../../packages/orchestrator/src/dolt/queries.js");
      const { getMergeOrderForOpenPRs } = await import("../../../packages/orchestrator/src/coordination/merge-engine.js");

      vi.mocked(checkConflicts).mockResolvedValue({
        conflicts: [
          { filePath: "src/auth.ts", phases: [{ phaseId: 1, source: "declared" }, { phaseId: 3, source: "actual" }] },
        ],
        lockWarnings: [],
        declaredOnlyFiles: new Map(),
        actualOnlyFiles: new Map(),
        timestamp: Date.now(),
      });

      vi.mocked(getMergeOrderForOpenPRs).mockResolvedValue({ order: [1], cycles: [], reasoning: [] });
      vi.mocked(queries.getAllPhaseAssignments).mockResolvedValue([]);
      vi.mocked(queries.getAllDevelopers).mockResolvedValue([]);
      vi.mocked(escalateConflicts).mockRejectedValue(new Error("Webhook timeout"));

      // Should NOT throw
      const result = await handlePullRequestOpened({
        action: "opened",
        number: 42,
        pull_request: { head: { ref: "gsd/phase-1-foundation" } },
        repository: { owner: { login: "org" }, name: "repo" },
      });

      // Should still return a success message (conflict report posted)
      expect(result).toContain("PR #42");
    });
  });
});
