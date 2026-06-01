export const RESEARCH_STAGES = [
  "discovery",
  "frontier",
  "fetch",
  "extract",
  "analyze",
  "report",
] as const;

export type ResearchStageName = typeof RESEARCH_STAGES[number];
export type ResearchStageTerminal = "completed" | "failed" | "cancelled";

export interface ResearchStageJobPayload {
  runId: string;
  jobId: string;
  stage: ResearchStageName;
  attemptReason: "initial" | "retry" | "resume" | "manual";
}

export function nextStageFor(stage: ResearchStageName): ResearchStageName | "completed" {
  const index = RESEARCH_STAGES.indexOf(stage);
  return RESEARCH_STAGES[index + 1] ?? "completed";
}

export function runStatusForStage(stage: ResearchStageName) {
  if (stage === "fetch") return "fetching";
  if (stage === "extract") return "extracting";
  if (stage === "analyze") return "analyzing";
  if (stage === "report") return "reporting";
  return stage;
}
