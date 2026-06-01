import { generateReportForRun } from "../run";
import { runStage } from "./stageRunner";
import { ResearchStageJobPayload } from "./stageTypes";

export async function processReportStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    await generateReportForRun(payload.runId);
  });
}
