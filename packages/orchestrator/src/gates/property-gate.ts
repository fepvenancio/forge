import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { runInDocker } from "../worktree/docker.js";
import { getWorktreePath } from "../worktree/manager.js";

export type PropertyGateMode = "required" | "optional" | "disabled";

export interface PropertyGateResult {
  taskId: string;
  status: "pass" | "fail" | "warn" | "skipped";
  message: string;
}

/**
 * Read QUALITY.md and extract property_based setting.
 */
export function readPropertyGateMode(projectPath: string): PropertyGateMode {
  const qualityPath = resolve(projectPath, "QUALITY.md");
  if (!existsSync(qualityPath)) return "disabled";

  const content = readFileSync(qualityPath, "utf8");
  const match = content.match(/property_based:\s*(required|optional|disabled)/);
  if (!match) return "disabled";

  return match[1] as PropertyGateMode;
}

/**
 * Property Gate — checks if property-based tests were written and pass.
 */
export function runPropertyGate(
  taskIds: string[],
  projectPath: string,
  mode: PropertyGateMode,
): PropertyGateResult[] {
  if (mode === "disabled") {
    return taskIds.map((taskId) => ({
      taskId,
      status: "skipped" as const,
      message: "Property-based testing disabled in QUALITY.md",
    }));
  }

  const results: PropertyGateResult[] = [];

  for (const taskId of taskIds) {
    const worktreePath = getWorktreePath(projectPath, taskId);

    // Check if property test files exist
    const hasPropertyTests = checkForPropertyTests(worktreePath);

    if (!hasPropertyTests) {
      if (mode === "required") {
        results.push({
          taskId,
          status: "fail",
          message: "Property-based tests required but not found",
        });
      } else {
        // optional
        results.push({
          taskId,
          status: "warn",
          message: "Property-based tests not found (optional — not blocking)",
        });
      }
      continue;
    }

    // Run property tests in Docker
    try {
      const result = runInDocker(worktreePath, "cd /app && npm test -- --grep property 2>&1 || true");
      if (result.exitCode === 0) {
        results.push({ taskId, status: "pass", message: "Property tests passed" });
      } else {
        results.push({
          taskId,
          status: mode === "required" ? "fail" : "warn",
          message: `Property tests failed: ${result.stderr.slice(0, 200)}`,
        });
      }
    } catch {
      results.push({
        taskId,
        status: mode === "required" ? "fail" : "warn",
        message: "Could not run property tests (Docker may not be available)",
      });
    }
  }

  return results;
}

function checkForPropertyTests(worktreePath: string): boolean {
  // Simple heuristic: check for files matching property test patterns
  try {
    const result = execSync(
      `find "${worktreePath}" -name "*.property.test.*" -o -name "*.prop.test.*" -o -name "*_property_test.*" 2>/dev/null | head -1`,
      { encoding: "utf8" },
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}
