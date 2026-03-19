# Phase 2: Conflict Detection Engine - Research

**Researched:** 2026-03-19
**Domain:** Cross-branch conflict detection, GSD artifact parsing, advisory file locking
**Confidence:** HIGH

## Summary

Phase 2 builds the core value proposition of Forge: detecting file-level conflicts across active phase branches before code reaches PR time. This requires two distinct capabilities: (1) a read-only GSD artifact reader that parses `.planning/` files from git branches without checking them out, and (2) a conflict detection engine that combines declared touch maps from PLAN.md with actual `git diff` data to identify overlapping file modifications.

The technical approach is well-defined. GSD PLAN.md files use YAML frontmatter with a `files_modified` array that lists file paths. The `simple-git` library (already installed) provides `git.show()` for reading files from branches and `git.diff()` / `git.raw()` for cross-branch diff comparison. The `gray-matter` library (verified at v4.0.3 on npm) parses YAML frontmatter from markdown. Advisory file locks use the existing `file_locks` Dolt table (schema and TypeScript types already exist from Phase 1, but no query functions yet).

**Primary recommendation:** Use `git.show(['branch:.planning/path/to/file'])` via simple-git's `show()` method for all cross-branch file reads. Supplement declared `files_modified` from PLAN.md frontmatter with actual `git diff --name-only main...branch` for each active phase branch. This hybrid approach addresses the critical Pitfall 1 (touch map staleness) identified in prior research.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GSD-01 | Forge reads ROADMAP.md to extract phase definitions, goals, and success criteria | gray-matter parses frontmatter; `git.show()` reads from branches without checkout |
| GSD-02 | Forge reads PLAN.md to extract touch maps (which files each plan modifies) | PLAN.md uses `files_modified` YAML frontmatter array; parser extracts this field |
| GSD-03 | Forge reads SUMMARY.md to determine completion status and commits produced | SUMMARY.md uses YAML frontmatter with `requirements-completed`, `duration`, `completed` fields |
| GSD-04 | Forge reads config.json to validate team-standard configuration | JSON.parse on `git.show()` output; validate against expected schema with zod |
| GSD-05 | Forge never writes to `.planning/` files (read-only integration) | Architecture enforces one-way data flow: git.show() is inherently read-only |
| CONFLICT-01 | `forge check-conflicts` compares touch maps across all active phase branches | Query active phase_assignments, read PLAN.md from each branch, aggregate file sets, find overlaps |
| CONFLICT-02 | Conflict detection uses hybrid approach: declared PLAN.md touch maps + actual git diff data | `git.raw(['diff', '--name-only', 'main...branch'])` supplements declared touch maps |
| CONFLICT-03 | Conflicts reported at file level with phase identifiers | ConflictReport interface maps file_path to array of {phase_id, branch, source} |
| CONFLICT-04 | Conflict check runs automatically on PR open via GitHub webhook | Existing Express webhook server on /github-webhook endpoint; add pull_request.opened handler |
| LOCK-01 | Developer can lock a file with `forge lock <file> --phase <N>` | New query functions for file_locks table (schema exists, queries do not) |
| LOCK-02 | Developer can unlock a file with `forge unlock <file>` | DELETE from file_locks WHERE file_path = ? AND locked_by = ? |
| LOCK-03 | `forge locks` shows all active file locks with owner, phase, timestamp | Query + cli-table3 display (same pattern as forge team/phases) |
| LOCK-04 | Locks are advisory only -- warn on conflict, never block operations | Conflict report includes lock warnings but exit code is always 0 |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-git | 3.33.0 | Read files from branches via `git.show()`, cross-branch diffs | Already installed in Phase 1; provides typed async API for all git operations |
| commander | 14.0.3 | CLI command routing for new commands | Already installed; established pattern in src/commands/ |
| chalk | 5.6.2 | Terminal color output for conflict warnings | Already installed |
| cli-table3 | 0.6.5 | Tabular display for locks, conflicts | Already installed |
| mysql2/promise | 3.20.0 | Dolt database access | Already installed; established query/execute/transaction pattern |

