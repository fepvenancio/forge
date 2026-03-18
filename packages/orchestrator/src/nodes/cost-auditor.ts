import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORGE_CONFIG_PATH } from "../utils/paths.js";
import type { ForgeStateType } from "../state.js";

/**
 * Cost Auditor Node
 * Sums Claude Code costs from state and writes a cost report.
 */
export async function costAuditorNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { cycleId, projectPath, claudeCodeCosts } = state;

  console.log(`[cost-auditor] Calculating costs for cycle ${cycleId}`);

  // Sum costs from claudeCodeCosts in state
  const costs = claudeCodeCosts || [];
  const totalCost = costs.reduce((sum, entry) => sum + entry.costUsd, 0);
  const roundedTotal = Math.round(totalCost * 1_000_000) / 1_000_000;

  // Load cap from config
  let capUsd = 50;
  try {
    const config = JSON.parse(readFileSync(FORGE_CONFIG_PATH, "utf8"));
    capUsd = config.cost?.max_cycle_cost_usd ?? 50;
  } catch { /* use default */ }

  const exceedsCap = roundedTotal > capUsd;

  const report = {
    cycle_id: cycleId,
    total_cost_usd: roundedTotal,
    exceeds_cap: exceedsCap,
    cap_usd: capUsd,
    breakdown: costs.map(c => ({
      stage: c.stage,
      task_id: c.taskId,
      cost_usd: c.costUsd,
    })),
  };

  // Write report
  const reportsDir = resolve(projectPath, ".forge", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = resolve(reportsDir, `cost-${cycleId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[cost-auditor] Total cost: $${roundedTotal}`);
  if (exceedsCap) {
    console.warn(`[cost-auditor] WARNING: Cost exceeds cap of $${capUsd}`);
  }

  return {
    costArtifactId: `cost-${cycleId}`,
    totalCostUsd: roundedTotal,
    costExceedsCap: exceedsCap,
    currentStage: "cost_auditor",
  };
}
