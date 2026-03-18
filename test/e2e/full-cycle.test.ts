import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { validate } from "../../packages/orchestrator/src/gates/validator.js";
import { runPlanGate } from "../../packages/orchestrator/src/gates/plan-gate.js";
import { checkWriteConflicts } from "../../packages/orchestrator/src/worktree/manager.js";
import { formatCostReport } from "../../packages/orchestrator/src/models/pricing.js";
import { selectPlannerModel, countLOC } from "../../packages/orchestrator/src/models/selector.js";
import { loadPrompt } from "../../packages/orchestrator/src/prompts/loader.js";

const FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/nextjs-simple");

describe("Full Cycle E2E", () => {
  it("fixture project has required context files", () => {
    expect(existsSync(resolve(FIXTURE_PATH, "CLAUDE.md"))).toBe(true);
    expect(existsSync(resolve(FIXTURE_PATH, "ARCHITECTURE.md"))).toBe(true);
    expect(existsSync(resolve(FIXTURE_PATH, "SECURITY.md"))).toBe(true);
    expect(existsSync(resolve(FIXTURE_PATH, "QUALITY.md"))).toBe(true);
    expect(existsSync(resolve(FIXTURE_PATH, "flow-registry.json"))).toBe(true);
  });

  it("fixture PRP exists and is readable", () => {
    const prpPath = resolve(FIXTURE_PATH, "PRPs/add-user-endpoint.md");
    expect(existsSync(prpPath)).toBe(true);
    const content = readFileSync(prpPath, "utf8");
    expect(content).toContain("Add User Endpoint");
  });

  it("selects correct planner model for small fixture", () => {
    const model = selectPlannerModel(FIXTURE_PATH);
    // Small fixture should use Claude (below threshold)
    expect(model).toBe("claude-opus-4-6");
  });

  it("counts LOC in fixture", () => {
    const loc = countLOC(FIXTURE_PATH);
    expect(loc).toBeGreaterThan(0);
    expect(loc).toBeLessThan(1000); // Tiny fixture
  });

  it("plan gate passes a valid plan for the fixture", () => {
    const plan = {
      task_id: "t-001",
      cycle_id: "c-001",
      title: "Add user endpoint",
      reasoning: "Need POST /api/users",
      tasks: [
        {
          id: "sub-001",
          title: "Create user route",
          layer: "backend" as const,
          complexity: "standard" as const,
          touch_map: {
            reads: ["app/api/health/route.ts"],
            writes: ["app/api/users/route.ts"],
          },
          acceptance_criteria: ["POST /api/users returns 201"],
          must_not_change: ["app/api/health/route.ts"],
        },
      ],
    };
    const result = runPlanGate(plan, FIXTURE_PATH);
    expect(result.status).toBe("pass");
  });

  it("plan gate catches write conflicts", () => {
    const conflicts = checkWriteConflicts([
      { taskId: "t-001", writes: ["app/api/users/route.ts"] },
      { taskId: "t-002", writes: ["app/api/users/route.ts"] },
    ]);
    expect(conflicts.length).toBe(1);
  });

  it("cost report generates valid schema", () => {
    const report = formatCostReport("c-001", [
      { stage: "planner", model: "claude-opus-4-6", input_tokens: 50000, output_tokens: 2000 },
      { stage: "worker", model: "gemini-3-flash-preview", input_tokens: 100000, output_tokens: 5000 },
    ]);
    const validation = validate("cycle-cost-report", report);
    expect(validation.valid).toBe(true);
  });

  it("all agent prompts load correctly", () => {
    const roles = ["planner", "worker", "sub-judge", "high-court", "librarian", "cost-auditor"] as const;
    for (const role of roles) {
      const prompt = loadPrompt(role);
      expect(prompt.length).toBeGreaterThan(100);
    }
  });
});
