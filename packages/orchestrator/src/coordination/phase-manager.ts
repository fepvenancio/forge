import * as queries from "../dolt/queries.js";
import * as git from "../utils/git.js";
import type { PhaseAssignment } from "../dolt/schema.js";

export const BRANCH_PATTERN = /^gsd\/phase-\d+-[a-z0-9-]+$/;

export function validateBranchName(name: string): boolean {
  return BRANCH_PATTERN.test(name);
}

export function generateBranchName(phaseId: number, phaseName: string): string {
  const slug = phaseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special chars except spaces and hyphens
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
  return `gsd/phase-${phaseId}-${slug}`;
}

export async function claimPhaseWithBranch(params: {
  phaseId: number;
  assignee: string;
  phaseName: string;
  branchName?: string;
}): Promise<PhaseAssignment> {
  const branchName =
    params.branchName || generateBranchName(params.phaseId, params.phaseName);

  if (!validateBranchName(branchName)) {
    throw new Error(
      `Invalid branch name "${branchName}". Must match pattern: gsd/phase-{N}-{slug} (lowercase alphanumeric and hyphens only)`,
    );
  }

  // Create git branch (check if exists first)
  const branches = await git.listLocalBranches();
  if (branches.includes(branchName)) {
    // Branch exists -- reuse it
    console.log(`Branch ${branchName} already exists, reusing.`);
  } else {
    await git.createBranch(branchName);
  }

  // Record in Dolt (includes 1:1:1 enforcement via transaction)
  const assignment = await queries.claimPhase({
    phase_id: params.phaseId,
    assignee: params.assignee,
    branch_name: branchName,
  });

  return assignment;
}

export async function assignPhaseTodev(params: {
  phaseId: number;
  developerId: string;
  phaseName: string;
}): Promise<PhaseAssignment> {
  // Verify developer exists
  const dev = await queries.getDeveloper(params.developerId);
  if (!dev) {
    throw new Error(
      `Developer "${params.developerId}" not registered. Run \`forge register --name ${params.developerId}\` first.`,
    );
  }

  return claimPhaseWithBranch({
    phaseId: params.phaseId,
    assignee: params.developerId,
    phaseName: params.phaseName,
  });
}

export async function releasePhaseAssignment(phaseId: number): Promise<void> {
  await queries.releasePhase(phaseId);
}
