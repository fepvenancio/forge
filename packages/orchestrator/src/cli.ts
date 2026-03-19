#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { buildForgeGraph } from "./graph.js";
import * as queries from "./dolt/queries.js";
import { SCRIPTS_DIR } from "./utils/paths.js";
import { registerCommands } from "./commands/register.js";
import { syncCommands } from "./commands/sync.js";
import { statusCommands } from "./commands/status.js";
import { phaseCommands } from "./commands/phases.js";
import { conflictCommands } from "./commands/conflicts.js";
import { mergeOrderCommands } from "./commands/merge-order.js";
import { costCommands } from "./commands/cost.js";
import { dashboardCommands } from "./commands/dashboard.js";

const PID_DIR = resolve(process.cwd(), ".forge", "pids");

const program = new Command();
program
  .name("forge")
  .description("Forge -- Team Coordination Layer for AI-Assisted Development")
  .version("2.0.0");

// ─── v2 command groups ──────────────────────────────────────────────────────
registerCommands(program);
syncCommands(program);
statusCommands(program);
phaseCommands(program);
conflictCommands(program);
mergeOrderCommands(program);
costCommands(program);
dashboardCommands(program);

// ─── Legacy commands (preserved from v0.1.0) ────────────────────────────────

program
  .command("start")
  .description("Start orchestrator + webhook server")
  .action(async () => {
    mkdirSync(PID_DIR, { recursive: true });

    console.log("Starting Forge...");

    // Start webhook server
    const webhook = spawn("pnpm", ["--filter", "@forge/webhook", "start"], {
      stdio: "inherit",
      detached: true,
    });
    if (webhook.pid) {
      writeFileSync(resolve(PID_DIR, "webhook.pid"), String(webhook.pid));
      webhook.unref();
    }

    console.log("Forge started.");
    console.log("  Webhook server: http://localhost:" + (process.env.FORGE_WEBHOOK_PORT || "3001"));
    console.log("  PID files: " + PID_DIR);
  });

program
  .command("stop")
  .description("Stop all Forge processes")
  .action(async () => {
    if (!existsSync(PID_DIR)) {
      console.log("No Forge processes found.");
      return;
    }

    const pidFiles = ["webhook.pid"];
    for (const file of pidFiles) {
      const pidPath = resolve(PID_DIR, file);
      if (existsSync(pidPath)) {
        const pid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
        try {
          process.kill(pid);
          console.log(`Stopped ${file.replace(".pid", "")} (PID ${pid})`);
        } catch {
          console.log(`Process ${file.replace(".pid", "")} (PID ${pid}) already stopped.`);
        }
        unlinkSync(pidPath);
      }
    }
  });

