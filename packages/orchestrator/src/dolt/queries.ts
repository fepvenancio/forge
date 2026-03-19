import { v4 as uuidv4 } from "uuid";
import { query, execute, transaction } from "./client.js";
import type {
  Task,
  TaskStatus,
  Cycle,
  CycleStatus,
  StageRun,
  StageName,
  StageOutcome,
  TouchMap,
  Artifact,
  FlowRegistryEntry,
  CycleCost,
  WorkLog,
  Developer,
  PhaseAssignment,
  PhaseStatus,
  FileLock,
  DeveloperCost,
} from "./schema.js";
import type { RowDataPacket } from "mysql2";

// ─── Tasks ──────────────────────────────────────────────────────────────────

export async function createTask(params: {
  prp_ref: string;
  title: string;
  description?: string;
  layer?: Task["layer"];
  complexity?: Task["complexity"];
  cycle_id?: string;
  parent_task?: string;
}): Promise<Task> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO tasks (id, prp_ref, title, description, layer, status, complexity, created_at, updated_at, cycle_id, parent_task)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      id,
      params.prp_ref,
      params.title,
      params.description || null,
      params.layer || null,
      params.complexity || "standard",
      now,
      now,
      params.cycle_id || null,
      params.parent_task || null,
    ],
  );
  return getTask(id) as Promise<Task>;
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<void> {
  await execute(
    `UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`,
    [status, Date.now(), id],
  );
}

export async function getTask(id: string): Promise<Task | null> {
  const rows = await query<(Task & RowDataPacket)[]>(
    `SELECT * FROM tasks WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function getTasksByStatus(
  status: TaskStatus,
): Promise<Task[]> {
  return query<(Task & RowDataPacket)[]>(
    `SELECT * FROM tasks WHERE status = ?`,
    [status],
  );
}

export async function getTasksByCycle(cycleId: string): Promise<Task[]> {
  return query<(Task & RowDataPacket)[]>(
    `SELECT * FROM tasks WHERE cycle_id = ?`,
    [cycleId],
  );
}

// ─── Cycles ─────────────────────────────────────────────────────────────────

export async function createCycle(params: {
  project_id: string;
  planner_model?: string;
}): Promise<Cycle> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO cycles (id, project_id, status, planner_model, started_at)
     VALUES (?, ?, 'running', ?, ?)`,
    [id, params.project_id, params.planner_model || null, now],
  );
  return getCycle(id) as Promise<Cycle>;
}

export async function updateCycle(
  id: string,
  updates: Partial<Pick<Cycle, "status" | "planner_model" | "finished_at" | "judge_outcome" | "notes">>,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.planner_model !== undefined) {
    fields.push("planner_model = ?");
    values.push(updates.planner_model);
  }
  if (updates.finished_at !== undefined) {
    fields.push("finished_at = ?");
    values.push(updates.finished_at);
  }
  if (updates.judge_outcome !== undefined) {
    fields.push("judge_outcome = ?");
    values.push(updates.judge_outcome);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes);
  }

  if (fields.length === 0) return;
  values.push(id);

  await execute(
    `UPDATE cycles SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function getCycle(id: string): Promise<Cycle | null> {
  const rows = await query<(Cycle & RowDataPacket)[]>(
    `SELECT * FROM cycles WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

// ─── Stage Runs ─────────────────────────────────────────────────────────────

export async function createStageRun(params: {
  task_id: string;
  cycle_id?: string;
  stage: StageName;
  model: string;
  worktree_path?: string;
  branch_name?: string;
}): Promise<StageRun> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO stage_runs (id, task_id, cycle_id, stage, model, worktree_path, branch_name, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.task_id,
      params.cycle_id || null,
      params.stage,
      params.model,
      params.worktree_path || null,
      params.branch_name || null,
      now,
    ],
  );
  return { id, ...params, cycle_id: params.cycle_id || null, worktree_path: params.worktree_path || null, branch_name: params.branch_name || null, started_at: now, finished_at: null, outcome: null, artifact_id: null, error_message: null, retry_count: 0 } as StageRun;
}

