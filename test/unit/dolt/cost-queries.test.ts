import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock("../../../packages/orchestrator/src/dolt/client.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  execute: (...args: any[]) => mockExecute(...args),
  transaction: vi.fn(),
}));

import {
  recordDeveloperCost,
  getDeveloperCosts,
  getPhaseCosts,
  getTeamCostSummary,
  getPhaseTotalCost,
  getCostsByPR,
} from "../../../packages/orchestrator/src/dolt/queries.js";

describe("developer cost queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recordDeveloperCost inserts row and returns DeveloperCost", async () => {
    mockExecute.mockResolvedValue({ insertId: 42 });

    const result = await recordDeveloperCost({
      developer_id: "alice",
      phase_id: 1,
      model: "claude-opus",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.05,
    });

    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO developer_costs");
    expect(params).toContain("alice");
    expect(params).toContain(1);
    expect(params).toContain("claude-opus");
    expect(params).toContain(1000);
    expect(params).toContain(500);
    expect(params).toContain(0.05);
    expect(result).toMatchObject({
      id: 42,
      developer_id: "alice",
      phase_id: 1,
      model: "claude-opus",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.05,
    });
    expect(result.recorded_at).toBeTypeOf("number");
  });

  it("getDeveloperCosts returns costs for a specific developer", async () => {
    const mockRows = [
      { id: 1, developer_id: "alice", phase_id: 1, model: "opus", input_tokens: 100, output_tokens: 50, cost_usd: 0.01, recorded_at: 1000 },
    ];
    mockQuery.mockResolvedValue(mockRows);

    const result = await getDeveloperCosts("alice");

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("developer_id = ?");
    expect(sql).toContain("ORDER BY recorded_at DESC");
    expect(params).toEqual(["alice"]);
    expect(result).toEqual(mockRows);
  });

  it("getPhaseCosts returns costs for a specific phase", async () => {
    const mockRows = [
      { id: 1, developer_id: "bob", phase_id: 2, model: "sonnet", input_tokens: 200, output_tokens: 100, cost_usd: 0.02, recorded_at: 2000 },
    ];
    mockQuery.mockResolvedValue(mockRows);

    const result = await getPhaseCosts(2);

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("phase_id = ?");
    expect(sql).toContain("ORDER BY recorded_at DESC");
    expect(params).toEqual([2]);
    expect(result).toEqual(mockRows);
  });

  it("getTeamCostSummary returns grouped cost data", async () => {
    const mockRows = [
      { developer_id: "alice", phase_id: 1, total_cost: 1.5, total_input: 10000, total_output: 5000, record_count: 3 },
      { developer_id: "bob", phase_id: 2, total_cost: 2.0, total_input: 20000, total_output: 10000, record_count: 5 },
    ];
    mockQuery.mockResolvedValue(mockRows);

    const result = await getTeamCostSummary();

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("GROUP BY developer_id, phase_id");
    expect(sql).toContain("SUM(cost_usd)");
    expect(sql).toContain("SUM(input_tokens)");
    expect(sql).toContain("SUM(output_tokens)");
    expect(sql).toContain("COUNT(*)");
    expect(result).toEqual(mockRows);
  });

  it("getPhaseTotalCost returns sum of costs for a phase", async () => {
    mockQuery.mockResolvedValue([{ total: 3.75 }]);

    const result = await getPhaseTotalCost(1);

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("COALESCE(SUM(cost_usd), 0)");
    expect(sql).toContain("phase_id = ?");
    expect(params).toEqual([1]);
    expect(result).toBe(3.75);
  });

  it("getPhaseTotalCost returns 0 when no records exist", async () => {
    mockQuery.mockResolvedValue([{ total: 0 }]);

    const result = await getPhaseTotalCost(99);

    expect(result).toBe(0);
  });

  it("getCostsByPR returns costs joined with PR numbers from phase_assignments", async () => {
    const mockRows = [
      { developer_id: "alice", phase_id: 1, model: "opus", cost_usd: 0.5, input_tokens: 5000, output_tokens: 2500, pr_number: 42 },
      { developer_id: "bob", phase_id: 2, model: "sonnet", cost_usd: 0.3, input_tokens: 3000, output_tokens: 1500, pr_number: 43 },
    ];
    mockQuery.mockResolvedValue(mockRows);

    const result = await getCostsByPR();

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("JOIN phase_assignments");
    expect(sql).toContain("pr_number IS NOT NULL");
    expect(sql).toContain("ORDER BY");
    expect(result).toEqual(mockRows);
  });
});
