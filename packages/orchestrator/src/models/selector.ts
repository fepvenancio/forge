import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { FORGE_CONFIG_PATH } from "../utils/paths.js";

interface ForgeConfig {
  workers: {
    max_parallel: number;
  };
}

let cachedConfig: ForgeConfig | null = null;

function loadConfig(): ForgeConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = FORGE_CONFIG_PATH;
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
 * Get the maximum number of parallel workers from config.
 */
export function getMaxParallelWorkers(): number {
  const envVal = process.env.FORGE_MAX_PARALLEL_WORKERS;
  if (envVal) return parseInt(envVal, 10);
  return loadConfig().workers.max_parallel;
}
