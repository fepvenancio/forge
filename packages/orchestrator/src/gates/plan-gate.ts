import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validate, type ValidationResult } from "./validator.js";
import { checkWriteConflicts, type TouchMapEntry } from "../worktree/manager.js";

export interface PlanGateResult {
  status: "pass" | "fail" | "ambiguous";
  errors: string[];
}

interface PlanTask {
  id: string;
  title: string;
  touch_map: { reads: string[]; writes: string[] };
  [key: string]: unknown;
}

interface Plan {
  task_id: string;
  cycle_id: string;
  title: string;
  reasoning: string;
  tasks: PlanTask[];
  status?: string;
  question?: string;
}

/**
 * Plan Gate — mechanical validation of Planner output.
 * No AI involved. Checks schema, file existence, write conflicts.
 */
export function runPlanGate(plan: unknown, projectPath: string): PlanGateResult {
  const errors: string[] = [];

  // Check for PLAN_AMBIGUOUS
  if (plan && typeof plan === "object" && "status" in plan) {
    const p = plan as { status: string; question?: string };
    if (p.status === "PLAN_AMBIGUOUS") {
      return {
        status: "ambiguous",
        errors: [p.question || "Planner emitted PLAN_AMBIGUOUS with no question"],
      };
    }
  }

  // Validate against schema
  const validation = validate("plan", plan);
  if (!validation.valid) {
    return {
      status: "fail",
      errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
    };
  }

  const typedPlan = plan as Plan;

  // Check all referenced files exist
  for (const task of typedPlan.tasks) {
    for (const file of task.touch_map.reads) {
      const fullPath = resolve(projectPath, file);
      if (!existsSync(fullPath)) {
        errors.push(`Task "${task.id}": read file does not exist: ${file}`);
      }
    }
    // Note: write files don't need to exist (they may be created)
  }

  // Check write conflicts across tasks
  const touchMaps: TouchMapEntry[] = typedPlan.tasks.map((t) => ({
    taskId: t.id,
    writes: t.touch_map.writes,
  }));

  const conflicts = checkWriteConflicts(touchMaps);
  for (const conflict of conflicts) {
    errors.push(
      `Write conflict on "${conflict.file}" between tasks: ${conflict.tasks.join(", ")}`,
    );
  }

  return {
    status: errors.length > 0 ? "fail" : "pass",
    errors,
  };
}
