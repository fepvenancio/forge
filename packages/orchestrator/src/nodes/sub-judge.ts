import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { getModelForRole } from "../models/selector.js";
import { getWorktreePath } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

export async function subJudgeNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath, workerBranches } = state;

  const subJudgeReports: Record<string, string> = { ...state.subJudgeReports };
  const subJudgeEscalations: string[] = [...state.subJudgeEscalations];

  const modelName = getModelForRole("sub_judge");
  const systemPrompt = loadPrompt("sub-judge");

  for (const taskId of taskIds) {
    console.log(`[sub-judge] Reviewing task ${taskId}`);

    try {
      const model = new ChatGoogleGenerativeAI({ model: modelName, temperature: 0 });
      const worktreePath = getWorktreePath(projectPath, taskId);

      const contextParts: string[] = [];
      contextParts.push(`Task ID: ${taskId}`);
      contextParts.push(`Branch: ${workerBranches[taskId] || "unknown"}`);
      contextParts.push(`Worktree: ${worktreePath}`);

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(contextParts.join("\n\n")),
      ]);

      const responseText = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

      // Parse and validate report
      let report: Record<string, unknown>;
      try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
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
    currentStage: "sub_judge",
  };
}
