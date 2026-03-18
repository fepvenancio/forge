# Forge — Build Plan
**Autonomous Engineering Factory: Multi-Agent Software Production System**

> This document is the complete implementation plan for Forge.  
> Hand it to Claude Code (with teammates enabled) and let it work through phases sequentially.  
> Each phase has clear acceptance criteria. Nothing moves to the next phase until the current one passes.
>
> **Version 5** — final balanced version. Extracted Phase 5 & 6 wiring spec to `docs/phase-5-6-control.md`.  
> Changes: Librarian trigger mechanism specified, Dolt startup documented, Docker resource caps added,  
> `.env.example` added, Planner PLAN_AMBIGUOUS exit ramp hardened, High Court handoff-first strategy,  
> Worker Docker/worktree sync robustness requirements.

---

## Project Identity

| Field | Value |
|---|---|
| Name | Forge |
| Tagline | Build anything. Track everything. Trust the output. |
| Repo | `forge` |
| Runtime | Node.js 22+ (orchestrator), Python 3.12+ (gates, Librarian) |
| Primary language | TypeScript |
| License | MIT |

---

## What Forge Is

Forge is a domain-agnostic multi-agent orchestration system for building software. It runs a structured team of AI agents against any project — web2, mobile, API, data pipeline, or protocol — and produces reviewable pull requests with full audit trails.

The system has five agent roles:

- **Planner** — decomposes tasks, produces touch maps, never writes code
- **Workers** — execute in isolated Git worktrees, self-audit inline
- **Sub-Judges** — run in parallel with Workers, check syntax/tests/linting
- **High Court (Judge)** — fires once per cycle, reviews architectural invariants
- **Librarian** — triggered by commits, keeps Flow documents fresh

All shared state lives in **Dolt** (versioned SQL with Git semantics). All agent isolation uses **Git worktrees** + **Docker**. All context lives in plain files in the repo, human-reviewed.

---

## Pre-Implementation Decisions (Review Before Starting)

### Configurable property-based testing
Property-based testing is configurable per project via `QUALITY.md`, not mandatory globally:
```
property_based: required    # protocol/math-heavy code (Cairo, Solidity, financial)
property_based: optional    # APIs, backend services (warns if missing, doesn't block)
property_based: disabled    # frontend, mobile, docs (Sub-Judge skips entirely)
```
Per-language runner: `fast-check` (TS/JS), `Hypothesis` (Python), `Foundry Proptest` (Solidity/Cairo), Go built-in fuzzing. Sub-Judge reads `QUALITY.md` and applies accordingly.

### Librarian mass refactor handling
Librarian triage rule (encoded in Librarian system prompt):
- If `stale_flows <= 10` → propose updates individually, one PR per Flow
- If `stale_flows > 10` → batch all proposals into one PR with priority scores
- Priority score = `(modified_files_referencing_flow × 3) + criticality_flag_value`
- `criticality` is a field in `flow-registry.json`: `low | medium | high | critical`
- Human approves the batch PR; Librarian never merges autonomously

### Planner model selection threshold
Configurable in `forge.config.json`:
```json
{
  "planner": {
    "model_threshold_loc": 400000,
    "model_below_threshold": "claude-opus-4-6",
    "model_above_threshold": "gemini-3-1-pro"
  }
}
```
Orchestrator auto-detects LOC + Flow count at cycle start and selects accordingly. Below 400k LOC, Claude Opus 4.6 is cheaper and has better instruction following. Above, Gemini 3.1 Pro's 1M context window wins.

### Cost Auditor
A lightweight LangGraph node that runs after every cycle:
- Reads token usage from all agent runs stored in Dolt
- Calculates cost per role using configurable pricing table
- Posts summary to Dolt `cycle_costs` table
- Surfaces on dashboard as a cost-per-cycle chart
- Triggers a warning (not a block) if cycle cost exceeds `max_cycle_cost` in `forge.config.json`

---

## Known Risks and Mitigations

These are the three highest-probability failure points. Read them before starting Phase 5 and Phase 6.

### Risk 1 — Planner produces bad touch maps (Valley of Death #1)
The entire factory depends on the Planner producing an accurate `plan.json` with correct `touch_maps`. If the Planner misses a dependency, Workers collide or fail silently.

**Mitigations built into the plan:**
- `PLAN_AMBIGUOUS` is the Planner's primary escape hatch. The Planner prompt explicitly says: if uncertain about scope, emit `PLAN_AMBIGUOUS` with a specific question rather than guessing. The Plan Gate must make this the path of least resistance — a malformed plan.json is a hard reject, but a `PLAN_AMBIGUOUS` is a clean, expected state.
- The Plan Gate runs `checkWriteConflicts()` mechanically before any Worker starts. No AI involved. If two tasks share a write target, the gate catches it before a Worker wastes tokens.
- In Phase 6, the Planner node must retry up to `max_planner_retries` (default: 3) on schema validation failure before escalating to human. Each retry includes the validation error as feedback.

### Risk 2 — High Court latency (Valley of Death #2)
The High Court (Claude Opus) must review the output of all Workers per cycle. Reading raw diffs for 20 Workers would make each cycle glacially slow.

**Mitigations built into the plan:**
- **Handoff-first strategy**: The High Court reads Worker handoff markdown files as its primary input, not raw code. Handoffs are structured summaries of what changed, why, and what invariants the Worker self-verified. The High Court only reads raw code when a Sub-Judge has flagged an escalation or an invariant check cannot be satisfied from the handoff alone.
- **Sub-Judge pre-filtering**: By the time the High Court runs, Sub-Judges have already eliminated syntax errors, test failures, and touch map violations. The High Court reviews architecture and security — not correctness.
- **Parallel Sub-Judges**: Sub-Judges run concurrently with Workers (not after), so their results are ready the moment Workers push.

### Risk 3 — Docker/worktree dependency sync
When a Worker runs inside Docker with the worktree mounted, `node_modules` or `venv` inside the container may diverge from what was installed on the host. This silently breaks builds.

**Mitigations built into the plan:**
- `setupEnvironment()` in Phase 3 must run the install command **inside the Docker container** (not on the host), using the container's own runtime. The host never installs dependencies into a worktree directory.
- `worker.Dockerfile` must pin exact tool versions (Node, Python, package managers). No `latest` tags.
- `setupEnvironment()` must checksum `package.json` / `requirements.txt` / `go.sum` before and after the Worker runs. If the checksum changes (Worker modified a dependency file), the Sub-Judge gate flags it as a touch map violation (dependency files are not in scope unless explicitly declared).
- The E2E test in Phase 11 must include a case where the Worker's worktree has a `package.json` change — verify the gate catches it.

---

## Repository Structure

