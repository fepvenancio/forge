import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORGE_CONFIG_PATH } from "../utils/paths.js";
import type { StageRun } from "../dolt/schema.js";

interface PricingEntry {
  input_per_1m: number;
  output_per_1m: number;
}

interface CostConfig {
  max_cycle_cost_usd: number;
  pricing: Record<string, PricingEntry>;
}

let cachedPricing: CostConfig | null = null;

function loadPricing(): CostConfig {
  if (cachedPricing) return cachedPricing;
  const configPath = FORGE_CONFIG_PATH;
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  cachedPricing = config.cost as CostConfig;
  return cachedPricing;
}

/** Reset pricing cache (for testing) */
export function resetPricingCache(): void {
  cachedPricing = null;
}

/**
 * Calculate cost for a single model invocation.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = loadPricing();
  const entry = pricing.pricing[model];

  if (!entry) {
    console.warn(`No pricing found for model "${model}", using 0 cost`);
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * entry.input_per_1m;
  const outputCost = (outputTokens / 1_000_000) * entry.output_per_1m;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

export interface CostBreakdownEntry {
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface CycleCostReport {
  cycle_id: string;
  total_cost_usd: number;
  exceeds_cap: boolean;
  cap_usd: number;
  breakdown: CostBreakdownEntry[];
}

/**
 * Format a cost report from stage run data.
 * Produces an object conforming to cycle-cost-report.schema.json.
 */
export function formatCostReport(
  cycleId: string,
  stageRuns: Array<{
    stage: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
  }>,
): CycleCostReport {
  const pricing = loadPricing();

  const breakdown: CostBreakdownEntry[] = stageRuns.map((run) => ({
    stage: run.stage,
    model: run.model,
    input_tokens: run.input_tokens,
    output_tokens: run.output_tokens,
    cost_usd: calculateCost(run.model, run.input_tokens, run.output_tokens),
  }));

  const totalCost = breakdown.reduce((sum, entry) => sum + entry.cost_usd, 0);
  const roundedTotal = Math.round(totalCost * 1_000_000) / 1_000_000;

  return {
    cycle_id: cycleId,
    total_cost_usd: roundedTotal,
    exceeds_cap: roundedTotal > pricing.max_cycle_cost_usd,
    cap_usd: pricing.max_cycle_cost_usd,
    breakdown,
  };
}
