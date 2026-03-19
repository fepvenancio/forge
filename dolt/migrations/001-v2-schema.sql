-- 001-v2-schema.sql
-- Forge v2 Team Coordination Schema Migration
--
-- This migration:
--   1. Archives v0.1.0 tables by renaming them with a v1_ prefix
--   2. Creates the four new v2 team coordination tables
--
-- Prerequisites:
--   - Dolt tag "v0.1.0-archive" should be created BEFORE running this migration
--     (handled by scripts/migrate-v2.sh)
--
-- Note: flow_registry and flow_file_refs are NOT renamed -- they are used in v2.

-- ============================================================================
-- Section 1: Archive v0.1.0 tables (RENAME, not DROP)
-- ============================================================================

RENAME TABLE tasks TO v1_tasks;
RENAME TABLE cycles TO v1_cycles;
RENAME TABLE stage_runs TO v1_stage_runs;
RENAME TABLE touch_maps TO v1_touch_maps;
RENAME TABLE artifacts TO v1_artifacts;
RENAME TABLE cycle_costs TO v1_cycle_costs;
RENAME TABLE work_logs TO v1_work_logs;

-- ============================================================================
-- Section 2: Create v2 Team Coordination tables
-- ============================================================================

-- Developer registry: one row per registered team member
CREATE TABLE IF NOT EXISTS developers (
  id            VARCHAR(64)   PRIMARY KEY,
  display_name  VARCHAR(128)  NOT NULL,
  registered_at BIGINT        NOT NULL,
  last_active   BIGINT        NOT NULL,
  current_phase INT           NULL,
  current_branch VARCHAR(256) NULL
);

-- Phase ownership: maps phases to developers (1:1:1 enforcement)
CREATE TABLE IF NOT EXISTS phase_assignments (
  phase_id      INT           PRIMARY KEY,
  assignee      VARCHAR(64)   NOT NULL,
  assigned_at   BIGINT        NOT NULL,
  status        VARCHAR(32)   NOT NULL DEFAULT 'assigned',
  branch_name   VARCHAR(256)  NOT NULL,
  pr_number     INT           NULL,
  INDEX idx_phase_assignee (assignee)
);

-- Advisory file locks: flag potential conflicts, not enforced
CREATE TABLE IF NOT EXISTS file_locks (
  file_path     VARCHAR(512)  PRIMARY KEY,
  locked_by     VARCHAR(64)   NOT NULL,
  phase_id      INT           NOT NULL,
  locked_at     BIGINT        NOT NULL,
  reason        VARCHAR(256)  NULL
);

-- Team cost tracking: per-developer, per-phase cost records
CREATE TABLE IF NOT EXISTS developer_costs (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  developer_id  VARCHAR(64)   NOT NULL,
  phase_id      INT           NOT NULL,
  model         VARCHAR(64)   NOT NULL,
  input_tokens  BIGINT        DEFAULT 0,
  output_tokens BIGINT        DEFAULT 0,
  cost_usd      DECIMAL(10,4) DEFAULT 0,
  recorded_at   BIGINT        NOT NULL,
  INDEX idx_dev_costs_developer (developer_id),
  INDEX idx_dev_costs_phase (phase_id)
);