### New (to install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gray-matter | 4.0.3 | Parse YAML frontmatter from PLAN.md, SUMMARY.md, ROADMAP.md | Every time Forge reads a GSD markdown artifact |

### Not Needed Yet
| Library | Why Not Now |
|---------|-------------|
| @octokit/webhooks | Phase 2 only needs basic PR event detection on existing Express server; full typed webhook handling is Phase 3 scope |
| zod | Config validation (GSD-04) can use simple JSON.parse + property checks; zod is valuable but not required for 4 fields |

**Installation:**
```bash
cd packages/orchestrator && pnpm add gray-matter
```

**Version verification:** gray-matter 4.0.3 confirmed on npm registry 2026-03-19. simple-git 3.33.0 already in package.json.

## Architecture Patterns

### Recommended Project Structure
```
packages/orchestrator/src/
  coordination/
    gsd-reader.ts          # NEW: Read-only GSD artifact parser
    conflict-detector.ts   # NEW: Cross-branch conflict detection engine
    lock-manager.ts        # NEW: Advisory file lock management
    phase-manager.ts       # EXISTS: Phase assignment (from Phase 1)
  commands/
    conflicts.ts           # NEW: forge check-conflicts, lock, unlock, locks
    register.ts            # EXISTS
    phases.ts              # EXISTS
    sync.ts                # EXISTS
    status.ts              # EXISTS
  utils/
    git.ts                 # EXISTS: Extend with show(), diff(), raw() wrappers
  dolt/
    queries.ts             # EXISTS: Add file lock query functions
    schema.ts              # EXISTS: FileLock type already defined
```

### Pattern 1: Read-Only Artifact Bridge (gsd-reader.ts)

**What:** A single module encapsulates all GSD artifact reading. It accepts a branch name and returns typed data structures. Internally uses `git.show()` to read files without checkout.
**When to use:** Every time Forge needs to understand developer progress or file plans.
**Example:**
```typescript
// coordination/gsd-reader.ts
import matter from "gray-matter";
import * as git from "../utils/git.js";

export interface PlanArtifact {
  phase: string;
  plan: number;
  filesModified: string[];
  requirements: string[];
  raw: string;  // full content for debugging
}

export interface SummaryArtifact {
  phase: string;
  plan: number;
  requirementsCompleted: string[];
  duration: string;
  completed: string;
}

export async function readFileFromBranch(branch: string, filePath: string): Promise<string | null> {
  try {
    return await git.showFile(branch, filePath);
  } catch {
    return null;  // file doesn't exist on this branch
  }
}

export async function parsePlanFromBranch(branch: string, planPath: string): Promise<PlanArtifact | null> {
  const content = await readFileFromBranch(branch, planPath);
  if (!content) return null;

  const { data } = matter(content);
  return {
    phase: data.phase ?? "",
    plan: data.plan ?? 0,
    filesModified: data.files_modified ?? [],
    requirements: data.requirements ?? [],
    raw: content,
  };
}
```

### Pattern 2: Hybrid Conflict Detection

**What:** Conflict detection combines two data sources: (a) declared `files_modified` from PLAN.md frontmatter, and (b) actual `git diff --name-only` between the phase branch and main. This addresses the critical staleness pitfall.
**When to use:** Always -- never rely on declared touch maps alone.
**Example:**
```typescript
// coordination/conflict-detector.ts
export interface ConflictSource {
  phaseId: number;
  branch: string;
  source: "declared" | "actual";  // where the overlap was detected
}

export interface FileConflict {
  filePath: string;
  phases: ConflictSource[];
}

export interface ConflictReport {
  conflicts: FileConflict[];
  lockWarnings: LockWarning[];
  declaredOnlyFiles: Map<number, string[]>;  // files in PLAN.md but not in git diff
  actualOnlyFiles: Map<number, string[]>;    // files in git diff but not in PLAN.md
  timestamp: number;
}
```

