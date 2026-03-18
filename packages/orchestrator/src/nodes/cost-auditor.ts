import { formatCostReport } from "../models/pricing.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ForgeStateType } from "../state.js";

/**
 * Cost Auditor Node
 * Calculates cycle cost from Dolt stage_runs and writes a cost report.
 * In production, reads actual token usage from stage_runs table.
 */
export async function costAuditorNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { cycleId, projectPath } = state;

  console.log(`[cost-auditor] Calculating costs for cycle ${cycleId}`);

  // In production, read actual token usage from Dolt stage_runs.
  // For now, generate a report from whatever data is available.
  const report = formatCostReport(cycleId, []);

  // Write report
  const reportsDir = resolve(projectPath, ".forge", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = resolve(reportsDir, `cost-${cycleId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[cost-auditor] Total cost: $${report.total_cost_usd}`);
  if (report.exceeds_cap) {
    console.warn(`[cost-auditor] WARNING: Cost exceeds cap of $${report.cap_usd}`);
  }

  return {
    costArtifactId: `cost-${cycleId}`,
    totalCostUsd: report.total_cost_usd,
    costExceedsCap: report.exceeds_cap,
    currentStage: "cost_auditor",
  };
}
