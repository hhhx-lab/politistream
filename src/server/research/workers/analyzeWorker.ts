import { analyzeDocumentsForRun } from "../run";
import { enqueueResearchStage } from "./queues";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processAnalyzeStage(payload: ResearchStageJobPayload) {
  const shouldContinue = await runStage(payload, async () => {
    await analyzeDocumentsForRun(payload.runId);
  });
  if (!shouldContinue) return;
  await enqueueResearchStage({ ...payload, stage: "report", attemptReason: "initial" });
}
