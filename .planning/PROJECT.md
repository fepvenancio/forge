# Forge — Team Coordination Layer

## What This Is

Forge is a team coordination layer for AI-assisted development. Each developer uses Claude Code + GSD locally, and Forge orchestrates across all developers — preventing conflicts, managing phase ownership, enforcing quality gates, and tracking costs. It evolves the existing autonomous engineering factory (v0.1.0) into a multi-developer coordination server.

## Core Value

Multiple developers can work on the same repo simultaneously with Claude Code + GSD without stepping on each other — Forge detects conflicts before they reach PR time and keeps everyone in sync.

## Requirements

### Validated

- Existing Dolt database infrastructure (will be reset to clean slate for v2 schema)
- Git worktree isolation pattern
- Flow documents (`.flows/`) with criticality levels
- Flow freshness gate (Python, blocks PRs with stale docs)
- GitHub webhook signature verification
- Cost auditing per-model per-stage
- Docker worker image
- Human escalation webhook (Slack/Discord/Teams)
- LangGraph state machine orchestration
- Claude Code CLI integration (`claude -p`)
- Streamlit dashboard
- pnpm monorepo with 8 packages
- ✓ Clean-slate Dolt v2 schema (developers, phase_assignments, file_locks, developer_costs) — Phase 1
- ✓ Developer registry & phase assignment (forge register, claim, assign, release, phases) — Phase 1
- ✓ Commander CLI framework with git-style subcommands — Phase 1
- ✓ Git branching enforcement: `gsd/phase-{N}-{slug}` pattern, 1:1:1 model — Phase 1
- ✓ CLI commands: forge register, team, sync, status, claim, assign, release, phases — Phase 1

### Active

- [ ] Touch map conflict detection — compare PLAN.md touch maps across active phase branches
- [ ] GSD artifact reading (ROADMAP.md, PLAN.md touch maps, SUMMARY.md, config.json) — read-only
- [ ] Advisory file locks (trust developers, flag conflicts, don't block)
- [ ] Flow document management — Librarian agent triggers on push, freshness gate in CI
- [ ] CI gate pipeline — GitHub Actions: flow freshness, touch map conflicts, config validation, tests, cost audit
- [ ] Merge order engine — dependency graph analysis, suggested merge order, PR comments
- [ ] Team dashboard — Streamlit with phase ownership, PR status, merge order, cost per dev, file lock map
- [ ] Cost tracking & reporting — per-developer, per-phase, per-model cost breakdown with budget alerts

### Out of Scope

- Code generation — developers use Claude Code + GSD for this
- Task decomposition — GSD's planner handles this per-developer
- Code review AI — use existing tools (GitHub Copilot review, etc.)
- Auto-merge — too risky; keep human merge approval
- Remote execution — each dev runs locally
- Multi-repo orchestration — single repo focus for v2

## Context

The existing codebase is a monorepo with 8 packages built on Node.js 22+/TypeScript, LangGraph, Dolt, Express, Vitest, and Streamlit. The v0.1.0 architecture has Forge spawning Workers that write code autonomously. The v2 shift moves code-writing to developers (via Claude Code + GSD) and repositions Forge as the team brain that coordinates.

Key packages to evolve:
- `orchestrator` — becomes team coordinator (not autonomous factory)
- `agents` — keep Librarian + Cost Auditor, repurpose others
- `dashboard` — add team views (who's on what phase)
- `webhook` — drives Librarian + conflict detection

Key packages to keep as-is:
- `schemas`, `gates`, `templates`, `models`

Initial users: solo developer coordinating multiple Claude Code sessions, growing to a small team (2-5 devs).

## Constraints

- **Tech stack**: Node.js 22+, TypeScript, pnpm workspaces, LangGraph, Dolt, Vitest — no changes
- **Database**: Dolt (clean slate — drop old tables, fresh v2 schema)
- **Dashboard**: Streamlit (Python) — extend existing, don't rewrite
- **CI**: GitHub Actions — standard, no custom CI infra
- **Git convention**: Phase branches follow `gsd/phase-{N}-{slug}` pattern
- **GSD integration**: Read-only — Forge never modifies `.planning/` files
- **Advisory locks**: Trust-based, not enforced — flag conflicts, don't block

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Clean-slate Dolt schema | Old v0.1.0 tables don't map to v2 coordination model | — Pending |
| Read GSD artifacts, never write them | Forge is coordinator, not replacement for GSD | — Pending |
| Advisory locks over enforced locks | Trust developers, flag conflicts, don't block workflow | — Pending |
| Phase = branch = developer (1:1:1) | Simple mapping, no shared branches, easy conflict detection | — Pending |
| Webhook-driven, not polling | GitHub push events trigger Librarian + conflict checks | — Pending |
| Streamlit for dashboard | Already exists, easy to extend, good enough for team of 3-10 | — Pending |

---
*Last updated: 2026-03-19 after Phase 1 completion*
