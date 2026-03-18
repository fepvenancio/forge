import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { selectWorkerModel } from "../models/selector.js";
import { getWorktreePath } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

function createModelForWorker(modelName: string) {
  if (modelName.startsWith("claude")) {
    return new ChatAnthropic({ model: modelName, temperature: 0 });
  }
  return new ChatGoogleGenerativeAI({ model: modelName, temperature: 0 });
}

export async function workerNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath, workerBranches } = state;

  const workerHandoffs: Record<string, string> = { ...state.workerHandoffs };
  const workerArtifactIds: Record<string, string> = { ...state.workerArtifactIds };
  const workerPrUrls: Record<string, string> = { ...state.workerPrUrls };
  const completedTaskIds: string[] = [...state.completedTaskIds];
  const failedTaskIds: string[] = [...state.failedTaskIds];

  const modelName = selectWorkerModel();
  const systemPrompt = loadPrompt("worker");

  // Process workers (in production, these run in parallel via LangGraph .map())
  for (const taskId of taskIds) {
    console.log(`[worker] Processing task ${taskId}`);

    try {
      const worktreePath = getWorktreePath(projectPath, taskId);
      const model = createModelForWorker(modelName);

      // Build context for worker
      const contextParts: string[] = [];
      contextParts.push(`Task ID: ${taskId}`);
      contextParts.push(`Branch: ${workerBranches[taskId] || "unknown"}`);
      contextParts.push(`Worktree: ${worktreePath}`);

      // Read SECURITY.md and QUALITY.md if available
      for (const file of ["SECURITY.md", "QUALITY.md"]) {
        const filePath = resolve(projectPath, file);
        if (existsSync(filePath)) {
          contextParts.push(`## ${file}\n${readFileSync(filePath, "utf8")}`);
        }
      }

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(contextParts.join("\n\n")),
      ]);

      // Write handoff document
      const handoffDir = resolve(worktreePath, ".forge", "handoffs");
      mkdirSync(handoffDir, { recursive: true });
      const handoffPath = resolve(handoffDir, `${taskId}.md`);
      const handoffContent = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
      writeFileSync(handoffPath, handoffContent);

      workerHandoffs[taskId] = handoffPath;
      workerArtifactIds[taskId] = `worker-${taskId}`;
      completedTaskIds.push(taskId);

      console.log(`[worker] Task ${taskId} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] Task ${taskId} failed: ${message}`);
      failedTaskIds.push(taskId);
    }
  }

  return {
    workerHandoffs,
    workerArtifactIds,
    workerPrUrls,
    completedTaskIds,
    failedTaskIds,
    currentStage: "worker",
  };
}
