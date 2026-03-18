# Phase 1: Foundation and Developer Registry - Research

**Researched:** 2026-03-18
**Domain:** Dolt schema migration, CLI framework (commander), developer identity, phase assignment, git branch management
**Confidence:** HIGH

## Summary

Phase 1 establishes the data foundation and developer-facing CLI for Forge v2. It requires three main deliverables: (1) archiving v0.1.0 Dolt data and creating the v2 schema with `developers`, `phase_assignments`, `file_locks`, and `developer_costs` tables; (2) building a commander-based CLI framework replacing the manual switch statement in `cli.ts`, with `forge register` and `forge team` commands; (3) implementing phase assignment commands (`forge claim`, `forge assign`, `forge release`, `forge phases`) with automatic branch creation following the `gsd/phase-{N}-{slug}` pattern and 1:1:1 enforcement.

The existing codebase provides a solid foundation: `dolt/client.ts` has a working connection pool with `query()`, `execute()`, and `transaction()` helpers; `dolt/schema.ts` and `dolt/queries.ts` establish the pattern for TypeScript type mirrors and query functions; and `cli.ts` has a clean entry point via `tsx`. The v2 work extends these patterns rather than replacing them.

**Primary recommendation:** Follow the existing `dolt/queries.ts` pattern for new v2 query functions. Use commander 14.0.3 with `@commander-js/extra-typings` for the CLI rewrite. Archive v0.1.0 tables with `v1_` prefix and a Dolt tag before creating new tables. Use `simple-git` for branch operations, not raw `execSync`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | Clean-slate Dolt v2 schema with `developers`, `phase_assignments`, `file_locks`, `developer_costs` tables | SQL CREATE TABLE statements, TypeScript interfaces, Dolt schema patterns from existing codebase |
| SCHEMA-02 | Archive v0.1.0 data safely before dropping old tables | Dolt tag + RENAME TABLE to `v1_` prefix strategy; init-dolt.sh pattern for schema application |
| SCHEMA-03 | All Dolt writes serialized through single process to prevent concurrent write conflicts | Existing connection pool pattern already serializes via single pool; document constraint for CLI usage |
| IDENT-01 | Developer can register with `forge register` using their GitHub username | Commander command definition; `git config user.name` for identity detection; INSERT INTO developers |
| IDENT-02 | Developer can view all registered team members with `forge team` | cli-table3 for formatted output; SELECT from developers table |
| IDENT-03 | Developer registration persists in Dolt `developers` table with `last_active` timestamp | Dolt INSERT + timestamp pattern from existing queries.ts |
| PHASE-01 | Developer can claim an unassigned phase with `forge claim <phase>` | Transaction-based claim with SELECT-then-INSERT to prevent races; branch auto-creation |
| PHASE-02 | Team lead can assign a phase to a developer with `forge assign <phase> --to <dev>` | Commander option parsing; similar transaction pattern to claim |
| PHASE-03 | Developer can release their phase assignment with `forge release <phase>` | UPDATE phase_assignments SET status/assignee; branch cleanup optional |
| PHASE-04 | `forge phases` shows all phases with current ownership and status | cli-table3 table output; JOIN developers and phase_assignments |
| PHASE-05 | Phase assignment enforces 1:1:1 model (one phase, one branch, one developer) | Transaction-level uniqueness check before INSERT; Dolt PRIMARY KEY on phase_id |
| PHASE-06 | Phase status tracks lifecycle: assigned, in_progress, pr_open, merged, blocked | VARCHAR status column with validation at application level (Zod or manual) |
| BRANCH-01 | Branch auto-created on `forge claim` following `gsd/phase-{N}-{slug}` pattern | simple-git `branch()` API; template string interpolation |
| BRANCH-02 | Branch naming convention enforced by Forge (reject non-conforming branches) | Regex validation: `/^gsd\/phase-\d+-[a-z0-9-]+$/` |
| CLI-01 | All commands available via `forge <command>` with consistent help output | Commander program with subcommands; auto-generated --help |
| CLI-02 | CLI uses commander with git-style subcommands | Commander `.command()` API with action handlers |
| CLI-03 | `forge sync` pulls latest roadmap and assignments from Dolt | SELECT from phase_assignments; display current state |
| CLI-04 | `forge status` shows team-wide status (who's on what, PR states) | JOIN across developers, phase_assignments; cli-table3 output |
</phase_requirements>

## Standard Stack

### Core (New Dependencies for Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | 14.0.3 | CLI command routing, arg parsing, help generation | Zero dependencies, ESM-native, git-style subcommands. Replaces manual switch in cli.ts. 35M+ weekly downloads. |
| @commander-js/extra-typings | 14.0.0 | End-to-end TypeScript inference for parsed CLI args | Eliminates manual type casts for options/arguments. Requires TS 5.0+ (we have 5.7). |
| simple-git | 3.33.0 | Programmatic git operations (branch creation, listing) | Typed async API wrapping real git binary. Replaces brittle `execSync("git ...")` pattern. |
| chalk | 5.6.2 | Terminal colors/styling for CLI output | ESM-only (matches `"type": "module"`). Status indicators for phase states. |
| cli-table3 | 0.6.5 | Formatted ASCII tables for `forge team`, `forge phases` | Aligned table output with column spanning and word wrap. |
| zod | 4.3.6 | Runtime validation for CLI inputs, Dolt row shapes | TypeScript-first validation with `z.infer<>` for automatic type derivation. Use for v2 internal types, keep AJV for external JSON Schema. |

### Existing (No Changes)

| Library | Version | Purpose |
|---------|---------|---------|
| mysql2/promise | 3.20.0 | Dolt connection via MySQL protocol |
| uuid | 13.0.0 | ID generation for developers, assignments |
| tsx | 4.21.0 | TypeScript execution for CLI entry point |
| vitest | 3.0.0 | Test runner |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | yargs 18 | Yargs has 7 deps vs commander's 0. Commander's subcommand model maps directly to `forge <cmd>` pattern. |
| commander | node:util parseArgs (current) | parseArgs lacks help generation and scales poorly beyond 10 commands. |
| simple-git | execSync (current) | No error handling, no output parsing, no async. Brittle for branch operations. |
| zod 4 | Manual validation | Zod provides `z.infer<>` for auto TypeScript types. Manual validation is verbose and error-prone. |

**Installation:**
```bash
cd packages/orchestrator
pnpm add commander@^14.0.3 @commander-js/extra-typings@^14.0.0 simple-git@^3.33.0 chalk@^5.6.2 cli-table3@^0.6.5 zod@^4.3.6
pnpm add -D @types/cli-table3
```

**Version verification:** All versions verified against npm registry on 2026-03-18. All match STACK.md recommendations.

## Architecture Patterns

### Recommended Project Structure

```
packages/orchestrator/src/
├── cli.ts                    # REWRITE: commander-based entry point
├── commands/                 # NEW: one file per command group
│   ├── register.ts           #   forge register, forge team
│   ├── phases.ts             #   forge phases, forge claim, forge assign, forge release
│   ├── sync.ts               #   forge sync
│   └── status.ts             #   forge status
├── coordination/             # NEW: core business logic
│   └── phase-manager.ts      #   Phase assignment, ownership, branch creation
├── dolt/                     # EXTEND: add v2 tables
│   ├── client.ts             #   Keep: connection pool (unchanged)
│   ├── schema.ts             #   Extend: add Developer, PhaseAssignment, etc.
│   ├── queries.ts            #   Extend: add team coordination queries
│   └── migrations/           #   NEW: numbered SQL migration files
│       └── 001-v2-schema.sql #     Archive v1 + create v2 tables
└── ...existing files...
```

### Pattern 1: Commander CLI with Command Modules

**What:** Replace the manual `switch(command)` in `cli.ts` with commander's `.command()` API. Each command group gets its own file that exports a function receiving the commander program.

**When to use:** All CLI commands.

```typescript
// cli.ts — new entry point
import { Command } from "commander";
import { registerCommands } from "./commands/register.js";
import { phaseCommands } from "./commands/phases.js";

const program = new Command();
program
  .name("forge")
  .description("Forge — Team Coordination Layer")
  .version("2.0.0");

registerCommands(program);
phaseCommands(program);
// ... more command groups

program.parse();
```

```typescript
// commands/register.ts
import type { Command } from "commander";
import { query, execute } from "../dolt/client.js";

export function registerCommands(program: Command) {
  program
    .command("register")
    .description("Register current git user as a Forge developer")
    .action(async () => {
      // Get git user identity
      // INSERT INTO developers
      // Print confirmation
    });

  program
    .command("team")
    .description("List all registered developers")
    .action(async () => {
      // SELECT * FROM developers
      // Format as cli-table3
    });
}
```

### Pattern 2: Extend Existing Dolt Layer

**What:** Add new TypeScript interfaces to `schema.ts` and new query functions to `queries.ts` following the exact same patterns already used (e.g., `createTask`, `getTask`, `updateTaskStatus`).

**When to use:** All v2 database operations.

```typescript
// dolt/schema.ts — additions
export interface Developer {
  id: string;           // github username (PRIMARY KEY)
  display_name: string;
  registered_at: number;
  last_active: number;
  current_phase: number | null;
  current_branch: string | null;
}

export type PhaseStatus = "assigned" | "in_progress" | "pr_open" | "merged" | "blocked";

export interface PhaseAssignment {
  phase_id: number;     // PRIMARY KEY
  assignee: string;     // developer.id
  assigned_at: number;
  status: PhaseStatus;
  branch_name: string;
  pr_number: number | null;
}
```

```typescript
// dolt/queries.ts — additions
export async function registerDeveloper(params: {
  id: string;
  display_name: string;
}): Promise<Developer> {
  const now = Date.now();
  await execute(
    `INSERT INTO developers (id, display_name, registered_at, last_active)
     VALUES (?, ?, ?, ?)`,
    [params.id, params.display_name, now, now],
  );
  return getDeveloper(params.id) as Promise<Developer>;
}

export async function claimPhase(params: {
  phase_id: number;
  assignee: string;
  branch_name: string;
}): Promise<PhaseAssignment> {
  return transaction(async (conn) => {
    // Check not already assigned
    const [existing] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM phase_assignments WHERE phase_id = ?`,
      [params.phase_id],
    );
    if ((existing as RowDataPacket[]).length > 0) {
      throw new Error(`Phase ${params.phase_id} is already assigned`);
    }
    // Check developer doesn't already have a phase
    const [devPhase] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM phase_assignments WHERE assignee = ? AND status NOT IN ('merged', 'blocked')`,
      [params.assignee],
    );
    if ((devPhase as RowDataPacket[]).length > 0) {
      throw new Error(`Developer ${params.assignee} already has an active phase`);
    }
    // Assign
    const now = Date.now();
    await conn.execute(
      `INSERT INTO phase_assignments (phase_id, assignee, assigned_at, status, branch_name)
       VALUES (?, ?, ?, 'assigned', ?)`,
      [params.phase_id, params.assignee, now, params.branch_name],
    );
    return { phase_id: params.phase_id, assignee: params.assignee, assigned_at: now, status: "assigned" as const, branch_name: params.branch_name, pr_number: null };
  });
}
```

