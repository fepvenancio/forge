# Technology Stack

**Project:** Forge v2 -- Team Coordination Layer
**Researched:** 2026-03-18

## Approach

This document covers **new dependencies and upgrades** needed for the v2 team coordination features. The existing stack (Node.js 22+, TypeScript 5.7, LangGraph 1.2.3, Dolt via mysql2, Express 5, Vitest 3, Streamlit, pnpm workspaces) is retained as-is. The focus is on what to add, what to upgrade, and what not to touch.

## Recommended Stack Additions

### CLI Framework (NEW -- replaces manual parseArgs switch)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| commander | ^14.0.3 | CLI command routing, argument parsing, help generation | The current CLI uses a manual switch statement over `process.argv[2]`. With 15+ new commands (`register`, `team`, `assign`, `claim`, `release`, `phases`, `check-conflicts`, `lock`, `unlock`, `locks`, `sync`, `status`, `merge-order`, `dashboard`, `cost`), this becomes unmaintainable. Commander has zero dependencies, native ESM support, built-in TypeScript types, and supports git-style subcommands (`forge team`, `forge lock <file>`). 35M weekly downloads. |
| @commander-js/extra-typings | ^14.0.0 | End-to-end TypeScript inference for parsed args | Infers types for options and arguments without manual casting. Requires TypeScript 5.0+, which we already have. |

**Confidence:** HIGH -- verified on npm, zero-dependency, ESM-native, already at v14 with Node 20+ requirement matching our Node 22+ constraint.

### Git Operations (NEW)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| simple-git | ^3.33.0 | Programmatic git operations: branch listing, diff parsing, worktree management | Forge needs to read branches (`gsd/phase-*`), parse touch maps from diffs, detect file overlaps across branches, and manage worktree checkouts. The current codebase shells out via `execSync("git ...")` which is brittle (no error handling, no parsing). simple-git provides a typed async API, handles edge cases (spaces in paths, large outputs), and chains operations. Used in 2M+ repos. |

**Confidence:** HIGH -- verified on npm, active maintenance, TypeScript types bundled since v3, CommonJS + ESM support.

### GitHub Integration (UPGRADE existing)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @octokit/rest | ^22.0.1 | GitHub API: PR creation, check status, PR comments | Already in package.json but unused. v2 needs it for: posting touch map conflict results as PR comments, reading PR metadata for merge-order engine, creating GitHub check runs for CI gates. Keep current version. |
| @octokit/webhooks | ^14.2.0 | Typed webhook event parsing and signature verification | The existing webhook server manually verifies signatures. This package provides typed event payloads (push, pull_request, check_run) with built-in HMAC verification. Reduces custom code and catches event schema changes. |
| @octokit/webhooks-types | ^7.6.1 | TypeScript types for all GitHub webhook event payloads | Pure types package. Enables typed event handlers: `on('pull_request.opened', (event: PullRequestOpenedEvent) => ...)`. |

**Confidence:** HIGH -- official GitHub SDK, already partially adopted, TypeScript-native.

### Terminal Output (NEW)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| chalk | ^5.6.2 | Terminal color/styling for CLI output | ESM-only (matches our `"type": "module"` setup). Zero dependencies. Used for status indicators (green = active, red = blocked, yellow = PR open), phase assignment tables, conflict warnings. |
| cli-table3 | ^0.6.5 | Formatted ASCII tables for `forge team`, `forge phases`, `forge locks` | Displays developer assignments, phase status, and file locks as aligned tables. Supports column spanning, word wrap, custom borders. API-compatible with cli-table/cli-table2. |

**Confidence:** HIGH -- chalk 5 is ESM-only which aligns with our ESM project; cli-table3 is the maintained fork of the original.

### Schema Validation (UPGRADE existing)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zod | ^4.3.6 | Runtime schema validation for CLI inputs, config validation, GSD artifact parsing | AJV (already in the project at v8.18) is good for validating JSON Schema files but verbose for TypeScript-first validation. Zod provides `z.infer<>` for automatic TypeScript type derivation, which is valuable for the new Dolt table schemas (developers, phase_assignments, file_locks, developer_costs) and for validating parsed GSD artifacts (ROADMAP.md frontmatter, PLAN.md touch maps). Use AJV for external JSON Schema validation (gates), Zod for internal TypeScript validation. |