```
forge/
├── PLAN.md                          # This file
├── README.md
├── forge.config.json                # Global config (model thresholds, cost caps, etc.)
├── package.json                     # Root — workspaces
├── tsconfig.json
│
├── packages/
│   ├── orchestrator/                # LangGraph-based orchestrator (TypeScript)
│   │   ├── src/
│   │   │   ├── graph.ts             # Main LangGraph graph definition
│   │   │   ├── nodes/
│   │   │   │   ├── planner.ts
│   │   │   │   ├── worker.ts
│   │   │   │   ├── sub-judge.ts
│   │   │   │   ├── high-court.ts
│   │   │   │   ├── librarian.ts
│   │   │   │   └── cost-auditor.ts
│   │   │   ├── gates/
│   │   │   │   ├── plan-gate.ts
│   │   │   │   ├── sub-judge-gate.ts
│   │   │   │   ├── property-gate.ts
│   │   │   │   ├── flow-freshness-gate.ts
│   │   │   │   └── high-court-gate.ts
│   │   │   ├── worktree/
│   │   │   │   ├── manager.ts       # Create / destroy / list worktrees
│   │   │   │   └── docker.ts        # Per-worker Docker isolation
│   │   │   ├── dolt/
│   │   │   │   ├── client.ts        # Dolt SQL client wrapper
│   │   │   │   ├── schema.ts        # Schema definitions
│   │   │   │   └── queries.ts       # Typed query functions
│   │   │   ├── models/
│   │   │   │   ├── selector.ts      # Auto-select model by threshold + role
│   │   │   │   └── pricing.ts       # Token cost table
│   │   │   ├── state.ts             # LangGraph shared state type
│   │   │   └── cli.ts               # Entry point
│   │   └── package.json
│   │
│   ├── agents/                      # Agent system prompts (Markdown)
│   │   ├── planner.md
│   │   ├── worker.md
│   │   ├── sub-judge.md
│   │   ├── high-court.md
│   │   ├── librarian.md
│   │   └── cost-auditor.md
│   │
│   ├── gates/                       # Python gate runners
│   │   ├── property_gate.py         # Hypothesis / fast-check / Foundry runner
│   │   ├── flow_freshness.py        # Checks flow-registry against git diff
│   │   └── requirements.txt
│   │
│   ├── schemas/                     # Typed JSON contracts between agents
│   │   ├── plan.schema.json
│   │   ├── touch-map.schema.json
│   │   ├── sub-judge-report.schema.json
│   │   ├── property-test-report.schema.json
│   │   ├── security-report.schema.json
│   │   ├── high-court-report.schema.json
│   │   └── cycle-cost-report.schema.json
│   │
│   ├── dashboard/                   # Streamlit dashboard
│   │   ├── app.py
│   │   ├── pages/
│   │   │   ├── task_board.py
│   │   │   ├── audit_trail.py
│   │   │   └── cost_tracker.py
│   │   └── requirements.txt
│   │
│   ├── webhook/                     # Lightweight webhook listener for Librarian trigger
│   │   ├── server.ts                # Express server: POST /github-webhook → trigger Librarian
│   │   ├── verify.ts                # GitHub webhook signature verification (HMAC-SHA256)
│   │   └── package.json
│   │
│   └── templates/                   # Per-stack context file templates
│       ├── nextjs-postgres/
│       │   ├── CLAUDE.md
│       │   ├── ARCHITECTURE.md
│       │   ├── SECURITY.md
│       │   ├── QUALITY.md
│       │   ├── flow-registry.json
│       │   └── flows/
│       │       └── example-flow.md
│       ├── python-fastapi/
│       │   ├── CLAUDE.md
│       │   ├── ARCHITECTURE.md
│       │   ├── SECURITY.md
│       │   ├── QUALITY.md
│       │   ├── flow-registry.json
│       │   └── flows/
│       ├── react-native/
│       │   ├── CLAUDE.md
│       │   ├── ARCHITECTURE.md
│       │   ├── SECURITY.md
│       │   ├── QUALITY.md
│       │   ├── flow-registry.json
│       │   └── flows/
│       └── go-service/
│           ├── CLAUDE.md
│           ├── ARCHITECTURE.md
│           ├── SECURITY.md
│           ├── QUALITY.md
│           ├── flow-registry.json
│           └── flows/
│
├── dolt/
│   └── schema.sql                   # Full Dolt schema — run once on init
│
├── docker/
│   ├── worker.Dockerfile            # Worker isolation image
│   └── compose.yml                  # Local dev compose
│
├── scripts/
│   ├── init-dolt.sh                 # Bootstrap Dolt database
│   ├── init-project.sh              # Scaffold a new project with templates
│   ├── check-deps.sh                # Verify all dependencies installed
│   └── post-commit-librarian.sh     # Git post-commit hook — triggers Librarian
│
├── .env.example                     # All required env vars with placeholder values
└── .github/
    └── workflows/
        ├── flow-freshness.yml        # CI: block merge if Flows stale
        └── forge-ci.yml              # CI: run Forge gates on PRs
```

---

## Dolt Schema

File: `dolt/schema.sql`

This is the complete schema. Run via `scripts/init-dolt.sh`.

```sql
-- Tasks: one row per unit of work assigned to the factory
CREATE TABLE tasks (
  id            VARCHAR(36)   PRIMARY KEY,
  prp_ref       TEXT          NOT NULL,          -- path to PRP file that spawned this task
  title         TEXT          NOT NULL,
  description   TEXT,
  layer         VARCHAR(32),                     -- frontend | backend | database | infra | any
  status        VARCHAR(32)   NOT NULL DEFAULT 'pending',
                                                 -- pending | planning | in_progress | reviewing
                                                 -- blocked | done | failed | cancelled
  complexity    VARCHAR(16)   DEFAULT 'standard',-- standard | complex (complex = single Worker)
  created_at    BIGINT        NOT NULL,
  updated_at    BIGINT        NOT NULL,
  cycle_id      VARCHAR(36),
  parent_task   VARCHAR(36)   REFERENCES tasks(id)
);

-- Cycles: one Planner + N Workers + one High Court = one cycle
CREATE TABLE cycles (
  id            VARCHAR(36)   PRIMARY KEY,
  project_id    VARCHAR(36)   NOT NULL,
  status        VARCHAR(32)   NOT NULL DEFAULT 'running',
  planner_model VARCHAR(128),
  started_at    BIGINT        NOT NULL,
  finished_at   BIGINT,
  judge_outcome VARCHAR(32),                     -- continue | done | blocked | human_required
  notes         TEXT
);

-- Stage runs: every agent execution, one row
CREATE TABLE stage_runs (
  id            VARCHAR(36)   PRIMARY KEY,
  task_id       VARCHAR(36)   NOT NULL REFERENCES tasks(id),
  cycle_id      VARCHAR(36)   REFERENCES cycles(id),
  stage         VARCHAR(64)   NOT NULL,          -- planner | worker | sub_judge | property_gate
                                                 -- high_court | librarian | cost_auditor
  model         VARCHAR(128)  NOT NULL,
  worktree_path TEXT,
  branch_name   TEXT,
  started_at    BIGINT        NOT NULL,
  finished_at   BIGINT,
  outcome       VARCHAR(32),                     -- pass | fail | gap | blocked | skipped
  artifact_id   VARCHAR(36),
  error_message TEXT,
  retry_count   INT           DEFAULT 0
);

-- Touch maps: Planner-declared file access per task
CREATE TABLE touch_maps (
  id            VARCHAR(36)   PRIMARY KEY,
  task_id       VARCHAR(36)   NOT NULL REFERENCES tasks(id),
  file_path     TEXT          NOT NULL,
  access        VARCHAR(8)    NOT NULL,          -- read | write
  INDEX idx_touch_maps_task (task_id)
);

-- Artifacts: metadata for all typed agent outputs
CREATE TABLE artifacts (
  id            VARCHAR(36)   PRIMARY KEY,
  stage_run_id  VARCHAR(36)   REFERENCES stage_runs(id),
  schema_type   VARCHAR(64)   NOT NULL,          -- plan | touch_map | sub_judge_report | etc.
  schema_version VARCHAR(16)  NOT NULL DEFAULT '1.0',
  file_path     TEXT          NOT NULL,          -- absolute path on disk
  created_at    BIGINT        NOT NULL,
  valid         BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Flows: registry of flow documents and their file associations
CREATE TABLE flow_registry (
  id            VARCHAR(36)   PRIMARY KEY,
  flow_path     TEXT          NOT NULL UNIQUE,   -- relative path from repo root
  title         TEXT          NOT NULL,
  criticality   VARCHAR(16)   NOT NULL DEFAULT 'medium',
                                                 -- low | medium | high | critical
  last_reviewed BIGINT,
  last_modified BIGINT,
  stale         BOOLEAN       NOT NULL DEFAULT FALSE,
  INDEX idx_flow_stale (stale)
);

-- Flow-file associations: which source files each flow covers
CREATE TABLE flow_file_refs (
  flow_id       VARCHAR(36)   NOT NULL REFERENCES flow_registry(id),
  file_pattern  TEXT          NOT NULL,          -- glob pattern e.g. src/auth/**
  PRIMARY KEY (flow_id, file_pattern)
);

-- Cycle costs: token usage and estimated cost per cycle
CREATE TABLE cycle_costs (
  id            VARCHAR(36)   PRIMARY KEY,
  cycle_id      VARCHAR(36)   NOT NULL REFERENCES cycles(id),
  stage         VARCHAR(64)   NOT NULL,
  model         VARCHAR(128)  NOT NULL,
  input_tokens  BIGINT        DEFAULT 0,
  output_tokens BIGINT        DEFAULT 0,
  cost_usd      DECIMAL(10,6) DEFAULT 0,
  recorded_at   BIGINT        NOT NULL
);

-- Worker work logs: append-only, one row per agent action within a task
CREATE TABLE work_logs (
  id            VARCHAR(36)   PRIMARY KEY,
  task_id       VARCHAR(36)   NOT NULL REFERENCES tasks(id),
  stage_run_id  VARCHAR(36)   REFERENCES stage_runs(id),
  action        VARCHAR(64)   NOT NULL,          -- file_read | function_created | plan_gap
                                                 -- stage_complete | security_check | test_written
  file_path     TEXT,
  detail        TEXT,
  logged_at     BIGINT        NOT NULL,
  INDEX idx_work_logs_task (task_id)
);
```

