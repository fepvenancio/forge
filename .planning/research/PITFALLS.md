# Domain Pitfalls

**Domain:** Team coordination layer for AI-assisted multi-developer workflows
**Researched:** 2026-03-18

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Touch Map Staleness and False Negatives

**What goes wrong:** Touch maps extracted from PLAN.md files only capture *declared* file modifications. Claude Code + GSD frequently touches files not declared in the plan -- utilities, shared types, config files, test helpers. The conflict detection system reports "no conflicts" while two developers silently modify the same file.

**Why it happens:** Plans are written before execution. Developers (and AI agents) discover additional files to modify during implementation. The touch map is a pre-execution estimate, not a runtime truth.

**Consequences:** The core value proposition of Forge (conflict detection before PR time) fails silently. Developers trust the "no conflicts" signal and merge into surprising conflicts. Worse than no detection -- false confidence.

**Prevention:**
- Supplement declared touch maps with actual `git diff --name-only` on the phase branch vs main. Compare *actual* modified files, not just planned ones.
- Run conflict detection on both declared touch maps AND actual branch diffs.
- Surface a warning when actual modifications diverge significantly from the declared touch map ("Phase 3 modified 12 files not in its touch map").

**Detection:** Track touch map accuracy over time. If plans routinely modify 5 files but branches modify 15, the system is unreliable.

**Phase relevance:** Phase 3 (Touch Map Conflict Detection) -- this is the foundational design decision.

---

### Pitfall 2: Dolt Merge Semantics Cause Lost Updates

**What goes wrong:** Dolt uses merge logic (not row-level locking) for concurrent transactions. When multiple CLI sessions or webhook handlers update the same Dolt tables simultaneously, the second transaction silently overwrites the first instead of failing cleanly. Phase assignment state, cost records, or lock states get corrupted.

**Why it happens:** Dolt is designed as "Git for data" -- it uses merge semantics, not traditional database locking. Developers familiar with MySQL/Postgres assume last-write-wins with locking, but Dolt's merge can produce unexpected results. Additionally, Dolt supports only REPEATABLE_READ isolation, and concurrent writes to the same rows cause transaction failures rather than queuing.

**Consequences:** Developer A claims Phase 3, Developer B claims Phase 4 simultaneously -- one claim gets lost. Cost records silently overwritten. File locks recorded but not persisted.

**Prevention:**
- Serialize all Dolt writes through a single writer process (the Forge server), never allow direct CLI-to-Dolt writes from multiple processes.
- Use Dolt's `@@autocommit` carefully -- batch related changes into explicit transactions.
- Implement optimistic concurrency control: read version, write with version check, retry on conflict.
- Keep the write path simple: one Express server process handles all mutations.

**Detection:** Audit logs that track every Dolt write. Periodic consistency checks (e.g., "are there orphaned phase assignments?").

**Phase relevance:** Phase 1 (Shared Roadmap Server) and Phase 2 (Developer Registry) -- must be designed correctly from the start.

---

### Pitfall 3: Webhook Unreliability Breaks Event-Driven Architecture

**What goes wrong:** GitHub webhooks are not guaranteed delivery. If Forge's webhook server is down, restarting, or slow (>10s response), events are silently dropped. There is no automatic retry from GitHub. Duplicate deliveries also occur when GitHub retries before your server responds.

**Why it happens:** The architecture is webhook-driven (not polling). GitHub does not redeliver failed webhooks automatically. Under load or during deploys, the webhook endpoint may be unavailable for seconds or minutes, during which push events, PR events, and other triggers are permanently lost.

**Consequences:** Librarian misses push events -- flow documents go stale without detection. Conflict checks never trigger for a PR. Phase status never updates from "in_progress" to "pr_open". The team dashboard shows stale state.

**Prevention:**
- Implement a hybrid approach: webhook-first with periodic polling as a safety net. A cron job every 5 minutes that checks GitHub API for recent events and reconciles missed ones.
- Store processed webhook delivery IDs (via `X-GitHub-Delivery` header) in Dolt for idempotency -- deduplicate before processing.
- Return 200 immediately on webhook receipt, queue processing asynchronously. Never do heavy work in the webhook handler.
- Add a `/forge reconcile` CLI command that manually syncs state from GitHub.

**Detection:** Monitor webhook receipt rate. Alert if no webhooks received in N minutes during active development hours.

**Phase relevance:** Phase 4 (Flow Document Management) and Phase 5 (CI Gate Pipeline) -- both depend on webhook reliability.

---

### Pitfall 4: The 1:1:1 Mapping (Phase=Branch=Developer) Breaks Down

