import { computeDependencyChecksums, checkDependencyDrift, getWorktreePath } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

/**
 * Dependency Check Node (barrier)
 * Waits for all sub-judges to complete, then checks for dependency drift
 * between the base project and each worker's worktree.
 */
export async function dependencyCheckNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath } = state;

  console.log(`[dependency-check] Checking ${taskIds.length} tasks for dependency drift`);

  const dependencyDriftTaskIds: string[] = [];

  // Compute base checksums once
  const baseChecksums = computeDependencyChecksums(projectPath);

  for (const taskId of taskIds) {
    const worktreePath = getWorktreePath(projectPath, taskId);
    const worktreeChecksums = computeDependencyChecksums(worktreePath);
    const drift = checkDependencyDrift(baseChecksums, worktreeChecksums);

    if (drift.length > 0) {
      console.log(`[dependency-check] Task ${taskId} has dependency drift: ${drift.join(", ")}`);
      dependencyDriftTaskIds.push(taskId);
    }
  }

  if (dependencyDriftTaskIds.length > 0) {
    return {
      dependencyDriftTaskIds,
      currentStage: "dependency_check",
      humanEscalationReason: `Dependency drift detected in tasks: ${dependencyDriftTaskIds.join(", ")}`,
    };
  }

  return {
    dependencyDriftTaskIds: [],
    currentStage: "dependency_check",
  };
}
