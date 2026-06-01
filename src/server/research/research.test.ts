import assert from "assert";
import { normalizeRSSSourceUrl } from "../db";
import { normalizeResearchBudget, createRunBudgetState, canAcceptUrlForRun, recordAcceptedUrl } from "./budget";
import { normalizeDiscoveredCandidate } from "./discovery/registry";
import { buildEvidenceClaim, createSourceProfile } from "./evidence/graph";
import { routeExtractorForUrl } from "./extractors/router";
import { extractTablesFromHtml } from "./extractors/tableExtractor";
import { scoreFrontierItem } from "./frontier/scoring";
import { planResearch } from "./queryPlanner";
import { generateMarkdownReport } from "./reports";
import { normalizeBraveResults, normalizeSerpApiResults, normalizeTavilyResults } from "./searchProviders";
import { canonicalizeUrl } from "./url";
import { getResearchQueueNames } from "./workers/queues";

function testUrlCanonicalization() {
  assert.equal(
    canonicalizeUrl("https://Example.com/path/?utm_source=x&b=2&a=1#section"),
    "https://example.com/path?a=1&b=2",
  );
}

function testBudgetLimits() {
  const budget = normalizeResearchBudget({ maxDepth: 1, maxUrlsPerRun: 1, maxDomainsPerRun: 1 });
  const state = createRunBudgetState(budget);
  assert.equal(canAcceptUrlForRun(state, "https://example.com/a", 1), true);
  recordAcceptedUrl(state, "https://example.com/a");
  assert.equal(canAcceptUrlForRun(state, "https://example.com/b", 1), false);
  assert.equal(canAcceptUrlForRun(state, "https://other.com/a", 2), false);
}

function testProviderNormalization() {
  const input = { jobId: "job-1", query: "ai chips", depth: 0 };
  assert.equal(normalizeBraveResults({ web: { results: [{ url: "https://a.com/?utm_source=x", title: "A", description: "A desc" }] } }, input)[0].canonicalUrl, "https://a.com/");
  assert.equal(normalizeSerpApiResults({ organic_results: [{ link: "https://b.com", title: "B", snippet: "B desc" }] }, input)[0].provider, "serpapi");
  assert.equal(normalizeTavilyResults({ results: [{ url: "https://c.com", title: "C", content: "C desc" }] }, input)[0].provider, "tavily");
}

function testDiscoveryCandidateNormalization() {
  const candidate = normalizeDiscoveredCandidate({
    jobId: "job-1",
    runId: "run-1",
    provider: "github",
    providerType: "github",
    queryId: "q-1",
    query: "document converter github",
    url: "https://github.com/pandoc/pandoc?utm_source=x#readme",
    title: "Pandoc",
    snippet: "Universal markup converter",
    rank: 1,
  });

  assert.equal(candidate.canonicalUrl, "https://github.com/pandoc/pandoc");
  assert.equal(candidate.sourceType, "github");
  assert.equal(candidate.provider, "github");
  assert.equal(candidate.depth, 0);
}

function testFrontierPriorityScoring() {
  const official = scoreFrontierItem({
    url: "https://www.sec.gov/news/press-release/example",
    sourceType: "official",
    title: "Official SEC statement",
    snippet: "Official statement about the rule",
    topic: "SEC rule",
    depth: 0,
    discoveredDomainCount: 1,
  });

  const lowQuality = scoreFrontierItem({
    url: "https://example-blog.test/post",
    sourceType: "unknown",
    title: "Random repost",
    snippet: "Click here for more",
    topic: "SEC rule",
    depth: 2,
    discoveredDomainCount: 8,
  });

  assert.ok(official > lowQuality);
  assert.ok(official <= 1);
  assert.ok(lowQuality >= 0);
}

function testExtractorRoutingAndTableExtraction() {
  assert.equal(routeExtractorForUrl("https://example.com/report.pdf", "application/pdf"), "pdf");
  assert.equal(routeExtractorForUrl("https://github.com/pandoc/pandoc", "text/html"), "github");
  assert.equal(routeExtractorForUrl("https://www.npmjs.com/package/pandoc", "text/html"), "npm");
  assert.equal(routeExtractorForUrl("https://pypi.org/project/pypandoc/", "text/html"), "pypi");
  assert.equal(routeExtractorForUrl("https://example.com/sitemap.xml", "application/xml"), "sitemap");

  const tables = extractTablesFromHtml(`
    <table>
      <caption>工具对比</caption>
      <tr><th>工具</th><th>格式</th></tr>
      <tr><td>Pandoc</td><td>Markdown, DOCX, PDF</td></tr>
    </table>
  `);

  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["工具", "格式"]);
  assert.equal(tables[0].rows[0][0], "Pandoc");
}

