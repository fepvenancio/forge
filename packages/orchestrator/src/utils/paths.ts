import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get __dirname equivalent that works in both ESM and tsx/CJS contexts.
 */
export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

// Pre-computed paths relative to this file (packages/orchestrator/src/utils/)
const UTILS_DIR = getDirname(import.meta.url);
const SRC_DIR = resolve(UTILS_DIR, "..");
const ORCHESTRATOR_DIR = resolve(SRC_DIR, "..");
const PACKAGES_DIR = resolve(ORCHESTRATOR_DIR, "..");
const REPO_ROOT = resolve(PACKAGES_DIR, "..");

export const AGENTS_DIR = resolve(PACKAGES_DIR, "agents");
export const SCHEMAS_DIR = resolve(PACKAGES_DIR, "schemas");
export const FORGE_CONFIG_PATH = resolve(REPO_ROOT, "forge.config.json");
export const SCRIPTS_DIR = resolve(REPO_ROOT, "scripts");
export const FORGE_DIR = resolve(REPO_ROOT, ".forge");