export async function completeStageRun(
  id: string,
  outcome: StageOutcome,
  artifactId?: string,
  errorMessage?: string,
): Promise<void> {
  await execute(
    `UPDATE stage_runs SET finished_at = ?, outcome = ?, artifact_id = ?, error_message = ? WHERE id = ?`,
    [Date.now(), outcome, artifactId || null, errorMessage || null, id],
  );
}

export async function incrementStageRunRetry(id: string): Promise<void> {
  await execute(
    `UPDATE stage_runs SET retry_count = retry_count + 1 WHERE id = ?`,
    [id],
  );
}

export async function getStageRunsForTask(
  taskId: string,
): Promise<StageRun[]> {
  return query<(StageRun & RowDataPacket)[]>(
    `SELECT * FROM stage_runs WHERE task_id = ? ORDER BY started_at ASC`,
    [taskId],
  );
}

export async function getStageRunsForCycle(
  cycleId: string,
): Promise<StageRun[]> {
  return query<(StageRun & RowDataPacket)[]>(
    `SELECT * FROM stage_runs WHERE cycle_id = ? ORDER BY started_at ASC`,
    [cycleId],
  );
}

// ─── Touch Maps ─────────────────────────────────────────────────────────────

export async function createTouchMap(params: {
  task_id: string;
  file_path: string;
  access: "read" | "write";
}): Promise<TouchMap> {
  const id = uuidv4();
  await execute(
    `INSERT INTO touch_maps (id, task_id, file_path, access) VALUES (?, ?, ?, ?)`,
    [id, params.task_id, params.file_path, params.access],
  );
  return { id, ...params };
}

export async function createTouchMapsFromPlan(
  taskId: string,
  touchMap: { reads: string[]; writes: string[] },
): Promise<void> {
  for (const filePath of touchMap.reads) {
    await createTouchMap({ task_id: taskId, file_path: filePath, access: "read" });
  }
  for (const filePath of touchMap.writes) {
    await createTouchMap({ task_id: taskId, file_path: filePath, access: "write" });
  }
}

export async function getTouchMap(taskId: string): Promise<TouchMap[]> {
  return query<(TouchMap & RowDataPacket)[]>(
    `SELECT * FROM touch_maps WHERE task_id = ?`,
    [taskId],
  );
}

export async function checkTouchMapConflicts(
  touchMaps: Array<{ taskId: string; writes: string[] }>,
): Promise<Array<{ file: string; tasks: string[] }>> {
  const fileToTasks = new Map<string, string[]>();

  for (const tm of touchMaps) {
    for (const file of tm.writes) {
      const existing = fileToTasks.get(file) || [];
      existing.push(tm.taskId);
      fileToTasks.set(file, existing);
    }
  }

  const conflicts: Array<{ file: string; tasks: string[] }> = [];
  for (const [file, tasks] of fileToTasks) {
    if (tasks.length > 1) {
      conflicts.push({ file, tasks });
    }
  }

  return conflicts;
}

// ─── Artifacts ──────────────────────────────────────────────────────────────

export async function createArtifact(params: {
  stage_run_id?: string;
  schema_type: string;
  schema_version?: string;
  file_path: string;
  valid?: boolean;
}): Promise<Artifact> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO artifacts (id, stage_run_id, schema_type, schema_version, file_path, created_at, valid)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.stage_run_id || null,
      params.schema_type,
      params.schema_version || "1.0",
      params.file_path,
      now,
      params.valid !== false,
    ],
  );
  return { id, stage_run_id: params.stage_run_id || null, schema_type: params.schema_type, schema_version: params.schema_version || "1.0", file_path: params.file_path, created_at: now, valid: params.valid !== false };
}

