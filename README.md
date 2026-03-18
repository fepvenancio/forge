# Forge

**Autonomous Engineering Factory: Multi-Agent Software Production System**

> Build anything. Track everything. Trust the output.

Forge is a domain-agnostic multi-agent orchestration system for building software. It runs a structured team of AI agents against any project — web2, mobile, API, data pipeline, or protocol — and produces reviewable pull requests with full audit trails.

## Agent Roles

| Role | Responsibility |
|---|---|
| **Planner** | Decomposes tasks, produces touch maps, never writes code |
| **Workers** | Execute in isolated Git worktrees, self-audit inline |
| **Sub-Judges** | Run in parallel with Workers, check syntax/tests/linting |
| **High Court** | Fires once per cycle, reviews architectural invariants |
| **Librarian** | Triggered by commits, keeps Flow documents fresh |
| **Cost Auditor** | Calculates per-cycle cost from token usage |

## Prerequisites

Run `scripts/check-deps.sh` to verify all dependencies:

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **pnpm** — `corepack enable && corepack prepare pnpm@latest --activate`
- **Python 3.12+** — [python.org](https://www.python.org/downloads/)
- **Git 2.5+** — [git-scm.com](https://git-scm.com/)
- **Docker** — [docs.docker.com](https://docs.docker.com/get-docker/)
- **Dolt** — `brew install dolt` or [docs.dolthub.com](https://docs.dolthub.com/introduction/installation)

## Setup

```bash
# 1. Clone and install
git clone git@github.com:fepvenancio/forge.git
cd forge
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys and settings

# 3. Initialize Dolt database
scripts/init-dolt.sh

# 4. Build worker Docker image
docker build -f docker/worker.Dockerfile -t forge-worker:latest .

# 5. Start Forge
forge start
```

### Dolt Startup

Dolt must be running before Forge. Run `scripts/init-dolt.sh` once on first setup. On subsequent runs, start with `dolt sql-server` in the `dolt/` directory. If you see `ECONNREFUSED 3306`, Dolt is not running.

### Laptop Resource Note

On machines with <16GB RAM, set `FORGE_MAX_PARALLEL_WORKERS=4` and `FORGE_WORKER_MEMORY_LIMIT=1g` in `.env`. 20 parallel workers require ~40GB peak RAM.

## Usage

```bash
# Initialize a project with a template
forge init --template nextjs-postgres /path/to/project

# Run a cycle
forge run /path/to/prp.md

# Check status
forge status

# View cost report
forge cost <cycle-id>

# View worker logs
forge logs <task-id>

# Resume after human escalation
forge resume <cycle-id>

# Cancel a halted cycle
forge cancel <cycle-id>
```

## GitHub Webhook Setup

To enable the Librarian for automatic Flow updates on push:

1. Go to your repository's **Settings > Webhooks > Add webhook**
2. **Payload URL**: `https://your-server:3001/github-webhook`
3. **Content type**: `application/json`
4. **Secret**: The value of `GITHUB_WEBHOOK_SECRET` in your `.env`
5. **Events**: Select "Just the push event"
6. Start the webhook server: `pnpm --filter webhook start`

For local development, the Git post-commit hook (`scripts/post-commit-librarian.sh`) triggers the Librarian automatically via the `/local-commit` endpoint.

## Human Escalation Setup

Set `FORGE_ESCALATION_WEBHOOK_URL` in `.env` to receive `human_required` notifications in Slack, Teams, or Discord. Use an incoming webhook URL from your workspace. Without this, escalations log to stdout only — fine for solo development, not for teams.

## Model Configuration

Model strings in `forge.config.json` use March 2026 API identifiers. When providers release stable versions (removing `-preview` suffixes), update the strings in config. No code changes required — models are config-only.

## Project Structure

```
forge/
├── packages/
│   ├── orchestrator/    # LangGraph-based orchestrator (TypeScript)
│   ├── agents/          # Agent system prompts (Markdown)
│   ├── schemas/         # JSON schemas for agent outputs
│   ├── gates/           # Python gate runners
│   ├── dashboard/       # Streamlit dashboard
│   ├── webhook/         # Webhook listener for Librarian trigger
│   └── templates/       # Per-stack context file templates
├── dolt/                # Dolt schema
├── docker/              # Docker files
├── scripts/             # Setup and utility scripts
└── docs/                # Documentation
```

## License

MIT
