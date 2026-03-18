import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";

interface ForgeConfig {
  planner: {
    model_threshold_loc: number;
    model_below_threshold: string;
    model_above_threshold: string;
  };
  workers: {
    default_model: string;
    protocol_model: string;
    max_parallel: number;
  };
  sub_judge: {
    model: string;
  };
  high_court: {
    model: string;
  };
  librarian: {
    model: string;
    batch_threshold: number;
  };
}

let cachedConfig: ForgeConfig | null = null;

function loadConfig(): ForgeConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = resolve(import.meta.dirname, "../../../../forge.config.json");
  cachedConfig = JSON.parse(readFileSync(configPath, "utf8")) as ForgeConfig;
  return cachedConfig;
}

/** Reset config cache (for testing) */
export function resetConfigCache(): void {
  cachedConfig = null;
}

// Binary/generated files to exclude from LOC count
const EXCLUDED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".br",
  ".map", ".min.js", ".min.css",
  ".lock", ".sum",
  ".pdf", ".doc", ".docx",
]);

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "target", "vendor", ".forge", "coverage", ".dolt",
]);

/**
 * Count lines of code in a repository, excluding binary/generated files.
 */
export function countLOC(repoPath: string): number {
  let totalLines = 0;

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && EXCLUDED_DIRS.has(entry.name)) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = resolve(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (EXCLUDED_EXTENSIONS.has(ext)) continue;

        try {
          const stat = statSync(fullPath);
          // Skip files larger than 1MB (likely generated)
          if (stat.size > 1_000_000) continue;

          const content = readFileSync(fullPath, "utf8");
          const lines = content.split("\n").length;
          totalLines += lines;
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(repoPath);
  return totalLines;
}

/**
 * Count Flow documents in a repository.
 */
export function countFlows(repoPath: string): number {
  const flowsDir = resolve(repoPath, ".flows");
  try {
    return readdirSync(flowsDir).filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

/**
 * Select the appropriate Planner model based on codebase size.
 */
export function selectPlannerModel(repoPath: string): string {
  const config = loadConfig();
  const loc = countLOC(repoPath);

  if (loc < config.planner.model_threshold_loc) {
    return config.planner.model_below_threshold;
  }
  return config.planner.model_above_threshold;
}

/**
 * Select the appropriate Worker model based on project type.
 * "protocol" projects (Solidity, Cairo, financial) use the protocol model.
 */
export function selectWorkerModel(
  projectType: "default" | "protocol" = "default",
): string {
  const config = loadConfig();
  if (projectType === "protocol") {
    return config.workers.protocol_model;
  }
  return config.workers.default_model;
}

/**
 * Get the model for a specific role from config.
 */
export function getModelForRole(
  role: "sub_judge" | "high_court" | "librarian",
): string {
  const config = loadConfig();
  switch (role) {
    case "sub_judge":
      return config.sub_judge.model;
    case "high_court":
      return config.high_court.model;
    case "librarian":
      return config.librarian.model;
  }
}

/**
 * Get the maximum number of parallel workers from config.
 */
export function getMaxParallelWorkers(): number {
  const envVal = process.env.FORGE_MAX_PARALLEL_WORKERS;
  if (envVal) return parseInt(envVal, 10);
  return loadConfig().workers.max_parallel;
}
