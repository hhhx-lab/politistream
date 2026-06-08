import { fetchFrontierForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processFetchStage(payload: ResearchStageJobPayload) {
  const shouldContinue = await runStage(payload, async () => {
    await fetchFrontierForRun(payload.runId);
  });
  if (!shouldContinue) return;
  await enqueueResearchStage({ ...payload, stage: "extract", attemptReason: "initial" });
}
