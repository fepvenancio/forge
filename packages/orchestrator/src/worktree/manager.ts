import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const FORGE_DIR = ".forge";
const WORKTREES_DIR = "worktrees";

function exec(cmd: string, opts?: ExecSyncOptions): string {
  return execSync(cmd, { encoding: "utf8", ...opts }).trim();
}

export interface WorktreeInfo {
  taskId: string;
  path: string;
  branch: string;
}

/**
 * Create a new worktree for a task.
 */
export function createWorktree(
  projectPath: string,
  taskId: string,
  baseBranch: string = "main",
): WorktreeInfo {
  const forgeDir = resolve(projectPath, FORGE_DIR, WORKTREES_DIR);
  mkdirSync(forgeDir, { recursive: true });

  const worktreePath = resolve(forgeDir, taskId);
  const branch = `forge/task/${taskId}`;

  if (existsSync(worktreePath)) {
    throw new Error(`Worktree already exists for task ${taskId} at ${worktreePath}`);
  }

  // Create branch and worktree
  exec(`git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`, {
    cwd: projectPath,
  });

  return { taskId, path: worktreePath, branch };
}

/**
 * Destroy a worktree and clean up its branch.
 */
export function destroyWorktree(projectPath: string, taskId: string): void {
  const worktreePath = resolve(projectPath, FORGE_DIR, WORKTREES_DIR, taskId);
  const branch = `forge/task/${taskId}`;

  if (existsSync(worktreePath)) {
    exec(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
  }

  // Prune and delete branch
  exec("git worktree prune", { cwd: projectPath });
  try {
    exec(`git branch -D "${branch}"`, { cwd: projectPath });
  } catch {
    // Branch may not exist
  }
}

/**
 * List all active Forge worktrees.
 */
export function listWorktrees(projectPath: string): WorktreeInfo[] {
  const forgeDir = resolve(projectPath, FORGE_DIR, WORKTREES_DIR);
  if (!existsSync(forgeDir)) return [];

  const output = exec("git worktree list --porcelain", { cwd: projectPath });
  const worktrees: WorktreeInfo[] = [];

  const blocks = output.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));

    if (pathLine && branchLine) {
      const wtPath = pathLine.replace("worktree ", "");
      const branch = branchLine.replace("branch refs/heads/", "");

      if (branch.startsWith("forge/task/")) {
        const taskId = branch.replace("forge/task/", "");
        worktrees.push({ taskId, path: wtPath, branch });
      }
    }
  }

  return worktrees;
}

/**
 * Get the absolute path for a task's worktree.
 */
export function getWorktreePath(projectPath: string, taskId: string): string {
  return resolve(projectPath, FORGE_DIR, WORKTREES_DIR, taskId);
}

// ─── Dependency Checksum Tracking ───────────────────────────────────────────

const DEPENDENCY_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "Pipfile.lock",
  "go.sum",
  "go.mod",
  "Cargo.lock",
  "Cargo.toml",
];

function checksumFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export interface DependencyChecksums {
  [fileName: string]: string | null;
}

/**
 * Compute checksums for all dependency files in a worktree.
 */
export function computeDependencyChecksums(
  worktreePath: string,
): DependencyChecksums {
  const checksums: DependencyChecksums = {};
  for (const file of DEPENDENCY_FILES) {
    const filePath = join(worktreePath, file);
    checksums[file] = checksumFile(filePath);
  }
  return checksums;
}

/**
 * Check if dependency files changed between two checksum snapshots.
 * Returns list of files that changed.
 */
export function checkDependencyDrift(
  before: DependencyChecksums,
  after: DependencyChecksums,
): string[] {
  const drifted: string[] = [];
  for (const file of DEPENDENCY_FILES) {
    if (before[file] !== after[file]) {
      drifted.push(file);
    }
  }
  return drifted;
}

// ─── Touch Map Conflict Detection ───────────────────────────────────────────

export interface TouchMapEntry {
  taskId: string;
  writes: string[];
}

/**
 * Check for write conflicts across multiple task touch maps.
 * Returns list of files that appear in more than one task's write set.
 */
export function checkWriteConflicts(
  touchMaps: TouchMapEntry[],
): Array<{ file: string; tasks: string[] }> {
  const fileToTasks = new Map<string, string[]>();

  for (const tm of touchMaps) {
    for (const file of tm.writes) {
      const existing = fileToTasks.get(file) || [];
      existing.push(tm.taskId);
      fileToTasks.set(file, existing);
    }
  }

  const conflicts: Array<{ file: string; tasks: string[] }> = [];
  for (const [file, tasks] of fileToTasks) {
    if (tasks.length > 1) {
      conflicts.push({ file, tasks });
    }
  }

  return conflicts;
}
