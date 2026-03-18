# Architecture Research

**Domain:** Team coordination layer for AI-assisted multi-developer workflows
**Researched:** 2026-03-18
**Confidence:** HIGH (brownfield project with clear existing architecture and well-defined target state)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       CLI Layer (forge commands)                      │
│  register  team  assign  claim  phases  sync  status  merge-order    │
│  check-conflicts  lock  unlock  locks  cost  dashboard               │
├──────────────────────────────────────────────────────────────────────┤
│                     Coordination Engine                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Phase      │  │   Conflict   │  │   Merge      │               │
│  │   Manager    │  │   Detector   │  │   Order      │               │
│  │              │  │              │  │   Engine     │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│  ┌──────┴─────────────────┴─────────────────┴──────┐                │
│  │              GSD Artifact Reader                  │                │
│  │   (ROADMAP.md, PLAN.md, SUMMARY.md, config.json)  │                │
│  └───────────────────────┬──────────────────────────┘                │
├──────────────────────────┼───────────────────────────────────────────┤
│                    Event Layer                                        │
│  ┌──────────────┐  ┌────┴─────────┐  ┌──────────────┐               │
│  │   Webhook    │  │   Librarian  │  │   CI Gate    │               │
│  │   Server     │  │   Trigger    │  │   Runner     │               │
│  │  (Express)   │  │              │  │  (GH Action) │               │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘               │
├─────────┼────────────────────────────────────┼───────────────────────┤
│                     Data Layer                                        │
│  ┌──────┴──────────────────────────────────────────┐                │
│  │                  Dolt Database                    │                │
│  │  developers | phase_assignments | file_locks     │                │
│  │  developer_costs | flow_registry | flow_file_refs │                │
│  └─────────────────────────────────────────────────┘                │
├──────────────────────────────────────────────────────────────────────┤
│                    Presentation Layer                                 │
│  ┌──────────────────────────────────────────────────┐               │
│  │           Streamlit Dashboard (Python)            │               │
│  │  Phase Map | PR Status | Merge Order | Cost View  │               │
│  └──────────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────┘
         ↕                    ↕                    ↕
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │  Dev A   │        │  Dev B   │        │  Dev C   │
   │  Claude  │        │  Claude  │        │  Claude  │
   │  Code +  │        │  Code +  │        │  Code +  │
   │  GSD     │        │  GSD     │        │  GSD     │
   └──────────┘        └──────────┘        └──────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **CLI** | Parse commands, dispatch to coordination engine, format output for terminal | Coordination Engine, Dolt |
| **Phase Manager** | Developer registration, phase assignment/claiming, ownership tracking, branch creation | Dolt, Git |
| **Conflict Detector** | Read touch maps from PLAN.md across branches, compare file overlaps, manage advisory locks | GSD Artifact Reader, Dolt, Git |
| **Merge Order Engine** | Analyze phase dependency graph, compute optimal merge sequence, post PR comments | Dolt, GitHub API |
| **GSD Artifact Reader** | Parse `.planning/` files from phase branches (read-only), extract touch maps and status | Git (branch checkout / worktree) |
| **Webhook Server** | Receive GitHub push events, dispatch to Librarian and Conflict Detector | Express, Librarian Trigger, Conflict Detector |
| **Librarian Trigger** | Update `.flows/` documents when code changes, mark freshness in Dolt | Claude Code CLI, Dolt, Git |
| **CI Gate Runner** | GitHub Action: flow freshness, touch map conflicts, config validation, tests, cost audit | Python gates, Dolt, GitHub Checks API |
| **Dolt Data Layer** | Persist all team coordination state (developers, assignments, locks, costs) | MySQL2 driver |
| **Streamlit Dashboard** | Visualize team state: phase map, PR status, merge order, costs, file locks | Dolt (read-only queries) |

## Recommended Project Structure

The v2 architecture should evolve the existing monorepo rather than restructure it. New coordination logic lives alongside existing code, with deprecated v0.1.0 autonomous nodes removed or repurposed.

