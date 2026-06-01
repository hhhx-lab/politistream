import { runDiscoveryForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processDiscoveryStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    await runDiscoveryForRun(payload.runId);
  });
  await enqueueResearchStage({ ...payload, stage: "frontier", attemptReason: "initial" });
}
