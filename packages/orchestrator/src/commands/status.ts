import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import * as queries from "../dolt/queries.js";

export function statusCommands(program: Command) {
  program
    .command("status")
    .description("Show team-wide status (who's on what, PR states)")
    .action(async () => {
      console.log(chalk.bold("Forge Team Status\n"));

      const developers = await queries.getAllDevelopers();
      const assignments = await queries.getAllPhaseAssignments();

      // Developer table
      if (developers.length === 0) {
        console.log("No developers registered.");
      } else {
        console.log(chalk.bold("Developers:"));
        const devTable = new Table({
          head: ["Developer", "Phase", "Status", "Branch", "Last Active"],
          style: { head: ["cyan"] },
        });
        for (const dev of developers) {
          const assignment = assignments.find(a => a.assignee === dev.id);
          devTable.push([
            dev.display_name,
            dev.current_phase !== null ? String(dev.current_phase) : "-",
            assignment ? formatStatus(assignment.status) : "idle",
            dev.current_branch || "-",
            new Date(dev.last_active).toISOString().slice(0, 16),
          ]);
        }
        console.log(devTable.toString());
      }

      // Summary
      const active = assignments.filter(a => !["merged"].includes(a.status)).length;
      const prOpen = assignments.filter(a => a.status === "pr_open").length;
      const blocked = assignments.filter(a => a.status === "blocked").length;
      console.log(`\nActive phases: ${active} | PRs open: ${prOpen} | Blocked: ${blocked}`);
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
