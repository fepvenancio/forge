import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { getWorktreePath } from "../worktree/manager.js";
import { claudeCode } from "../claude-code.js";
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

const MAX_WORKER_ATTEMPTS = 2;

function readFileSafe(filePath: string): string | null {
  try {
    if (existsSync(filePath)) return readFileSync(filePath, "utf8");
  } catch { /* skip unreadable */ }
  return null;
}

/**
 * Get list of changed files in a worktree via git.
 */
function getChangedFiles(worktreePath: string): string[] {
  try {
    const modified = execSync("git diff --name-only", { cwd: worktreePath, encoding: "utf8" }).trim();
    const staged = execSync("git diff --cached --name-only", { cwd: worktreePath, encoding: "utf8" }).trim();
    const untracked = execSync("git ls-files --others --exclude-standard", { cwd: worktreePath, encoding: "utf8" }).trim();

    const all = new Set<string>();
    for (const line of [...modified.split("\n"), ...staged.split("\n"), ...untracked.split("\n")]) {
      if (line.trim()) all.add(line.trim());
    }
    return [...all];
  } catch {
    return [];
  }
}

/**
 * Revert files that are not in the allowed writes list.
 */
function revertUnauthorizedFiles(worktreePath: string, allowedWrites: string[], changedFiles: string[]): string[] {
  const reverted: string[] = [];
  for (const file of changedFiles) {
    if (!allowedWrites.includes(file)) {
      try {
        execSync(`git checkout -- "${file}"`, { cwd: worktreePath, encoding: "utf8" });
        reverted.push(file);
      } catch {
        // File might be untracked — remove it
        try {
          execSync(`rm -f "${file}"`, { cwd: worktreePath, encoding: "utf8" });
          reverted.push(file);
        } catch { /* ignore */ }
      }
    }
  }
  return reverted;
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
  const costs: Array<{ stage: string; taskId?: string; costUsd: number }> = [...(state.claudeCodeCosts || [])];

  const systemPrompt = loadPrompt("worker");

  // Extract task plans from planData
  const tasks: TaskPlan[] = (planData as { tasks: TaskPlan[] })?.tasks || [];

  for (const taskId of taskIds) {
    console.log(`[worker] Processing task ${taskId}`);

    try {
      const worktreePath = getWorktreePath(projectPath, taskId);

      // Find this task's plan
      const taskPlan = tasks.find((t) => t.id === taskId);
      if (!taskPlan) {
        console.error(`[worker] No plan found for task ${taskId}`);
        failedTaskIds.push(taskId);
        continue;
      }

      // Build prompt for Claude Code — it reads files directly in the worktree
      const contextParts: string[] = [];

      // Task details from plan
      contextParts.push(`## Task Assignment
- **Task ID**: ${taskId}
- **Title**: ${taskPlan.title}
- **Layer**: ${taskPlan.layer}
- **Complexity**: ${taskPlan.complexity}
- **Branch**: ${workerBranches[taskId] || "unknown"}`);

      // Acceptance criteria
      contextParts.push(`## Acceptance Criteria
${taskPlan.acceptance_criteria.map((c) => `- ${c}`).join("\n")}`);

      // Touch map
      contextParts.push(`## Touch Map
**Files you may READ**: ${taskPlan.touch_map.reads.join(", ") || "(none)"}
**Files you may WRITE**: ${taskPlan.touch_map.writes.join(", ") || "(none)"}
**Files you MUST NOT change**: ${taskPlan.must_not_change.join(", ") || "(none)"}`);

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

      // Instructions — Claude Code reads/writes files directly
      contextParts.push(`## Instructions
You are working in a git worktree at the current directory.
Read the files you need to understand, then make the required changes by writing files directly.
Only modify files listed in the touch map writes. Do not modify files in must_not_change.
Produce complete, working code — not pseudocode.
After making changes, provide a summary of what you did.`);

      // Worker invocation with retry-on-zero-files
      let lastResponse: Awaited<ReturnType<typeof claudeCode>> | null = null;

      for (let attempt = 0; attempt < MAX_WORKER_ATTEMPTS; attempt++) {
        const prompt = attempt === 0
          ? contextParts.join("\n\n---\n\n")
          : contextParts.join("\n\n---\n\n") + "\n\n---\n\n## CRITICAL RETRY NOTICE\nYour previous attempt produced ZERO file changes. Please read the relevant files and make the required modifications.";

        console.log(`[worker] Task ${taskId}: calling claude -p (attempt ${attempt + 1}/${MAX_WORKER_ATTEMPTS})...`);
        const callStart = Date.now();

        lastResponse = await claudeCode({
          prompt,
          systemPrompt,
          cwd: worktreePath,
          model: "sonnet",
          timeoutMs: 600_000,
          dangerouslySkipPermissions: true,
          maxBudgetUsd: 5,
        });

        costs.push({ stage: "worker", taskId, costUsd: lastResponse.costUsd });

        console.log(`[worker] Task ${taskId}: claude responded in ${((Date.now() - callStart) / 1000).toFixed(1)}s`);

        // Check what files changed
        const changedFiles = getChangedFiles(worktreePath);
        if (changedFiles.length > 0 || attempt === MAX_WORKER_ATTEMPTS - 1) {
          if (changedFiles.length === 0 && attempt === MAX_WORKER_ATTEMPTS - 1) {
            console.warn(`[worker] Task ${taskId}: no files changed after ${MAX_WORKER_ATTEMPTS} attempts`);
          }
          break;
        }
        console.log(`[worker] Task ${taskId}: 0 files changed, retrying (attempt ${attempt + 2}/${MAX_WORKER_ATTEMPTS})...`);
      }

      // Validate changes against touch_map.writes — revert unauthorized files
      const changedFiles = getChangedFiles(worktreePath);
      const reverted = revertUnauthorizedFiles(worktreePath, taskPlan.touch_map.writes, changedFiles);
      if (reverted.length > 0) {
        console.warn(`[worker] Task ${taskId}: reverted ${reverted.length} unauthorized files: ${reverted.join(", ")}`);
      }

      // Get final list of allowed changed files
      const allowedChanges = changedFiles.filter(f => taskPlan.touch_map.writes.includes(f));

      // Commit changes in worktree
      if (allowedChanges.length > 0) {
        try {
          execSync(`git add ${allowedChanges.map(f => `"${f}"`).join(" ")}`, {
            cwd: worktreePath,
            encoding: "utf8",
          });
          execSync(
            `git commit -m "forge(${taskId}): ${taskPlan.title}"`,
            { cwd: worktreePath, encoding: "utf8" },
          );
          console.log(`[worker] Task ${taskId}: committed ${allowedChanges.length} files to ${workerBranches[taskId]}`);
        } catch (e) {
          console.warn(`[worker] Task ${taskId}: git commit failed: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Write handoff document using Claude Code's natural summary
      const handoffDir = resolve(worktreePath, ".forge", "handoffs");
      mkdirSync(handoffDir, { recursive: true });
      const handoffPath = resolve(handoffDir, `${taskId}.md`);

      const handoffContent = `# Worker Handoff — ${taskId}

## Task
${taskPlan.title}

## Summary
${lastResponse?.result || "No summary provided"}

## Files Modified
${allowedChanges.map((f) => `- ${f}`).join("\n") || "- (none)"}

## Reverted Files
${reverted.length > 0 ? reverted.map((f) => `- ${f} (not in touch_map.writes)`).join("\n") : "- (none)"}
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

  // Summary
  console.log(`[worker] Summary: ${completedTaskIds.length} completed, ${failedTaskIds.length} failed`);

  return {
    workerHandoffs,
    workerArtifactIds,
    workerPrUrls,
    completedTaskIds,
    failedTaskIds,
    claudeCodeCosts: costs,
    currentStage: "worker",
  };
}
