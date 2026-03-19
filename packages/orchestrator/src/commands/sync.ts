import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import * as queries from "../dolt/queries.js";

export function syncCommands(program: Command) {
  program
    .command("sync")
    .description("Pull latest roadmap and assignments from Dolt")
    .action(async () => {
      console.log(chalk.cyan("Syncing from Dolt..."));

      const assignments = await queries.getAllPhaseAssignments();
      const developers = await queries.getAllDevelopers();

      console.log(chalk.bold(`\nDevelopers: ${developers.length}`));
      console.log(chalk.bold(`Phase Assignments: ${assignments.length}`));

      if (assignments.length > 0) {
        const table = new Table({
          head: ["Phase", "Assignee", "Status", "Branch"],
          style: { head: ["cyan"] },
        });
        for (const a of assignments) {
          table.push([
            String(a.phase_id),
            a.assignee,
            formatStatus(a.status),
            a.branch_name,
          ]);
        }
        console.log(table.toString());
      }

      console.log(chalk.green("\nSync complete."));
    });
}

function formatStatus(status: string): string {
  switch (status) {
    case "assigned": return chalk.blue(status);
    case "in_progress": return chalk.yellow(status);
    case "pr_open": return chalk.cyan(status);
    case "merged": return chalk.green(status);
    case "blocked": return chalk.red(status);
    default: return status;
  }
}
