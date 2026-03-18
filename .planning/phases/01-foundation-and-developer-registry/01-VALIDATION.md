---
phase: 1
slug: foundation-and-developer-registry
status: draft
nyquist_compliant: false
wave_0_complete: false  # Plan 01-00 creates all stubs
created: 2026-03-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.0 |
| **Config file** | None (vitest defaults; tests discovered in `test/` directory) |
| **Quick run command** | `pnpm --filter @forge/orchestrator test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @forge/orchestrator test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SCHEMA-01 | integration | `pnpm vitest run test/integration/v2-schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SCHEMA-02 | integration | `pnpm vitest run test/integration/v2-schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SCHEMA-03 | integration | `pnpm vitest run test/integration/v2-schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | IDENT-01 | unit | `pnpm vitest run test/unit/commands/register.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | IDENT-02 | unit | `pnpm vitest run test/unit/commands/register.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | IDENT-03 | integration | `pnpm vitest run test/integration/developer-registry.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | PHASE-01 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | PHASE-02 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | PHASE-03 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-04 | 03 | 2 | PHASE-04 | unit | `pnpm vitest run test/unit/commands/phases.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-05 | 03 | 2 | PHASE-05 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-06 | 03 | 2 | PHASE-06 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-07 | 03 | 2 | BRANCH-01 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-08 | 03 | 2 | BRANCH-02 | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | CLI-01 | smoke | `pnpm forge --help` | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 1 | CLI-02 | smoke | `pnpm forge register --help` | ❌ W0 | ⬜ pending |
| 01-03-09 | 03 | 2 | CLI-03 | unit | `pnpm vitest run test/unit/commands/sync.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-10 | 03 | 2 | CLI-04 | unit | `pnpm vitest run test/unit/commands/status.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/integration/v2-schema.test.ts` — stubs for SCHEMA-01, SCHEMA-02, SCHEMA-03
- [ ] `test/unit/commands/register.test.ts` — stubs for IDENT-01, IDENT-02
- [ ] `test/integration/developer-registry.test.ts` — stubs for IDENT-03
- [ ] `test/unit/coordination/phase-manager.test.ts` — stubs for PHASE-01..06, BRANCH-01, BRANCH-02
- [ ] `test/unit/commands/phases.test.ts` — stubs for PHASE-04
- [ ] `test/unit/commands/sync.test.ts` — stubs for CLI-03
- [ ] `test/unit/commands/status.test.ts` — stubs for CLI-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI help output readability | CLI-01 | Visual formatting check | Run `pnpm forge --help`, verify all commands listed with descriptions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
