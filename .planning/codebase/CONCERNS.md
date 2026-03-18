# Codebase Concerns

**Analysis Date:** 2025-03-18

## Tech Debt

**Type Suppression in Schema Validation:**
- Issue: Multiple `eslint-disable @typescript-eslint/no-explicit-any` directives bypass type safety
- Files: `packages/orchestrator/src/gates/validator.ts` (lines 28-38), `packages/orchestrator/src/dolt/client.ts` (lines 59-69)
- Impact: AJV initialization and MySQL driver interaction lack type safety; bugs in JSON parsing or DB operations could slip through type checking
- Fix approach: Refactor validator initialization to properly type AJV instance; consider using typed MySQL wrapper or type assertions instead of blanket `any` types

**Unsafe JSON Parsing Without Validation:**
- Issue: Multiple code paths parse JSON from LLM responses with regex extraction, then attempt to parse without guaranteed structure validation first
- Files: `packages/orchestrator/src/nodes/planner.ts` (lines 124-125), `packages/orchestrator/src/nodes/sub-judge.ts` (lines 49-50), `packages/orchestrator/src/nodes/high-court.ts` (lines 81-82), `packages/orchestrator/src/nodes/worker.ts` (lines 164-165)
- Impact: Malformed JSON or missing fields in LLM responses are caught with try-catch but result in cascading failures; no pre-parsing validation
- Fix approach: Extract JSON parsing to a dedicated utility that validates structure before processing; use validation layer before casting to known types

**Untyped Claude Code Response Parsing:**
- Issue: `claudeCode()` function returns `ClaudeCodeResult` but caller code coerces result to string/JSON based on implicit assumptions
- Files: `packages/orchestrator/src/claude-code.ts` (lines 111-125), consumers in planner, worker, sub-judge, high-court
- Impact: If Claude response is JSON object instead of string, code assumes stringification is correct; edge cases in cost_usd fallback to 0 silently
- Fix approach: Formalize Claude response contract in schema; explicitly type `costUsd` as required field with fallback strategy documented

## Known Bugs

**Worker Retry Logic Doesn't Detect Partial Changes:**
- Symptoms: Worker may produce some file changes but retry logic looks for `changedFiles.length > 0` to break retry loop; if exact same files changed twice, second attempt succeeds but may be identical
- Files: `packages/orchestrator/src/nodes/worker.ts` (lines 165-172)
- Trigger: Task where Claude Code is idempotent (same output on retry)
- Workaround: Manually inspect worktree and git diff to verify changes are intentional

**Dependency Drift Check Uses Base Checksums From Main Branch:**
- Symptoms: If a worker task modifies a lockfile (e.g., package.json), the comparison is against the base project checksums at cycle start; if base project's dependencies change between cycle start and completion, drift detection may miss legitimate changes
- Files: `packages/orchestrator/src/nodes/dependency-check.ts` (lines 27-32)
- Trigger: Long-running cycle where main branch receives dependency updates while worker is executing
- Workaround: None — merge dependent changes serially, not in parallel

**Webhook Server Queue Not Thread-Safe:**
- Symptoms: `triggerQueue` array in webhook server is mutated without synchronization; if multiple concurrent GitHub webhooks arrive, queue could lose triggers
- Files: `packages/webhook/server.ts` (lines 17, 56-62)
- Trigger: High-frequency GitHub pushes or simultaneous deployments
- Workaround: Run single webhook server instance; queue events are typically processed fast enough

## Security Considerations

**Dangerous File System Access in Claude Code Workers:**
- Risk: Worker node invokes `claudeCode()` with `dangerouslySkipPermissions: true`, allowing Claude Code CLI unrestricted file read/write access to the worktree
- Files: `packages/orchestrator/src/nodes/worker.ts` (line 156), `packages/orchestrator/src/nodes/sub-judge.ts` (line 40)
- Current mitigation: Touch map constraints in prompt (reads/writes/must_not_change); Git worktree isolation limits scope to single task
- Recommendations:
  - Document that workers have full file access; this is intentional for productivity but requires trust in Claude Code
  - Consider sandboxing worktrees in containers if processing untrusted project codebases
  - Add explicit audit logging for files accessed/modified by workers

**Unencrypted Credentials in Environment Variables:**
- Risk: `DOLT_PASSWORD`, `GITHUB_WEBHOOK_SECRET`, `FORGE_ESCALATION_WEBHOOK_URL` passed as plaintext env vars
- Files: `packages/orchestrator/src/dolt/client.ts` (lines 30-35), `packages/webhook/server.ts` (lines 30, 38), `packages/orchestrator/src/nodes/human-escalation.ts` (line 38)
- Current mitigation: `.env` file in .gitignore
- Recommendations:
  - Use secrets manager (AWS Secrets Manager, Vault) for production deployments
  - Warn in README that running Forge locally requires careful .env file management
  - Add pre-commit hook to prevent accidental .env commits

