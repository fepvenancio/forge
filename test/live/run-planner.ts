/**
 * Live test — calls the real Planner AI against the fixture project.
 * Requires ANTHROPIC_API_KEY in .env
 *
 * Run: npx tsx test/live/run-planner.ts
 */
import "dotenv/config";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { loadPrompt } from "../../packages/orchestrator/src/prompts/loader.js";
import { validate } from "../../packages/orchestrator/src/gates/validator.js";
import { runPlanGate } from "../../packages/orchestrator/src/gates/plan-gate.js";
import { selectPlannerModel, countLOC } from "../../packages/orchestrator/src/models/selector.js";
import { calculateCost } from "../../packages/orchestrator/src/models/pricing.js";

const FIXTURE = resolve(__dirname, "../fixtures/nextjs-simple");
const PRP = resolve(FIXTURE, "PRPs/add-user-endpoint.md");

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  FORGE LIVE TEST — Planner + Gates");
  console.log("═══════════════════════════════════════════\n");

  // Step 1: Model selection
  const modelName = selectPlannerModel(FIXTURE);
  const loc = countLOC(FIXTURE);
  console.log(`[1/6] Model selected: ${modelName} (${loc} LOC)`);

  // Step 2: Load prompt
  const systemPrompt = loadPrompt("planner");
  console.log(`[2/6] Planner prompt loaded (${systemPrompt.length} chars)`);

  // Step 3: Build context
  const prpContent = readFileSync(PRP, "utf8");
  const claudeMd = readFileSync(resolve(FIXTURE, "CLAUDE.md"), "utf8");
  const archMd = readFileSync(resolve(FIXTURE, "ARCHITECTURE.md"), "utf8");

  const userMessage = [
    `## Context\ntask_id: "task-live-001"\ncycle_id: "cycle-live-001"`,
    `## PRP\n${prpContent}`,
    `## CLAUDE.md\n${claudeMd}`,
    `## ARCHITECTURE.md\n${archMd}`,
    `## Codebase Summary\nTotal LOC: ${loc}\nFlow documents: 0`,
    `## Existing files\n- app/page.tsx\n- app/layout.tsx\n- app/api/health/route.ts\n- package.json`,
    `## Reminder\nYour output MUST include these top-level fields: task_id, cycle_id, title, reasoning, tasks.\nEach task MUST include: id, title, layer (frontend|backend|database|infra|any), complexity (standard|complex), touch_map ({reads:[], writes:[]}), acceptance_criteria ([]), must_not_change ([]).`,
  ].join("\n\n---\n\n");

  console.log(`[3/6] Context built (${userMessage.length} chars)`);

  // Step 4: Call the Planner
  console.log(`[4/6] Calling ${modelName}...`);
  const model = new ChatAnthropic({ model: modelName, temperature: 0 });

  const startTime = Date.now();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ]);
  const durationMs = Date.now() - startTime;

  const responseText = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  // Extract token usage
  const usage = response.usage_metadata;
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cost = calculateCost(modelName, inputTokens, outputTokens);

  console.log(`     Response received in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`     Tokens: ${inputTokens} in / ${outputTokens} out`);
  console.log(`     Cost: $${cost.toFixed(4)}`);

  // Step 5: Parse and validate
  console.log(`[5/6] Validating output...`);

  let parsed: unknown;
  try {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
    parsed = JSON.parse(jsonMatch[1]!.trim());
  } catch (e) {
    console.error("     FAILED to parse JSON:");
    console.error(responseText.slice(0, 500));
    process.exit(1);
  }

  // Check PLAN_AMBIGUOUS
  if (parsed && typeof parsed === "object" && "status" in parsed) {
    const p = parsed as Record<string, unknown>;
    if (p.status === "PLAN_AMBIGUOUS") {
      console.log(`     PLAN_AMBIGUOUS (expected behavior): ${p.question}`);
      process.exit(0);
    }
  }

  // Schema validation
  const schemaResult = validate("plan", parsed);
  if (schemaResult.valid) {
    console.log("     Schema validation: PASS ✓");
  } else {
    console.error("     Schema validation: FAIL ✗");
    for (const err of schemaResult.errors) {
      console.error(`       ${err.field}: ${err.message}`);
    }
  }

  // Step 6: Plan Gate
  console.log(`[6/6] Running Plan Gate...`);
  const gateResult = runPlanGate(parsed, FIXTURE);
  console.log(`     Plan Gate: ${gateResult.status.toUpperCase()}`);
  if (gateResult.errors.length > 0) {
    for (const err of gateResult.errors) {
      console.log(`       - ${err}`);
    }
  }

  // Summary
  const plan = parsed as { tasks?: Array<{ id: string; title: string; layer: string; touch_map: { reads: string[]; writes: string[] } }> };
  if (plan.tasks) {
    console.log(`\n═══ PLAN SUMMARY ═══`);
    console.log(`Tasks: ${plan.tasks.length}`);
    for (const task of plan.tasks) {
      console.log(`  [${task.id}] ${task.title} (${task.layer})`);
      console.log(`    reads:  ${task.touch_map.reads.join(", ") || "(none)"}`);
      console.log(`    writes: ${task.touch_map.writes.join(", ") || "(none)"}`);
    }
  }

  console.log(`\n═══ FULL OUTPUT ═══`);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch(console.error);
