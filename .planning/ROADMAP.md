# Roadmap: Forge v2 — Team Coordination Layer

## Overview

Forge evolves from an autonomous engineering factory into a team coordination layer where multiple developers using Claude Code + GSD can work on the same repo without conflicts. The roadmap delivers this in four phases: first the data foundation and developer identity (so Forge knows who exists and what they own), then the core conflict detection engine (the reason Forge exists), then the event-driven enforcement layer (CI gates, webhooks, merge ordering), and finally the visualization and cost tracking layer (dashboard and reporting).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Developer Registry** - Dolt v2 schema, developer identity, phase assignment, branch management, and CLI framework
- [ ] **Phase 2: Conflict Detection Engine** - GSD artifact reading, touch map conflict detection, and advisory file locks
- [ ] **Phase 3: Event-Driven Enforcement** - CI gate pipeline, webhook integration, merge order engine, flow management, and human escalation
- [ ] **Phase 4: Team Dashboard and Cost Tracking** - Streamlit team views and per-developer/per-phase cost reporting

## Phase Details

### Phase 1: Foundation and Developer Registry
**Goal**: Developers can register, claim phases, and manage branch ownership through the Forge CLI backed by a clean Dolt v2 schema
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, IDENT-01, IDENT-02, IDENT-03, PHASE-01, PHASE-02, PHASE-03, PHASE-04, PHASE-05, PHASE-06, BRANCH-01, BRANCH-02, CLI-01, CLI-02, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):
  1. Running `forge register` persists a developer record in Dolt and `forge team` lists all registered developers
  2. Running `forge claim <phase>` assigns the phase to the developer, auto-creates a `gsd/phase-{N}-{slug}` branch, and enforces 1:1:1 (one phase, one branch, one developer)
  3. Running `forge phases` shows all phases with ownership, status lifecycle (assigned/in_progress/pr_open/merged/blocked), and branch names
  4. Running `forge sync` and `forge status` show current team-wide state pulled from Dolt
  5. Old v0.1.0 data is archived safely (tagged, prefixed) before the new schema tables are active
**Plans**: 4 plans

Plans:
- [ ] 01-00-PLAN.md — Wave 0 test stubs for all command and integration test files
- [ ] 01-01-PLAN.md — Dolt v2 schema migration, v0.1.0 archive, TypeScript types and query functions
- [ ] 01-02-PLAN.md — CLI framework (commander), developer registry (register/team), sync and status commands
- [ ] 01-03-PLAN.md — Phase assignment (claim/assign/release/phases) and branch management with 1:1:1 enforcement

### Phase 2: Conflict Detection Engine
**Goal**: Developers can detect file-level conflicts across active phase branches before code reaches PR time, using both declared touch maps and actual git diffs
**Depends on**: Phase 1
**Requirements**: GSD-01, GSD-02, GSD-03, GSD-04, GSD-05, CONFLICT-01, CONFLICT-02, CONFLICT-03, CONFLICT-04, LOCK-01, LOCK-02, LOCK-03, LOCK-04
**Success Criteria** (what must be TRUE):
  1. Forge reads ROADMAP.md, PLAN.md, SUMMARY.md, and config.json from phase branches without ever writing to `.planning/` files
  2. Running `forge check-conflicts` reports file-level overlaps across active phase branches using both PLAN.md declared touch maps and actual `git diff` data
  3. Running `forge lock <file>` / `forge unlock <file>` / `forge locks` manages advisory file locks that warn on conflict but never block operations
  4. Conflict check triggers automatically on PR open via GitHub webhook and reports results
**Plans**: 3 plans

Plans:
- [ ] 02-00-PLAN.md — Wave 0 test stubs and gray-matter installation
- [ ] 02-01-PLAN.md — GSD artifact reader (git utility extensions, read-only parsing of .planning/ files from branches)
- [ ] 02-02-PLAN.md — Conflict detection engine, advisory file locks, CLI commands, and PR webhook handler

### Phase 3: Event-Driven Enforcement
**Goal**: PRs are automatically validated by CI gates (flow freshness, conflict checks, config validation, tests, cost audit), merge order is suggested for open PRs, and unresolvable conflicts escalate to humans
**Depends on**: Phase 2
**Requirements**: CI-01, CI-02, CI-03, CI-04, CI-05, CI-06, FLOW-01, FLOW-02, FLOW-03, MERGE-01, MERGE-02, MERGE-03, MERGE-04, ESC-01, ESC-02
**Success Criteria** (what must be TRUE):
  1. A GitHub Actions workflow runs on every PR with five checks: flow freshness, touch map conflicts, GSD config validation, test suite, and cost audit -- results posted as a PR comment
  2. Running `forge merge-order` shows the optimal merge sequence for open PRs based on the dependency graph, and this order is posted as a PR comment when multiple PRs are open
  3. Flow documents maintain criticality-based freshness thresholds, and the Librarian triggers on push events to update `.flows/` files
  4. Unresolvable conflicts are escalated to Slack/Discord/Teams with full context (files, phases, developers)
**Plans**: 4 plans

Plans:
- [ ] 03-00-PLAN.md — Wave 0 test stubs for merge engine, escalation, CLI, webhook, and CI gate tests
- [ ] 03-01-PLAN.md — CI gate pipeline (3 Python gate scripts + unified forge-gates.yml workflow)
- [ ] 03-02-PLAN.md — Merge order engine (Kahn's algorithm), escalation module, and forge merge-order CLI
- [ ] 03-03-PLAN.md — Webhook push handler (flow staleness), merge order PR comments, and escalation wiring

### Phase 4: Team Dashboard and Cost Tracking
**Goal**: The team has full visibility into phase ownership, PR status, merge order, file locks, and per-developer/per-phase costs through a Streamlit dashboard and CLI reports
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, COST-01, COST-02, COST-03, COST-04, COST-05
**Success Criteria** (what must be TRUE):
  1. `forge dashboard` launches a Streamlit app showing phase ownership, PR status, merge order recommendation, and file lock map
  2. Running `forge cost` with `--team` or `--dev <name>` flags shows cost reports broken down by model, phase, and developer
  3. Cost-per-PR analysis correlates developer cost reports with phases, and budget alerts fire when a phase exceeds its configurable threshold
  4. All dashboard views read from Dolt and refresh automatically
**Plans**: 3 plans

Plans:
- [ ] 04-00-PLAN.md — Wave 0 test stubs for cost queries, cost CLI, and dashboard CLI
- [ ] 04-01-PLAN.md — Cost tracking query functions, forge cost CLI command, forge dashboard CLI command
- [ ] 04-02-PLAN.md — Streamlit dashboard pages (phase map, PR status, merge order, file locks, team costs) and app.py v2 branding

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Developer Registry | 0/3 | Not started | - |
| 2. Conflict Detection Engine | 0/3 | Not started | - |
| 3. Event-Driven Enforcement | 1/4 | In Progress|  |
| 4. Team Dashboard and Cost Tracking | 0/3 | Not started | - |