function testCredibilityAndEvidenceGraph() {
  const officialProfile = createSourceProfile("https://www.sec.gov/news/press-release/example", "official");
  const communityProfile = createSourceProfile("https://random-blog.example/post", "community");

  assert.equal(officialProfile.authorityTier, "T0");
  assert.ok(officialProfile.officialLikelihood > communityProfile.officialLikelihood);

  const claim = buildEvidenceClaim({
    jobId: "job-1",
    runId: "run-1",
    claim: "SEC 发布了新规则。",
    supportingEvidenceIds: ["ev-1", "ev-2"],
    conflictingEvidenceIds: [],
  });

  assert.equal(claim.status, "supported");
  assert.ok(claim.confidence > 0.6);
}

function testPlannerClassifiesToolEvaluation() {
  const plan = planResearch("好用的文档转换工具，Markdown DOCX PDF PPT 表格互转，本地可跑，保真度好");
  const queryPurposes = new Set(plan.queries.map((query) => query.purpose));
  const requiredSourceTypes = new Set(plan.requiredSourceTypes);

  assert.equal(plan.taskType, "tool-evaluation");
  assert.equal(plan.freshness, "mixed");
  assert.ok(plan.subQuestions.some((question) => question.includes("候选工具")));
  assert.ok(requiredSourceTypes.has("official"));
  assert.ok(requiredSourceTypes.has("github"));
  assert.ok(requiredSourceTypes.has("package-registry"));
  assert.ok(requiredSourceTypes.has("community"));
  assert.ok(requiredSourceTypes.has("benchmark"));
  assert.ok(queryPurposes.has("official-source"));
  assert.ok(queryPurposes.has("technical-detail"));
  assert.ok(queryPurposes.has("benchmark"));
  assert.ok(queryPurposes.has("community-feedback"));
  assert.ok(plan.queries.length >= 8);
}

function testPlannerClassifiesVerification() {
  const plan = planResearch("查证某条关于 AI 芯片出口管制的新闻是否真实，并找到原始出处");
  const queryPurposes = new Set(plan.queries.map((query) => query.purpose));
  const requiredSourceTypes = new Set(plan.requiredSourceTypes);

  assert.equal(plan.taskType, "verification");
  assert.ok(plan.subQuestions.some((question) => question.includes("核心说法")));
  assert.ok(requiredSourceTypes.has("official"));
  assert.ok(requiredSourceTypes.has("mainstream-news"));
  assert.ok(queryPurposes.has("primary-source"));
  assert.ok(queryPurposes.has("news-coverage"));
  assert.ok(queryPurposes.has("contradiction"));
  assert.ok(queryPurposes.has("timeline"));
}

function testPlannerAddsSeedDomainQueries() {
  const plan = planResearch("OpenAI responses api", ["https://platform.openai.com/docs/overview"]);
  const seedQuery = plan.queries.find((query) => query.text.includes("site:platform.openai.com"));

  assert.ok(seedQuery);
  assert.equal(seedQuery.purpose, "official-source");
  assert.ok(seedQuery.sourceTypes.includes("official"));
}

function testReportGeneration() {
  const report = generateMarkdownReport({
    id: "job-1",
    topic: "AI chip export controls",
    seedUrls: [],
    status: "active",
    budget: normalizeResearchBudget(),
    queryPlan: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, [{
    jobId: "job-1",
    documentId: "doc-1",
    sourceUrl: "https://example.com/report",
    snippet: "The rule changed.",
    explanation: "Policy change",
    relevanceScore: 0.9,
    entities: ["BIS"],
  }]);

  assert.equal(report.status, "ready");
  assert.ok(report.markdown.includes("AI chip export controls"));
  assert.ok(report.markdown.includes("https://example.com/report"));

  const notReady = generateMarkdownReport({
    id: "job-empty",
    topic: "No evidence topic",
    seedUrls: [],
    status: "active",
    budget: normalizeResearchBudget(),
    queryPlan: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, []);

  assert.equal(notReady.status, "not_ready");
  assert.equal(notReady.markdown, "");
}

function testRSSSourceUrlValidation() {
  assert.equal(normalizeRSSSourceUrl(" https://example.com/feed.xml "), "https://example.com/feed.xml");
  assert.throws(() => normalizeRSSSourceUrl("ftp://example.com/feed.xml"), /invalid_rss_source_url/);
  assert.throws(() => normalizeRSSSourceUrl("not-a-url"), /invalid_rss_source_url/);
}

function testResearchQueueNames() {
  assert.deepEqual(getResearchQueueNames(), [
    "research.discovery",
    "research.frontier",
    "research.fetch",
    "research.extract",
    "research.analyze",
    "research.report",
  ]);
}

testUrlCanonicalization();
testBudgetLimits();
testProviderNormalization();
testDiscoveryCandidateNormalization();
testFrontierPriorityScoring();
testExtractorRoutingAndTableExtraction();
testCredibilityAndEvidenceGraph();
testPlannerClassifiesToolEvaluation();
testPlannerClassifiesVerification();
testPlannerAddsSeedDomainQueries();
testReportGeneration();
testRSSSourceUrlValidation();
testResearchQueueNames();

console.log("research tests passed");
