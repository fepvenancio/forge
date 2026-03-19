---
phase: 04-team-dashboard-and-cost-tracking
verified: 2026-03-19T03:12:00Z
status: human_needed
score: 10/11 must-haves verified
human_verification:
  - test: "Launch Streamlit dashboard with 'forge dashboard' and navigate to all five new pages"
    expected: "Phase Map, PR Status, Merge Order, File Locks, and Team Costs pages all render correctly; empty-state messages appear when Dolt has no data; stopping Dolt and refreshing shows error messages rather than crashes"
    why_human: "Visual rendering, browser navigation, and graceful degradation on Dolt unavailability cannot be verified by grep or vitest"
---

# Phase 4: Team Dashboard and Cost Tracking Verification Report

**Phase Goal:** The team has full visibility into phase ownership, PR status, merge order, file locks, and per-developer/per-phase costs through a Streamlit dashboard and CLI reports
**Verified:** 2026-03-19T03:12:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer costs can be recorded in Dolt with model, tokens, USD, and phase | VERIFIED | `recordDeveloperCost` in queries.ts (line 608); INSERT INTO developer_costs confirmed |
| 2 | `forge cost --team` shows team-wide cost summary grouped by developer and phase | VERIFIED | `costCommands` in cost.ts handles `opts.team` path, calls `getTeamCostSummary()`, renders cli-table3; test passes |
| 3 | `forge cost --dev <name>` shows costs for a specific developer | VERIFIED | cost.ts `opts.dev` path calls `getDeveloperCosts(name)`; test passes |
| 4 | `forge cost record` records a cost entry via CLI | VERIFIED | `cost:record` subcommand registered and calls `recordDeveloperCost`; test confirms command registered |
| 5 | `forge cost --pr` shows costs correlated with PR numbers | VERIFIED | cost.ts `opts.pr` path calls `getCostsByPR()` which JOINs phase_assignments; test passes |
| 6 | Budget alert displays when phase cost exceeds FORGE_PHASE_BUDGET_USD threshold | VERIFIED | `checkBudgetAlerts()` reads env var, calls `getPhaseTotalCost` per phase, prints WARNING; test passes |
| 7 | `forge dashboard` launches Streamlit on configurable port | VERIFIED | dashboard.ts spawns `streamlit run app.py --server.port <port>`; test confirms correct args |
| 8 | Dashboard shows phase ownership table with developer names and status | VERIFIED | phase_map.py queries `phase_assignments JOIN developers`, shows metric cards (Total, Active, PRs Open, Merged), `st.dataframe`; parses OK |
| 9 | Dashboard shows PR status for all phase branches with links | VERIFIED | pr_status.py queries `phase_assignments WHERE pr_number IS NOT NULL`; shows `st.info("No open PRs found")` when empty; parses OK |
| 10 | Dashboard shows merge order recommendation using Kahn's algorithm | VERIFIED | merge_order.py contains `def compute_merge_order` (~50 lines, BFS topological sort); queries active phases; parses OK |
| 11 | Dashboard shows file lock map with owner and phase info | VERIFIED | file_locks.py queries `file_locks JOIN developers`; shows lock count metric; `st.info("No active file locks.")` when empty; parses OK |
| 12 | Dashboard shows cost per developer and per phase with charts | VERIFIED | team_costs.py queries developer_costs three ways (summary, by-dev, by-phase); renders `st.bar_chart` and `st.metric`; parses OK |
| 13 | All dashboard pages handle missing Dolt connection gracefully | VERIFIED (automated) / ? HUMAN for visual | All pages wrap queries in try/except with `st.error()` fallback; visual confirmation needed |
| 14 | Legacy `forge cost <cycle-id>` still works for backward compatibility | VERIFIED | cost.ts checks `if (cycleId && !opts.team && !opts.dev && !opts.pr)` and calls `getCycleCosts(cycleId)`; test passes |

