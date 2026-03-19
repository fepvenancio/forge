import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getDeveloperCosts: vi.fn(),
  getPhaseCosts: vi.fn(),
  getTeamCostSummary: vi.fn(),
  getPhaseTotalCost: vi.fn(),
  getCostsByPR: vi.fn(),
  recordDeveloperCost: vi.fn(),
}));

describe("cost command", () => {
  it.todo("registers cost command on a program");
  it.todo("--team flag shows team-wide cost summary");
  it.todo("--dev flag shows costs for a specific developer");
  it.todo("--pr flag shows costs correlated with PR numbers");
  it.todo("shows budget alert when phase cost exceeds FORGE_PHASE_BUDGET_USD");
  it.todo("cost record subcommand records a new cost entry");
  it.todo("legacy cycle-id argument falls back to cycle cost display");
});