export async function getArtifact(id: string): Promise<Artifact | null> {
  const rows = await query<(Artifact & RowDataPacket)[]>(
    `SELECT * FROM artifacts WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function getArtifactsByStageRun(
  stageRunId: string,
): Promise<Artifact[]> {
  return query<(Artifact & RowDataPacket)[]>(
    `SELECT * FROM artifacts WHERE stage_run_id = ?`,
    [stageRunId],
  );
}

// ─── Work Logs ──────────────────────────────────────────────────────────────

export async function logWork(params: {
  task_id: string;
  stage_run_id?: string;
  action: string;
  file_path?: string;
  detail?: string;
}): Promise<WorkLog> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO work_logs (id, task_id, stage_run_id, action, file_path, detail, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.task_id,
      params.stage_run_id || null,
      params.action,
      params.file_path || null,
      params.detail || null,
      now,
    ],
  );
  return { id, task_id: params.task_id, stage_run_id: params.stage_run_id || null, action: params.action, file_path: params.file_path || null, detail: params.detail || null, logged_at: now };
}

export async function getWorkLog(taskId: string): Promise<WorkLog[]> {
  return query<(WorkLog & RowDataPacket)[]>(
    `SELECT * FROM work_logs WHERE task_id = ? ORDER BY logged_at ASC`,
    [taskId],
  );
}

// ─── Flow Registry ─────────────────────────────────────────────────────────

export async function markFlowStale(flowId: string): Promise<void> {
  await execute(
    `UPDATE flow_registry SET stale = TRUE, last_modified = ? WHERE id = ?`,
    [Date.now(), flowId],
  );
}

export async function getStaleFlows(): Promise<FlowRegistryEntry[]> {
  return query<(FlowRegistryEntry & RowDataPacket)[]>(
    `SELECT * FROM flow_registry WHERE stale = TRUE ORDER BY criticality DESC`,
  );
}

export async function getFlowsForFile(
  filePath: string,
): Promise<FlowRegistryEntry[]> {
  // Match flows whose file_pattern matches the given file path
  // Uses SQL LIKE with the pattern from flow_file_refs
  return query<(FlowRegistryEntry & RowDataPacket)[]>(
    `SELECT fr.* FROM flow_registry fr
     INNER JOIN flow_file_refs ffr ON fr.id = ffr.flow_id
     WHERE ? LIKE REPLACE(REPLACE(ffr.file_pattern, '*', '%'), '?', '_')`,
    [filePath],
  );
}

export async function createFlowRegistryEntry(params: {
  flow_path: string;
  title: string;
  criticality?: FlowRegistryEntry["criticality"];
}): Promise<FlowRegistryEntry> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO flow_registry (id, flow_path, title, criticality, last_modified, stale)
     VALUES (?, ?, ?, ?, ?, FALSE)`,
    [id, params.flow_path, params.title, params.criticality || "medium", now],
  );
  return { id, flow_path: params.flow_path, title: params.title, criticality: params.criticality || "medium", last_reviewed: null, last_modified: now, stale: false };
}

export async function addFlowFileRef(
  flowId: string,
  filePattern: string,
): Promise<void> {
  await execute(
    `INSERT INTO flow_file_refs (flow_id, file_pattern) VALUES (?, ?)`,
    [flowId, filePattern],
  );
}

// ─── Cycle Costs ────────────────────────────────────────────────────────────

