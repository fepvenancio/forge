import { describe, it, expect } from "vitest";
import { runPlanGate } from "../../packages/orchestrator/src/gates/plan-gate.js";
import { resolve } from "node:path";

const FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/nextjs-simple");

describe("PLAN_AMBIGUOUS", () => {
  it("plan gate recognizes PLAN_AMBIGUOUS as ambiguous, not failure", () => {
    const ambiguousPlan = {
      status: "PLAN_AMBIGUOUS",
      question: "Should the user endpoint use JWT or session-based auth?",
    };
    const result = runPlanGate(ambiguousPlan, FIXTURE_PATH);
    expect(result.status).toBe("ambiguous");
    expect(result.errors[0]).toContain("JWT or session-based auth");
  });

  it("plan gate returns fail for invalid schema, not ambiguous", () => {
    const invalidPlan = { task_id: "t-001" }; // Missing required fields
    const result = runPlanGate(invalidPlan, FIXTURE_PATH);
    expect(result.status).toBe("fail");
    expect(result.status).not.toBe("ambiguous");
  });

  it("PLAN_AMBIGUOUS without question still returns ambiguous", () => {
    const ambiguousPlan = { status: "PLAN_AMBIGUOUS" };
    const result = runPlanGate(ambiguousPlan, FIXTURE_PATH);
    expect(result.status).toBe("ambiguous");
  });
});
