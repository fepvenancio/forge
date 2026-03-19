# Phase 3: Event-Driven Enforcement - Research

**Researched:** 2026-03-19
**Domain:** CI gate pipeline, merge order engine, flow management, human escalation
**Confidence:** HIGH

## Summary

Phase 3 transforms Forge from a CLI-only coordination tool into an event-driven enforcement system. It adds five CI gate checks that run on every PR via GitHub Actions, a merge order engine that uses topological sort on the phase dependency graph, webhook-driven flow document management via the existing Librarian agent, and human escalation for unresolvable conflicts via Slack/Discord/Teams webhooks.

The codebase is well-prepared for this phase. Phase 2 built the conflict detector (`conflict-detector.ts`), GSD artifact reader (`gsd-reader.ts`), and the webhook server already handles `pull_request.opened` events and posts PR comments via `@octokit/rest`. The existing `flow_freshness.py` gate runs in its own GitHub Actions workflow. The existing `human-escalation.ts` node already demonstrates the `FORGE_ESCALATION_WEBHOOK_URL` pattern for Slack/Discord/Teams.

**Primary recommendation:** Build the unified GitHub Actions workflow first (combining the existing `flow-freshness.yml` and adding four new checks), then the merge order engine (pure algorithm, easy to test), then wire the Librarian trigger on push events and escalation webhooks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CI-01 | GitHub Action: flow freshness check | Existing `flow_freshness.py` + `flow-freshness.yml` workflow; merge into unified workflow |
| CI-02 | GitHub Action: touch map conflict check | Existing `checkConflicts()` in conflict-detector.ts; wrap as CLI command or Node script callable from GHA |
| CI-03 | GitHub Action: GSD config validation | Existing `parseConfigFromBranch()` in gsd-reader.ts; wrap as CLI command |
| CI-04 | GitHub Action: test suite pass | Existing `forge-ci.yml` already runs `pnpm test`; consolidate |
| CI-05 | GitHub Action: cost audit | New Python gate `cost_audit.py` or TypeScript; queries developer_costs table |
| CI-06 | Post CI gate results as PR comment | `actions/github-script@v7` or existing `@octokit/rest` pattern from webhook server |
| FLOW-01 | Flow freshness gate blocks PRs with stale docs | Already implemented in `flow_freshness.py`; needs Dolt connectivity in CI |
| FLOW-02 | Webhook-driven Librarian triggers on push | Existing `librarian-trigger.ts` + `/local-commit` endpoint; extend webhook server for `push` events |
| FLOW-03 | Flow documents have criticality-based freshness thresholds | `flow_registry` table has `criticality` column; `flow_freshness.py` already queries it |
| MERGE-01 | `forge merge-order` suggests optimal merge order | New `merge-engine.ts` in coordination/; topological sort (Kahn's algorithm) |
| MERGE-02 | Dependency graph from ROADMAP.md + touch map overlaps | `gsd-reader.ts` reads ROADMAP.md; `conflict-detector.ts` finds overlaps; combine in merge engine |
| MERGE-03 | Merge order posted as PR comment | Use `@octokit/rest` (already a dependency) from webhook handler or GHA step |
| MERGE-04 | Handle dependency chains | Kahn's algorithm naturally handles chains; cycle detection flags circular deps |
| ESC-01 | Escalate unresolvable conflicts to Slack/Discord/Teams | Existing `FORGE_ESCALATION_WEBHOOK_URL` pattern in `human-escalation.ts`; reuse for conflict escalation |
| ESC-02 | Escalation includes context (files, phases, developers) | `ConflictReport` from conflict-detector.ts has all needed data; format as webhook payload |
</phase_requirements>

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@octokit/rest` | ^22.0.1 | GitHub API (PR comments, checks) | Already a dependency; used in webhook server for PR comments |
| `commander` | ^14.0.3 | CLI framework | Already used for all forge commands |
| `simple-git` | ^3.33.0 | Git operations | Already used for branch ops, diff, show |
| `gray-matter` | ^4.0.3 | YAML frontmatter parsing | Already used for PLAN.md/SUMMARY.md parsing |
| `pymysql` | >=1.1.0 | Python Dolt connection | Already used in flow_freshness.py |
| `actions/github-script` | v7 | Post PR comments from GitHub Actions | Standard GHA action for API interactions; uses octokit internally |
| `actions/checkout` | v4 | Git checkout in GHA | Already used in existing workflows |
| `actions/setup-node` | v4 | Node.js setup in GHA | Already used in forge-ci.yml |
| `actions/setup-python` | v5 | Python setup in GHA | Already used in flow-freshness.yml |

### No New Dependencies Needed

Phase 3 requires no new npm or pip packages. Everything builds on existing dependencies:
- Topological sort is a simple algorithm (~30 lines) -- no library needed
- Webhook payload construction uses built-in `fetch()` (Node 22+ has native fetch)
- PR comment posting uses existing `@octokit/rest`
- All Python gates use existing `pymysql`

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)

```
packages/
  orchestrator/
    src/
      coordination/
        merge-engine.ts        # NEW: topological sort, dependency graph, merge order
        escalation.ts          # NEW: conflict escalation to external webhooks
      commands/
        merge-order.ts         # NEW: forge merge-order CLI command
  webhook/
    src/
      server.ts                # EVOLVE: add push event handler for Librarian trigger
  gates/
    flow_freshness.py          # KEEP: already implemented
    touch_map_conflicts.py     # NEW: conflict check gate for CI (queries existing checkConflicts)
    config_validation.py       # NEW: validate .planning/config.json
    cost_audit.py              # NEW: per-PR cost estimation
.github/
  workflows/
    forge-gates.yml            # NEW: unified 5-check CI gate workflow
    forge-ci.yml               # EVOLVE: keep lint/test, remove duplication with forge-gates
    flow-freshness.yml         # REMOVE: consolidated into forge-gates.yml
test/
  unit/
    coordination/
      merge-engine.test.ts     # NEW
      escalation.test.ts       # NEW
    commands/
      merge-order.test.ts      # NEW
    webhook/
      push-handler.test.ts     # NEW
```

### Pattern 1: Unified CI Gate Workflow

**What:** Single GitHub Actions workflow with parallel jobs for each gate check, followed by a summary job that posts a consolidated PR comment.

**When to use:** Always -- this is the primary enforcement mechanism.

**Why this pattern:** Running gates as separate workflows makes it hard to post a consolidated comment. A single workflow with parallel jobs gives one trigger point, shared context, and a final summary step.

```yaml
# .github/workflows/forge-gates.yml
name: Forge Gates
on:
  pull_request:
    branches: [main]

jobs:
  flow-freshness:
    runs-on: ubuntu-latest
    outputs:
      result: ${{ steps.check.outputs.result }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r packages/gates/requirements.txt
      - id: check
        run: |
          if python packages/gates/flow_freshness.py; then
            echo "result=pass" >> "$GITHUB_OUTPUT"
          else
            echo "result=fail" >> "$GITHUB_OUTPUT"
          fi
        env:
          DOLT_HOST: ${{ secrets.DOLT_HOST }}

  conflict-check:
    runs-on: ubuntu-latest
    outputs:
      result: ${{ steps.check.outputs.result }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r packages/gates/requirements.txt
      - id: check
        run: python packages/gates/touch_map_conflicts.py

  config-validation:
    # ...validates .planning/config.json

  test-suite:
    # ...runs pnpm test (same as forge-ci.yml lint-and-test job)

  cost-audit:
    # ...runs cost estimation gate

  post-results:
    needs: [flow-freshness, conflict-check, config-validation, test-suite, cost-audit]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const results = {
              'Flow Freshness': '${{ needs.flow-freshness.outputs.result }}',
              'Conflict Check': '${{ needs.conflict-check.outputs.result }}',
              // ...
            };
            // Format as markdown table and post as PR comment
```

### Pattern 2: Topological Sort for Merge Order (Kahn's Algorithm)

**What:** Pure function that takes phase definitions and their dependencies, returns a linear ordering (or flags cycles).

**When to use:** `forge merge-order` CLI and PR comment posting.

**Why Kahn's over DFS:** Kahn's algorithm naturally detects cycles (remaining nodes after algorithm completes = cycle members). DFS requires separate cycle detection. Both are O(V+E) but Kahn's is more intuitive for this use case.

```typescript
// coordination/merge-engine.ts
export interface PhaseNode {
  phaseId: number;
  dependsOn: number[];    // phase IDs this phase depends on
  branch: string;
  prNumber: number | null;
  touchedFiles: string[];
}

export interface MergeOrder {
  order: number[];            // phase IDs in merge sequence
  cycles: number[][];         // groups of phases in circular dependencies
  reasoning: string[];        // human-readable explanations
}

export function computeMergeOrder(phases: PhaseNode[]): MergeOrder {
  // Kahn's algorithm:
  // 1. Build adjacency list and in-degree map
  // 2. Start with nodes that have in-degree 0
  // 3. Process queue: remove node, reduce in-degree of dependents
  // 4. Remaining nodes form cycles
  // Returns ordered list + cycle detection
}
```

### Pattern 3: Escalation Webhook (Slack/Discord/Teams Compatible)

**What:** Send conflict context to external notification service via webhook URL.

**When to use:** When conflict-detector finds overlaps that cannot be resolved automatically (e.g., same file modified by 2+ phases).

**Why this pattern:** Slack, Discord, and Teams all accept incoming webhooks with JSON payloads. The payload format differs slightly, but all support a `text` field for simple messages. The existing `human-escalation.ts` already uses this exact pattern with `FORGE_ESCALATION_WEBHOOK_URL`.

```typescript
// coordination/escalation.ts
export interface EscalationPayload {
  text: string;              // main message (works for Slack/Discord/Teams)
  conflicts: Array<{
    file: string;
    phases: number[];
    developers: string[];
  }>;
  suggestedAction: string;
}

export async function escalateConflicts(
  report: ConflictReport,
  assignments: PhaseAssignment[],
): Promise<void> {
  const webhookUrl = process.env.FORGE_ESCALATION_WEBHOOK_URL;
  if (!webhookUrl) return;

  // Format message with conflict details
  // POST to webhook URL
}
```

### Pattern 4: Librarian Push Trigger

**What:** Extend webhook server to handle `push` events, triggering the Librarian to mark stale flows.

**When to use:** Every time a developer pushes to a GSD phase branch.

**Why:** The existing `/local-commit` endpoint exists but is a no-op. The `push` event from GitHub carries the list of changed files. The Librarian agent reads these files, checks flow_file_refs, and marks matching flows as stale.

```typescript
// In webhook/server.ts - add push event handling
if (event === "push") {
  const payload = req.body as PushPayload;
  const changedFiles = extractChangedFiles(payload);
  // Mark matching flows as stale in Dolt
  // Optionally trigger Claude Code Librarian for flow updates
}
```

### Anti-Patterns to Avoid

- **Separate workflow per gate:** Creates 5 workflow runs per PR, no consolidated comment, harder to manage required checks. Use one workflow with parallel jobs instead.
- **Running conflict detection from GitHub Actions by spawning Dolt server:** The GHA runner does not have the Forge Dolt instance. Instead, write Python gates that connect to the Dolt server via network (same as flow_freshness.py does).
- **Embedding topological sort in CLI command handler:** Keep the algorithm in `merge-engine.ts` as a pure function. The CLI command and PR comment posting both call the same function.
- **Hard-coding webhook payload format:** Different services (Slack/Discord/Teams) have different payload shapes. Use a simple `{text: string}` envelope that works everywhere, and let users customize via environment variables.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR comment posting from GHA | Custom curl to GitHub API | `actions/github-script@v7` | Handles auth, pagination, rate limiting automatically |
| PR comment posting from webhook | Custom HTTP client | `@octokit/rest` (already installed) | Type-safe, handles auth, already used in server.ts |
| GHA workflow YAML | Custom CI runner | GitHub Actions native | Standard, free for public repos, already in use |
| Topological sort | External graph library | Kahn's algorithm (~30 lines) | Simple enough to implement inline; no dependency needed |
| Webhook payload formatting | Abstraction layer for Slack/Discord/Teams | Simple `{text}` POST | All three services accept `{text: "..."}` at minimum |

**Key insight:** This phase is about wiring together existing components (conflict detector, flow freshness gate, GSD reader, webhook server) rather than building new algorithms. The only genuinely new code is the merge order engine (~100 lines) and the escalation module (~50 lines).

## Common Pitfalls

### Pitfall 1: Dolt Not Accessible from GitHub Actions Runner

**What goes wrong:** Python gates (flow_freshness.py, touch_map_conflicts.py, cost_audit.py) need to query the Dolt database. But the GitHub Actions runner does not have network access to the Forge Dolt server unless explicitly configured.

**Why it happens:** Dolt runs on the developer's machine or a shared server. GitHub Actions runs on ephemeral Ubuntu VMs with no access to local networks.

**How to avoid:** Either (a) expose the Dolt server via a secure tunnel/VPN and pass host/port as GitHub Secrets, or (b) design gates to work without Dolt by reading from git directly. For flow freshness, the gate already gracefully skips when Dolt is unavailable ("Skipping flow freshness check (Dolt not available)"). Apply the same pattern to new gates.

**Warning signs:** Gates always pass in CI because they silently skip on Dolt connection failure.

### Pitfall 2: Stale PR Comments from Re-runs

**What goes wrong:** Every PR push triggers a new gate run, each posting a new comment. After 5 pushes, the PR has 5 conflict check comments, most outdated.

**Why it happens:** Using `issues.createComment` creates a new comment every time.

**How to avoid:** Use `actions/github-script` with a pattern that searches for existing bot comments and updates them instead of creating new ones. Look for a unique marker string (e.g., `<!-- forge-gates-report -->`) in existing comments, then use `issues.updateComment` if found, `issues.createComment` if not.

**Warning signs:** PRs accumulate many bot comments.

### Pitfall 3: Merge Order Assumes ROADMAP Dependencies Are Complete

**What goes wrong:** The merge order engine reads explicit `dependsOn` from ROADMAP.md. But implicit dependencies exist from touch map overlaps (two phases modify the same file but neither declares a dependency). The engine produces a "safe" merge order that actually causes merge conflicts.

**Why it happens:** Declared dependencies and actual file-level dependencies are different things.

**How to avoid:** Merge order engine must consider BOTH declared dependencies from ROADMAP.md AND inferred dependencies from touch map overlaps. If Phase 3 and Phase 5 both modify `src/auth.ts`, add an implicit edge even if neither declares a dependency on the other. Surface this as "inferred dependency" in the output.

**Warning signs:** Merge order differs from what `forge check-conflicts` would suggest.

### Pitfall 4: Librarian Trigger Runs Claude Code in CI

**What goes wrong:** The Librarian agent uses `claude-code.ts` to invoke Claude Code CLI. If triggered from a GitHub Actions workflow, Claude Code CLI is not available, the Anthropic API key may not be set, and costs are uncontrolled.

**Why it happens:** The existing `librarian-trigger.ts` was designed for local execution. Moving it to a webhook-triggered flow could accidentally run it in CI.

**How to avoid:** The Librarian trigger should only run on the webhook server (local process), never in GitHub Actions. The push event handler in `server.ts` triggers the Librarian locally. The GitHub Actions workflow only runs passive checks (flow freshness, conflict check) -- it never invokes Claude Code.

### Pitfall 5: Circular Phase Dependencies Crash Merge Engine

**What goes wrong:** If Phase A depends on Phase B and Phase B depends on Phase A (directly or transitively), Kahn's algorithm terminates with unprocessed nodes.

**How to avoid:** Detect cycles explicitly. Return them in `MergeOrder.cycles` as arrays of phase IDs. The CLI and PR comment should present cycles as "These phases have mutual dependencies -- coordinate merge order manually" rather than crashing.

## Code Examples

### Kahn's Algorithm for Merge Order

```typescript
// coordination/merge-engine.ts
export function computeMergeOrder(phases: PhaseNode[]): MergeOrder {
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>();
  const reasoning: string[] = [];

  // Initialize
  for (const p of phases) {
    inDegree.set(p.phaseId, 0);
    adjacency.set(p.phaseId, []);
  }

  // Build graph from declared dependencies
  for (const p of phases) {
    for (const dep of p.dependsOn) {
      if (adjacency.has(dep)) {
        adjacency.get(dep)!.push(p.phaseId);
        inDegree.set(p.phaseId, (inDegree.get(p.phaseId) || 0) + 1);
      }
    }
  }

  // Add inferred edges from touch map overlaps
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const shared = phases[i].touchedFiles.filter(f =>
        phases[j].touchedFiles.includes(f)
      );
      if (shared.length > 0 && !phases[i].dependsOn.includes(phases[j].phaseId)
          && !phases[j].dependsOn.includes(phases[i].phaseId)) {
        // Lower-numbered phase merges first (convention)
        adjacency.get(phases[i].phaseId)!.push(phases[j].phaseId);
        inDegree.set(phases[j].phaseId, (inDegree.get(phases[j].phaseId) || 0) + 1);
        reasoning.push(
          `Phase ${phases[i].phaseId} before Phase ${phases[j].phaseId} (shared files: ${shared.slice(0, 3).join(", ")}${shared.length > 3 ? "..." : ""})`
        );
      }
    }
  }

  // Kahn's algorithm
  const queue: number[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  const order: number[] = [];
  while (queue.length > 0) {
    queue.sort((a, b) => a - b); // Deterministic: lower phase first
    const node = queue.shift()!;
    order.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Detect cycles (remaining nodes with in-degree > 0)
  const cycles: number[][] = [];
  const remaining = phases
    .map(p => p.phaseId)
    .filter(id => !order.includes(id));
  if (remaining.length > 0) {
    cycles.push(remaining);
    reasoning.push(`Circular dependency detected: phases ${remaining.join(", ")}`);
  }

  return { order, cycles, reasoning };
}
```

### Unified PR Comment with Update-or-Create Pattern

```typescript
// Used by both webhook handler and GHA post-results step
async function postOrUpdatePRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  marker: string = "<!-- forge-gates-report -->"
): Promise<void> {
  const markedBody = `${marker}\n${body}`;

  // Search for existing comment with marker
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner, repo, issue_number: prNumber,
  });

  const existing = comments.find(c => c.body?.includes(marker));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner, repo, comment_id: existing.id, body: markedBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner, repo, issue_number: prNumber, body: markedBody,
    });
  }
}
```

### Escalation Webhook Payload

```typescript
// coordination/escalation.ts
export async function escalateConflicts(
  report: ConflictReport,
  assignments: PhaseAssignment[],
  developers: Developer[],
): Promise<boolean> {
  const webhookUrl = process.env.FORGE_ESCALATION_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[escalation] No FORGE_ESCALATION_WEBHOOK_URL configured");
    return false;
  }

  const devMap = new Map(developers.map(d => [d.id, d.display_name]));
  const assignMap = new Map(assignments.map(a => [a.phase_id, a]));

  const conflictLines = report.conflicts.map(c => {
    const phaseInfo = c.phases.map(p => {
      const a = assignMap.get(p.phaseId);
      const dev = a ? devMap.get(a.assignee) || a.assignee : "unassigned";
      return `Phase ${p.phaseId} (${dev}, ${p.source})`;
    });
    return `- \`${c.filePath}\`: ${phaseInfo.join(" vs ")}`;
  });

  const text = [
    "Forge Conflict Escalation",
    `Found ${report.conflicts.length} unresolvable file conflict(s):`,
    "",
    ...conflictLines,
    "",
    "Action required: coordinate merge order or resolve file ownership.",
  ].join("\n");

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return resp.ok;
  } catch (err) {
    console.error(`[escalation] Webhook failed: ${err}`);
    return false;
  }
}
```

### GitHub Actions Post-Results Step

```yaml
# Final step in forge-gates.yml
- uses: actions/github-script@v7
  with:
    script: |
      const marker = '<!-- forge-gates-report -->';
      const results = {
        'Flow Freshness': '${{ needs.flow-freshness.outputs.result }}' || 'skipped',
        'Conflict Check': '${{ needs.conflict-check.outputs.result }}' || 'skipped',
        'Config Validation': '${{ needs.config-validation.outputs.result }}' || 'skipped',
        'Test Suite': '${{ needs.test-suite.result }}',
        'Cost Audit': '${{ needs.cost-audit.outputs.result }}' || 'skipped',
      };

      const icon = v => v === 'pass' || v === 'success' ? ':white_check_mark:' : v === 'skipped' ? ':fast_forward:' : ':x:';
      const rows = Object.entries(results).map(([k,v]) => `| ${icon(v)} ${k} | ${v} |`).join('\n');

      const body = `${marker}
      ## Forge CI Gates

      | Gate | Result |
      |------|--------|
      ${rows}

      *Updated: ${new Date().toISOString()}*`;

      // Find existing comment
      const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
      });
      const existing = comments.find(c => c.body && c.body.includes(marker));

      if (existing) {
        await github.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: existing.id,
          body,
        });
      } else {
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: context.issue.number,
          body,
        });
      }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate flow-freshness.yml workflow | Unified forge-gates.yml with all 5 checks | Phase 3 | One workflow, consolidated comment |
