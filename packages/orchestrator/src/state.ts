import { Annotation } from "@langchain/langgraph";

export const ForgeState = Annotation.Root({
  // Cycle identity
  cycleId: Annotation<string>,
  projectPath: Annotation<string>,
  prpRef: Annotation<string>,

  // Planner outputs
  planArtifactId: Annotation<string | null>,
  plannerModel: Annotation<string>,
  plannerRetries: Annotation<number>,
  maxPlannerRetries: Annotation<number>,
  planAmbiguousQuestion: Annotation<string | null>,

  // Task tracking
  taskIds: Annotation<string[]>,
  completedTaskIds: Annotation<string[]>,
  failedTaskIds: Annotation<string[]>,
  blockedTaskIds: Annotation<string[]>,

  // Worker outputs (keyed by taskId)
  workerHandoffs: Annotation<Record<string, string>>,
  workerBranches: Annotation<Record<string, string>>,
  workerArtifactIds: Annotation<Record<string, string>>,
  workerPrUrls: Annotation<Record<string, string>>,

  // Sub-Judge outputs (keyed by taskId)
  subJudgeReports: Annotation<Record<string, string>>,
  subJudgeEscalations: Annotation<string[]>,
  dependencyDriftTaskIds: Annotation<string[]>,

  // Property gate
  propertyGateMode: Annotation<"required" | "optional" | "disabled">,
  propertyGateResults: Annotation<Record<string, string>>,

  // High Court
  highCourtArtifactId: Annotation<string | null>,
  highCourtDecision: Annotation<"merge" | "human_required" | "abort" | null>,
  mergeOrder: Annotation<string[]>,

  // Cost
  costArtifactId: Annotation<string | null>,
  totalCostUsd: Annotation<number>,
  costExceedsCap: Annotation<boolean>,

  // Control flow
  currentStage: Annotation<string>,
  humanEscalationReason: Annotation<string | null>,
  errors: Annotation<Array<{ stage: string; taskId?: string; message: string; ts: number }>>,
});

export type ForgeStateType = typeof ForgeState.State;
