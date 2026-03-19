---
phase: 4
slug: team-dashboard-and-cost-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (root-level) |
| **Config file** | None (vitest auto-discovers) |
| **Quick run command** | `npx vitest run test/unit/commands/cost.test.ts test/unit/commands/dashboard.test.ts` |
| **Full suite command** | `npx vitest run test/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit/commands/cost.test.ts test/unit/commands/dashboard.test.ts`
- **After every plan wave:** Run `npx vitest run test/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-00-01 | 00 | 1 | COST-01..04, DASH-06 | unit | `npx vitest run test/unit/commands/cost.test.ts test/unit/commands/dashboard.test.ts test/unit/dolt/cost-queries.test.ts` | --- W0 | ⬜ pending |
| 04-01-01 | 01 | 2 | COST-01..04, DASH-06 | unit | `npx vitest run test/unit/dolt/cost-queries.test.ts` | --- W0 | ⬜ pending |
| 04-01-02 | 01 | 2 | COST-02, COST-03, COST-04, DASH-06 | unit | `npx vitest run test/unit/commands/cost.test.ts test/unit/commands/dashboard.test.ts` | --- W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | DASH-01..05, COST-05 | manual | Streamlit pages + forge dashboard CLI | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · --- red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/commands/cost.test.ts` — stubs for COST-02, COST-03, COST-04
- [ ] `test/unit/commands/dashboard.test.ts` — stubs for DASH-06
- [ ] `test/unit/dolt/cost-queries.test.ts` — stubs for COST-01, COST-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phase ownership page | DASH-01 | Streamlit page, needs Dolt | Run `forge dashboard`, verify phase ownership table |
| PR status page | DASH-02 | Streamlit page, needs Dolt | Verify PR status for all phase branches |
| Merge order page | DASH-03 | Streamlit page, needs Dolt | Verify merge order visualization |
| File lock page | DASH-04 | Streamlit page, needs Dolt | Verify file lock map display |
| Cost view page | DASH-05, COST-05 | Streamlit page, needs Dolt | Verify cost per dev/phase charts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
