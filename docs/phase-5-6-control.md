# Forge — Phase 5 & 6 Control Specification

> This document is the authoritative wiring spec for the LangGraph graph and prompt stability system.
> Claude Code must implement exactly this. Any deviation requires a human flag before proceeding.
> Referenced from PLAN.md Phase 5 and Phase 6.

---

## LangGraph Graph — Complete Wiring Specification

The graph must be implemented exactly as specified. No additional nodes, no shortcuts, no "simplified" versions of conditionals.

---

### State definition (`packages/orchestrator/src/state.ts`)

```typescript
import { Annotation } from "@langchain/langgraph";

export const ForgeState = Annotation.Root({
  // Cycle identity
  cycleId: Annotation<string>,
  projectPath: Annotation<string>,
  prpRef: Annotation<string>,

  // Planner outputs
  planArtifactId: Annotation<string | null>,
  plannerModel: Annotation<string>,
  plannerRetries: Annotation<number>,
  maxPlannerRetries: Annotation<number>,           // from forge.config.json, default 3
  planAmbiguousQuestion: Annotation<string | null>,

  // Task tracking
  taskIds: Annotation<string[]>,
  completedTaskIds: Annotation<string[]>,
  failedTaskIds: Annotation<string[]>,
  blockedTaskIds: Annotation<string[]>,

  // Worker outputs (keyed by taskId)
  workerHandoffs: Annotation<Record<string, string>>,      // taskId → handoff markdown path
  workerBranches: Annotation<Record<string, string>>,      // taskId → branch name
  workerArtifactIds: Annotation<Record<string, string>>,
  workerPrUrls: Annotation<Record<string, string>>,        // taskId → draft PR URL

  // Sub-Judge outputs (keyed by taskId)
  subJudgeReports: Annotation<Record<string, string>>,     // taskId → artifact path
  subJudgeEscalations: Annotation<string[]>,               // taskIds that escalated
  dependencyDriftTaskIds: Annotation<string[]>,            // taskIds with drift detected

  // Property gate
  propertyGateMode: Annotation<"required" | "optional" | "disabled">,
  propertyGateResults: Annotation<Record<string, string>>, // taskId → "pass"|"fail"|"warn"|"skipped"

  // High Court
  highCourtArtifactId: Annotation<string | null>,
  highCourtDecision: Annotation<"merge" | "human_required" | "abort" | null>,
  mergeOrder: Annotation<string[]>,                        // ordered list of taskIds to merge

  // Cost
  costArtifactId: Annotation<string | null>,
  totalCostUsd: Annotation<number>,
  costExceedsCap: Annotation<boolean>,

  // Control flow
  currentStage: Annotation<string>,
  humanEscalationReason: Annotation<string | null>,
  errors: Annotation<Array<{ stage: string; taskId?: string; message: string; ts: number }>>,
});
```

**What changed from the v5 draft:** `workerRevisionCount` and `maxWorkerRevisions` are removed. The revision router is gone. Any Sub-Judge failure routes directly to `human_escalation_node`. `revisionInstructions` is removed — the High Court no longer issues revisions autonomously. `"revise"` is removed from `highCourtDecision`. This is v1: humans handle failures. v2 can add partial re-queue once failure patterns are understood.

---

### Node inventory

