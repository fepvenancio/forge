import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlanGate } from "./plan-gate.js";

describe("Plan Gate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-plan-gate-"));
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "index.ts"), "export {}");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("passes valid plan with existing files", () => {
    const plan = {
      task_id: "t-001",
      cycle_id: "c-001",
      title: "Test",
      reasoning: "Test plan",
      tasks: [
        {
          id: "sub-001",
          title: "Task 1",
          layer: "backend",
          complexity: "standard",
          touch_map: { reads: ["src/index.ts"], writes: ["src/new.ts"] },
          acceptance_criteria: ["Test"],
          must_not_change: [],
        },
      ],
    };
    const result = runPlanGate(plan, tempDir);
    expect(result.status).toBe("pass");
  });

  it("fails when read file does not exist", () => {
    const plan = {
      task_id: "t-001",
      cycle_id: "c-001",
      title: "Test",
      reasoning: "Test plan",
      tasks: [
        {
          id: "sub-001",
          title: "Task 1",
          layer: "backend",
          complexity: "standard",
          touch_map: { reads: ["src/nonexistent.ts"], writes: [] },
          acceptance_criteria: ["Test"],
          must_not_change: [],
        },
      ],
    };
    const result = runPlanGate(plan, tempDir);
    expect(result.status).toBe("fail");
    expect(result.errors[0]).toContain("does not exist");
  });

  it("fails on write conflicts", () => {
    const plan = {
      task_id: "t-001",
      cycle_id: "c-001",
      title: "Test",
      reasoning: "Test plan",
      tasks: [
        {
          id: "sub-001",
          title: "Task 1",
          layer: "backend",
          complexity: "standard",
          touch_map: { reads: [], writes: ["src/shared.ts"] },
          acceptance_criteria: ["Test"],
          must_not_change: [],
        },
        {
          id: "sub-002",
          title: "Task 2",
          layer: "backend",
          complexity: "standard",
          touch_map: { reads: [], writes: ["src/shared.ts"] },
          acceptance_criteria: ["Test"],
          must_not_change: [],
        },
      ],
    };
    const result = runPlanGate(plan, tempDir);
    expect(result.status).toBe("fail");
    expect(result.errors[0]).toContain("Write conflict");
  });

  it("handles PLAN_AMBIGUOUS", () => {
    const result = runPlanGate(
      { status: "PLAN_AMBIGUOUS", question: "What database?" },
      tempDir,
    );
    expect(result.status).toBe("ambiguous");
    expect(result.errors[0]).toBe("What database?");
  });

  it("fails on invalid schema", () => {
    const result = runPlanGate({ invalid: true }, tempDir);
    expect(result.status).toBe("fail");
  });
});
