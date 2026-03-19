import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import * as queries from "../dolt/queries.js";
import * as git from "../utils/git.js";
import {
  claimPhaseWithBranch,
  assignPhaseTodev,
  releasePhaseAssignment,
} from "../coordination/phase-manager.js";

export function phaseCommands(program: Command) {
  program
    .command("claim")
    .description("Claim an unassigned phase for yourself")
    .argument("<phase>", "Phase number to claim")
    .option("--name <phase-name>", "Phase name for branch slug (default: phase-N)")
    .action(async (phase: string, opts) => {
      const phaseId = parseInt(phase, 10);
      if (isNaN(phaseId)) {
        console.error(chalk.red("Error: phase must be a number"));
        process.exit(1);
      }

      // Get current developer identity
      const gitName = await git.getGitConfigValue("user.name");
      if (!gitName) {
        console.error(chalk.red("Error: git user.name not configured"));
        process.exit(1);
      }

      const dev = await queries.getDeveloper(gitName);
      if (!dev) {
        console.error(
          chalk.red(
            `Error: "${gitName}" not registered. Run \`forge register\` first.`,
          ),
        );
        process.exit(1);
      }

      const phaseName = opts.name || `phase-${phaseId}`;

      try {
        const assignment = await claimPhaseWithBranch({
          phaseId,
          assignee: dev.id,
          phaseName,
        });
        console.log(chalk.green(`Claimed phase ${phaseId}`));
        console.log(`  Branch: ${assignment.branch_name}`);
        console.log(`  Status: ${assignment.status}`);
        console.log(
          `\nSwitch to branch: git checkout ${assignment.branch_name}`,
        );
      } catch (err) {
        console.error(
          chalk.red(`Error: ${err instanceof Error ? err.message : err}`),
        );
        process.exit(1);
      }
    });

  program
    .command("assign")
    .description("Assign a phase to a specific developer")
    .argument("<phase>", "Phase number to assign")
    .requiredOption("--to <developer>", "Developer ID to assign to")
    .option("--name <phase-name>", "Phase name for branch slug")
    .action(async (phase: string, opts) => {
      const phaseId = parseInt(phase, 10);
      if (isNaN(phaseId)) {
        console.error(chalk.red("Error: phase must be a number"));
        process.exit(1);
      }

      const phaseName = opts.name || `phase-${phaseId}`;

      try {
        const assignment = await assignPhaseTodev({
          phaseId,
          developerId: opts.to,
          phaseName,
        });
        console.log(chalk.green(`Assigned phase ${phaseId} to ${opts.to}`));
        console.log(`  Branch: ${assignment.branch_name}`);
      } catch (err) {
        console.error(
          chalk.red(`Error: ${err instanceof Error ? err.message : err}`),
        );
        process.exit(1);
      }
    });

  program
    .command("release")
    .description("Release your phase assignment")
    .argument("<phase>", "Phase number to release")
    .action(async (phase: string) => {
      const phaseId = parseInt(phase, 10);
      if (isNaN(phaseId)) {
        console.error(chalk.red("Error: phase must be a number"));
        process.exit(1);
      }

      try {
        await releasePhaseAssignment(phaseId);
        console.log(chalk.green(`Released phase ${phaseId}`));
      } catch (err) {
        console.error(
          chalk.red(`Error: ${err instanceof Error ? err.message : err}`),
        );
        process.exit(1);
      }
    });

  program
    .command("phases")
    .description("Show all phases with current ownership and status")
    .action(async () => {
      const assignments = await queries.getAllPhaseAssignments();

      if (assignments.length === 0) {
        console.log(
          "No phase assignments. Use `forge claim <phase>` to claim one.",
        );
        return;
      }

      const table = new Table({
        head: ["Phase", "Assignee", "Status", "Branch", "PR"],
        style: { head: ["cyan"] },
      });

      for (const a of assignments) {
        table.push([
          String(a.phase_id),
          a.assignee,
          formatStatus(a.status),
          a.branch_name,
          a.pr_number !== null ? `#${a.pr_number}` : "-",
        ]);
      }

      console.log(table.toString());
    });
}

function formatStatus(status: string): string {
  switch (status) {
    case "assigned":
      return chalk.blue(status);
    case "in_progress":
      return chalk.yellow(status);
    case "pr_open":
      return chalk.cyan(status);
    case "merged":
      return chalk.green(status);
    case "blocked":
      return chalk.red(status);
    default:
      return status;
  }
}
