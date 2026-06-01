import { Queue, type ConnectionOptions } from "bullmq";
import { getResearchConfig, requireResearchQueue } from "../config";
import { ResearchStageJobPayload, ResearchStageName } from "./stageTypes";

export const RESEARCH_QUEUE_NAMES = {
  discovery: "research.discovery",
  frontier: "research.frontier",
  fetch: "research.fetch",
  extract: "research.extract",
  analyze: "research.analyze",
  report: "research.report",
} as const;

type ResearchQueueName = typeof RESEARCH_QUEUE_NAMES[keyof typeof RESEARCH_QUEUE_NAMES];

let connection: ConnectionOptions | null = null;
const queues = new Map<ResearchQueueName, Queue>();

export function getResearchQueueNames(): string[] {
  return Object.values(RESEARCH_QUEUE_NAMES);
}

export function queueNameForStage(stage: ResearchStageName) {
  return RESEARCH_QUEUE_NAMES[stage];
}

export function getResearchQueueConnection() {
  if (!connection) {
    connection = redisUrlToConnectionOptions(requireResearchQueue(getResearchConfig()));
  }
  return connection;
}

function redisUrlToConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
  } as ConnectionOptions;
}

export function getResearchQueue(name: ResearchQueueName) {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getResearchQueueConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 250,
    },
  });
  queues.set(name, queue);
  return queue;
}

export async function enqueueResearchRun(runId: string, jobId: string) {
  return enqueueResearchStage({
    runId,
    jobId,
    stage: "discovery",
    attemptReason: "initial",
  });
}

export async function enqueueResearchStage(payload: ResearchStageJobPayload) {
  const queue = getResearchQueue(queueNameForStage(payload.stage));
  return queue.add(payload.stage, payload, {
    jobId: `${payload.runId}:${payload.stage}`,
  });
}

export async function getQueueStatus() {
  const queue = getResearchQueue(RESEARCH_QUEUE_NAMES.discovery);
  const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  return {
    names: getResearchQueueNames(),
    discovery: counts,
  };
}
