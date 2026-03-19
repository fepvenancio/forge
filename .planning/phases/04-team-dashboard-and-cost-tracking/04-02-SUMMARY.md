---
phase: 04-team-dashboard-and-cost-tracking
plan: 02
subsystem: dashboard
tags: [streamlit, pymysql, pandas, kahns-algorithm, team-coordination]

# Dependency graph
requires:
  - phase: 04-team-dashboard-and-cost-tracking
    provides: "Dolt v2 tables (developers, phase_assignments, file_locks, developer_costs)"
provides:
  - "Five new Streamlit dashboard pages for team coordination views"
  - "Phase ownership visualization (phase_map.py)"
  - "PR status view (pr_status.py)"
  - "Merge order recommendation with Python Kahn's algorithm (merge_order.py)"
  - "File lock map (file_locks.py)"
  - "Team cost view with budget alerts (team_costs.py)"
  - "Updated app.py with v2 branding and complete navigation"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained get_connection() per Streamlit page (no shared module)"
    - "Epoch milliseconds divided by 1000 for Python datetime conversion"
    - "Kahn's algorithm re-implemented in Python for dashboard (avoids subprocess to Node.js)"

key-files:
  created:
    - packages/dashboard/pages/phase_map.py
    - packages/dashboard/pages/pr_status.py
    - packages/dashboard/pages/merge_order.py
    - packages/dashboard/pages/file_locks.py
    - packages/dashboard/pages/team_costs.py
  modified:
    - packages/dashboard/app.py

key-decisions:
  - "Python Kahn's algorithm in merge_order.py rather than subprocess to forge merge-order"
  - "Self-contained get_connection() per page following established anti-pattern guidance"

patterns-established:
  - "v2 dashboard page pattern: self-contained connection, try/except with st.error, st.info for empty states"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, COST-05]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 04 Plan 02: Dashboard Pages Summary

**Five Streamlit team coordination pages (phase map, PR status, merge order, file locks, team costs) with Kahn's algorithm and budget alerts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T03:04:03Z
- **Completed:** 2026-03-19T03:05:47Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 6

## Accomplishments
- Created five new Streamlit dashboard pages querying Dolt v2 team coordination tables
- Implemented Kahn's topological sort algorithm in Python for merge order recommendations
- Updated app.py with "Team Coordination Layer" branding and navigation for all 8 views
- All pages handle Dolt connection errors gracefully with user-friendly messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Create five Streamlit dashboard pages and update app.py** - `21ee749` (feat)
2. **Task 2: Checkpoint visual verification** - auto-approved (no code changes)

## Files Created/Modified
- `packages/dashboard/pages/phase_map.py` - Phase ownership view with metric cards (total, active, PRs open, merged)
- `packages/dashboard/pages/pr_status.py` - PR listing for phase branches
- `packages/dashboard/pages/merge_order.py` - Merge order recommendation with Kahn's algorithm
- `packages/dashboard/pages/file_locks.py` - Advisory file lock map with lock count metric
- `packages/dashboard/pages/team_costs.py` - Cost per developer/phase with bar charts and budget alerts
- `packages/dashboard/app.py` - Updated branding and navigation listing all v2 and legacy views

## Decisions Made
- Re-implemented Kahn's algorithm in Python (~40 lines) rather than shelling out to `forge merge-order` -- avoids subprocess complexity and Node.js runtime dependency from the Python dashboard
- Followed established self-contained `get_connection()` pattern per page as recommended by research anti-patterns guidance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All dashboard visualization pages complete
- Ready for Plan 03 (cost tracking CLI commands and query functions)
- Pages will show data once Dolt tables are populated via forge CLI commands

---
*Phase: 04-team-dashboard-and-cost-tracking*
*Completed: 2026-03-19*