| PR conflict check only on webhook | PR conflict check in both webhook AND CI gate | Phase 3 | Redundancy for reliability |
| No merge order guidance | Topological sort with cycle detection | Phase 3 | Teams know which PR to merge first |
| No push event handling | Push triggers Librarian flow staleness check | Phase 3 | Flows marked stale automatically |
| Escalation only from LangGraph pipeline | Escalation from conflict detector | Phase 3 | Works without autonomous pipeline |

**Deprecated/outdated after Phase 3:**
- `flow-freshness.yml` standalone workflow: replaced by `forge-gates.yml`
- `forge-ci.yml` test-only job: consolidated into forge-gates test-suite job

## Open Questions

1. **Dolt connectivity from GitHub Actions**
   - What we know: `flow_freshness.py` already connects to Dolt via `DOLT_HOST` secret. New gates need the same.
   - What's unclear: Is the Dolt server publicly accessible? If not, gates that need Dolt should gracefully degrade.
   - Recommendation: All gates should have a "no-Dolt fallback" -- skip the check and report "skipped" rather than failing.

2. **Cost audit data source**
   - What we know: `developer_costs` table exists but cost reporting is Phase 4 (COST-01 through COST-05).
   - What's unclear: What data will the cost audit gate check if cost tracking has not been implemented yet?
   - Recommendation: Implement CI-05 as a skeleton that checks if `developer_costs` has any data for the PR's phase and warns if empty. Full cost audit depends on Phase 4.

