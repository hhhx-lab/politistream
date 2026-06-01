import { buildFrontierForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processFrontierStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    await buildFrontierForRun(payload.runId);
  });
  await enqueueResearchStage({ ...payload, stage: "fetch", attemptReason: "initial" });
}
