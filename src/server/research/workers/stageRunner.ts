import { addRunEvent, updateResearchRunStatus } from "../store";
import { ResearchRunStatus } from "../types";
import {
  ResearchStageJobPayload,
  ResearchStageName,
  runStatusForStage,
} from "./stageTypes";

export type StageHandler = (payload: ResearchStageJobPayload) => Promise<void>;

export async function runStage(payload: ResearchStageJobPayload, handler: StageHandler) {
  const status = runStatusForStage(payload.stage) as ResearchRunStatus;
  await updateResearchRunStatus(payload.runId, status, status);
  await addRunEvent({
    jobId: payload.jobId,
    runId: payload.runId,
    stage: payload.stage,
    level: "info",
    message: stageEventMessage(payload.stage, "started"),
    data: { attemptReason: payload.attemptReason },
  });

  try {
    await handler(payload);
    await addRunEvent({
      jobId: payload.jobId,
      runId: payload.runId,
      stage: payload.stage,
      level: "info",
      message: stageEventMessage(payload.stage, "completed"),
    });
  } catch (error) {
    await updateResearchRunStatus(payload.runId, "failed", status);
    await addRunEvent({
      jobId: payload.jobId,
      runId: payload.runId,
      stage: payload.stage,
      level: "error",
      message: normalizeStageError(error),
    });
    throw error;
  }
}

export function stageEventMessage(stage: ResearchStageName, state: "started" | "completed") {
  return `${stage} ${state}`;
}

export function normalizeStageError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
