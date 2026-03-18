# External Integrations

**Analysis Date:** 2026-03-18

## APIs & External Services

**Claude Code (Anthropic):**
- What it's used for: Code generation and modification via LLM
  - Invoked as subprocess: `claudeCode()` in `packages/orchestrator/src/claude-code.ts`
  - Used by: Planner agent, Worker agents, Sub-Judge, High Court
- Integration method: Local CLI (`claude -p` command)
- Authentication: Via Claude Code CLI auth (configured outside Forge)
- Response format: JSON (`--output-format json`)
- Budget control: Optional `--max-budget-usd` parameter

**GitHub:**
- What it's used for: Webhook events (push, PR) trigger Librarian and flow analysis
  - Webhook endpoint: `POST /github-webhook` in `packages/webhook/src/server.ts`
  - Processes: Push events → Librarian trigger
- SDK/Client: `@octokit/rest` 22.0.1 (imported, not yet actively used)
- Webhook Secret: `GITHUB_WEBHOOK_SECRET` environment variable
- Expected use cases (planned): PR/issue creation, branch operations, commit comments

## Data Storage

**Databases:**

**Dolt (Versioned SQL Database):**
- Type: MySQL-compatible, Git-like versioning at data layer
- Provider: DoltHub (self-hosted via `dolthub/dolt-sql-server` Docker image)
- Connection: `packages/orchestrator/src/dolt/client.ts`
  - Host: `DOLT_HOST` (default: localhost)
  - Port: `DOLT_PORT` (default: 3306)
  - User: `DOLT_USER` (default: root)
  - Password: `DOLT_PASSWORD` (default: empty)
  - Database: `DOLT_DATABASE` (default: forge)
- Client: `mysql2/promise` v3.20.0
- Schema: `dolt/schema.sql` (initialized on container startup)

**Tables:**
- `tasks` - Units of work, hierarchy, complexity metadata
- `cycles` - Orchestration cycles (one Planner + N Workers)
- `stage_runs` - Execution records for each agent stage
- `touch_maps` - File access declarations (read/write)
- `artifacts` - Metadata for typed agent outputs
- `flow_registry` - Flow document metadata and staleness tracking
- `flow_file_refs` - Associations between flows and source files
- `cycle_costs` - Token usage and cost per stage per cycle
- `work_logs` - Append-only event log of agent actions

Connection pooling: 10 connections max, 0 queue limit (blocks on overflow)

**LangGraph Checkpoints (SQLite):**
- Storage: SQLite for workflow state persistence
- Location: Configured in `packages/orchestrator/src/graph.ts`
- Purpose: Resume interrupted cycles without state loss
- Package: `@langchain/langgraph-checkpoint-sqlite` v1.0.1

**File Storage:**
- Local filesystem only (Git repositories in worktrees)
- Worktree paths: `.forge/worktrees/{task-id}/`
- No cloud storage integration currently

**Caching:**
- None - all state goes through Dolt (database of record)
- Config caching: In-memory only (`forge.config.json` cached in `packages/orchestrator/src/models/selector.ts`)

## Authentication & Identity

**Auth Provider:**
- Custom (no centralized auth provider)
- CLI users: Git user identity (git config user.name, user.email)
- GitHub webhooks: HMAC-SHA256 signature verification
  - Secret: `GITHUB_WEBHOOK_SECRET` environment variable
  - Location: `packages/webhook/src/server.ts` (placeholder for signature verification)
- No user login/session system; Forge runs in single-operator or team mode with git-based identity

**Implementation:**
- Webhook signature verification using standard GitHub HMAC approach
- Future: Developer registry planned for multi-developer coordination (see CLAUDE.md Phase 2)

## Monitoring & Observability

**Error Tracking:**
- None - errors logged to stdout/stderr
- Stored in: `cycle_costs` table (error_message field in `stage_runs`)

**Logs:**
- Approach: Console logging (stdout/stderr from orchestrator and agents)
- Work logs: Append-only records in `work_logs` table
  - Accessible via: `forge logs <task-id>` CLI command
  - Location: `packages/orchestrator/src/cli.ts`