### Pattern 3: Transaction-Based 1:1:1 Enforcement

**What:** Use Dolt transactions to enforce that one phase maps to one branch maps to one developer. The `claimPhase` function checks both phase availability AND developer availability inside a single transaction.

**When to use:** All phase assignment mutations (claim, assign, release).

**Why:** Dolt supports REPEATABLE_READ isolation. A transaction ensures the check-then-write is atomic. Without this, two developers running `forge claim 3` simultaneously could both succeed.

### Pattern 4: Git Identity Detection

**What:** Use `simple-git` to read `git config user.name` and `git config user.email` for developer identity, rather than requiring manual username input.

```typescript
import simpleGit from "simple-git";

async function getGitIdentity(): Promise<{ name: string; email: string }> {
  const git = simpleGit();
  const name = await git.getConfig("user.name");
  const email = await git.getConfig("user.email");
  if (!name.value || !email.value) {
    throw new Error("Git user.name and user.email must be configured");
  }
  return { name: name.value, email: email.value };
}
```

### Anti-Patterns to Avoid

- **Extending the LangGraph graph for CLI commands:** The v2 CLI is request-response, not a state machine pipeline. Use direct function calls, not graph nodes.
- **Using ENUM columns in Dolt:** Dolt's ENUM support is limited. Use VARCHAR with application-level validation (Zod).
- **Dropping v0.1.0 tables without archiving:** Always RENAME TABLE with `v1_` prefix and create a Dolt tag first.
- **Building an HTTP API between CLI and Dolt:** The CLI connects directly to Dolt via mysql2. No intermediate server needed for Phase 1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI arg parsing + help | Manual switch on process.argv | commander 14.0.3 | 15+ commands with varied arg shapes; auto-generated help |
| Git branch operations | execSync("git checkout -b ...") | simple-git 3.33.0 | Error handling, async, typed API, handles edge cases (spaces, encoding) |
| Terminal tables | Console.log with padding | cli-table3 0.6.5 | Column alignment, word wrap, custom borders |
| Input validation | Manual if/else checks | zod 4.3.6 | Type inference, composable schemas, descriptive error messages |
| Terminal colors | ANSI escape codes | chalk 5.6.2 | Cross-platform, 256-color support, clean API |

