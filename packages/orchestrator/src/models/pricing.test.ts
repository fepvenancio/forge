import { describe, it, expect } from "vitest";
import { calculateCost, formatCostReport } from "./pricing.js";

describe("calculateCost", () => {
  it("calculates Claude Opus cost correctly", () => {
    // 1M input + 1M output = $15 + $75 = $90
    const cost = calculateCost("claude-opus-4-6", 1_000_000, 1_000_000);
    expect(cost).toBe(90);
  });

  it("calculates Gemini Flash cost correctly", () => {
    // 1M input + 1M output = $0.075 + $0.30 = $0.375
    const cost = calculateCost("gemini-3-flash-preview", 1_000_000, 1_000_000);
    expect(cost).toBe(0.375);
  });

  it("returns 0 for unknown model", () => {
    const cost = calculateCost("unknown-model", 1000, 1000);
    expect(cost).toBe(0);
  });

  it("handles zero tokens", () => {
    const cost = calculateCost("claude-opus-4-6", 0, 0);
    expect(cost).toBe(0);
  });
});

describe("formatCostReport", () => {
  it("produces valid cost report", () => {
    const report = formatCostReport("cycle-001", [
      {
        stage: "planner",
        model: "claude-opus-4-6",
        input_tokens: 50000,
        output_tokens: 2000,
      },
      {
        stage: "worker",
        model: "gemini-3-flash-preview",
        input_tokens: 100000,
        output_tokens: 5000,
      },
    ]);

    expect(report.cycle_id).toBe("cycle-001");
    expect(report.total_cost_usd).toBeGreaterThan(0);
    expect(report.cap_usd).toBe(50);
    expect(report.breakdown).toHaveLength(2);
    expect(report.breakdown[0].stage).toBe("planner");
    expect(report.exceeds_cap).toBe(false);
  });

  it("flags when cost exceeds cap", () => {
    const report = formatCostReport("cycle-002", [
      {
        stage: "planner",
        model: "claude-opus-4-6",
        input_tokens: 10_000_000,
        output_tokens: 1_000_000,
      },
    ]);
    // 10M input × $15/1M + 1M output × $75/1M = $150 + $75 = $225
    expect(report.exceeds_cap).toBe(true);
    expect(report.total_cost_usd).toBeGreaterThan(50);
  });
});