| Node | Responsibility | Reads from state | Writes to state |
|---|---|---|---|
| `planner_node` | Calls Planner model, validates plan.schema.json | `cycleId`, `projectPath`, `prpRef`, `plannerRetries`, `maxPlannerRetries` | `planArtifactId`, `taskIds`, `plannerModel`, `plannerRetries`, `planAmbiguousQuestion` |
| `spawn_workers_node` | Creates worktrees + Docker envs for all taskIds | `taskIds`, `projectPath` | `workerBranches` (initialised) |
| `worker_node` | Runs one Worker per taskId (parallel map) | `taskIds[i]`, `projectPath`, `workerBranches` | `workerHandoffs[taskId]`, `workerArtifactIds[taskId]`, `workerPrUrls[taskId]`, `completedTaskIds` or `failedTaskIds` |
| `sub_judge_node` | Runs one Sub-Judge per Worker (parallel map) | `taskIds[i]`, `workerBranches[taskId]` | `subJudgeReports[taskId]`, `subJudgeEscalations` |
| `dependency_check_node` | Barrier — waits for all sub-judges, then checks drift | `taskIds`, `workerBranches` | `dependencyDriftTaskIds` |
| `property_gate_node` | Reads QUALITY.md, runs property tests if applicable | `propertyGateMode`, `completedTaskIds` | `propertyGateResults` |
| `high_court_node` | Reviews handoffs + escalations, decides merge or halt | `subJudgeReports`, `workerHandoffs`, `subJudgeEscalations`, `propertyGateResults` | `highCourtArtifactId`, `highCourtDecision`, `mergeOrder` |
| `pr_summary_node` | Posts merge-order comment on a cycle summary PR | `mergeOrder`, `workerPrUrls`, `cycleId` | (no state change) |
| `cost_auditor_node` | Calculates cycle cost from Dolt stage_runs | `cycleId` | `costArtifactId`, `totalCostUsd`, `costExceedsCap` |
| `librarian_trigger_node` | Posts to webhook server — fire and forget | `cycleId` | (no state change) |
| `human_escalation_node` | Writes to Dolt, sends escalation webhook, halts | `humanEscalationReason`, `cycleId` | `currentStage = 'halted'` |

**No `merge_queue_node` in v1.** Workers open draft PRs. `pr_summary_node` posts a cycle summary PR with the merge order as a checklist. A human merges them in that order. Automated git merge is Phase 13. See `docs/roadmap.md`.

---

### Conditional edges — every routing function

```typescript
// After planner_node
function routeAfterPlanner(state: typeof ForgeState.State): string {
  if (state.planAmbiguousQuestion !== null) return "human_escalation_node";
  if (state.planArtifactId === null) {
    if (state.plannerRetries < state.maxPlannerRetries) return "planner_node"; // retry with error feedback
    return "human_escalation_node"; // max retries hit
  }
  return "spawn_workers_node";
}

// After dependency_check_node (all sub-judges + drift check complete)
function routeAfterSubJudges(state: typeof ForgeState.State): string {
  // Any drift = touch map violation = human required immediately
  if (state.dependencyDriftTaskIds.length > 0) {
    return "human_escalation_node";
  }
  // Any sub-judge fail = human required
  // v1 does not attempt partial re-queue. Humans review and re-run the cycle.
  const anyFail = Object.values(state.subJudgeReports).some(reportPath => {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return report.status === "fail";
  });
  if (anyFail) return "human_escalation_node";
  return "property_gate_node";
}

// After property_gate_node
function routeAfterPropertyGate(state: typeof ForgeState.State): string {
  if (state.propertyGateMode === "disabled") return "high_court_node";
  const anyFail = Object.values(state.propertyGateResults).some(r => r === "fail");
  // required + fail → human. optional + fail → warn and proceed.
  if (anyFail && state.propertyGateMode === "required") return "human_escalation_node";
  return "high_court_node";
}

// After high_court_node
function routeAfterHighCourt(state: typeof ForgeState.State): string {
  switch (state.highCourtDecision) {
    case "merge":          return "pr_summary_node";
    case "human_required": return "human_escalation_node";
    case "abort":          return "cost_auditor_node"; // record costs even on abort
    default:               return "human_escalation_node"; // null/unexpected → escalate
  }
}

// After pr_summary_node
// Always proceeds to cost auditor — PR posting does not block cycle completion
function routeAfterPrSummary(_state: typeof ForgeState.State): string {
  return "cost_auditor_node";
}
```

**Why `human_escalation_node` on any sub-judge failure:** Partial re-queue of only failing workers is the v2 feature. In v1, a Worker failure is a learning opportunity — a human reviews what went wrong, improves the context files or the plan, and re-runs. Automated partial retry of an unknown failure pattern risks burning tokens on the same mistake repeatedly.

---

### Graph assembly (`packages/orchestrator/src/graph.ts`)

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { ForgeState } from "./state";

