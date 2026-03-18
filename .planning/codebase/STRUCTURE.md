# Codebase Structure

**Analysis Date:** 2026-03-18

## Directory Layout

```
forge/
├── packages/                    # pnpm workspace root
│   ├── orchestrator/            # Main LangGraph orchestrator + CLI
│   │   ├── src/
│   │   │   ├── cli.ts           # Entry point: forge commands
│   │   │   ├── graph.ts         # LangGraph StateGraph assembly
│   │   │   ├── state.ts         # ForgeState definition (Annotation.Root)
│   │   │   ├── claude-code.ts   # Claude Code CLI subprocess wrapper
│   │   │   ├── nodes/           # 11 agent node implementations
│   │   │   ├── gates/           # Validation gates (schema, property, plan)
│   │   │   ├── dolt/            # Database client, queries, schema types
│   │   │   ├── worktree/        # Git worktree isolation manager
│   │   │   ├── models/          # Model selection, LOC counting, config
│   │   │   ├── prompts/         # Prompt loading + loader.ts
│   │   │   └── utils/           # Path utilities (FORGE_DIR, AGENTS_DIR)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── agents/                  # System prompts for each agent role
│   │   ├── planner.md           # Decomposes PRP into tasks with touch maps
│   │   ├── worker.md            # Executes a single task end-to-end
│   │   ├── sub-judge.md         # Validates worker output
│   │   ├── high-court.md        # Decides merge/abort/escalate
│   │   ├── librarian.md         # Updates flow documentation
│   │   ├── cost-auditor.md      # Aggregates costs, checks budget
│   │   └── tests/               # Prompt validation tests
│   │
│   ├── schemas/                 # JSON schemas for typed artifacts
│   │   ├── plan.schema.json
│   │   ├── touch-map.schema.json
│   │   ├── sub-judge-report.schema.json
│   │   ├── high-court-report.schema.json
│   │   ├── cycle-cost-report.schema.json
│   │   ├── property-test-report.schema.json
│   │   └── security-report.schema.json
│   │
│   ├── webhook/                 # GitHub webhook + local commit listener
│   │   ├── src/
│   │   │   └── server.ts        # Express app on FORGE_WEBHOOK_PORT
│   │   └── package.json
│   │
│   ├── gates/                   # CI validation gates (Python)
│   │   ├── flow_freshness.py    # Blocks merge if flows are stale
│   │   └── requirements.txt
│   │
│   ├── dashboard/               # Streamlit monitoring UI (deprecated)
│   │   ├── pages/
│   │   └── package.json
│   │
│   └── templates/               # Starter project templates
│       ├── nextjs-postgres/
│       ├── go-service/
│       ├── python-fastapi/
│       └── react-native/
│
├── dolt/                        # Dolt database configuration
│   ├── schema.sql               # All Dolt tables (tasks, cycles, flows, costs, etc.)
│   ├── .doltcfg/                # Dolt config directory
│   ├── forge/                   # Dolt data directory (auto-managed)
│   └── config.yaml              # Dolt server config
│
├── scripts/                     # Utility scripts
│   ├── init-dolt.sh             # Initialize Dolt schema
│   └── ...
│
├── docker/                      # Docker config (legacy worker image)
│   ├── Dockerfile               # forge-worker image
│   └── entrypoint.sh
│
├── test/                        # Test suites
│   ├── e2e/                     # End-to-end tests (full cycle, dependency drift, ambiguous plans)
│   ├── integration/             # Dolt CRUD tests
│   ├── live/                    # Manual/live test runners
│   └── fixtures/                # Test project fixtures (nextjs-simple)
│
├── docs/                        # Documentation (phase specs, architecture)
│   ├── phase-1-planner/
│   ├── phase-2-spawn-workers/
│   └── ...
│
├── .planning/                   # GSD planning directory (gitignored locally)
│   └── codebase/                # This file lives here
│
├── .github/                     # GitHub Actions workflows
│   └── workflows/
│
├── .forge/                      # Forge runtime directory (gitignored)
│   ├── checkpoints.db           # SQLite checkpoint store
│   ├── pids/                    # PID files for daemon processes
│   ├── worktrees/               # Git worktrees per task
│   └── .dolt-server.pid
│
├── forge.config.json            # Configuration (max_parallel, costs, Dolt, Docker)
├── tsconfig.json                # Root TypeScript config
├── pnpm-workspace.yaml          # Workspace declaration
├── package.json                 # Root package definition
├── CLAUDE.md                    # Project instructions (team coordination layer spec)
├── README.md
└── .gitignore
```

## Directory Purposes

**orchestrator/src/:**
- Purpose: Main orchestration engine
- Contains: Graph definition, state machine, all nodes, CLI handler, validators, database client
- Key files: `cli.ts` (entry), `graph.ts` (assembly), `state.ts` (state definition)

**orchestrator/src/nodes/:**
- Purpose: Agent node implementations (functions that process state)
- Contains: planner.ts, worker.ts, sub-judge.ts, high-court.ts, cost-auditor.ts, librarian-trigger.ts, dependency-check.ts, property-gate.ts, pr-summary.ts, human-escalation.ts, spawn-workers.ts
- Key pattern: Each node is async function(state) → Promise<Partial<state>>