### Pattern 3: Git Utility Extension

**What:** Extend the existing `utils/git.ts` with new methods for cross-branch operations. Keep the thin wrapper pattern established in Phase 1.
**When to use:** All git operations go through this module for testability.
**Example:**
```typescript
// utils/git.ts (additions)
export async function showFile(branch: string, filePath: string): Promise<string> {
  return git.show([`${branch}:${filePath}`]);
}

export async function diffNameOnly(base: string, head: string): Promise<string[]> {
  const result = await git.raw(["diff", "--name-only", `${base}...${head}`]);
  return result.trim().split("\n").filter(Boolean);
}

export async function listRemoteBranches(pattern?: string): Promise<string[]> {
  const branches = await git.branch(["-r"]);
  const all = branches.all;
  return pattern ? all.filter(b => b.includes(pattern)) : all;
}
```

### Anti-Patterns to Avoid

- **Checking out branches to read files:** Never use `git checkout` to read PLAN.md from another branch. Use `git show branch:path` via `git.show()`. Checking out modifies the working tree and can corrupt uncommitted work.
- **Relying solely on declared touch maps:** PLAN.md `files_modified` is a pre-execution estimate. Always supplement with actual `git diff --name-only main...branch`.
- **Writing to .planning/ files:** Forge must NEVER write to `.planning/`. This is the cardinal rule (GSD-05). All state goes to Dolt.
- **Parsing markdown content with regex:** Use gray-matter for frontmatter extraction. Do not write custom YAML parsers or regex-based heading extractors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex parser for `---` delimited sections | gray-matter 4.0.3 | Handles edge cases (nested YAML, custom delimiters, escaped characters). Battle-tested across 30M+ weekly downloads. |
| Cross-branch file reading | `execSync('git show ...')` with manual string parsing | simple-git `show()` | Handles spaces in paths, large outputs, async errors. Already installed and wrapped in utils/git.ts. |
| Branch diff computation | Manual file tree comparison | simple-git `raw(['diff', '--name-only', ...])` | Git's diff algorithm handles renames, deletions, binary files correctly. |
| CLI table formatting | Manual string padding with spaces | cli-table3 | Already used for forge team/phases. Handles column alignment, word wrap, unicode. |

**Key insight:** The GSD artifact format is markdown with YAML frontmatter -- a well-solved parsing problem. The conflict detection algorithm is straightforward set intersection. The complexity is in the git operations (reading from multiple branches), which simple-git handles well.

## Common Pitfalls

### Pitfall 1: Touch Map Staleness (CRITICAL)
**What goes wrong:** PLAN.md `files_modified` lists only planned files. During execution, developers modify additional files not in the plan. Conflict detection reports "no conflicts" when real conflicts exist.
**Why it happens:** Plans are written before execution. AI agents discover additional files during implementation.
**How to avoid:** Always run `git diff --name-only main...branch` alongside declared touch maps. The ConflictReport should include `actualOnlyFiles` to surface undeclared modifications.
**Warning signs:** `actualOnlyFiles` count is consistently 2-3x the `declaredFiles` count.

### Pitfall 2: Branch Doesn't Exist Yet
**What goes wrong:** A phase is assigned (Dolt records exist) but no code has been pushed to the branch yet. `git show` fails. `git diff` fails.
**Why it happens:** Developer claims a phase, branch is created locally, but nothing is pushed to remote. Or the branch exists but has no `.planning/` files yet.
**How to avoid:** Handle missing branches and missing files gracefully. Return empty arrays, not errors. Log warnings but don't fail the conflict check.
**Warning signs:** Error logs showing "fatal: Path '.planning/...' does not exist" from git.show().