program
  .command("run")
  .description("Start a new cycle from a PRP file")
  .argument("<prp-path>", "Path to PRP file")
  .action(async (prpPath: string) => {
    const resolvedPath = resolve(process.cwd(), prpPath);
    if (!existsSync(resolvedPath)) {
      console.error(`PRP file not found: ${resolvedPath}`);
      process.exit(1);
    }

    const projectPath = process.cwd();
    const cycleId = uuidv4();
    const plannerModel = "claude-code:opus";

    console.log(`Starting cycle ${cycleId}`);
    console.log(`  PRP: ${resolvedPath}`);
    console.log(`  Engine: Claude Code CLI`);

    // Persist cycle to Dolt
    try {
      const { execute: doltExec } = await import("./dolt/client.js");
      await doltExec(
        `INSERT INTO cycles (id, project_id, status, planner_model, started_at) VALUES (?, ?, 'running', ?, ?)`,
        [cycleId, projectPath, plannerModel, Date.now()],
      );
      console.log(`  Dolt: cycle tracked`);
    } catch (err) {
      console.warn(`  Dolt: could not persist cycle (${err instanceof Error ? err.message : err})`);
    }

    const graph = buildForgeGraph();
    const config = { configurable: { thread_id: cycleId } };

    const result = await graph.invoke(
      {
        cycleId,
        projectPath,
        prpRef: resolvedPath,
        planData: null,
        planArtifactId: null,
        plannerModel,
        plannerRetries: 0,
        maxPlannerRetries: 3,
        planAmbiguousQuestion: null,
        taskIds: [],
        completedTaskIds: [],
        failedTaskIds: [],
        blockedTaskIds: [],
        workerHandoffs: {},
        workerBranches: {},
        workerArtifactIds: {},
        workerPrUrls: {},
        subJudgeReports: {},
        subJudgeEscalations: [],
        dependencyDriftTaskIds: [],
        propertyGateMode: "optional" as const,
        propertyGateResults: {},
        highCourtArtifactId: null,
        highCourtDecision: null,
        mergeOrder: [],
        claudeCodeCosts: [],
        costArtifactId: null,
        totalCostUsd: 0,
        costExceedsCap: false,
        currentStage: "planner",
        humanEscalationReason: null,
        errors: [],
      },
      config,
    );

    // Persist final result to Dolt
    try {
      await queries.updateCycle(cycleId, {
        status: result.highCourtDecision === "merge" ? "completed" : "failed",
        finished_at: Date.now(),
        judge_outcome: result.highCourtDecision === "merge" ? "done" : result.highCourtDecision === "human_required" ? "human_required" : "blocked",
        notes: `${result.completedTaskIds?.length || 0} completed, ${result.failedTaskIds?.length || 0} failed`,
      });
    } catch { /* Dolt write is best-effort */ }

    console.log(`Cycle ${cycleId} completed.`);
    console.log(`  Decision: ${result.highCourtDecision}`);
    console.log(`  Completed: ${result.completedTaskIds?.length || 0} tasks`);
    console.log(`  Failed: ${result.failedTaskIds?.length || 0} tasks`);
    console.log(`  Total cost: $${result.totalCostUsd}`);
  });

program
  .command("kill")
  .description("Terminate a worker")
  .argument("<task-id>", "Task ID to kill")
  .action(async (taskId: string) => {
    console.log(`Killing worker for task ${taskId}...`);
    await queries.updateTaskStatus(taskId, "cancelled");
    console.log(`Task ${taskId} cancelled.`);
  });

program
  .command("resume")
  .description("Resume after human escalation")
  .argument("<cycle-id>", "Cycle ID to resume")
  .action(async (cycleId: string) => {
    console.log(`Resuming cycle ${cycleId}...`);
    const graph = buildForgeGraph();
    const config = { configurable: { thread_id: cycleId } };
    await graph.invoke(null, config);
    console.log(`Cycle ${cycleId} resumed.`);
  });

program
  .command("cancel")
  .description("Cancel a halted cycle")
  .argument("<cycle-id>", "Cycle ID to cancel")
  .action(async (cycleId: string) => {
    await queries.updateCycle(cycleId, {
      status: "failed",
      finished_at: Date.now(),
      notes: "Cancelled by user",
    });
    console.log(`Cycle ${cycleId} cancelled.`);
  });

program
  .command("logs")
  .description("Show work logs for a task")
  .argument("<task-id>", "Task ID")
  .action(async (taskId: string) => {
    const logs = await queries.getWorkLog(taskId);
    if (logs.length === 0) {
      console.log("No logs found for this task.");
      return;
    }
    for (const log of logs) {
      const time = new Date(log.logged_at).toISOString().slice(11, 19);
      console.log(`[${time}] ${log.action}${log.file_path ? " \u2014 " + log.file_path : ""}${log.detail ? "\n         " + log.detail : ""}`);
    }
  });

program
  .command("init")
  .description("Initialize a project with a template")
  .requiredOption("--template <name>", "Template name")
  .argument("[path]", "Target path", ".")
  .action(async (targetPath: string, opts: { template: string }) => {
    const scriptPath = resolve(SCRIPTS_DIR, "init-project.sh");
    execSync(`bash "${scriptPath}" --template "${opts.template}" "${resolve(process.cwd(), targetPath)}"`, {
      stdio: "inherit",
    });
  });

async function main() {
  await program.parseAsync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