**orchestrator/src/dolt/:**
- Purpose: Database abstraction layer
- Contains: client.ts (MySQL pool management), queries.ts (SQL builders), schema.ts (TypeScript type mirrors)
- Key pattern: Use query<T>() for all database access, never raw SQL strings

**orchestrator/src/gates/:**
- Purpose: Output validation and constraint checking
- Contains: validator.ts (AJV wrapper), schema loaders, property-gate.ts, sub-judge-gate.ts, plan-gate.ts
- Key pattern: Each gate returns {valid: boolean, errors?: string[]}

**orchestrator/src/worktree/:**
- Purpose: Git worktree lifecycle management
- Contains: manager.ts with createWorktree, destroyWorktree, listWorktrees, getWorktreePath
- Key pattern: Branch names are always `forge/task/{taskId}`, paths are always `.forge/worktrees/{taskId}`

**orchestrator/src/models/:**
- Purpose: Configuration, model selection, complexity analysis
- Contains: selector.ts with countLOC, countFlows, loadConfig
- Key pattern: Load config once and cache (resetConfigCache for testing)

**orchestrator/src/prompts/:**
- Purpose: System prompt loading and caching
- Contains: loader.ts (loadPrompt, getPromptPath), tests
- Key pattern: All nodes use loadPrompt(role) — never read files directly

**agents/:**
- Purpose: System prompts for each agent role
- Contains: 6 Markdown files (planner.md, worker.md, sub-judge.md, high-court.md, librarian.md, cost-auditor.md)
- Key pattern: Each prompt starts with role description, constraints, output format JSON schema

**schemas/:**
- Purpose: JSON Schema definitions for typed artifacts
- Contains: .schema.json files (one per artifact type)
- Key pattern: Each schema has $id, properties, required, and oneOf for conditional structures

**webhook/src/:**
- Purpose: Webhook server for GitHub + local commits
- Contains: server.ts (Express app with two endpoints)
- Key pattern: POST /github-webhook parses GitHub event, POST /local-commit for git hook triggers

**dolt/:**
- Purpose: Dolt database initialization and configuration
- Contains: schema.sql (CREATE TABLE statements), config.yaml (server settings)
- Key pattern: Schema defines 10 tables: tasks, cycles, stage_runs, touch_maps, artifacts, flow_registry, flow_file_refs, cycle_costs, work_logs

## Key File Locations

**Entry Points:**
- `packages/orchestrator/src/cli.ts`: Main CLI handler, all `forge` commands
- `packages/webhook/src/server.ts`: Express webhook server (listens on port 3001 by default)
- `packages/orchestrator/src/graph.ts`: LangGraph assembly, buildForgeGraph() function

**Configuration:**
- `forge.config.json`: Max parallel workers, cost cap, Dolt connection, Docker resource limits
- `packages/orchestrator/src/utils/paths.ts`: FORGE_DIR, AGENTS_DIR, SCRIPTS_DIR, CONFIG_PATH constants
- `dolt/config.yaml`: Dolt server port, data directory, config settings

**Core Logic:**
- `packages/orchestrator/src/state.ts`: ForgeState Annotation definition (source of truth for all state fields)
- `packages/orchestrator/src/nodes/`: All node implementations (planner, worker, sub-judge, high-court)
- `packages/orchestrator/src/dolt/schema.ts`: TypeScript mirrors of all Dolt tables (Task, Cycle, StageRun, etc.)

**Validation & Constraints:**
- `packages/orchestrator/src/gates/validator.ts`: AJV schema validation wrapper
- `packages/schemas/`: All .schema.json files (plan, sub-judge-report, high-court-report, etc.)
- `packages/gates/flow_freshness.py`: CI gate that blocks merge if flows are stale

**Database & State Persistence:**
- `dolt/schema.sql`: Complete Dolt schema with 10 tables and indexes
- `packages/orchestrator/src/dolt/client.ts`: MySQL connection pool, query execution
- `.forge/checkpoints.db`: SQLite checkpoint storage (LangGraph)

**Testing:**
- `test/e2e/*.test.ts`: End-to-end integration tests (Vitest)
- `test/integration/dolt-crud.test.ts`: Database CRUD operations
- `test/fixtures/nextjs-simple/`: Reference test project with worktrees

## Naming Conventions

**Files:**
- TypeScript: `camelCase.ts` (e.g., `worktreeManager.ts`, `claudeCode.ts`)
- Markdown (prompts): `kebab-case.md` (e.g., `sub-judge.md`, `high-court.md`)
- JSON schemas: `kebab-case.schema.json` (e.g., `sub-judge-report.schema.json`)
- Python: `snake_case.py` (e.g., `flow_freshness.py`)
- SQL: `schema.sql`, `migrations/*.sql` (numbered)

**Directories:**
- Packages: `kebab-case` (e.g., `orchestrator`, `webhook`, `cost-auditor`)
- Internal: `camelCase` (e.g., `nodes/`, `dolt/`, `worktree/`, `gates/`)
- Git branches: `forge/task/{taskId}` (worktrees), `gsd/phase-{N}-{slug}` (GSD phases)

