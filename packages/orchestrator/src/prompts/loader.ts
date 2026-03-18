import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AGENTS_DIR = resolve(import.meta.dirname, "../../../../packages/agents");

export type PromptRole =
  | "planner"
  | "worker"
  | "sub-judge"
  | "high-court"
  | "librarian"
  | "cost-auditor";

/**
 * Load the system prompt for a given agent role.
 * This is the ONLY way agent nodes should access prompt files.
 * Never use fs.readFileSync directly in a node.
 */
export function loadPrompt(role: PromptRole): string {
  const filePath = resolve(AGENTS_DIR, `${role}.md`);
  if (!existsSync(filePath)) {
    throw new Error(`Prompt file not found for role: ${role} at ${filePath}`);
  }
  return readFileSync(filePath, "utf8");
}

/**
 * Get the file path for a prompt role (for testing/debugging).
 */
export function getPromptPath(role: PromptRole): string {
  return resolve(AGENTS_DIR, `${role}.md`);
}
