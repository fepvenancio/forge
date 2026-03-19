import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import simpleGit from "simple-git";
import * as queries from "../dolt/queries.js";

export function registerCommands(program: Command) {
  program
    .command("register")
    .description("Register current git user as a Forge developer")
    .option("--name <github-username>", "GitHub username (overrides git config)")
    .option("--display-name <name>", "Display name (overrides git config user.name)")
    .action(async (opts) => {
      const git = simpleGit();
      const gitName = await git.getConfig("user.name");

      if (!opts.name && !gitName.value) {
        console.error(chalk.red("Error: git user.name not configured. Set it or use --name <github-username>"));
        process.exit(1);
      }

      const id = opts.name || gitName.value!;
      const displayName = opts.displayName || gitName.value || id;

      // Check if already registered
      const existing = await queries.getDeveloper(id);
      if (existing) {
        await queries.updateDeveloperActivity(id);
        console.log(chalk.yellow(`Developer "${id}" already registered. Updated last_active.`));
        return;
      }

      const dev = await queries.registerDeveloper({ id, display_name: displayName });
      console.log(chalk.green(`Registered developer "${dev.id}" (${dev.display_name})`));
    });

  program
    .command("team")
    .description("List all registered developers")
    .action(async () => {
      const developers = await queries.getAllDevelopers();
      if (developers.length === 0) {
        console.log("No developers registered. Run `forge register` to register.");
        return;
      }
      const table = new Table({
        head: ["ID", "Display Name", "Current Phase", "Current Branch", "Last Active"],
        style: { head: ["cyan"] },
      });
      for (const dev of developers) {
        table.push([
          dev.id,
          dev.display_name,
          dev.current_phase !== null ? String(dev.current_phase) : "-",
          dev.current_branch || "-",
          new Date(dev.last_active).toISOString().slice(0, 16),
        ]);
      }
      console.log(table.toString());
    });
}