**Execution Tracing:**
- LangGraph provides implicit tracing via checkpoint store
- All stage transitions recorded in `stage_runs` table
- Cycle timeline: `started_at` and `finished_at` timestamps

## CI/CD & Deployment

**Hosting:**
- Docker Compose (development and small deployments)
- Services: Dolt SQL Server, Webhook server, Streamlit dashboard
- Compose file: `docker/compose.yml`
- Worker image: `docker/worker.Dockerfile` (Node 22 + Python 3 + Git + pnpm)

**CI Pipeline:**
- GitHub Actions (planned, not yet implemented)
- Planned gates:
  - Flow freshness validation (`packages/gates/flow_freshness.py`)
  - Touch map conflict detection
  - GSD config validation
  - Test suite pass
  - Cost audit

**Local Execution:**
- CLI: `forge start` - Spawns webhook server and orchestrator
- Webhook server: Listens on `FORGE_WEBHOOK_PORT` (default: 3001)
- Dashboard: Accessible on `STREAMLIT_PORT` (default: 8501)

## Environment Configuration

**Required env vars (for basic operation):**
- `DOLT_HOST` - Database hostname
- `DOLT_PORT` - Database port
- `DOLT_DATABASE` - Database name
- `FORGE_WEBHOOK_PORT` - Webhook server port

**Optional env vars:**
- `DOLT_USER` - Database user
- `DOLT_PASSWORD` - Database password
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook signature secret
- `FORGE_ESCALATION_WEBHOOK_URL` - Slack/Discord/Teams webhook for escalations
- `FORGE_MAX_PARALLEL_WORKERS` - Max concurrent workers (overrides config)

**Secrets location:**
- `.env` file (git-ignored, local development)
- GitHub Secrets (for Actions workflows, when implemented)
- Docker Compose `.env` file (docker-compose reads environment from .env)
- Environment variables set in container orchestration platform (Kubernetes, etc.)

**Never committed:**
- `.env` files
- Dolt credentials (stored in environment)
- GitHub webhook secret
- DOLT_PASSWORD

## Webhooks & Callbacks

**Incoming:**

**GitHub Webhook:**
- Endpoint: `POST /github-webhook` (port 3001)
- Events: Push, Pull Request, etc.
- Payload validation: HMAC-SHA256 signature (planned, stub exists)
- Processing: Triggers Librarian agent via local webhook
- Location: `packages/webhook/src/server.ts`

**Local Commit Webhook:**
- Endpoint: `POST /local-commit` (port 3001)
- Source: Triggered by orchestrator to spawn Librarian asynchronously
- Processing: Non-blocking (fire-and-forget)
- Location: `packages/orchestrator/src/nodes/librarian-trigger.ts`

**Outgoing:**

**Escalation Webhook:**
- URL: `FORGE_ESCALATION_WEBHOOK_URL` (optional)
- Event: Cycle requires human intervention
- Payload: JSON with cycleId, reason, timestamp, errors
- Format: Slack/Discord/Teams compatible (text field)
- Location: `packages/orchestrator/src/nodes/human-escalation.ts`
- Behavior: Non-blocking (swallows errors if webhook unavailable)

**Librarian Webhook:**
- URL: `http://localhost:{FORGE_WEBHOOK_PORT}/local-commit`
- Event: Cycle completion → triggers flow document updates
- Payload: Minimal (sha, files list)
- Behavior: Fire-and-forget, runs asynchronously
- Purpose: Update flow registry and detect stale flows

## Integration Points with GSD (Get Shit Done)

Forge reads (but never writes) GSD artifacts for coordination:

**Artifacts read:**
- `.planning/ROADMAP.md` - Phase definitions, goals
- `.planning/config.json` - Branching strategy, model profile
- `.planning/phases/{N}/{N}-01-PLAN.md` - Touch maps for conflict detection
- `.planning/phases/{N}/{N}-01-SUMMARY.md` - Completion status

**No writes:** Forge is a coordinator, not a replacement for GSD

---

*Integration audit: 2026-03-18*
