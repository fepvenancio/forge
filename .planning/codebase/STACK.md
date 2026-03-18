# Technology Stack

**Analysis Date:** 2026-03-18

## Languages

**Primary:**
- TypeScript 5.7.0 - All orchestration and CLI code (`packages/orchestrator`, `packages/webhook`)
- JavaScript (Node.js ES Modules) - Runtime for TypeScript compilation targets

**Secondary:**
- Python 3.x - Dashboard UI (Streamlit) and validation gates
- SQL - Dolt schema and migrations
- Bash - Deployment and initialization scripts

## Runtime

**Environment:**
- Node.js 22+ (required by root `package.json` engines constraint)
- Python 3 (required for dashboard and gates)

**Package Manager:**
- pnpm 9.15.0 (monorepo workspace manager)
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- LangGraph 1.2.3 (`@langchain/langgraph`) - State machine orchestration for agent workflows
  - Location: `packages/orchestrator/src/graph.ts`
  - Purpose: Builds the cycle orchestration graph with nodes for Planner, Workers, Judges, Librarian
- LangGraph Checkpointing 1.0.1 - State persistence for workflow resumption
  - SQLite-based: `@langchain/langgraph-checkpoint-sqlite` 1.0.1
  - Location: `packages/orchestrator/src/graph.ts`

**Web/API:**
- Express 5.0.0 - Webhook server for GitHub and local commit events
  - Location: `packages/webhook/src/server.ts`
  - Purpose: Receives GitHub webhooks, triggers Librarian agent

**Testing:**
- Vitest 3.0.0 - Test runner for TypeScript packages
  - Config: `vitest.config.ts` (per-package)
  - Location: Run via `pnpm -r test`

**Dashboard/Visualization:**
- Streamlit 1.40.0+ - Interactive web dashboard for cycle monitoring
  - Location: `packages/dashboard/app.py`
  - Purpose: Real-time view of cycles, costs, task status
  - Pages: `packages/dashboard/pages/`

**Build/Dev:**
- TypeScript 5.7.0 - Type checking and transpilation
- tsx 4.21.0 - Direct TypeScript execution (CLI entry point via `forge` script)
- ESLint - Code linting
- Concurrently 9.2.1 - Parallel process management

## Key Dependencies

**Critical:**
- `mysql2/promise` 3.20.0 - Dolt database connection (MySQL protocol)
  - Used in: `packages/orchestrator/src/dolt/client.ts`
  - Provides connection pooling, prepared statements, transaction support

- `better-sqlite3` 12.8.0 - SQLite database for LangGraph checkpoints
  - Used in: LangGraph checkpoint persistence
  - Location: Configured in graph.ts

- `uuid` 13.0.0 - UUID generation for task IDs, cycle IDs, artifact IDs
  - Used throughout: `packages/orchestrator/src/dolt/queries.ts`, CLI
  - Purpose: Unique identifier generation

- `@octokit/rest` 22.0.1 - GitHub API client (imported, awaiting full integration)
  - Location: `packages/orchestrator/package.json`
  - Purpose: Future PR/issue management, branch operations
  - Status: Imported but not actively used in current codebase

**Infrastructure:**
- `ajv` 8.18.0 - JSON Schema validator
  - Used in: `packages/orchestrator/src/gates/` validation
  - Purpose: Validate agent outputs against schema constraints

- `ajv-formats` 3.0.1 - Extended format support for JSON Schema (dates, URIs, etc.)

**Python (Dashboard & Gates):**
- `streamlit` 1.40.0+ - Dashboard framework
- `pandas` 2.2.0+ - Data manipulation and analysis
- `sqlalchemy` 2.0.0+ - ORM for database queries
- `pymysql` 1.1.0+ - Pure Python MySQL client (fallback to mysql2)
- `gitpython` 3.1.0+ - Git repository operations for flow analysis

## Configuration

**Environment:**

Configuration is loaded from three sources in priority order:

1. Environment variables (highest priority)
2. `forge.config.json` in project root
3. Hardcoded defaults (lowest priority)

**Key Configuration File:**
- `forge.config.json` - Forge runtime settings
  - `workers.max_parallel`: Default 20 (max concurrent workers)
  - `cost.max_cycle_cost_usd`: Default 50 (cost limit per cycle)
  - `dolt.host`, `dolt.port`, `dolt.database`: Database connection defaults
  - `docker.worker_image`, `docker.network`, `docker.resources`: Worker container config

**Environment Variables Required:**
- `DOLT_HOST` - Dolt database hostname (default: localhost)
- `DOLT_PORT` - Dolt database port (default: 3306)
- `DOLT_USER` - Database user (default: root)
- `DOLT_PASSWORD` - Database password (default: empty)
- `DOLT_DATABASE` - Database name (default: forge)
- `FORGE_WEBHOOK_PORT` - Local webhook server port (default: 3001)
- `FORGE_ESCALATION_WEBHOOK_URL` - Optional: Slack/Discord/Teams webhook for escalations
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook signature verification (for security)
- `FORGE_MAX_PARALLEL_WORKERS` - Override max_parallel from config

**Build:**
- `tsconfig.json` - TypeScript compiler options
  - Target: ES2022
  - Module: NodeNext (ES modules)
  - Strict mode enabled
  - Declaration maps and source maps enabled

## Platform Requirements

**Development:**
- Node.js 22+
- Python 3.8+
- pnpm 9.15.0
- Git (for worktree operations)
- Docker & Docker Compose (optional, for Dolt + dashboard local dev)

**Production:**
- Docker Compose - Orchestrates Dolt, webhook server, dashboard
- Docker image: `forge-worker:latest` - Worker container image
  - Base: Node 22.14-slim
  - Includes: Python 3, Git, pnpm
  - Non-root user: `forge`
  - Memory limit: 2GB per worker
  - CPU limit: 1.0 core per worker

**Deployment Target:**
- Docker Compose (development and small deployments)
- Dolt SQL Server container (versioned database)
- Webhook accessible from GitHub (port 3001 or `FORGE_WEBHOOK_PORT`)
- Dashboard accessible from browser (Streamlit, port 8501 or `STREAMLIT_PORT`)

## Monorepo Structure

**Workspace Packages:**
- `@forge/orchestrator` - Main CLI and LangGraph state machine
- `@forge/agents` - System prompts (Markdown files, no runtime deps)
- `@forge/schemas` - JSON Schema definitions (no runtime deps)
- `@forge/webhook` - Express webhook server
- `@forge/dashboard` - Streamlit Python app
- `@forge/gates` - Validation gates (Python)
- `@forge/templates` - Stack context templates (static files)

Managed by: `pnpm workspaces` (root `pnpm-workspace.yaml`)

## Notable Design Decisions

**Claude Code Integration:**
- Forge invokes Claude Code CLI (`claude -p`) as subprocess
- Location: `packages/orchestrator/src/claude-code.ts`
- Spawns `claude` command with JSON output format
- No direct API integration; uses local CLI tool
- Returns cost, token usage, and result in structured JSON

**Dolt Over Traditional Database:**
- Dolt SQL Server provides Git-like versioning for data
- Supports branching and merging at data layer
- MySQL protocol compatibility (uses `mysql2/promise`)
- Enables data time-travel and audit trails

**LangGraph for Orchestration:**
- State machine approach for cycle workflow
- Built-in checkpoint persistence (SQLite)
- Allows human intervention at specific checkpoints
- Resume/recovery without rerunning completed stages

---

*Stack analysis: 2026-03-18*
