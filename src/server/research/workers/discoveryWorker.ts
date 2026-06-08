import { runDiscoveryForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processDiscoveryStage(payload: ResearchStageJobPayload) {
  const shouldContinue = await runStage(payload, async () => {
    await runDiscoveryForRun(payload.runId);
  });
  if (!shouldContinue) return;
  await enqueueResearchStage({ ...payload, stage: "frontier", attemptReason: "initial" });
}
