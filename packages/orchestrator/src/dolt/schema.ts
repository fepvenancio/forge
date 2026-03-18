// TypeScript types mirroring Dolt schema tables

export interface Task {
  id: string;
  prp_ref: string;
  title: string;
  description: string | null;
  layer: "frontend" | "backend" | "database" | "infra" | "any" | null;
  status: TaskStatus;
  complexity: "standard" | "complex";
  created_at: number;
  updated_at: number;
  cycle_id: string | null;
  parent_task: string | null;
}

export type TaskStatus =
  | "pending"
  | "planning"
  | "in_progress"
  | "reviewing"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled";

export interface Cycle {
  id: string;
  project_id: string;
  status: CycleStatus;
  planner_model: string | null;
  started_at: number;
  finished_at: number | null;
  judge_outcome: "continue" | "done" | "blocked" | "human_required" | null;
  notes: string | null;
}

export type CycleStatus = "running" | "completed" | "failed" | "halted";

export interface StageRun {
  id: string;
  task_id: string;
  cycle_id: string | null;
  stage: StageName;
  model: string;
  worktree_path: string | null;
  branch_name: string | null;
  started_at: number;
  finished_at: number | null;
  outcome: StageOutcome | null;
  artifact_id: string | null;
  error_message: string | null;
  retry_count: number;
}

export type StageName =
  | "planner"
  | "worker"
  | "sub_judge"
  | "property_gate"
  | "high_court"
  | "librarian"
  | "cost_auditor";

export type StageOutcome = "pass" | "fail" | "gap" | "blocked" | "skipped";

export interface TouchMap {
  id: string;
  task_id: string;
  file_path: string;
  access: "read" | "write";
}

export interface Artifact {
  id: string;
  stage_run_id: string | null;
  schema_type: string;
  schema_version: string;
  file_path: string;
  created_at: number;
  valid: boolean;
}

export interface FlowRegistryEntry {
  id: string;
  flow_path: string;
  title: string;
  criticality: "low" | "medium" | "high" | "critical";
  last_reviewed: number | null;
  last_modified: number | null;
  stale: boolean;
}

export interface FlowFileRef {
  flow_id: string;
  file_pattern: string;
}

export interface CycleCost {
  id: string;
  cycle_id: string;
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  recorded_at: number;
}

export interface WorkLog {
  id: string;
  task_id: string;
  stage_run_id: string | null;
  action: string;
  file_path: string | null;
  detail: string | null;
  logged_at: number;
}