**Key insight:** Phase 1 introduces 8+ new CLI commands. Building argument parsing, help generation, and output formatting by hand would consume most of the implementation time. These are solved problems.

## Common Pitfalls

### Pitfall 1: Dolt ENUM Column Compatibility
**What goes wrong:** Using `ENUM('assigned', 'in_progress', 'pr_open', 'merged', 'blocked')` for status columns. Dolt has partial ENUM support that behaves differently from MySQL in edge cases.
**Why it happens:** The CLAUDE.md schema example uses ENUM.
**How to avoid:** Use `VARCHAR(32)` with application-level validation via Zod. This is more flexible and avoids Dolt-specific quirks.
**Warning signs:** Migration errors or unexpected behavior when inserting status values.

### Pitfall 2: v0.1.0 Schema Migration Destroys History
**What goes wrong:** Running `DROP TABLE` on v0.1.0 tables loses operational data that may be needed for debugging or auditing.
**Why it happens:** Clean-slate feels simpler than migration. Dolt's branch history creates false safety.
**How to avoid:** (1) Create Dolt tag `v0.1.0-archive` before any changes. (2) Rename tables with `v1_` prefix using `RENAME TABLE tasks TO v1_tasks`. (3) Document how to query archived data. (4) Create new tables with v2 names.
**Warning signs:** Scripts that start with `DROP TABLE IF EXISTS`.

