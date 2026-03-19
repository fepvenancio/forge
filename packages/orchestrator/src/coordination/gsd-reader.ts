import matter from "gray-matter";
import * as git from "../utils/git.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PlanArtifact {
  phase: string;
  plan: number;
  filesModified: string[];
  requirements: string[];
  wave: number;
  dependsOn: string[];
  raw: string;
}

export interface SummaryArtifact {
  phase: string;
  plan: number;
  requirementsCompleted: string[];
  duration: string;
  completed: string;
}

export interface GsdConfig {
  mode: string;
  granularity: string;
  workflow: {
    research: boolean;
    plan_check: boolean;
    verifier: boolean;
    auto_advance: boolean;
  };
  git: {
    branching_strategy: string;
    phase_branch_template: string;
  };
}

export interface ConfigValidationResult {
  valid: boolean;
  config: GsdConfig | null;
  errors: string[];
}

// ─── Core Read Function ────────────────────────────────────────────────────

export async function readFileFromBranch(branch: string, filePath: string): Promise<string | null> {
  try {
    return await git.showFile(branch, filePath);
  } catch {
    return null;
  }
}

// ─── PLAN.md Parser (GSD-02) ──────────────────────────────────────────────

export async function parsePlanFromBranch(branch: string, planPath: string): Promise<PlanArtifact | null> {
  const content = await readFileFromBranch(branch, planPath);
  if (!content) return null;

  const { data } = matter(content);
  return {
    phase: data.phase ?? "",
    plan: data.plan ?? 0,
    filesModified: Array.isArray(data.files_modified) ? data.files_modified : [],
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    wave: data.wave ?? 0,
    dependsOn: Array.isArray(data.depends_on) ? data.depends_on : [],
    raw: content,
  };
}

// ─── SUMMARY.md Parser (GSD-03) ───────────────────────────────────────────

export async function parseSummaryFromBranch(branch: string, summaryPath: string): Promise<SummaryArtifact | null> {
  const content = await readFileFromBranch(branch, summaryPath);
  if (!content) return null;

  const { data } = matter(content);
  return {
    phase: data.phase ?? "",
    plan: data.plan ?? 0,
    requirementsCompleted: Array.isArray(data["requirements-completed"]) ? data["requirements-completed"] : [],
    duration: data.duration ?? "",
    completed: data.completed ?? "",
  };
}

// ─── config.json Parser (GSD-04) ──────────────────────────────────────────

export async function parseConfigFromBranch(branch: string): Promise<ConfigValidationResult> {
  const content = await readFileFromBranch(branch, ".planning/config.json");
  if (!content) {
    return { valid: false, config: null, errors: ["config.json not found on branch"] };
  }

  try {
    const parsed = JSON.parse(content);
    const errors: string[] = [];

    if (typeof parsed.mode !== "string") errors.push("missing or invalid 'mode' field");
    if (typeof parsed.granularity !== "string") errors.push("missing or invalid 'granularity' field");
    if (!parsed.workflow || typeof parsed.workflow !== "object") errors.push("missing or invalid 'workflow' object");
    if (!parsed.git || typeof parsed.git !== "object") errors.push("missing or invalid 'git' object");
    if (parsed.git && parsed.git.branching_strategy !== "phase") errors.push("git.branching_strategy must be 'phase'");

    if (errors.length > 0) {
      return { valid: false, config: null, errors };
    }

    return {
      valid: true,
      config: {
        mode: parsed.mode,
        granularity: parsed.granularity,
        workflow: {
          research: Boolean(parsed.workflow.research),
          plan_check: Boolean(parsed.workflow.plan_check),
          verifier: Boolean(parsed.workflow.verifier),
          auto_advance: Boolean(parsed.workflow.auto_advance),
        },
        git: {
          branching_strategy: parsed.git.branching_strategy,
          phase_branch_template: parsed.git.phase_branch_template ?? "",
        },
      },
      errors: [],
    };
  } catch (e) {
    return { valid: false, config: null, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ─── Plan File Discovery (GSD-01, GSD-02) ─────────────────────────────────

export async function discoverPlanFiles(branch: string): Promise<string[]> {
  const allFiles = await git.listTree(branch, ".planning/");
  return allFiles.filter(f => f.endsWith("-PLAN.md"));
}
