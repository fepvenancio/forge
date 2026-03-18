import { execSync, type ExecSyncOptions } from "node:child_process";
import { resolve } from "node:path";

export interface DockerRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface DockerRunOptions {
  /** Additional environment variables to pass */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Override memory limit (default from FORGE_WORKER_MEMORY_LIMIT) */
  memoryLimit?: string;
  /** Override CPU limit (default from FORGE_WORKER_CPU_LIMIT) */
  cpuLimit?: string;
}

const DEFAULT_WORKER_IMAGE = "forge-worker:latest";

function getWorkerImage(): string {
  return process.env.FORGE_WORKER_IMAGE || DEFAULT_WORKER_IMAGE;
}

function getMemoryLimit(): string {
  return process.env.FORGE_WORKER_MEMORY_LIMIT || "2g";
}

function getCpuLimit(): string {
  return process.env.FORGE_WORKER_CPU_LIMIT || "1.0";
}

/**
 * Run a command inside the Worker Docker container with worktree mounted.
 * Network is always disabled (--network none).
 */
export function runInDocker(
  worktreePath: string,
  command: string,
  opts: DockerRunOptions = {},
): DockerRunResult {
  const image = getWorkerImage();
  const memory = opts.memoryLimit || getMemoryLimit();
  const cpus = opts.cpuLimit || getCpuLimit();
  const timeout = opts.timeout || 300_000; // 5 min default

  const envFlags = opts.env
    ? Object.entries(opts.env)
        .map(([k, v]) => `--env ${k}=${v}`)
        .join(" ")
    : "";

  const dockerCmd = [
    "docker run --rm",
    `--network none`,
    `--memory ${memory}`,
    `--cpus ${cpus}`,
    `-v "${resolve(worktreePath)}":/app:rw`,
    envFlags,
    image,
    `bash -c "${command.replace(/"/g, '\\"')}"`,
  ]
    .filter(Boolean)
    .join(" ");

  const start = Date.now();

  try {
    const stdout = execSync(dockerCmd, {
      encoding: "utf8",
      timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    return {
      exitCode: 0,
      stdout,
      stderr: "",
      durationMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: err.status || 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run setupEnvironment inside Docker container for a worktree.
 * Runs the install command (npm ci, pip install, etc.) inside the container.
 */
export function setupEnvironment(
  worktreePath: string,
  installCommand: string = "npm ci",
): DockerRunResult {
  return runInDocker(worktreePath, `cd /app && ${installCommand}`, {
    timeout: 600_000, // 10 min for installs
  });
}

/**
 * Build the worker Docker image from worker.Dockerfile.
 */
export function buildWorkerImage(repoRoot: string): DockerRunResult {
  const start = Date.now();

  try {
    const stdout = execSync(
      `docker build -f docker/worker.Dockerfile -t ${getWorkerImage()} .`,
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 600_000, // 10 min
      },
    );

    return {
      exitCode: 0,
      stdout,
      stderr: "",
      durationMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    const result: DockerRunResult = {
      exitCode: err.status || 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      durationMs: Date.now() - start,
    };
    throw new Error(`Failed to build worker image: ${result.stderr}`);
  }
}

/**
 * Check if Docker has enough resources for the configured parallel workers.
 * Returns a warning string if resources are insufficient, null otherwise.
 */
export function checkDockerResources(): string | null {
  const maxParallel = parseInt(
    process.env.FORGE_MAX_PARALLEL_WORKERS || "20",
    10,
  );
  const memoryLimitStr = getMemoryLimit();

  // Parse memory limit to bytes
  const memoryLimitGB = parseMemoryToGB(memoryLimitStr);
  const requiredGB = maxParallel * memoryLimitGB + 4; // +4GB buffer

  try {
    const output = execSync("docker info --format '{{.MemTotal}}'", {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();

    const totalBytes = parseInt(output, 10);
    if (isNaN(totalBytes)) return null;

    const totalGB = totalBytes / (1024 * 1024 * 1024);

    if (totalGB < requiredGB) {
      return `Warning: Docker has ${totalGB.toFixed(1)}GB available, but ${maxParallel} workers × ${memoryLimitStr} + 4GB buffer = ${requiredGB.toFixed(1)}GB required. Reduce FORGE_MAX_PARALLEL_WORKERS or FORGE_WORKER_MEMORY_LIMIT.`;
    }

    return null;
  } catch {
    return "Warning: Could not check Docker resources. Ensure Docker is running.";
  }
}

function parseMemoryToGB(mem: string): number {
  const lower = mem.toLowerCase();
  if (lower.endsWith("g")) return parseFloat(lower);
  if (lower.endsWith("m")) return parseFloat(lower) / 1024;
  return parseFloat(lower);
}