**GitHub Webhook Signature Verification Exists But Incomplete:**
- Risk: `verifyGitHubSignature()` validates signature presence; no rate limiting or replay attack mitigation
- Files: `packages/webhook/server.ts` (lines 28-41), `packages/webhook/verify.ts`
- Current mitigation: Signature validation present
- Recommendations:
  - Add timestamp validation to prevent replay attacks
  - Add IP whitelist for GitHub webhook IPs
  - Add rate limiting per repository

**Local Webhook Endpoint Without Authentication:**
- Risk: `/local-commit` endpoint accepts any JSON POST with no authentication
- Files: `packages/webhook/server.ts` (lines 69-88)
- Current mitigation: Assumed localhost-only usage
- Recommendations:
  - Add `--local-only` flag to bind webhook server to 127.0.0.1 only
  - If public endpoint needed, require `Authorization` header

## Performance Bottlenecks

**File Tree Generation Truncates at 500 Entries:**
- Problem: Large monorepos hit the 500-entry cap in file tree; planner receives incomplete codebase structure
- Files: `packages/orchestrator/src/nodes/planner.ts` (line 18, limit 500)
- Cause: Keeping context window bounded; full tree for large repos would exceed token budget
- Improvement path:
  - Implement hierarchical tree summarization (directories with file counts, not full contents)
  - Cache file tree summaries in Dolt for reuse across cycles
  - Let planner request specific directory expansions if needed

**Claude Code Timeout Is Fixed at 10 Minutes:**
- Problem: Complex tasks (e.g., large refactors) may timeout; no exponential backoff or adaptive timeout
- Files: `packages/orchestrator/src/nodes/worker.ts` (line 155), `packages/orchestrator/src/nodes/planner.ts` (line 116)
- Cause: Single hardcoded `timeoutMs: 600_000` for all invocations
- Improvement path:
  - Make timeout configurable per task complexity
  - Implement automatic timeout increase on retry
  - Add fallback checkpointing for long tasks

**Sequential Worker Execution:**
- Problem: Worker node processes tasks one-by-one; no parallelization despite multiple independent tasks
- Files: `packages/orchestrator/src/nodes/worker.ts` (line 79)
- Cause: Synchronous `for...of` loop without Promise.all
- Improvement path:
  - Parallelize independent worker tasks (same worktree isolation already supports this)
  - Add concurrency limit via semaphore to avoid resource exhaustion
  - Benchmark optimal parallelism level

## Fragile Areas

**JSON Regex Extraction From LLM Responses:**
- Files: `packages/orchestrator/src/nodes/planner.ts` (line 124), `packages/orchestrator/src/nodes/worker.ts` (line 145), `packages/orchestrator/src/nodes/sub-judge.ts` (line 49), `packages/orchestrator/src/nodes/high-court.ts` (line 81)
- Why fragile: Regex `/```(?:json)?\s*([\s\S]*?)```/` assumes fenced code blocks; Claude can respond with JSON-only or wrapped in other markdown
- Safe modification:
  - Extract to `extractJsonFromResponse()` utility
  - Try multiple extraction patterns (code fence → raw JSON → last JSON object)
  - Log what extraction method succeeded for debugging
- Test coverage: Gaps in test fixtures for malformed LLM responses

**Worktree Cleanup on Crash:**
- Files: `packages/orchestrator/src/worktree/manager.ts` (lines 48-63)
- Why fragile: If orchestrator crashes mid-worker, worktrees are orphaned; manual `git worktree remove` needed
- Safe modification:
  - Add worktree registry in Dolt to track active worktrees
  - Implement cleanup routine in cycle startup to remove orphaned worktrees
  - Add `forge cleanup` command
- Test coverage: No tests for crash-recovery scenarios

