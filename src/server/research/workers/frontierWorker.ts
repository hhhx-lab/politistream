import { buildFrontierForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processFrontierStage(payload: ResearchStageJobPayload) {
  const shouldContinue = await runStage(payload, async () => {
    await buildFrontierForRun(payload.runId);
  });
  if (!shouldContinue) return;
  await enqueueResearchStage({ ...payload, stage: "fetch", attemptReason: "initial" });
}
