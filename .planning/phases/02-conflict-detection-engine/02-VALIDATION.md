---
phase: 2
slug: conflict-detection-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (root devDependency) |
| **Config file** | packages/orchestrator/package.json `"test": "vitest run"` |
| **Quick run command** | `pnpm --filter @forge/orchestrator test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @forge/orchestrator test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | GSD-01 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | GSD-02 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | GSD-03 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | GSD-04 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | GSD-05 | manual | Architecture verification (git.show is read-only) | N/A | ⬜ pending |
| 02-02-01 | 02 | 2 | CONFLICT-01 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | CONFLICT-02 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | CONFLICT-03 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | CONFLICT-04 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/webhook/pr-conflict-handler.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-05 | 02 | 2 | LOCK-01 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/lock-manager.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-06 | 02 | 2 | LOCK-02 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/lock-manager.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-07 | 02 | 2 | LOCK-03 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/lock-manager.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-08 | 02 | 2 | LOCK-04 | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/coordination/gsd-reader.test.ts` — stubs for GSD-01 through GSD-04
- [ ] `test/unit/coordination/conflict-detector.test.ts` — stubs for CONFLICT-01 through CONFLICT-03, LOCK-04
- [ ] `test/unit/coordination/lock-manager.test.ts` — stubs for LOCK-01 through LOCK-03
- [ ] `test/unit/commands/conflicts.test.ts` — stubs for CLI commands
- [ ] `test/unit/webhook/pr-conflict-handler.test.ts` — stubs for CONFLICT-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Read-only GSD access | GSD-05 | Architecture guarantee (git.show is inherently read-only) | Verify no write calls to .planning/ in gsd-reader.ts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