**Score:** 13/14 truths fully automated-verified (1 needs human visual confirmation)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/unit/dolt/cost-queries.test.ts` | Cost query test stubs, then real tests | VERIFIED | 7 passing tests (no `it.todo` remaining); all 6 functions tested |
| `test/unit/commands/cost.test.ts` | Cost CLI command tests | VERIFIED | 7 passing tests (no `it.todo` remaining) |
| `test/unit/commands/dashboard.test.ts` | Dashboard CLI command tests | VERIFIED | 4 passing tests (no `it.todo` remaining) |
| `packages/orchestrator/src/dolt/queries.ts` | 6 developer cost CRUD functions | VERIFIED | Lines 608-684 contain all 6 exported functions; `getCostsByPR` present |
| `packages/orchestrator/src/commands/cost.ts` | `costCommands` export with --pr flag | VERIFIED | Exports `costCommands`; `--pr` flag wired to `getCostsByPR`; `cost:record` registered |
| `packages/orchestrator/src/commands/dashboard.ts` | `dashboardCommands` export | VERIFIED | Exports `dashboardCommands`; spawns streamlit with `--server.port` |
| `packages/orchestrator/src/cli.ts` | Updated wiring with costCommands + dashboardCommands | VERIFIED | Lines 16-17 import both; lines 34-35 register both; legacy inline cost command absent |
| `packages/dashboard/app.py` | Updated with v2 branding and navigation | VERIFIED | "Team Coordination Layer" subtitle; lists all 8 views; Dolt connection check preserved |
| `packages/dashboard/pages/phase_map.py` | Phase ownership view | VERIFIED | Queries `phase_assignments`; metric cards; epoch ms conversion (`/ 1000`); parses OK |
| `packages/dashboard/pages/pr_status.py` | PR status view | VERIFIED | Queries `pr_number IS NOT NULL`; empty-state message; parses OK |
| `packages/dashboard/pages/merge_order.py` | Merge order with Kahn's algorithm | VERIFIED | `def compute_merge_order` present; BFS queue; touch map inferred edges; parses OK |
| `packages/dashboard/pages/file_locks.py` | File lock map | VERIFIED | Queries `file_locks`; epoch ms conversion; lock count metric; parses OK |
| `packages/dashboard/pages/team_costs.py` | Team cost view with budget alerts | VERIFIED | Queries `developer_costs`; bar charts; `FORGE_PHASE_BUDGET_USD` budget alert; parses OK |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/orchestrator/src/commands/cost.ts` | `packages/orchestrator/src/dolt/queries.ts` | `import * as queries` | WIRED | Line 3 imports queries; calls `getCostsByPR`, `getTeamCostSummary`, `getDeveloperCosts`, `recordDeveloperCost`, `getPhaseTotalCost` all used in action handlers |
| `packages/orchestrator/src/cli.ts` | `packages/orchestrator/src/commands/cost.ts` | `import { costCommands }` | WIRED | Line 16 imports; line 34 calls `costCommands(program)` |
| `packages/orchestrator/src/cli.ts` | `packages/orchestrator/src/commands/dashboard.ts` | `import { dashboardCommands }` | WIRED | Line 17 imports; line 35 calls `dashboardCommands(program)` |
| `packages/dashboard/pages/phase_map.py` | Dolt `phase_assignments` table | `pymysql SELECT` | WIRED | Query string contains `FROM phase_assignments pa LEFT JOIN developers d` |
| `packages/dashboard/pages/team_costs.py` | Dolt `developer_costs` table | `pymysql SELECT` | WIRED | Three queries all reference `FROM developer_costs` |
| `packages/dashboard/pages/merge_order.py` | Kahn's algorithm | `def compute_merge_order` | WIRED | Function defined at line 25; called at line 147 with phase_nodes |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DASH-01 | 04-02-PLAN | Dashboard shows phase ownership | SATISFIED | `packages/dashboard/pages/phase_map.py` — queries phase_assignments, displays developer + status |
| DASH-02 | 04-02-PLAN | Dashboard shows PR status for all phase branches | SATISFIED | `packages/dashboard/pages/pr_status.py` — filters by `pr_number IS NOT NULL` |
| DASH-03 | 04-02-PLAN | Dashboard shows merge order recommendation | SATISFIED | `packages/dashboard/pages/merge_order.py` — Python Kahn's algorithm implemented |
| DASH-04 | 04-02-PLAN | Dashboard shows file lock map | SATISFIED | `packages/dashboard/pages/file_locks.py` — queries file_locks table |
| DASH-05 | 04-02-PLAN | Dashboard shows cost per developer and per phase | SATISFIED | `packages/dashboard/pages/team_costs.py` — bar charts + detailed table |
| DASH-06 | 04-00-PLAN, 04-01-PLAN | `forge dashboard` launches Streamlit | SATISFIED | `packages/orchestrator/src/commands/dashboard.ts` — spawns streamlit; wired into cli.ts |
| COST-01 | 04-00-PLAN, 04-01-PLAN | Developer costs recorded in Dolt: model, tokens, USD, phase | SATISFIED | `recordDeveloperCost` in queries.ts inserts all required fields |
| COST-02 | 04-00-PLAN, 04-01-PLAN | `forge cost` with --team and --dev flags | SATISFIED | cost.ts handles both flags with table output |
| COST-03 | 04-00-PLAN, 04-01-PLAN | Cost-per-PR analysis via `--pr` flag | SATISFIED | cost.ts `--pr` path calls `getCostsByPR()` with phase_assignments JOIN |
| COST-04 | 04-00-PLAN, 04-01-PLAN | Budget alerts when phase cost exceeds threshold | SATISFIED | `checkBudgetAlerts()` reads FORGE_PHASE_BUDGET_USD; WARNING output confirmed in test |
| COST-05 | 04-02-PLAN | Cost data displayed in team dashboard | SATISFIED | `packages/dashboard/pages/team_costs.py` — full cost visualization |

