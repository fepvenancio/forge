import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ForgeStateType } from "../state.js";

/**
 * Human Escalation Node
 * Writes escalation record to disk, sends webhook notification, halts the cycle.
 * The graph is configured with interruptBefore on this node so humans can
 * inspect state before the webhook fires.
 */
export async function humanEscalationNode(
  state: ForgeStateType,
): Promise<Partial<ForgeStateType>> {
  const { cycleId, humanEscalationReason, projectPath } = state;

  console.log(`[human-escalation] Cycle ${cycleId} requires human intervention`);
  console.log(`[human-escalation] Reason: ${humanEscalationReason || "Unknown"}`);

  // Write escalation record to disk
  const escalationDir = resolve(projectPath, ".forge", "escalations");
  mkdirSync(escalationDir, { recursive: true });
  const escalationPath = resolve(escalationDir, `${cycleId}.json`);
  writeFileSync(
    escalationPath,
    JSON.stringify(
      {
        cycleId,
        reason: humanEscalationReason,
        timestamp: Date.now(),
        errors: state.errors,
      },
      null,
      2,
    ),
  );

  // Send webhook notification if configured
  const webhookUrl = process.env.FORGE_ESCALATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Forge cycle \`${cycleId}\` requires human review.\nReason: ${humanEscalationReason || "Unknown"}\nRun \`forge resume ${cycleId}\` after resolving.`,
        }),
      });
      console.log("[human-escalation] Notification sent to webhook");
    } catch {
      console.log("[human-escalation] Failed to send webhook notification");
    }
  }

  return {
    currentStage: "halted",
  };
}
