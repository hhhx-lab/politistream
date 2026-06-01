import { analyzeDocumentsForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processAnalyzeStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    await analyzeDocumentsForRun(payload.runId);
  });
  await enqueueResearchStage({ ...payload, stage: "report", attemptReason: "initial" });
}
