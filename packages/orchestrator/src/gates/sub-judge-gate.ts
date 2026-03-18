import { readFileSync } from "node:fs";
import { checkDependencyDrift, computeDependencyChecksums, getWorktreePath } from "../worktree/manager.js";

export interface SubJudgeGateResult {
  status: "pass" | "fail";
  failedTasks: string[];
  escalatedTasks: string[];
  driftTasks: string[];
  errors: string[];
}

interface SubJudgeReport {
  task_id: string;
  status: "pass" | "fail" | "warn";
  escalate_to_high_court?: boolean;
  checks: Array<{ name: string; result: string; message?: string }>;
}

/**
 * Sub-Judge Gate — reads all sub-judge reports, checks dependency drift.
 * Mechanical only, no AI.
 */
export function runSubJudgeGate(
  taskIds: string[],
  reportPaths: Record<string, string>,
  projectPath: string,
): SubJudgeGateResult {
  const failedTasks: string[] = [];
  const escalatedTasks: string[] = [];
  const driftTasks: string[] = [];
  const errors: string[] = [];

  // Check each sub-judge report
  for (const taskId of taskIds) {
    const reportPath = reportPaths[taskId];
    if (!reportPath) {
      errors.push(`No sub-judge report found for task ${taskId}`);
      failedTasks.push(taskId);
      continue;
    }

    try {
      const report: SubJudgeReport = JSON.parse(readFileSync(reportPath, "utf8"));

      if (report.status === "fail") {
        failedTasks.push(taskId);
        const failedChecks = report.checks
          .filter((c) => c.result === "fail")
          .map((c) => `${c.name}: ${c.message || "failed"}`)
          .join("; ");
        errors.push(`Task ${taskId} failed: ${failedChecks}`);
      }

      if (report.escalate_to_high_court) {
        escalatedTasks.push(taskId);
      }
    } catch (err) {
      errors.push(`Could not read report for task ${taskId}: ${err}`);
      failedTasks.push(taskId);
    }
  }

  // Check dependency drift
  const baseChecksums = computeDependencyChecksums(projectPath);
  for (const taskId of taskIds) {
    const worktreePath = getWorktreePath(projectPath, taskId);
    const worktreeChecksums = computeDependencyChecksums(worktreePath);
    const drift = checkDependencyDrift(baseChecksums, worktreeChecksums);

    if (drift.length > 0) {
      driftTasks.push(taskId);
      errors.push(`Task ${taskId} has dependency drift: ${drift.join(", ")}`);
    }
  }

  return {
    status: failedTasks.length > 0 || driftTasks.length > 0 ? "fail" : "pass",
    failedTasks,
    escalatedTasks,
    driftTasks,
    errors,
  };
}
