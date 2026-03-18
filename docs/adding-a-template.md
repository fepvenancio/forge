# Adding a New Template

Templates live in `packages/templates/`. Each template provides context files for a specific tech stack.

## Steps

1. Create a directory: `packages/templates/<stack-name>/`

2. Add these files:
   - `CLAUDE.md` — Stack-specific coding conventions
   - `ARCHITECTURE.md` — Directory structure and data flow
   - `SECURITY.md` — Security checklist for this stack
   - `QUALITY.md` — Testing framework, coverage threshold, property testing mode
   - `flow-registry.json` — Example flow registry (can be empty)
   - `flows/example-flow.md` — One example flow document

3. Write stack-appropriate content for each file (see existing templates for reference)

4. Test with `init-project.sh`:
   ```bash
   mkdir /tmp/test-project && cd /tmp/test-project && git init
   scripts/init-project.sh --template <stack-name> /tmp/test-project
   ```

5. Verify:
   - All 5 context files were copied
   - `.flows/` directory was created
   - `.forge/` directory structure was created
   - Git hook was installed (if .git exists)

## Existing Templates

| Template | Stack | Property Testing |
|---|---|---|
| `nextjs-postgres` | Next.js 14 + Prisma + PostgreSQL | optional (fast-check) |
| `python-fastapi` | FastAPI + SQLAlchemy 2.0 + PostgreSQL | optional (Hypothesis) |
| `react-native` | Expo + React Navigation + Zustand | disabled |
| `go-service` | Go stdlib + pgx + PostgreSQL | optional (go fuzz) |
