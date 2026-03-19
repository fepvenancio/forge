---
phase: 01-foundation-and-developer-registry
plan: 01
subsystem: database
tags: [dolt, sql, migration, typescript, schema]

requires:
  - phase: 01-00
    provides: "Phase directory structure and research artifacts"
provides:
  - "v2 Dolt schema with developers, phase_assignments, file_locks, developer_costs tables"
  - "Migration SQL to archive v0.1.0 tables safely"
  - "TypeScript type mirrors for all v2 tables"
  - "Query functions for developer registration and phase assignment with 1:1:1 enforcement"
affects: [01-02, 01-03, 02-conflict-detection, 04-dashboard]

tech-stack:
  added: []
  patterns: ["Transaction-based 1:1:1 enforcement for phase-developer mapping", "RENAME TABLE for safe schema archival", "VARCHAR(32) over ENUM for Dolt compatibility"]

key-files:
  created:
    - dolt/migrations/001-v2-schema.sql
    - scripts/migrate-v2.sh
    - test/integration/v2-schema.test.ts
  modified:
    - dolt/schema.sql
    - packages/orchestrator/src/dolt/schema.ts
    - packages/orchestrator/src/dolt/queries.ts
    - .gitignore

key-decisions:
  - "BIGINT timestamps (epoch ms) instead of TIMESTAMP/DATETIME for Dolt compatibility"
  - "VARCHAR(32) for status columns instead of ENUM (Dolt ENUM compatibility issues per research)"
  - "Transaction-based dual check in claimPhase: phase availability AND developer availability"

patterns-established:
  - "Migration files in dolt/migrations/ with numbered prefix (001-)"
  - "v2 types appended to schema.ts with section comment separator"
  - "v2 queries appended to queries.ts following existing pattern (query/execute/transaction)"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03]

duration: 3min
completed: 2026-03-19
---

# Phase 01 Plan 01: Dolt v2 Schema Summary

**Dolt v2 schema with 4 team coordination tables, migration from v0.1.0, TypeScript types, and query functions with transactional 1:1:1 phase-developer enforcement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T00:04:14Z
- **Completed:** 2026-03-19T00:07:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created v2 migration SQL that safely archives 7 v0.1.0 tables and creates 4 new team coordination tables
- Added TypeScript interfaces (Developer, PhaseAssignment, FileLock, DeveloperCost) and PhaseStatus type
- Implemented query functions for developer registration and phase assignment with transactional 1:1:1 enforcement
- Created 14 integration tests covering happy path and error cases (skip when Dolt unavailable)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create v2 migration SQL and migration script** - `1b0565f` (feat)
2. **Task 2: Add v2 TypeScript types and query functions** - `5149a25` (feat)

## Files Created/Modified
- `dolt/migrations/001-v2-schema.sql` - Migration SQL: 7 RENAME TABLE + 4 CREATE TABLE statements
- `scripts/migrate-v2.sh` - Bash script that tags v0.1.0-archive, runs migration, commits to Dolt
- `dolt/schema.sql` - Appended v2 table definitions for fresh installs
- `packages/orchestrator/src/dolt/schema.ts` - Added Developer, PhaseAssignment, FileLock, DeveloperCost interfaces + PhaseStatus type
- `packages/orchestrator/src/dolt/queries.ts` - Added registerDeveloper, getDeveloper, getAllDevelopers, updateDeveloperActivity, claimPhase, releasePhase, getPhaseAssignment, getAllPhaseAssignments, updatePhaseStatus
- `test/integration/v2-schema.test.ts` - 14 integration tests for v2 schema operations
- `.gitignore` - Added exception for dolt/migrations/ directory

## Decisions Made
- Used BIGINT for timestamps (epoch ms) matching existing v1 pattern
- VARCHAR(32) for all status columns to avoid Dolt ENUM compatibility issues
- claimPhase uses transaction with dual checks: phase availability AND developer 1:1:1 enforcement
- Existing v1 types and queries left completely unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed .gitignore excluding dolt/migrations/**
- **Found during:** Task 1 (migration SQL creation)
- **Issue:** `dolt/*/` gitignore pattern blocked `dolt/migrations/` from being tracked
- **Fix:** Added `!dolt/migrations/` exception to .gitignore
- **Files modified:** .gitignore
- **Verification:** `git add dolt/migrations/001-v2-schema.sql` succeeded
- **Committed in:** 1b0565f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix to allow migration files to be version-controlled. No scope creep.

## Issues Encountered
- Vitest v3.2.4 does not support `-x` flag (used `--passWithNoTests` without `-x` instead)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v2 schema is ready for CLI commands (plan 01-02: forge register, forge team)
- v2 schema is ready for phase assignment CLI (plan 01-03: forge claim, forge phases)
- Migration script ready but requires Dolt server running to execute

---
*Phase: 01-foundation-and-developer-registry*
*Completed: 2026-03-19*
