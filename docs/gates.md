# Gates Reference

All gates are mechanical (no AI). They validate agent output and route the pipeline.

## Plan Gate

**Runs after:** Planner produces output
**Checks:**
1. JSON conforms to `plan.schema.json`
2. All files in `touch_map.reads` exist on disk
3. No write conflicts across tasks (two tasks writing the same file)

**Results:**
- `pass` — plan is valid, proceed to Workers
- `fail` — validation error, retry or escalate
- `ambiguous` — Planner emitted PLAN_AMBIGUOUS, route to human

**Debugging a failure:**
- Schema errors: check the Planner's JSON output format
- Missing files: the Planner referenced a file that doesn't exist
- Write conflicts: merge the conflicting tasks into one `complexity: "complex"` task

## Sub-Judge Gate

**Runs after:** All Sub-Judges complete
**Checks:**
1. All Sub-Judge reports are present
2. Dependency drift detection (checksum comparison of package.json, lock files)
3. Any `status: fail` in reports

**Results:**
- All pass → proceed to Property Gate
- Any fail or drift → route to human escalation (v1)

**Debugging:**
- Dependency drift: Worker modified package.json or lock files outside its touch map
- Sub-Judge fail: check the specific check that failed (syntax, lint, build, tests, etc.)

## Property Gate

**Runs after:** Sub-Judge Gate passes
**Reads:** `QUALITY.md` `property_based` field

**Modes:**
- `disabled` → skip entirely (all tasks get `skipped`)
- `optional` → warn if property tests missing, don't block
- `required` → fail if property tests missing

## High Court Gate

**Runs after:** High Court produces report
**Routes on `decision` field:**
- `merge` → pr_summary_node (post merge order checklist)
- `human_required` → human_escalation_node (halt cycle)
- `abort` → cost_auditor_node (record costs, then end)

**Note:** `revise` is not a valid decision in v1.

## Flow Freshness Gate (CI)

**Runs on:** Every PR (GitHub Actions)
**Checks:** Changed files against `flow_file_refs` in Dolt
**Blocks merge if:** Any matching flow has `stale: true`

**Debugging:**
- Update the stale flow document
- Or ask the Librarian to update it: `forge run --librarian-only`
