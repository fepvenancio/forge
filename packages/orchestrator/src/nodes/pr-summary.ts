import type { ForgeStateType } from "../state.js";

/**
 * PR Summary Node
 * Posts a cycle summary with merge order as a numbered checklist.
 * In v1, humans merge PRs in this order — no automated merge queue.
 */
export async function prSummaryNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { mergeOrder, workerPrUrls, cycleId } = state;

  if (mergeOrder.length === 0) {
    console.log(`[pr-summary] No merge order for cycle ${cycleId}`);
    return { currentStage: "pr_summary" };
  }

  // Build the merge checklist
  const lines = [
    `## Forge Cycle \`${cycleId}\` — Merge Order`,
    "",
    "Merge these PRs in order:",
    "",
  ];

  for (let i = 0; i < mergeOrder.length; i++) {
    const taskId = mergeOrder[i];
    const prUrl = workerPrUrls[taskId] || "(no PR)";
    lines.push(`${i + 1}. [ ] ${prUrl} — task \`${taskId}\``);
  }

  const summary = lines.join("\n");

  // Log the summary (in v1, posting to GitHub is handled by the CLI or manually)
  console.log(`[pr-summary] Cycle ${cycleId} complete. Merge in this order:`);
  for (let i = 0; i < mergeOrder.length; i++) {
    const taskId = mergeOrder[i];
    const prUrl = workerPrUrls[taskId] || "(no PR)";
    console.log(`  ${i + 1}. ${prUrl} — ${taskId}`);
  }

  return { currentStage: "pr_summary" };
}
