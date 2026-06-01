import { extractDocumentsForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processExtractStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    await extractDocumentsForRun(payload.runId);
  });
  await enqueueResearchStage({ ...payload, stage: "analyze", attemptReason: "initial" });
}
