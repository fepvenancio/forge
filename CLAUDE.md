# Forge — Team Coordination Layer for AI-Assisted Development

## What Forge Is Becoming

Forge is evolving from a standalone autonomous engineering factory (v0.1.0) into a **team coordination layer** where each developer uses **Claude Code + GSD (Get Shit Done)** locally, and Forge orchestrates across all developers to prevent conflicts, maintain shared knowledge, and enforce quality gates.

### The Problem

When multiple developers each run Claude Code + GSD on the same repo:
- `.planning/STATE.md` conflicts (each dev has local session state)
- Two Claude instances editing the same files simultaneously
- No visibility into who owns which phase
- No conflict detection until PR time (too late)
- Flow/knowledge documents go stale without auto-updates
- No team-wide cost tracking or progress dashboard

### The Solution

```
┌─────────────────────────────────────┐
│           FORGE (server)            │
│  - Phase assignment & ownership     │
│  - Touch map conflict detection     │
│  - Flow document management         │
│  - CI gates + PR review             │
│  - Team dashboard + cost tracking   │
│  - Webhook-driven automation        │
└──────┬──────────┬───────────────────┘
       │          │
  ┌────▼──┐  ┌───▼───┐  ┌────────┐
  │ Dev A │  │ Dev B │  │ Dev C  │
  │Claude │  │Claude │  │Claude  │
  │Code + │  │Code + │  │Code +  │
  │ GSD   │  │ GSD   │  │ GSD    │
  └───────┘  └───────┘  └────────┘
```

Each developer works independently with Claude Code + GSD on their assigned phase branch. Forge is the team brain that coordinates.

---

## What Exists Today (v0.1.0 — Keep as Foundation)

The current codebase is a **monorepo** with 8 packages:

