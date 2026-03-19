import * as queries from "../dolt/queries.js";
import * as git from "../utils/git.js";
import { parsePlanFromBranch, discoverPlanFiles } from "./gsd-reader.js";
import type { PhaseAssignment, FileLock } from "../dolt/schema.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ConflictSource {
  phaseId: number;
  branch: string;
  source: "declared" | "actual";
}

export interface FileConflict {
  filePath: string;
  phases: ConflictSource[];
}

export interface LockWarning {
  filePath: string;
  lockedBy: string;
  phaseId: number;
  conflictingPhases: number[];
}

export interface ConflictReport {
  conflicts: FileConflict[];
  lockWarnings: LockWarning[];
  declaredOnlyFiles: Map<number, string[]>;
  actualOnlyFiles: Map<number, string[]>;
  timestamp: number;
}

export interface PhaseFileSet {
  phaseId: number;
  branch: string;
  declared: string[];
  actual: string[];
}

// ─── Core Functions ────────────────────────────────────────────────────────

export async function collectPhaseFiles(assignment: PhaseAssignment): Promise<PhaseFileSet> {
  const declared: string[] = [];
  const actual: string[] = [];

  // Read declared touch maps from PLAN.md files
  try {
    const planPaths = await discoverPlanFiles(assignment.branch_name);
    for (const planPath of planPaths) {
      const plan = await parsePlanFromBranch(assignment.branch_name, planPath);
      if (plan) {
        declared.push(...plan.filesModified);
      }
    }
  } catch {
    // Branch may not have .planning/ files yet
  }

  // Get actual git diff files
  try {
    const diffFiles = await git.diffNameOnly("main", assignment.branch_name);
    actual.push(...diffFiles);
  } catch {
    // Branch may not exist on remote or have no diff
  }

  return { phaseId: assignment.phase_id, branch: assignment.branch_name, declared, actual };
}

export function findConflicts(phaseSets: PhaseFileSet[], locks: FileLock[]): ConflictReport {
  const fileToSources = new Map<string, ConflictSource[]>();
  const declaredOnlyFiles = new Map<number, string[]>();
  const actualOnlyFiles = new Map<number, string[]>();

  for (const ps of phaseSets) {
    const allFiles = new Set<string>([...ps.declared, ...ps.actual]);
    const declaredSet = new Set(ps.declared);
    const actualSet = new Set(ps.actual);

    // Track declared-only and actual-only for staleness detection (CONFLICT-02)
    const dOnly = ps.declared.filter(f => !actualSet.has(f));
    const aOnly = ps.actual.filter(f => !declaredSet.has(f));
    if (dOnly.length > 0) declaredOnlyFiles.set(ps.phaseId, dOnly);
    if (aOnly.length > 0) actualOnlyFiles.set(ps.phaseId, aOnly);

    for (const file of allFiles) {
      const source: "declared" | "actual" = declaredSet.has(file) ? "declared" : "actual";
      const existing = fileToSources.get(file) || [];
      existing.push({ phaseId: ps.phaseId, branch: ps.branch, source });
      fileToSources.set(file, existing);
    }
  }

  // Find files touched by 2+ phases (CONFLICT-01)
  const conflicts: FileConflict[] = [];
  for (const [filePath, sources] of fileToSources) {
    if (sources.length > 1) {
      conflicts.push({ filePath, phases: sources });
    }
  }

  // Check for lock warnings (LOCK-04 advisory)
  const lockWarnings: LockWarning[] = [];
  for (const lock of locks) {
    const sources = fileToSources.get(lock.file_path);
    if (sources) {
      const conflictingPhases = sources
        .filter(s => s.phaseId !== lock.phase_id)
        .map(s => s.phaseId);
      if (conflictingPhases.length > 0) {
        lockWarnings.push({
          filePath: lock.file_path,
          lockedBy: lock.locked_by,
          phaseId: lock.phase_id,
          conflictingPhases,
        });
      }
    }
  }

  return {
    conflicts,
    lockWarnings,
    declaredOnlyFiles,
    actualOnlyFiles,
    timestamp: Date.now(),
  };
}

export async function checkConflicts(): Promise<ConflictReport> {
  // 1. Get all active phase assignments
  const assignments = await queries.getAllPhaseAssignments();
  const active = assignments.filter(a =>
    ["assigned", "in_progress", "pr_open"].includes(a.status)
  );

  // 2. Collect files for each active phase
  const phaseSets: PhaseFileSet[] = [];
  for (const assignment of active) {
    const fileSet = await collectPhaseFiles(assignment);
    phaseSets.push(fileSet);
  }

  // 3. Get all file locks
  const locks = await queries.getAllFileLocks();

  // 4. Find conflicts and lock warnings
  return findConflicts(phaseSets, locks);
}
