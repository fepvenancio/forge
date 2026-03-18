# Architecture

**Analysis Date:** 2026-03-18

## Pattern Overview

**Overall:** LangGraph State Machine with Multi-Agent Orchestration

Forge implements a sequential, stateful orchestration pipeline driven by LangGraph. Each stage (Planner, Workers, Sub-Judge, High Court, etc.) is a graph node that transforms shared state. State is persisted in SQLite checkpoints, allowing resumption after human intervention or failures.

**Key Characteristics:**
- **State-machine-driven**: All computation flows through LangGraph's StateGraph with conditional routing
- **Checkpointed execution**: Sqlite checkpoint store enables resumption after human escalations
- **Multi-agent**: Six autonomous agent roles (Planner, Worker, Sub-Judge, High-Court, Librarian, Cost-Auditor)
- **Handoff-first**: Agents communicate via typed artifacts (JSON schemas) and file-based handoffs, not direct calls
- **Git-integrated**: Every agent commits code, creates branches, and uses git worktrees for isolation
- **Dolt-backed**: Versioned SQL database tracks all runs, costs, flows, and artifacts
- **Claude Code CLI**: Workers invoke Claude Code via subprocess (`claude -p`) with structured JSON output

## Layers

**Orchestration (State Machine):**
- Purpose: Control flow, routing between nodes, state management
- Location: `packages/orchestrator/src/graph.ts`
- Contains: StateGraph definition, conditional routing functions, graph assembly
- Depends on: LangGraph, SqliteSaver, all node implementations
- Used by: CLI entry point, all nodes read/write ForgeState

**Node Implementations (Agent Logic):**
- Purpose: Execute domain-specific logic (planning, work execution, judgment, cost tracking)
- Location: `packages/orchestrator/src/nodes/` (11 node implementations)
- Contains: Node functions that read state and return partial state updates
- Depends on: ForgeState, prompts, Claude Code CLI, Dolt, git worktree manager
- Used by: Graph routing, conditional edges

**Prompt Management:**
- Purpose: Load and inject system prompts for each agent role
- Location: `packages/orchestrator/src/prompts/loader.ts`, `packages/agents/*.md`
- Contains: Role-based prompt files (planner.md, worker.md, sub-judge.md, high-court.md, librarian.md, cost-auditor.md)
- Depends on: File system, path utilities
- Used by: Every node that invokes Claude Code

**Validation & Gates:**
- Purpose: Enforce constraints, validate outputs, block invalid merges
- Location: `packages/orchestrator/src/gates/`, `packages/gates/flow_freshness.py`
- Contains: Schema validators (AJV), property gates, sub-judge gate, flow freshness gate
- Depends on: JSON schemas, Dolt, git diffs
- Used by: Property-gate node, sub-judge node, CI/GitHub Actions

**Dolt Data Layer:**
- Purpose: Persist all structured metadata (tasks, cycles, artifacts, costs, flows, touch maps)
- Location: `packages/orchestrator/src/dolt/`
- Contains: Connection pooling (mysql2), query builders, schema types
- Depends on: Dolt SQL server, MySQL2 driver
- Used by: Cost auditor, touch map validation, librarian, artifact tracking

**Worktree Management:**
- Purpose: Isolate worker execution via git worktrees and branches
- Location: `packages/orchestrator/src/worktree/manager.ts`
- Contains: createWorktree, destroyWorktree, listWorktrees functions
- Depends on: git (execSync), file system
- Used by: Worker node (per-task isolation), cleanup operations

**Claude Code Integration:**
- Purpose: Invoke Claude Code CLI as a subprocess, capture JSON output
- Location: `packages/orchestrator/src/claude-code.ts`
- Contains: claudeCode function, argument builder, JSON parsing, cost extraction
- Depends on: child_process.spawn, claude CLI binary
- Used by: All nodes (planner, worker, sub-judge, high-court, cost-auditor)

**Webhook Server:**
- Purpose: Listen for GitHub webhook events and local commit hooks
- Location: `packages/webhook/src/server.ts`
- Contains: Express app with /github-webhook and /local-commit endpoints
- Depends on: Express, GitHub webhook payloads
- Used by: GitHub Actions, librarian trigger, external integrations

**Schemas & Types:**
- Purpose: Define JSON schemas for typed artifacts, enforce validation
- Location: `packages/schemas/`
- Contains: JSON Schema files (.schema.json) for plan, sub-judge-report, high-court-report, touch-map, etc.
- Depends on: AJV validator
- Used by: Validator gate, artifact registry

**Templates & Project Initialization:**
- Purpose: Provide starter projects with CLAUDE.md, ROADMAP.md, and project structure
- Location: `packages/templates/` (nextjs-postgres, go-service, python-fastapi, react-native)
- Contains: Template directories and CLAUDE.md project files
- Depends on: File system
- Used by: forge init command