```
packages/
├── orchestrator/
│   └── src/
│       ├── cli.ts                    # Extended: new team commands
│       ├── commands/                 # NEW: one file per CLI command group
│       │   ├── register.ts           #   forge register, forge team
│       │   ├── phases.ts             #   forge phases, forge claim, forge assign, forge release
│       │   ├── conflicts.ts          #   forge check-conflicts, forge lock, forge unlock, forge locks
│       │   ├── sync.ts               #   forge sync
│       │   ├── status.ts             #   forge status (team-wide)
│       │   ├── merge-order.ts        #   forge merge-order
│       │   └── cost.ts               #   forge cost (extended with --team, --dev)
│       ├── coordination/             # NEW: core coordination logic
│       │   ├── phase-manager.ts      #   Phase assignment, ownership, branch creation
│       │   ├── conflict-detector.ts  #   Touch map comparison, overlap detection
│       │   ├── merge-engine.ts       #   Dependency graph, merge order computation
│       │   ├── lock-manager.ts       #   Advisory file locks
│       │   └── gsd-reader.ts         #   Read-only GSD artifact parser
│       ├── dolt/                     # EVOLVE: new v2 schema + queries
│       │   ├── client.ts             #   Keep: connection pool
│       │   ├── schema.ts             #   Extend: add team coordination types
│       │   ├── queries.ts            #   Extend: add team coordination queries
│       │   └── migrations/           #   NEW: numbered SQL migration files
│       │       ├── 001-v2-schema.sql
│       │       └── 002-indexes.sql
│       ├── nodes/                    # PRUNE: remove autonomous nodes
│       │   ├── librarian-trigger.ts  #   Keep: webhook-driven flow updates
│       │   └── cost-auditor.ts       #   Keep: cost tracking logic
│       ├── graph.ts                  # DEPRECATE or simplify: no longer autonomous pipeline
│       ├── state.ts                  # DEPRECATE: replaced by Dolt-backed team state
│       ├── claude-code.ts            # Keep: used by Librarian
│       ├── prompts/                  # Keep: Librarian prompt
│       └── worktree/                 # Keep: used for reading phase branches
├── webhook/
│   └── src/
│       └── server.ts                 # EVOLVE: add conflict-check trigger on push
├── gates/
│   ├── flow_freshness.py             # Keep
│   ├── touch_map_conflicts.py        # NEW: cross-phase conflict check for CI
│   ├── config_validation.py          # NEW: validate GSD config.json on PR
│   └── cost_audit.py                 # NEW: per-PR cost estimation gate
├── dashboard/
│   ├── app.py                        # EVOLVE: add team coordination views
│   └── pages/                        # EVOLVE: new page per view
│       ├── phase_map.py              # NEW: who owns what phase
│       ├── pr_status.py              # NEW: open PRs and merge order
│       ├── file_locks.py             # NEW: advisory lock visualization
│       └── cost_tracker.py           # NEW: per-dev, per-phase cost view
├── schemas/                          # Keep + extend
├── agents/                           # PRUNE: keep librarian.md, cost-auditor.md
├── templates/                        # Keep
└── models/                           # Keep
```

### Structure Rationale

