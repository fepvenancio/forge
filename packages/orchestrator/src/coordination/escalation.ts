import type { ConflictReport } from "./conflict-detector.js";
import type { PhaseAssignment, Developer } from "../dolt/schema.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EscalationPayload {
  text: string;
  conflicts: Array<{ file: string; phases: number[]; developers: string[] }>;
  suggestedAction: string;
}

// ─── Core Function ─────────────────────────────────────────────────────────

/**
 * Escalate file conflicts to an external webhook (Slack, Discord, Teams).
 * Returns true on success, false if no webhook configured or on failure.
 * Never throws.
 */
export async function escalateConflicts(
  report: ConflictReport,
  assignments: PhaseAssignment[],
  developers: Developer[],
): Promise<boolean> {
  const webhookUrl = process.env.FORGE_ESCALATION_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[escalation] No FORGE_ESCALATION_WEBHOOK_URL configured, skipping escalation");
    return false;
  }

  // Build lookup maps
  const devMap = new Map(developers.map(d => [d.id, d.display_name]));
  const assignMap = new Map(assignments.map(a => [a.phase_id, a]));

  // Format conflict lines
  const conflictLines: string[] = [];
  const conflictData: EscalationPayload["conflicts"] = [];

  for (const conflict of report.conflicts) {
    const phaseIds = conflict.phases.map(p => p.phaseId);
    const uniquePhaseIds = [...new Set(phaseIds)];

    const devNames: string[] = [];
    for (const pid of uniquePhaseIds) {
      const assignment = assignMap.get(pid);
      if (assignment) {
        const displayName = devMap.get(assignment.assignee) || assignment.assignee;
        devNames.push(displayName);
      }
    }

    conflictLines.push(
      `- \`${conflict.filePath}\` -- Phase ${uniquePhaseIds.join(", Phase ")} (${devNames.join(", ")})`
    );

    conflictData.push({
      file: conflict.filePath,
      phases: uniquePhaseIds,
      developers: devNames,
    });
  }

  const text = [
    "Forge Conflict Alert",
    "",
    `${report.conflicts.length} file conflict(s) detected across active phases:`,
    "",
    ...conflictLines,
    "",
    "Action: Coordinate merge order or resolve overlapping changes before merging.",
  ].join("\n");

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    console.log("[escalation] Conflict notification sent to webhook");
    return true;
  } catch (err) {
    console.error("[escalation] Failed to send webhook notification:", err instanceof Error ? err.message : err);
    return false;
  }
}
