import type { Command } from "commander";
import Table from "cli-table3";
import { getMergeOrderForOpenPRs } from "../coordination/merge-engine.js";
import * as queries from "../dolt/queries.js";

export function mergeOrderCommands(program: Command): void {
  program
    .command("merge-order")
    .description("Show optimal merge order for open PRs")
    .action(async () => {
      const result = await getMergeOrderForOpenPRs();

      if (result.order.length === 0 && result.cycles.length === 0) {
        console.log("No phases with open PRs found.");
        return;
      }

      // Get assignments for display
      const assignments = await queries.getAllPhaseAssignments();
      const assignMap = new Map(assignments.map(a => [a.phase_id, a]));

      if (result.order.length > 0) {
        const table = new Table({
          head: ["#", "Phase", "Branch", "PR"],
        });

        result.order.forEach((phaseId, idx) => {
          const a = assignMap.get(phaseId);
          table.push([
            idx + 1,
            `Phase ${phaseId}`,
            a?.branch_name || "unknown",
            a?.pr_number ? `#${a.pr_number}` : "no PR",
          ]);
        });

        console.log("\nRecommended merge order:");
        console.log(table.toString());
      }

      if (result.reasoning.length > 0) {
        console.log("\nReasoning:");
        result.reasoning.forEach(r => console.log(`  - ${r}`));
      }

      if (result.cycles.length > 0) {
        console.log("\nWARNING: Circular dependencies detected:");
        result.cycles.forEach(cycle => {
          console.log(`  Phases ${cycle.join(", ")} have mutual dependencies -- coordinate merge order manually`);
        });
      }
    });
}