All 11 requirement IDs from REQUIREMENTS.md are satisfied. No orphaned requirements detected.

---

### Anti-Patterns Found

None detected. Scan of all modified files returned:
- Zero `TODO`, `FIXME`, `PLACEHOLDER` comments across TypeScript command files and Python dashboard pages
- Zero `return null` / `return {}` / `return []` stubs in command implementations
- Zero `it.todo` stubs remaining in test files (was 17 initially, now 0)
- All action handlers contain real logic (not `console.log`-only stubs)

---

### Human Verification Required

#### 1. Visual Dashboard Rendering

**Test:** Start Dolt (`scripts/init-dolt.sh`), run `cd packages/dashboard && streamlit run app.py` (or `forge dashboard`), then navigate through all sidebar pages.
**Expected:**
- Landing page shows "Team Coordination Layer" subtitle and lists all 8 views
- Phase Map: shows table with metric cards (Total Phases, Active, PRs Open, Merged) — or "No phase assignments found" info message
- PR Status: shows table or "No open PRs found" info message
- Merge Order: shows numbered recommended merge order, or "No active phases found" info message
- File Locks: shows lock count metric and table, or "No active file locks" info message
- Team Costs: shows bar charts and summary table, or "No cost data recorded yet" info message

**Why human:** Streamlit page rendering, sidebar navigation, chart display, and metric card layout require a browser to verify.

#### 2. Graceful Degradation When Dolt Is Down

**Test:** Stop Dolt, then refresh each dashboard page.
**Expected:** Each page shows an `st.error(...)` message (e.g., "Error loading phase assignments: ...") rather than an unhandled exception traceback.
**Why human:** Connection failure behavior in Streamlit requires runtime verification; the try/except structure is present in code but visual output must be confirmed.

#### 3. `forge cost:record` End-to-End Write

**Test:** With Dolt running, run `forge cost:record --dev alice --phase 1 --model claude-sonnet --input 1000 --output 500 --cost 0.0250`, then run `forge cost --dev alice`.
**Expected:** Record confirmation printed; subsequent `forge cost --dev alice` shows the recorded entry in a table.
**Why human:** Requires a live Dolt instance with the developer_costs table populated; end-to-end write-then-read flow.

---

### Summary

Phase 4 goal achievement is strong. All 11 requirements (DASH-01 through DASH-06, COST-01 through COST-05) have corresponding implementation. The TypeScript data layer and CLI commands are fully implemented and all 18 tests pass (0 failures, 0 skipped todos). The five Streamlit dashboard pages and updated app.py are syntactically valid Python and follow the established self-contained `get_connection()` pattern with try/except error handling. Key links from CLI to data layer to cli.ts registration are all wired.

The only remaining gap is visual confirmation that the Streamlit pages render correctly in a browser and degrade gracefully when Dolt is unreachable — this cannot be determined by static analysis.

---

_Verified: 2026-03-19T03:12:00Z_
_Verifier: Claude (gsd-verifier)_