**Variables & Functions:**
- Functions: camelCase (e.g., `claudeCode()`, `createWorktree()`, `loadPrompt()`)
- Constants: SCREAMING_SNAKE_CASE (e.g., `FORGE_DIR`, `MAX_WORKER_ATTEMPTS`)
- State fields: snake_case (mirror Dolt schema) or camelCase (LangGraph)
- Types: PascalCase (e.g., `ForgeState`, `TaskPlan`, `WorktreeInfo`)

**Test Files:**
- Unit tests: `{module}.test.ts` (e.g., `validator.test.ts`)
- E2E tests: `{scenario}.test.ts` (e.g., `full-cycle.test.ts`)
- Describe blocks: "describe('Module', () => ...)" with lowercase module names

## Where to Add New Code

**New Node (Agent Stage):**
1. Create `packages/orchestrator/src/nodes/{name}.ts` with function:
   ```typescript
   export async function {camelCase}Node(state: ForgeStateType): Promise<Partial<ForgeStateType>> {
     // ... implementation
   }
   ```
2. Import in `packages/orchestrator/src/graph.ts`
3. Add node to graph: `.addNode("{kebab-case}_node", {camelCase}Node)`
4. Add edges/conditionals as needed
5. Update state.ts if new fields are needed
6. Create `packages/agents/{name}.md` for system prompt
7. Update test fixtures in `test/e2e/`

**New Validation Gate:**
1. Create gate file in `packages/orchestrator/src/gates/{name}-gate.ts`
2. Implement validator function: `export function validate{Name}(input: T): GateResult`
3. Create schema in `packages/schemas/{name}.schema.json`
4. Add to property-gate checks or create dedicated node
5. Add tests in `packages/orchestrator/src/gates/*.test.ts`

**New Database Table:**
1. Add CREATE TABLE to `dolt/schema.sql`
2. Add TypeScript interface to `packages/orchestrator/src/dolt/schema.ts`
3. Add query functions to `packages/orchestrator/src/dolt/queries.ts`
4. Document in ARCHITECTURE.md data flow section

**Shared Utility:**
1. If file I/O related: Add to `packages/orchestrator/src/utils/paths.ts`
2. If validation: Add to `packages/orchestrator/src/gates/validator.ts`
3. If model/config: Add to `packages/orchestrator/src/models/selector.ts`
4. If database: Add to `packages/orchestrator/src/dolt/queries.ts`
5. Avoid creating new util files; consolidate in existing modules

**New Test:**
1. Unit test in `test/` parallel to source (e.g., test orchestrator in packages/orchestrator/)
2. E2E test in `test/e2e/{scenario}.test.ts`
3. Fixture project in `test/fixtures/{name}/` (copy from nextjs-simple if needed)
4. Follow Vitest describe/it pattern with console.log for debug

## Special Directories

**`.forge/` (Runtime):**
- Purpose: Forge daemon state, temporary files, git worktrees
- Generated: Yes (created on `forge start`)
- Committed: No (in .gitignore)
- Cleanup: `rm -rf .forge/` to reset, `rm -rf .forge/worktrees/{taskId}` per task

**`.planning/` (GSD Planning):**
- Purpose: Local planning state (developer-specific, not shared)
- Generated: Yes (by /gsd commands)
- Committed: .planning/ROADMAP.md and .planning/PROJECT.md only; STATE.md is gitignored
- Structure: Per-developer `.planning/STATE.md`, shared `.planning/ROADMAP.md`, phase branches have `.planning/phases/`

**`dolt/.dolt/` (Dolt Store):**
- Purpose: Dolt versioned storage (like .git/)
- Generated: Yes (by dolt init)
- Committed: No (in .gitignore typically, but can be committed for reproducibility)
- Versioning: All data versioned by Dolt (git-like semantics)

**`.github/workflows/` (CI):**
- Purpose: GitHub Actions workflows
- Key workflows:
  - `test.yml`: Run pnpm test, validate schemas
  - `gates.yml`: Run flow freshness gate on PR
  - `lint.yml`: Run eslint and prettier
- Committed: Yes (in .github/)

## Dependency Patterns

**Imports Within Orchestrator:**
```typescript
// Always use named imports from packages
import { ForgeState } from "./state.js";
import { workerNode } from "./nodes/worker.js";
import { loadPrompt } from "./prompts/loader.js";

// Path utilities
import { FORGE_DIR, AGENTS_DIR } from "./utils/paths.js";

// Never circular — enforced by architecture:
// Nodes → State, Prompts, Dolt, Utils (no node-to-node imports)
```

**Cross-Package Imports:**
```typescript
// From orchestrator to agents (read prompts only)
import { readFileSync } from "node:fs";
// From orchestrator to schemas (validation)
import { validate } from "@forge/schemas"; // Not implemented yet; schemas are JSON files
```

**Avoided Patterns:**
- No barrel exports (index.ts) — all imports are specific file paths
- No circular dependencies (enforced by test linting)
- No dynamic imports in nodes (all prompts loaded at start)
- No global state except cached config

---

*Structure analysis: 2026-03-18*