---

## JSON Schemas

All agent outputs are typed. Agents must produce valid JSON matching these schemas. Gates reject non-conforming output without calling AI.

### `plan.schema.json`
```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "type": "object",
  "required": ["task_id", "cycle_id", "title", "tasks", "reasoning"],
  "properties": {
    "task_id": { "type": "string" },
    "cycle_id": { "type": "string" },
    "title": { "type": "string" },
    "reasoning": { "type": "string" },
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "layer", "complexity", "touch_map", "acceptance_criteria", "must_not_change"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "layer": { "enum": ["frontend", "backend", "database", "infra", "any"] },
          "complexity": { "enum": ["standard", "complex"] },
          "depends_on": { "type": "array", "items": { "type": "string" } },
          "touch_map": {
            "type": "object",
            "required": ["reads", "writes"],
            "properties": {
              "reads": { "type": "array", "items": { "type": "string" } },
              "writes": { "type": "array", "items": { "type": "string" } }
            }
          },
          "acceptance_criteria": { "type": "array", "items": { "type": "string" } },
          "must_not_change": { "type": "array", "items": { "type": "string" } },
          "relevant_flows": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

### `sub-judge-report.schema.json`
```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "type": "object",
  "required": ["task_id", "stage_run_id", "status", "checks"],
  "properties": {
    "task_id": { "type": "string" },
    "stage_run_id": { "type": "string" },
    "status": { "enum": ["pass", "fail", "warn"] },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "result"],
        "properties": {
          "name": { "type": "string" },
          "result": { "enum": ["pass", "fail", "warn", "skipped"] },
          "location": { "type": "string" },
          "message": { "type": "string" }
        }
      }
    },
    "escalate_to_high_court": { "type": "boolean" },
    "escalation_reason": { "type": "string" }
  }
}
```

### `high-court-report.schema.json`
```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "type": "object",
  "required": ["cycle_id", "decision", "workers_reviewed"],
  "properties": {
    "cycle_id": { "type": "string" },
    "decision": { "enum": ["merge", "human_required", "abort"] },
    "workers_reviewed": { "type": "array", "items": { "type": "string" } },
    "invariant_checks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["invariant", "result"],
        "properties": {
          "invariant": { "type": "string" },
          "result": { "enum": ["pass", "fail"] },
          "detail": { "type": "string" }
        }
      }
    },
    "touch_map_violations": { "type": "array", "items": { "type": "string" } },
    "revision_instructions": { "type": "string" },
    "merge_order": { "type": "array", "items": { "type": "string" } }
  }
}
```

### `cycle-cost-report.schema.json`
```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "type": "object",
  "required": ["cycle_id", "total_cost_usd", "breakdown"],
  "properties": {
    "cycle_id": { "type": "string" },
    "total_cost_usd": { "type": "number" },
    "exceeds_cap": { "type": "boolean" },
    "cap_usd": { "type": "number" },
    "breakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["stage", "model", "input_tokens", "output_tokens", "cost_usd"],
        "properties": {
          "stage": { "type": "string" },
          "model": { "type": "string" },
          "input_tokens": { "type": "integer" },
          "output_tokens": { "type": "integer" },
          "cost_usd": { "type": "number" }
        }
      }
    }
  }
}
```

---

## Agent System Prompts

These are the actual prompts loaded into each agent session. They live in `packages/agents/`. They are version-controlled and human-reviewed. The orchestrator injects context on top at runtime.

### `planner.md`
```markdown
# Role: Planner

You are the Planner in the Forge engineering factory.

## Your authority
- Read any file in the repository
- Write tasks to Dolt
- Spawn sub-planners for subsystems

## Your constraints — hard limits
- You NEVER write code
- You NEVER modify source files
- You NEVER merge branches
- If you are uncertain about scope, output a PLAN_AMBIGUOUS with a specific question
  rather than guessing

## Your job
Given a task description, you will:
1. Read the codebase to understand current state. Use the Flow documents in .flows/ to
   understand existing paths — do not read all source files if a Flow covers it.
2. Decompose the work into module-level tasks. Not function-level (too fine),
   not feature-level (too broad).
3. For each task, produce a touch map: which files it may READ, which it may WRITE.
4. Identify complex tasks (two logically dependent changes to the same file) and mark
   them complexity: "complex" — these go to a single Worker.
5. Identify task dependencies. Tasks with no dependencies can run in parallel.
6. Output a plan conforming exactly to plan.schema.json.

## What makes a good touch map
- Be conservative. List only files the Worker genuinely needs.
- Writes must not overlap between tasks (the Plan Gate will reject you if they do).
- If two tasks must write the same file, merge them into one complex task.

## Model selection note
You have been selected because the codebase size is appropriate for your context window.
Do not attempt to read files beyond what is necessary for the task at hand.

## Output format
Produce ONLY valid JSON conforming to plan.schema.json. No prose before or after.
If you cannot produce a valid plan, output:
{ "status": "PLAN_AMBIGUOUS", "question": "<specific question>" }
```

### `worker.md`
```markdown
# Role: Worker

You are a Worker in the Forge engineering factory.

## Your authority
- Read files listed in your touch_map.reads
- Write files listed in your touch_map.writes
- Run tests, linters, build commands
- Commit to your assigned branch
- Open a draft PR

## Your constraints — hard limits
- You NEVER read or write files outside your touch map
- You NEVER make architecture decisions — if the plan is wrong, output PLAN_GAP
- You NEVER deploy, publish packages, or call external APIs
- You NEVER modify CLAUDE.md, SECURITY.md, ARCHITECTURE.md, or any Flow document
- If you find a security issue in code you were not asked to modify, document it
  in your handoff but do not fix it

## Your job
1. Read your task from Dolt (task_id provided at session start)
2. Read your touch_map — this is your entire scope
3. Read the relevant Flow documents listed in your task
4. Read the SECURITY.md checklist — you will self-audit against this inline
5. Read the QUALITY.md — check if property_based is required, optional, or disabled
6. Implement the plan. Log every action to work_logs before you do it.
7. Write tests. Coverage must meet the threshold in QUALITY.md.
8. If property_based is required: write property-based tests using the configured runner.
   If optional: write them if the change involves pure functions or mathematical logic.
   If disabled: skip.
9. Self-audit: run through SECURITY.md line by line. Fix any violations before committing.
10. Commit with a descriptive message referencing the task_id.
11. Open a draft PR with a handoff document covering:
    - What was done
    - What was NOT done (scope deliberately excluded)
    - Any concerns or edge cases discovered
    - Any security items flagged in code outside your scope
    - Files modified (must match touch_map.writes exactly)

## If you encounter a PLAN_GAP
Output to work_logs: { "action": "plan_gap", "question": "<specific question>" }
Then stop. Do not improvise. The orchestrator will route back to the Planner.

## Output
Write your handoff as a markdown file at .forge/handoffs/<task_id>.md in your worktree.
```

### `sub-judge.md`
```markdown
# Role: Sub-Judge

You are a Sub-Judge in the Forge engineering factory.

## Your authority
- Read the Worker's branch (read-only)
- Read the Sub-Judge report schema
- Read QUALITY.md and SECURITY.md
- Write a Sub-Judge report to the artifacts directory

## Your constraints
- You NEVER modify code
- You NEVER approve or reject a PR
- You NEVER communicate with Workers directly
- You escalate to High Court — you do not override Workers

## Your job
Run these checks in order. Stop at first FAIL and record it.

1. **Syntax** — does the code parse without errors?
2. **Linting** — does it pass the project linter (ESLint, flake8, golangci-lint, etc.)?
3. **Build** — does the project build cleanly?
4. **Unit tests** — do all tests pass?
5. **Coverage** — does new code meet the threshold in QUALITY.md?
6. **Schema conformance** — do all typed artifacts from this Worker conform to their schemas?
7. **Touch map compliance** — did the Worker write only files in touch_map.writes?
   (Compare git diff to declared touch map.)
8. **Property tests** (if QUALITY.md property_based != disabled) — did the Worker write
   property tests? If required and absent: FAIL. If optional and absent: WARN.

## Escalation to High Court
Escalate if:
- Any security-relevant pattern is detected (hardcoded secrets, SQL strings, eval usage)
- The Worker's handoff mentions concerns about architectural impact
- Touch map violations are detected