export async function recordCycleCost(params: {
  cycle_id: string;
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}): Promise<CycleCost> {
  const id = uuidv4();
  const now = Date.now();
  await execute(
    `INSERT INTO cycle_costs (id, cycle_id, stage, model, input_tokens, output_tokens, cost_usd, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.cycle_id, params.stage, params.model, params.input_tokens, params.output_tokens, params.cost_usd, now],
  );
  return { id, ...params, recorded_at: now };
}

export async function getCycleCosts(
  cycleId: string,
): Promise<CycleCost[]> {
  return query<(CycleCost & RowDataPacket)[]>(
    `SELECT * FROM cycle_costs WHERE cycle_id = ? ORDER BY recorded_at ASC`,
    [cycleId],
  );
}

// ─── Developers (v2) ────────────────────────────────────────────────────────

export async function registerDeveloper(params: {
  id: string;
  display_name: string;
}): Promise<Developer> {
  const now = Date.now();
  await execute(
    `INSERT INTO developers (id, display_name, registered_at, last_active)
     VALUES (?, ?, ?, ?)`,
    [params.id, params.display_name, now, now],
  );
  return getDeveloper(params.id) as Promise<Developer>;
}

export async function getDeveloper(id: string): Promise<Developer | null> {
  const rows = await query<(Developer & RowDataPacket)[]>(
    `SELECT * FROM developers WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function getAllDevelopers(): Promise<Developer[]> {
  return query<(Developer & RowDataPacket)[]>(
    `SELECT * FROM developers ORDER BY registered_at ASC`,
  );
}

export async function updateDeveloperActivity(id: string): Promise<void> {
  await execute(
    `UPDATE developers SET last_active = ? WHERE id = ?`,
    [Date.now(), id],
  );
}

// ─── Phase Assignments (v2) ─────────────────────────────────────────────────

export async function claimPhase(params: {
  phase_id: number;
  assignee: string;
  branch_name: string;
}): Promise<PhaseAssignment> {
  return transaction(async (conn) => {
    // Check phase not already assigned
    const [existingRows] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM phase_assignments WHERE phase_id = ? AND status NOT IN ('merged')`,
      [params.phase_id],
    );
    if ((existingRows as RowDataPacket[]).length > 0) {
      throw new Error(`Phase ${params.phase_id} is already assigned`);
    }
    // Check developer doesn't already have an active phase (1:1:1 enforcement)
    const [devRows] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM phase_assignments WHERE assignee = ? AND status NOT IN ('merged')`,
      [params.assignee],
    );
    if ((devRows as RowDataPacket[]).length > 0) {
      throw new Error(`Developer ${params.assignee} already has an active phase assignment`);
    }
    // Insert assignment
    const now = Date.now();
    await conn.execute(
      `INSERT INTO phase_assignments (phase_id, assignee, assigned_at, status, branch_name)
       VALUES (?, ?, ?, 'assigned', ?)`,
      [params.phase_id, params.assignee, now, params.branch_name],
    );
    // Update developer's current_phase
    await conn.execute(
      `UPDATE developers SET current_phase = ?, current_branch = ?, last_active = ? WHERE id = ?`,
      [params.phase_id, params.branch_name, now, params.assignee],
    );
    return {
      phase_id: params.phase_id,
      assignee: params.assignee,
      assigned_at: now,
      status: "assigned" as PhaseStatus,
      branch_name: params.branch_name,
      pr_number: null,
    };
  });
}

export async function releasePhase(phaseId: number): Promise<void> {
  return transaction(async (conn) => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT assignee FROM phase_assignments WHERE phase_id = ?`,
      [phaseId],
    );
    const assignment = (rows as RowDataPacket[])[0];
    if (!assignment) {
      throw new Error(`Phase ${phaseId} is not assigned`);
    }
    await conn.execute(
      `DELETE FROM phase_assignments WHERE phase_id = ?`,
      [phaseId],
    );
    await conn.execute(
      `UPDATE developers SET current_phase = NULL, current_branch = NULL, last_active = ? WHERE id = ?`,
      [Date.now(), assignment.assignee],
    );
  });
}

export async function getPhaseAssignment(phaseId: number): Promise<PhaseAssignment | null> {
  const rows = await query<(PhaseAssignment & RowDataPacket)[]>(
    `SELECT * FROM phase_assignments WHERE phase_id = ?`,
    [phaseId],
  );
  return rows[0] || null;
}

export async function getAllPhaseAssignments(): Promise<PhaseAssignment[]> {
  return query<(PhaseAssignment & RowDataPacket)[]>(
    `SELECT * FROM phase_assignments ORDER BY phase_id ASC`,
  );
}

export async function updatePhaseStatus(phaseId: number, status: PhaseStatus): Promise<void> {
  await execute(
    `UPDATE phase_assignments SET status = ? WHERE phase_id = ?`,
    [status, phaseId],
  );
}

// ─── File Locks (v2) ─────────────────────────────────────────────────────────

export async function lockFile(params: {
  file_path: string;
  locked_by: string;
  phase_id: number;
  reason?: string;
}): Promise<FileLock> {
  const now = Date.now();
  await execute(
    `INSERT INTO file_locks (file_path, locked_by, phase_id, locked_at, reason) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE locked_by = VALUES(locked_by), phase_id = VALUES(phase_id), locked_at = VALUES(locked_at), reason = VALUES(reason)`,
    [params.file_path, params.locked_by, params.phase_id, now, params.reason || null],
  );
  return { file_path: params.file_path, locked_by: params.locked_by, phase_id: params.phase_id, locked_at: now, reason: params.reason || null };
}

export async function unlockFile(filePath: string, developerId: string): Promise<void> {
  const rows = await query<(FileLock & RowDataPacket)[]>(
    `SELECT * FROM file_locks WHERE file_path = ?`,
    [filePath],
  );
  if (rows.length === 0) {
    throw new Error(`File "${filePath}" is not locked`);
  }
  if (rows[0].locked_by !== developerId) {
    throw new Error(`File "${filePath}" is locked by "${rows[0].locked_by}", not by you ("${developerId}")`);
  }
  await execute(
    `DELETE FROM file_locks WHERE file_path = ? AND locked_by = ?`,
    [filePath, developerId],
  );
}

export async function getAllFileLocks(): Promise<FileLock[]> {
  return query<(FileLock & RowDataPacket)[]>(
    `SELECT * FROM file_locks ORDER BY locked_at DESC`,
  );
}

export async function getFileLocksForPhase(phaseId: number): Promise<FileLock[]> {
  return query<(FileLock & RowDataPacket)[]>(
    `SELECT * FROM file_locks WHERE phase_id = ?`,
    [phaseId],
  );
}

// ─── Developer Costs (v2) ───────────────────────────────────────────────────

export async function recordDeveloperCost(params: {
  developer_id: string;
  phase_id: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}): Promise<DeveloperCost> {
  const now = Date.now();
  const result = await execute(
    `INSERT INTO developer_costs (developer_id, phase_id, model, input_tokens, output_tokens, cost_usd, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [params.developer_id, params.phase_id, params.model, params.input_tokens, params.output_tokens, params.cost_usd, now],
  );
  return {
    id: result.insertId,
    developer_id: params.developer_id,
    phase_id: params.phase_id,
    model: params.model,
    input_tokens: params.input_tokens,
    output_tokens: params.output_tokens,
    cost_usd: params.cost_usd,
    recorded_at: now,
  };
}

export async function getDeveloperCosts(developerId: string): Promise<DeveloperCost[]> {
  return query<(DeveloperCost & RowDataPacket)[]>(
    `SELECT * FROM developer_costs WHERE developer_id = ? ORDER BY recorded_at DESC`,
    [developerId],
  );
}

export async function getPhaseCosts(phaseId: number): Promise<DeveloperCost[]> {
  return query<(DeveloperCost & RowDataPacket)[]>(
    `SELECT * FROM developer_costs WHERE phase_id = ? ORDER BY recorded_at DESC`,
    [phaseId],
  );
}

export async function getTeamCostSummary(): Promise<Array<{
  developer_id: string;
  phase_id: number;
  total_cost: number;
  total_input: number;
  total_output: number;
  record_count: number;
}>> {
  return query<RowDataPacket[]>(
    `SELECT developer_id, phase_id, SUM(cost_usd) as total_cost, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as record_count
     FROM developer_costs GROUP BY developer_id, phase_id ORDER BY developer_id, phase_id`,
  ) as any;
}

export async function getPhaseTotalCost(phaseId: number): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM developer_costs WHERE phase_id = ?`,
    [phaseId],
  );
  return Number(rows[0]?.total || 0);
}

export async function getCostsByPR(): Promise<Array<{
  developer_id: string;
  phase_id: number;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  pr_number: number;
}>> {
  return query<RowDataPacket[]>(
    `SELECT dc.developer_id, dc.phase_id, dc.model, dc.cost_usd, dc.input_tokens, dc.output_tokens, pa.pr_number
     FROM developer_costs dc JOIN phase_assignments pa ON dc.phase_id = pa.phase_id
     WHERE pa.pr_number IS NOT NULL ORDER BY pa.pr_number DESC`,
  ) as any;
}