**Models & Cost Tracking:**
- Purpose: Select models based on task complexity, count LOC, estimate costs
- Location: `packages/orchestrator/src/models/selector.ts`
- Contains: countLOC, countFlows, loadConfig functions
- Depends on: forge.config.json, file system
- Used by: Planner node, cost auditor node

## Data Flow

**Initialization Phase:**

1. CLI accepts `forge run <prp-path>` command
2. PRP file (Project Requirements Plan) is read and parsed
3. A cycle is created in Dolt with status "running"
4. Initial state is constructed with cycleId, projectPath, prpRef
5. Graph execution begins at planner_node

**Planning Phase:**

1. Planner node loads planner.md prompt
2. Planner reads PRP, project structure (file tree), and ROADMAP.md
3. Planner invokes Claude Code with context
4. Claude returns structured JSON: tasks array with touch maps, acceptance criteria, dependencies
5. planData is stored in state, planArtifactId created in Dolt
6. If ambiguous, routes to human_escalation_node; otherwise proceeds to spawn_workers_node

**Worker Execution Phase:**

1. spawn_workers_node creates a task ID for each task
2. worker_node processes tasks in parallel (up to max_parallel config)
3. For each task:
   - Create a git worktree and branch (`forge/task/{taskId}`)
   - Load task plan from planData
   - Invoke Claude Code with worker.md prompt, task plan, and relevant flows
   - Claude writes code in the worktree
   - Detect files changed via `git diff base..HEAD`
   - Create a handoff artifact (JSON) with summary, commits, changed files, follow-up
   - Store handoff path in workerHandoffs[taskId]
4. If worker succeeds, add taskId to completedTaskIds; if fails, add to failedTaskIds

**Judgment Phase:**

1. sub_judge_node loads sub-judge.md prompt
2. For each completed task, invoke Claude on: task plan, worker handoff, changed files diff
3. Sub-judge returns validation report (pass/fail/escalate)
4. Store report path in subJudgeReports[taskId]
5. dependency_check_node analyzes dependency declarations from plans vs actual changes
6. If dependency drift detected, escalate to human
7. Route based on: all failed? → escalate; some completed? → continue to property_gate

**Property Gate Phase:**

1. property_gate_node runs optional tests/properties (based on propertyGateMode config)
2. Store results in propertyGateResults
3. If mode is "required" and any fail → escalate; otherwise continue

**High Court Phase:**

1. high_court_node reads ALL worker handoffs (primary source of truth)
2. Reads sub-judge reports for context
3. Reads ARCHITECTURE.md and SECURITY.md for invariant checks
4. Invokes High Court Claude with handoff-first context
5. High Court decides: "merge", "human_required", or "abort"
6. Store decision in highCourtDecision, compute mergeOrder
7. Route: if "merge" → pr_summary; if "human_required" or "abort" → escalate or cost_auditor

**Summary & Merge Phase:**

1. pr_summary_node creates a GitHub PR from the merged tasks
2. Includes summary of changes, cost estimate, and validation results
3. Route to cost_auditor_node

**Cost Tracking & Finalization:**

1. cost_auditor_node aggregates all costs from all stages
2. Checks if totalCostUsd exceeds maxCycleCapUsd from config
3. If exceeded, returns error and stores costExceedsCap = true
4. Otherwise, route to librarian_trigger_node

**Librarian & Cleanup:**

1. librarian_trigger_node invokes the Librarian agent (via webhook or subprocess)
2. Librarian reads changed files and updates flow documents
3. Pushes updates to `.flows/` directory
4. Marks flows as fresh in Dolt
5. Graph reaches END state

**Human Escalation:**

At any point, if human_escalation_node is reached:
1. Graph halts and writes state to checkpoint
2. Signal sent to human (webhook to Slack, Teams, Discord, etc.)
3. Human can `forge resume <cycle-id>` to continue, or `forge cancel <cycle-id>` to abort

**State Management:**

Shared ForgeState (LangGraph Annotation.Root):
- **Cycle identity**: cycleId, projectPath, prpRef
- **Planner outputs**: planData (tasks array), planArtifactId, plannerModel, plannerRetries, planAmbiguousQuestion
- **Task tracking**: taskIds, completedTaskIds, failedTaskIds, blockedTaskIds
- **Worker outputs** (keyed by taskId): workerHandoffs, workerBranches, workerArtifactIds, workerPrUrls
- **Sub-Judge outputs** (keyed by taskId): subJudgeReports, subJudgeEscalations, dependencyDriftTaskIds
- **Property gate**: propertyGateMode, propertyGateResults
- **High Court**: highCourtArtifactId, highCourtDecision, mergeOrder
- **Cost**: claudeCodeCosts (array), costArtifactId, totalCostUsd, costExceedsCap
- **Control flow**: currentStage, humanEscalationReason, errors (append-only)

