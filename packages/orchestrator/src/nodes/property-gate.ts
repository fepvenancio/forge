import type { ForgeStateType } from "../state.js";

/**
 * Property Gate Node
 * Reads QUALITY.md to determine property_based mode, then runs
 * property-based tests if applicable. In v1, this is a placeholder
 * that checks mode and passes/warns accordingly.
 */
export async function propertyGateNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { completedTaskIds, propertyGateMode } = state;

  console.log(`[property-gate] Mode: ${propertyGateMode}`);

  if (propertyGateMode === "disabled") {
    const results: Record<string, string> = {};
    for (const taskId of completedTaskIds) {
      results[taskId] = "skipped";
    }
    return { propertyGateResults: results, currentStage: "property_gate" };
  }

  const results: Record<string, string> = {};

  for (const taskId of completedTaskIds) {
    if (propertyGateMode === "required") {
      // In production, this would run actual property tests via Docker
      results[taskId] = "pass";
    } else {
      // optional mode — warn if missing, don't block
      results[taskId] = "warn";
    }
  }

  return { propertyGateResults: results, currentStage: "property_gate" };
}
