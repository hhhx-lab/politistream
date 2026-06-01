import assert from "assert";
import { assetPathFor } from "./assets/rawAssetStore";
import { aggregateProviderHealth, sortProvidersForQuery } from "./discovery/providerRegistry";
import { normalizeProviderCapability } from "./discovery/providerTypes";
import { buildEvidenceRelation, summarizeEvidenceGraph } from "./evidence/graph";
import { RESEARCH_BENCHMARK_FIXTURES } from "./evaluation/fixtures";
import { createDomainLimiter, robotsAllowsPath, shouldRetryFetch } from "./fetchers/fetchPolicy";
import { chooseFetcherKind } from "./fetchers/httpFetcher";
import { shouldReuseDocument, topicFingerprint } from "./memory/researchMemory";
import { normalizeDocumentSearchQuery } from "./search/documentIndex";
import { RESEARCH_STAGES, nextStageFor } from "./workers/stageTypes";
import { normalizeStageError, stageEventMessage } from "./workers/stageRunner";
import { getResearchQueueNames, queueNameForStage } from "./workers/queues";

function testStageOrder() {
  assert.deepEqual(RESEARCH_STAGES, [
    "discovery",
    "frontier",
    "fetch",
    "extract",
    "analyze",
    "report",
  ]);
  assert.equal(nextStageFor("discovery"), "frontier");
  assert.equal(nextStageFor("report"), "completed");
}

function testStageRunnerHelpers() {
  assert.equal(normalizeStageError(new Error("network timeout")), "network timeout");
  assert.equal(normalizeStageError("plain failure"), "plain failure");
  assert.equal(stageEventMessage("fetch", "started"), "fetch started");
  assert.equal(stageEventMessage("fetch", "completed"), "fetch completed");
}

function testQueueNameForStage() {
  assert.equal(queueNameForStage("discovery"), "research.discovery");
  assert.equal(queueNameForStage("frontier"), "research.frontier");
  assert.equal(queueNameForStage("fetch"), "research.fetch");
  assert.equal(queueNameForStage("extract"), "research.extract");
  assert.equal(queueNameForStage("analyze"), "research.analyze");
  assert.equal(queueNameForStage("report"), "research.report");
  assert.deepEqual(getResearchQueueNames(), [
    "research.discovery",
    "research.frontier",
    "research.fetch",
    "research.extract",
    "research.analyze",
    "research.report",
  ]);
}

function testFetchPolicy() {
  const limiter = createDomainLimiter({ minDelayMs: 1000 });
  const first = limiter.nextAllowedAt("example.com", new Date("2026-06-01T00:00:00Z"));
  const second = limiter.nextAllowedAt("example.com", new Date("2026-06-01T00:00:00Z"));
  assert.equal(first.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(second.toISOString(), "2026-06-01T00:00:01.000Z");
  assert.equal(shouldRetryFetch({ status: 429, attempts: 1, maxAttempts: 3 }), true);
  assert.equal(shouldRetryFetch({ status: 404, attempts: 1, maxAttempts: 3 }), false);
  assert.equal(robotsAllowsPath("User-agent: *\nDisallow: /private\nAllow: /private/help", "/private/page"), false);
  assert.equal(robotsAllowsPath("User-agent: *\nDisallow: /private\nAllow: /private/help", "/private/help"), true);
}

function testFetcherKind() {
  assert.equal(chooseFetcherKind({ contentType: "text/html", url: "https://example.com" }), "http");
  assert.equal(chooseFetcherKind({ contentType: "", url: "https://example.com/app?spa=true" }), "browser");
  assert.equal(chooseFetcherKind({ contentType: "application/pdf", url: "https://example.com/a.pdf" }), "http");
}

function testAssetPathFor() {
  const path = assetPathFor({
    rootDir: ".data/research-assets",
    runId: "run-1",
    documentId: "doc-1",
    extension: "html",
  });
  assert.equal(path, ".data/research-assets/run-1/doc-1.html");
}

function testDocumentSearchQueryNormalization() {
  assert.equal(normalizeDocumentSearchQuery("  PDF 转 DOCX   工具 "), "PDF & 转 & DOCX & 工具");
}

function testProviderCapability() {
  const capability = normalizeProviderCapability({
    name: "github",
    sourceTypes: ["github"],
    costUnit: 0.2,
    reliability: 0.9,
  });
  assert.equal(capability.name, "github");
  assert.equal(capability.costUnit, 0.2);
  assert.equal(capability.reliability, 0.9);

  const sorted = sortProvidersForQuery([
    capability,
    normalizeProviderCapability({ name: "rss", sourceTypes: ["rss"], costUnit: 0.1, reliability: 0.7 }),
  ], ["github"]);
  assert.equal(sorted[0].name, "github");
}

function testProviderHealthAggregation() {
  const health = aggregateProviderHealth([
    { provider: "brave", candidateCount: 10, error: undefined, durationMs: 1000 },
    { provider: "brave", candidateCount: 0, error: "429", durationMs: 2000 },
  ]);
  assert.equal(health[0].provider, "brave");
  assert.equal(health[0].calls, 2);
  assert.equal(health[0].errors, 1);
  assert.equal(health[0].candidateCount, 10);
  assert.equal(health[0].averageDurationMs, 1500);
}

function testEvidenceRelation() {
  const relation = buildEvidenceRelation({
    claimId: "claim-1",
    evidenceId: "ev-1",
    relation: "supports",
    confidence: 0.8,
  });
  assert.equal(relation.relation, "supports");
  assert.equal(relation.confidence, 0.8);
}

function testEvidenceGraphSummary() {
  const summary = summarizeEvidenceGraph({
    claims: [{ status: "supported" }, { status: "contradicted" }],
    relations: [{ relation: "supports" }, { relation: "contradicts" }],
  });
  assert.equal(summary.supportedClaims, 1);
  assert.equal(summary.contradictedClaims, 1);
  assert.equal(summary.supportingRelations, 1);
  assert.equal(summary.conflictingRelations, 1);
}

function testTopicFingerprint() {
  assert.equal(topicFingerprint("  好用的 文档转换工具 "), "好用的 文档转换工具");
  assert.equal(topicFingerprint("OpenAI Responses API"), "openai responses api");
}

function testShouldReuseDocument() {
  assert.equal(shouldReuseDocument({
    fetchedAt: "2026-06-01T00:00:00.000Z",
    now: "2026-06-01T12:00:00.000Z",
    maxAgeHours: 24,
    contentHashMatches: true,
  }), true);
  assert.equal(shouldReuseDocument({
    fetchedAt: "2026-05-20T00:00:00.000Z",
    now: "2026-06-01T12:00:00.000Z",
    maxAgeHours: 24,
    contentHashMatches: true,
  }), false);
}

function testBenchmarkFixtures() {
  assert.ok(RESEARCH_BENCHMARK_FIXTURES.find((fixture) => fixture.id === "document-converter-tools"));
  assert.ok(RESEARCH_BENCHMARK_FIXTURES.find((fixture) => fixture.id === "news-origin-verification"));
}

testStageOrder();
testStageRunnerHelpers();
testQueueNameForStage();
testFetchPolicy();
testFetcherKind();
testAssetPathFor();
testDocumentSearchQueryNormalization();
testProviderCapability();
testProviderHealthAggregation();
testEvidenceRelation();
testEvidenceGraphSummary();
testTopicFingerprint();
testShouldReuseDocument();
testBenchmarkFixtures();

console.log("platform tests passed");
