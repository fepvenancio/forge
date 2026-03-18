import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { selectWorkerModel } from "../models/selector.js";
import { getWorktreePath } from "../worktree/manager.js";
import type { ForgeStateType } from "../state.js";

interface TaskPlan {
  id: string;
  title: string;
  layer: string;
  complexity: string;
  touch_map: { reads: string[]; writes: string[] };
  acceptance_criteria: string[];
  must_not_change: string[];
  depends_on?: string[];
  relevant_flows?: string[];
}

function createModelForWorker(modelName: string) {
  if (modelName.startsWith("claude")) {
    return new ChatAnthropic({ model: modelName, temperature: 0 });
  }
  return new ChatGoogleGenerativeAI({ model: modelName, temperature: 0 });
}

function readFileSafe(filePath: string): string | null {
  try {
    if (existsSync(filePath)) return readFileSync(filePath, "utf8");
  } catch { /* skip unreadable */ }
  return null;
}

export async function workerNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { taskIds, projectPath, workerBranches, planData } = state;

  const workerHandoffs: Record<string, string> = { ...state.workerHandoffs };
  const workerArtifactIds: Record<string, string> = { ...state.workerArtifactIds };
  const workerPrUrls: Record<string, string> = { ...state.workerPrUrls };
  const completedTaskIds: string[] = [...state.completedTaskIds];
  const failedTaskIds: string[] = [...state.failedTaskIds];

  const modelName = selectWorkerModel();
  const systemPrompt = loadPrompt("worker");

  // Extract task plans from planData
  const tasks: TaskPlan[] = (planData as { tasks: TaskPlan[] })?.tasks || [];

  for (const taskId of taskIds) {
    console.log(`[worker] Processing task ${taskId}`);

    try {
      const worktreePath = getWorktreePath(projectPath, taskId);
      const model = createModelForWorker(modelName);

      // Find this task's plan
      const taskPlan = tasks.find((t) => t.id === taskId);
      if (!taskPlan) {
        console.error(`[worker] No plan found for task ${taskId}`);
        failedTaskIds.push(taskId);
        continue;
      }

      // Build rich context for worker
      const contextParts: string[] = [];

      // Task details from plan
      contextParts.push(`## Task Assignment
- **Task ID**: ${taskId}
- **Title**: ${taskPlan.title}
- **Layer**: ${taskPlan.layer}
- **Complexity**: ${taskPlan.complexity}
- **Branch**: ${workerBranches[taskId] || "unknown"}
- **Worktree**: ${worktreePath}`);

      // Acceptance criteria
      contextParts.push(`## Acceptance Criteria
${taskPlan.acceptance_criteria.map((c) => `- ${c}`).join("\n")}`);

      // Touch map
      contextParts.push(`## Touch Map
**Files you may READ**: ${taskPlan.touch_map.reads.join(", ") || "(none)"}
**Files you may WRITE**: ${taskPlan.touch_map.writes.join(", ") || "(none)"}
**Files you MUST NOT change**: ${taskPlan.must_not_change.join(", ") || "(none)"}`);

      // Read source files from touch map (reads + writes)
      const allFiles = [...new Set([...taskPlan.touch_map.reads, ...taskPlan.touch_map.writes])];
      contextParts.push("## Current File Contents");
      for (const file of allFiles) {
        const content = readFileSafe(resolve(worktreePath, file));
        if (content !== null) {
          contextParts.push(`### ${file}\n\`\`\`\n${content}\n\`\`\``);
        } else {
          contextParts.push(`### ${file}\n(file does not exist yet — you will create it)`);
        }
      }

      // Read PRP for full context
      const prpContent = readFileSafe(state.prpRef);
      if (prpContent) {
        contextParts.push(`## PRP (Product Requirements)\n${prpContent}`);
      }

      // Read SECURITY.md and QUALITY.md
      for (const file of ["SECURITY.md", "QUALITY.md"]) {
        const content = readFileSafe(resolve(projectPath, file));
        if (content) {
          contextParts.push(`## ${file}\n${content}`);
        }
      }

      // Instructions for structured output
      contextParts.push(`## Output Instructions
You MUST respond with valid JSON (no prose, no markdown fences) in this exact format:

{
  "files": [
    {
      "path": "relative/file/path.ts",
      "content": "full file content as a string"
    }
  ],
  "handoff": {
    "what_was_done": "description of changes made",
    "what_was_not_done": "scope deliberately excluded",
    "concerns": "any edge cases or concerns discovered",
    "security_notes": "any security items flagged",
    "files_modified": ["list", "of", "files", "modified"]
  }
}

IMPORTANT:
- Only write files listed in your touch_map.writes
- Produce complete, working code — not pseudocode
- Include all imports and dependencies
- The "content" field must contain the FULL file content (not a diff)`);

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(contextParts.join("\n\n---\n\n")),
      ]);

      const responseText = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

      // Parse the structured response
      let workerOutput: { files?: Array<{ path: string; content: string }>; handoff?: Record<string, unknown> };
      try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        workerOutput = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        // If parsing fails, treat the entire response as the handoff
        console.warn(`[worker] Task ${taskId}: could not parse structured output, saving raw response`);
        workerOutput = {
          handoff: {
            what_was_done: "Worker produced unstructured output",
            what_was_not_done: "Structured code generation",
            concerns: "Output was not valid JSON",
            security_notes: "None",
            files_modified: [],
          },
        };
      }

      // Write files to worktree
      const filesWritten: string[] = [];
      if (workerOutput.files && Array.isArray(workerOutput.files)) {
        for (const file of workerOutput.files) {
          // Validate file is in touch_map.writes
          if (!taskPlan.touch_map.writes.includes(file.path)) {
            console.warn(`[worker] Task ${taskId}: skipping ${file.path} (not in touch_map.writes)`);
            continue;
          }
          const fullPath = resolve(worktreePath, file.path);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, file.content);
          filesWritten.push(file.path);
        }
        console.log(`[worker] Task ${taskId}: wrote ${filesWritten.length} files`);
      }

      // Commit changes in worktree
      if (filesWritten.length > 0) {
        try {
          execSync(`git add ${filesWritten.map(f => `"${f}"`).join(" ")}`, {
            cwd: worktreePath,
            encoding: "utf8",
          });
          execSync(
            `git commit -m "forge(${taskId}): ${taskPlan.title}"`,
            { cwd: worktreePath, encoding: "utf8" },
          );
          console.log(`[worker] Task ${taskId}: committed to ${workerBranches[taskId]}`);
        } catch (e) {
          console.warn(`[worker] Task ${taskId}: git commit failed: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Write handoff document
      const handoffDir = resolve(worktreePath, ".forge", "handoffs");
      mkdirSync(handoffDir, { recursive: true });
      const handoffPath = resolve(handoffDir, `${taskId}.md`);

      const handoff = workerOutput.handoff || {};
      const handoffContent = `# Worker Handoff — ${taskId}

## Task
${taskPlan.title}

## What was done
${handoff.what_was_done || "No description provided"}

## What was NOT done
${handoff.what_was_not_done || "Nothing excluded"}

## Concerns / Edge Cases
${handoff.concerns || "None"}

## Security Notes
${handoff.security_notes || "None"}

## Files Modified
${filesWritten.map((f) => `- ${f}`).join("\n") || "- (none)"}
`;
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
