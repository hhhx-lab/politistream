import { extractDocumentsForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processExtractStage(payload: ResearchStageJobPayload) {
  const shouldContinue = await runStage(payload, async () => {
    await extractDocumentsForRun(payload.runId);
  });
  if (!shouldContinue) return;
  await enqueueResearchStage({ ...payload, stage: "analyze", attemptReason: "initial" });
}
