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

// ─── v2 Team Coordination Types ─────────────────────────────────────────────

export type PhaseStatus = "assigned" | "in_progress" | "pr_open" | "merged" | "blocked";

export interface Developer {
  id: string;            // github username (PRIMARY KEY)
  display_name: string;
  registered_at: number; // epoch ms
  last_active: number;   // epoch ms
  current_phase: number | null;
  current_branch: string | null;
}

export interface PhaseAssignment {
  phase_id: number;      // PRIMARY KEY
  assignee: string;      // developer.id
  assigned_at: number;   // epoch ms
  status: PhaseStatus;
  branch_name: string;
  pr_number: number | null;
}

export interface FileLock {
  file_path: string;     // PRIMARY KEY
  locked_by: string;     // developer.id
  phase_id: number;
  locked_at: number;     // epoch ms
  reason: string | null;
}

export interface DeveloperCost {
  id: number;            // AUTO_INCREMENT
  developer_id: string;
  phase_id: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  recorded_at: number;   // epoch ms
}
