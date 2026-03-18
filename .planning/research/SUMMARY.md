# Project Research Summary

**Project:** Forge v2 — Team Coordination Layer
**Domain:** Multi-developer AI-assisted development coordination
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

Forge v2 is a brownfield evolution: a working v0.1.0 autonomous factory codebase is being repurposed into a team coordination layer. The central insight from all four research areas is consistent — Forge must stop doing things (generating code, planning, merging) and start coordinating things (who owns what, what conflicts where, what merges when). The recommended approach is to build a thin coordination layer on top of the existing Dolt database and Express webhook server, while archiving the autonomous pipeline nodes (planner, worker, sub-judge, high-court) that no longer belong. The CLI is the primary user interface, backed by Dolt as the single source of truth for all team state.

The killer feature that justifies Forge's existence is pre-PR touch map conflict detection. Every other team coordination tool (GitKraken, Graphite, Trunk) detects conflicts at commit or merge time. Forge can detect conflicts at planning time by parsing GSD's PLAN.md touch maps before a single line of code is written. This is a genuine differentiator, but it requires a hybrid approach: declared touch maps from PLAN.md must be supplemented with actual `git diff` output because plans routinely undercount files touched during implementation. Build this correctly in Phase 3 or the core value proposition fails silently.

The top execution risks are: (1) Dolt concurrent write corruption — the write path must be serialized through a single process from the start; (2) touch map false negatives — supplement declared maps with actual branch diffs; (3) the 1:1:1 phase-branch-developer model breaking under real dependency chains — the merge order engine must be elevated to Phase 3/4, not deferred to the end. The recommended stack additions (commander, simple-git, zod, chalk, cli-table3, gray-matter) are additive to the existing stack with no breaking changes. The LangGraph state machine should be archived rather than extended.

## Key Findings

### Recommended Stack

The existing stack (Node.js 22+, TypeScript 5.7, LangGraph 1.2.3, Dolt via mysql2, Express 5, Vitest 3, Streamlit, pnpm workspaces) is retained without changes. Eight new additions land in `@forge/orchestrator`. commander v14 replaces the manual switch statement for 15+ new CLI commands. simple-git wraps the existing brittle `execSync` git calls with a typed async API. zod v4 handles TypeScript-first schema validation for the new Dolt tables and GSD artifact parsing. chalk + cli-table3 handle terminal output formatting. gray-matter parses YAML frontmatter from GSD markdown files. The existing `@octokit/rest` (already in package.json but unused) and new `@octokit/webhooks` complete the GitHub integration.

**Core technologies:**
- `commander ^14.0.3`: CLI command routing for 15+ `forge *` commands — zero dependencies, ESM-native, git-style subcommands
- `simple-git ^3.33.0`: Programmatic git for branch listing, cross-branch diff, touch map extraction — replaces brittle `execSync`
- `zod ^4.3.6`: Runtime schema validation for Dolt table types and GSD artifact parsing — TypeScript inference with `z.infer<>`
- `chalk ^5.6.2` + `cli-table3 ^0.6.5`: Terminal color and table formatting for `forge team`, `forge phases`, `forge locks`
- `gray-matter ^4.0.3`: YAML frontmatter extraction from GSD `.planning/` markdown files
- `@octokit/webhooks ^14.2.0`: Typed webhook event parsing with built-in HMAC verification — replaces manual verification code
- `mysql2/promise 3.20.0` (keep): Dolt requires raw SQL for branch procedures (`DOLT_CHECKOUT`, `DOLT_MERGE`) — no ORM can express these

**What not to use:** Prisma/Drizzle/Knex (cannot express Dolt SQL procedures), Redis (splits state across two systems when Dolt handles coordination), Socket.io (Streamlit has its own refresh), Docker SDK (no programmatic Docker in v2), LangGraph for new workflows (request-response pattern, not pipeline).

### Expected Features