### Pitfall 3: Concurrent CLI Writes Corrupt Dolt State
**What goes wrong:** Two developers running `forge claim` simultaneously. Dolt's REPEATABLE_READ isolation means the second transaction may not see the first's uncommitted writes, leading to double-assignment.
**Why it happens:** CLI processes are independent. No global lock coordinator for Phase 1.
**How to avoid:** Use explicit SQL transactions with `SELECT ... FOR UPDATE` (if Dolt supports it) or use INSERT with unique constraints that cause the second insert to fail. The `phase_assignments.phase_id` PRIMARY KEY naturally prevents duplicate phase claims. For the developer-side constraint (one dev, one active phase), add a check inside the transaction.
**Warning signs:** Two developers assigned to the same phase in the database.

### Pitfall 4: Git Identity Mismatch Between Developers
**What goes wrong:** Developer registers as "alice" but their git config says "Alice Smith". Or they use different usernames across machines.
**Why it happens:** No enforced identity standard. `git config user.name` varies.
**How to avoid:** Use GitHub username as the canonical ID (from `git config user.name` or prompt for it). Store both `id` (canonical) and `display_name` (for output). Allow `--name <github-username>` override on `forge register`.
**Warning signs:** Duplicate developer entries with slightly different names.

### Pitfall 5: Branch Creation Fails on Existing Branches
**What goes wrong:** `forge claim 3` tries to create `gsd/phase-3-foundation` but the branch already exists from a previous abandoned assignment.
**Why it happens:** Branch was created but phase was released without deleting the branch.
**How to avoid:** Check if branch exists before creating. If it exists and is associated with the claiming developer, reuse it. If it belongs to someone else, error with a helpful message. On `forge release`, offer `--delete-branch` flag.
**Warning signs:** `git checkout -b` fails with "already exists".

