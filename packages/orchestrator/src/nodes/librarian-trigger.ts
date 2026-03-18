import type { ForgeStateType } from "../state.js";

/**
 * Librarian Trigger Node
 * Fire-and-forget POST to webhook server to trigger the Librarian agent.
 * Does not block cycle completion — the Librarian runs asynchronously.
 */
export async function librarianTriggerNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { cycleId } = state;
  const webhookPort = process.env.FORGE_WEBHOOK_PORT || "3001";

  console.log(`[librarian-trigger] Triggering Librarian for cycle ${cycleId}`);

  try {
    // Fire-and-forget — don't await or block on failure
    fetch(`http://localhost:${webhookPort}/local-commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [],
        sha: cycleId,
      }),
    }).catch(() => {
      // Intentionally swallowed — Librarian is non-blocking
    });
  } catch {
    // Webhook server may not be running — that's fine
    console.log("[librarian-trigger] Webhook server not reachable (non-blocking)");
  }

  return { currentStage: "librarian_trigger" };
}