**Must have (table stakes):**
- Developer registry — identity foundation; every coordination tool has user management
- Phase ownership and assignment — the core coordination loop; `forge claim`, `forge assign`, `forge release`
- Phase status tracking — derived from git and PR state; teams need visibility
- Branch management — auto-create `gsd/phase-{N}-{slug}` branches on claim; enforce naming
- Touch map conflict detection — the central differentiator; pre-PR conflict signal
- CI gate pipeline — GitHub Action: flow freshness, conflict check, config validation, tests, cost audit
- Team status dashboard — `forge status` + Streamlit views; who owns what, PR state
- CLI-first interface — all `forge *` commands, ergonomic as `gh` CLI
- Cost tracking (basic) — per-developer, per-phase; AI tools cost $200-500/dev/month
- GSD artifact reading — read-only bridge to `.planning/` files; Forge is blind without this

**Should have (differentiators):**
- Pre-PR conflict prediction — detect at planning time, not commit time; unique to Forge
- Advisory file locks — softer than Perforce, more explicit than nothing; `forge lock/unlock/locks`
- Merge order engine — topological sort of phase dependencies; suggests merge sequence for open PRs
- Shared roadmap as structured Dolt data — single source of truth for phase definitions across team
- Flow document freshness gate — existing Python gate; blocks PRs with stale docs
- Webhook-driven Librarian — auto-updates `.flows/` on push; existing from v0.1.0
- Cost-per-PR analysis — correlate AI costs with features; beyond per-developer tracking
- Human escalation hooks — route unresolvable conflicts to Slack/Discord/Teams; existing infrastructure

**Defer (v2+):**
- Merge order engine can be deferred only if team stays at 1-2 developers; becomes critical at 3+
- Shared roadmap as structured Dolt data — local ROADMAP.md is sufficient for small teams (defer until 5+ devs)
- Cost-per-PR analysis — refine after basic cost tracking proves useful
- Webhook-driven Librarian — wire into v2 after CI gates are solid
- IDE plugins, multi-repo orchestration, AI merge resolution, real-time collaborative editing

### Architecture Approach

The architecture has four layers: CLI (command dispatch via commander), Coordination Engine (Phase Manager, Conflict Detector, Merge Order Engine, GSD Artifact Reader), Event Layer (Webhook Server, Librarian, CI Gate Runner as GitHub Action), and Data Layer (Dolt). The Streamlit dashboard reads Dolt as a fifth presentation layer. All team state is mutable only through Dolt; the CLI, webhook server, and dashboard communicate through Dolt rather than directly with each other. The existing monorepo structure is preserved; new coordination logic lands in `packages/orchestrator/src/coordination/` and `packages/orchestrator/src/commands/`.

