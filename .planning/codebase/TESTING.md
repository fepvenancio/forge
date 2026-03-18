# Testing Patterns

**Analysis Date:** 2026-03-18

## Test Framework

**Runner:**
- Vitest 3.0.0
- Config: No dedicated `vitest.config.ts` found (uses TypeScript defaults)

**Assertion Library:**
- Vitest built-in `expect()` from vitest package

**Run Commands:**
```bash
pnpm test                    # Run all tests (monorepo-wide)
pnpm -r test                 # Run tests in all packages
pnpm --filter @forge/orchestrator test  # Run orchestrator tests only
vitest run                   # Run tests in watch-free mode
vitest --watch               # Watch mode (implicit, not shown in package.json scripts)
```

## Test File Organization

**Location:**
- Co-located with source files: `.ts` file paired with `.test.ts` in same directory
- Examples:
  - `src/gates/validator.ts` paired with `src/gates/validator.test.ts`
  - `src/gates/plan-gate.ts` paired with `src/gates/plan-gate.test.ts`
  - `src/models/selector.ts` paired with `src/models/selector.test.ts`

**Root-Level E2E Tests:**
- Separate `test/` directory at repo root with subdirectories:
  - `test/e2e/` — full-cycle tests
  - `test/integration/` — integration tests
  - `test/live/` — manual/live tests (not automated)
  - `test/fixtures/` — test project fixtures

**Naming:**
- Pattern: `[module].test.ts` (matches source exactly)
- No separate `__tests__` directories

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Module or Feature Name", () => {
  it("describes expected behavior", () => {
    expect(result).toBe(expected);
  });

  describe("Nested describe for sub-feature", () => {
    it("handles specific case", () => {
      // Test code
    });
  });
});
```

**Test Lifecycle:**
- `beforeEach()`: Setup temp directories, mock state, create files
- `afterEach()`: Clean up temp dirs, remove git repos, reset state
- No `beforeAll()`/`afterAll()` observed (prefer per-test setup/teardown)

**Patterns:**

**Basic Assertion:**
```typescript
it("lists all available schemas", () => {
  const schemas = getAvailableSchemas();
  expect(schemas).toContain("plan");
  expect(schemas).toHaveLength(7);
});
```

**State-Based Testing (before/after):**
```typescript
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "forge-test-"));
  mkdirSync(join(tempDir, "src"), { recursive: true });
  writeFileSync(join(tempDir, "src", "index.ts"), "export {}");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

it("counts lines in source files", () => {
  writeFileSync(join(tempDir, "index.ts"), "line1\nline2\nline3\n");
  const loc = countLOC(tempDir);
  expect(loc).toBeGreaterThanOrEqual(5);
});
```

**Git Repo Testing (worktree setup):**
```typescript
let tempRepo: string;

beforeEach(() => {
  tempRepo = mkdtempSync(join(tmpdir(), "forge-test-"));
  exec("git init", tempRepo);
  exec("git config user.email test@test.com", tempRepo);
  exec("git config user.name Test", tempRepo);
  writeFileSync(join(tempRepo, "README.md"), "# Test");
  exec("git add -A", tempRepo);
  exec('git commit -m "init"', tempRepo);
});

afterEach(() => {
  try {
    exec("git worktree prune", tempRepo);
  } catch {}
  rmSync(tempRepo, { recursive: true, force: true });
});
```

## Mocking

**Framework:** Native Node.js `child_process` spying via test helpers

**Patterns:**

**Manual Mock Helper Functions:**
```typescript
// In test file — not using external mocking library
function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { encoding: "utf8", cwd }).trim();
}

