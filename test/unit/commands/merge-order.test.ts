import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/coordination/merge-engine.js", () => ({
  getMergeOrderForOpenPRs: vi.fn(),
  computeMergeOrder: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getAllPhaseAssignments: vi.fn(),
}));

vi.mock("cli-table3", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      push: vi.fn(),
      toString: vi.fn().mockReturnValue("mock-table"),
    })),
  };
});

import { mergeOrderCommands } from "../../../packages/orchestrator/src/commands/merge-order.js";
import { getMergeOrderForOpenPRs } from "../../../packages/orchestrator/src/coordination/merge-engine.js";
import * as queries from "../../../packages/orchestrator/src/dolt/queries.js";

const mockedGetMergeOrder = vi.mocked(getMergeOrderForOpenPRs);
const mockedQueries = vi.mocked(queries);

describe("merge-order command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers merge-order command on a program", () => {
    const commands: string[] = [];
    const mockCmd = {
      description: () => mockCmd,
      action: () => mockCmd,
    };
    const program = {
      command: (name: string) => {
        commands.push(name);
        return mockCmd;
      },
    };

    mergeOrderCommands(program as any);
    expect(commands).toContain("merge-order");
  });

  it("displays merge order table when phases have open PRs", async () => {
    mockedGetMergeOrder.mockResolvedValue({
      order: [1, 2],
      cycles: [],
      reasoning: ["Phase 1 before Phase 2 (shared files: src/a.ts)"],
    });

    mockedQueries.getAllPhaseAssignments.mockResolvedValue([
      { phase_id: 1, assignee: "alice", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-1", pr_number: 10 },
      { phase_id: 2, assignee: "bob", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-2", pr_number: 11 },
    ]);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    // Extract and call the action handler directly
    let actionFn: Function = () => {};
    const mockCmd = {
      description: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program = {
      command: () => mockCmd,
    };

    mergeOrderCommands(program as any);
    await actionFn();

    console.log = origLog;

    const output = logs.join("\n");
    expect(output).toContain("merge order");
    expect(output).toContain("Reasoning");
  });

  it("shows 'no open PRs' message when no phases have pr_open status", async () => {
    mockedGetMergeOrder.mockResolvedValue({
      order: [],
      cycles: [],
      reasoning: [],
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let actionFn: Function = () => {};
    const mockCmd = {
      description: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program = {
      command: () => mockCmd,
    };

    mergeOrderCommands(program as any);
    await actionFn();

    console.log = origLog;

    const output = logs.join("\n");
    expect(output).toContain("No phases with open PRs");
  });

  it("displays cycle warnings when circular dependencies detected", async () => {
    mockedGetMergeOrder.mockResolvedValue({
      order: [],
      cycles: [[3, 4]],
      reasoning: [],
    });

    mockedQueries.getAllPhaseAssignments.mockResolvedValue([]);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let actionFn: Function = () => {};
    const mockCmd = {
      description: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program = {
      command: () => mockCmd,
    };

    mergeOrderCommands(program as any);
    await actionFn();

    console.log = origLog;

    const output = logs.join("\n");
    expect(output).toContain("Circular dependencies");
    expect(output).toContain("3");
    expect(output).toContain("4");
  });

  it("shows reasoning for merge order decisions", async () => {
    mockedGetMergeOrder.mockResolvedValue({
      order: [1, 2],
      cycles: [],
      reasoning: ["Phase 1 before Phase 2 (shared files: src/shared.ts)"],
    });

    mockedQueries.getAllPhaseAssignments.mockResolvedValue([
      { phase_id: 1, assignee: "alice", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-1", pr_number: 10 },
      { phase_id: 2, assignee: "bob", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-2", pr_number: 11 },
    ]);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let actionFn: Function = () => {};
    const mockCmd = {
      description: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program = {
      command: () => mockCmd,
    };

    mergeOrderCommands(program as any);
    await actionFn();

    console.log = origLog;

    const output = logs.join("\n");
    expect(output).toContain("Reasoning");
    expect(output).toContain("shared files");
  });
});