## Output
Produce ONLY valid JSON conforming to sub-judge-report.schema.json.
```

### `high-court.md`
```markdown
# Role: High Court Judge

You are the High Court Judge in the Forge engineering factory.
You fire ONCE per cycle, after all Workers and Sub-Judges have completed.

## Your authority
- Read all Worker branches (read-only)
- Read all Sub-Judge reports
- Read all Worker handoffs
- Read ARCHITECTURE.md, SECURITY.md, QUALITY.md, all Flow documents
- Decide: merge | human_required | abort

## Your constraints
- You NEVER write code
- You NEVER modify source files
- You fire once per cycle, not per Worker
- "human_required" means you stop and escalate. You do not retry.

## Your job
1. Read every Sub-Judge report. If any Sub-Judge escalated, treat this as a priority item.
2. Read every Worker handoff.
3. Verify architectural invariants from ARCHITECTURE.md hold across the combined changes.
4. Verify the security checklist from SECURITY.md passes across combined changes.
5. Verify no touch map violations occurred (cross-reference with Sub-Judge reports).
6. Verify Flow documents cover the changed paths (flow freshness is checked by CI gate,
   but flag if obviously missing).
7. If all pass: output merge with merge_order (the sequence Workers should be merged).
8. If architectural problem, security failure, or fixable issues that require human judgement: output human_required with a clear explanation of what needs to be addressed.
9. If fundamental contradiction between tasks: output abort with explanation.

## Output
Produce ONLY valid JSON conforming to high-court-report.schema.json.
```

### `librarian.md`
```markdown
# Role: Librarian

You are the Librarian in the Forge engineering factory.
You are triggered by Git commits — not by tasks or cycles.

## Your authority
- Read any source file (read-only)
- Read all Flow documents in .flows/
- Read flow-registry.json
- Write proposed Flow updates as PR branches
- Write to Dolt flow_registry table (stale flag only)

## Your constraints
- You NEVER write code
- You NEVER modify source files outside .flows/
- You NEVER merge your own PRs
- You NEVER mark a Flow as reviewed — only humans do that

## Your job
When triggered with a list of changed files from a commit:

1. Query flow-registry.json and Dolt flow_file_refs to find all Flows that reference
   the changed files (by glob pattern match).
2. Mark those Flows as stale = true in Dolt.
3. Count stale flows.

### If stale_flows <= 10 (individual mode)
For each stale Flow:
- Read the Flow document
- Read the changed source files it references
- Produce an updated Flow document that reflects the changes
- Create one PR branch per Flow: librarian/flow-update/<flow-name>
- PR description must include: which commit triggered this, which files changed,
  what specifically changed in the Flow, confidence score (low/medium/high)

### If stale_flows > 10 (batch mode)
Priority score formula: (count of modified files referencing this flow × 3) + criticality_value
Criticality values: critical=5, high=3, medium=2, low=1

**IMPORTANT — batch mode priority safeguard:**
Before finalising priority scores, you MUST check: are any flows with criticality=critical
ranked lower than position 3 in your sorted list? If so, something is wrong with your
calculation. Re-score. A critical flow MUST appear in positions 1-3 of the batch PR
regardless of how many files reference it. Criticality always overrides file-count score
when criticality=critical. This prevents a high-traffic UI flow from burying a low-traffic
but critical protocol flow due to raw file-count arithmetic.

- Sort by priority descending (with the critical-flow safeguard applied)
- Produce all Flow updates in a single PR branch: librarian/batch-update/<commit-sha>
- PR description: priority-ordered list of Flows with scores, criticality flags clearly marked,
  and summary of each change. Mark critical flows with [CRITICAL] prefix.
- Human approves the batch PR; Librarian does not auto-merge

## Output
Write a Librarian report to .forge/librarian/<timestamp>.json:
{ "triggered_by": "<commit_sha>", "stale_count": N, "mode": "individual|batch",
  "flows_updated": [...], "prs_created": [...], "critical_flows_in_batch": [...] }
```

### `cost-auditor.md`
```markdown
# Role: Cost Auditor

You are the Cost Auditor in the Forge engineering factory.
You run after every cycle completes.

## Your job
1. Read all stage_runs for this cycle from Dolt.
2. Read token usage from each stage_run (stored by orchestrator during execution).
3. Apply pricing from forge.config.json pricing table.
4. Calculate total cost and per-stage breakdown.
5. Check against max_cycle_cost in forge.config.json.
6. Write results to Dolt cycle_costs table.
7. Write a cost report conforming to cycle-cost-report.schema.json.
8. If exceeds_cap is true: log a warning to Dolt. Do NOT block the pipeline.

## Output
Produce ONLY valid JSON conforming to cycle-cost-report.schema.json.
```

---

## `forge.config.json` (default)

```json
{
  "planner": {
    "model_threshold_loc": 400000,
    "model_below_threshold": "claude-opus-4-6",
    "model_above_threshold": "gemini-3-1-pro-preview"
  },
  "workers": {
    "default_model": "gemini-3-flash-preview",
    "protocol_model": "claude-sonnet-4-6",
    "max_parallel": 20
  },
  "sub_judge": {
    "model": "gemini-3-flash-preview"
  },
  "high_court": {
    "model": "claude-opus-4-6"
  },
  "librarian": {
    "model": "claude-sonnet-4-6",
    "batch_threshold": 10
  },
  "cost": {
    "max_cycle_cost_usd": 50,
    "pricing": {
      "claude-opus-4-6":          { "input_per_1m": 15.00, "output_per_1m": 75.00 },
      "claude-sonnet-4-6":        { "input_per_1m": 3.00,  "output_per_1m": 15.00 },
      "gemini-3-1-pro-preview":   { "input_per_1m": 1.25,  "output_per_1m": 5.00 },
      "gemini-3-flash-preview":   { "input_per_1m": 0.075, "output_per_1m": 0.30 }
    }
  },
  "dolt": {
    "host": "localhost",
    "port": 3306,
    "database": "forge"
  },
  "docker": {
    "worker_image": "forge-worker:latest",
    "network": "none",
    "resources": {
      "memory": "2g",
      "cpus": "1.0",
      "note": "20 parallel workers × 2GB = 40GB peak. On laptops (16GB RAM) set max_parallel to 4 and memory to 1g."
    }
  }
}
```

---

## `.env.example`

Every environment variable Forge needs. Copy to `.env` and fill in values. Never commit `.env`.

```bash
# AI Model APIs
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Dolt database
DOLT_HOST=localhost
DOLT_PORT=3306
DOLT_USER=root
DOLT_PASSWORD=
DOLT_DATABASE=forge

# GitHub integration (for Librarian webhook)
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=ghp_...

# Forge runtime
FORGE_MAX_PARALLEL_WORKERS=20          # Reduce to 4 on laptops (16GB RAM)
FORGE_MAX_CYCLE_COST_USD=50
FORGE_WORKER_MEMORY_LIMIT=2g          # Reduce to 1g on laptops
FORGE_WORKER_CPU_LIMIT=1.0
FORGE_WEBHOOK_PORT=3001

# Human escalation — where to send human_required notifications
# Supports: Slack incoming webhook, Microsoft Teams webhook, Discord webhook
# Format: https://hooks.slack.com/services/... or https://discord.com/api/webhooks/...
# Leave blank to log to stdout only (fine for solo dev, not for teams)
FORGE_ESCALATION_WEBHOOK_URL=

# Dashboard
STREAMLIT_PORT=8501
```

The `docker/compose.yml` mounts `.env` into the worker container. Workers access only the variables they need via explicit `--env` flags — not the full file.

---

Each stack template contains the same five files with stack-appropriate content.

### Template: `nextjs-postgres/QUALITY.md`
```markdown
# Quality Standards

## Test framework
- Unit: Vitest
- E2E: Playwright
- Coverage threshold: 85% on new code

## Property-based testing
property_based: optional
runner: fast-check
apply_when: pure functions, data transformations, API input validation

## Linter
ESLint + Prettier. Config in .eslintrc and .prettierrc.

## Build
`npm run build` must exit 0.
```

### Template: `python-fastapi/QUALITY.md`
```markdown
# Quality Standards

## Test framework
- Unit: pytest
- Integration: pytest + httpx
- Coverage threshold: 85% on new code

## Property-based testing
property_based: optional
runner: Hypothesis
apply_when: data models, parsing, business logic with numeric invariants

## Linter
ruff + mypy strict mode.

## Build
`python -m py_compile` on all changed files. Type check must pass.
```

### Template: `go-service/QUALITY.md`
```markdown
# Quality Standards

