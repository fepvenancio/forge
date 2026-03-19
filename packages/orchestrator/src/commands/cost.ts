import type { Command } from "commander";
import Table from "cli-table3";
import * as queries from "../dolt/queries.js";

export function costCommands(program: Command): void {
  program
    .command("cost")
    .description("Show cost report (team-wide, per-developer, or per-PR)")
    .argument("[cycle-id]", "Legacy: show costs for a v0.1.0 cycle")
    .option("--team", "Show team-wide cost summary")
    .option("--dev <name>", "Show costs for a specific developer")
    .option("--pr", "Show costs correlated with PR numbers")
    .action(async (cycleId: string | undefined, opts: { team?: boolean; dev?: string; pr?: boolean }) => {
      // Legacy: cycle-id provided with no v2 flags
      if (cycleId && !opts.team && !opts.dev && !opts.pr) {
        const costs = await queries.getCycleCosts(cycleId);
        if (costs.length === 0) {
          console.log("No cost data found for this cycle.");
          return;
        }
        let total = 0;
        console.log("Stage             Model                          Cost");
        console.log("\u2500".repeat(60));
        for (const c of costs) {
          console.log(`${c.stage.padEnd(18)}${c.model.padEnd(32)}$${c.cost_usd.toFixed(4)}`);
          total += c.cost_usd;
        }
        console.log("\u2500".repeat(60));
        console.log(`Total: $${total.toFixed(4)}`);
        return;
      }

      if (opts.pr) {
        const prCosts = await queries.getCostsByPR();
        if (prCosts.length === 0) {
          console.log("No cost data correlated with PRs.");
          return;
        }
        const table = new Table({
          head: ["PR#", "Developer", "Phase", "Model", "Cost", "Input Tokens", "Output Tokens"],
        });
        for (const c of prCosts) {
          table.push([
            `#${c.pr_number}`,
            c.developer_id,
            `Phase ${c.phase_id}`,
            c.model,
            `$${c.cost_usd.toFixed(4)}`,
            c.input_tokens.toLocaleString(),
            c.output_tokens.toLocaleString(),
          ]);
        }
        console.log("\nCost by PR:");
        console.log(table.toString());
        await checkBudgetAlerts(prCosts.map(c => c.phase_id));
        return;
      }

      if (opts.dev) {
        const devCosts = await queries.getDeveloperCosts(opts.dev);
        if (devCosts.length === 0) {
          console.log(`No cost data found for developer "${opts.dev}".`);
          return;
        }
        const table = new Table({
          head: ["Phase", "Model", "Cost", "Input", "Output", "Date"],
        });
        for (const c of devCosts) {
          table.push([
            `Phase ${c.phase_id}`,
            c.model,
            `$${c.cost_usd.toFixed(4)}`,
            c.input_tokens.toLocaleString(),
            c.output_tokens.toLocaleString(),
            new Date(c.recorded_at).toISOString().slice(0, 10),
          ]);
        }
        console.log(`\nCosts for ${opts.dev}:`);
        console.log(table.toString());
        await checkBudgetAlerts(devCosts.map(c => c.phase_id));
        return;
      }

      // Default: --team or no args
      const summary = await queries.getTeamCostSummary();
      if (summary.length === 0) {
        console.log("No cost data recorded yet.");
        return;
      }
      const table = new Table({
        head: ["Developer", "Phase", "Total Cost", "Input Tokens", "Output Tokens", "Records"],
      });
      for (const s of summary) {
        table.push([
          s.developer_id,
          `Phase ${s.phase_id}`,
          `$${s.total_cost.toFixed(4)}`,
          s.total_input.toLocaleString(),
          s.total_output.toLocaleString(),
          s.record_count,
        ]);
      }
      console.log("\nTeam Cost Summary:");
      console.log(table.toString());
      await checkBudgetAlerts(summary.map(s => s.phase_id));
    });

  program
    .command("cost:record")
    .description("Record a developer cost entry")
    .requiredOption("--dev <name>", "Developer ID")
    .requiredOption("--phase <n>", "Phase number")
    .requiredOption("--model <model>", "Model name")
    .requiredOption("--input <n>", "Input tokens")
    .requiredOption("--output <n>", "Output tokens")
    .requiredOption("--cost <n>", "Cost in USD")
    .action(async (opts: { dev: string; phase: string; model: string; input: string; output: string; cost: string }) => {
      const entry = await queries.recordDeveloperCost({
        developer_id: opts.dev,
        phase_id: parseInt(opts.phase, 10),
        model: opts.model,
        input_tokens: parseInt(opts.input, 10),
        output_tokens: parseInt(opts.output, 10),
        cost_usd: parseFloat(opts.cost),
      });
      console.log(`Recorded cost entry #${entry.id} for ${opts.dev} (Phase ${opts.phase}, $${parseFloat(opts.cost).toFixed(4)})`);
    });
}

async function checkBudgetAlerts(phaseIds: number[]): Promise<void> {
  const budget = Number(process.env.FORGE_PHASE_BUDGET_USD || "0");
  if (budget <= 0) return;

  const uniquePhases = [...new Set(phaseIds)];
  for (const phaseId of uniquePhases) {
    const total = await queries.getPhaseTotalCost(phaseId);
    if (total > budget) {
      console.log(`WARNING: Phase ${phaseId} cost ($${total.toFixed(2)}) exceeds budget ($${budget.toFixed(2)})`);
    }
  }
}
