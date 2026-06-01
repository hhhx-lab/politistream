import { fetchFrontierForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processFetchStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    await fetchFrontierForRun(payload.runId);
  });
  await enqueueResearchStage({ ...payload, stage: "extract", attemptReason: "initial" });
}