// Used in tests instead of raw execSync
it("creates a worktree", () => {
  const info = createWorktree(tempRepo, "task-001");
  expect(info.taskId).toBe("task-001");
});
```

**File System Mocking (via temp directories):**
- Use `mkdtempSync()` from `node:os` to create isolated temp directories
- Not using jest/vitest mocking for fs; use real temp files
- Example from `validator.test.ts`:
  ```typescript
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-loc-"));
  });
  ```

**No External Mock Library Used:**
- No `jest.mock()` or `vi.mock()` found
- No `sinon`, `ts-mockito`, or other mocking packages
- Tests use real implementations with isolated file systems

## Fixtures and Factories

**Test Data:**
- Inline fixture objects in test files:
  ```typescript
  const plan = {
    task_id: "t-001",
    cycle_id: "c-001",
    title: "Add user endpoint",
    reasoning: "Need CRUD operations for users",
    tasks: [
      {
        id: "sub-001",
        title: "Create user model",
        layer: "backend",
        complexity: "standard",
        touch_map: {
          reads: ["src/models/index.ts"],
          writes: ["src/models/user.ts"],
        },
        acceptance_criteria: ["User model exists with name and email fields"],
        must_not_change: ["src/models/index.ts"],
      },
    ],
  };
  ```

**Location:**
- Fixtures created inline in test files (no separate `fixtures.ts`)
- Minimal fixtures — only required fields, defaults handled by code
- Real project fixture at `test/fixtures/nextjs-simple/` for E2E tests

**Factory Pattern:**
Not used. Tests create specific instances, no factory functions for common objects.

## Coverage

**Requirements:** Not enforced (no coverage config in `tsconfig.json` or test setup)

**View Coverage:** No command observed; coverage collection not configured

**Current State:**
- Tests exist for critical modules: `validator.ts`, `plan-gate.ts`, `selector.ts`, `loader.ts`, `worktree/manager.ts`
- E2E tests validate full cycle: `test/e2e/full-cycle.test.ts`
- No coverage thresholds defined

## Test Types

**Unit Tests:**
- Scope: Single function or module
- Approach: Isolated with temp files or in-memory objects
- Examples:
  - `validator.test.ts` — tests each schema validation case (valid, missing field, invalid enum)
  - `selector.test.ts` — tests `countLOC()` and `countFlows()` with temp directories
  - `prompts/loader.test.ts` — tests prompt loading for all roles

**Integration Tests:**
- Scope: Multiple modules working together
- Approach: Real file system, real git operations
- Examples:
  - `worktree/manager.test.ts` — creates real git repos and worktrees
  - `gates/plan-gate.test.ts` — validates plans against actual file tree

**E2E Tests:**
- Framework: Vitest
- Location: `test/e2e/`
- Examples:
  - `full-cycle.test.ts` — validates fixture project, planner selection, cost reports
  - `plan-ambiguous.test.ts` — tests ambiguity escalation path
  - `dependency-drift.test.ts` — tests dependency change detection

**Test Fixture Validation:**
E2E tests validate that test fixtures exist:
```typescript
it("fixture project has required context files", () => {
  expect(existsSync(resolve(FIXTURE_PATH, "CLAUDE.md"))).toBe(true);
  expect(existsSync(resolve(FIXTURE_PATH, "ARCHITECTURE.md"))).toBe(true);
  expect(existsSync(resolve(FIXTURE_PATH, "SECURITY.md"))).toBe(true);
});
```

## Common Patterns

**Async Testing:**
Not extensively used; most tests are synchronous. When async functions are tested:
```typescript
// Function signature shows async
export async function workerNode(state: ForgeStateType): Promise<Partial<ForgeStateType>>

// Test can be async but typically mocked or uses real implementations
```

**Error Testing:**
Errors tested via `expect().toThrow()`:
```typescript
it("throws for invalid role", () => {
  expect(() => loadPrompt("nonexistent" as PromptRole)).toThrow(
    /Prompt file not found/,
  );
});

it("throws on duplicate worktree", () => {
  createWorktree(tempRepo, "task-002");
  expect(() => createWorktree(tempRepo, "task-002")).toThrow(
    /already exists/,
  );
});
```

**Conditional Test Execution:**
```typescript
// Tests run for each role in a loop
const ALL_ROLES: PromptRole[] = [
  "planner",
  "worker",
  "sub-judge",
  "high-court",
  "librarian",
  "cost-auditor",
];

for (const role of ALL_ROLES) {
  describe(role, () => {
    it("file exists on disk", () => {
      const path = getPromptPath(role);
      expect(existsSync(path)).toBe(true);
    });

    it("loads non-empty content", () => {
      const content = loadPrompt(role);
      expect(content.length).toBeGreaterThan(100);
    });
  });
}
```

**Boundary Testing:**
```typescript
it("excludes node_modules", () => {
  mkdirSync(join(tempDir, "node_modules"), { recursive: true });
  writeFileSync(join(tempDir, "node_modules", "big.js"), "x\n".repeat(100000));
  writeFileSync(join(tempDir, "src.ts"), "hello\n");
  const loc = countLOC(tempDir);
  expect(loc).toBeLessThan(100);
});

it("excludes binary extensions", () => {
  writeFileSync(join(tempDir, "image.png"), "binary data");
  writeFileSync(join(tempDir, "src.ts"), "hello\n");
  const loc = countLOC(tempDir);
  expect(loc).toBeLessThan(10);
});
```

---

*Testing analysis: 2026-03-18*
