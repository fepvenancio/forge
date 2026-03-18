import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { loadPrompt } from "../prompts/loader.js";
import { validate, formatValidationFeedback } from "../gates/validator.js";
import { selectPlannerModel, countLOC, countFlows } from "../models/selector.js";
import type { ForgeStateType } from "../state.js";

const TREE_EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "target", "vendor", ".forge", "coverage", ".dolt", ".turbo",
  ".vercel", ".wrangler",
]);

/**
 * Generate a file tree listing for the planner (max depth 4, max 500 entries).
 */
function generateFileTree(rootPath: string, maxDepth = 4, maxEntries = 500): string {
  const entries: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth || entries.length >= maxEntries) return;
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    // Sort: dirs first, then files
    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (entries.length >= maxEntries) break;
      if (item.name.startsWith(".") && TREE_EXCLUDED_DIRS.has(item.name)) continue;
      if (TREE_EXCLUDED_DIRS.has(item.name)) continue;

      const fullPath = resolve(dir, item.name);
      const relPath = relative(rootPath, fullPath);

      if (item.isDirectory()) {
        entries.push(`${relPath}/`);
        walk(fullPath, depth + 1);
      } else {
        entries.push(relPath);
      }
    }
  }

  walk(rootPath, 0);
  if (entries.length >= maxEntries) {
    entries.push(`... (truncated at ${maxEntries} entries)`);
  }
  return entries.join("\n");
}

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

  // Codebase summary with file tree
  const loc = countLOC(projectPath);
  const flows = countFlows(projectPath);
  const fileTree = generateFileTree(projectPath);
  contextParts.push(`## Codebase Summary\nTotal LOC: ${loc}\nFlow documents: ${flows}\n\n### File Tree\n\`\`\`\n${fileTree}\n\`\`\``);

  // Read SECURITY.md and QUALITY.md if they exist
  for (const docFile of ["SECURITY.md", "QUALITY.md"]) {
    const docPath = resolve(projectPath, docFile);
    if (existsSync(docPath)) {
      contextParts.push(`## ${docFile}\n${readFileSync(docPath, "utf8")}`);
    }
  }

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

    // Inject orchestrator-level fields the LLM cannot know
    if (parsed && typeof parsed === "object") {
      const plan = parsed as Record<string, unknown>;
      if (!plan.task_id) plan.task_id = `plan-${cycleId}`;
      if (!plan.cycle_id) plan.cycle_id = cycleId;
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
      console.log(`[planner] Validation errors:\n${feedback}`);
      console.log(`[planner] Model output keys: ${Object.keys(parsed as object).join(", ")}`);

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
      planData: parsed as Record<string, unknown>,
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
