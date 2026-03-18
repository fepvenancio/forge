#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { buildForgeGraph } from "./graph.js";
import * as queries from "./dolt/queries.js";
import { selectPlannerModel } from "./models/selector.js";

const PID_DIR = resolve(process.cwd(), ".forge", "pids");

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "start":
      await cmdStart();
      break;
    case "stop":
      await cmdStop();
      break;
    case "run":
      await cmdRun();
      break;
    case "status":
      await cmdStatus();
      break;
    case "kill":
      await cmdKill();
      break;
    case "resume":
      await cmdResume();
      break;
    case "cancel":
      await cmdCancel();
      break;
    case "cost":
      await cmdCost();
      break;
    case "logs":
      await cmdLogs();
      break;
    case "init":
      await cmdInit();
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

function printUsage() {
  console.log(`
Forge — Autonomous Engineering Factory

Usage:
  forge start                    Start orchestrator + webhook server
  forge stop                     Stop all Forge processes
  forge run <prp-path>           Start a new cycle from a PRP file
  forge status                   Show active cycles
  forge kill <task-id>           Terminate a worker
  forge resume <cycle-id>        Resume after human escalation
  forge cancel <cycle-id>        Cancel a halted cycle
  forge cost <cycle-id>          Show cost report for a cycle
  forge logs <task-id>           Show work logs for a task
  forge init --template <name> <path>  Initialize a project with a template
`);
}

async function cmdStart() {
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
}

async function cmdStop() {
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
}

async function cmdRun() {
  const prpPath = process.argv[3];
  if (!prpPath) {
    console.error("Usage: forge run <prp-path>");
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), prpPath);
  if (!existsSync(resolvedPath)) {
    console.error(`PRP file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const projectPath = process.cwd();
  const cycleId = uuidv4();
  const plannerModel = selectPlannerModel(projectPath);

  console.log(`Starting cycle ${cycleId}`);
  console.log(`  PRP: ${resolvedPath}`);
  console.log(`  Planner model: ${plannerModel}`);

  const graph = buildForgeGraph();
  const config = { configurable: { thread_id: cycleId } };

  const result = await graph.invoke(
    {
      cycleId,
      projectPath,
      prpRef: resolvedPath,
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
      costArtifactId: null,
      totalCostUsd: 0,
      costExceedsCap: false,
      currentStage: "planner",
      humanEscalationReason: null,
      errors: [],
    },
    config,
  );

  console.log(`Cycle ${cycleId} completed.`);
  console.log(`  Decision: ${result.highCourtDecision}`);
  console.log(`  Total cost: $${result.totalCostUsd}`);
}

async function cmdStatus() {
  // Query Dolt for running cycles
  console.log("Checking active cycles...");
  try {
    const { query } = await import("./dolt/client.js");
    const rows = await query("SELECT * FROM cycles WHERE status = 'running' ORDER BY started_at DESC");
    if (rows.length === 0) {
      console.log("No active cycles.");
      return;
    }
    for (const row of rows) {
      console.log(`  Cycle ${row.id} — started ${new Date(row.started_at as number).toISOString()}`);
    }
  } catch (err) {
    console.error("Could not connect to Dolt. Is it running?");
  }
}

async function cmdKill() {
  const taskId = process.argv[3];
  if (!taskId) {
    console.error("Usage: forge kill <task-id>");
    process.exit(1);
  }
  console.log(`Killing worker for task ${taskId}...`);
  await queries.updateTaskStatus(taskId, "cancelled");
  console.log(`Task ${taskId} cancelled.`);
}

async function cmdResume() {
  const cycleId = process.argv[3];
  if (!cycleId) {
    console.error("Usage: forge resume <cycle-id>");
    process.exit(1);
  }
  console.log(`Resuming cycle ${cycleId}...`);
  const graph = buildForgeGraph();
  const config = { configurable: { thread_id: cycleId } };
  await graph.invoke(null, config);
  console.log(`Cycle ${cycleId} resumed.`);
}

async function cmdCancel() {
  const cycleId = process.argv[3];
  if (!cycleId) {
    console.error("Usage: forge cancel <cycle-id>");
    process.exit(1);
  }
  await queries.updateCycle(cycleId, {
    status: "failed",
    finished_at: Date.now(),
    notes: "Cancelled by user",
  });
  console.log(`Cycle ${cycleId} cancelled.`);
}

async function cmdCost() {
  const cycleId = process.argv[3];
  if (!cycleId) {
    console.error("Usage: forge cost <cycle-id>");
    process.exit(1);
  }
  const costs = await queries.getCycleCosts(cycleId);
  if (costs.length === 0) {
    console.log("No cost data found for this cycle.");
    return;
  }
  let total = 0;
  console.log("Stage             Model                          Cost");
  console.log("\u2500".repeat(60));
  for (const c of costs) {
    console.log(`${c.stage.padEnd(18)}${c.model.padEnd(32)}$${c.cost_usd.toFixed(4)}`);
    total += c.cost_usd;
  }
  console.log("\u2500".repeat(60));
  console.log(`Total: $${total.toFixed(4)}`);
}

async function cmdLogs() {
  const taskId = process.argv[3];
  if (!taskId) {
    console.error("Usage: forge logs <task-id>");
    process.exit(1);
  }
  const logs = await queries.getWorkLog(taskId);
  if (logs.length === 0) {
    console.log("No logs found for this task.");
    return;
  }
  for (const log of logs) {
    const time = new Date(log.logged_at).toISOString().slice(11, 19);
    console.log(`[${time}] ${log.action}${log.file_path ? " \u2014 " + log.file_path : ""}${log.detail ? "\n         " + log.detail : ""}`);
  }
}

async function cmdInit() {
  const args = process.argv.slice(3);
  const templateIdx = args.indexOf("--template");
  if (templateIdx === -1 || !args[templateIdx + 1]) {
    console.error("Usage: forge init --template <name> <path>");
    process.exit(1);
  }
  const template = args[templateIdx + 1];
  const targetPath = args.find((a, i) => i !== templateIdx && i !== templateIdx + 1) || ".";

  const scriptPath = resolve(import.meta.dirname, "../../../scripts/init-project.sh");
  execSync(`bash "${scriptPath}" --template "${template}" "${resolve(process.cwd(), targetPath)}"`, {
    stdio: "inherit",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
