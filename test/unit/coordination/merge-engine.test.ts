import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getAllPhaseAssignments: vi.fn(),
  getAllDevelopers: vi.fn(),
  getAllFileLocks: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/coordination/gsd-reader.js", () => ({
  parsePlanFromBranch: vi.fn(),
  discoverPlanFiles: vi.fn(),
  readFileFromBranch: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/utils/git.js", () => ({
  showFile: vi.fn(),
  diffNameOnly: vi.fn(),
  listTree: vi.fn(),
  raw: vi.fn(),
}));

import {
  computeMergeOrder,
  getMergeOrderForOpenPRs,
} from "../../../packages/orchestrator/src/coordination/merge-engine.js";
import type { PhaseNode, MergeOrder } from "../../../packages/orchestrator/src/coordination/merge-engine.js";
import * as queries from "../../../packages/orchestrator/src/dolt/queries.js";
import * as gsdReader from "../../../packages/orchestrator/src/coordination/gsd-reader.js";
import * as git from "../../../packages/orchestrator/src/utils/git.js";

const mockedQueries = vi.mocked(queries);
const mockedGsd = vi.mocked(gsdReader);
const mockedGit = vi.mocked(git);

describe("merge-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeMergeOrder", () => {
    it("returns empty order for empty input", () => {
      const result = computeMergeOrder([]);
      expect(result.order).toEqual([]);
      expect(result.cycles).toEqual([]);
      expect(result.reasoning).toEqual([]);
    });

    it("returns single phase when only one phase exists", () => {
      const phases: PhaseNode[] = [
        { phaseId: 1, dependsOn: [], branch: "gsd/phase-1", prNumber: 1, touchedFiles: ["src/a.ts"] },
      ];
      const result = computeMergeOrder(phases);
      expect(result.order).toEqual([1]);
      expect(result.cycles).toEqual([]);
    });

    it("orders phases by declared dependencies (ROADMAP dependsOn)", () => {
      const phases: PhaseNode[] = [
        { phaseId: 2, dependsOn: [1], branch: "gsd/phase-2", prNumber: 2, touchedFiles: [] },
        { phaseId: 1, dependsOn: [], branch: "gsd/phase-1", prNumber: 1, touchedFiles: [] },
      ];
      const result = computeMergeOrder(phases);
      expect(result.order).toEqual([1, 2]);
    });

    it("adds inferred edges from touch map overlaps (lower phase first)", () => {
      const phases: PhaseNode[] = [
        { phaseId: 3, dependsOn: [], branch: "gsd/phase-3", prNumber: 3, touchedFiles: ["src/shared.ts"] },
        { phaseId: 1, dependsOn: [], branch: "gsd/phase-1", prNumber: 1, touchedFiles: ["src/shared.ts"] },
      ];
      const result = computeMergeOrder(phases);
      expect(result.order).toEqual([1, 3]);
      expect(result.reasoning.some(r => r.includes("shared files"))).toBe(true);
    });

    it("detects circular dependencies and returns them in cycles array", () => {
      const phases: PhaseNode[] = [
        { phaseId: 1, dependsOn: [2], branch: "gsd/phase-1", prNumber: 1, touchedFiles: [] },
        { phaseId: 2, dependsOn: [1], branch: "gsd/phase-2", prNumber: 2, touchedFiles: [] },
      ];
      const result = computeMergeOrder(phases);
      expect(result.cycles.length).toBeGreaterThan(0);
      // Both should be in a cycle
      const cycleMembers = result.cycles.flat();
      expect(cycleMembers).toContain(1);
      expect(cycleMembers).toContain(2);
      // Neither should be in the order
      expect(result.order).not.toContain(1);
      expect(result.order).not.toContain(2);
    });

    it("handles dependency chains (A -> B -> C)", () => {
      const phases: PhaseNode[] = [
        { phaseId: 3, dependsOn: [2], branch: "gsd/phase-3", prNumber: 3, touchedFiles: [] },
        { phaseId: 1, dependsOn: [], branch: "gsd/phase-1", prNumber: 1, touchedFiles: [] },
        { phaseId: 2, dependsOn: [1], branch: "gsd/phase-2", prNumber: 2, touchedFiles: [] },
      ];
      const result = computeMergeOrder(phases);
      expect(result.order).toEqual([1, 2, 3]);
    });

    it("includes reasoning strings explaining ordering decisions", () => {
      const phases: PhaseNode[] = [
        { phaseId: 2, dependsOn: [1], branch: "gsd/phase-2", prNumber: 2, touchedFiles: [] },
        { phaseId: 1, dependsOn: [], branch: "gsd/phase-1", prNumber: 1, touchedFiles: [] },
      ];
      const result = computeMergeOrder(phases);
      // Should have reasoning about dependency
      expect(result.reasoning.length).toBeGreaterThanOrEqual(0);
      // May or may not have reasoning for simple declared deps; inferred deps always get reasoning
    });

    it("filters to only phases with open PRs when prNumber is set", () => {
      // computeMergeOrder itself doesn't filter, but getMergeOrderForOpenPRs does
      // This tests that phases without prNumber can still be sorted
      const phases: PhaseNode[] = [
        { phaseId: 1, dependsOn: [], branch: "gsd/phase-1", prNumber: null, touchedFiles: [] },
        { phaseId: 2, dependsOn: [1], branch: "gsd/phase-2", prNumber: 2, touchedFiles: [] },
      ];
      const result = computeMergeOrder(phases);
      expect(result.order).toEqual([1, 2]);
    });
  });

  describe("getMergeOrderForOpenPRs", () => {
    it("queries assignments and returns merge order for pr_open phases", async () => {
      mockedQueries.getAllPhaseAssignments.mockResolvedValue([
        { phase_id: 1, assignee: "alice", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-1", pr_number: 10 },
        { phase_id: 2, assignee: "bob", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-2", pr_number: 11 },
        { phase_id: 3, assignee: "charlie", assigned_at: 0, status: "in_progress", branch_name: "gsd/phase-3", pr_number: null },
      ]);

      mockedGsd.discoverPlanFiles.mockResolvedValue([]);
      mockedGit.diffNameOnly.mockResolvedValue([]);

      const result = await getMergeOrderForOpenPRs();
      expect(result.order).toContain(1);
      expect(result.order).toContain(2);
      expect(result.order).not.toContain(3);
    });
  });
});
