# Dolt Schema Reference

Forge uses Dolt (versioned SQL database with Git semantics) for all shared state.

## Tables

### tasks
One row per unit of work.

| Column | Type | Description |
|---|---|---|
| id | VARCHAR(36) | UUID primary key |
| prp_ref | TEXT | Path to PRP file |
| title | TEXT | Task title |
| description | TEXT | Task description |
| layer | VARCHAR(32) | frontend/backend/database/infra/any |
| status | VARCHAR(32) | pending/planning/in_progress/reviewing/blocked/done/failed/cancelled |
| complexity | VARCHAR(16) | standard/complex |
| created_at | BIGINT | Unix timestamp (ms) |
| updated_at | BIGINT | Unix timestamp (ms) |
| cycle_id | VARCHAR(36) | FK to cycles |
| parent_task | VARCHAR(36) | FK to tasks (self-referential) |

### cycles
One Planner + N Workers + one High Court = one cycle.

| Column | Type | Description |
|---|---|---|
| id | VARCHAR(36) | UUID |
| project_id | VARCHAR(36) | Project identifier |
| status | VARCHAR(32) | running/completed/failed/halted |
| planner_model | VARCHAR(128) | Model used by Planner |
| started_at | BIGINT | Unix timestamp (ms) |
| finished_at | BIGINT | Unix timestamp (ms) |
| judge_outcome | VARCHAR(32) | continue/done/blocked/human_required |
| notes | TEXT | Free-form notes |

### stage_runs
Every agent execution.

| Column | Type | Description |
|---|---|---|
| id | VARCHAR(36) | UUID |
| task_id | VARCHAR(36) | FK to tasks |
| cycle_id | VARCHAR(36) | FK to cycles |
| stage | VARCHAR(64) | planner/worker/sub_judge/property_gate/high_court/librarian/cost_auditor |
| model | VARCHAR(128) | Model used |
| worktree_path | TEXT | Path to git worktree |
| branch_name | TEXT | Git branch name |
| started_at | BIGINT | Unix timestamp (ms) |
| finished_at | BIGINT | Unix timestamp (ms) |
| outcome | VARCHAR(32) | pass/fail/gap/blocked/skipped |
| artifact_id | VARCHAR(36) | FK to artifacts |
| error_message | TEXT | Error details |
| retry_count | INT | Number of retries |

### touch_maps
Planner-declared file access per task.

| Column | Type | Description |
|---|---|---|
| id | VARCHAR(36) | UUID |
| task_id | VARCHAR(36) | FK to tasks |
| file_path | TEXT | File path |
| access | VARCHAR(8) | read/write |

### artifacts
Metadata for typed agent outputs.

| Column | Type | Description |
|---|---|---|
| id | VARCHAR(36) | UUID |
| stage_run_id | VARCHAR(36) | FK to stage_runs |
| schema_type | VARCHAR(64) | plan/touch_map/sub_judge_report/etc |
| schema_version | VARCHAR(16) | Schema version |
| file_path | TEXT | Absolute path to artifact on disk |
| created_at | BIGINT | Unix timestamp (ms) |
| valid | BOOLEAN | Whether artifact passed validation |

### flow_registry
Flow documents and their staleness state.

### flow_file_refs
Which source files each flow covers (glob patterns).

### cycle_costs
Token usage and cost per stage per cycle.

### work_logs
Append-only log of Worker actions within a task.

## Common Queries

```sql
-- Get all tasks for a cycle
SELECT * FROM tasks WHERE cycle_id = ? ORDER BY created_at ASC;

-- Get running cycles
SELECT * FROM cycles WHERE status = 'running';

-- Get cost for a cycle
SELECT stage, model, SUM(cost_usd) as total
FROM cycle_costs WHERE cycle_id = ?
GROUP BY stage, model;

-- Find stale flows
SELECT * FROM flow_registry WHERE stale = TRUE ORDER BY criticality DESC;

-- Get worker timeline
SELECT * FROM stage_runs WHERE cycle_id = ? ORDER BY started_at ASC;
```
