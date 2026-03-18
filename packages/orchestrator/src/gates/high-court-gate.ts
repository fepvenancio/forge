import { readFileSync } from "node:fs";
import { validate } from "./validator.js";

export interface HighCourtGateResult {
  decision: "merge" | "human_required" | "abort";
  mergeOrder: string[];
  errors: string[];
}

interface HighCourtReport {
  cycle_id: string;
  decision: "merge" | "human_required" | "abort";
  workers_reviewed: string[];
  merge_order?: string[];
  revision_instructions?: string;
  touch_map_violations?: string[];
  invariant_checks?: Array<{ invariant: string; result: string; detail?: string }>;
}

/**
 * High Court Gate — routes based on High Court decision.
 * No revision in v1 — "revise" is not a valid decision.
 */
export function runHighCourtGate(reportPath: string): HighCourtGateResult {
  const errors: string[] = [];

  let report: HighCourtReport;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    return {
      decision: "human_required",
      mergeOrder: [],
      errors: [`Could not read High Court report: ${err}`],
    };
  }

  // Validate against schema
  const validation = validate("high-court-report", report);
  if (!validation.valid) {
    return {
      decision: "human_required",
      mergeOrder: [],
      errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
    };
  }

  // Check for touch map violations
  if (report.touch_map_violations && report.touch_map_violations.length > 0) {
    errors.push(`Touch map violations: ${report.touch_map_violations.join(", ")}`);
  }

  // Check invariant failures
  if (report.invariant_checks) {
    const failures = report.invariant_checks.filter((c) => c.result === "fail");
    for (const f of failures) {
      errors.push(`Invariant failed: ${f.invariant} — ${f.detail || "no detail"}`);
    }
  }

  return {
    decision: report.decision,
    mergeOrder: report.merge_order || [],
    errors,
  };
}
