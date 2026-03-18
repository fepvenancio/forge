# Agent Roles

Forge uses five agent roles plus a cost auditor, each with distinct authority and constraints.

## Planner

**Purpose:** Decomposes tasks, produces touch maps, never writes code.

**Authority:**
- Read any file in the repository
- Write tasks to Dolt
- Spawn sub-planners for subsystems

**Constraints:**
- Never writes code
- Never modifies source files
- Never merges branches
- Must emit PLAN_AMBIGUOUS when uncertain (never guess)

**Output:** `plan.schema.json` — task list with touch maps, acceptance criteria, dependencies

**Model:** Auto-selected by LOC threshold (Claude Opus < 400K LOC, Gemini Pro above)

### PLAN_AMBIGUOUS

This is a **first-class success case**, not an error. When the Planner is uncertain about scope, it emits PLAN_AMBIGUOUS with a specific question. The orchestrator routes this to human escalation with the question displayed prominently. The human answers, and the Planner re-runs with the answer injected.

---

## Worker

**Purpose:** Implements code changes within a scoped touch map.

**Authority:**
- Read/write files listed in touch_map
- Run tests, linters, build commands
- Commit to assigned branch
- Open a draft PR

**Constraints:**
- Never reads/writes files outside touch map
- Never makes architecture decisions (emits PLAN_GAP instead)
- Never deploys or calls external APIs
- Never modifies CLAUDE.md, SECURITY.md, ARCHITECTURE.md, or Flow documents

**Output:** Handoff document at `.forge/handoffs/<task_id>.md`

**Isolation:** Git worktree + Docker container (--network none)

---

## Sub-Judge

**Purpose:** Mechanical quality checks on Worker output.

**Authority:**
- Read Worker's branch (read-only)
- Write Sub-Judge report

**Constraints:**
- Never modifies code
- Never approves/rejects PRs
- Never communicates with Workers

**Checks (in order):**
1. Syntax
2. Linting
3. Build
4. Unit tests
5. Coverage
6. Schema conformance
7. Touch map compliance
8. Property tests (if enabled)

**Output:** `sub-judge-report.schema.json`

---

## High Court Judge

**Purpose:** Architectural review across all Workers in a cycle.

**Authority:**
- Read all Worker branches and handoffs
- Read all Sub-Judge reports
- Read ARCHITECTURE.md, SECURITY.md, QUALITY.md
- Decide: merge | human_required | abort

**Constraints:**
- Never writes code
- Fires once per cycle, not per Worker
- No "revise" decision in v1

**Strategy:** Handoff-first — reads handoff markdown files as primary input, only reads raw code when:
- A Sub-Judge escalated
- An invariant can't be verified from handoffs alone
- A security concern appears in handoff "concerns" section

**Output:** `high-court-report.schema.json` with merge_order

---

## Librarian

**Purpose:** Keeps Flow documents fresh after commits.

**Trigger:** Git commits (via webhook or post-commit hook)

**Modes:**
- **Individual** (≤10 stale flows): One PR per flow
- **Batch** (>10 stale flows): Single PR with priority-ordered updates

**Priority formula:** `(modified_files × 3) + criticality_value`

Critical flow safeguard: flows with `criticality=critical` must appear in positions 1-3 regardless of file count.

**Output:** PR branches with updated Flow documents

---

## Cost Auditor

**Purpose:** Post-cycle cost calculation and reporting.

**Runs:** After every cycle completes (merge, abort, or halt).

**Output:** `cycle-cost-report.schema.json` with per-stage breakdown
