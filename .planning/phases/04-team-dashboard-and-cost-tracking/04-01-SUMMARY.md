---
phase: 04-team-dashboard-and-cost-tracking
plan: 01
subsystem: api
tags: [dolt, cli, cost-tracking, streamlit, cli-table3]

requires:
  - phase: 04-team-dashboard-and-cost-tracking
    provides: "Dolt schema with developer_costs table, DeveloperCost type"
provides:
  - "6 developer cost query functions (recordDeveloperCost, getDeveloperCosts, getPhaseCosts, getTeamCostSummary, getPhaseTotalCost, getCostsByPR)"
  - "forge cost CLI command with --team, --dev, --pr flags and cost:record subcommand"
  - "forge dashboard CLI command launching Streamlit"
  - "Budget alerts when FORGE_PHASE_BUDGET_USD exceeded"
affects: [dashboard, cost-tracking]

tech-stack:
  added: []
  patterns:
    - "Budget alert pattern: check env var threshold after displaying cost data"
    - "CLI subcommand pattern: cost:record as separate commander command"

key-files:
  created:
    - packages/orchestrator/src/commands/cost.ts
    - packages/orchestrator/src/commands/dashboard.ts
  modified:
    - packages/orchestrator/src/dolt/queries.ts
    - packages/orchestrator/src/cli.ts
    - test/unit/dolt/cost-queries.test.ts
    - test/unit/commands/cost.test.ts
    - test/unit/commands/dashboard.test.ts

key-decisions:
  - "cost:record as separate commander command (not subcommand) due to commander API"
  - "Legacy cycle-id cost display preserved via argument detection in cost command action"
  - "Budget alerts check per unique phase_id after any cost display"

patterns-established:
  - "Cost query pattern: typed return arrays with RowDataPacket casts"
  - "Budget alert pattern: env-driven threshold with per-phase checking"

requirements-completed: [COST-01, COST-02, COST-03, COST-04, DASH-06]

duration: 3min
completed: 2026-03-19
---

# Phase 04 Plan 01: Cost Tracking & Dashboard CLI Summary

**Developer cost CRUD queries with team/dev/PR views, budget alerts, and Streamlit dashboard launcher**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T03:03:52Z
- **Completed:** 2026-03-19T03:07:01Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- 6 developer cost query functions in queries.ts including getCostsByPR with phase_assignments JOIN
- forge cost command supporting --team, --dev, --pr flags plus legacy cycle-id backward compatibility
- Budget alert system triggered when FORGE_PHASE_BUDGET_USD env var exceeded
- forge dashboard command spawning Streamlit on configurable port
- 18 tests passing across 3 test files (TDD red-green)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add developer cost query functions to queries.ts** - `36b8826` (feat)
2. **Task 2: Create cost and dashboard CLI commands, wire into cli.ts** - `1cf4884` (feat)

## Files Created/Modified
- `packages/orchestrator/src/dolt/queries.ts` - 6 new developer cost query functions
- `packages/orchestrator/src/commands/cost.ts` - forge cost CLI with --team/--dev/--pr and cost:record
- `packages/orchestrator/src/commands/dashboard.ts` - forge dashboard spawning Streamlit
- `packages/orchestrator/src/cli.ts` - Wired cost and dashboard commands, removed legacy inline cost
- `test/unit/dolt/cost-queries.test.ts` - 7 tests for cost query functions
- `test/unit/commands/cost.test.ts` - 7 tests for cost command
- `test/unit/commands/dashboard.test.ts` - 4 tests for dashboard command

## Decisions Made
- cost:record registered as separate commander command (not subcommand) due to commander API constraints
- Legacy cycle-id cost display preserved via argument detection in cost command action handler
- Budget alerts check per unique phase_id after any cost display, using FORGE_PHASE_BUDGET_USD env var

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Cost data layer and CLI ready for Streamlit dashboard integration (04-02)
- All query functions exported and tested for dashboard Python layer to call via Dolt

---
*Phase: 04-team-dashboard-and-cost-tracking*
*Completed: 2026-03-19*