### Pitfall 3: gray-matter ESM Import Issues
**What goes wrong:** gray-matter v4.0.3 is a CommonJS package. Importing it in an ESM TypeScript project may require interop handling.
**Why it happens:** The project uses `"type": "module"` in package.json. gray-matter uses `module.exports`.
**How to avoid:** Import as `import matter from "gray-matter"` with default import. If TypeScript complains, add `"esModuleInterop": true` to tsconfig (likely already set). Test the import during plan 02-01.
**Warning signs:** `TypeError: matter is not a function` at runtime.

### Pitfall 4: Webhook Server is a Stub
**What goes wrong:** The existing webhook server at `packages/webhook/src/server.ts` is a bare stub -- it logs events and returns 200. There's no event parsing, no signature verification, no dispatch to handlers.
**Why it happens:** The webhook server was preserved from v0.1.0 but never fully implemented for v2.
**How to avoid:** For Phase 2, add minimal PR event handling directly in the webhook server. Full webhook infrastructure (@octokit/webhooks typed handlers, signature verification) is Phase 3 scope. Phase 2 just needs: detect `pull_request` event type from `X-GitHub-Event` header, extract branch name from payload, call conflict detector.
**Warning signs:** Overbuilding webhook infrastructure in Phase 2 when it belongs in Phase 3.

### Pitfall 5: Glob Pattern Matching for File Paths
**What goes wrong:** File paths from PLAN.md `files_modified` may use glob patterns (e.g., `src/commands/*.ts`) while `git diff --name-only` returns exact paths. Direct string comparison misses matches.
**Why it happens:** GSD plans sometimes declare directory-level modifications rather than exact file paths.
**How to avoid:** Check for glob characters (`*`, `?`, `**`) in declared paths. For exact paths, use string equality. For glob patterns, use a simple minimatch-style comparison. Based on the PLAN.md examples from Phase 1, paths are exact (not globbed), so this may not be needed initially -- but handle it gracefully.

## Code Examples

### Reading a PLAN.md from a Branch
```typescript
// Source: simple-git show() + gray-matter
import matter from "gray-matter";
import * as git from "../utils/git.js";

const content = await git.showFile("gsd/phase-03-dashboard-ui", ".planning/phases/03-dashboard-ui/03-01-PLAN.md");
const { data } = matter(content);
// data.files_modified = ["packages/dashboard/app.py", "packages/dashboard/pages/phase_map.py", ...]
// data.requirements = ["DASH-01", "DASH-02"]
// data.phase = "03-dashboard-ui"
```

### Cross-Branch Diff
```typescript
// Source: simple-git raw()
import * as git from "../utils/git.js";

// Get all files modified on a phase branch compared to main
const actualFiles = await git.diffNameOnly("main", "gsd/phase-03-dashboard-ui");
// actualFiles = ["packages/dashboard/app.py", "packages/dashboard/pages/phase_map.py", "packages/dashboard/utils.py"]
```

### Finding PLAN.md Files on a Branch
```typescript
// Source: simple-git raw() with ls-tree
import * as git from "../utils/git.js";

// List all PLAN.md files on a branch
const output = await git.raw(["ls-tree", "-r", "--name-only", "gsd/phase-03-dashboard-ui", ".planning/"]);
const planFiles = output.trim().split("\n").filter(f => f.endsWith("-PLAN.md"));
```

### Full Conflict Detection Flow
```typescript
import * as queries from "../dolt/queries.js";
import { parsePlanFromBranch } from "./gsd-reader.js";
import * as git from "../utils/git.js";

export async function checkConflicts(): Promise<ConflictReport> {
  // 1. Get all active phase assignments
  const assignments = await queries.getAllPhaseAssignments();
  const active = assignments.filter(a => ["assigned", "in_progress", "pr_open"].includes(a.status));

  // 2. For each active phase, collect declared + actual files
  const phaseFiles = new Map<number, { declared: string[], actual: string[], branch: string }>();

  for (const assignment of active) {
    const declared: string[] = [];
    const actual: string[] = [];

    // Read all PLAN.md files from the branch
    try {
      const lsOutput = await git.raw(["ls-tree", "-r", "--name-only", assignment.branch_name, ".planning/"]);
      const planPaths = lsOutput.trim().split("\n").filter(f => f.endsWith("-PLAN.md"));

      for (const planPath of planPaths) {
        const plan = await parsePlanFromBranch(assignment.branch_name, planPath);
        if (plan) declared.push(...plan.filesModified);
      }
    } catch { /* branch may not have .planning/ files yet */ }

    // Get actual git diff
    try {
      const diffFiles = await git.diffNameOnly("main", assignment.branch_name);
      actual.push(...diffFiles);
    } catch { /* branch may not exist on remote */ }

    phaseFiles.set(assignment.phase_id, { declared, actual, branch: assignment.branch_name });
  }

  // 3. Find overlaps (file appears in 2+ phases)
  // ... set intersection logic
}
```