**What goes wrong:** The clean model of "one phase, one branch, one developer" fails in practice. Phase 2 depends on Phase 1's changes that haven't merged yet. A developer finishes early and wants to help on another phase. Two phases need the same foundational change. A phase is too large for one developer but can't be split.

**Why it happens:** Real software development doesn't decompose into perfectly independent units. Dependencies between phases create serial bottlenecks. Team members have varying velocity. The rigid model optimizes for conflict avoidance at the cost of flexibility.

**Consequences:** Developers blocked waiting for upstream phases to merge. Workarounds emerge (cherry-picking between branches, unofficial shared branches) that bypass Forge's coordination. The tool becomes an obstacle rather than an enabler.

**Prevention:**
- Support explicit "depends-on" declarations between phases. Allow a phase branch to be based on another phase branch, not just main.
- Allow "co-assignment" where two developers share a phase (with their own sub-branches that merge into the phase branch).
- Build the merge order engine (Phase 7) early, not late -- it's not a nice-to-have, it's essential for the 1:1:1 model to work.
- Provide a `forge rebase <phase> --onto <other-phase>` command for dependency chains.

**Detection:** Track how often developers use workarounds outside Forge. If cherry-picks between phase branches appear in git history, the model is too rigid.

**Phase relevance:** Phase 2 (Developer Registry & Phase Assignment) design, Phase 7 (Merge Order Engine) should be elevated in priority.

---

### Pitfall 5: Clean-Slate Schema Migration Destroys Operational History

**What goes wrong:** Dropping all v0.1.0 tables (`tasks`, `cycles`, `stage_runs`, `touch_maps`, `costs`, `work_logs`, `artifacts`, `flow_registry`) to start fresh loses the existing operational data. If any debugging, auditing, or cost reconciliation needs arise later, the historical data is gone.

**Why it happens:** The v2 schema is fundamentally different from v0.1.0. It's tempting to DROP everything and start clean. Dolt's Git-like versioning might create a false sense of safety ("we can always go back to an old commit").

