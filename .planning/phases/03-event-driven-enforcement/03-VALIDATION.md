---
phase: 3
slug: event-driven-enforcement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (orchestrator) + pytest (Python gates) |
| **Config file** | packages/orchestrator/package.json `"test": "vitest run"` |
| **Quick run command** | `pnpm --filter @forge/orchestrator test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @forge/orchestrator test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-00-01 | 00 | 1 | CI-02..06, FLOW-03 | unit | `pnpm vitest run test/unit/gates/ci-gates.test.ts` | No W0 | pending |
| 03-00-02 | 00 | 1 | MERGE-01..04 | unit | `pnpm vitest run test/unit/coordination/merge-engine.test.ts` | No W0 | pending |
| 03-00-03 | 00 | 1 | ESC-01..02 | unit | `pnpm vitest run test/unit/coordination/escalation.test.ts` | No W0 | pending |
| 03-00-04 | 00 | 1 | FLOW-02, MERGE-03 | unit | `pnpm vitest run test/unit/webhook/push-handler.test.ts` | No W0 | pending |
| 03-01-01 | 01 | 2 | CI-01..06, FLOW-01, FLOW-03 | integration | YAML lint + grep checks on workflow file | No W0 | pending |
| 03-01-02 | 01 | 2 | CI-02,03,05 | unit | `pnpm vitest run test/unit/gates/ci-gates.test.ts` | No W0 | pending |
| 03-01-03 | 01 | 2 | CI-06 | unit | `pnpm vitest run test/unit/gates/ci-gates.test.ts` | No W0 | pending |
| 03-02-01 | 02 | 2 | MERGE-01..04 | unit | `pnpm vitest run test/unit/coordination/merge-engine.test.ts` | No W0 | pending |
| 03-02-02 | 02 | 2 | ESC-01..02 | unit | `pnpm vitest run test/unit/coordination/escalation.test.ts` | No W0 | pending |
| 03-02-03 | 02 | 2 | MERGE-01 CLI | unit | `pnpm vitest run test/unit/commands/merge-order.test.ts` | No W0 | pending |
| 03-03-01 | 03 | 3 | FLOW-02 | unit | `pnpm vitest run test/unit/webhook/push-handler.test.ts` | No W0 | pending |
| 03-03-02 | 03 | 3 | MERGE-03, ESC-01, ESC-02 | unit | `pnpm vitest run test/unit/webhook/push-handler.test.ts` | No W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/coordination/merge-engine.test.ts` — stubs for MERGE-01..04
- [ ] `test/unit/coordination/escalation.test.ts` — stubs for ESC-01..02
- [ ] `test/unit/commands/merge-order.test.ts` — stubs for merge-order CLI
- [ ] `test/unit/webhook/push-handler.test.ts` — stubs for FLOW-02, MERGE-03 (merge order comment), ESC wiring
- [ ] `test/unit/gates/ci-gates.test.ts` — stubs for CI-02, CI-03, CI-05, CI-06, FLOW-03 (criticality)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GHA workflow runs on PR | CI-01, CI-04 | Requires live GitHub Actions runner | Open a test PR and verify all 5 checks run |
| PR comment posting | CI-06, MERGE-03 | Requires GITHUB_TOKEN | Verify PR comment appears with gate results |
| Slack/Discord escalation | ESC-01 | Requires webhook URL | Set FORGE_ESCALATION_WEBHOOK_URL and trigger conflict |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