### Advisory File Lock Queries
```typescript
// New query functions for queries.ts
export async function lockFile(params: {
  file_path: string;
  locked_by: string;
  phase_id: number;
  reason?: string;
}): Promise<FileLock> {
  const now = Date.now();
  await execute(
    `INSERT INTO file_locks (file_path, locked_by, phase_id, locked_at, reason) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE locked_by = VALUES(locked_by), phase_id = VALUES(phase_id), locked_at = VALUES(locked_at), reason = VALUES(reason)`,
    [params.file_path, params.locked_by, params.phase_id, now, params.reason || null],
  );
  return { ...params, locked_at: now, reason: params.reason || null };
}

export async function unlockFile(filePath: string, developerId: string): Promise<void> {
  const result = await execute(
    `DELETE FROM file_locks WHERE file_path = ? AND locked_by = ?`,
    [filePath, developerId],
  );
  if (result.affectedRows === 0) {
    throw new Error(`File "${filePath}" is not locked by you`);
  }
}

export async function getAllFileLocks(): Promise<FileLock[]> {
  return query<(FileLock & RowDataPacket)[]>(
    `SELECT * FROM file_locks ORDER BY locked_at DESC`,
  );
}

export async function getFileLocksForPhase(phaseId: number): Promise<FileLock[]> {
  return query<(FileLock & RowDataPacket)[]>(
    `SELECT * FROM file_locks WHERE phase_id = ?`,
    [phaseId],
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Read files by checking out branches | `git show branch:path` via simple-git | Always available | No working tree modification; safe for concurrent reads |
| Touch maps only from declared plans | Hybrid: declared + actual git diff | Identified in prior research | Eliminates false negative blind spot |
| Enforced file locks | Advisory locks with visibility | Project decision (CLAUDE.md) | Trust developers, surface information, don't block |

## Open Questions

1. **PLAN.md Discovery on Branch**
   - What we know: PLAN.md files follow pattern `.planning/phases/NN-name/NN-PP-PLAN.md`
   - What's unclear: Whether `git ls-tree` is the best way to discover all PLAN.md files, or whether we should construct paths from phase assignments
   - Recommendation: Use `git ls-tree -r --name-only branch .planning/` to discover files. This is more robust than path construction because it handles renamed phases or unexpected directory structures.

2. **Remote vs Local Branches**
   - What we know: Phase branches are created locally on `forge claim`. They may or may not be pushed to remote.
   - What's unclear: Should `forge check-conflicts` require branches to be pushed, or should it also check local branches?
   - Recommendation: Check local branches first (they're always available). For webhook-triggered checks (CONFLICT-04), use remote branches since the webhook fires on push.

3. **Webhook Scope for Phase 2**
   - What we know: CONFLICT-04 requires automatic conflict check on PR open. The webhook server is a stub.
   - What's unclear: How minimal should the webhook implementation be in Phase 2 vs Phase 3?
   - Recommendation: Phase 2 adds just enough: parse `X-GitHub-Event` header for `pull_request`, extract branch from payload, call conflict detector, post result as PR comment via @octokit/rest (already in dependencies). Full @octokit/webhooks typed infrastructure is Phase 3.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (root devDependency) |
| Config file | packages/orchestrator/package.json `"test": "vitest run"` (no vitest.config file) |
| Quick run command | `pnpm --filter @forge/orchestrator test` |
| Full suite command | `pnpm -r test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GSD-01 | Parse ROADMAP.md from branch | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | No -- Wave 0 |
| GSD-02 | Parse PLAN.md files_modified from branch | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | No -- Wave 0 |
| GSD-03 | Parse SUMMARY.md from branch | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | No -- Wave 0 |
| GSD-04 | Parse and validate config.json from branch | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/gsd-reader.test.ts` | No -- Wave 0 |
| GSD-05 | Read-only (no .planning/ writes) | unit | Verified by architecture (git.show is inherently read-only) | manual-only |
| CONFLICT-01 | check-conflicts finds overlaps across branches | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | No -- Wave 0 |
| CONFLICT-02 | Hybrid declared+actual detection | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | No -- Wave 0 |
| CONFLICT-03 | File-level reporting with phase identifiers | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | No -- Wave 0 |
| CONFLICT-04 | Webhook triggers conflict check on PR open | integration | `pnpm --filter @forge/orchestrator test -- test/unit/webhook/pr-conflict-handler.test.ts` | No -- Wave 0 |
| LOCK-01 | lock file command | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/lock-manager.test.ts` | No -- Wave 0 |
| LOCK-02 | unlock file command | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/lock-manager.test.ts` | No -- Wave 0 |
| LOCK-03 | list all locks | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/lock-manager.test.ts` | No -- Wave 0 |
| LOCK-04 | Advisory only (warn, never block) | unit | `pnpm --filter @forge/orchestrator test -- test/unit/coordination/conflict-detector.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @forge/orchestrator test`
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/unit/coordination/gsd-reader.test.ts` -- covers GSD-01 through GSD-05
- [ ] `test/unit/coordination/conflict-detector.test.ts` -- covers CONFLICT-01 through CONFLICT-03, LOCK-04
- [ ] `test/unit/coordination/lock-manager.test.ts` -- covers LOCK-01 through LOCK-03
- [ ] `test/unit/commands/conflicts.test.ts` -- covers CLI commands (check-conflicts, lock, unlock, locks)
- [ ] `test/unit/webhook/pr-conflict-handler.test.ts` -- covers CONFLICT-04
- [ ] Framework install: none needed -- vitest already available

## Sources

### Primary (HIGH confidence)
- Phase 1 SUMMARY files -- established patterns for coordination/, commands/, utils/git.ts
- Existing codebase: queries.ts, schema.ts, cli.ts, phase-manager.ts, git.ts -- direct code reading
- PLAN.md format (01-01-PLAN.md) -- verified `files_modified` frontmatter field structure
- touch-map.schema.json -- existing schema with task_id, reads, writes structure
- npm registry -- gray-matter 4.0.3, simple-git 3.33.0, zod 4.3.6 versions confirmed

### Secondary (MEDIUM confidence)
- [simple-git TypeScript definitions](https://github.com/steveukx/git-js/blob/main/simple-git/typings/simple-git.d.ts) -- show(), raw(), diff(), diffSummary() signatures
- [gray-matter npm](https://www.npmjs.com/package/gray-matter) -- v4.0.3, YAML frontmatter parsing API
- [simple-git npm](https://www.npmjs.com/package/simple-git) -- git.raw() for arbitrary commands

### Tertiary (LOW confidence)
- [@octokit/webhooks.js](https://github.com/octokit/webhooks.js/) -- webhook handler patterns (deferred to Phase 3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed except gray-matter; APIs verified against TypeScript definitions
- Architecture: HIGH -- follows patterns established in Phase 1 (coordination/, commands/, utils/git.ts)
- Pitfalls: HIGH -- touch map staleness identified in prior research; mitigation (hybrid approach) is a locked decision
- GSD artifact format: HIGH -- verified against actual PLAN.md files from Phase 1

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, established libraries)
