---
phase: 03-event-driven-enforcement
plan: 2
subsystem: coordination
tags: [topological-sort, kahn-algorithm, merge-order, escalation, webhook, slack, discord]

requires:
  - phase: 03-event-driven-enforcement
    provides: "conflict-detector.ts with ConflictReport, PhaseFileSet, collectPhaseFiles"
provides:
  - "computeMergeOrder: topological sort with cycle detection and inferred edges"
  - "getMergeOrderForOpenPRs: convenience function querying Dolt for open PRs"
  - "escalateConflicts: webhook escalation for file conflicts to Slack/Discord/Teams"
  - "forge merge-order CLI command"
affects: [04-dashboard-cost-tracking]

tech-stack:
  added: []
  patterns: [kahn-algorithm-topological-sort, inferred-dependency-edges, webhook-escalation-pattern]

key-files:
  created:
    - packages/orchestrator/src/coordination/merge-engine.ts
    - packages/orchestrator/src/coordination/escalation.ts
    - packages/orchestrator/src/commands/merge-order.ts
  modified:
    - packages/orchestrator/src/cli.ts
    - test/unit/coordination/merge-engine.test.ts
    - test/unit/coordination/escalation.test.ts
    - test/unit/commands/merge-order.test.ts

key-decisions:
  - "computeMergeOrder is a pure function taking PhaseNode[] for testability, with getMergeOrderForOpenPRs as async convenience wrapper"
  - "Inferred edges from touch map overlaps use lower-phaseId-first heuristic when no declared dependency exists"
  - "Cycle members grouped into single array (simple grouping sufficient for current scale)"
  - "Escalation uses {text} JSON envelope compatible with Slack, Discord, and Teams webhooks"

patterns-established:
  - "Pure algorithm + async wrapper pattern: core logic is synchronous and testable, DB access wrapped in separate function"
  - "Webhook escalation pattern: read env var, build message, POST, return boolean, never throw"

requirements-completed: [MERGE-01, MERGE-02, MERGE-04, ESC-01, ESC-02]

duration: 3min
completed: 2026-03-19
---

# Phase 03 Plan 02: Merge Order Engine & Escalation Summary

**Kahn's algorithm topological sort with cycle detection, inferred dependency edges from touch map overlaps, and webhook conflict escalation to Slack/Discord/Teams**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T02:09:15Z
- **Completed:** 2026-03-19T02:13:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Merge order engine with Kahn's algorithm, cycle detection, and inferred edges from shared file overlaps
- Conflict escalation module that POSTs to configurable webhook URL with developer names and file details
- `forge merge-order` CLI command displaying merge order table with reasoning and cycle warnings
- 20 total tests across merge-engine (9), escalation (6), and merge-order command (5)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement merge order engine and escalation module** - `650b30b` (feat)
2. **Task 2: Wire merge-order CLI command** - `97e3765` (feat)

## Files Created/Modified
- `packages/orchestrator/src/coordination/merge-engine.ts` - Topological sort merge order with cycle detection
- `packages/orchestrator/src/coordination/escalation.ts` - Webhook escalation for file conflicts
- `packages/orchestrator/src/commands/merge-order.ts` - CLI command for `forge merge-order`
- `packages/orchestrator/src/cli.ts` - Added mergeOrderCommands registration
- `test/unit/coordination/merge-engine.test.ts` - 9 tests for merge engine
- `test/unit/coordination/escalation.test.ts` - 6 tests for escalation
- `test/unit/commands/merge-order.test.ts` - 5 tests for CLI command

## Decisions Made
- computeMergeOrder is a pure function (PhaseNode[] in, MergeOrder out) for easy testing; async DB access isolated in getMergeOrderForOpenPRs
- Inferred edges from touch map overlaps: when two phases share files with no declared dependency, lower phaseId merges first
- Escalation payload uses `{text}` envelope which is compatible with Slack, Discord, and Teams incoming webhooks
- Cycle members collected into a single flat group (sufficient at current scale; can be refined to identify distinct cycles later)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest does not support `--grep` flag; used direct test file paths instead for running specific tests
- Commander module not resolvable from test directory; used mock program pattern (action handler extraction) instead of Commander program instantiation

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Merge engine and escalation are ready for CI gate pipeline integration (Phase 03 Plan 03)
- `forge merge-order` command is wired and functional
- Escalation requires FORGE_ESCALATION_WEBHOOK_URL env var to be set for production use

---
*Phase: 03-event-driven-enforcement*
*Completed: 2026-03-19*