**Error State Tracking in State Machine:**
- Files: `packages/orchestrator/src/state.ts` (line 52) — `errors` array grows unbounded; `packages/orchestrator/src/nodes/planner.ts` (lines 103-106) reads last error only
- Why fragile: Multiple errors in same stage not distinguishable; no error deduplication; state bloat on long-running cycles
- Safe modification:
  - Limit errors array to last N entries per stage
  - Add error deduplication (same message/stage don't duplicate)
  - Consider moving detailed errors to Dolt instead of state
- Test coverage: No validation that errors array is bounded

**Cost Calculation Lacks Precision:**
- Files: `packages/orchestrator/src/nodes/cost-auditor.ts` (line 20)
- Why fragile: Cost rounding using `Math.round(totalCost * 1_000_000) / 1_000_000` can mask sub-cent precision; no validation that individual costs are non-negative
- Safe modification:
  - Use Decimal library for financial calculations
  - Validate each cost entry is positive before summing
  - Add cost anomaly detection (warn if single stage exceeds threshold)
- Test coverage: No unit tests for cost calculation edge cases

## Scaling Limits

**MySQL Connection Pool Fixed at 10:**
- Current capacity: 10 concurrent connections
- Limit: With 100+ concurrent cycles, connections could be exhausted
- Scaling path:
  - Make pool size configurable via `dolt.pool_size` in config
  - Implement connection queue metrics and alert at 80% utilization
  - Consider connection pooling proxy (PgBouncer equivalent for MySQL/Dolt)

**Dolt Database Not Sharded:**
- Current capacity: Single Dolt instance per Forge installation
- Limit: Hundreds of concurrent cycles will start experiencing lock contention on `tasks`, `cycles`, `stage_runs` tables
- Scaling path:
  - Add database read replicas for status queries
  - Shard by `project_id` if multi-tenant
  - Implement batch inserts for cost records

**State Graph Checkpoint Storage in SQLite:**
- Current capacity: Default SQLite doesn't handle concurrent writes well
- Limit: Multiple concurrent cycle runs will experience locking delays
- Scaling path:
  - Switch checkpoint storage to Dolt (already dependency) or Postgres
  - Implement periodic state compression to reduce checkpoint bloat

## Dependencies at Risk

**AJV JSON Schema Validation:**
- Risk: `@langchain/langgraph` and downstream dependencies pin specific AJV versions; schema compatibility could break on upgrades
- Impact: Plan/report validation could silently fail or reject valid schemas
- Migration plan:
  - Add integration tests that validate schema compatibility across AJV versions
  - Lock AJV version explicitly in `packages/orchestrator/package.json`
  - Document schema format assumptions

**Langchain LangGraph State Machine:**
- Risk: @langchain/langgraph is actively developed; checkpoint format could change incompatibly
- Impact: Resuming cycles from old checkpoints could fail silently
- Migration plan:
  - Version checkpoint schema in Dolt
  - Add migration scripts for checkpoint format changes
  - Test resuming old checkpoints on new releases

**Node.js >=22 Requirement:**
- Risk: Requirement is strict; dev machines stuck on Node 20 cannot run Forge
- Impact: Team fragmentation; CI/CD complexity
- Migration plan:
  - Evaluate dropping to Node 20 LTS (2026 end-of-life)
  - Use `.nvmrc` or `volta` for version pinning

## Missing Critical Features

**No Idempotency Tracking:**
- Problem: If a task is retried, there's no tracking of "this plan + this task already ran"; no deduplication of work
- Blocks: Resuming cycles after transient failures
- Priority: High

**No Cycle Rollback:**
- Problem: If a completed task causes downstream issues, there's no way to revert without manual intervention
- Blocks: Safe cycle resumption after human escalation and code review
- Priority: High

**No Explicit Error Recovery Chain:**
- Problem: When sub-judge fails, the only path is human escalation; no automated remediation (e.g., "run tests on this worktree")
- Blocks: Autonomous recovery from transient failures
- Priority: Medium

**No Cost Forecasting:**
- Problem: Cost auditor reports total cost only after completion; no per-task budget enforcement
- Blocks: Preventing runaway LLM costs on complex tasks
- Priority: Medium

## Test Coverage Gaps

**No End-to-End Tests for Error Paths:**
- What's not tested: Human escalation flows, retry logic, JSON parsing failures
- Files: `test/e2e/` directory has happy-path tests only
- Risk: Escalation node could silently fail to write notification
- Priority: High — these paths are critical for production stability

**No Integration Tests for Dolt Transactions:**
- What's not tested: Transaction rollback, concurrent INSERT/UPDATE conflicts
- Files: `packages/orchestrator/src/dolt/` lacks test fixtures
- Risk: Race conditions in cycle creation or cost recording
- Priority: Medium — affects reliability with concurrent cycles

**No Worktree Isolation Tests:**
- What's not tested: Multiple worktrees don't interfere; file locks prevent concurrent modification
- Files: `packages/orchestrator/src/worktree/manager.ts` (lines 22-43) has no tests
- Risk: Parallel tasks could corrupt each other's code
- Priority: High — required for parallelization feature

**No Claude Code Timeout Tests:**
- What's not tested: Behavior when `claude` CLI hangs or crashes
- Files: `packages/orchestrator/src/claude-code.ts` (lines 95-98) has timeout but no test coverage
- Risk: Orchestrator hangs if Claude Code CLI is broken
- Priority: Medium

---

*Concerns audit: 2025-03-18*
