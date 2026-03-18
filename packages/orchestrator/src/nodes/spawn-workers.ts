import { createWorktree } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

export async function spawnWorkersNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath } = state;

  console.log(`[spawn-workers] Creating ${taskIds.length} worktrees`);

  const workerBranches: Record<string, string> = {};

  for (const taskId of taskIds) {
    try {
      const info = createWorktree(projectPath, taskId);
      workerBranches[taskId] = info.branch;
      console.log(`[spawn-workers] Created worktree for ${taskId}: ${info.branch}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[spawn-workers] Failed to create worktree for ${taskId}: ${message}`);
    }
  }

  return {
    workerBranches,
    currentStage: "spawn_workers",
  };
}
