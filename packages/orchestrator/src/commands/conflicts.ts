import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { checkConflicts } from "../coordination/conflict-detector.js";
import { acquireLock, releaseLock, listLocks } from "../coordination/lock-manager.js";
import * as git from "../utils/git.js";

export function conflictCommands(program: Command) {
  program
    .command("check-conflicts")
    .description("Check for file-level conflicts across active phase branches")
    .action(async () => {
      const report = await checkConflicts();

      if (report.conflicts.length === 0 && report.lockWarnings.length === 0) {
        console.log(chalk.green("No conflicts detected across active phase branches."));
        return;
      }

      if (report.conflicts.length > 0) {
        console.log(chalk.red(`\nFound ${report.conflicts.length} file conflict(s):\n`));
        const table = new Table({
          head: ["File", "Phases", "Source"],
          style: { head: ["red"] },
        });
        for (const conflict of report.conflicts) {
          table.push([
            conflict.filePath,
            conflict.phases.map(p => `Phase ${p.phaseId}`).join(", "),
            conflict.phases.map(p => p.source).join(", "),
          ]);
        }
        console.log(table.toString());
      }

      if (report.lockWarnings.length > 0) {
        console.log(chalk.yellow(`\n${report.lockWarnings.length} lock warning(s):\n`));
        for (const lw of report.lockWarnings) {
          console.log(chalk.yellow(`  Warning: "${lw.filePath}" locked by ${lw.lockedBy} (phase ${lw.phaseId}) but modified by phase(s) ${lw.conflictingPhases.join(", ")}`));
        }
      }

      // Show staleness info
      for (const [phaseId, files] of report.actualOnlyFiles) {
        if (files.length > 0) {
          console.log(chalk.gray(`\n  Phase ${phaseId}: ${files.length} file(s) modified but not declared in PLAN.md`));
        }
      }
    });

  program
    .command("lock")
    .description("Advisory lock on a file")
    .argument("<file>", "File path to lock")
    .requiredOption("--phase <n>", "Phase number", parseInt)
    .option("--reason <reason>", "Reason for locking")
    .action(async (file: string, opts: { phase: number; reason?: string }) => {
      const gitName = await git.getGitConfigValue("user.name");
      if (!gitName) {
        console.error(chalk.red("Error: git user.name not configured"));
        process.exit(1);
      }

      const result = await acquireLock({
        filePath: file,
        developerId: gitName,
        phaseId: opts.phase,
        reason: opts.reason,
      });

      if (!result.success) {
        console.error(chalk.red(`Lock failed: ${result.warning}`));
        process.exit(1);
      }

      if (result.warning) {
        console.log(chalk.yellow(`Warning: ${result.warning}`));
      }

      console.log(chalk.green(`Locked "${file}" for phase ${opts.phase}`));
    });

  program
    .command("unlock")
    .description("Release advisory lock on a file")
    .argument("<file>", "File path to unlock")
    .action(async (file: string) => {
      const gitName = await git.getGitConfigValue("user.name");
      if (!gitName) {
        console.error(chalk.red("Error: git user.name not configured"));
        process.exit(1);
      }

      try {
        await releaseLock(file, gitName);
        console.log(chalk.green(`Unlocked "${file}"`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  program
    .command("locks")
    .description("Show all active advisory file locks")
    .action(async () => {
      const locks = await listLocks();
      if (locks.length === 0) {
        console.log("No active file locks.");
        return;
      }

      const table = new Table({
        head: ["File", "Locked By", "Phase", "Reason", "Locked At"],
        style: { head: ["cyan"] },
      });
      for (const lock of locks) {
        table.push([
          lock.file_path,
          lock.locked_by,
          String(lock.phase_id),
          lock.reason || "-",
          new Date(lock.locked_at).toISOString().slice(0, 16),
        ]);
      }
      console.log(table.toString());
    });
}
