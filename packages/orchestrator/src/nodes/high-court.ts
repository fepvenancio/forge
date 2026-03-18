import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { validate } from "../gates/validator.js";
import { claudeCode } from "../claude-code.js";
import type { ForgeStateType } from "../state.js";

/**
 * High Court Node
 * Reviews all worker handoffs and sub-judge reports, then decides
 * whether to merge, escalate to human, or abort.
 *
 * IMPORTANT: Uses handoff-first strategy — reads handoffs, NOT raw diffs.
 */
export async function highCourtNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { cycleId, projectPath, workerHandoffs, subJudgeReports, subJudgeEscalations, completedTaskIds } = state;

  console.log(`[high-court] Reviewing cycle ${cycleId} (${completedTaskIds.length} workers)`);

  const systemPrompt = loadPrompt("high-court");

  // Build context — HANDOFF-FIRST strategy
  const contextParts: string[] = [];

  // 1. Read ALL worker handoffs first (primary input)
  contextParts.push("## Worker Handoffs");
  for (const taskId of completedTaskIds) {
    const handoffPath = workerHandoffs[taskId];
    if (handoffPath && existsSync(handoffPath)) {
      const content = readFileSync(handoffPath, "utf8");
      contextParts.push(`### Task ${taskId}\n${content}`);
    } else {
      contextParts.push(`### Task ${taskId}\n(No handoff found)`);
    }
  }

  // 2. Read Sub-Judge reports
  contextParts.push("## Sub-Judge Reports");
  for (const taskId of completedTaskIds) {
    const reportPath = subJudgeReports[taskId];
    if (reportPath && existsSync(reportPath)) {
      const content = readFileSync(reportPath, "utf8");
      contextParts.push(`### Task ${taskId}\n${content}`);
    }
  }

  // 3. Note escalations
  if (subJudgeEscalations.length > 0) {
    contextParts.push(`## Escalations\nTasks with escalations: ${subJudgeEscalations.join(", ")}`);
  }

  // 4. Read ARCHITECTURE.md and SECURITY.md for architectural invariant checks
  for (const file of ["ARCHITECTURE.md", "SECURITY.md"]) {
    const filePath = resolve(projectPath, file);
    if (existsSync(filePath)) {
      contextParts.push(`## ${file}\n${readFileSync(filePath, "utf8")}`);
    }
  }

  try {
    const response = await claudeCode({
      prompt: contextParts.join("\n\n---\n\n"),
      systemPrompt,
      model: "opus",
      cwd: projectPath,
      timeoutMs: 600_000,
    });

    const costs: Array<{ stage: string; taskId?: string; costUsd: number }> = [
      ...(state.claudeCodeCosts || []),
      { stage: "high_court", costUsd: response.costUsd },
    ];

    const responseText = response.result;

    // Parse response
    let report: Record<string, unknown>;
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
      report = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      console.error("[high-court] Failed to parse response, escalating to human");
      return {
        highCourtDecision: "human_required",
        humanEscalationReason: "High Court output could not be parsed as JSON",
        claudeCodeCosts: costs,
        currentStage: "high_court",
      };
    }

    // Inject orchestrator-level fields the LLM cannot know
    if (!report.cycle_id) report.cycle_id = cycleId;

    // Validate against schema
    const validation = validate("high-court-report", report);
    if (!validation.valid) {
      console.error(`[high-court] Schema validation failed: ${validation.errors.map(e => `${e.field}: ${e.message}`).join("; ")}`);
      console.error(`[high-court] Report keys: ${Object.keys(report).join(", ")}`);
      return {
        highCourtDecision: "human_required",
        humanEscalationReason: `High Court report failed schema validation: ${validation.errors.map(e => e.message).join(", ")}`,
        claudeCodeCosts: costs,
        currentStage: "high_court",
      };
    }

    // Write report artifact
    const reportsDir = resolve(projectPath, ".forge", "reports");
    mkdirSync(reportsDir, { recursive: true });
    const reportPath = resolve(reportsDir, `high-court-${cycleId}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const decision = report.decision as "merge" | "human_required" | "abort";
    const mergeOrder = (report.merge_order as string[]) || [];

    console.log(`[high-court] Decision: ${decision}`);

    return {
      highCourtArtifactId: `high-court-${cycleId}`,
      highCourtDecision: decision,
      mergeOrder,
      claudeCodeCosts: costs,
      currentStage: "high_court",
      humanEscalationReason: decision === "human_required"
        ? (report.revision_instructions as string) || "High Court requires human review"
        : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[high-court] Error: ${message}`);
    return {
      highCourtDecision: "human_required",
      humanEscalationReason: `High Court error: ${message}`,
      currentStage: "high_court",
    };
  }
}
