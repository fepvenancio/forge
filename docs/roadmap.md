# Roadmap

## Phase 13 / v2 — Deferred Items

These features are explicitly out of scope for v1. They will be added when real usage patterns inform the design.

### Partial Worker Re-Queue
Re-running only failing Workers after Sub-Judge failure, without re-running passing Workers.

**Why deferred:** Requires understanding real failure patterns first. Automated retry of unknown failure patterns risks burning tokens on the same mistake.

**Prerequisites:** At least 50 cycles of production data showing failure distribution.

### Automated Merge Queue
`merge_queue_node` with sequential `git merge --no-ff`, conflict detection, and release PR creation.

**Why deferred:** The v1 `pr_summary_node` with human merging is safer while trust in the system builds. Automated merging of AI-generated code requires high confidence in the Sub-Judge and High Court pipeline.

**Implementation sketch:**
1. Merge Workers in `merge_order` sequence
2. After each merge, re-run affected tests
3. If conflict: halt and escalate
4. Create a release PR from the merged result

### Prompt Semver + CHANGELOG Tooling
`update-prompt.sh`, `registry.json` with sha256 hashes, automated version bumping.

**Why deferred:** Add when there's enough prompt change history to know what a "breaking change" actually means in practice. v1's CODEOWNERS + test suite is sufficient.

### High Court Revision Instructions
High Court decides `merge | human_required | abort` only. A `revise` decision with specific instructions routed back to Workers.

**Why deferred:** Requires the partial re-queue system to be meaningful. Without partial re-queue, revisions would re-run all Workers, which is wasteful.

### Multi-Repo Support
Running Forge across multiple repositories (e.g., frontend + backend + shared lib).

### Remote Worker Execution
SSH-based worker execution on remote machines instead of local Docker.

### Forge-as-a-Service API
REST API for running Forge cycles, enabling integration with other tools.
