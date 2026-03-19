import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTeamCostSummary = vi.fn();
const mockGetDeveloperCosts = vi.fn();
const mockGetCostsByPR = vi.fn();
const mockGetPhaseTotalCost = vi.fn();
const mockRecordDeveloperCost = vi.fn();
const mockGetCycleCosts = vi.fn();

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getTeamCostSummary: (...args: any[]) => mockGetTeamCostSummary(...args),
  getDeveloperCosts: (...args: any[]) => mockGetDeveloperCosts(...args),
  getCostsByPR: (...args: any[]) => mockGetCostsByPR(...args),
  getPhaseTotalCost: (...args: any[]) => mockGetPhaseTotalCost(...args),
  recordDeveloperCost: (...args: any[]) => mockRecordDeveloperCost(...args),
  getCycleCosts: (...args: any[]) => mockGetCycleCosts(...args),
}));

vi.mock("cli-table3", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      push: vi.fn(),
      toString: vi.fn().mockReturnValue("mock-table"),
    })),
  };
});

import { costCommands } from "../../../packages/orchestrator/src/commands/cost.js";

describe("cost command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPhaseTotalCost.mockResolvedValue(0);
  });

  function extractAction(commandName: string): { actionFn: Function; optionValues: Record<string, any> } {
    let actionFn: Function = () => {};
    const optionValues: Record<string, any> = {};
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const commands: string[] = [];
    const program: any = {
      command: (name: string) => {
        commands.push(name);
        return mockCmd;
      },
    };

    costCommands(program);
    return { actionFn, optionValues };
  }

  it("registers cost command on a program", () => {
    const commands: string[] = [];
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: () => mockCmd,
    };
    const program: any = {
      command: (name: string) => {
        commands.push(name);
        return mockCmd;
      },
    };

    costCommands(program);
    expect(commands).toContain("cost");
  });

  it("--team flag shows team-wide cost summary", async () => {
    const summaryData = [
      { developer_id: "alice", phase_id: 1, total_cost: 1.5, total_input: 10000, total_output: 5000, record_count: 3 },
    ];
    mockGetTeamCostSummary.mockResolvedValue(summaryData);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    // Extract action from the "cost" command
    let costAction: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: (fn: Function) => { costAction = fn; return mockCmd; },
    };
    const program: any = {
      command: (name: string) => {
        if (name === "cost") return mockCmd;
        // cost:record also registers
        return { description: () => ({ requiredOption: function r() { return { requiredOption: r, action: () => ({ requiredOption: r }) }; } }) };
      },
    };
    costCommands(program);
    await costAction(undefined, { team: true });

    console.log = origLog;
    expect(mockGetTeamCostSummary).toHaveBeenCalledOnce();
  });

  it("--dev flag shows costs for a specific developer", async () => {
    const devCosts = [
      { id: 1, developer_id: "alice", phase_id: 1, model: "opus", input_tokens: 1000, output_tokens: 500, cost_usd: 0.05, recorded_at: Date.now() },
    ];
    mockGetDeveloperCosts.mockResolvedValue(devCosts);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let costAction: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: (fn: Function) => { costAction = fn; return mockCmd; },
    };
    const program: any = {
      command: (name: string) => {
        if (name === "cost") return mockCmd;
        return { description: () => ({ requiredOption: function r() { return { requiredOption: r, action: () => ({ requiredOption: r }) }; } }) };
      },
    };
    costCommands(program);
    await costAction(undefined, { dev: "alice" });

    console.log = origLog;
    expect(mockGetDeveloperCosts).toHaveBeenCalledWith("alice");
  });

  it("--pr flag shows costs correlated with PR numbers", async () => {
    const prCosts = [
      { developer_id: "alice", phase_id: 1, model: "opus", cost_usd: 0.5, input_tokens: 5000, output_tokens: 2500, pr_number: 42 },
    ];
    mockGetCostsByPR.mockResolvedValue(prCosts);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let costAction: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: (fn: Function) => { costAction = fn; return mockCmd; },
    };
    const program: any = {
      command: (name: string) => {
        if (name === "cost") return mockCmd;
        return { description: () => ({ requiredOption: function r() { return { requiredOption: r, action: () => ({ requiredOption: r }) }; } }) };
      },
    };
    costCommands(program);
    await costAction(undefined, { pr: true });

    console.log = origLog;
    expect(mockGetCostsByPR).toHaveBeenCalledOnce();
  });

  it("shows budget alert when phase cost exceeds FORGE_PHASE_BUDGET_USD", async () => {
    const summaryData = [
      { developer_id: "alice", phase_id: 1, total_cost: 15.0, total_input: 10000, total_output: 5000, record_count: 3 },
    ];
    mockGetTeamCostSummary.mockResolvedValue(summaryData);
    mockGetPhaseTotalCost.mockResolvedValue(15.0);

    const origEnv = process.env.FORGE_PHASE_BUDGET_USD;
    process.env.FORGE_PHASE_BUDGET_USD = "10";

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let costAction: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: (fn: Function) => { costAction = fn; return mockCmd; },
    };
    const program: any = {
      command: (name: string) => {
        if (name === "cost") return mockCmd;
        return { description: () => ({ requiredOption: function r() { return { requiredOption: r, action: () => ({ requiredOption: r }) }; } }) };
      },
    };
    costCommands(program);
    await costAction(undefined, { team: true });

    console.log = origLog;
    process.env.FORGE_PHASE_BUDGET_USD = origEnv;

    const output = logs.join("\n");
    expect(output).toContain("WARNING");
    expect(output).toContain("exceeds budget");
  });

  it("cost record subcommand records a new cost entry", () => {
    const commands: string[] = [];
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: () => mockCmd,
    };
    const program: any = {
      command: (name: string) => {
        commands.push(name);
        return mockCmd;
      },
    };

    costCommands(program);
    expect(commands).toContain("cost:record");
  });

  it("legacy cycle-id argument falls back to cycle cost display", async () => {
    const cycleCosts = [
      { id: "c1", cycle_id: "cycle-1", stage: "planner", model: "opus", input_tokens: 1000, output_tokens: 500, cost_usd: 0.05, recorded_at: Date.now() },
    ];
    mockGetCycleCosts.mockResolvedValue(cycleCosts);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    let costAction: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      argument: () => mockCmd,
      option: () => mockCmd,
      requiredOption: () => mockCmd,
      action: (fn: Function) => { costAction = fn; return mockCmd; },
    };
    const program: any = {
      command: (name: string) => {
        if (name === "cost") return mockCmd;
        return { description: () => ({ requiredOption: function r() { return { requiredOption: r, action: () => ({ requiredOption: r }) }; } }) };
      },
    };
    costCommands(program);
    await costAction("cycle-123", {});

    console.log = origLog;
    expect(mockGetCycleCosts).toHaveBeenCalledWith("cycle-123");
  });
});
