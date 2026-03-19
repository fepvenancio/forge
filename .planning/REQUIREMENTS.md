# Requirements: Forge v2 — Team Coordination Layer

**Defined:** 2026-03-18
**Core Value:** Multiple developers can work on the same repo simultaneously with Claude Code + GSD without stepping on each other

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Schema & Foundation

- [x] **SCHEMA-01**: Clean-slate Dolt v2 schema with `developers`, `phase_assignments`, `file_locks`, `developer_costs` tables
- [x] **SCHEMA-02**: Archive v0.1.0 data safely before dropping old tables
- [x] **SCHEMA-03**: All Dolt writes serialized through single process to prevent concurrent write conflicts

### Developer Identity

- [x] **IDENT-01**: Developer can register with `forge register` using their GitHub username
- [x] **IDENT-02**: Developer can view all registered team members with `forge team`
- [x] **IDENT-03**: Developer registration persists in Dolt `developers` table with `last_active` timestamp

### Phase Assignment

- [x] **PHASE-01**: Developer can claim an unassigned phase with `forge claim <phase>`
- [x] **PHASE-02**: Team lead can assign a phase to a developer with `forge assign <phase> --to <dev>`
- [x] **PHASE-03**: Developer can release their phase assignment with `forge release <phase>`
- [x] **PHASE-04**: `forge phases` shows all phases with current ownership and status
- [x] **PHASE-05**: Phase assignment enforces 1:1:1 model (one phase, one branch, one developer)
- [x] **PHASE-06**: Phase status tracks lifecycle: assigned, in_progress, pr_open, merged, blocked

### Branch Management

- [x] **BRANCH-01**: Branch auto-created on `forge claim` following `gsd/phase-{N}-{slug}` pattern
- [x] **BRANCH-02**: Branch naming convention enforced by Forge (reject non-conforming branches)

### GSD Artifact Reading

- [ ] **GSD-01**: Forge reads ROADMAP.md to extract phase definitions, goals, and success criteria
- [ ] **GSD-02**: Forge reads PLAN.md to extract touch maps (which files each plan modifies)
- [ ] **GSD-03**: Forge reads SUMMARY.md to determine completion status and commits produced
- [ ] **GSD-04**: Forge reads config.json to validate team-standard configuration
- [ ] **GSD-05**: Forge never writes to `.planning/` files (read-only integration)

### Touch Map Conflict Detection

- [ ] **CONFLICT-01**: `forge check-conflicts` compares touch maps across all active phase branches
- [ ] **CONFLICT-02**: Conflict detection uses hybrid approach: declared PLAN.md touch maps + actual `git diff` data
- [ ] **CONFLICT-03**: Conflicts reported at file level with phase identifiers (e.g., "Phase 3 and Phase 5 both modify `src/auth/login.ts`")
- [ ] **CONFLICT-04**: Conflict check runs automatically on PR open via GitHub webhook

### Advisory File Locks

- [ ] **LOCK-01**: Developer can lock a file with `forge lock <file> --phase <N>`
- [ ] **LOCK-02**: Developer can unlock a file with `forge unlock <file>`
- [ ] **LOCK-03**: `forge locks` shows all active file locks with owner, phase, and timestamp
- [ ] **LOCK-04**: Locks are advisory only — warn on conflict, never block operations

### Merge Order Engine

