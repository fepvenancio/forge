import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { getWorktreePath } from "../worktree/manager.js";
import { claudeCode } from "../claude-code.js";
import type { ForgeStateType } from "../state.js";

export async function subJudgeNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath, workerBranches } = state;

  const subJudgeReports: Record<string, string> = { ...state.subJudgeReports };
  const subJudgeEscalations: string[] = [...state.subJudgeEscalations];
  const costs: Array<{ stage: string; taskId?: string; costUsd: number }> = [...(state.claudeCodeCosts || [])];

  const systemPrompt = loadPrompt("sub-judge");

  for (const taskId of taskIds) {
    console.log(`[sub-judge] Reviewing task ${taskId}`);

    try {
      const worktreePath = getWorktreePath(projectPath, taskId);

      const prompt = [
        `Task ID: ${taskId}`,
        `Branch: ${workerBranches[taskId] || "unknown"}`,
        `Worktree: ${worktreePath}`,
        "",
        "Review the code changes in this worktree. Use `git diff` and read the modified files to assess quality.",
        "Respond with a JSON report containing: task_id, stage_run_id, status (pass/fail), checks array, and escalate_to_high_court boolean.",
      ].join("\n\n");

      const response = await claudeCode({
        prompt,
        systemPrompt,
        cwd: worktreePath,
        model: "sonnet",
        timeoutMs: 300_000,
        dangerouslySkipPermissions: true,
        maxBudgetUsd: 2,
      });

      costs.push({ stage: "sub_judge", taskId, costUsd: response.costUsd });

      // Parse and validate report
      let report: Record<string, unknown>;
      try {
        const jsonMatch = response.result.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response.result];
        report = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        report = {
          task_id: taskId,
          stage_run_id: `sr-${taskId}`,
          status: "fail",
          checks: [{ name: "parse", result: "fail", message: "Could not parse sub-judge output" }],
        };
      }

      // Write report to disk
      const reportsDir = resolve(projectPath, ".forge", "reports");
      mkdirSync(reportsDir, { recursive: true });
      const reportPath = resolve(reportsDir, `sub-judge-${taskId}.json`);
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      subJudgeReports[taskId] = reportPath;

      // Check for escalation
      if (report.escalate_to_high_court || report.status === "fail") {
        subJudgeEscalations.push(taskId);
      }

      console.log(`[sub-judge] Task ${taskId}: ${report.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sub-judge] Task ${taskId} failed: ${message}`);
      subJudgeEscalations.push(taskId);
    }
  }

  return {
    subJudgeReports,
    subJudgeEscalations,
    claudeCodeCosts: costs,
    currentStage: "sub_judge",
  };
}