- **`commands/`:** One file per CLI command group prevents a monolithic `cli.ts`. Each command file exports a handler function; `cli.ts` dispatches based on `process.argv[2]`. This is the standard pattern for CLI tools (cf. git's internal structure).
- **`coordination/`:** Core business logic separated from CLI presentation and data access. These are pure functions that take inputs and return decisions -- easy to test without Dolt or git.
- **Preserve `dolt/`:** The existing client/pool pattern is sound. Extend `schema.ts` with new interfaces and `queries.ts` with new query functions rather than restructuring.
- **Prune `nodes/`:** Most v0.1.0 nodes (planner, worker, sub-judge, high-court, property-gate, etc.) are for autonomous operation. They should be removed or archived. Keep librarian-trigger and cost-auditor as they serve the v2 use case.
- **`graph.ts` deprecation:** The LangGraph state machine was designed for autonomous pipeline orchestration. The v2 model is request-response (CLI command in, action out). LangGraph may still be useful if there are multi-step coordination workflows, but the existing graph with 11 nodes and conditional routing is not the right shape. Evaluate whether to keep LangGraph for simpler coordination flows or replace with direct function calls.

## Architectural Patterns

### Pattern 1: Command-Dispatch CLI

**What:** CLI entry point dispatches to command handlers. Each command handler validates args, calls coordination logic, formats output.
**When to use:** Always -- this is the primary user interface.
**Trade-offs:** Simple and testable. Slightly more files than a single switch statement, but dramatically easier to maintain as command count grows (Forge v2 has 15+ commands).

```typescript
// cli.ts
import { registerCmd } from "./commands/register.js";
import { claimCmd, assignCmd, phasesCmd } from "./commands/phases.js";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  register: registerCmd,
  claim: claimCmd,
  assign: assignCmd,
  phases: phasesCmd,
  // ...
};

async function main() {
  const cmd = process.argv[2];
  const handler = commands[cmd];
  if (!handler) { printUsage(); process.exit(1); }
  await handler(process.argv.slice(3));
}
```

### Pattern 2: Read-Only Artifact Bridge

**What:** Forge reads GSD's `.planning/` files but never writes to them. A dedicated `gsd-reader.ts` module encapsulates all artifact parsing (ROADMAP.md, PLAN.md touch maps, SUMMARY.md status, config.json validation).
**When to use:** Every time Forge needs to understand what a developer is doing on a phase branch.
**Trade-offs:** One-way data flow is simple and safe (no risk of corrupting GSD state). The downside is that Forge's view of developer progress is only as fresh as the last git push. This is acceptable because conflict detection is triggered by push webhooks.

```typescript
// coordination/gsd-reader.ts
export interface PhaseTouchMap {
  phaseId: number;
  branch: string;
  reads: string[];
  writes: string[];
}

export function parsePlanTouchMaps(planContent: string): PhaseTouchMap {
  // Parse PLAN.md to extract touch_map.reads[] and touch_map.writes[]
}

export function parsePhaseStatus(summaryContent: string): "not_started" | "in_progress" | "complete" {
  // Parse SUMMARY.md for completion indicators
}
```

### Pattern 3: Dolt as Single Source of Truth for Team State

**What:** All mutable team coordination state (developer registry, phase assignments, file locks, costs) lives in Dolt. The CLI reads/writes Dolt. The dashboard reads Dolt. Webhook handlers write to Dolt. No in-memory state survives process restarts.
**When to use:** For all team state that needs to be shared across developers and survive restarts.
**Trade-offs:** Dolt requires a running SQL server (dolt sql-server), adding operational overhead. But it provides git-like versioning of team state (you can branch/diff/merge the team database), which is unique and valuable for auditing. The existing Dolt infrastructure is already in place.

### Pattern 4: Event-Driven Coordination (Webhook + CI)

**What:** Coordination actions are triggered by git events, not polling. GitHub push webhooks trigger conflict detection. PR open triggers CI gates. PR merge triggers flow freshness updates.
**When to use:** For all reactive coordination (conflict detection, flow updates, gate enforcement).
**Trade-offs:** Webhook delivery is not guaranteed (GitHub retries, but with delay). For critical operations (CI gates), GitHub Actions provides reliable execution. For advisory operations (conflict detection on push), eventual consistency is acceptable.

```
Developer pushes to gsd/phase-03-dashboard-ui
    ↓
GitHub sends push webhook to Forge webhook server
    ↓
Webhook handler reads PLAN.md from pushed branch
    ↓
Conflict Detector compares touch maps against all other active phase branches
    ↓
If overlap: write warning to Dolt, optionally notify via Slack webhook
    ↓
Developer opens PR
    ↓
GitHub Actions CI gate runs:
  1. flow_freshness.py (existing)
  2. touch_map_conflicts.py (new -- reads from Dolt)
  3. config_validation.py (new)
  4. tests
  5. cost_audit.py (new)
    ↓
Gate results posted as GitHub Check / PR comment
```

## Data Flow

### Phase Assignment Flow

```
Developer                    CLI                     Dolt
    │                         │                       │
    │── forge register ──────>│                       │
    │                         │── INSERT developers ─>│
    │                         │<── OK ────────────────│
    │<── "Registered" ────────│                       │
    │                         │                       │
    │── forge claim 3 ───────>│                       │
    │                         │── SELECT phase_assignments
    │                         │   WHERE phase_id=3 ──>│
    │                         │<── NULL (unassigned) ──│
    │                         │── INSERT assignment ──>│
    │                         │── git branch create ──>│ (local git)
    │<── "Phase 3 assigned" ──│                       │
```

### Conflict Detection Flow

```
Push Event                Webhook Server          Conflict Detector         Dolt
    │                         │                       │                      │
    │── POST /github-webhook >│                       │                      │
    │                         │── trigger ───────────>│                      │
    │                         │                       │── read PLAN.md       │
    │                         │                       │   from pushed branch │
    │                         │                       │── read PLAN.md       │
    │                         │                       │   from all other     │
    │                         │                       │   active branches    │
    │                         │                       │── compare touch maps │
    │                         │                       │                      │
    │                         │                       │── INSERT conflicts ─>│
    │                         │                       │── notify (optional) ─>│ (Slack)
```

### CI Gate Flow

```
PR Opened              GitHub Actions            Gate Runners              Dolt
    │                       │                       │                       │
    │── PR event ──────────>│                       │                       │
    │                       │── run gates ──────────>│                       │
    │                       │                       │── flow_freshness.py   │
    │                       │                       │   (existing) ────────>│
    │                       │                       │── touch_map_conflicts │
    │                       │                       │   (query Dolt) ──────>│
    │                       │                       │── config_validation   │
    │                       │                       │   (check config.json) │
    │                       │                       │── cost_audit          │
    │                       │                       │   (estimate costs) ──>│
    │                       │<── results ────────────│                       │
    │                       │── post PR comment ────>│                       │
    │<── check pass/fail ───│                       │                       │
```

### Key Data Flows

1. **Roadmap Sync:** Dolt stores canonical phase definitions. `forge sync` queries Dolt and writes `.planning/ROADMAP.md` to the developer's local repo. One-way: Dolt -> local file. ROADMAP changes go through PRs to main, then are synced back to Dolt.
2. **Touch Map Aggregation:** Conflict Detector reads PLAN.md files from multiple git branches (via `git show branch:path` or worktree checkouts), parses touch maps, and writes overlap results to Dolt. Dashboard reads overlaps from Dolt for visualization.
3. **Cost Reporting:** Developers report costs after sessions (manually or via GSD session report). CLI parses cost data and writes to `developer_costs` table. Dashboard aggregates for team view.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-3 developers | Current design is optimal. Single Dolt instance, local CLI, webhook on one port. No changes needed. |
| 3-10 developers | Dolt handles this fine. May need to optimize branch reading (cache touch maps in Dolt rather than re-parsing PLAN.md on every check). Advisory locks become more important. |
| 10+ developers | Dolt SQL server may need dedicated hosting. Consider splitting phases into sub-phases for parallelism. Webhook server may need queue (Redis/BullMQ) for bursty push events. This scale is out of scope per PROJECT.md. |

### Scaling Priorities

1. **First bottleneck:** Git branch reading for conflict detection. Reading PLAN.md from N branches on every push is O(N). Fix: cache parsed touch maps in Dolt, invalidate on push to that branch.
2. **Second bottleneck:** Dolt query latency for dashboard. Fix: Streamlit caching (built-in `@st.cache_data`), read replicas if needed (Dolt supports this natively).

## Anti-Patterns

### Anti-Pattern 1: Forge Writing GSD Artifacts

**What people do:** Have Forge update `.planning/STATE.md` or modify ROADMAP.md directly.
**Why it's wrong:** Creates two writers for the same files. GSD expects to own `.planning/`. Merge conflicts become inevitable. Developers lose trust in their local state.
**Do this instead:** Forge reads GSD artifacts (read-only bridge). Team state lives in Dolt. If Forge needs to communicate something to a developer, it does so via CLI output, dashboard, or PR comments -- never by modifying their files.

### Anti-Pattern 2: Keeping the Full LangGraph Pipeline

**What people do:** Try to evolve the existing 11-node autonomous pipeline into a coordination system by adding more nodes.
**Why it's wrong:** The v0.1.0 graph is a sequential pipeline (plan -> work -> judge -> merge). Team coordination is request-response (developer asks question, Forge answers). Shoehorning coordination into a pipeline graph adds complexity without benefit.
**Do this instead:** Archive the autonomous pipeline. Use direct function calls for coordination logic. If a multi-step workflow emerges later (e.g., "check conflicts, then suggest merge order, then post PR comment"), consider a simpler LangGraph graph with 2-3 nodes, not the existing 11-node monster.

### Anti-Pattern 3: Enforced File Locks

**What people do:** Make file locks mandatory -- block developers from editing locked files.
**Why it's wrong:** Creates bottlenecks in a small team. Developers resent it. Lock contention kills velocity. The point of coordination is to prevent surprises, not to prevent work.
**Do this instead:** Advisory locks with visibility. Show who's working on what. Flag overlaps. Let humans decide whether to coordinate or proceed. Trust developers.

### Anti-Pattern 4: Polling for State Changes

**What people do:** Have the CLI or dashboard poll git/Dolt for changes on a timer.
**Why it's wrong:** Wastes resources, introduces latency, and scales poorly. GitHub already provides push webhooks.
**Do this instead:** Webhook-driven updates for reactive coordination. CLI queries Dolt on-demand (user-initiated). Dashboard refreshes on page load or with Streamlit's built-in refresh.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub | Webhooks (push, PR events) + REST API (PR comments, checks) + GitHub Actions | Use existing `@octokit/rest` for API calls. Webhook signature verification already implemented. |
| Slack/Discord/Teams | Outbound webhooks for notifications | Existing human escalation webhook pattern. Extend for conflict notifications. |
| Claude Code CLI | Subprocess invocation for Librarian | Existing `claude-code.ts` wrapper. Only used by Librarian in v2. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI <-> Coordination Engine | Direct function calls | Same process. CLI handler imports coordination module, calls function, formats result. |
| Coordination Engine <-> Dolt | MySQL2 queries via existing pool | Same connection pool pattern. Add new query functions to `queries.ts`. |
| Coordination Engine <-> Git | `execSync` / `child_process` | Existing worktree manager pattern. Add `git show branch:path` for reading files from other branches without checkout. |
| Webhook Server <-> Coordination Engine | In-process function calls OR HTTP to localhost | If webhook server and CLI share a process: direct calls. If separate processes (current design): internal HTTP or shared Dolt writes that CLI reads. Recommend: keep separate processes, communicate via Dolt (webhook writes conflict data, CLI reads it). |
| CI Gates <-> Dolt | Direct MySQL queries from Python | Gates already have this pattern (flow_freshness.py queries Dolt). New gates follow same pattern. |
| Dashboard <-> Dolt | Direct MySQL queries from Python | Existing pattern. Streamlit connects to Dolt via mysql-connector-python. |

## Build Order (Dependency Graph)

Components should be built in this order based on dependencies:

```
Phase 1: Dolt v2 Schema + Queries
    │     (foundation -- everything depends on this)
    ↓
Phase 2: GSD Artifact Reader + Phase Manager
    │     (core coordination logic, no external triggers needed)
    │     CLI commands: register, team, claim, assign, release, phases, sync
    ↓
Phase 3: Conflict Detector + Lock Manager
    │     (depends on: Phase Manager for active phases, GSD Reader for touch maps)
    │     CLI commands: check-conflicts, lock, unlock, locks
    ↓
Phase 4: Webhook Integration + Librarian
    │     (depends on: Conflict Detector to trigger on push)
    │     Evolve webhook server to dispatch to Conflict Detector
    ↓
Phase 5: CI Gate Pipeline
    │     (depends on: Conflict Detector for touch_map_conflicts gate)
    │     GitHub Actions workflow, new Python gate scripts
    ↓
Phase 6: Merge Order Engine
    │     (depends on: Phase Manager for dependency data, Conflict Detector for overlap data)
    │     CLI command: merge-order
    ↓
Phase 7: Team Dashboard
    │     (depends on: all Dolt tables populated by previous phases)
    │     Streamlit pages for each view
    ↓
Phase 8: Cost Tracking & Reporting
          (depends on: Developer registry from Phase 2)
          CLI command: cost --team, cost --dev
```

**Why this order:**
- Dolt schema first because every component reads/writes team state
- Phase Manager second because conflict detection and merge ordering need to know who owns what
- Conflict detection before webhooks because the webhook handler needs to call the conflict detector
- CI gates after conflict detection because the touch_map_conflicts gate queries conflict data from Dolt
- Dashboard last because it is pure visualization -- it reads from Dolt and has no downstream dependencies
- Cost tracking can be built in parallel with dashboard (both depend on Phase 2, not on each other)

## What to Deprecate from v0.1.0

| Component | Action | Rationale |
|-----------|--------|-----------|
| `nodes/planner.ts` | Archive | Developers plan via GSD, not Forge |
| `nodes/worker.ts` | Archive | Developers write code via Claude Code, not Forge workers |
| `nodes/spawn-workers.ts` | Archive | No autonomous workers in v2 |
| `nodes/sub-judge.ts` | Archive | CI gates replace sub-judges |
| `nodes/high-court.ts` | Archive | No autonomous merge decisions |
| `nodes/property-gate.ts` | Archive | CI gates handle validation |
| `nodes/pr-summary.ts` | Archive | Developers create their own PRs via GSD |
| `nodes/dependency-check.ts` | Archive | Conflict Detector replaces this |
| `nodes/human-escalation.ts` | Archive | No autonomous pipeline to escalate from |
| `state.ts` (ForgeState) | Archive | LangGraph state replaced by Dolt-backed team state |
| `graph.ts` (buildForgeGraph) | Archive | No autonomous pipeline graph |
| `agents/planner.md` | Archive | GSD handles planning |
| `agents/worker.md` | Archive | Claude Code handles coding |
| `agents/sub-judge.md` | Archive | CI gates handle validation |
| `agents/high-court.md` | Archive | No autonomous merge decisions |

**Keep:**
- `agents/librarian.md` -- still drives flow document updates
- `agents/cost-auditor.md` -- still drives cost tracking logic
- `nodes/librarian-trigger.ts` -- webhook-driven flow updates
- `nodes/cost-auditor.ts` -- cost aggregation logic (refactor to work with v2 schema)
- `dolt/client.ts` -- connection pool pattern is reusable
- `claude-code.ts` -- Librarian still invokes Claude Code
- `worktree/manager.ts` -- useful for reading files from phase branches

## Sources

- Existing codebase analysis (HIGH confidence -- direct code reading)
- CLAUDE.md project specification (HIGH confidence -- authoritative project document)
- `.planning/PROJECT.md` (HIGH confidence -- validated project requirements)
- `.planning/codebase/ARCHITECTURE.md` (HIGH confidence -- current architecture analysis)

---
*Architecture research for: Forge team coordination layer*
*Researched: 2026-03-18*