| Package | Purpose | Keep/Evolve |
|---------|---------|-------------|
| `orchestrator` | LangGraph state machine, CLI | **Evolve** — becomes team coordinator, not autonomous factory |
| `agents` | System prompts (planner, worker, judge, librarian, cost-auditor) | **Evolve** — keep Librarian + Cost Auditor, repurpose others |
| `schemas` | JSON schemas for agent outputs | **Keep** — add team coordination schemas |
| `gates` | Python validation runners (flow freshness) | **Keep** — core value for team PRs |
| `dashboard` | Streamlit monitoring UI | **Evolve** — add team view (who's on what phase) |
| `webhook` | GitHub webhook listener | **Keep** — drives Librarian + conflict detection |
| `templates` | Stack context files (CLAUDE.md, ARCHITECTURE.md, etc.) | **Keep** — shared team knowledge |
| `models` | Model selection + pricing + token counting | **Keep** — team cost tracking |

### Tech Stack (Unchanged)
- **Runtime:** Node.js 22+, TypeScript
- **Orchestration:** LangGraph (state machine + checkpoints)
- **Database:** Dolt (versioned SQL — Git semantics for data)
- **Validation:** JSON Schema, AJV, Python gates
- **CI:** GitHub Actions
- **Dashboard:** Streamlit (Python)
- **Webhooks:** Express
- **Package manager:** pnpm workspaces
- **Testing:** Vitest

### Key Existing Infrastructure to Preserve
- Dolt database with `tasks`, `cycles`, `stage_runs`, `touch_maps`, `costs` tables
- Git worktree isolation pattern
- Flow documents (`.flows/`) with criticality levels
- Flow freshness gate (blocks PRs with stale docs)
- GitHub webhook signature verification
- Cost auditing per-model per-stage
- Docker worker image (repurpose for CI gates)
- Human escalation webhook (Slack/Discord/Teams)

---

## New Architecture: Team Coordinator

### Core Concept Changes

| v0.1.0 (Old) | v2.0 (New) |
|---|---|
| Forge spawns Workers that write code | Developers write code via Claude Code + GSD |
| Planner decomposes PRP into tasks | Forge serves shared ROADMAP, devs pull phase assignments |
| Sub-Judges validate Worker output | CI gates validate PR output (same logic, different trigger) |
| High Court decides merge/abort | Forge detects conflicts pre-merge, suggests merge order |
| Workers run in Docker containers | Each dev runs locally; Docker only for CI gate runners |
| Single operator runs Forge | Multiple developers register and claim phases |

### New Dolt Schema Extensions

```sql
-- Existing tables remain (tasks, cycles, stage_runs, touch_maps, costs)

-- New: Developer registry
CREATE TABLE developers (
  id VARCHAR(64) PRIMARY KEY,       -- github username
  display_name VARCHAR(128),
  registered_at TIMESTAMP,
  last_active TIMESTAMP,
  current_phase INT NULL,           -- currently assigned phase
  current_branch VARCHAR(256) NULL
);

-- New: Phase ownership
CREATE TABLE phase_assignments (
  phase_id INT PRIMARY KEY,
  assignee VARCHAR(64) REFERENCES developers(id),
  assigned_at TIMESTAMP,
  status ENUM('assigned', 'in_progress', 'pr_open', 'merged', 'blocked'),
  branch_name VARCHAR(256),
  pr_number INT NULL
);

-- New: File locks (advisory, not enforced)
CREATE TABLE file_locks (
  file_path VARCHAR(512) PRIMARY KEY,
  locked_by VARCHAR(64) REFERENCES developers(id),
  phase_id INT,
  locked_at TIMESTAMP,
  reason VARCHAR(256)
);

-- New: Team cost tracking
CREATE TABLE developer_costs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  developer_id VARCHAR(64) REFERENCES developers(id),
  phase_id INT,
  model VARCHAR(64),
  input_tokens BIGINT,
  output_tokens BIGINT,
  cost_usd DECIMAL(10,4),
  recorded_at TIMESTAMP
);
```

### New CLI Commands

```bash
# Developer registration
forge register                     # Register current git user
forge team                         # List registered developers + status

# Phase management
forge assign <phase> [--to <dev>]  # Assign phase to developer
forge claim <phase>                # Self-assign a phase
forge release <phase>              # Release phase assignment
forge phases                       # Show all phases with ownership

# Conflict detection
forge check-conflicts              # Compare touch maps across active phases
forge lock <file> [--phase <N>]    # Advisory file lock
forge unlock <file>                # Release file lock
forge locks                        # Show all active locks

# Team coordination
forge sync                         # Pull latest roadmap + assignments from Dolt
forge status                       # Team-wide status (who's on what, PR states)
forge merge-order                  # Suggested merge order for open PRs
forge dashboard                    # Launch Streamlit team dashboard

# Existing commands (preserved)
forge cost [--team | --dev <name>] # Cost report (now supports team view)
forge logs <task-id>               # Work logs (unchanged)
```

### GSD Integration Points

Forge reads GSD's `.planning/` artifacts to understand what each developer is doing:

| GSD Artifact | Forge Reads | Purpose |
|---|---|---|
| `ROADMAP.md` | Phase definitions, goals, success criteria | Shared source of truth |
| `phases/NN-name/NN-01-PLAN.md` | Touch maps (which files each plan modifies) | Conflict detection |
| `phases/NN-name/NN-01-SUMMARY.md` | Completion status, commits produced | Progress tracking |
| `config.json` | Branching strategy, model profile | Team consistency enforcement |

Forge does NOT modify GSD files. It reads them via the shared git repo.

### Git Multi-User Workflow

**Branching strategy: `phase` (enforced by Forge)**

```
main
├── gsd/phase-01-foundation      (Dev A)
├── gsd/phase-02-core-api        (Dev B)
├── gsd/phase-03-dashboard-ui    (Dev C)
└── gsd/phase-04-integrations    (unassigned)
```

**Rules:**
1. Each phase = one branch = one developer
2. `.planning/STATE.md` is gitignored (per-developer local state)
3. `.planning/ROADMAP.md` and `PROJECT.md` are committed, updated only via PR to main
4. Phase plan/summary files live on phase branches
5. Forge detects touch map overlaps before PRs are merged
6. Merge order: Forge suggests based on dependency graph

**Developer daily workflow:**
```bash
git pull origin main
git checkout gsd/phase-03-dashboard-ui
# Open Claude Code
/gsd:resume-work                   # Restores local context
/gsd:execute-phase 3               # Continues execution
# When done:
/gsd:ship                          # Creates PR
# Forge CI gate runs:
#   - Flow freshness check
#   - Touch map conflict check against other open PRs
#   - Test suite
#   - Cost audit
```

### `.planning/config.json` (Team Standard)

Every developer MUST use this config (Forge validates on PR):

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": false,
    "nyquist_validation": true
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "max_concurrent_agents": 3
  },
  "gates": {
    "confirm_project": true,
    "confirm_roadmap": true,
    "confirm_plan": true,
    "execute_next_plan": true
  },
  "git": {
    "branching_strategy": "phase",
    "phase_branch_template": "gsd/phase-{phase}-{slug}"
  },
  "model_profile": "balanced"
}
```

### `.gitignore` Additions for Multi-User GSD

```gitignore
# GSD per-developer state (not shared)
.planning/STATE.md
.planning/.continue-here
.planning/debug/
```

---

## Implementation Phases (for GSD `/gsd:new-project`)

### Phase 1: Shared Roadmap Server
- Dolt stores the canonical ROADMAP as structured data
- `forge sync` pulls latest to local `.planning/ROADMAP.md`
- `forge phases` shows all phases with ownership
- CLI reads from Dolt, not from local files

### Phase 2: Developer Registry & Phase Assignment
- `forge register` adds developer to Dolt
- `forge claim <phase>` / `forge assign <phase> --to <dev>`
- Phase branches auto-created on claim
- `forge team` shows who's working on what
- Prevents double-assignment (one dev per phase)

### Phase 3: Touch Map Conflict Detection
- On PR open: Forge reads PLAN.md touch maps from phase branch
- Compares against all other active phase branches
- Flags file overlaps: "Phase 3 and Phase 5 both modify `src/auth/login.ts`"
- Advisory file locks: `forge lock src/auth/login.ts --phase 3`
- GitHub check that blocks merge if unresolved conflicts exist

### Phase 4: Flow Document Management
- Keep existing Librarian agent — triggers on push webhook
- Flow freshness gate runs as GitHub Action
- `.flows/` directory with criticality levels
- Team members see which flows are stale in dashboard

### Phase 5: CI Gate Pipeline
- GitHub Action workflow that runs on PR:
  1. Flow freshness check (existing Python gate)
  2. Touch map conflict check (new)
  3. GSD config validation (ensure team standard config)
  4. Test suite pass
  5. Cost audit (new — per-PR cost estimate)
- Forge posts results as PR comment

### Phase 6: Team Dashboard
- Evolve existing Streamlit dashboard
- Views: phase ownership, PR status, merge order, cost per dev, file lock map
- Real-time updates from Dolt
- Link to each developer's phase branch

### Phase 7: Merge Order Engine
- Analyze dependency graph across phases
- Suggest optimal merge order to minimize conflicts
- Handle the case where Phase 2 depends on Phase 1's changes
- Post merge order as PR comment when multiple PRs are open

### Phase 8: Cost Tracking & Reporting
- Each developer reports costs (model, tokens, USD) to Forge
- GSD integration: parse `/gsd:session-report` output
- Team cost dashboard with per-phase, per-developer, per-model breakdown
- Budget alerts when phase cost exceeds threshold

---

## What NOT to Build (Out of Scope)

- **Code generation** — developers use Claude Code + GSD for this
- **Task decomposition** — GSD's planner handles this per-developer
- **Code review AI** — use existing tools (GitHub Copilot review, etc.)
- **Auto-merge** — too risky; keep human merge approval
- **Remote execution** — each dev runs locally
- **Multi-repo orchestration** — single repo focus for v2

---

## Key Technical Decisions

1. **Dolt over Postgres/SQLite** — Git-like versioning of team state, branch/merge semantics for data
2. **Read GSD artifacts, never write them** — Forge is a coordinator, not a replacement for GSD
3. **Advisory locks, not enforced** — trust developers, flag conflicts, don't block
4. **GitHub Actions for CI gates** — standard, no custom CI infra
5. **Phase = branch = developer** — simple 1:1:1 mapping, no shared branches
6. **Webhook-driven, not polling** — GitHub push events trigger Librarian + conflict checks
7. **Streamlit dashboard** — already exists, easy to extend, good enough for team of 3-10

## Conventions

- TypeScript for all orchestrator/CLI code
- Python only for gates and dashboard (existing pattern)
- Vitest for tests
- pnpm workspaces for monorepo management
- Agent prompts in Markdown (not code)
- All schemas in JSON Schema format
- Dolt migrations in `dolt/migrations/` (SQL files, numbered)
- Environment variables in `.env` (never committed)
- Git branch names follow `gsd/phase-{N}-{slug}` pattern
