import { computeDependencyChecksums, checkDependencyDrift, getWorktreePath } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

interface TaskPlan {
  id: string;
  touch_map: { reads: string[]; writes: string[] };
}

/**
 * Dependency Check Node (barrier)
 * Waits for all sub-judges to complete, then checks for dependency drift
 * between the base project and each worker's worktree.
 *
 * Dependency changes that are declared in the task's touch_map.writes
 * are considered expected and not flagged as drift.
 */
export async function dependencyCheckNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath, planData } = state;

  console.log(`[dependency-check] Checking ${taskIds.length} tasks for dependency drift`);

  const dependencyDriftTaskIds: string[] = [];
  const tasks: TaskPlan[] = (planData as { tasks: TaskPlan[] })?.tasks || [];

  // Compute base checksums once
  const baseChecksums = computeDependencyChecksums(projectPath);

  for (const taskId of taskIds) {
    const worktreePath = getWorktreePath(projectPath, taskId);
    const worktreeChecksums = computeDependencyChecksums(worktreePath);
    const drift = checkDependencyDrift(baseChecksums, worktreeChecksums);

    if (drift.length > 0) {
      // Check if drift files are declared in the task's touch_map.writes
      const taskPlan = tasks.find((t) => t.id === taskId);
      const writes = taskPlan?.touch_map?.writes || [];
      const unexpectedDrift = drift.filter((file) => !writes.includes(file));

      if (unexpectedDrift.length > 0) {
        console.log(`[dependency-check] Task ${taskId} has unexpected dependency drift: ${unexpectedDrift.join(", ")}`);
        dependencyDriftTaskIds.push(taskId);
      } else {
        console.log(`[dependency-check] Task ${taskId} has planned dependency changes: ${drift.join(", ")} (in touch_map)`);
      }
    }
  }

  if (dependencyDriftTaskIds.length > 0) {
    return {
      dependencyDriftTaskIds,
      currentStage: "dependency_check",
      humanEscalationReason: `Unexpected dependency drift in tasks: ${dependencyDriftTaskIds.join(", ")}`,
    };
  }

  return {
    dependencyDriftTaskIds: [],
    currentStage: "dependency_check",
  };
}