export function buildForgeGraph() {
  const graph = new StateGraph(ForgeState)
    .addNode("planner_node", plannerNode)
    .addNode("spawn_workers_node", spawnWorkersNode)
    .addNode("worker_node", workerNode)               // LangGraph .map() — N parallel
    .addNode("sub_judge_node", subJudgeNode)          // LangGraph .map() — N parallel
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
    checkpointer: forgeCheckpointer,       // SQLite locally
    interruptBefore: ["human_escalation_node"],  // pause before sending webhook
  });
}
```

### Implementation notes for Claude Code

- `worker_node` and `sub_judge_node` use LangGraph's `.map()` for parallel execution — do not implement as sequential loops
- `dependency_check_node` is a barrier node: it waits for ALL `sub_judge_node` runs to complete before executing. Use LangGraph's fan-in pattern.
- `interruptBefore: ["human_escalation_node"]` pauses the graph before the escalation webhook fires — humans can inspect state and cancel false positives via `forge resume` or `forge cancel`
- There is no `worker_revision_router`. It does not exist in v1. Do not add it.
- There is no `merge_queue_node`. It does not exist in v1. Do not add it.

---

## Prompt Stability System

Agent prompts are first-class artefacts. This section specifies how they are protected from drift.

### The rule

**Prompts live in `packages/agents/`. They are version-controlled. Any PR that modifies a prompt file requires:**
1. At least one human reviewer (enforced via CODEOWNERS)
2. The prompt test suite must pass (enforced via CI)

That is the entire stability system for v1. No sha256 hashes. No semver tooling. No CHANGELOG scripts. Those are v2 features after you've seen which prompts actually drift and how.

### CODEOWNERS (`packages/agents/` entry)

```
# packages/agents/ — prompt files are first-class artefacts
# Every prompt change requires review from a project maintainer
packages/agents/ @<your-github-username>
```

### `packages/orchestrator/src/prompts/loader.ts`

```typescript
// The ONLY way agent nodes load prompts — never fs.readFileSync directly
export function loadPrompt(role: PromptRole): string {
  const filePath = path.join(AGENTS_DIR, `${role}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found for role: ${role} at ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

export type PromptRole =
  | "planner"
  | "worker"
  | "sub-judge"
  | "high-court"
  | "librarian"
  | "cost-auditor";
```

Every agent node calls `loadPrompt(role)` at the start of its execution. This ensures the path is always consistent and gives a single place to add logging, caching, or future integrity checks without touching every node.

### Prompt test suite (`packages/agents/tests/`)

Six test files, one per role. Run on every PR that touches `packages/agents/`. Failure blocks merge.

```
packages/agents/tests/
  planner.test.ts         # Fixture repo + PRP → assert valid plan.schema.json output
  worker.test.ts          # Single-task plan → assert handoff exists, touch map respected
  sub-judge.test.ts       # Passing Worker branch → assert status: pass
  sub-judge-fail.test.ts  # Branch with lint error → assert status: fail, location present
  high-court.test.ts      # 2 worker handoffs + passing sub-judge reports → assert merge
  librarian.test.ts       # 2 changed files → assert correct flows marked stale in Dolt
```

All tests:
- Use real model calls (not mocked) — cheapest models in `forge.config.json`
- Use `test/fixtures/nextjs-simple/` as fixture project
- Assert output conforms to the relevant JSON schema (not just "no error")

If a prompt change causes any test to fail, the PR cannot merge. This is the stability guarantee.

### What counts as a prompt change that needs care

| Change | Action needed |
|---|---|
| Fixing a typo | Just change it — tests will confirm nothing broke |
| Clarifying a constraint | Change it — add a test case if the clarification covers a new scenario |
| Adding a new rule or constraint | Add a test case that would fail without the new rule |
| Changing output format or schema reference | Update all relevant JSON schemas + all affected tests before merging |
| Removing a constraint | Requires explicit comment in PR explaining why — not a technical gate, a human judgement call |

---

## Phase 13 / v2 Deferred Items

These are explicitly out of scope for v1. Document them in `docs/roadmap.md` and do not implement them.

- **Partial worker re-queue** — re-running only failing workers after sub-judge failure, without re-running passing workers. Requires understanding real failure patterns first.
- **Automated merge queue** — `merge_queue_node` with sequential `git merge --no-ff`, conflict detection, and release PR creation. The v1 `pr_summary_node` covers this with human merging.
- **Prompt semver + CHANGELOG tooling** — `update-prompt.sh`, registry.json with sha256 hashes, automated version bumping. Add when you have enough prompt change history to know what a "breaking change" actually means in practice.
- **High Court revision instructions** — High Court currently decides `merge | human_required | abort`. A `revise` decision with specific instructions routed back to Workers is a v2 feature that requires the partial re-queue system to be meaningful.
