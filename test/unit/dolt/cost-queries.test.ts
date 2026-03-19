import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/client.js", () => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));

describe("developer cost queries", () => {
  it.todo("recordDeveloperCost inserts row and returns DeveloperCost");
  it.todo("getDeveloperCosts returns costs for a specific developer");
  it.todo("getPhaseCosts returns costs for a specific phase");
  it.todo("getTeamCostSummary returns grouped cost data");
  it.todo("getPhaseTotalCost returns sum of costs for a phase");
  it.todo("getCostsByPR returns costs joined with PR numbers from phase_assignments");
});
