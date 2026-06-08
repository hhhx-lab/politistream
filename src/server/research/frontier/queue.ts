import { randomUUID } from "crypto";
import { DiscoveredCandidate, FrontierItem } from "../types";
import { scoreFrontierItemBreakdown } from "./scoring";

export function candidateToFrontierItem(
  candidate: DiscoveredCandidate,
  topic: string,
  discoveredDomainCount = 1,
): FrontierItem {
  const scoreBreakdown = scoreFrontierItemBreakdown({
    url: candidate.url,
    sourceType: candidate.sourceType,
    title: candidate.title,
    snippet: candidate.snippet,
    topic,
    depth: candidate.depth,
    discoveredDomainCount,
  });

  return {
    id: randomUUID(),
    jobId: candidate.jobId,
    runId: candidate.runId,
    url: candidate.url,
    canonicalUrl: candidate.canonicalUrl,
    depth: candidate.depth,
    sourceType: candidate.sourceType,
    priorityScore: scoreBreakdown.finalScore,
    scoreBreakdown,
    status: "queued",
    attempts: 0,
    queryId: candidate.queryId,
    reason: `${candidate.provider}:${candidate.query}`,
  };
}

export function sortFrontier(items: FrontierItem[]) {
  return [...items].sort((left, right) => right.priorityScore - left.priorityScore);
}