- [ ] **MERGE-01**: `forge merge-order` suggests optimal merge order for open PRs based on dependency graph
- [ ] **MERGE-02**: Dependency graph derived from ROADMAP.md phase definitions and touch map overlaps
- [ ] **MERGE-03**: Merge order posted as PR comment when multiple PRs are open
- [ ] **MERGE-04**: Handles dependency chains (e.g., Phase 2 depends on Phase 1's schema changes)

### CI Gate Pipeline

- [ ] **CI-01**: GitHub Action workflow runs on PR: flow freshness check
- [ ] **CI-02**: GitHub Action workflow runs on PR: touch map conflict check against other open PRs
- [ ] **CI-03**: GitHub Action workflow runs on PR: GSD config validation (ensure team-standard config)
- [ ] **CI-04**: GitHub Action workflow runs on PR: test suite pass
- [ ] **CI-05**: GitHub Action workflow runs on PR: cost audit (per-PR cost estimate)
- [ ] **CI-06**: Forge posts CI gate results as PR comment

### Flow Document Management

- [ ] **FLOW-01**: Flow freshness gate blocks PRs with stale documentation (existing Python gate)
- [ ] **FLOW-02**: Webhook-driven Librarian triggers on push events to update `.flows/` files
- [ ] **FLOW-03**: Flow documents have criticality levels that determine freshness thresholds

### Human Escalation

- [ ] **ESC-01**: Forge routes unresolvable conflicts to Slack/Discord/Teams via webhook
- [ ] **ESC-02**: Escalation includes context: which files conflict, which phases, which developers

### Team Dashboard

- [ ] **DASH-01**: Streamlit dashboard shows phase ownership (who's on what)
- [ ] **DASH-02**: Dashboard shows PR status for all phase branches
- [ ] **DASH-03**: Dashboard shows merge order recommendation
- [ ] **DASH-04**: Dashboard shows file lock map (which files are locked by whom)
- [ ] **DASH-05**: Dashboard shows cost per developer and per phase
- [ ] **DASH-06**: `forge dashboard` launches the Streamlit app

### Cost Tracking

- [ ] **COST-01**: Developer costs recorded in Dolt: model, input/output tokens, USD, phase
- [ ] **COST-02**: `forge cost` shows cost report (supports `--team` and `--dev <name>` flags)
- [ ] **COST-03**: Cost-per-PR analysis correlates developer cost reports with phase/PR
- [ ] **COST-04**: Budget alerts when phase cost exceeds configurable threshold
- [ ] **COST-05**: Cost data displayed in team dashboard

### CLI Interface

- [x] **CLI-01**: All commands available via `forge <command>` with consistent help output
- [x] **CLI-02**: CLI uses commander with git-style subcommands
- [x] **CLI-03**: `forge sync` pulls latest roadmap and assignments from Dolt
- [x] **CLI-04**: `forge status` shows team-wide status (who's on what, PR states)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Conflict Detection

- **CONFLICT-05**: Function-level conflict detection via AST parsing (beyond file-level)
- **CONFLICT-06**: Automatic conflict resolution suggestions for trivial overlaps

### Shared Roadmap

- **ROADMAP-01**: Dolt stores structured phase data that renders to local ROADMAP.md
- **ROADMAP-02**: `forge sync` generates local `.planning/ROADMAP.md` from Dolt

### Multi-Repo

- **MULTI-01**: Orchestrate across multiple repositories

## Out of Scope

| Feature | Reason |
|---------|--------|
| Code generation | Developers use Claude Code + GSD for this |
| Task decomposition / planning | GSD's planner handles this per-developer |
| Code review AI | Use existing tools (GitHub Copilot review, CodeRabbit) |
| Auto-merge | Too risky; human merge approval required (production incidents documented) |
| Remote execution | Each dev runs locally |
| Enforced file locks | Hard locks kill velocity; advisory only |
| IDE plugins | CLI + dashboard covers use cases; IDE plugins are community v3+ |
| Real-time collaborative editing | Git branches are the coordination primitive |
| Automated conflict resolution | AI merge resolution only 63-68% accurate; worse than manual |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 1 | Complete |
| SCHEMA-02 | Phase 1 | Complete |
| SCHEMA-03 | Phase 1 | Complete |
| IDENT-01 | Phase 1 | Complete |
| IDENT-02 | Phase 1 | Complete |
| IDENT-03 | Phase 1 | Complete |
| PHASE-01 | Phase 1 | Complete |
| PHASE-02 | Phase 1 | Complete |
| PHASE-03 | Phase 1 | Complete |
| PHASE-04 | Phase 1 | Complete |
| PHASE-05 | Phase 1 | Complete |
| PHASE-06 | Phase 1 | Complete |
| BRANCH-01 | Phase 1 | Complete |
| BRANCH-02 | Phase 1 | Complete |
| CLI-01 | Phase 1 | Complete |
| CLI-02 | Phase 1 | Complete |
| CLI-03 | Phase 1 | Complete |
| CLI-04 | Phase 1 | Complete |
| GSD-01 | Phase 2 | Pending |
| GSD-02 | Phase 2 | Pending |
| GSD-03 | Phase 2 | Pending |
| GSD-04 | Phase 2 | Pending |
| GSD-05 | Phase 2 | Pending |
| CONFLICT-01 | Phase 2 | Pending |
| CONFLICT-02 | Phase 2 | Pending |
| CONFLICT-03 | Phase 2 | Pending |
| CONFLICT-04 | Phase 2 | Pending |
| LOCK-01 | Phase 2 | Pending |
| LOCK-02 | Phase 2 | Pending |
| LOCK-03 | Phase 2 | Pending |
| LOCK-04 | Phase 2 | Pending |
| CI-01 | Phase 3 | Pending |
| CI-02 | Phase 3 | Pending |
| CI-03 | Phase 3 | Pending |
| CI-04 | Phase 3 | Pending |
| CI-05 | Phase 3 | Pending |
| CI-06 | Phase 3 | Pending |
| FLOW-01 | Phase 3 | Pending |
| FLOW-02 | Phase 3 | Pending |
| FLOW-03 | Phase 3 | Pending |
| MERGE-01 | Phase 3 | Pending |
| MERGE-02 | Phase 3 | Pending |
| MERGE-03 | Phase 3 | Pending |
| MERGE-04 | Phase 3 | Pending |
| ESC-01 | Phase 3 | Pending |
| ESC-02 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| DASH-05 | Phase 4 | Pending |
| DASH-06 | Phase 4 | Pending |
| COST-01 | Phase 4 | Pending |
| COST-02 | Phase 4 | Pending |
| COST-03 | Phase 4 | Pending |
| COST-04 | Phase 4 | Pending |
| COST-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 57 total
- Mapped to phases: 57
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation*