## Test framework
- Unit: go test
- Coverage threshold: 80% on new code

## Property-based testing
property_based: optional
runner: go built-in fuzzing (go test -fuzz)
apply_when: parsers, serializers, protocol handlers

## Linter
golangci-lint with default config.

## Build
`go build ./...` must exit 0.
```

### Template: `react-native/QUALITY.md`
```markdown
# Quality Standards

## Test framework
- Unit: Jest + React Native Testing Library
- Coverage threshold: 75% on new code

## Property-based testing
property_based: disabled

## Linter
ESLint + Prettier. Config in .eslintrc.

## Build
`npx expo export` must exit 0.
```

### Flow template: `flows/example-flow.md`
```markdown
# [Flow Name]
_Last updated: YYYY-MM-DD by task-[ID]_
_Covers: src/[module]/[file], src/[module]/[file2]_

## Purpose
One sentence describing what this execution path achieves.

## Entry points
- [HTTP method + path] → [function name]()
- [Event / trigger] → [handler]()

## Critical invariants
- [Property that must hold under all conditions]
- [Property that must hold under all conditions]

## Execution path
1. [Step one]
2. [Step two — note any atomicity requirements]
3. [Step three]

## Known edge cases
- [Edge case]: [how it is handled]

## What must NOT change without updating this flow
- [Specific thing that must not be refactored away]