3. **Librarian agent invocation scope**
   - What we know: The Librarian uses Claude Code CLI and can be expensive.
   - What's unclear: Should the push webhook trigger the full Librarian (update flow docs) or just mark flows as stale?
   - Recommendation: FLOW-02 should mark flows as stale only. Full Librarian flow update can be a separate `forge librarian-run` command. This keeps webhook handling fast and cost-free.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already configured in orchestrator package) |
| Config file | `packages/orchestrator/vitest.config.ts` (implicit -- uses package.json `"test": "vitest run"`) |
| Quick run command | `pnpm --filter @forge/orchestrator test` |
| Full suite command | `pnpm test` (runs all packages) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CI-01 | Flow freshness runs in unified GHA workflow | integration | Manual: verify workflow YAML | -- Wave 0 (YAML validation) |
| CI-02 | Touch map conflict check as GHA step | unit | `pnpm --filter @forge/orchestrator test -- --grep "touch_map_conflicts"` | -- Wave 0 |
| CI-03 | GSD config validation as GHA step | unit | `pnpm --filter @forge/orchestrator test -- --grep "config.validation"` | -- Wave 0 |
| CI-04 | Test suite pass in GHA | integration | Manual: verify workflow YAML | -- (existing tests) |
| CI-05 | Cost audit as GHA step | unit | `pnpm --filter @forge/orchestrator test -- --grep "cost.audit"` | -- Wave 0 |
| CI-06 | PR comment posting | unit | `pnpm --filter @forge/orchestrator test -- --grep "pr.comment"` | -- Wave 0 |
| FLOW-01 | Flow freshness blocks stale PRs | unit | `python -m pytest packages/gates/test_flow_freshness.py` | -- (existing gate, test optional) |
| FLOW-02 | Librarian triggers on push event | unit | `pnpm --filter @forge/orchestrator test -- --grep "push.handler"` | -- Wave 0 |
| FLOW-03 | Criticality-based freshness thresholds | unit | `pnpm --filter @forge/orchestrator test -- --grep "criticality"` | -- Wave 0 |
| MERGE-01 | `forge merge-order` CLI | unit | `pnpm --filter @forge/orchestrator test -- --grep "merge-order"` | -- Wave 0 |
| MERGE-02 | Dependency graph from ROADMAP + overlaps | unit | `pnpm --filter @forge/orchestrator test -- --grep "merge.engine"` | -- Wave 0 |
| MERGE-03 | Merge order posted as PR comment | unit | `pnpm --filter @forge/orchestrator test -- --grep "merge.order.comment"` | -- Wave 0 |
| MERGE-04 | Dependency chain handling | unit | `pnpm --filter @forge/orchestrator test -- --grep "dependency.chain"` | -- Wave 0 |
| ESC-01 | Escalate to Slack/Discord/Teams | unit | `pnpm --filter @forge/orchestrator test -- --grep "escalation"` | -- Wave 0 |
| ESC-02 | Escalation includes context | unit | `pnpm --filter @forge/orchestrator test -- --grep "escalation.context"` | -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @forge/orchestrator test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/unit/coordination/merge-engine.test.ts` -- covers MERGE-01, MERGE-02, MERGE-04
- [ ] `test/unit/coordination/escalation.test.ts` -- covers ESC-01, ESC-02
- [ ] `test/unit/commands/merge-order.test.ts` -- covers MERGE-01 CLI
- [ ] `test/unit/webhook/push-handler.test.ts` -- covers FLOW-02
- [ ] `test/unit/gates/ci-gates.test.ts` -- covers CI-02, CI-03, CI-05, CI-06
- [ ] Python gate files: `packages/gates/touch_map_conflicts.py`, `packages/gates/config_validation.py`, `packages/gates/cost_audit.py`

## Sources

### Primary (HIGH confidence)
- Existing codebase: `conflict-detector.ts`, `gsd-reader.ts`, `lock-manager.ts` -- direct code reading
- Existing codebase: `webhook/server.ts` -- PR comment posting pattern already implemented
- Existing codebase: `human-escalation.ts` -- escalation webhook pattern already implemented
- Existing codebase: `flow_freshness.py` -- Python gate pattern for Dolt queries
- Existing workflows: `forge-ci.yml`, `flow-freshness.yml` -- GHA patterns already in use
- CLAUDE.md project specification -- authoritative architecture decisions

### Secondary (MEDIUM confidence)
- [GitHub Actions workflow syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) -- job outputs, needs, conditional posting
- [actions/github-script](https://github.com/actions/github-script) -- PR comment posting from GHA
- [Graphite guide: Post PR comment from GHA](https://graphite.com/guides/how-to-post-comment-on-pr-github-actions) -- update-or-create comment pattern
- [Create or Update Comment action](https://github.com/marketplace/actions/create-or-update-comment) -- alternative approach for comment management

### Tertiary (LOW confidence)
- None. All findings verified against existing codebase patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already in project, no new packages
- Architecture: HIGH -- extends existing patterns (webhook handler, CLI commands, Python gates)
- Pitfalls: HIGH -- informed by existing code patterns and Phase 2 verification results
- Merge order algorithm: HIGH -- Kahn's algorithm is well-understood, implementation is straightforward

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, existing codebase patterns)