## Code Examples

### Dolt v2 Migration SQL

```sql
-- 001-v2-schema.sql
-- Step 1: Archive v0.1.0 tables (rename, don't drop)
RENAME TABLE tasks TO v1_tasks;
RENAME TABLE cycles TO v1_cycles;
RENAME TABLE stage_runs TO v1_stage_runs;
RENAME TABLE touch_maps TO v1_touch_maps;
RENAME TABLE artifacts TO v1_artifacts;
RENAME TABLE cycle_costs TO v1_cycle_costs;
RENAME TABLE work_logs TO v1_work_logs;
-- Keep flow_registry and flow_file_refs (still used in v2)

-- Step 2: Create v2 tables
CREATE TABLE IF NOT EXISTS developers (
  id            VARCHAR(64)   PRIMARY KEY,
  display_name  VARCHAR(128)  NOT NULL,
  registered_at BIGINT        NOT NULL,
  last_active   BIGINT        NOT NULL,
  current_phase INT           NULL,
  current_branch VARCHAR(256) NULL
);

CREATE TABLE IF NOT EXISTS phase_assignments (
  phase_id      INT           PRIMARY KEY,
  assignee      VARCHAR(64)   NOT NULL,
  assigned_at   BIGINT        NOT NULL,
  status        VARCHAR(32)   NOT NULL DEFAULT 'assigned',
  branch_name   VARCHAR(256)  NOT NULL,
  pr_number     INT           NULL,
  INDEX idx_phase_assignee (assignee)
);

-- file_locks and developer_costs tables created now but populated in later phases
CREATE TABLE IF NOT EXISTS file_locks (
  file_path     VARCHAR(512)  PRIMARY KEY,
  locked_by     VARCHAR(64)   NOT NULL,
  phase_id      INT           NOT NULL,
  locked_at     BIGINT        NOT NULL,
  reason        VARCHAR(256)  NULL
);

CREATE TABLE IF NOT EXISTS developer_costs (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  developer_id  VARCHAR(64)   NOT NULL,
  phase_id      INT           NOT NULL,
  model         VARCHAR(64)   NOT NULL,
  input_tokens  BIGINT        DEFAULT 0,
  output_tokens BIGINT        DEFAULT 0,
  cost_usd      DECIMAL(10,4) DEFAULT 0,
  recorded_at   BIGINT        NOT NULL,
  INDEX idx_dev_costs_developer (developer_id),
  INDEX idx_dev_costs_phase (phase_id)
);
```

### Commander CLI Setup

```typescript
// cli.ts
import { Command } from "commander";

const program = new Command();
program
  .name("forge")
  .description("Forge -- Team Coordination Layer for AI-Assisted Development")
  .version("2.0.0");

// Import and attach command groups
// registerCommands(program);
// phaseCommands(program);
// syncCommands(program);
// statusCommands(program);

// Preserve legacy commands during transition
// program.command("run").description("(legacy) Start a cycle").action(...)

program.parse();
```

### simple-git Branch Creation

```typescript
import simpleGit from "simple-git";

async function createPhaseBranch(phaseId: number, slug: string): Promise<string> {
  const git = simpleGit();
  const branchName = `gsd/phase-${phaseId}-${slug}`;

  // Check if branch already exists
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    throw new Error(`Branch ${branchName} already exists`);
  }

  // Create branch from current HEAD (main)
  await git.checkoutBranch(branchName, "HEAD");
  // Return to previous branch
  await git.checkout("-");

  return branchName;
}
```