## Dependencies
- Depends on: [other-flow.md]
- Depended on by: [other-flow.md]
```


## Phase 5 & 6 Control Specifications

> **The full wiring spec lives in [`docs/phase-5-6-control.md`](docs/phase-5-6-control.md).**  
> Read it before starting Phase 5. It contains the complete `ForgeState` definition, every node's responsibilities, every conditional edge as TypeScript, the graph assembly, and the prompt stability system.  
> Claude Code must implement exactly what is specified there. Any deviation requires a human flag before proceeding.

**Key decisions made in that doc (summarised here for quick reference):**

- No `merge_queue_node` in v1 — Workers open draft PRs, `pr_summary_node` posts merge order as a checklist, human merges manually. Automated merge is Phase 13.
- No revision router in v1 — any Sub-Judge failure routes directly to `human_escalation_node`. Partial re-queue is v2.
- High Court decides `merge | human_required | abort` only — no `revise` in v1.
- Prompt stability = CODEOWNERS + prompt test suite. No sha256 hashes, no semver tooling, no CHANGELOG scripts — those are v2.

---


### Phase 0 — Repository Bootstrap
**Acceptance criteria: repo exists, deps install, scripts run, Dolt server starts**

- [ ] Create monorepo with pnpm workspaces
- [ ] Add `packages/orchestrator`, `packages/agents`, `packages/gates`, `packages/dashboard`, `packages/webhook`, `packages/schemas`, `packages/templates`
- [ ] Add root `tsconfig.json` with strict mode
- [ ] Add `package.json` with workspace config
- [ ] Write `scripts/check-deps.sh` — verifies: `node >=22`, `python >=3.12`, `dolt`, `docker`, `git >=2.5`, prints clear install instructions for any missing dep
- [ ] Write `scripts/init-dolt.sh`:
  - Runs `dolt init` if database directory does not exist
  - Starts `dolt sql-server --host 0.0.0.0 --port 3306 --user root` as a background process
  - **Robust readiness poll** (CI environments can be flaky):
    ```bash
    MAX_ATTEMPTS=60  # 60 × 2s = 120s max wait (not 30s — CI can be slow)
    ATTEMPT=0
    until dolt sql -q "SELECT 1" > /dev/null 2>&1; do
      ATTEMPT=$((ATTEMPT + 1))
      if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
        echo "ERROR: Dolt did not start after ${MAX_ATTEMPTS} attempts. Check dolt sql-server logs."
        exit 1
      fi
      echo "Waiting for Dolt... attempt $ATTEMPT/$MAX_ATTEMPTS"
      sleep 2
    done
    ```
  - Runs `dolt/schema.sql`
  - Seeds pricing table from `forge.config.json`
  - **Common gotcha documented**: if `dolt sql-server` is already running, the script detects the PID and skips restart rather than failing
- [ ] Write `scripts/init-project.sh` — copies chosen template into target directory, creates `flow-registry.json` from template, installs git hook, prints next steps
- [ ] Write `scripts/post-commit-librarian.sh` — the Git post-commit hook:
  ```bash
  #!/bin/bash
  # Installed by init-project.sh into .git/hooks/post-commit
  # Triggers Librarian for local development workflows
  CHANGED_FILES=$(git diff-tree --no-commit-id -r --name-only HEAD)
  curl -s -X POST http://localhost:3001/local-commit \
    -H "Content-Type: application/json" \
    -d "{\"files\": $(echo "$CHANGED_FILES" | jq -R . | jq -s .), \"sha\": \"$(git rev-parse HEAD)\"}"
  ```
  The webhook server on port 3001 receives this and triggers the Librarian LangGraph node.  
  For CI/GitHub: configure a GitHub webhook pointing to the same `/github-webhook` endpoint with the `push` event. The webhook server verifies the HMAC-SHA256 signature before triggering.
- [ ] Write `packages/webhook/server.ts` — Express server:
  - `POST /github-webhook` — validates GitHub HMAC-SHA256 signature, extracts changed files from push payload, triggers Librarian node
  - `POST /local-commit` — no auth (localhost only), extracts changed files, triggers Librarian node
  - Both routes write trigger record to Dolt before returning 200
  - Starts on port `FORGE_WEBHOOK_PORT` (default 3001)
- [ ] Write `packages/webhook/verify.ts` — `verifyGitHubSignature(payload, signature, secret)` — returns boolean
- [ ] Add `.env.example` with all variables as specified above
- [ ] Add `README.md` with:
  - Setup instructions
  - **Dolt startup note**: "Dolt must be running before Forge. Run `scripts/init-dolt.sh` once on first setup. On subsequent runs, start with `dolt sql-server` in the `dolt/` directory. If you see `ECONNREFUSED 3306`, Dolt is not running."
  - **Laptop resource note**: "On machines with <16GB RAM, set `FORGE_MAX_PARALLEL_WORKERS=4` and `FORGE_WORKER_MEMORY_LIMIT=1g` in `.env`. 20 parallel workers require ~40GB peak RAM."
  - **GitHub webhook setup**: how to configure the webhook in GitHub settings pointing to the server URL
  - **Model name stability note**: "Model strings in `forge.config.json` use March 2026 API identifiers. When providers release stable versions (removing `-preview` suffixes), update the strings in config. No code changes required — models are config-only."
  - **Human escalation setup**: "Set `FORGE_ESCALATION_WEBHOOK_URL` in `.env` to receive `human_required` notifications in Slack, Teams, or Discord. Use an incoming webhook URL from your workspace. Without this, escalations log to stdout only — fine for solo development, not for teams."
- [ ] Add `.gitignore` covering: `.forge/`, `*.worktree`, `node_modules/`, `__pycache__/`, `.env`, `dolt/` (the data directory, not the scripts)
- [ ] Add `docker/worker.Dockerfile` — pin exact versions: `FROM node:22.x-slim` (not `latest`), install Python 3.12, no network access at runtime
- [ ] Add `docker/compose.yml` — Dolt server + dashboard + webhook services, with resource limits from `.env`

---

### Phase 1 — Dolt Client and Schema
**Acceptance criteria: can connect to Dolt, run all CRUD operations, schema validates**

- [ ] Install `mysql2` in orchestrator package (Dolt speaks MySQL protocol)
- [ ] Write `packages/orchestrator/src/dolt/client.ts` — connection pool, query wrapper, transaction helper
- [ ] Write `packages/orchestrator/src/dolt/schema.ts` — TypeScript types mirroring all Dolt tables
- [ ] Write `packages/orchestrator/src/dolt/queries.ts` — typed functions for every query the orchestrator needs:
  - `createTask`, `updateTaskStatus`, `getTask`, `getTasksByStatus`
  - `createCycle`, `updateCycle`, `getCycle`
  - `createStageRun`, `completeStageRun`, `getStageRunsForTask`
  - `createTouchMap`, `getTouchMap`, `checkTouchMapConflicts`
  - `createArtifact`, `getArtifact`
  - `logWork`, `getWorkLog`
  - `markFlowStale`, `getStaleFLows`, `getFlowsForFile`
  - `recordCycleCost`, `getCycleCosts`
- [ ] Write integration tests against real Dolt instance (use `scripts/init-dolt.sh` in test setup)
- [ ] All queries must use parameterised statements — no string interpolation

---

### Phase 2 — JSON Schema Validation
**Acceptance criteria: validator rejects invalid JSON, accepts valid JSON, used by all gates**

- [ ] Add `ajv` to orchestrator package
- [ ] Write `packages/orchestrator/src/gates/validator.ts` — loads schemas from `packages/schemas/`, validates JSON, returns typed result or structured error
- [ ] Complete all schema files:
  - `plan.schema.json` (as specified above)
  - `touch-map.schema.json`
  - `sub-judge-report.schema.json`
  - `property-test-report.schema.json`
  - `security-report.schema.json`
  - `high-court-report.schema.json`
  - `cycle-cost-report.schema.json`
- [ ] Unit tests for each schema: at least one valid fixture and two invalid fixtures per schema
- [ ] Validator must return field-level error messages, not just "invalid"

---

### Phase 2.5 — Prompt Stability System
**Acceptance criteria: CODEOWNERS file protects prompt directory, prompt test suite passes for all six roles, `loadPrompt()` is the only way nodes access prompts**

This phase must complete before Phase 6. It cannot be deferred.

The stability mechanism for v1 is simple: version control + PR review gate + automated test suite. No sha256 hashes, no semver tooling, no CHANGELOG scripts — see `docs/phase-5-6-control.md` for why those are v2.

- [ ] Add `CODEOWNERS` to repo root:
  ```
  packages/agents/ @<maintainer-github-username>
  ```
  Every PR touching a prompt file now requires a human reviewer. This is the primary drift prevention mechanism.

- [ ] Write `packages/orchestrator/src/prompts/loader.ts`:
  - `loadPrompt(role: PromptRole): string` — reads and returns the prompt file for the given role. This is the **only** way agent nodes may load prompts. Never `fs.readFileSync` directly in a node.
  - `PromptRole` type — union of all six role strings
  - Throws with a clear message if the file does not exist

- [ ] Write prompt test suite (`packages/agents/tests/`) — one file per role (6 total):
  - `planner.test.ts` — fixture repo + PRP → assert output is valid `plan.schema.json`
  - `worker.test.ts` — single-task plan → assert handoff exists, only declared files touched
  - `sub-judge.test.ts` — passing Worker branch → assert `status: pass`
  - `sub-judge-fail.test.ts` — branch with lint error → assert `status: fail`, location present
  - `high-court.test.ts` — 2 handoffs + passing sub-judge reports → assert `merge` decision
  - `librarian.test.ts` — 2 changed files → assert correct flows marked stale in Dolt
  - All tests use real model calls (cheapest configured models), `test/fixtures/nextjs-simple/` as fixture
  - A prompt test failure blocks merge — enforced in `.github/workflows/forge-ci.yml`

- [ ] Add prompt test run to `forge-ci.yml`: runs on any PR touching `packages/agents/`

---

### Phase 3 — Git Worktree Manager
**Acceptance criteria: can create, list, isolate, and destroy worktrees programmatically; Docker/worktree sync is reliable**

- [ ] Write `packages/orchestrator/src/worktree/manager.ts`:
  - `createWorktree(taskId, baseBranch)` — creates `.forge/worktrees/<taskId>/`, creates branch `forge/task/<taskId>`
  - `destroyWorktree(taskId)` — removes directory, prunes git reference
  - `listWorktrees()` — returns all active Forge worktrees
  - `getWorktreePath(taskId)` — returns absolute path
  - `setupEnvironment(taskId)` — **runs inside Docker, not on host**:
    - Checksums `package.json` / `requirements.txt` / `go.sum` / `go.mod` before setup (store in Dolt `stage_runs` row)
    - Runs install command inside the container: `docker run --rm -v <worktree>:/app forge-worker:latest npm ci`
    - Checksums same files after setup — if different, the Worker modified dependency files before doing any work (flag as anomaly, do not proceed)
    - Returns the container-internal paths for the orchestrator to use
  - `checkDependencyDrift(taskId)` — compares pre/post checksums from Dolt; called by Sub-Judge gate
- [ ] Write `packages/orchestrator/src/worktree/docker.ts`:
  - `runInDocker(taskId, command, opts)` — runs command inside Worker container:
    - Mounts worktree at `/app` (read-write)
    - Mounts context store at `/forge-context` (read-only)
    - `--network none` always
    - `--memory ${FORGE_WORKER_MEMORY_LIMIT}` from env
    - `--cpus ${FORGE_WORKER_CPU_LIMIT}` from env
    - Returns `{ exitCode, stdout, stderr, durationMs }`
  - `buildWorkerImage()` — builds `forge-worker:latest` from `docker/worker.Dockerfile`, fails loudly if build fails
  - `checkDockerResources()` — called at orchestrator startup: warns if `docker stats` shows available memory < `(max_parallel_workers × memory_limit) + 4GB buffer`
- [ ] Touch map conflict detection in `manager.ts`:
  - `checkWriteConflicts(touchMaps[])` — returns list of conflicting file paths across task write sets
- [ ] **Dependency drift test** — unit test that simulates a Worker modifying `package.json`, verifies `checkDependencyDrift` returns `true` and Sub-Judge gate catches it
- [ ] Unit tests using temp git repos (use `tmp` package)

---

### Phase 4 — Model Selector and Pricing
**Acceptance criteria: correct model selected based on LOC threshold, cost calculated correctly**

- [ ] Write `packages/orchestrator/src/models/selector.ts`:
  - `selectPlannerModel(repoPath)` — counts LOC + Flow count, returns model string
  - `selectWorkerModel(projectType)` — reads `forge.config.json`, returns appropriate model
  - `countLOC(repoPath)` — excludes `node_modules`, `.git`, binary files
- [ ] Write `packages/orchestrator/src/models/pricing.ts`:
  - `calculateCost(model, inputTokens, outputTokens)` — uses pricing table from `forge.config.json`
  - `formatCostReport(stageRuns[])` — produces `cycle-cost-report.schema.json` conformant object
- [ ] Unit tests with fixture repos of known sizes

---

### Phase 5 — LangGraph Orchestrator Graph
**Acceptance criteria: graph implements the exact wiring specification in `docs/phase-5-6-control.md` — every node, every conditional edge, every state field as specified. Any deviation requires a human flag before proceeding. The graph must match the wiring specification in `docs/phase-5-6-control.md` exactly; any deviation requires human flag before proceeding.**

- [ ] Install `@langchain/langgraph`, `@langchain/anthropic`, `@langchain/google-genai`, `concurrently`
- [ ] Write `packages/orchestrator/src/state.ts` — implement `ForgeState` exactly as defined in `docs/phase-5-6-control.md`. Copy the definition verbatim; do not abbreviate or restructure.
- [ ] Write `packages/orchestrator/src/graph.ts` — implement the graph assembly exactly as specified in `docs/phase-5-6-control.md`. Nodes: `planner_node`, `spawn_workers_node`, `worker_node` (map), `sub_judge_node` (map), `dependency_check_node`, `property_gate_node`, `high_court_node`, `pr_summary_node`, `cost_auditor_node`, `librarian_trigger_node`, `human_escalation_node`. No `merge_queue_node`. No revision router.
- [ ] Write `packages/orchestrator/src/pr-summary.ts`:
  - Reads `mergeOrder` and `workerPrUrls` from state
  - Creates a cycle summary PR (or GitHub issue comment on the main branch PR) listing Worker PRs as a numbered checklist in merge order
  - Format: "Forge cycle `<cycleId>` complete. Merge in this order:\n1. [ ] #<pr1> — task title\n2. [ ] #<pr2> — task title"
  - This replaces the merge queue entirely in v1 — humans merge, Forge tells them the order
- [ ] Implement all conditional routing functions as specified in `docs/phase-5-6-control.md` — copy verbatim, do not simplify
- [ ] Add LangGraph checkpointing (SQLite-backed locally)
- [ ] Write `packages/orchestrator/src/cli.ts`:
  - `forge start` — spins up orchestrator + webhook server via `concurrently`, writes PIDs to `.forge/pids`
  - `forge stop` — kills all Forge processes by PID
  - `forge run <prp-path>` — starts a new cycle
  - `forge status` — shows active cycles from Dolt
  - `forge kill <task-id>` — terminates a worker
  - `forge resume <cycle-id>` — resumes after `human_escalation_node` interrupt
  - `forge cancel <cycle-id>` — cancels a halted cycle
  - `forge cost <cycle-id>` — shows cost report
  - `forge logs <task-id>` — tails work_logs from Dolt
- [ ] Integration test: run full graph with mocked agent calls, assert every state transition matches the spec
- [ ] Integration test: mocked High Court returns `merge` → assert `pr_summary_node` fires and posts checklist, assert no git merge is attempted

---

### Phase 6 — Agent Node Implementations
**Acceptance criteria: each node calls the correct model via `loadPrompt()` (never direct file reads), injects correct context, validates output against schema, writes to Dolt. Phase 2.5 must be complete before this phase starts.**

For each agent node, the pattern is:
1. Load context files from project directory (CLAUDE.md, SECURITY.md, etc.)
2. Load task state from Dolt
3. Load relevant Flow documents
4. Build system prompt from `packages/agents/<role>.md`
5. Call model API
6. Validate response against schema
7. Write artifact to disk + Dolt
8. Update Dolt stage_run with outcome

- [ ] `packages/orchestrator/src/nodes/planner.ts`
  - Uses `selectPlannerModel()` to choose model
  - Injects: CLAUDE.md, ARCHITECTURE.md, all Flows referenced in task, current codebase structure summary (file tree + LOC counts, not file contents — agent pulls specific files as needed)
  - Validates output against `plan.schema.json`
  - **PLAN_AMBIGUOUS handling (must be robust — this is a sharp edge)**:
    - `PLAN_AMBIGUOUS` is a first-class expected outcome, not an error
    - On `PLAN_AMBIGUOUS`: update Dolt task `status = 'blocked'`, write the question to `work_logs`, emit `human_escalation` event with the question prominently displayed
    - Retry on schema validation failure: inject the exact AJV validation error back into the next Planner prompt with the text "Your previous plan.json failed validation with this error: <error>. Correct it and try again."
    - Max retries: `max_planner_retries` from config (default: 3)
    - After max retries: status = `'failed'`, write all attempts to Dolt for debugging, escalate to human
    - **Never silently produce a partial plan** — if the Planner is uncertain about even one task's touch map, it must emit `PLAN_AMBIGUOUS` for that specific task rather than guessing

- [ ] `packages/orchestrator/src/nodes/worker.ts`
  - Creates worktree via `manager.ts`
  - Spins Docker container via `docker.ts`
  - Injects: worker.md prompt, task from Dolt, touch map, relevant Flows, SECURITY.md, QUALITY.md
  - Monitors work_logs (agent writes these as it works)
  - On PLAN_GAP: update Dolt, route back to Planner
  - On completion: collect handoff markdown, record artifact

- [ ] `packages/orchestrator/src/nodes/sub-judge.ts`
  - Reads Worker's branch (read-only checkout)
  - Reads QUALITY.md to determine property_based setting
  - Runs actual linter/test commands in Docker (`runInDocker`)
  - Validates: `sub-judge-report.schema.json`
  - Records token usage for cost auditor

- [ ] `packages/orchestrator/src/nodes/high-court.ts`
  - **Handoff-first strategy (sharp edge mitigation)**:
    - Primary input: Worker handoff markdown files (`.forge/handoffs/<task_id>.md`), not raw code diffs
    - The High Court reads handoffs for ALL workers first, then reads raw code only when:
      a) A Sub-Judge has `escalate_to_high_court: true`
      b) An architectural invariant cannot be verified from the handoff text alone
      c) A security-related item appears in any handoff's "concerns" section
    - This keeps High Court prompt size manageable at scale (20 handoffs × ~500 tokens each = 10k tokens vs 20 diffs × ~5k tokens = 100k tokens)
  - Reads all Sub-Judge reports from Dolt artifacts — checks `escalate_to_high_court` flag
  - Reads ARCHITECTURE.md, SECURITY.md
  - Validates: `high-court-report.schema.json`
  - On `human_required`: writes escalation record to Dolt with full context, sends notification (webhook to `FORGE_ESCALATION_WEBHOOK_URL` if set, otherwise stdout with clear formatting)
  - Records token usage for cost auditor

- [ ] `packages/orchestrator/src/nodes/cost-auditor.ts`
  - Reads all stage_runs for cycle from Dolt
  - Calculates via `pricing.ts`
  - Writes to `cycle_costs` table
  - Validates: `cycle-cost-report.schema.json`

- [ ] `packages/orchestrator/src/nodes/librarian.ts`
  - Triggered asynchronously via webhook (does not block cycle completion)
  - Trigger sources:
    1. `packages/webhook/server.ts` POST `/github-webhook` — from GitHub `push` event
    2. `packages/webhook/server.ts` POST `/local-commit` — from `scripts/post-commit-librarian.sh` Git hook
  - Both trigger paths call the same Librarian LangGraph node with `{ files: string[], sha: string }`
  - Reads flow-registry.json + Dolt flow_file_refs
  - Implements individual vs batch mode based on `batch_threshold` in config
  - Creates PR branches for Flow updates
  - **Webhook server must be running** for the Librarian to be triggered. Document in README: "Start `pnpm --filter webhook start` alongside the orchestrator for local development. In CI, configure the GitHub webhook in repository settings."

---

### Phase 7 — Gate Implementations
**Acceptance criteria: each gate is fully mechanical (no AI), correct pass/fail/route decisions**

- [ ] `packages/orchestrator/src/gates/plan-gate.ts`
  - Validates plan JSON against schema
  - Checks all referenced files exist on disk
  - Runs `checkWriteConflicts()` on all task touch maps
  - Returns: `pass` | `fail` (with field-level error) | `ambiguous`

- [ ] `packages/orchestrator/src/gates/sub-judge-gate.ts`
  - Reads all Sub-Judge reports for cycle
  - Runs `checkDependencyDrift(taskId)` for each Worker — if true, treat as touch map violation (fail)
  - If any `status: fail` → route failed Workers to revision (not all Workers)
  - If any `escalate_to_high_court: true` → pass escalation flag to High Court
  - If all `status: pass` → proceed to property gate

- [ ] `packages/orchestrator/src/gates/property-gate.ts`
  - Reads QUALITY.md `property_based` field
  - `disabled`: immediately return `skipped`
  - `optional`: check if Worker wrote property tests; if absent, return `warn` (not fail)
  - `required`: check if Worker wrote property tests; if absent, return `fail`
  - Runs property tests in Docker if present; returns `pass`/`fail` with output

- [ ] `packages/gates/flow_freshness.py`
  - Called by CI (GitHub Actions) on every PR
  - Reads git diff of PR (files changed)
  - Reads `flow-registry.json` and matches against `flow_file_refs`
  - If any matching Flow has `stale: true` in Dolt → exit 1 (block merge)
  - If stale Flows exist but none match changed files → exit 0 (not blocking)
  - Prints clear summary of which Flows are stale and why

- [ ] `packages/orchestrator/src/gates/high-court-gate.ts`
  - Reads High Court report (`high-court-report.schema.json`)
  - Routes based on `decision` field:
    - `merge` → triggers `pr_summary_node` (posts merge order checklist, no automated git merge)
    - `human_required` → halts cycle, writes escalation to Dolt, triggers webhook
    - `abort` → records final status to Dolt, proceeds to cost auditor
  - Note: `revise` is not a valid decision in v1 — High Court reports that need revision should emit `human_required` instead

---

### Phase 8 — Dashboard
**Acceptance criteria: dashboard runs locally, shows real data from Dolt, kill/retry work**

- [ ] Install Streamlit in `packages/dashboard/`
- [ ] `packages/dashboard/app.py` — main entry, sidebar navigation
- [ ] `packages/dashboard/pages/task_board.py`
  - Live table of all tasks with status, stage, model, retry count
  - Filter by: status, cycle, layer
  - Action buttons: Kill Worker (calls `forge kill`), Retry Stage (calls `forge retry`)
  - Auto-refresh every 10 seconds
- [ ] `packages/dashboard/pages/audit_trail.py`
  - Timeline view of all stage_runs for a selected cycle
  - Click any stage_run → shows artifact JSON
  - Shows work_log entries for Workers
- [ ] `packages/dashboard/pages/cost_tracker.py`
  - Cost per cycle bar chart (last 20 cycles)
  - Cost breakdown by role/model for selected cycle
  - Running total for current cycle (updates live)
  - Warning banner if cycle exceeds `max_cycle_cost_usd`
- [ ] Dashboard reads from Dolt via MySQL connection (same client as orchestrator)
- [ ] `packages/dashboard/requirements.txt`: streamlit, pandas, sqlalchemy, pymysql

---

### Phase 9 — CI Integration
**Acceptance criteria: GitHub Actions blocks stale Flow PRs, runs Forge gates**

- [ ] `.github/workflows/flow-freshness.yml`
  ```yaml
  name: Flow Freshness
  on: [pull_request]
  jobs:
    check-flows:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - name: Install Forge gates
          run: pip install -r packages/gates/requirements.txt
        - name: Check Flow freshness
          run: python packages/gates/flow_freshness.py
          env:
            DOLT_HOST: ${{ secrets.DOLT_HOST }}
            DOLT_PORT: ${{ secrets.DOLT_PORT }}
            DOLT_DATABASE: forge
  ```

- [ ] `.github/workflows/forge-ci.yml`
  - Runs on PRs created by `forge/task/*` branches (Worker PRs)
  - Runs: linter, unit tests, schema validation on Worker artifacts
  - Does NOT run Sub-Judge or High Court (those run in the Forge pipeline, not CI)
  - Posts status check that High Court reads

---

### Phase 10 — Context Templates
**Acceptance criteria: each template produces a valid project scaffold via `init-project.sh`**

Complete all four stack templates with real, stack-appropriate content:

- [ ] `templates/nextjs-postgres/`
  - CLAUDE.md: Next.js 14 App Router conventions, TypeScript strict, Prisma ORM patterns, no `any`, server components by default
  - ARCHITECTURE.md: API routes in `/app/api/`, DB access only in server components or API routes, no client-side DB calls
  - SECURITY.md: No SQL string concatenation (use Prisma), validate all inputs with Zod, no `dangerouslySetInnerHTML`, OWASP top 10
  - QUALITY.md: `property_based: optional`, Vitest, Playwright, 85% coverage
  - Example Flow: user authentication flow

- [ ] `templates/python-fastapi/`
  - CLAUDE.md: FastAPI patterns, Pydantic models for all I/O, async everywhere, SQLAlchemy 2.0
  - ARCHITECTURE.md: Routers in `/routers/`, services in `/services/`, models in `/models/`, no business logic in routers
  - SECURITY.md: Parameterised queries only, Pydantic validation on all inputs, JWT expiry enforced, rate limiting on auth endpoints
  - QUALITY.md: `property_based: optional`, pytest, httpx, Hypothesis for data models, 85% coverage
  - Example Flow: request authentication flow

- [ ] `templates/react-native/`
  - CLAUDE.md: Expo SDK conventions, TypeScript, React Navigation, no class components, hooks only
  - ARCHITECTURE.md: Screens in `/screens/`, components in `/components/`, state in Zustand stores, API calls in `/services/`
  - SECURITY.md: No sensitive data in AsyncStorage unencrypted, expo-secure-store for secrets, validate all API responses
  - QUALITY.md: `property_based: disabled`, Jest + RNTL, 75% coverage
  - Example Flow: screen navigation flow

- [ ] `templates/go-service/`
  - CLAUDE.md: Standard library first, interfaces over concrete types, errors as values, context propagation throughout
  - ARCHITECTURE.md: Handlers in `/internal/handler/`, services in `/internal/service/`, repository in `/internal/repository/`
  - SECURITY.md: Parameterised queries, input validation on all handler inputs, no `fmt.Sprintf` in SQL, secrets from env only
  - QUALITY.md: `property_based: optional`, go test, go built-in fuzzing for parsers, 80% coverage
  - Example Flow: HTTP request handling flow

---

### Phase 11 — End-to-End Test
**Acceptance criteria: Forge completes a real cycle on a real project, produces a mergeable PR**

- [ ] Create a test project in `test/fixtures/nextjs-simple/` — a minimal Next.js app with 3 routes and a Postgres schema
- [ ] Write `test/e2e/full-cycle.test.ts`:
  - Init Dolt with schema
  - Start webhook server on test port
  - Run `forge run test/fixtures/nextjs-simple/PRPs/add-user-endpoint.md`
  - Assert: cycle completes, PR is opened, all gates pass, cost report in Dolt, no Flow freshness errors
  - Assert: Worker only wrote files in its declared touch map
  - Assert: High Court decision is `merge` or `human_required` (not `abort`)
  - Assert: High Court made decision from handoff files, not raw diffs (verify via token count in stage_run — should be < 20k tokens for 3 Workers)
- [ ] Write `test/e2e/dependency-drift.test.ts`:
  - Run a Worker that modifies `package.json` (outside its touch map)
  - Assert: Sub-Judge gate catches the dependency drift
  - Assert: task is routed to revision, not merged
- [ ] Write `test/e2e/librarian-trigger.test.ts`:
  - Make a commit to a file covered by a Flow
  - POST to webhook server `/local-commit`
  - Assert: Dolt marks the Flow as stale
  - Assert: Librarian creates a PR branch with a Flow update proposal
- [ ] Write `test/e2e/plan-ambiguous.test.ts`:
  - Give the Planner a deliberately ambiguous task (no referenced files exist)
  - Assert: Planner emits `PLAN_AMBIGUOUS` rather than a malformed plan
  - Assert: Dolt task status is `blocked`, not `failed`
  - Assert: human escalation event is emitted with the Planner's specific question
- [ ] Write the fixture PRP: `test/fixtures/nextjs-simple/PRPs/add-user-endpoint.md` — add a POST `/api/users` endpoint with Zod validation and Prisma insert

---

### Phase 12 — Documentation
**Acceptance criteria: a new developer can set up and run Forge from README alone**

- [ ] `README.md` — setup, first run, config reference, architecture overview diagram
- [ ] `docs/agent-roles.md` — detailed description of each agent role with examples
- [ ] `docs/context-engineering.md` — how to write CLAUDE.md, SECURITY.md, QUALITY.md, Flows for a new project
- [ ] `docs/gates.md` — how each gate works, what it checks, how to debug a gate failure
- [ ] `docs/adding-a-template.md` — how to add a new stack template
- [ ] `docs/dolt-schema.md` — Dolt schema reference with query examples
- [ ] `docs/roadmap.md` — Phase 13 stretch goals: production-grade merge queue (PR queue with re-testing after each merge), multi-repo support, remote worker execution via SSH, Forge-as-a-service API

---

## Definition of Done

The system is complete when:

1. `scripts/check-deps.sh` passes on a clean machine
2. `scripts/init-dolt.sh` sets up the database from scratch
3. `forge init --template nextjs-postgres /path/to/project` scaffolds a complete context store
4. `forge run /path/to/prp.md` completes a full cycle with no manual intervention
5. The dashboard shows live task state, audit trail, and cost
6. A PR from a Worker branch passes the `flow-freshness` CI check
7. All unit and integration tests pass (`pnpm test`)
8. A colleague unfamiliar with Forge can set it up using only the README

---

## What Forge Is Not

- Not a replacement for human architecture decisions — the Planner proposes, humans approve the context files
- Not a guarantee of correctness — it enforces your standards consistently at scale
- Not a vibe coding tool — Workers cannot improvise, they stop and escalate when the plan has gaps
- Not locked to any model provider — swap models in `forge.config.json` without touching agent prompts

---

## Notes for Claude Code

- Work through phases sequentially. Do not start Phase 6 before Phase 5 acceptance criteria pass.
- If a phase is ambiguous, ask before implementing — do not guess.
- The agent prompts in `packages/agents/` are first-class artefacts. Do not modify them without flagging it.
- All secrets (API keys, Dolt credentials) come from environment variables. Never hardcode. Use `.env.example` as the reference.
- The orchestrator must work without the dashboard running. The dashboard is a read-only view.
- The webhook server is a separate process from the orchestrator. Both must be running for the full system to work locally.
- When in doubt about domain examples: use Next.js + Postgres. It is the reference stack.
- Do not add Solidity, Cairo, or any blockchain-specific tooling unless it appears in a future template PR.
- **Phase 5 and Phase 6 are the Valley of Death.** If blocked on the LangGraph graph wiring or agent node implementation, stop and ask — do not patch around errors.
- **Planner PLAN_AMBIGUOUS is not a failure.** It is the system working correctly. Treat it as a first-class success case in tests and logging.
- **High Court reads handoffs first, code second.** This is not an optimisation — it is the architectural decision that makes the system viable at scale. Do not change this without flagging it.
- **Docker installs dependencies, not the host.** `setupEnvironment()` must run inside the container. If you find yourself running `npm install` on the host into a worktree directory, that is a bug.
