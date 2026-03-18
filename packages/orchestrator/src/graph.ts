import { StateGraph, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORGE_DIR } from "./utils/paths.js";
import { ForgeState, type ForgeStateType } from "./state.js";

// Node implementations — imported from nodes/
import { plannerNode } from "./nodes/planner.js";
import { spawnWorkersNode } from "./nodes/spawn-workers.js";
import { workerNode } from "./nodes/worker.js";
import { subJudgeNode } from "./nodes/sub-judge.js";
import { dependencyCheckNode } from "./nodes/dependency-check.js";
import { propertyGateNode } from "./nodes/property-gate.js";
import { highCourtNode } from "./nodes/high-court.js";
import { prSummaryNode } from "./nodes/pr-summary.js";
import { costAuditorNode } from "./nodes/cost-auditor.js";
import { librarianTriggerNode } from "./nodes/librarian-trigger.js";
import { humanEscalationNode } from "./nodes/human-escalation.js";

// ─── Conditional Routing Functions ──────────────────────────────────────────
// Copied verbatim from docs/phase-5-6-control.md

function routeAfterPlanner(state: ForgeStateType): string {
  if (state.planAmbiguousQuestion !== null) return "human_escalation_node";
  if (state.planArtifactId === null) {
    if (state.plannerRetries < state.maxPlannerRetries) return "planner_node";
    return "human_escalation_node";
  }
  return "spawn_workers_node";
}

function routeAfterSubJudges(state: ForgeStateType): string {
  if (state.dependencyDriftTaskIds.length > 0) {
    return "human_escalation_node";
  }
  const anyFail = state.subJudgeEscalations.length > 0 ||
    Object.values(state.subJudgeReports).some(reportPath => {
      try {
        const report = JSON.parse(readFileSync(reportPath, "utf8"));
        return report.status === "fail";
      } catch {
        return true; // If we can't read the report, treat as failure
      }
    });
  if (anyFail) return "human_escalation_node";
  return "property_gate_node";
}

function routeAfterPropertyGate(state: ForgeStateType): string {
  if (state.propertyGateMode === "disabled") return "high_court_node";
  const anyFail = Object.values(state.propertyGateResults).some(r => r === "fail");
  if (anyFail && state.propertyGateMode === "required") return "human_escalation_node";
  return "high_court_node";
}

function routeAfterHighCourt(state: ForgeStateType): string {
  switch (state.highCourtDecision) {
    case "merge":          return "pr_summary_node";
    case "human_required": return "human_escalation_node";
    case "abort":          return "cost_auditor_node";
    default:               return "human_escalation_node";
  }
}

function routeAfterPrSummary(_state: ForgeStateType): string {
  return "cost_auditor_node";
}

// ─── Graph Assembly ─────────────────────────────────────────────────────────

export function buildForgeGraph(checkpointDbPath?: string) {
  const dbPath = checkpointDbPath || resolve(FORGE_DIR, "checkpoints.db");
  const checkpointer = SqliteSaver.fromConnString(dbPath);

  const graph = new StateGraph(ForgeState)
    .addNode("planner_node", plannerNode)
    .addNode("spawn_workers_node", spawnWorkersNode)
    .addNode("worker_node", workerNode)
    .addNode("sub_judge_node", subJudgeNode)
    .addNode("dependency_check_node", dependencyCheckNode)
    .addNode("property_gate_node", propertyGateNode)
    .addNode("high_court_node", highCourtNode)
    .addNode("pr_summary_node", prSummaryNode)
    .addNode("cost_auditor_node", costAuditorNode)
    .addNode("librarian_trigger_node", librarianTriggerNode)
    .addNode("human_escalation_node", humanEscalationNode)

    .addEdge("__start__", "planner_node")
    .addConditionalEdges("planner_node", routeAfterPlanner)
    .addEdge("spawn_workers_node", "worker_node")
    .addEdge("worker_node", "sub_judge_node")
    .addEdge("sub_judge_node", "dependency_check_node")
    .addConditionalEdges("dependency_check_node", routeAfterSubJudges)
    .addConditionalEdges("property_gate_node", routeAfterPropertyGate)
    .addConditionalEdges("high_court_node", routeAfterHighCourt)
    .addEdge("pr_summary_node", "cost_auditor_node")
    .addEdge("cost_auditor_node", "librarian_trigger_node")
    .addEdge("librarian_trigger_node", END)
    .addEdge("human_escalation_node", END);

  return graph.compile({
    checkpointer,
    interruptBefore: ["human_escalation_node"],
  });
}
