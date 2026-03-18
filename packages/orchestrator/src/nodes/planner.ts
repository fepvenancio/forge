import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { validate, formatValidationFeedback } from "../gates/validator.js";
import { selectPlannerModel, countLOC, countFlows } from "../models/selector.js";
import type { ForgeStateType } from "../state.js";

function createModelForPlanner(modelName: string) {
  if (modelName.startsWith("claude")) {
    return new ChatAnthropic({ model: modelName, temperature: 0 });
  }
  return new ChatGoogleGenerativeAI({ model: modelName, temperature: 0 });
}

export async function plannerNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { cycleId, projectPath, prpRef, plannerRetries, maxPlannerRetries } = state;

  console.log(`[planner] Starting planning (attempt ${plannerRetries + 1}/${maxPlannerRetries})`);

  // Select model based on codebase size
  const modelName = selectPlannerModel(projectPath);
  const model = createModelForPlanner(modelName);

  // Load system prompt via loader (never fs.readFileSync directly)
  const systemPrompt = loadPrompt("planner");

  // Build context for the planner
  const contextParts: string[] = [];

  // Read PRP
  const prpContent = readFileSync(prpRef, "utf8");
  contextParts.push(`## PRP (Product Requirements Prompt)\n${prpContent}`);

  // Read CLAUDE.md if exists
  const claudeMdPath = resolve(projectPath, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    contextParts.push(`## CLAUDE.md\n${readFileSync(claudeMdPath, "utf8")}`);
  }

  // Read ARCHITECTURE.md if exists
  const archPath = resolve(projectPath, "ARCHITECTURE.md");
  if (existsSync(archPath)) {
    contextParts.push(`## ARCHITECTURE.md\n${readFileSync(archPath, "utf8")}`);
  }

  // Codebase summary
  const loc = countLOC(projectPath);
  const flows = countFlows(projectPath);
  contextParts.push(`## Codebase Summary\nTotal LOC: ${loc}\nFlow documents: ${flows}`);

  // Add retry feedback if this is a retry
  if (plannerRetries > 0 && state.errors.length > 0) {
    const lastError = state.errors[state.errors.length - 1];
    contextParts.push(`## Previous Attempt Error\n${lastError.message}`);
  }

  const userMessage = contextParts.join("\n\n---\n\n");

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);

    const responseText = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Parse JSON from response (may have markdown code fences)
    let parsed: unknown;
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      return {
        planArtifactId: null,
        plannerModel: modelName,
        plannerRetries: plannerRetries + 1,
        planAmbiguousQuestion: null,
        errors: [
          ...state.errors,
          { stage: "planner", message: `Failed to parse planner output as JSON: ${responseText.slice(0, 500)}`, ts: Date.now() },
        ],
      };
    }

    // Check for PLAN_AMBIGUOUS exit ramp
    if (parsed && typeof parsed === "object" && "status" in parsed && (parsed as Record<string, unknown>).status === "PLAN_AMBIGUOUS") {
      const question = (parsed as Record<string, unknown>).question as string || "Unknown question";
      console.log(`[planner] PLAN_AMBIGUOUS: ${question}`);

      return {
        planArtifactId: null,
        plannerModel: modelName,
        plannerRetries: plannerRetries,
        planAmbiguousQuestion: question,
        humanEscalationReason: `Planner needs clarification: ${question}`,
      };
    }

    // Validate against plan.schema.json
    const validation = validate("plan", parsed);
    if (!validation.valid) {
      const feedback = formatValidationFeedback("plan", validation.errors);
      console.log(`[planner] Schema validation failed, will retry`);

      return {
        planArtifactId: null,
        plannerModel: modelName,
        plannerRetries: plannerRetries + 1,
        planAmbiguousQuestion: null,
        errors: [
          ...state.errors,
          { stage: "planner", message: feedback, ts: Date.now() },
        ],
      };
    }

    // Extract task IDs from validated plan
    const plan = parsed as { tasks: Array<{ id: string }> };
    const taskIds = plan.tasks.map((t) => t.id);
    const artifactId = `plan-${cycleId}`;

    console.log(`[planner] Plan accepted with ${taskIds.length} tasks`);

    return {
      planArtifactId: artifactId,
      plannerModel: modelName,
      plannerRetries: plannerRetries,
      planAmbiguousQuestion: null,
      taskIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[planner] Error: ${message}`);

    return {
      planArtifactId: null,
      plannerModel: modelName,
      plannerRetries: plannerRetries + 1,
      planAmbiguousQuestion: null,
      errors: [
        ...state.errors,
        { stage: "planner", message, ts: Date.now() },
      ],
    };
  }
}
