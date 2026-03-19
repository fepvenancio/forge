# Phase 4: Team Dashboard and Cost Tracking - Research

**Researched:** 2026-03-19
**Domain:** Streamlit dashboard extensions + cost tracking CLI/data layer
**Confidence:** HIGH

## Summary

Phase 4 is a pure visualization and reporting phase. All data sources already exist in Dolt (developers, phase_assignments, file_locks, developer_costs tables), and the existing Streamlit dashboard (`packages/dashboard/`) provides a working foundation with established patterns for Dolt connectivity, page layout, and data display. The work divides cleanly into two domains: (1) new Streamlit pages that read existing v2 team coordination tables, and (2) cost tracking query functions, a CLI command, and budget alert logic.

The existing dashboard has three v0.1.0 pages (task_board, audit_trail, cost_tracker) that query legacy tables. Phase 4 adds four new pages (phase_map, pr_status, file_locks, cost_tracker_v2) and updates the main app.py to reflect v2 branding. The existing `get_connection()` pattern using pymysql with DictCursor and env-var configuration is well-established and should be reused exactly. The `developer_costs` table already exists with indexes, and the TypeScript `DeveloperCost` type is already defined in schema.ts, but **no query functions exist yet** for recording or reading developer costs -- those must be added to queries.ts.