## Key Abstractions

**Artifact Registry:**
- Purpose: Metadata tracking for all typed outputs (plans, handoffs, reports, cost records)
- Examples: `packages/orchestrator/src/dolt/schema.ts` defines Task, Cycle, StageRun, Artifact types
- Pattern: Every major output is registered in Dolt's artifacts table with schema_type and file_path

**Touch Map:**
- Purpose: Declare which files each task reads/writes before execution
- Examples: `packages/schemas/touch-map.schema.json`
- Pattern: Produced by Planner in task.touch_map.reads[] and task.touch_map.writes[]
- Used by: Dependency checker to detect conflicts, validation gates

**Handoff Document:**
- Purpose: Worker's summary of what it did, required for High Court decision-making
- Examples: Stored in `workerHandoffs[taskId]` as JSON or Markdown
- Pattern: Includes changed files, commits made, summary, follow-up notes
- Used by: High Court (primary input), sub-judge (validation context)

**Flow Document:**
- Purpose: Repository documentation (architecture, API specs, deployment guides, etc.)
- Examples: Files in `.flows/` directory, registered in Dolt's flow_registry table
- Pattern: Each flow has criticality level (high/medium/low), last_reviewed, stale flag
- Used by: Librarian (updates on code changes), flow_freshness gate (blocks stale flows)

**Stage Run:**
- Purpose: Track each agent execution (planner, worker, sub-judge, etc.)
- Examples: `packages/orchestrator/src/dolt/schema.ts` StageRun interface
- Pattern: One row per agent invocation, records timing, model, outcome, artifact_id
- Used by: Cost auditor (token counts), work logs (audit trail)

## Entry Points

**CLI Entry Point:**
- Location: `packages/orchestrator/src/cli.ts`
- Triggers: `forge start|run|resume|cancel|cost|logs|init` commands
- Responsibilities:
  - Parse command-line args
  - Initialize graph (buildForgeGraph)
  - Invoke graph with initial input
  - Manage PID files for daemon processes
  - Display status and logs to terminal

**Graph Execution Entry:**
- Location: `packages/orchestrator/src/graph.ts` (buildForgeGraph function)
- Triggers: CLI main(), or test harness
- Responsibilities:
  - Assemble all nodes and edges
  - Configure checkpoint storage (SQLite)
  - Set interrupt points (human_escalation_node)
  - Return compiled graph for invocation

**Webhook Entry:**
- Location: `packages/webhook/src/server.ts`
- Triggers: GitHub push webhooks, local commit hooks
- Responsibilities:
  - Listen on FORGE_WEBHOOK_PORT (default 3001)
  - Parse GitHub event payload
  - Trigger Librarian agent or conflict detection
  - Return 200 to GitHub

**Gate Runners (CI):**
- Location: `packages/gates/flow_freshness.py`
- Triggers: GitHub Actions on PR
- Responsibilities:
  - Fetch git diff (changed files in PR)
  - Query Dolt for stale flows
  - Match changed files against stale flow patterns
  - Block merge if stale flows found

## Error Handling

**Strategy:** Graceful escalation with human-in-the-loop

**Patterns:**

1. **Validation Failures**: Sub-judge or property gate failures → escalate to human_escalation_node → halt and wait
2. **Claude Code Failures**: Worker retries (MAX_WORKER_ATTEMPTS = 2), then escalate if both fail
3. **Dependency Drift**: Detected by dependency_check_node, escalates immediately
4. **Cost Overrun**: cost_auditor_node checks against maxCycleCapUsd, blocks merge if exceeded
5. **Ambiguous Plans**: Planner asks clarifying question → human_escalation_node → human answers → resume

**Error Logging:**
- All errors appended to state.errors (array of {stage, taskId, message, ts})
- Dolt stage_runs table records error_message per agent
- Work logs table captures file-level actions and failures

## Cross-Cutting Concerns

**Logging:** Console.log (no structured logging framework); key milestones logged to stdout

**Validation:** AJV-based JSON schema validation via `packages/orchestrator/src/gates/validator.ts`
- Validates plan output, sub-judge reports, high-court decision
- Validator.validate() returns {valid, errors} tuple
- Failures trigger formatValidationFeedback() for human-readable error messages

**Authentication:**
- GitHub: Octokit client uses GITHUB_TOKEN (env var) for PR creation
- Dolt: MySQL credentials from env (DOLT_HOST, DOLT_USER, DOLT_PASSWORD)
- Claude Code CLI: Handles auth via claude CLI (requires ~/.anthropic/credentials)

**Transaction Semantics:**
- Dolt provides git-like versioning (every query is versioned)
- State checkpoints are atomic (SQLite savepoints)
- Git commits are atomic per task (worktree isolation)
- No distributed transaction coordination needed (single Dolt database)

---

*Architecture analysis: 2026-03-18*
