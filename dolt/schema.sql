-- Forge Dolt Schema
-- Run via scripts/init-dolt.sh

-- Tasks: one row per unit of work assigned to the factory
CREATE TABLE IF NOT EXISTS tasks (
  id            VARCHAR(36)   PRIMARY KEY,
  prp_ref       TEXT          NOT NULL,
  title         TEXT          NOT NULL,
  description   TEXT,
  layer         VARCHAR(32),
  status        VARCHAR(32)   NOT NULL DEFAULT 'pending',
  complexity    VARCHAR(16)   DEFAULT 'standard',
  created_at    BIGINT        NOT NULL,
  updated_at    BIGINT        NOT NULL,
  cycle_id      VARCHAR(36),
  parent_task   VARCHAR(36)   REFERENCES tasks(id)
);

-- Cycles: one Planner + N Workers + one High Court = one cycle
CREATE TABLE IF NOT EXISTS cycles (
  id            VARCHAR(36)   PRIMARY KEY,
  project_id    VARCHAR(36)   NOT NULL,
  status        VARCHAR(32)   NOT NULL DEFAULT 'running',
  planner_model VARCHAR(128),
  started_at    BIGINT        NOT NULL,
  finished_at   BIGINT,
  judge_outcome VARCHAR(32),
  notes         TEXT
);

-- Stage runs: every agent execution, one row
CREATE TABLE IF NOT EXISTS stage_runs (
  id            VARCHAR(36)   PRIMARY KEY,
  task_id       VARCHAR(36)   NOT NULL REFERENCES tasks(id),
  cycle_id      VARCHAR(36)   REFERENCES cycles(id),
  stage         VARCHAR(64)   NOT NULL,
  model         VARCHAR(128)  NOT NULL,
  worktree_path TEXT,
  branch_name   TEXT,
  started_at    BIGINT        NOT NULL,
  finished_at   BIGINT,
  outcome       VARCHAR(32),
  artifact_id   VARCHAR(36),
  error_message TEXT,
  retry_count   INT           DEFAULT 0
);

-- Touch maps: Planner-declared file access per task
CREATE TABLE IF NOT EXISTS touch_maps (
  id            VARCHAR(36)   PRIMARY KEY,
  task_id       VARCHAR(36)   NOT NULL REFERENCES tasks(id),
  file_path     TEXT          NOT NULL,
  access        VARCHAR(8)    NOT NULL,
  INDEX idx_touch_maps_task (task_id)
);

-- Artifacts: metadata for all typed agent outputs
CREATE TABLE IF NOT EXISTS artifacts (
  id            VARCHAR(36)   PRIMARY KEY,
  stage_run_id  VARCHAR(36)   REFERENCES stage_runs(id),
  schema_type   VARCHAR(64)   NOT NULL,
  schema_version VARCHAR(16)  NOT NULL DEFAULT '1.0',
  file_path     TEXT          NOT NULL,
  created_at    BIGINT        NOT NULL,
  valid         BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Flows: registry of flow documents and their file associations
CREATE TABLE IF NOT EXISTS flow_registry (
  id            VARCHAR(36)   PRIMARY KEY,
  flow_path     TEXT          NOT NULL UNIQUE,
  title         TEXT          NOT NULL,
  criticality   VARCHAR(16)   NOT NULL DEFAULT 'medium',
  last_reviewed BIGINT,
  last_modified BIGINT,
  stale         BOOLEAN       NOT NULL DEFAULT FALSE,
  INDEX idx_flow_stale (stale)
);

-- Flow-file associations: which source files each flow covers
CREATE TABLE IF NOT EXISTS flow_file_refs (
  flow_id       VARCHAR(36)   NOT NULL REFERENCES flow_registry(id),
  file_pattern  TEXT          NOT NULL,
  PRIMARY KEY (flow_id, file_pattern)
);

-- Cycle costs: token usage and estimated cost per cycle
CREATE TABLE IF NOT EXISTS cycle_costs (
  id            VARCHAR(36)   PRIMARY KEY,
  cycle_id      VARCHAR(36)   NOT NULL REFERENCES cycles(id),
  stage         VARCHAR(64)   NOT NULL,
  model         VARCHAR(128)  NOT NULL,
  input_tokens  BIGINT        DEFAULT 0,
  output_tokens BIGINT        DEFAULT 0,
  cost_usd      DECIMAL(10,6) DEFAULT 0,
  recorded_at   BIGINT        NOT NULL
);

-- Worker work logs: append-only, one row per agent action within a task
CREATE TABLE IF NOT EXISTS work_logs (
  id            VARCHAR(36)   PRIMARY KEY,
  task_id       VARCHAR(36)   NOT NULL REFERENCES tasks(id),
  stage_run_id  VARCHAR(36)   REFERENCES stage_runs(id),
  action        VARCHAR(64)   NOT NULL,
  file_path     TEXT,
  detail        TEXT,
  logged_at     BIGINT        NOT NULL,
  INDEX idx_work_logs_task (task_id)
);
