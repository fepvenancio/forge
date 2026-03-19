import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getFlowsForFile: vi.fn(),
  markFlowStale: vi.fn(),
}));

import { handlePushEvent, extractChangedFiles } from "../../../packages/webhook/src/server.js";

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
});