### cli-table3 Output Formatting

```typescript
import Table from "cli-table3";
import chalk from "chalk";

function formatPhaseStatus(status: string): string {
  switch (status) {
    case "assigned": return chalk.blue(status);
    case "in_progress": return chalk.yellow(status);
    case "pr_open": return chalk.cyan(status);
    case "merged": return chalk.green(status);
    case "blocked": return chalk.red(status);
    default: return status;
  }
}

function displayPhases(phases: PhaseAssignment[]): void {
  const table = new Table({
    head: ["Phase", "Assignee", "Status", "Branch"],
    style: { head: ["cyan"] },
  });
  for (const p of phases) {
    table.push([
      String(p.phase_id),
      p.assignee,
      formatPhaseStatus(p.status),
      p.branch_name,
    ]);
  }
  console.log(table.toString());
}
```

## State of the Art

| Old Approach (v0.1.0) | Current Approach (v2) | Impact |
|------------------------|----------------------|--------|
| Manual switch on process.argv[2] | Commander with typed subcommands | Scalable to 15+ commands with auto-help |
| execSync("git ...") | simple-git async API | Error handling, typed results, no shell injection risk |
| Autonomous LangGraph pipeline | Request-response CLI commands | Simpler architecture, no state machine for CLI |
| Single-operator mode | Multi-developer with Dolt-backed registry | Team coordination |
| In-memory ForgeState | Dolt as single source of truth | Survives restarts, shared across developers |

**Deprecated/outdated:**
- `state.ts` ForgeState: Replaced by Dolt-backed team state for v2 coordination
- `graph.ts` buildForgeGraph: Not needed for CLI command-response pattern
- `nodes/planner.ts`, `nodes/worker.ts`, etc.: Autonomous factory nodes, not used in v2

## Open Questions

1. **Dolt RENAME TABLE support**
   - What we know: Standard MySQL supports `RENAME TABLE`. Dolt aims for MySQL compatibility.
   - What's unclear: Whether Dolt's RENAME TABLE preserves version history correctly across renames.
   - Recommendation: Test the rename in development before running in production. Fallback: CREATE new tables, INSERT...SELECT from old, then DROP old.

2. **Phase metadata source**
   - What we know: `forge phases` needs to show phase names and descriptions. ROADMAP.md has this data.
   - What's unclear: Whether phase metadata should be stored in Dolt (structured) or parsed from ROADMAP.md on each `forge phases` call.
   - Recommendation: For Phase 1, hardcode or parse from ROADMAP.md. Structured phase data in Dolt is deferred to a later phase per REQUIREMENTS.md (ROADMAP-01, ROADMAP-02 are v2 requirements).

3. **Legacy CLI commands**
   - What we know: Existing commands (run, start, stop, resume, cancel, cost, logs, init) are defined in cli.ts.
   - What's unclear: Whether to preserve them in the commander rewrite or deprecate them.
   - Recommendation: Preserve them as-is in the commander structure. They can be marked as "(legacy)" in help text. Do not break existing functionality.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.0 |
