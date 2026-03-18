/**
 * Integration test — requires Dolt running on localhost:3306.
 * Run: npx vitest run test/integration/
 */
import { describe, it, expect, afterAll } from "vitest";
import * as queries from "../../packages/orchestrator/src/dolt/queries.js";
import { closePool } from "../../packages/orchestrator/src/dolt/client.js";

afterAll(async () => {
  await closePool();
});

describe("Dolt CRUD (live database)", () => {
  let taskId: string;
  let cycleId: string;

  it("creates a task", async () => {
    const task = await queries.createTask({
      prp_ref: "test/fixtures/nextjs-simple/PRPs/add-user-endpoint.md",
      title: "Integration test task",
      description: "Testing Dolt CRUD",
      layer: "backend",
    });
    expect(task).toBeTruthy();
    expect(task.id).toBeTruthy();
    expect(task.status).toBe("pending");
    expect(task.title).toBe("Integration test task");
    taskId = task.id;
  });

  it("fetches the task", async () => {
    const task = await queries.getTask(taskId);
    expect(task).toBeTruthy();
    expect(task!.title).toBe("Integration test task");
    expect(task!.layer).toBe("backend");
  });

  it("updates task status", async () => {
    await queries.updateTaskStatus(taskId, "in_progress");
    const task = await queries.getTask(taskId);
    expect(task!.status).toBe("in_progress");
  });

  it("queries tasks by status", async () => {
    const tasks = await queries.getTasksByStatus("in_progress");
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks.some((t) => t.id === taskId)).toBe(true);
  });

  it("creates a cycle", async () => {
    const cycle = await queries.createCycle({
      project_id: "test-project",
      planner_model: "claude-opus-4-6",
    });
    expect(cycle).toBeTruthy();
    expect(cycle.status).toBe("running");
    cycleId = cycle.id;
  });

  it("updates cycle", async () => {
    await queries.updateCycle(cycleId, {
      status: "completed",
      finished_at: Date.now(),
      judge_outcome: "done",
    });
    const cycle = await queries.getCycle(cycleId);
    expect(cycle!.status).toBe("completed");
    expect(cycle!.judge_outcome).toBe("done");
  });

  it("creates a stage run", async () => {
    const run = await queries.createStageRun({
      task_id: taskId,
      cycle_id: cycleId,
      stage: "planner",
      model: "claude-opus-4-6",
    });
    expect(run.id).toBeTruthy();
    expect(run.stage).toBe("planner");

    await queries.completeStageRun(run.id, "pass");
    const runs = await queries.getStageRunsForTask(taskId);
    expect(runs.length).toBe(1);
    expect(runs[0].outcome).toBe("pass");
  });

  it("creates touch map entries", async () => {
    await queries.createTouchMapsFromPlan(taskId, {
      reads: ["src/index.ts", "src/config.ts"],
      writes: ["src/api/users.ts"],
    });
    const touchMap = await queries.getTouchMap(taskId);
    expect(touchMap.length).toBe(3);
    expect(touchMap.filter((t) => t.access === "read").length).toBe(2);
    expect(touchMap.filter((t) => t.access === "write").length).toBe(1);
  });

  it("detects touch map conflicts", async () => {
    const conflicts = await queries.checkTouchMapConflicts([
      { taskId: "a", writes: ["src/shared.ts"] },
      { taskId: "b", writes: ["src/shared.ts"] },
    ]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].file).toBe("src/shared.ts");
  });

  it("logs work", async () => {
    await queries.logWork({
      task_id: taskId,
      action: "file_read",
      file_path: "src/index.ts",
      detail: "Reading entry point",
    });
    const logs = await queries.getWorkLog(taskId);
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("file_read");
  });

  it("records cycle cost", async () => {
    await queries.recordCycleCost({
      cycle_id: cycleId,
      stage: "planner",
      model: "claude-opus-4-6",
      input_tokens: 50000,
      output_tokens: 2000,
      cost_usd: 0.9,
    });
    const costs = await queries.getCycleCosts(cycleId);
    expect(costs.length).toBe(1);
    expect(Number(costs[0].cost_usd)).toBeCloseTo(0.9);
  });

  it("creates flow registry entry and marks stale", async () => {
    const uniquePath = `.flows/test-flow-${Date.now()}.md`;
    const flow = await queries.createFlowRegistryEntry({
      flow_path: uniquePath,
      title: "Test Flow",
      criticality: "high",
    });
    expect(flow.stale).toBe(false);

    await queries.markFlowStale(flow.id);
    const staleFlows = await queries.getStaleFlows();
    expect(staleFlows.length).toBeGreaterThanOrEqual(1);
    expect(staleFlows.some((f) => f.id === flow.id)).toBe(true);
  });

  it("creates artifact", async () => {
    const artifact = await queries.createArtifact({
      schema_type: "plan",
      file_path: "/tmp/test-plan.json",
    });
    expect(artifact.id).toBeTruthy();
    expect(artifact.valid).toBe(true);

    const fetched = await queries.getArtifact(artifact.id);
    expect(fetched).toBeTruthy();
    expect(fetched!.schema_type).toBe("plan");
  });
});
