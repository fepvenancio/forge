# Coding Conventions

**Analysis Date:** 2026-03-18

## Naming Patterns

**Files:**
- Kebab-case for all files: `plan-gate.ts`, `cost-auditor.ts`, `worker-node.ts`
- Suffixes for file type: `.test.ts` for tests, `.md` for prompts/docs
- Directories follow same kebab-case: `worktree/`, `gates/`, `nodes/`, `dolt/`

**Functions:**
- camelCase: `validateOrThrow()`, `computeDependencyChecksums()`, `getAvailableSchemas()`
- Async functions explicitly named: `plannerNode()`, `workerNode()`, `costAuditorNode()`
- Helper functions prefixed with purpose: `readFileSafe()`, `getHeadSha()`, `exec()`

**Variables:**
- camelCase for local vars: `taskIds`, `workerBranches`, `projectPath`, `completedTaskIds`
- UPPERCASE_SNAKE_CASE for constants: `TREE_EXCLUDED_DIRS`, `FORGE_DIR`, `WORKTREES_DIR`, `MAX_WORKER_ATTEMPTS`
- Descriptive names for state: `claudeCodeCosts`, `subJudgeEscalations`, `highCourtDecision`, `dependencyDriftTaskIds`

**Types:**
- PascalCase for interfaces and types: `ValidationResult`, `ValidationError`, `WorktreeInfo`, `ClaudeCodeOptions`, `ClaudeCodeResult`
- Union types named as `SchemaType`, `PromptRole`, `PropertyGateMode`
- Suffixes for clarity: `...Result` (gate/validation results), `...Info` (structured data), `...Options` (function params)

## Code Style

**Formatting:**
- Implicit (no explicit config files found) TypeScript strict mode with ES2022 target
- 2-space indentation observed throughout codebase
- Trailing commas in multi-line structures
- Double quotes for strings in code, backticks for template literals

**Linting:**
- ESLint configured in orchestrator package
- ESLint rules applied: `@typescript-eslint/no-explicit-any` with explicit disable comments when necessary
- Comments for suppressions provided inline: `// eslint-disable-next-line @typescript-eslint/no-explicit-any`

**Imports:**
Node.js built-in imports with `node:` prefix: `import { readFileSync } from "node:fs"`

## Import Organization

**Order:**
1. External libraries: `import { StateGraph, END } from "@langchain/langgraph"`
2. Node.js built-ins: `import { readFileSync } from "node:fs"`
3. Type imports: `import type { ForgeStateType } from "../state.js"`
4. Local relative imports: `import { validate } from "./validator.js"`
5. Path alias imports: `import { SCHEMAS_DIR } from "../utils/paths.js"`

**Path Aliases:**
- No explicit alias configuration; relative paths used throughout: `../gates/`, `../utils/`, `../nodes/`
- Imports always include `.js` extension (ES module): `from "./validator.js"`, `from "../state.js"`

**Barrel Files:**
- Not used; direct file imports preferred
- Example: import from `packages/orchestrator/src/gates/validator.js` directly, not from a `gates/index.ts`

## Error Handling

**Patterns:**

**Try-Catch with Fallback:**
```typescript
function readFileSafe(filePath: string): string | null {
  try {
    if (existsSync(filePath)) return readFileSync(filePath, "utf8");
  } catch { /* skip unreadable */ }
  return null;
}
```

**Try-Catch Returning Partial State:**
Used in async nodes to accumulate partial results:
```typescript
try {
  // Execute task
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[worker] Error: ${message}`);

  return {
    planArtifactId: null,
    errors: [
      ...state.errors,
      { stage: "planner", message, ts: Date.now() },
    ],
  };
}
```

**Schema Validation with Error Mapping:**
```typescript
export function validateOrThrow<T>(schemaType: SchemaType, data: unknown): T {
  const result = validate(schemaType, data);
  if (!result.valid) {
    const errorSummary = result.errors
      .map((e) => `  ${e.field}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Schema validation failed for "${schemaType}":\n${errorSummary}`,
    );
  }
  return data as T;
}
```

**Safe Command Execution:**
Errors in CLI operations caught and handled:
```typescript
try {
  exec(`git worktree prune`, tempRepo);
} catch {}
```

## Logging

**Framework:** `console` module

**Patterns:**
- Prefixed with stage name in brackets: `console.log("[planner] Starting planning")`
- Used at entry points: `console.log("[worker] Processing task ${taskId}")`
- Errors logged with `console.error()`: `console.error("[planner] Error: ${message}")`
- Warnings with `console.warn()`: `console.warn("[cost-auditor] WARNING: Cost exceeds cap")`
- Output for user visibility: `console.log("Forge started.")`

**Info Level (no prefix):**
- High-level orchestrator messages
- Status updates: `console.log("Starting Forge...")`

## Comments

**When to Comment:**
- Document non-obvious logic (e.g., why we check `instanceof Error`)
- Explain workarounds or gotchas: `// Branch may not exist` in error handler
- Describe purpose of complex functions with JSDoc

**JSDoc/TSDoc:**
- Used for public exports and functions with complex signatures
- Single-line comments for public functions:
  ```typescript
  /**
   * Validate a JSON object against a named schema.
   * Returns a typed result with field-level error messages.
   */
  export function validate(schemaType: SchemaType, data: unknown): ValidationResult
  ```
- Document parameters and return types in multi-line functions
- No trailing comments on single lines (prefer above)

**Inline Comments:**
- Sparse; code should be self-documenting
- Used only for non-obvious conditional logic: `// If all tasks failed and none completed, escalate`
- Gate/router logic documented at top: `// ─── Conditional Routing Functions ──────────────────`

## Function Design

**Size:**
- Functions typically 20-50 lines
- Larger functions broken into helpers: `exec()` helper in manager.ts, `walk()` in planner.ts
- Async node functions in 100-250 line range (complex state transformations accepted)

**Parameters:**
- Use object destructuring for state params:
  ```typescript
  export async function plannerNode(state: ForgeStateType): Promise<Partial<ForgeStateType>>
  ```
- Named options objects for multi-param functions:
  ```typescript
  export async function claudeCode(options: ClaudeCodeOptions): Promise<ClaudeCodeResult>
  ```

**Return Values:**
- Explicit return types required on all public functions
- Async functions return `Promise<T>`
- Node functions return `Partial<ForgeStateType>` to merge state updates
- Error results included in return object, not thrown (for fault-tolerant orchestration):
  ```typescript
  return {
    planArtifactId: null,
    errors: [...state.errors, { stage: "planner", message, ts: Date.now() }],
  };
  ```

## Module Design

**Exports:**
- Single primary export per file (default pattern):
  - `export function validate()` — main validator
  - `export function validateOrThrow<T>()` — throwing variant
  - Supporting exports: `export interface ValidationResult`, `export type SchemaType`
- Utility files export multiple functions: `selector.ts` exports `countLOC()`, `countFlows()`, `selectPlannerModel()`

**Module Structure:**
- Orchestrator node modules (`nodes/`) export async function matching pattern: `export async function [name]Node(state: ForgeStateType)`
- Gate modules (`gates/`) export validation/check functions returning `GateResult` type
- Utility modules (`utils/`, `models/`, `prompts/`) export pure functions

**Type Exports:**
- Public interfaces exported with `export interface`
- Internal types marked as private (no export): `interface SubJudgeReport`
- Discriminated unions preferred for routing: `status: "pass" | "fail" | "ambiguous"`

---

*Convention analysis: 2026-03-18*
