import { addRunEvent, getResearchRun, updateResearchRunStatus } from "../store";
import { ResearchRun, ResearchRunStatus } from "../types";
import {
  ResearchStageJobPayload,
  ResearchStageName,
  runStatusForStage,
} from "./stageTypes";

export type StageHandler = (payload: ResearchStageJobPayload) => Promise<void>;

export async function runStage(payload: ResearchStageJobPayload, handler: StageHandler): Promise<boolean> {
  const run = await getResearchRun(payload.runId);
  if (!run) throw new Error("research_run_not_found");
  if (!shouldStartStage(run)) {
    await addRunEvent({
      jobId: payload.jobId,
      runId: payload.runId,
      stage: payload.stage,
      level: "warn",
      message: `跳过 ${payload.stage} 阶段，当前 run 状态为 ${run.status}。`,
      data: { currentStatus: run.status },
    });
    return false;
  }

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
    const latest = await getResearchRun(payload.runId);
    if (!latest) throw new Error("research_run_not_found");
    if (!shouldContinueAfterStage(latest)) {
      await addRunEvent({
        jobId: payload.jobId,
        runId: payload.runId,
        stage: payload.stage,
        level: "warn",
        message: `${payload.stage} 阶段已停止，当前 run 状态为 ${latest.status}。`,
        data: { currentStatus: latest.status },
      });
      return false;
    }

    await addRunEvent({
      jobId: payload.jobId,
      runId: payload.runId,
      stage: payload.stage,
      level: "info",
      message: stageEventMessage(payload.stage, "completed"),
    });
    return true;
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

export function shouldStartStage(run: Pick<ResearchRun, "status">) {
  return run.status !== "paused" && run.status !== "cancelled" && run.status !== "completed" && run.status !== "failed";
}

export function shouldContinueAfterStage(run: Pick<ResearchRun, "status">) {
  return shouldStartStage(run);
}

export function stageEventMessage(stage: ResearchStageName, state: "started" | "completed") {
  return `${stage} ${state}`;
}

export function normalizeStageError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
