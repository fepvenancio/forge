import * as queries from "../dolt/queries.js";
import { collectPhaseFiles } from "./conflict-detector.js";
import { discoverPlanFiles, parsePlanFromBranch } from "./gsd-reader.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PhaseNode {
  phaseId: number;
  dependsOn: number[];
  branch: string;
  prNumber: number | null;
  touchedFiles: string[];
}

export interface MergeOrder {
  order: number[];
  cycles: number[][];
  reasoning: string[];
}

// ─── Core Algorithm ────────────────────────────────────────────────────────

/**
 * Compute optimal merge order using Kahn's algorithm (topological sort)
 * with inferred edges from touch map overlaps and cycle detection.
 */
export function computeMergeOrder(phases: PhaseNode[]): MergeOrder {
  if (phases.length === 0) {
    return { order: [], cycles: [], reasoning: [] };
  }

  const reasoning: string[] = [];
  const phaseIds = new Set(phases.map(p => p.phaseId));

  // Build adjacency list and in-degree map from declared dependsOn
  const adj = new Map<number, number[]>();
  const inDegree = new Map<number, number>();

  for (const p of phases) {
    adj.set(p.phaseId, []);
    inDegree.set(p.phaseId, 0);
  }

  for (const p of phases) {
    for (const dep of p.dependsOn) {
      // Only add edge if the dependency is in our set
      if (phaseIds.has(dep)) {
        adj.get(dep)!.push(p.phaseId);
        inDegree.set(p.phaseId, (inDegree.get(p.phaseId) || 0) + 1);
      }
    }
  }

  // Add inferred edges from touch map overlaps
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const a = phases[i];
      const b = phases[j];

      // Find shared files
      const aFiles = new Set(a.touchedFiles);
      const shared = b.touchedFiles.filter(f => aFiles.has(f));

      if (shared.length > 0) {
        // Check if there's already a declared dependency in either direction
        const aDepB = a.dependsOn.includes(b.phaseId);
        const bDepA = b.dependsOn.includes(a.phaseId);

        if (!aDepB && !bDepA) {
          // Add inferred edge: lower phaseId merges first
          const [lower, higher] = a.phaseId < b.phaseId ? [a, b] : [b, a];
          adj.get(lower.phaseId)!.push(higher.phaseId);
          inDegree.set(higher.phaseId, (inDegree.get(higher.phaseId) || 0) + 1);
          reasoning.push(
            `Phase ${lower.phaseId} before Phase ${higher.phaseId} (shared files: ${shared.join(", ")})`
          );
        }
      }
    }
  }

  // Kahn's algorithm
  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  // Sort for deterministic output
  queue.sort((a, b) => a - b);

  const order: number[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = adj.get(current) || [];
    for (const neighbor of neighbors) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        // Insert in sorted position for deterministic output
        const insertIdx = queue.findIndex(q => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  // Remaining nodes (not in order) are in cycles
  const cycleMembers = phases
    .map(p => p.phaseId)
    .filter(id => !order.includes(id));

  const cyclesArr: number[][] = [];
  if (cycleMembers.length > 0) {
    // Group cycle members (simple: all remaining nodes form one cycle group)
    cyclesArr.push(cycleMembers.sort((a, b) => a - b));
  }

  return { order, cycles: cyclesArr, reasoning };
}

// ─── Convenience Function ──────────────────────────────────────────────────

/**
 * Query Dolt for all phases with open PRs, collect their files,
 * and compute the optimal merge order.
 */
export async function getMergeOrderForOpenPRs(): Promise<MergeOrder> {
  const assignments = await queries.getAllPhaseAssignments();
  const openPRs = assignments.filter(a => a.status === "pr_open");

  if (openPRs.length === 0) {
    return { order: [], cycles: [], reasoning: [] };
  }

  const phases: PhaseNode[] = [];

  for (const assignment of openPRs) {
    // Collect touched files
    const fileSet = await collectPhaseFiles(assignment);
    const touchedFiles = [...new Set([...fileSet.declared, ...fileSet.actual])];

    // Read dependsOn from plan files
    const dependsOn: number[] = [];
    try {
      const planPaths = await discoverPlanFiles(assignment.branch_name);
      for (const planPath of planPaths) {
        const plan = await parsePlanFromBranch(assignment.branch_name, planPath);
        if (plan) {
          for (const dep of plan.dependsOn) {
            // dependsOn entries like "02-00" -> extract phase number
            const phaseNum = parseInt(dep.split("-")[0], 10);
            if (!isNaN(phaseNum) && !dependsOn.includes(phaseNum)) {
              dependsOn.push(phaseNum);
            }
          }
        }
      }
    } catch {
      // Branch may not have plan files
    }

    phases.push({
      phaseId: assignment.phase_id,
      dependsOn,
      branch: assignment.branch_name,
      prNumber: assignment.pr_number,
      touchedFiles,
    });
  }

  return computeMergeOrder(phases);
}
