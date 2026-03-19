import * as queries from "../dolt/queries.js";
import type { FileLock } from "../dolt/schema.js";

export interface LockResult {
  success: boolean;
  lock: FileLock | null;
  warning: string | null;
}

export async function acquireLock(params: {
  filePath: string;
  developerId: string;
  phaseId: number;
  reason?: string;
}): Promise<LockResult> {
  // Check if developer is registered
  const dev = await queries.getDeveloper(params.developerId);
  if (!dev) {
    return { success: false, lock: null, warning: `Developer "${params.developerId}" is not registered` };
  }

  // Check if developer has an active phase assignment
  const assignment = await queries.getPhaseAssignment(params.phaseId);
  if (!assignment || assignment.assignee !== params.developerId) {
    return { success: false, lock: null, warning: `Phase ${params.phaseId} is not assigned to "${params.developerId}"` };
  }

  // Check existing lock (advisory -- warn, never block)
  const existingLocks = await queries.getAllFileLocks();
  const existing = existingLocks.find(l => l.file_path === params.filePath);
  let warning: string | null = null;

  if (existing && existing.locked_by !== params.developerId) {
    warning = `File "${params.filePath}" was previously locked by "${existing.locked_by}" (phase ${existing.phase_id}). Overwriting with your lock (advisory).`;
  }

  const lock = await queries.lockFile({
    file_path: params.filePath,
    locked_by: params.developerId,
    phase_id: params.phaseId,
    reason: params.reason,
  });

  return { success: true, lock, warning };
}

export async function releaseLock(filePath: string, developerId: string): Promise<void> {
  await queries.unlockFile(filePath, developerId);
}

export async function listLocks(): Promise<FileLock[]> {
  return queries.getAllFileLocks();
}