| Config file | None (vitest defaults; tests discovered in `test/` directory) |
| Quick run command | `pnpm --filter @forge/orchestrator test` |
| Full suite command | `pnpm test` (runs all workspace packages) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | v2 tables created successfully | integration | `pnpm vitest run test/integration/v2-schema.test.ts -x` | No -- Wave 0 |
| SCHEMA-02 | v0.1.0 tables archived with v1_ prefix | integration | `pnpm vitest run test/integration/v2-schema.test.ts -x` | No -- Wave 0 |
| SCHEMA-03 | Concurrent writes serialized (no corruption) | integration | `pnpm vitest run test/integration/v2-schema.test.ts -x` | No -- Wave 0 |
| IDENT-01 | `forge register` creates developer record | unit | `pnpm vitest run test/unit/commands/register.test.ts -x` | No -- Wave 0 |
| IDENT-02 | `forge team` lists all developers | unit | `pnpm vitest run test/unit/commands/register.test.ts -x` | No -- Wave 0 |
| IDENT-03 | Developer persisted with last_active timestamp | integration | `pnpm vitest run test/integration/developer-registry.test.ts -x` | No -- Wave 0 |
| PHASE-01 | `forge claim` assigns unassigned phase | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| PHASE-02 | `forge assign --to` assigns phase to specific dev | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| PHASE-03 | `forge release` releases phase assignment | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| PHASE-04 | `forge phases` shows all phases with ownership | unit | `pnpm vitest run test/unit/commands/phases.test.ts -x` | No -- Wave 0 |
| PHASE-05 | 1:1:1 enforcement (rejects double-assignment) | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| PHASE-06 | Status lifecycle tracking | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| BRANCH-01 | Branch auto-created on claim | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| BRANCH-02 | Non-conforming branch names rejected | unit | `pnpm vitest run test/unit/coordination/phase-manager.test.ts -x` | No -- Wave 0 |
| CLI-01 | All commands available with --help | smoke | `pnpm forge --help` | No -- Wave 0 |
| CLI-02 | Commander subcommands work | smoke | `pnpm forge register --help` | No -- Wave 0 |
| CLI-03 | `forge sync` displays current state | unit | `pnpm vitest run test/unit/commands/sync.test.ts -x` | No -- Wave 0 |
| CLI-04 | `forge status` shows team-wide state | unit | `pnpm vitest run test/unit/commands/status.test.ts -x` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @forge/orchestrator test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/unit/coordination/phase-manager.test.ts` -- covers PHASE-01 through PHASE-06, BRANCH-01, BRANCH-02
- [ ] `test/unit/commands/register.test.ts` -- covers IDENT-01, IDENT-02
- [ ] `test/unit/commands/phases.test.ts` -- covers PHASE-04, CLI-01, CLI-02
- [ ] `test/unit/commands/sync.test.ts` -- covers CLI-03
- [ ] `test/unit/commands/status.test.ts` -- covers CLI-04
- [ ] `test/integration/v2-schema.test.ts` -- covers SCHEMA-01, SCHEMA-02, SCHEMA-03
- [ ] `test/integration/developer-registry.test.ts` -- covers IDENT-03

Note: Unit tests should mock the Dolt layer (mock `query()` and `execute()` from `dolt/client.ts`). Integration tests require a running Dolt instance. The existing `test/integration/dolt-crud.test.ts` demonstrates the integration test pattern.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/orchestrator/src/dolt/client.ts`, `queries.ts`, `schema.ts` -- establishes all Dolt query patterns
- Existing codebase: `packages/orchestrator/src/cli.ts` -- current CLI structure to evolve
- Existing codebase: `dolt/schema.sql` -- current v0.1.0 schema (10 tables)
- Existing codebase: `scripts/init-dolt.sh` -- schema initialization pattern
- npm registry: commander 14.0.3, simple-git 3.33.0, chalk 5.6.2, cli-table3 0.6.5, zod 4.3.6 -- all versions verified 2026-03-18
- `.planning/research/STACK.md` -- stack decisions and alternatives analysis
- `.planning/research/ARCHITECTURE.md` -- component responsibilities and project structure
- `.planning/research/PITFALLS.md` -- Dolt concurrency, schema migration, and 1:1:1 pitfalls

### Secondary (MEDIUM confidence)
- CLAUDE.md Dolt schema examples -- authoritative project spec but ENUM usage needs adjustment for Dolt compatibility

### Tertiary (LOW confidence)
- Dolt RENAME TABLE behavior -- assumed MySQL-compatible but not verified against Dolt docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified on npm, existing codebase patterns are clear
- Architecture: HIGH -- extends proven existing patterns (dolt/queries.ts, cli.ts)
- Pitfalls: HIGH -- well-documented in PITFALLS.md research, Dolt concurrency behavior known

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain, 30-day window)