**Consequences:** Historical cost data lost (can't compare v1 vs v2 costs). Flow registry state lost (must re-scan all flows). No audit trail of what the autonomous factory produced. Dolt branch history helps, but querying old-schema data from a new-schema branch is awkward.

**Prevention:**
- Create a Dolt tag (`v0.1.0-archive`) before any schema changes. Document how to query it.
- Don't DROP old tables -- rename them with a `v1_` prefix. They cost nothing if unused.
- Migrate useful data forward: flow registry entries, cost summaries, any touch map data.
- Write a one-time migration script, not ad-hoc SQL.

**Detection:** Before dropping, check if any existing code references the old tables. Check if any dashboards or reports query them.

**Phase relevance:** Phase 1 (Shared Roadmap Server) -- the very first thing that happens.

---

## Moderate Pitfalls

### Pitfall 6: Advisory Locks Without Enforcement Are Ignored

**What goes wrong:** Advisory file locks depend on developer cooperation. In practice, developers (especially when working with AI assistants that don't check Forge) will modify locked files without checking. The lock becomes invisible friction -- it exists in a database no one queries.

**Why it happens:** Claude Code doesn't know about Forge's advisory locks. GSD doesn't check them. The developer has to manually run `forge locks` before starting work and `forge lock <file>` before modifying shared files. This ceremony is forgotten within days.

**Prevention:**
- Integrate lock awareness into the CI gate (Phase 5): if a PR modifies a file locked by another developer, flag it as a warning (not a blocker, keeping the advisory nature).
- Surface locks in the dashboard prominently, not buried in a sub-page.
- Keep lock scope narrow -- lock directories or modules, not individual files. Reduces noise.
- Auto-expire locks after configurable duration (e.g., 48 hours). Stale locks are worse than no locks.

**Phase relevance:** Phase 3 (Touch Map Conflict Detection) and Phase 5 (CI Gate Pipeline).

---

### Pitfall 7: LangGraph State Explosion During Repurposing

**What goes wrong:** The existing `ForgeState` (54 fields for autonomous factory workflows) gets extended for team coordination, creating a bloated state object that tries to serve two masters. Old fields like `highCourtDecision`, `workerHandoffs`, `subJudgeReports` sit unused alongside new fields like `phaseAssignments`, `teamConflicts`. The state machine becomes hard to reason about.

**Why it happens:** Brownfield evolution. The instinct is to add new fields to the existing state rather than designing a new graph. LangGraph's Annotation system makes it easy to add fields but hard to remove them (existing nodes reference old fields).

**Consequences:** New developers can't understand the state machine. Bugs from old nodes that still run but reference stale state. Testing becomes difficult because you must initialize 40+ fields for each test case.

**Prevention:**
- Design the v2 LangGraph graph from scratch as a new file (`team-graph.ts`), not by modifying `graph.ts`. Keep the old graph for reference but don't extend it.
- The v2 state should have fewer than 15 fields, focused on team coordination only.
- Use LangGraph subgraphs for distinct workflows (conflict detection, cost tracking, flow management) rather than one monolithic graph.

**Phase relevance:** Phase 1 (Shared Roadmap Server) -- must decide graph architecture early.

---

### Pitfall 8: GSD Artifact Parsing Brittleness

**What goes wrong:** Forge reads GSD's `.planning/` artifacts (ROADMAP.md, PLAN.md, SUMMARY.md, config.json) to understand what each developer is doing. These are markdown files with no guaranteed schema. GSD updates its format, a developer hand-edits a file, or the markdown structure varies slightly -- and Forge's parser breaks silently, returning empty touch maps or missing phase data.

**Why it happens:** Markdown is not a data format. Parsing "## Touch Map" sections from PLAN.md relies on heading conventions, indentation, and list formatting. GSD is a separate tool that can change its output format at any time. There's no contract between GSD and Forge.

**Consequences:** Conflict detection fails because touch maps couldn't be parsed. Phase status shows "unknown" because SUMMARY.md had a different heading level. The dashboard shows incomplete data.

**Prevention:**
- Parse defensively: always handle missing/malformed sections gracefully. Return "could not parse" rather than empty data.
- Prefer `config.json` (structured) over markdown files for critical data.
- Define a minimal contract: document exactly which headings/formats Forge expects from GSD artifacts.
- Add a `forge validate <path>` command that checks if GSD artifacts in a branch are parseable.
- Consider requesting GSD to output a machine-readable sidecar file (e.g., `.planning/phases/NN-name/NN-01-PLAN.json`) alongside the markdown.

**Phase relevance:** Phase 3 (Touch Map Conflict Detection) and Phase 5 (CI Gate Pipeline).

---

### Pitfall 9: Merge Order Engine Produces Circular Dependencies

**What goes wrong:** The merge order engine analyzes dependencies between phases and suggests an optimal merge sequence. But if Phase A depends on Phase B's type definitions and Phase B depends on Phase A's API endpoints, the dependency graph has a cycle. The engine either crashes, produces an arbitrary order, or deadlocks.

**Why it happens:** Real codebases have circular dependencies at the module level. When phases are decomposed at the feature level, cross-cutting concerns (shared types, utility modules, configuration) create implicit cycles that aren't visible until merge time.

**Consequences:** The merge order suggestion is wrong or unavailable. Developers lose trust in the tool and merge in ad-hoc order, defeating the purpose.

**Prevention:**
- Detect cycles explicitly and surface them as "these phases have mutual dependencies -- coordinate merge manually."
- Support partial merge orders: "Merge A before B, but C and D can go in any order."
- Allow explicit dependency overrides: `forge depends <phase-A> --on <phase-B>`.
- Use topological sort with cycle detection (Kahn's algorithm), not naive DFS.

**Phase relevance:** Phase 7 (Merge Order Engine).

---

### Pitfall 10: Cost Tracking Relies on Developer Self-Reporting

**What goes wrong:** Forge expects developers to report their Claude Code costs (from `/gsd:session-report`). Developers forget, report inconsistently, or don't run the reporting command. The cost dashboard shows partial data. Budget alerts never fire because 60% of costs are unreported.

**Why it happens:** No automated cost collection mechanism. Claude Code's cost data lives locally on each developer's machine. There's no API to pull it programmatically. Manual reporting has poor compliance rates.

**Consequences:** The cost tracking feature (Phase 8) is unreliable. Budget planning based on incomplete data. Can't accurately bill per-phase or compare developer efficiency.

**Prevention:**
- Automate cost reporting as part of the CI gate: when a PR is opened, estimate costs from the branch's commit history and Claude Code session logs if available.
- Provide a git hook or GSD integration that auto-reports costs on `git push`.
- Accept that cost tracking will be approximate, not precise. Design the dashboard to show "reported costs" vs "estimated costs" and highlight gaps.
- Make the cost reporting command part of `forge sync` so it runs automatically when developers sync.

**Phase relevance:** Phase 8 (Cost Tracking & Reporting) -- design for automation from the start.

---

## Minor Pitfalls

### Pitfall 11: Streamlit Dashboard Doesn't Scale to Real-Time

**What goes wrong:** Streamlit reruns the entire script on each interaction. With multiple team members checking the dashboard frequently and Dolt queries for phase status, conflict maps, and cost data, the dashboard becomes sluggish. It also lacks real-time push updates -- you have to refresh to see changes.

**Prevention:**
- Use Streamlit's `@st.cache_data` with short TTLs (30-60 seconds) for Dolt queries.
- Add `st.auto_rerun` with a polling interval rather than requiring manual refresh.
- Keep dashboard queries simple -- aggregate data server-side, not in Streamlit.
- Accept Streamlit's limitations: it's good enough for a team of 3-10 but won't scale to 50.

**Phase relevance:** Phase 6 (Team Dashboard).

---

### Pitfall 12: Git Branch Naming Convention Conflicts

**What goes wrong:** The `gsd/phase-{N}-{slug}` branch naming convention assumes all developers use GSD. If a developer creates branches manually, uses a different naming pattern, or a CI tool creates branches, Forge can't identify or track them.

**Prevention:**
- Validate branch names in the CI gate. Reject PRs from non-conforming branches with a helpful error.
- Provide `forge claim <phase>` to auto-create correctly named branches. Discourage manual branch creation.
- Support a branch name override in phase_assignments table for edge cases.

**Phase relevance:** Phase 2 (Developer Registry & Phase Assignment).

---

### Pitfall 13: Webhook Server as Single Point of Failure

**What goes wrong:** If the Express webhook server crashes, all event-driven functionality stops. No new push events processed, no conflict detection triggered, no flow freshness checks.

**Prevention:**
- Run webhook server under a process manager (pm2, systemd) with auto-restart.
- Implement health checks and monitoring.
- The hybrid polling approach (Pitfall 3) serves as a safety net.
- Keep the webhook handler minimal -- validate signature, enqueue event, return 200.

**Phase relevance:** Phase 4 (Flow Document Management) and Phase 5 (CI Gate Pipeline).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Shared Roadmap Server | Clean-slate migration destroys history (Pitfall 5), Dolt concurrent write issues (Pitfall 2) | Archive v0.1.0 data before migration; serialize writes through single process |
| Phase 2: Developer Registry | 1:1:1 model too rigid (Pitfall 4), branch naming conflicts (Pitfall 12) | Design dependency declarations early; validate branch names |
| Phase 3: Touch Map Conflict Detection | Touch maps are stale/incomplete (Pitfall 1), advisory locks ignored (Pitfall 6), GSD parsing brittleness (Pitfall 8) | Use actual git diffs alongside declared maps; parse defensively |
| Phase 4: Flow Document Management | Missed webhook events (Pitfall 3) | Hybrid webhook + polling approach |
| Phase 5: CI Gate Pipeline | Webhook unreliability (Pitfall 3), GSD parsing (Pitfall 8) | Idempotent handlers; defensive parsing; reconciliation command |
| Phase 6: Team Dashboard | Streamlit real-time limitations (Pitfall 11) | Cache aggressively; accept polling over push |
| Phase 7: Merge Order Engine | Circular dependencies (Pitfall 9), should be built earlier than sequenced | Cycle detection; elevate priority if 1:1:1 model adopted |
| Phase 8: Cost Tracking | Self-reporting compliance (Pitfall 10) | Automate collection; accept approximate data |

## Sources

- [Dolt concurrent transaction handling](https://www.dolthub.com/blog/2023-12-14-concurrent-transaction-example/)
- [Dolt SQL server concurrency](https://www.dolthub.com/blog/2021-03-12-dolt-sql-server-concurrency/)
- [Dolt performance benchmarks](https://github.com/dolthub/dolt/issues/6536)
- [Dolt garbage collection docs](https://docs.dolthub.com/sql-reference/server/garbage-collection)
- [Dolt with ORMs](https://www.dolthub.com/blog/2026-01-20-dolt-with-orms/)
- [GitHub webhook troubleshooting](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks)
- [Handling failed webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)
- [GitHub webhook duplicate handling discussion](https://github.com/orgs/community/discussions/175725)
- [Distributed locking practical guide](https://www.architecture-weekly.com/p/distributed-locking-a-practical-guide)
- [LangGraph concurrent node state inconsistency](https://github.com/langchain-ai/langgraph/issues/6406)
- [LangGraph thread safety discussion](https://github.com/langchain-ai/langgraph/discussions/1211)
- [Schema migration strategies (Atlas)](https://atlasgo.io/blog/2024/10/09/strategies-for-reliable-migrations)
- [Schema migration pitfalls (Quesma)](https://quesma.com/blog-detail/schema-migrations)
- [Dependency-based conflict resolution order (MathWorks)](https://www.mathworks.com/help/matlab/matlab_prog/resolve_project_files_conflict_order.html)
- [Common workflow orchestration mistakes](https://avatu.in/blogs/5-common-workflow-orchestration-mistakes-and-ways-to-avoid-them/)
