---
phase: 02-conflict-detection-engine
verified: 2026-03-19T01:45:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Run `forge check-conflicts` against a real Dolt instance with two active phase branches that share a file"
    expected: "Conflict table shows the shared file, both phase IDs, and source label (declared or actual)"
    why_human: "End-to-end requires live Dolt connection and populated phase_assignments table"
  - test: "POST a pull_request.opened webhook payload with a gsd/phase-* branch to the running webhook server"
    expected: "GITHUB_TOKEN guard logs conflict report to console; with token it posts as PR comment"
    why_human: "Requires live webhook server and GitHub token to verify Octokit comment posting"
---

# Phase 2: Conflict Detection Engine Verification Report

**Phase Goal:** Developers can detect file-level conflicts across active phase branches before code reaches PR time, using both declared touch maps and actual git diffs
**Verified:** 2026-03-19T01:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Forge can read ROADMAP.md (and any GSD artifact) from any branch without checkout | VERIFIED | `readFileFromBranch` in gsd-reader.ts uses `git.showFile(branch, path)`; test at line 30 of gsd-reader.test.ts confirms ROADMAP.md read |
| 2 | Forge can extract files_modified and requirements from PLAN.md frontmatter on any branch | VERIFIED | `parsePlanFromBranch` uses gray-matter on git.show output; 3 tests passing |
| 3 | Forge can extract completion status from SUMMARY.md on any branch | VERIFIED | `parseSummaryFromBranch` exports with requirementsCompleted, duration, completed; 3 tests passing |
| 4 | Forge can validate config.json from a branch against expected fields | VERIFIED | `parseConfigFromBranch` validates mode, granularity, workflow, git.branching_strategy; 4 tests passing |
| 5 | Forge never writes to .planning/ files | VERIFIED | No `writeFile`, `checkout`, or `fs.write` calls in gsd-reader.ts, conflict-detector.ts, lock-manager.ts |
| 6 | `forge check-conflicts` reports file-level overlaps across active phase branches | VERIFIED | `checkConflicts()` wired to CLI via `conflictCommands(program)` in cli.ts line 29; displays table with file, phases, source columns |
| 7 | Conflict detection uses both declared PLAN.md touch maps AND actual git diff data | VERIFIED | `collectPhaseFiles` reads declared from discoverPlanFiles+parsePlanFromBranch, actual from git.diffNameOnly("main", branch); findConflicts unions both |
| 8 | Conflicts reported at file level with phase identifiers and source label | VERIFIED | ConflictReport.conflicts is FileConflict[] with filePath, phases[]{phaseId, branch, source:"declared"\|"actual"} |
| 9 | PR open webhook triggers conflict check automatically | VERIFIED | server.ts handles `x-github-event: pull_request` action=opened, calls checkConflicts() via dynamic import, posts result as PR comment |
| 10 | Developer can lock a file with `forge lock <file> --phase <N>` | VERIFIED | `lock` command in conflicts.ts calls acquireLock; requires --phase option; 10 CLI tests passing |
| 11 | Developer can unlock a file with `forge unlock <file>` | VERIFIED | `unlock` command calls releaseLock; throws if not locked by requesting developer |
| 12 | `forge locks` shows all active file locks | VERIFIED | `locks` command calls listLocks(), renders cli-table3 with file, owner, phase, reason, timestamp |
| 13 | Locks are advisory — warn but never block operations | VERIFIED | acquireLock returns {success:true, warning:...} when file already locked by another dev; never throws; LOCK-04 advisory behavior confirmed in lock-manager.test.ts |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/orchestrator/src/utils/git.ts` | showFile, diffNameOnly, listTree git wrappers | VERIFIED | 6 exported functions; all 3 new functions present; no write ops |
| `packages/orchestrator/src/coordination/gsd-reader.ts` | Read-only GSD artifact parser | VERIFIED | 5 exported async functions, 4 exported interfaces, imports gray-matter and git |
| `packages/orchestrator/src/coordination/conflict-detector.ts` | Cross-branch conflict detection engine | VERIFIED | checkConflicts, collectPhaseFiles, findConflicts exported; ConflictReport, FileConflict interfaces present |
| `packages/orchestrator/src/coordination/lock-manager.ts` | Advisory file lock management | VERIFIED | acquireLock, releaseLock, listLocks exported; LockResult interface present |
| `packages/orchestrator/src/commands/conflicts.ts` | CLI commands for check-conflicts, lock, unlock, locks | VERIFIED | conflictCommands(program) exported; all 4 commands registered |
| `packages/orchestrator/src/dolt/queries.ts` | lockFile, unlockFile, getAllFileLocks, getFileLocksForPhase | VERIFIED | All 4 functions present at lines 561-603 |
| `packages/webhook/src/server.ts` | PR open webhook handler | VERIFIED | pull_request event handling, isGsdBranch check, checkConflicts dynamic import, Octokit PR comment posting |
| `test/unit/coordination/gsd-reader.test.ts` | 14 passing tests | VERIFIED | 14 tests pass; no it.todo() remaining |
| `test/unit/coordination/conflict-detector.test.ts` | 10 passing tests | VERIFIED | 10 tests pass; no it.todo() remaining |
| `test/unit/coordination/lock-manager.test.ts` | 8 passing tests | VERIFIED | 8 tests pass; no it.todo() remaining |
| `test/unit/commands/conflicts.test.ts` | 10 passing tests | VERIFIED | 10 tests pass; no it.todo() remaining |
| `test/unit/webhook/pr-conflict-handler.test.ts` | 4 passing tests | VERIFIED | 4 tests pass; no it.todo() remaining |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| gsd-reader.ts | git.ts | `import * as git from '../utils/git.js'` | WIRED | Line 2; `git.showFile` called in readFileFromBranch |
| gsd-reader.ts | gray-matter | `import matter from 'gray-matter'` | WIRED | Line 1; `matter(content)` called in parsePlanFromBranch, parseSummaryFromBranch |
| conflict-detector.ts | gsd-reader.ts | `import { parsePlanFromBranch, discoverPlanFiles }` | WIRED | Line 3; both functions called in collectPhaseFiles |
| conflict-detector.ts | git.ts | `import * as git from '../utils/git.js'` | WIRED | Line 2; `git.diffNameOnly("main", branch)` called in collectPhaseFiles |
| conflict-detector.ts | queries.ts | `import * as queries` | WIRED | Line 1; `queries.getAllPhaseAssignments()` and `queries.getAllFileLocks()` called in checkConflicts |
| lock-manager.ts | queries.ts | `import * as queries` | WIRED | Line 1; queries.lockFile, unlockFile, getAllFileLocks, getDeveloper, getPhaseAssignment all called |
| cli.ts | conflicts.ts | `import { conflictCommands }` | WIRED | Line 14; `conflictCommands(program)` called at line 29 |
| webhook/server.ts | conflict-detector.ts | dynamic `import("../../orchestrator/src/coordination/conflict-detector.js")` | WIRED | Line 37; `checkConflicts()` called and result formatted as PR comment body |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GSD-01 | 02-00, 02-01 | Forge reads ROADMAP.md to extract phase definitions, goals, success criteria | SATISFIED | readFileFromBranch(branch, ".planning/ROADMAP.md") works via git.showFile; test at gsd-reader.test.ts line 30 |
| GSD-02 | 02-00, 02-01 | Forge reads PLAN.md to extract touch maps (files_modified) | SATISFIED | parsePlanFromBranch returns PlanArtifact.filesModified[]; discoverPlanFiles finds all PLAN.md files |
| GSD-03 | 02-00, 02-01 | Forge reads SUMMARY.md to determine completion status and commits | SATISFIED | parseSummaryFromBranch returns SummaryArtifact.requirementsCompleted[], duration, completed |
| GSD-04 | 02-00, 02-01 | Forge reads config.json to validate team-standard configuration | SATISFIED | parseConfigFromBranch validates mode, granularity, workflow, git.branching_strategy fields |
| GSD-05 | 02-01 | Forge never writes to .planning/ files (read-only integration) | SATISFIED | No writeFile/checkout/fs.write in gsd-reader.ts, conflict-detector.ts, or lock-manager.ts; all reads via git.show() |
| CONFLICT-01 | 02-00, 02-02 | `forge check-conflicts` compares touch maps across all active phase branches | SATISFIED | checkConflicts() queries all active assignments, collects declared+actual files, finds overlaps |
| CONFLICT-02 | 02-00, 02-02 | Hybrid approach: declared PLAN.md touch maps + actual git diff | SATISFIED | collectPhaseFiles reads both; findConflicts tracks declaredOnlyFiles and actualOnlyFiles for staleness |
| CONFLICT-03 | 02-00, 02-02 | Conflicts reported at file level with phase identifiers | SATISFIED | FileConflict.phases[] contains phaseId, branch, source("declared"\|"actual") per conflict |
| CONFLICT-04 | 02-00, 02-02 | Conflict check runs automatically on PR open via GitHub webhook | SATISFIED | server.ts handles pull_request.opened for gsd/phase-* branches; calls checkConflicts(); posts PR comment |
| LOCK-01 | 02-00, 02-02 | Developer can lock a file with `forge lock <file> --phase <N>` | SATISFIED | lock command in conflicts.ts calls acquireLock; lockFile in queries.ts uses INSERT ON DUPLICATE KEY UPDATE |
| LOCK-02 | 02-00, 02-02 | Developer can unlock a file with `forge unlock <file>` | SATISFIED | unlock command calls releaseLock; unlockFile in queries.ts throws if not locked by requesting developer |
| LOCK-03 | 02-00, 02-02 | `forge locks` shows all active file locks with owner, phase, timestamp | SATISFIED | locks command calls listLocks(); renders table with file_path, locked_by, phase_id, reason, locked_at |
| LOCK-04 | 02-00, 02-02 | Locks are advisory — warn on conflict, never block | SATISFIED | acquireLock returns {success:true, warning:string} when overwriting; never throws for advisory conflicts |

**Orphaned requirements check:** All 13 requirement IDs (GSD-01 through GSD-05, CONFLICT-01 through CONFLICT-04, LOCK-01 through LOCK-04) appear in at least one plan's `requirements` field. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

No TODO/FIXME/placeholder comments found. No empty implementations. No remaining `it.todo()` stubs. No write operations in read-only modules.

### Human Verification Required

#### 1. End-to-End Conflict Detection with Live Dolt

**Test:** Start Dolt, populate `phase_assignments` with two `in_progress` entries whose branches both modify the same file (e.g., `packages/orchestrator/src/cli.ts`). Run `forge check-conflicts`.
**Expected:** Table displays the shared file path, both phase IDs (e.g., "Phase 2, Phase 3"), and source labels ("declared" from PLAN.md or "actual" from git diff).
**Why human:** Requires a live Dolt server, two real phase branches in the local git repo, and populated DB rows. Cannot be verified without the running infrastructure.

#### 2. Webhook PR Comment Posting

**Test:** Start the webhook server (`forge start`), set `GITHUB_TOKEN` env var, POST a `pull_request.opened` payload with `head.ref: gsd/phase-2-conflict-detection` to `localhost:3001/github-webhook`.
**Expected:** Forge posts a conflict report as a GitHub PR comment via Octokit. Without token, it logs the report to console.
**Why human:** Requires a live GitHub token and real PR to verify Octokit integration. The GITHUB_TOKEN code path was not exercised in tests (only the no-token branch was tested via the mock).

### Gaps Summary

No gaps. All 13 requirements are satisfied with substantive implementations and passing tests. The phase goal is fully achieved: developers can detect file-level conflicts across active phase branches before code reaches PR time, using both declared touch maps and actual git diffs.

---

_Verified: 2026-03-19T01:45:00Z_
_Verifier: Claude (gsd-verifier)_