**Major components:**
1. **CLI** — commander-based dispatch; one command file per group (`register.ts`, `phases.ts`, `conflicts.ts`, `sync.ts`, `status.ts`, `merge-order.ts`, `cost.ts`)
2. **Phase Manager** — developer registration, phase assignment, 1:1:1 enforcement, git branch creation
3. **Conflict Detector** — reads touch maps from PLAN.md across phase branches, compares file sets, manages advisory locks, writes overlaps to Dolt
4. **GSD Artifact Reader** — read-only parser of `.planning/` files from phase branches via `git show branch:path`; never writes
5. **Merge Order Engine** — dependency graph from ROADMAP.md, topological sort (Kahn's algorithm with cycle detection), posts PR comments
6. **Webhook Server** — existing Express server, extended to dispatch push events to Conflict Detector
7. **CI Gate Runner** — GitHub Actions workflow running Python gates (flow freshness, touch map conflicts, config validation, cost audit)
8. **Dolt Data Layer** — canonical team state; new tables: `developers`, `phase_assignments`, `file_locks`, `developer_costs`
9. **Streamlit Dashboard** — read-only Dolt consumer; new pages for phase map, PR status, merge order, file locks, cost tracking

**What to archive from v0.1.0:** `nodes/planner.ts`, `nodes/worker.ts`, `nodes/spawn-workers.ts`, `nodes/sub-judge.ts`, `nodes/high-court.ts`, `nodes/property-gate.ts`, `nodes/pr-summary.ts`, `nodes/dependency-check.ts`, `state.ts`, `graph.ts`, `agents/planner.md`, `agents/worker.md`, `agents/sub-judge.md`, `agents/high-court.md`.

**What to keep:** `nodes/librarian-trigger.ts`, `nodes/cost-auditor.ts`, `dolt/client.ts`, `claude-code.ts`, `worktree/manager.ts`, `agents/librarian.md`, `agents/cost-auditor.md`, `gates/flow_freshness.py`.

### Critical Pitfalls

1. **Touch map false negatives** — PLAN.md touch maps undercount files actually modified; supplement with `git diff --name-only branch..main`; run conflict detection on both declared maps AND actual diffs; surface divergence warnings
2. **Dolt concurrent write corruption** — Dolt uses merge semantics, not row-level locking; serialize all writes through a single Express server process; never allow parallel CLI-to-Dolt writes; use optimistic concurrency control
3. **Webhook unreliability** — GitHub does not retry dropped webhooks; implement hybrid webhook + 5-minute polling reconciliation; store delivery IDs for idempotency; return 200 immediately and queue async processing
4. **1:1:1 model rigidity** — phase-branch-developer mapping breaks when phases have dependencies or teams have uneven velocity; support explicit `depends-on` declarations; build merge order engine earlier than the default phase sequence
5. **Clean-slate migration destroys history** — create Dolt tag `v0.1.0-archive` before schema changes; rename old tables with `v1_` prefix rather than DROPping; migrate flow registry and cost data forward

## Implications for Roadmap

Based on research, the build order is driven by data layer dependencies (everything needs Dolt), then identity (everything needs to know who owns what), then the core value proposition (conflict detection), then the event infrastructure that makes it reactive, then CI enforcement, then advanced features.

### Phase 1: Dolt v2 Schema and Data Migration
**Rationale:** Every subsequent component reads or writes Dolt team state. Schema must exist before any coordination logic can be built or tested. Migration must happen safely to preserve v0.1.0 history.
**Delivers:** `developers`, `phase_assignments`, `file_locks`, `developer_costs` tables; Dolt tag `v0.1.0-archive`; `v1_` prefixed old tables preserved; numbered migration files in `dolt/migrations/`
**Addresses:** Developer registry foundation, cost tracking schema
**Avoids:** Clean-slate migration data loss (Pitfall 5), Dolt concurrent write setup (Pitfall 2)

### Phase 2: Developer Registry and Phase Assignment CLI
**Rationale:** Identity and ownership are prerequisites for conflict detection and coordination. The Conflict Detector needs to know which phases are active and who owns them before it can compare touch maps.
**Delivers:** `forge register`, `forge team`, `forge claim`, `forge assign`, `forge release`, `forge phases`, `forge sync`; auto-branch-creation on claim; 1:1:1 enforcement
**Uses:** commander, zod, chalk, cli-table3, simple-git
**Implements:** Phase Manager component, CLI command dispatch layer
**Avoids:** Branch naming conflicts (Pitfall 12); design dependency declarations here (Pitfall 4)

### Phase 3: GSD Artifact Reading and Touch Map Conflict Detection
**Rationale:** The core value proposition. Must use hybrid approach (declared + actual) from day one or the system produces false negatives and destroys user trust. Advisory locks are a natural companion deliverable.
**Delivers:** `gsd-reader.ts` parsing ROADMAP.md, PLAN.md, SUMMARY.md, config.json; `conflict-detector.ts` comparing file sets across active branches using both touch maps and git diffs; `forge check-conflicts`, `forge lock`, `forge unlock`, `forge locks`; conflict records written to Dolt
**Uses:** simple-git (branch reading), gray-matter (frontmatter parsing), zod (artifact schema validation)
**Implements:** GSD Artifact Reader and Conflict Detector components
**Avoids:** Touch map false negatives (Pitfall 1); GSD parsing brittleness (Pitfall 8); advisory locks ignored without CI integration (Pitfall 6)

### Phase 4: Webhook Integration and Event-Driven Conflict Detection
**Rationale:** Conflict detection triggered manually (`forge check-conflicts`) is useful but not sufficient. Push events must automatically trigger detection so developers get warnings without remembering to check.
**Delivers:** Evolved webhook server that dispatches push events to Conflict Detector; idempotency via delivery ID storage; hybrid polling fallback (`forge reconcile`); Librarian trigger wired to v2 schema
**Implements:** Webhook Server extension, Librarian Trigger (v2 wiring)
**Avoids:** Webhook unreliability (Pitfall 3); webhook server as single point of failure (Pitfall 13)

### Phase 5: CI Gate Pipeline
**Rationale:** Advisory conflict detection needs enforcement teeth at PR time. CI gates convert soft warnings into hard (or soft) PR checks. This is where the existing Python gates are unified with the new v2 checks.
**Delivers:** GitHub Actions workflow; `touch_map_conflicts.py` gate (queries Dolt); `config_validation.py` gate (validates GSD config.json); `cost_audit.py` gate; unified gate results as PR comment; Forge posts GitHub Check status
**Uses:** Existing `flow_freshness.py`; `@octokit/rest` for PR comments and check runs
**Implements:** CI Gate Runner component
**Avoids:** Advisory locks ignored without CI integration (Pitfall 6); GSD parsing brittleness in gate context (Pitfall 8)

### Phase 6: Merge Order Engine
**Rationale:** Elevated from "Phase 7" per pitfall research — the 1:1:1 model becomes unworkable without merge ordering once 2+ developers have active phases with dependencies. Must include cycle detection or it fails on the first circular dependency.
**Delivers:** `merge-engine.ts` with topological sort (Kahn's algorithm) and cycle detection; `forge merge-order` command; merge order posted as PR comment when multiple PRs open; `forge depends <phase> --on <other-phase>` override
**Implements:** Merge Order Engine component
**Avoids:** 1:1:1 model rigidity (Pitfall 4); circular dependencies in merge engine (Pitfall 9)

### Phase 7: Team Dashboard
**Rationale:** Pure visualization — reads Dolt, produces no writes. Can be built after all data-producing phases are complete. Streamlit is the right tool; extend the existing app rather than replace.
**Delivers:** Streamlit pages: phase map (ownership), PR status, merge order view, file lock map, cost per developer/phase; `@st.cache_data` with 30-60s TTLs; `st.auto_rerun` for polling refresh
**Implements:** Streamlit Dashboard (presentation layer)
**Avoids:** Streamlit real-time limitations (Pitfall 11)

### Phase 8: Cost Tracking and Reporting
**Rationale:** Depends only on developer registry (Phase 2). Can be built in parallel with Phase 7. Design for approximate-but-automated data from the start — manual self-reporting has poor compliance.
**Delivers:** `forge cost --team`, `forge cost --dev <name>`; cost auto-reporting in `forge sync`; CI gate cost estimation from branch history; dashboard cost views; "reported vs estimated" distinction in UI
**Implements:** Cost tracking extensions to developer_costs table, cost-auditor node (refactored)
**Avoids:** Cost tracking self-reporting compliance failure (Pitfall 10)

### Phase Ordering Rationale

- Schema before everything: Dolt tables must exist before any component can read or write team state.
- Identity before coordination: You cannot assign phases or detect conflicts without knowing who the developers are.
- Core value proposition in Phase 3: Touch map conflict detection is the reason Forge exists. It must be built while the codebase is still simple enough to get the design right (hybrid declared + actual approach).
- Events before CI gates: The webhook integration provides the trigger mechanism that the CI gates depend on for their reactive behavior.
- Merge order elevated to Phase 6 (from default Phase 7): Pitfall 4 research shows 1:1:1 mapping breaks down quickly under real dependency chains.
- Dashboard last: It is pure visualization with no downstream dependencies. It can be built after all data sources are established.
- Cost tracking can run in parallel with Phase 7: Both depend on Phase 2 but not on each other.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Conflict Detection):** The hybrid declared+actual touch map comparison design has implementation subtleties (handling renames, partial matches, function-level vs file-level). Needs design research before coding.
- **Phase 4 (Webhook Integration):** Hybrid webhook + polling reconciliation implementation. GitHub webhook retry behavior and idempotency patterns need validation against the existing webhook server architecture.
- **Phase 6 (Merge Order Engine):** Kahn's algorithm implementation for phase dependency graphs and cycle detection logic. Graph representation in Dolt needs design decision.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Dolt Schema):** Well-documented Dolt migration pattern; existing SQL files in repo show the pattern.
- **Phase 2 (Developer Registry CLI):** Standard CRUD + commander CLI pattern. Well-documented.
- **Phase 5 (CI Gate Pipeline):** GitHub Actions + Python gate pattern already established by `flow_freshness.py`. Follow existing pattern.
- **Phase 7 (Dashboard):** Existing Streamlit app to extend. Standard Streamlit patterns.
- **Phase 8 (Cost Tracking):** Standard aggregation queries + CLI formatting. No novel patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended packages verified on npm with exact versions; Dolt MySQL protocol compatibility confirmed; existing stack stays unchanged |
| Features | HIGH | Grounded in competitive analysis (GitKraken, Graphite, Trunk, Aviator) and existing v0.1.0 capabilities; feature dependencies mapped |
| Architecture | HIGH | Brownfield project with direct codebase analysis; CLAUDE.md provides authoritative target architecture; component boundaries are well-defined |
| Pitfalls | HIGH | 10 pitfalls with specific Dolt concurrency docs, GitHub webhook reliability docs, and LangGraph issue references; grounded in domain-specific sources |

**Overall confidence:** HIGH

### Gaps to Address

- **gray-matter version:** STACK.md flags gray-matter version as "MEDIUM" confidence (training data, not npm-verified). Verify current version with `npm view gray-matter version` before installing.
- **Touch map contract with GSD:** Forge needs a stable contract for which headings and formats to expect in PLAN.md. This is not documented by GSD. Needs negotiation or defensive parsing during Phase 3 planning.
- **Dolt single-writer enforcement:** The recommendation to serialize writes through a single Express process needs architecture validation: does the current codebase allow this, or do CLI commands currently write directly to Dolt? This affects Phase 1 and 2 design.
- **LangGraph retention decision:** ARCHITECTURE.md recommends archiving graph.ts but notes LangGraph may still be useful for multi-step coordination flows. This needs a concrete decision during Phase 1: keep LangGraph as a dependency or remove it?
- **Merge order engine timing:** PITFALLS.md argues the merge order engine should be elevated from Phase 7 to Phase 3-4. FEATURES.md agrees it should ship after 2+ developers are using Forge. The roadmap resolves this at Phase 6 — validate this timing decision during Phase 2 planning once the actual team size is known.

## Sources

### Primary (HIGH confidence)
- Existing Forge v0.1.0 codebase (direct analysis) — component inventory, LangGraph state machine, Dolt client patterns
- `CLAUDE.md` project specification — authoritative target architecture and phase definitions
- `.planning/PROJECT.md` — validated project requirements and constraints
- [npm: commander v14.0.3](https://www.npmjs.com/package/commander) — zero dependencies, Node 20+ requirement
- [npm: simple-git v3.33.0](https://www.npmjs.com/package/simple-git) — TypeScript types bundled
- [npm: chalk v5.6.2](https://www.npmjs.com/package/chalk) — ESM-only confirmed
- [npm: zod v4.3.6](https://www.npmjs.com/package/zod) — breaking changes from v3 noted
- [Dolt concurrent transactions](https://www.dolthub.com/blog/2023-12-14-concurrent-transaction-example/) — merge semantics, REPEATABLE_READ isolation
- [GitHub webhook troubleshooting](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks) — delivery guarantees and retry behavior

### Secondary (MEDIUM confidence)
- [GitKraken Conflict Prevention](https://help.gitkraken.com/gitkraken-desktop/conflict-prevention/) — pre-commit conflict detection comparison
- [Graphite Merge Queue](https://graphite.dev/features/merge-queue) — stacked PR handling patterns
- [Trunk.io Merge Queue](https://trunk.io/merge-queue) — parallel queue processing
- [AI Coding Agents: Coherence Through Orchestration (Mike Mason, Jan 2026)](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) — multi-agent coordination, auto-merge risks
- [GitHub Budget Tracking for AI Tools (Nov 2025)](https://github.blog/changelog/2025-11-03-control-ai-spending-with-budget-tracking-for-github-ai-tools/) — org-level cost controls
- [Graphite: AI Merge Conflict Resolution](https://www.graphite.com/guides/ai-code-merge-conflict-resolution) — 63-68% accuracy benchmark for automated resolution

### Tertiary (LOW confidence)
- [gray-matter on npm](https://www.npmjs.com/package/gray-matter) — version from training data, not live npm check; verify before install

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