**Primary recommendation:** Follow the existing dashboard page pattern (pymysql DictCursor, `get_connection()` helper, pandas DataFrames, `st.dataframe`/`st.metric`/`st.bar_chart`). Add cost query functions to queries.ts, create a new `forge cost` command that replaces the legacy cycle-based cost command, and add budget alerts via a configurable `FORGE_PHASE_BUDGET_USD` env var.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Streamlit dashboard shows phase ownership (who's on what) | Query `phase_assignments` JOIN `developers`; display as table with status badges |
| DASH-02 | Dashboard shows PR status for all phase branches | Query `phase_assignments` WHERE `pr_number IS NOT NULL`; link to GitHub PR URLs |
| DASH-03 | Dashboard shows merge order recommendation | Call `computeMergeOrder` logic from Python (re-query same Dolt data, apply Kahn's in Python, or shell out to `forge merge-order`) |
| DASH-04 | Dashboard shows file lock map (which files are locked by whom) | Query `file_locks` JOIN `developers`; display as table |
| DASH-05 | Dashboard shows cost per developer and per phase | Query `developer_costs` with GROUP BY developer_id/phase_id; bar charts + metrics |
| DASH-06 | `forge dashboard` launches the Streamlit app | CLI command in TypeScript that spawns `streamlit run packages/dashboard/app.py` |
| COST-01 | Developer costs recorded in Dolt: model, input/output tokens, USD, phase | Add `recordDeveloperCost` and query functions to queries.ts |
| COST-02 | `forge cost` shows cost report (supports `--team` and `--dev <name>` flags) | New command module `commands/cost.ts` replacing the legacy cycle-based cost command |
| COST-03 | Cost-per-PR analysis correlates developer cost reports with phase/PR | Query `developer_costs` JOIN `phase_assignments` WHERE `pr_number IS NOT NULL` |
| COST-04 | Budget alerts when phase cost exceeds configurable threshold | `FORGE_PHASE_BUDGET_USD` env var; check in `recordDeveloperCost` and in `forge cost` output |
| COST-05 | Cost data displayed in team dashboard | Covered by DASH-05 page implementation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| streamlit | >=1.40.0 (installed: 1.53.0) | Dashboard UI framework | Already in use; requirements.txt specifies >=1.40.0 |
| pymysql | >=1.1.0 | Python MySQL/Dolt driver | Already in use by all dashboard pages and gate scripts |
| pandas | >=2.2.0 | DataFrame manipulation for dashboard tables | Already in use by existing dashboard pages |
| commander | (already installed) | TypeScript CLI framework | Already used by cli.ts for all forge commands |
| cli-table3 | (already installed) | Terminal table formatting | Already used by status, phases, merge-order commands |
| mysql2 | (already installed) | TypeScript Dolt driver | Already used by queries.ts via client.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| child_process (Node built-in) | N/A | Spawn Streamlit process for `forge dashboard` | Only for dashboard launch command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pymysql | mysql-connector-python | pymysql is already the project standard; no reason to switch |
| Re-implement Kahn's in Python | Shell out to `forge merge-order --json` | Simpler to re-implement in Python (~30 lines) than add JSON output mode + subprocess |
| plotly charts | Streamlit native charts | Native charts (st.bar_chart, st.metric) sufficient for team of 3-10; plotly adds complexity |

**Installation:**
No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
packages/
  dashboard/
    app.py                    # UPDATE: v2 branding, new sidebar nav
    pages/
      task_board.py           # KEEP (legacy v0.1.0 view)
      audit_trail.py          # KEEP (legacy v0.1.0 view)
      cost_tracker.py         # KEEP (legacy v0.1.0 cycle cost view)
      phase_map.py            # NEW: DASH-01 phase ownership view
      pr_status.py            # NEW: DASH-02 PR status view
      merge_order.py          # NEW: DASH-03 merge order recommendation
      file_locks.py           # NEW: DASH-04 advisory file lock map
      team_costs.py           # NEW: DASH-05/COST-05 cost per dev/phase
  orchestrator/
    src/
      commands/
        cost.ts               # NEW: forge cost --team / --dev
        dashboard.ts          # NEW: forge dashboard (launches Streamlit)
      dolt/
        queries.ts            # EXTEND: add developer cost query functions
```

### Pattern 1: Dashboard Page (established pattern)
**What:** Each Streamlit page is a standalone Python file in `pages/` that follows the existing pattern.
**When to use:** Every new dashboard view.
**Example:**
```python
# Source: packages/dashboard/pages/task_board.py (existing pattern)
import streamlit as st
import pandas as pd
import pymysql
import os
from datetime import datetime

st.set_page_config(page_title="Phase Map - Forge", layout="wide")
st.title("Phase Map")

def get_connection():
    return pymysql.connect(
        host=os.environ.get("DOLT_HOST", "localhost"),
        port=int(os.environ.get("DOLT_PORT", "3306")),
        user=os.environ.get("DOLT_USER", "root"),
        password=os.environ.get("DOLT_PASSWORD", ""),
        database=os.environ.get("DOLT_DATABASE", "forge"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )

def load_data():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT pa.*, d.display_name FROM phase_assignments pa LEFT JOIN developers d ON pa.assignee = d.id ORDER BY pa.phase_id")
            return cursor.fetchall()
    except Exception:
        return []
    finally:
        try:
            conn.close()
        except:
            pass
```

### Pattern 2: CLI Command Module (established pattern)
**What:** Each command group exports a function that registers commands on the Commander program.
**When to use:** For `forge cost` and `forge dashboard`.
**Example:**
```typescript
// Source: packages/orchestrator/src/commands/merge-order.ts (existing pattern)
import { Command } from "commander";

export function costCommands(program: Command): void {
  program
    .command("cost")
    .description("Show cost report")
    .option("--team", "Show team-wide costs")
    .option("--dev <name>", "Show costs for a specific developer")
    .action(async (opts) => {
      // query Dolt, format output
    });
}
```

### Pattern 3: Dolt Query Functions (established pattern)
**What:** All database access goes through `queries.ts` using the `query`, `execute`, `transaction` functions from `client.ts`.
**When to use:** Adding cost tracking query functions.
**Example:**
```typescript
// Source: packages/orchestrator/src/dolt/queries.ts (existing pattern)
export async function recordDeveloperCost(params: {
  developer_id: string;
  phase_id: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}): Promise<DeveloperCost> {
  const now = Date.now();
  await execute(
    `INSERT INTO developer_costs (developer_id, phase_id, model, input_tokens, output_tokens, cost_usd, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [params.developer_id, params.phase_id, params.model, params.input_tokens, params.output_tokens, params.cost_usd, now],
  );
  // Return the inserted record
}
```

### Anti-Patterns to Avoid
- **Shared get_connection() module across pages:** Each existing page defines its own `get_connection()`. While DRY purists would extract it, the Streamlit multi-page app pattern makes shared imports fragile (import path issues when Streamlit loads pages). Follow the existing pattern -- duplicate `get_connection()` per page.
- **Auto-refresh with time.sleep():** The existing `task_board.py` has a vestigial `time.sleep(0)`. Do not add polling. Streamlit refreshes on user interaction. Use `st.cache_data(ttl=60)` for expensive queries.
- **Writing to Dolt from dashboard:** Dashboard is read-only. Never write to Dolt from Streamlit pages.
- **Complex subprocess orchestration for merge order:** Do not shell out to `forge merge-order` from Python. Re-implement the simple Kahn's algorithm in Python (~30 lines) using the same Dolt queries. This avoids subprocess management and Node.js dependency from the Python dashboard.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal tables | Custom string formatting | cli-table3 | Already used by 5+ commands; handles column widths, alignment |
| Dashboard charts | matplotlib/plotly | st.bar_chart, st.metric | Native Streamlit components; zero config; sufficient for team of 3-10 |
| Dolt connection pooling (Python) | Connection pool manager | Per-request pymysql.connect | Dashboard pages are short-lived; connection pooling adds complexity without benefit |
| Budget threshold config | Config file parser | `FORGE_PHASE_BUDGET_USD` env var | Single threshold value; env var is simplest; consistent with DOLT_HOST, FORGE_ESCALATION_WEBHOOK_URL pattern |
| Topological sort (Python dashboard) | Import from TypeScript | Simple Kahn's in Python | ~30 lines; avoids cross-language subprocess; same algorithm as merge-engine.ts |

**Key insight:** Phase 4 is pure read-only visualization. Everything being displayed already exists in Dolt. The complexity is in formatting and presenting data, not in computing it.

## Common Pitfalls

### Pitfall 1: Streamlit Multi-Page App Import Issues
**What goes wrong:** Shared utility modules imported from `pages/` files fail because Streamlit's page discovery changes the working directory context.
**Why it happens:** Streamlit auto-discovers pages in the `pages/` subdirectory. Python import paths are relative to the script location, which varies.
**How to avoid:** Keep each page self-contained with its own `get_connection()`. This is the pattern already established in task_board.py, cost_tracker.py, and audit_trail.py.
**Warning signs:** `ImportError` or `ModuleNotFoundError` when running `streamlit run app.py`.

### Pitfall 2: BIGINT Timestamp Formatting
**What goes wrong:** Dolt stores timestamps as BIGINT (epoch milliseconds), but display code treats them as seconds or ISO strings.
**Why it happens:** Python `datetime.fromtimestamp()` expects seconds, not milliseconds. The existing codebase stores epoch *milliseconds* in all timestamp columns.
**How to avoid:** Always divide by 1000: `datetime.fromtimestamp(ts / 1000)`. The existing `task_board.py` already does this correctly (line 100).
**Warning signs:** Dates showing as year 50000+ or "invalid date".

### Pitfall 3: Legacy Cost Command Conflict
**What goes wrong:** The existing `forge cost <cycle-id>` command in cli.ts (line 208-226) expects a positional cycle-id argument. The new `forge cost` with `--team`/`--dev` flags changes the interface.
**Why it happens:** The legacy command is hard-coded in cli.ts, not in a separate command module.
**How to avoid:** Create a new `commands/cost.ts` module that handles both legacy (cycle-id) and v2 (--team, --dev) interfaces. Remove the inline cost command from cli.ts and replace with the module import. Use `program.command("cost").argument("[cycle-id]", "...").option("--team").option("--dev <name>")` to support both.
**Warning signs:** Commander argument/option conflicts; "error: unknown option" messages.

### Pitfall 4: Missing Developer Cost Query Functions
**What goes wrong:** The `developer_costs` table exists, the TypeScript type `DeveloperCost` exists, but there are zero query functions in queries.ts for recording or reading developer costs.
**Why it happens:** Phase 1 created the schema and types but deferred query functions to Phase 4.
**How to avoid:** Add these functions to queries.ts before building the CLI or dashboard: `recordDeveloperCost`, `getDeveloperCostsByDeveloper`, `getDeveloperCostsByPhase`, `getTeamCosts`, `getPhaseTotalCost`.

### Pitfall 5: Budget Alert Timing
**What goes wrong:** Budget alerts only fire when viewing the dashboard or running `forge cost`, not when costs are recorded.
**Why it happens:** Budget alerts are a display concern -- the cost_audit.py CI gate already notes "No budget threshold enforcement yet (Phase 4 COST-04)".
**How to avoid:** Implement budget check in two places: (1) in `recordDeveloperCost` (return a warning flag if threshold exceeded), and (2) in `forge cost` CLI output and dashboard display. The cost_audit.py CI gate can also be updated to enforce the threshold.

## Code Examples

### Dashboard Page: Phase Map (DASH-01)
```python
# Query for phase ownership view
def load_phase_assignments():
    conn = get_connection()
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT pa.phase_id, pa.assignee, d.display_name,
                   pa.status, pa.branch_name, pa.pr_number, pa.assigned_at
            FROM phase_assignments pa
            LEFT JOIN developers d ON pa.assignee = d.id
            ORDER BY pa.phase_id ASC
        """)
        return cursor.fetchall()
    conn.close()
```

### Cost Recording Query Function (COST-01)
```typescript
// Add to packages/orchestrator/src/dolt/queries.ts
export async function recordDeveloperCost(params: {
  developer_id: string;
  phase_id: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}): Promise<DeveloperCost> {
  const now = Date.now();
  const result = await execute(
    `INSERT INTO developer_costs (developer_id, phase_id, model, input_tokens, output_tokens, cost_usd, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [params.developer_id, params.phase_id, params.model, params.input_tokens, params.output_tokens, params.cost_usd, now],
  );
  return {
    id: (result as any).insertId,
    ...params,
    recorded_at: now,
  };
}

export async function getDeveloperCosts(developerId: string): Promise<DeveloperCost[]> {
  return query<(DeveloperCost & RowDataPacket)[]>(
    `SELECT * FROM developer_costs WHERE developer_id = ? ORDER BY recorded_at DESC`,
    [developerId],
  );
}

export async function getPhaseCosts(phaseId: number): Promise<DeveloperCost[]> {
  return query<(DeveloperCost & RowDataPacket)[]>(
    `SELECT * FROM developer_costs WHERE phase_id = ? ORDER BY recorded_at DESC`,
    [phaseId],
  );
}

export async function getTeamCostSummary(): Promise<Array<{
  developer_id: string;
  phase_id: number;
  total_cost: number;
  total_input: number;
  total_output: number;
  record_count: number;
}>> {
  return query<RowDataPacket[]>(
    `SELECT developer_id, phase_id,
            SUM(cost_usd) as total_cost,
            SUM(input_tokens) as total_input,
            SUM(output_tokens) as total_output,
            COUNT(*) as record_count
     FROM developer_costs
     GROUP BY developer_id, phase_id
     ORDER BY developer_id, phase_id`,
  ) as any;
}

export async function getPhaseTotalCost(phaseId: number): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM developer_costs WHERE phase_id = ?`,
    [phaseId],
  );
  return Number(rows[0]?.total || 0);
}
```

### Forge Cost CLI (COST-02)
```typescript
// packages/orchestrator/src/commands/cost.ts
import { Command } from "commander";
import * as queries from "../dolt/queries.js";
import Table from "cli-table3";

export function costCommands(program: Command): void {
  program
    .command("cost")
    .description("Show cost report (team-wide or per-developer)")
    .argument("[cycle-id]", "Legacy: cycle ID for v0.1.0 cycle costs")
    .option("--team", "Show team-wide cost summary")
    .option("--dev <name>", "Show costs for a specific developer")
    .action(async (cycleId, opts) => {
      if (cycleId && !opts.team && !opts.dev) {
        // Legacy cycle cost path
        return legacyCycleCost(cycleId);
      }
      if (opts.team) {
        return teamCostReport();
      }
      if (opts.dev) {
        return devCostReport(opts.dev);
      }
      // Default: team summary
      return teamCostReport();
    });
}
```

### Forge Dashboard Launch (DASH-06)
```typescript
// packages/orchestrator/src/commands/dashboard.ts
import { Command } from "commander";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

export function dashboardCommands(program: Command): void {
  program
    .command("dashboard")
    .description("Launch the Streamlit team dashboard")
    .option("--port <port>", "Port to run on", "8501")
    .action(async (opts) => {
      const appPath = resolve(__dirname, "../../../dashboard/app.py");
      console.log(`Launching Forge Dashboard on port ${opts.port}...`);
      const child = spawn("streamlit", ["run", appPath, "--server.port", opts.port], {
        stdio: "inherit",
        env: { ...process.env },
      });
      child.on("error", (err) => {
        console.error(`Failed to launch dashboard: ${err.message}`);
        console.error("Ensure streamlit is installed: pip install streamlit");
      });
    });
}
```

### Kahn's Algorithm in Python (for merge order dashboard page)
```python
def compute_merge_order(phases):
    """Topological sort using Kahn's algorithm.

    phases: list of dicts with keys: phase_id, depends_on (list of int), touched_files (list of str)
    Returns: dict with order (list of int), cycles (list of list of int), reasoning (list of str)
    """
    if not phases:
        return {"order": [], "cycles": [], "reasoning": []}

    adj = {p["phase_id"]: [] for p in phases}
    in_degree = {p["phase_id"]: 0 for p in phases}
    reasoning = []
    phase_ids = set(adj.keys())

    # Declared dependencies
    for p in phases:
        for dep in p.get("depends_on", []):
            if dep in phase_ids:
                adj[dep].append(p["phase_id"])
                in_degree[p["phase_id"]] += 1

    # Inferred edges from shared files
    for i, a in enumerate(phases):
        for b in phases[i+1:]:
            shared = set(a.get("touched_files", [])) & set(b.get("touched_files", []))
            if shared:
                lower, higher = (a, b) if a["phase_id"] < b["phase_id"] else (b, a)
                if higher["phase_id"] not in [d for d in lower.get("depends_on", [])] and \
                   lower["phase_id"] not in [d for d in higher.get("depends_on", [])]:
                    adj[lower["phase_id"]].append(higher["phase_id"])
                    in_degree[higher["phase_id"]] += 1
                    reasoning.append(f"Phase {lower['phase_id']} before Phase {higher['phase_id']} (shared files)")

    # BFS
    queue = sorted([k for k, v in in_degree.items() if v == 0])
    order = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        for neighbor in adj.get(current, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
                queue.sort()

    cycle_members = [p["phase_id"] for p in phases if p["phase_id"] not in order]
    cycles = [sorted(cycle_members)] if cycle_members else []

    return {"order": order, "cycles": cycles, "reasoning": reasoning}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cycle-based cost tracking (v0.1.0) | Developer/phase-based cost tracking (v2) | This phase | `forge cost` changes from `<cycle-id>` to `--team`/`--dev` |
| v0.1.0 dashboard pages (task_board, audit_trail, cost_tracker) | Keep + add v2 team pages | This phase | Old pages remain for legacy reference; new pages added alongside |
| No budget alerts | Configurable phase budget threshold | This phase | `FORGE_PHASE_BUDGET_USD` env var |

**Deprecated/outdated:**
- The inline `forge cost <cycle-id>` command in cli.ts (lines 208-226) will be replaced by a modular `commands/cost.ts` that supports both legacy and v2 interfaces.

## Open Questions

1. **Merge order in Python dashboard vs. subprocess**
   - What we know: TypeScript `computeMergeOrder` exists in merge-engine.ts. Dashboard is pure Python.
   - What's unclear: Whether to re-implement Kahn's in Python or add `--json` output to `forge merge-order` and subprocess from Python.
   - Recommendation: Re-implement in Python. ~30 lines. Avoids subprocess complexity and Node.js runtime dependency from the dashboard. Both implementations read from the same Dolt tables, so results will be consistent.

2. **Budget alert destination**
   - What we know: COST-04 says "budget alerts when phase cost exceeds configurable threshold". The escalation module (escalation.ts) already sends to Slack/Discord/Teams.
   - What's unclear: Should budget alerts use the same escalation webhook, or just display in CLI/dashboard?
   - Recommendation: Display in CLI output and dashboard. Optionally trigger escalation webhook if `FORGE_ESCALATION_WEBHOOK_URL` is set. Do not create a separate budget webhook.

3. **Cost data ingestion method**
   - What we know: COST-01 says "developer costs recorded in Dolt". The `recordDeveloperCost` function will be added to queries.ts.
   - What's unclear: How do developers actually record costs? Manual `forge cost record` command? Auto-parsed from GSD session reports?
   - Recommendation: Add a `forge cost record` subcommand for manual entry (model, tokens, cost, phase). Auto-parsing GSD session reports is a v2 feature. The `cost_audit.py` CI gate already reads from `developer_costs` table.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (latest, root-level) |
| Config file | None (vitest auto-discovers from root package.json) |
| Quick run command | `npx vitest run test/unit/commands/cost.test.ts --reporter=verbose` |
| Full suite command | `npx vitest run test/ --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Phase ownership page renders with Dolt data | manual-only | N/A | No -- Streamlit pages are tested by running the app |
| DASH-02 | PR status page shows PR info | manual-only | N/A | No -- Streamlit pages |
| DASH-03 | Merge order page displays computed order | manual-only | N/A | No -- Streamlit pages |
| DASH-04 | File lock page shows lock data | manual-only | N/A | No -- Streamlit pages |
| DASH-05 | Cost view shows per-dev/per-phase costs | manual-only | N/A | No -- Streamlit pages |
| DASH-06 | `forge dashboard` launches Streamlit | unit | `npx vitest run test/unit/commands/dashboard.test.ts -x` | No -- Wave 0 |
| COST-01 | recordDeveloperCost writes to Dolt | unit | `npx vitest run test/unit/dolt/cost-queries.test.ts -x` | No -- Wave 0 |
| COST-02 | `forge cost --team` and `--dev` show reports | unit | `npx vitest run test/unit/commands/cost.test.ts -x` | No -- Wave 0 |
| COST-03 | Cost-per-PR correlates costs with PR data | unit | `npx vitest run test/unit/commands/cost.test.ts -x` | No -- Wave 0 |
| COST-04 | Budget alert fires when threshold exceeded | unit | `npx vitest run test/unit/commands/cost.test.ts -x` | No -- Wave 0 |
| COST-05 | Cost data in dashboard | manual-only | N/A | No -- Streamlit page |

### Sampling Rate
- **Per task commit:** `npx vitest run test/unit/commands/cost.test.ts test/unit/commands/dashboard.test.ts --reporter=verbose`
- **Per wave merge:** `npx vitest run test/ --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/unit/commands/cost.test.ts` -- covers COST-02, COST-03, COST-04
- [ ] `test/unit/commands/dashboard.test.ts` -- covers DASH-06
- [ ] `test/unit/dolt/cost-queries.test.ts` -- covers COST-01

Note: DASH-01 through DASH-05 are Streamlit pages (Python) that are not unit-testable via vitest. They require manual verification with a running Dolt instance. This follows the same pattern as the existing v0.1.0 dashboard pages, which have no automated tests.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/dashboard/app.py`, `pages/task_board.py`, `pages/cost_tracker.py` -- established patterns
- Existing codebase: `packages/orchestrator/src/dolt/queries.ts` -- all existing query functions, confirms no developer_cost queries exist
- Existing codebase: `packages/orchestrator/src/dolt/schema.ts` -- DeveloperCost type already defined
- Existing codebase: `packages/orchestrator/src/cli.ts` -- current command registration pattern, legacy cost command location
- Existing codebase: `packages/orchestrator/src/coordination/merge-engine.ts` -- Kahn's algorithm reference implementation
- Existing codebase: `packages/gates/cost_audit.py` -- CI gate that reads developer_costs, notes "Phase 4 COST-04" for budget enforcement
- Existing codebase: `dolt/schema.sql` -- developer_costs table schema with indexes
- Existing codebase: `test/unit/commands/merge-order.test.ts` -- test pattern for CLI command tests

### Secondary (MEDIUM confidence)
- Streamlit 1.53.0 installed locally; latest available is 1.55.0 -- no breaking changes in minor versions
- requirements.txt specifies `streamlit>=1.40.0` -- current install is compatible

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use; no new dependencies
- Architecture: HIGH -- extending existing patterns with clear precedent from 3 prior phases
- Pitfalls: HIGH -- identified from direct code reading and established patterns
- Dashboard pages: MEDIUM -- Streamlit multi-page app pattern is simple but untested in this project's CI

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable stack, no fast-moving dependencies)
