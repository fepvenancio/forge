import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { getModelForRole } from "../models/selector.js";
import { getWorktreePath } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

const FALLBACK_MODEL = "claude-sonnet-4-6";
const MODEL_TIMEOUT_MS = 300_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

async function invokeWithFallback(
  primaryModelName: string,
  messages: BaseMessage[],
  taskId: string,
): Promise<string> {
  try {
    const model = primaryModelName.startsWith("claude")
      ? new ChatAnthropic({ model: primaryModelName, temperature: 0 })
      : new ChatGoogleGenerativeAI({ model: primaryModelName, temperature: 0 });
    const response = await withTimeout(model.invoke(messages), MODEL_TIMEOUT_MS, `${primaryModelName} for ${taskId}`);
    return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  } catch (err) {
    console.warn(`[sub-judge] Task ${taskId}: ${primaryModelName} failed, falling back to ${FALLBACK_MODEL}`);
    const fallback = new ChatAnthropic({ model: FALLBACK_MODEL, temperature: 0 });
    const response = await withTimeout(fallback.invoke(messages), MODEL_TIMEOUT_MS, `${FALLBACK_MODEL} for ${taskId}`);
    return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  }
}

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
      const worktreePath = getWorktreePath(projectPath, taskId);

      const contextParts: string[] = [];
      contextParts.push(`Task ID: ${taskId}`);
      contextParts.push(`Branch: ${workerBranches[taskId] || "unknown"}`);
      contextParts.push(`Worktree: ${worktreePath}`);

      const responseText = await invokeWithFallback(
        modelName,
        [
          new SystemMessage(systemPrompt),
          new HumanMessage(contextParts.join("\n\n")),
        ],
        taskId,
      );

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