**Confidence:** HIGH -- verified v4.3.6 on npm. Note: Zod 4 (June 2025) is a major version with breaking changes from Zod 3. The project is greenfield for these schemas so no migration concern.

### Markdown/Frontmatter Parsing (NEW)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| gray-matter | ^4.0.3 | Parse YAML frontmatter from GSD Markdown files | Forge reads `.planning/ROADMAP.md`, `PLAN.md`, and `SUMMARY.md` to extract structured data (phase definitions, touch maps, completion status). gray-matter splits frontmatter from content cleanly. Established library (30M+ downloads), handles edge cases. |

**Confidence:** MEDIUM -- training-data version; verify actual latest on npm before installing.

## Existing Stack -- No Changes Needed

| Technology | Current Version | Status | Notes |
|------------|----------------|--------|-------|
| Node.js | 22+ | Keep | LTS, required by engines field |
| TypeScript | 5.7.0 | Keep | Stable, no reason to upgrade mid-project |
| pnpm | 9.15.0 | Keep | Workspace manager, locked in packageManager field |
| LangGraph | 1.2.3 | Keep | State machine orchestration, checkpoint persistence |
| mysql2/promise | 3.20.0 | Keep | Dolt connection via MySQL protocol, connection pooling works well |
| Express | 5.0.0 | Keep | Webhook server, already at v5 |
| Vitest | 3.0.0 | Consider 4.1.0 | Current 3.0 works; upgrade to 4.1.0 is optional but brings performance improvements |
| AJV | 8.18.0 | Keep | JSON Schema validation for gates |
| better-sqlite3 | 12.8.0 | Keep | LangGraph checkpoint storage |
| uuid | 13.0.0 | Keep | ID generation |
| tsx | 4.21.0 | Keep | TypeScript execution for CLI |
| Streamlit | 1.40.0+ | Keep | Dashboard, extend with team views |
| concurrently | 9.2.1 | Keep | Process management |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI framework | commander 14 | yargs 18 | Yargs has 7 dependencies vs commander's 0. Commander's subcommand model maps directly to `forge <command>` pattern. Yargs' middleware system is overkill here. |
| CLI framework | commander 14 | oclif | Enterprise-grade with plugin system, code generation, and heavy abstractions. Massive overkill for a team tool with 15 commands. Adds significant dependency weight. |
| CLI framework | commander 14 | node:util parseArgs (current) | parseArgs is fine for 5-10 commands but the manual switch statement won't scale to 15+ commands with varied argument shapes. No built-in help generation. |
| Git operations | simple-git | isomorphic-git | isomorphic-git reimplements git in JS (for browser compat). We have native git available. simple-git wraps the real git binary -- faster, more compatible, less code. |
| Git operations | simple-git | child_process execSync (current) | No error handling, no output parsing, no async. Brittle for operations like cross-branch diff comparison. |
| Schema validation | zod 4 | typebox | TypeBox generates JSON Schema which we could use with AJV, but we already have AJV for that path. Zod's ergonomics for TypeScript-first validation are better for internal types. |
| Schema validation | zod 4 | io-ts | Older, less ergonomic, smaller ecosystem. Zod won. |
| Terminal output | chalk 5 | picocolors | Picocolors is smaller (3.8kB vs chalk's 6kB) but lacks 256-color support. Our status displays benefit from richer colors (distinguishing 5+ phase states). |
| Frontmatter parsing | gray-matter | remark + frontmatter plugin | Remark is a full Markdown AST parser. We only need frontmatter extraction, not content transformation. gray-matter is purpose-built and lighter. |
| Webhook typing | @octokit/webhooks | manual typing | The webhook event payloads are complex nested objects. Maintaining manual types is error-prone and breaks silently when GitHub changes schemas. |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Prisma / Drizzle / Knex (ORMs/query builders) | Dolt speaks MySQL protocol but has unique features (branch/merge via SQL procedures like `DOLT_CHECKOUT`, `DOLT_MERGE`). ORMs cannot express these. The existing raw `mysql2/promise` query/execute/transaction pattern is correct and should be extended, not replaced. |
| Socket.io / WebSocket libraries | The dashboard is Streamlit (Python), which has its own refresh mechanism. The CLI is request-response, not real-time. No WebSocket need. |
| Redis / message queues | Forge coordinates via Dolt (the database IS the coordination layer with branching semantics). Adding Redis for pub/sub or caching would split state across two systems. Dolt is the single source of truth. |
| Docker SDK / dockerode | v2 removes Docker workers. Developers run locally. Docker is only for CI (GitHub Actions) and local Dolt server (docker-compose). No programmatic Docker control needed. |
| GraphQL / tRPC | The coordination layer is CLI-to-Dolt, not client-server API. No HTTP API between Forge CLI and Forge server -- they share the Dolt database directly. |
| Ink (React for CLIs) | Interactive TUI framework. Forge CLI is command-response, not interactive. Commander + chalk + cli-table3 is sufficient. |
| cron / node-cron | No scheduled tasks. All actions are event-driven: webhook push triggers conflict check, CLI command triggers phase assignment. |

## New Package Organization

New dependencies should be added to `@forge/orchestrator` since that package owns the CLI and coordination logic. No new packages needed.

```
@forge/orchestrator (add to existing package.json)
  + commander ^14.0.3
  + @commander-js/extra-typings ^14.0.0
  + simple-git ^3.33.0
  + chalk ^5.6.2
  + cli-table3 ^0.6.5
  + zod ^4.3.6
  + gray-matter ^4.0.3
  + @octokit/webhooks ^14.2.0        (move from @forge/webhook or add here)
  + @octokit/webhooks-types ^7.6.1

  devDependencies:
  + @types/cli-table3 (if needed)
```

## Installation

```bash
# New production dependencies (run from packages/orchestrator/)
pnpm add commander @commander-js/extra-typings simple-git chalk cli-table3 zod gray-matter @octokit/webhooks @octokit/webhooks-types

# Verify existing deps are current
pnpm outdated
```

## Dolt-Specific Patterns

The v2 schema uses Dolt's versioning features for team coordination. Key patterns to follow:

```sql
-- Branch operations (Dolt-specific stored procedures)
CALL DOLT_CHECKOUT('-b', 'phase-03-dashboard');
CALL DOLT_MERGE('phase-01-foundation');
CALL DOLT_DIFF('main', 'phase-03-dashboard', 'phase_assignments');

-- These are NOT expressible in ORMs, confirming raw mysql2 is correct.
```

The `mysql2/promise` client already handles these via `execute()` calls. No changes needed to the database layer pattern.

## Sources

- [commander on npm](https://www.npmjs.com/package/commander) -- v14.0.3, 0 dependencies, Node 20+ required
- [@commander-js/extra-typings on npm](https://www.npmjs.com/package/@commander-js/extra-typings) -- v14.0.0, TypeScript 5.0+ required
- [simple-git on npm](https://www.npmjs.com/package/simple-git) -- v3.33.0, TypeScript types bundled
- [simple-git on GitHub](https://github.com/simple-git-js/simple-git/) -- active maintenance
- [@octokit/rest docs](https://octokit.github.io/rest.js/v22/) -- v22, already in project
- [@octokit/webhooks on npm](https://www.npmjs.com/package/@octokit/webhooks) -- v14.2.0
- [chalk on npm](https://www.npmjs.com/package/chalk) -- v5.6.2, ESM-only
- [cli-table3 on npm](https://www.npmjs.com/package/cli-table3) -- v0.6.5
- [ora on npm](https://www.npmjs.com/package/ora) -- v9.3.0, considered but not recommended (see below)
- [zod on npm](https://www.npmjs.com/package/zod) -- v4.3.6
- [Dolt GitHub](https://github.com/dolthub/dolt) -- MySQL protocol compatibility confirmed

**Note on ora (terminal spinner):** Considered but not recommended. Forge CLI commands are fast database queries or git operations (< 1 second). Spinners are useful for long-running operations. If a specific command (like `forge check-conflicts` across many branches) proves slow, add ora at that point. Don't install speculatively.
