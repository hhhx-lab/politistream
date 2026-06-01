import { Worker } from "bullmq";
import { getResearchConfig, getResearchConfigStatus } from "../config";
import { processAnalyzeStage } from "./analyzeWorker";
import { processDiscoveryStage } from "./discoveryWorker";
import { processExtractStage } from "./extractWorker";
import { processFetchStage } from "./fetchWorker";
import { processFrontierStage } from "./frontierWorker";
import { getResearchQueueConnection, queueNameForStage } from "./queues";
import { processReportStage } from "./reportWorker";
import { ResearchStageJobPayload } from "./stageTypes";

const workers: Worker[] = [];

const handlers = {
  discovery: processDiscoveryStage,
  frontier: processFrontierStage,
  fetch: processFetchStage,
  extract: processExtractStage,
  analyze: processAnalyzeStage,
  report: processReportStage,
};

export function startResearchWorkers() {
  const status = getResearchConfigStatus(getResearchConfig());
  if (!status.readyForQueue || workers.length > 0) {
    return workers;
  }

  for (const [stage, handler] of Object.entries(handlers)) {
    const worker = new Worker(
      queueNameForStage(stage as keyof typeof handlers),
      async (job) => {
        await handler(job.data as ResearchStageJobPayload);
      },
      {
        connection: getResearchQueueConnection(),
        concurrency: Number(process.env.RESEARCH_WORKER_CONCURRENCY || 2),
      },
    );

    worker.on("failed", (job, error) => {
      console.error("Research worker failed", stage, job?.id, error);
    });

    workers.push(worker);
  }

  return workers;
}
