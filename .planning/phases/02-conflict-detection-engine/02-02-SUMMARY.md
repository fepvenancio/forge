---
phase: 02-conflict-detection-engine
plan: 02
subsystem: coordination
tags: [conflict-detection, advisory-locks, webhook, git-diff, touch-maps]

# Dependency graph
requires:
  - phase: 02-conflict-detection-engine
    provides: GSD reader (gsd-reader.ts), git utilities (git.ts), Dolt schema (schema.ts, queries.ts)
provides:
  - Cross-branch conflict detection engine (hybrid declared+actual)
  - Advisory file lock manager
  - CLI commands (check-conflicts, lock, unlock, locks)
  - PR open webhook handler with conflict check trigger
affects: [03-ci-gates-merge-flow, 04-dashboard-cost-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns: [hybrid-conflict-detection, advisory-locks, dynamic-import-for-cross-package]

key-files:
  created:
    - packages/orchestrator/src/coordination/conflict-detector.ts
    - packages/orchestrator/src/coordination/lock-manager.ts
    - packages/orchestrator/src/commands/conflicts.ts
  modified:
    - packages/orchestrator/src/dolt/queries.ts
    - packages/orchestrator/src/cli.ts
    - packages/webhook/src/server.ts
    - test/unit/coordination/conflict-detector.test.ts
    - test/unit/coordination/lock-manager.test.ts
    - test/unit/commands/conflicts.test.ts
    - test/unit/webhook/pr-conflict-handler.test.ts

key-decisions:
  - "Dynamic import for cross-package webhook->orchestrator dependency (avoid hard compile-time coupling)"
  - "Advisory locks use ON DUPLICATE KEY UPDATE to allow lock transfers with warnings"
  - "GITHUB_TOKEN guard in webhook for graceful degradation (logs to console when no token)"

patterns-established:
  - "Hybrid conflict detection: combine declared PLAN.md touch maps with actual git diff for comprehensive coverage"
  - "Advisory-only locks: warn but never block operations (LOCK-04)"
  - "Dynamic cross-package imports in webhook to avoid build dependency cycles"

requirements-completed: [CONFLICT-01, CONFLICT-02, CONFLICT-03, CONFLICT-04, LOCK-01, LOCK-02, LOCK-03, LOCK-04]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 02 Plan 02: Conflict Detection Engine Summary

**Hybrid declared+actual conflict detection across phase branches with advisory file locks, CLI commands, and PR webhook trigger**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T01:28:55Z
- **Completed:** 2026-03-19T01:34:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Conflict detection engine combining PLAN.md declared touch maps with actual git diff data for comprehensive file overlap detection
- Advisory file lock manager (lockFile, unlockFile, getAllFileLocks, getFileLocksForPhase) with warn-never-block semantics
- CLI commands: check-conflicts, lock, unlock, locks registered in forge CLI
- PR open webhook handler that triggers automatic conflict check on gsd/phase-* branches
- 32 passing tests across 4 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Conflict detector, lock manager, queries, and CLI commands** - `184a870` (feat)
2. **Task 2: PR open webhook handler** - `aec7c49` (feat)

## Files Created/Modified
- `packages/orchestrator/src/coordination/conflict-detector.ts` - Cross-branch conflict detection engine with hybrid declared+actual approach
- `packages/orchestrator/src/coordination/lock-manager.ts` - Advisory file lock management (acquireLock, releaseLock, listLocks)
- `packages/orchestrator/src/commands/conflicts.ts` - CLI commands for check-conflicts, lock, unlock, locks
- `packages/orchestrator/src/dolt/queries.ts` - Added lockFile, unlockFile, getAllFileLocks, getFileLocksForPhase query functions
- `packages/orchestrator/src/cli.ts` - Registered conflictCommands
- `packages/webhook/src/server.ts` - PR open webhook handler with conflict check trigger and Octokit PR comment posting
- `test/unit/coordination/conflict-detector.test.ts` - 10 tests for conflict detection
- `test/unit/coordination/lock-manager.test.ts` - 8 tests for lock management
- `test/unit/commands/conflicts.test.ts` - 10 tests for CLI command registration
- `test/unit/webhook/pr-conflict-handler.test.ts` - 4 tests for webhook handler

## Decisions Made
- Dynamic import for cross-package webhook->orchestrator dependency to avoid hard compile-time coupling
- Advisory locks use ON DUPLICATE KEY UPDATE to allow lock transfers with warnings
- GITHUB_TOKEN guard in webhook for graceful degradation (logs to console when no token)
- Mock program pattern for CLI command registration tests (avoids commander import resolution issue in test runner)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Commander import resolution in test runner**
- **Found during:** Task 1 (conflicts CLI tests)
- **Issue:** `import { Command } from "commander"` failed in test runner -- commander not resolvable from test/ directory
- **Fix:** Used mock program pattern instead of real Commander instance for registration tests
- **Files modified:** test/unit/commands/conflicts.test.ts
- **Verification:** All 10 CLI tests pass
- **Committed in:** 184a870 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test strategy adjustment. No scope creep.

## Issues Encountered
None beyond the commander import resolution noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 2 requirements (CONFLICT-01 through LOCK-04) satisfied with passing tests
- Conflict detection engine ready for CI gate integration in Phase 3
- Webhook PR handler ready for production deployment (needs GITHUB_TOKEN env var)
- Advisory lock system fully operational

---
*Phase: 02-conflict-detection-engine*
*Completed: 2026-03-19*
