import assert from "assert";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { normalizeRSSSourceUrl } from "../db";
import { getResearchConfigStatus, resolveAiModel, resolveAiProvider } from "./config";
import { normalizeResearchBudget, createRunBudgetState, canAcceptUrlForRun, recordAcceptedUrl } from "./budget";
import { createCommonCrawlDiscoveryProvider, createDefaultDiscoveryProviders, createGdeltDiscoveryProvider, createRSSDiscoveryProvider, normalizeDiscoveredCandidate } from "./discovery/registry";
import { runEnhancedFetchSmoke } from "./evaluation/enhancedFetchSmoke";
import { buildEvidenceClaim, createSourceProfile } from "./evidence/graph";
import { routeExtractorForUrl } from "./extractors/router";
import { extractTablesFromHtml } from "./extractors/tableExtractor";
import { FRONTIER_SCORE_WEIGHTS, scoreFrontierItem, scoreFrontierItemBreakdown } from "./frontier/scoring";
import { planResearch } from "./queryPlanner";
import { getResearchCapabilityAudit } from "./evaluation/capabilityAudit";
import { runResearchSampleAcceptance } from "./evaluation/sampleAcceptance";
import { getLatestSmokeEvidence, persistSmokeEvidence, runDataSourceLiveSmoke, runPressureSmoke, runProviderLiveSmoke } from "./evaluation/smoke";
import { generateMarkdownReport } from "./reports";
import { normalizeBraveResults, normalizeNewsApiResults, normalizeSerpApiResults, normalizeTavilyResults } from "./searchProviders";
import type { SourceType } from "./types";
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

function testBudgetNormalizerAcceptsUiStyleFields() {
  const budget = normalizeResearchBudget({
    mode: "quick",
    maxUrls: 5,
    maxDomains: 3,
  });

  assert.equal(budget.maxDepth, 1);
  assert.equal(budget.maxUrlsPerRun, 5);
  assert.equal(budget.maxDomainsPerRun, 3);
  assert.equal(budget.runIntervalMinutes, 60);
}

function testProviderNormalization() {
  const input = { jobId: "job-1", query: "ai chips", depth: 0 };
  assert.equal(normalizeBraveResults({ web: { results: [{ url: "https://a.com/?utm_source=x", title: "A", description: "A desc" }] } }, input)[0].canonicalUrl, "https://a.com/");
  assert.equal(normalizeSerpApiResults({ organic_results: [{ link: "https://b.com", title: "B", snippet: "B desc" }] }, input)[0].provider, "serpapi");
  assert.equal(normalizeNewsApiResults({ articles: [{ url: "https://news.example.com/article", title: "News", description: "News desc" }] }, input)[0].provider, "newsapi");
  assert.equal(normalizeTavilyResults({ results: [{ url: "https://c.com", title: "C", content: "C desc" }] }, input)[0].provider, "tavily");
  assert.equal(
    normalizeSerpApiResults({ organic_results: [{ link: "https://relative-date.example.com", title: "Relative", snippet: "Relative date", date: "6 days ago" }] }, input)[0].publishedAt,
    undefined,
    "relative provider dates must not be passed to Postgres timestamptz",
  );
  assert.equal(
    normalizeSerpApiResults({ organic_results: [{ link: "https://iso-date.example.com", title: "ISO", snippet: "ISO date", date: "2026-06-01T12:00:00Z" }] }, input)[0].publishedAt,
    "2026-06-01T12:00:00.000Z",
    "valid provider dates should be normalized to ISO timestamps",
  );
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

async function testDiscoveryProvidersRespectTopicIntent() {
  const input = {
    jobId: "job-1",
    runId: "run-1",
    topic: "好用的文档转换工具",
    query: {
      id: "q-1",
      text: "好用的文档转换工具",
      purpose: "technical-detail" as const,
      sourceTypes: ["official", "github", "package-registry", "benchmark", "community"] as SourceType[],
      language: "zh",
      priority: 1,
    },
    seedUrls: ["https://pandoc.org/", "https://github.com/jgm/pandoc"],
  };

  assert.deepEqual(await createRSSDiscoveryProvider().discover(input), []);
  assert.deepEqual(await createGdeltDiscoveryProvider().discover(input), []);
  assert.deepEqual(await createCommonCrawlDiscoveryProvider().discover(input), []);
}

function testAiProviderRouting() {
  const gptRelayConfig = {
    databaseUrl: "postgres://localhost/politistream",
    redisUrl: "redis://localhost:6379",
    aiBaseUrl: "https://relay.example.com/v1",
    aiApiKey: "sk-relay-test-123",
    aiModel: "gpt-5.4",
    newsApiKey: "news-api-test-123",
    browserProvider: "local" as const,
  };
  const missingKeyConfig = {
    databaseUrl: "postgres://localhost/politistream",
    redisUrl: "redis://localhost:6379",
    aiBaseUrl: "https://relay.example.com/v1",
    aiApiKey: "",
    aiModel: "gpt-5.4",
    newsApiKey: "",
    browserProvider: "local" as const,
  };

  assert.equal(resolveAiProvider(gptRelayConfig), "gpt-compatible");
  assert.equal(resolveAiModel(gptRelayConfig), "gpt-5.4");
  assert.equal(resolveAiProvider(missingKeyConfig), null);
  assert.equal(resolveAiModel(missingKeyConfig), "gpt-5.4");

  const status = getResearchConfigStatus(gptRelayConfig);
  assert.equal(status.ai.provider, "gpt-compatible");
  assert.equal(status.ai.baseUrl, "https://relay.example.com/v1");
  assert.equal(status.ai.model, "gpt-5.4");
  assert.equal(status.ai.configured, true);
  assert.equal(status.ai.keyConfigured, true);
  assert.equal(status.searchProviders.newsApi, true);
}

function testKaggleApiTokenEnablesDataProvider() {
  const status = getResearchConfigStatus({
    aiModel: "gpt-5.4",
    browserProvider: "local" as const,
    kaggleApiToken: "KGAT_test_token_123456789",
  });
  const audit = getResearchCapabilityAudit({
    KAGGLE_API_TOKEN: "KGAT_test_token_123456789",
  });

  assert.equal(status.dataProviders.kaggle, true, "KAGGLE_API_TOKEN alone should enable Kaggle provider readiness");
  assert.ok(audit.dataProviders.some((provider) => provider.name === "kaggle" && provider.configured), "audit should mark Kaggle configured from KAGGLE_API_TOKEN");
  assert.ok(audit.envChecklist.some((item) => item.name === "KAGGLE_API_TOKEN" && item.configured && item.group === "data"), "audit should expose new Kaggle API token env");
}

function testFrontierPriorityScoring() {
  const officialInput = {
    url: "https://www.sec.gov/news/press-release/example",
    sourceType: "official",
    title: "Official SEC statement",
    snippet: "Official statement about the rule",
    topic: "SEC rule",
    depth: 0,
    discoveredDomainCount: 1,
  } as const;
  const official = scoreFrontierItem(officialInput);
  const officialBreakdown = scoreFrontierItemBreakdown(officialInput);

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
  assert.equal(officialBreakdown.finalScore, official);
  assert.deepEqual(officialBreakdown.weights, FRONTIER_SCORE_WEIGHTS);
  for (const value of [
    officialBreakdown.topicalRelevance,
    officialBreakdown.sourceAuthority,
    officialBreakdown.primarySourceLikelihood,
    officialBreakdown.freshness,
    officialBreakdown.sourceDiversity,
    officialBreakdown.linkContextQuality,
  ]) {
    assert.ok(value >= 0 && value <= 1, "frontier score components must stay normalized");
  }

  const topic = "文档转换工具 Pandoc Markdown DOCX PDF";
  const officialSeed = scoreFrontierItem({
    url: "https://pandoc.org/",
    provider: "official",
    sourceType: "official",
    title: "Pandoc",
    snippet: "Official Pandoc website for document conversion",
    query: "文档转换工具",
    topic,
    depth: 0,
    discoveredDomainCount: 1,
  });
  const github = scoreFrontierItem({
    url: "https://github.com/jgm/pandoc",
    provider: "github",
    sourceType: "github",
    title: "Pandoc",
    snippet: "Universal document converter",
    query: "文档转换工具",
    topic,
    depth: 0,
    discoveredDomainCount: 1,
  });
  const packageRegistry = scoreFrontierItem({
    url: "https://pypi.org/project/pypandoc/",
    provider: "pypi",
    sourceType: "package-registry",
    title: "pypandoc",
    snippet: "Python wrapper for pandoc",
    query: "文档转换工具",
    topic,
    depth: 0,
    discoveredDomainCount: 1,
  });
  const rss = scoreFrontierItem({
    url: "https://example.com/feed.xml",
    provider: "rss",
    sourceType: "rss",
    title: "Tech News",
    snippet: "Latest headlines",
    query: "文档转换工具",
    topic,
    depth: 1,
    discoveredDomainCount: 4,
  });
  const archive = scoreFrontierItem({
    url: "https://web.archive.org/cdx?url=pandoc.org*&output=json",
    provider: "wayback",
    sourceType: "archive",
    title: "Wayback snapshots",
    snippet: "Historical archive",
    query: "文档转换工具",
    topic,
    depth: 2,
    discoveredDomainCount: 6,
  });

  assert.ok(officialSeed > github, "official seed sources should stay above GitHub");
  assert.ok(github > packageRegistry, "GitHub should stay ahead of package registries for document tools");
  assert.ok(packageRegistry > rss, "package registry should outrank unrelated RSS feeds");
  assert.ok(packageRegistry > archive, "package registry should outrank unrelated archive doorway results");
}

function testExtractorRoutingAndTableExtraction() {
  assert.equal(routeExtractorForUrl("https://example.com/report.pdf", "application/pdf"), "pdf");
  assert.equal(routeExtractorForUrl("https://github.com/pandoc/pandoc", "text/html"), "github");
  assert.equal(routeExtractorForUrl("https://www.npmjs.com/package/pandoc", "text/html"), "npm");
  assert.equal(routeExtractorForUrl("https://pypi.org/project/pypandoc/", "text/html"), "pypi");
  assert.equal(routeExtractorForUrl("https://example.com/sitemap.xml", "application/xml"), "sitemap");
  assert.equal(routeExtractorForUrl("https://example.com/data.csv", "text/csv"), "csv");
  assert.equal(routeExtractorForUrl("https://example.com/data.parquet", ""), "parquet");
  assert.equal(routeExtractorForUrl("https://example.com/map.geojson", "application/geo+json"), "geojson");

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

function testDefaultDiscoveryProvidersIncludeDataSources() {
  const names = new Set(createDefaultDiscoveryProviders({
    aiModel: "gpt-5.4",
    browserProvider: "local",
  }).map((provider) => provider.name));
  assert.ok(names.has("gdelt"));
  assert.ok(names.has("wayback"));
  assert.ok(names.has("commoncrawl"));
  assert.ok(names.has("ckan"));
  assert.ok(names.has("socrata"));
  assert.ok(names.has("kaggle"));
  assert.ok(names.has("huggingface"));
  assert.ok(names.has("worldbank"));
  assert.ok(names.has("openalex"));
  assert.ok(names.has("sports"));
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

function testPlannerClassifiesDataResearch() {
  const plan = planResearch("比赛需要的公开数据源，Kaggle CSV 数据集，做统计图和 SPSS 分析");
  const queryPurposes = new Set(plan.queries.map((query) => query.purpose));
  const requiredSourceTypes = new Set(plan.requiredSourceTypes);

  assert.equal(plan.taskType, "sports-analysis");
  assert.ok(requiredSourceTypes.has("sports-data"));
  assert.ok(requiredSourceTypes.has("dataset"));
  assert.ok(queryPurposes.has("sports-data"));
  assert.ok(queryPurposes.has("competition-data"));
}

function testPlannerClassifiesGenericDataResearch() {
  const plan = planResearch("城市空气质量公开数据源 CSV 可视化统计分析");
  const queryPurposes = new Set(plan.queries.map((query) => query.purpose));
  const requiredSourceTypes = new Set(plan.requiredSourceTypes);

  assert.equal(plan.taskType, "data-research");
  assert.ok(requiredSourceTypes.has("dataset"));
  assert.ok(requiredSourceTypes.has("data-catalog"));
  assert.ok(requiredSourceTypes.has("structured-api"));
  assert.ok(queryPurposes.has("dataset-discovery"));
  assert.ok(queryPurposes.has("statistical-source"));
  assert.ok(queryPurposes.has("visualization"));
}

function testResearchPlanningAgentExpandsTopicSpecificSubQuestions() {
  const plan = planResearch("研究一下中国避孕套市场，比如主要的消费人群，地区，购买时间段，以及他们与出生率的关系等等");
  const questions = plan.subQuestions.join("\n");
  const queryTexts = plan.queries.map((query) => query.text).join("\n");

  assert.ok(plan.subQuestions.length >= 12, "research planning agent should generate broad topic-specific sub-questions");
  for (const keyword of ["消费人群", "地区", "购买时间段", "出生率", "数据口径", "电商", "年龄", "趋势"]) {
    assert.ok(questions.includes(keyword), `sub-questions should cover ${keyword}`);
  }
  for (const keyword of ["中国 避孕套 市场 消费人群", "避孕套 出生率 相关性", "避孕套 电商 销售 时间段"]) {
    assert.ok(queryTexts.includes(keyword), `planned queries should expand topic dimension: ${keyword}`);
  }
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
  const plan = planResearch("GPT compatible chat completions api", ["https://platform.openai.com/docs/overview"]);
  const seedQuery = plan.queries.find((query) => query.text.includes("site:platform.openai.com"));

  assert.ok(seedQuery);
  assert.equal(seedQuery.purpose, "official-source");
  assert.ok(seedQuery.sourceTypes.includes("official"));
}

function testPlannerHonorsResearchConstraints() {
  const plan = planResearch(
    "AI 文档转换工具",
    ["https://example.com/tools"],
    {
      timeRange: { from: "2026-01-01", to: "2026-06-07" },
      contentTypes: ["pdf", "dataset"],
      sourceScope: {
        domains: ["official.example"],
        excludeDomains: ["spam.example"],
        sourceTypes: ["official", "dataset"],
      },
      languages: ["zh"],
    },
  );
  const queryTexts = plan.queries.map((query) => query.text).join("\n");

  assert.equal(plan.freshness, "historical");
  assert.deepEqual(plan.languages, ["zh"]);
  assert.ok(queryTexts.includes("after:2026-01-01 before:2026-06-07"));
  assert.ok(queryTexts.includes("filetype:pdf"));
  assert.ok(queryTexts.includes("dataset"));
  assert.ok(queryTexts.includes("site:official.example"));
  assert.ok(queryTexts.includes("-site:spam.example"));
  assert.ok(plan.requiredSourceTypes.includes("dataset"));
}

function testReportGeneration() {
  const report = generateMarkdownReport({
    id: "job-1",
    topic: "AI chip export controls",
    seedUrls: [],
    status: "active",
    budget: normalizeResearchBudget(),
    constraints: {},
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
  }], {
    supportedClaims: 1,
    contradictedClaims: 0,
    uncertainClaims: 0,
    unverifiedClaims: 0,
    supportingRelations: 1,
    conflictingRelations: 0,
  }, {
    passed: true,
    totalClaims: 1,
    supportedClaims: 1,
    contradictedClaims: 0,
    uncertainClaims: 0,
    unverifiedClaims: 0,
    claimsWithEvidence: 1,
    claimsWithoutEvidence: 0,
    orphanEvidence: 0,
    issues: [],
  });

  assert.equal(report.status, "ready");
  assert.ok(report.markdown.includes("AI chip export controls"));
  assert.ok(report.markdown.includes("https://example.com/report"));
  assert.ok(report.markdown.includes("证据质量门通过"));
  assert.ok(report.markdown.includes("- 证据质量门: passed"));

  const notReady = generateMarkdownReport({
    id: "job-empty",
    topic: "No evidence topic",
    seedUrls: [],
    status: "active",
    budget: normalizeResearchBudget(),
    constraints: {},
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

function testResearchSchemaCreatesReferencedTablesBeforeRelations() {
  const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const evidenceItemsIndex = source.indexOf("CREATE TABLE IF NOT EXISTS evidence_items");
  const evidenceRelationsIndex = source.indexOf("CREATE TABLE IF NOT EXISTS evidence_relations");

  assert.ok(evidenceItemsIndex > -1, "research schema should create evidence_items");
  assert.ok(evidenceRelationsIndex > -1, "research schema should create evidence_relations");
  assert.ok(
    evidenceItemsIndex < evidenceRelationsIndex,
    "fresh Postgres schema must create evidence_items before evidence_relations references it",
  );
}

function testResearchStoreProtectsSchemaInitAndSanitizesCrawlerText() {
  const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");

  assert.ok(source.includes("schemaInitPromise"), "schema initialization should be reused inside one Node process");
  assert.ok(source.includes("pg_advisory_xact_lock"), "schema initialization should use a Postgres advisory lock across workers");
  assert.ok(source.includes("sanitizePostgresText"), "crawler text should be sanitized before writing to Postgres");
  assert.ok(source.includes(".replace(/\\u0000/g, \"\")"), "Postgres text sanitizer must strip null bytes from fetched pages");
  assert.ok(source.includes("sanitizeJsonForPostgres(document.metadata ?? {})"), "crawl metadata JSON should be sanitized before JSONB writes");
}

function testDocumentSearchUsesHybridFieldsBeyondContentText() {
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const searchSource = readFileSync(new URL("./search/documentIndex.ts", import.meta.url), "utf8");

  assert.ok(searchSource.includes("tokenizeDocumentSearchQuery"), "document search should tokenize Chinese and mixed-language queries");
  assert.ok(storeSource.includes("document_links"), "document search should join discovered links");
  assert.ok(storeSource.includes("extracted_tables"), "document search should include extracted table content");
  assert.ok(storeSource.includes("document_assets"), "document search should include raw asset metadata");
  assert.ok(storeSource.includes("evidence_items"), "document search should include evidence snippets and paraphrases");
  assert.ok(storeSource.includes("search_blob"), "document search should build a weighted multi-field search blob");
  assert.ok(storeSource.includes("match_count"), "document search should score by token match coverage, not only PostgreSQL full text");
}

function testResearchUiExplainsRunTransparencyAndProviderMeaning() {
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const sourceExplorerSource = readFileSync(new URL("../../components/research/SourceExplorerPanel.tsx", import.meta.url), "utf8");
  const workflowPanelsSource = readFileSync(new URL("../../components/research/RunWorkflowPanels.tsx", import.meta.url), "utf8");
  const frontierProviderSource = readFileSync(new URL("../../components/research/FrontierProviderPanels.tsx", import.meta.url), "utf8");

  assert.ok(panelSource.includes("本次研究进度解释"), "overview should explain the current research run state");
  assert.ok(panelSource.includes("runTransparencyFailed"), "overview should explicitly explain failed runs");
  assert.ok(panelSource.includes("runNoClaimsHint"), "UI should explain why no claims/conclusions are visible yet");
  assert.ok(panelSource.includes("noReportBecauseFailed"), "report page should explain why a failed run has no report");
  assert.ok(panelSource.includes("fetchedDocuments"), "overview should split fetched document counts from total documents");
  assert.ok(sourceExplorerSource.includes("copy.documentCountHint"), "Source Explorer should explain document count vs text search mismatch");
  assert.ok(workflowPanelsSource.includes("copy.documentCountHint"), "document search panel should explain why search can show zero results");
  assert.ok(frontierProviderSource.includes("copy.providerExplanation"), "Provider Panel should define provider as a discovery channel");
}

function testDiscoveryIsBoundedAndObservable() {
  const runSource = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
  const registrySource = readFileSync(new URL("./discovery/registry.ts", import.meta.url), "utf8");

  assert.ok(runSource.includes("dedupePlannedQueriesForDiscovery"), "discovery should remove duplicate planned query text before provider fan-out");
  assert.ok(runSource.includes("RESEARCH_DISCOVERY_QUERY_LIMIT"), "discovery should cap per-run query fan-out by env-configurable limit");
  assert.ok(runSource.includes("Discovery 进度"), "discovery should emit query-level progress events instead of appearing stuck");
  assert.ok(registrySource.includes("runProviderDiscoveryWithConcurrency"), "provider registry should execute provider discovery with bounded concurrency");
  assert.ok(registrySource.includes("RESEARCH_DISCOVERY_PROVIDER_CONCURRENCY"), "provider concurrency should be env-configurable");
}

function testStructuredResearchPlanPersistenceIsWired() {
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const runSource = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const workflowPanelsSource = readFileSync(new URL("../../components/research/RunWorkflowPanels.tsx", import.meta.url), "utf8");

  assert.ok(storeSource.includes("export async function addResearchPlan"), "store should persist full research plans");
  assert.ok(storeSource.includes("export async function listPlannedQueriesForRun"), "store should list planned queries");
  assert.ok(storeSource.includes("scopedPlannedQueryId"), "planner query ids should be scoped per run before persistence");
  assert.ok(storeSource.includes("return `${runId}-${queryId}`"), "planner query ids should not collide globally across runs");
  assert.ok(runSource.includes("createDefaultDiscoveryProviders(getResearchConfig())"), "run discovery should use the provider registry");
  assert.ok(runSource.includes("await addResearchPlan({ jobId: job.id, runId, plan })"), "run discovery should write structured plan artifacts");
  assert.ok(runSource.includes("const plan = planResearch(job.topic, job.seedUrls, job.constraints);"), "queued runs should pre-generate the topic-specific plan before workers start");
  assert.ok(runSource.includes("queryCount: plan.queries.length"), "queued run events should expose how many planned queries were generated");
  assert.ok(routesSource.includes('router.get("/runs/:runId/plan"'), "API should expose run plan and planned queries");
  assert.ok(panelSource.includes("QueryPlanPanel"), "Research UI should mount the structured query plan panel");
  assert.ok(workflowPanelsSource.includes("export const QueryPlanPanel"), "Research UI should surface the structured query plan");
  assert.ok(panelSource.includes("plannedQueries"), "Research UI should render planned query rows");
}

function testResearchE2eUsesOfflineDiscoveryMode() {
  const registrySource = readFileSync(new URL("./discovery/registry.ts", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/research-e2e-smoke.mjs", import.meta.url), "utf8");
  const analysisSource = readFileSync(new URL("./analysis.ts", import.meta.url), "utf8");

  assert.ok(registrySource.includes("RESEARCH_DISCOVERY_OFFLINE_ONLY"), "provider registry should expose a deterministic offline discovery mode");
  assert.ok(
    registrySource.includes("if (process.env.RESEARCH_DISCOVERY_OFFLINE_ONLY === \"true\")") &&
    registrySource.includes("createSeedUrlProvider(),"),
    "offline discovery should keep a seed-url-only provider set",
  );
  assert.ok(smokeSource.includes("RESEARCH_DISCOVERY_OFFLINE_ONLY"), "research e2e smoke should run without external provider dependency");
  assert.ok(smokeSource.includes("AI_API_KEY: \"\""), "research e2e smoke should not depend on external AI providers");
  assert.ok(smokeSource.includes("isolatedRedisUrl"), "research e2e smoke should isolate Redis queues from local development state");
  assert.ok(analysisSource.includes("fallbackResearchAnalysis"), "research analysis should fall back when AI providers fail");
  assert.ok(smokeSource.includes("sourceTypes: [\"official\"]"), "research e2e smoke should constrain discovery to local official seed sources");
}

function testUiSmokeDoesNotConsumeResearchQueues() {
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");

  assert.ok(smokeSource.includes("REDIS_URL: \"\""), "UI smoke should not start research workers against real Redis queues");
  assert.ok(smokeSource.includes("DATABASE_URL: \"\""), "UI smoke should not depend on real Research/Postgres state");
}

function testExtractedTablePersistenceIsIdempotentAndVisible() {
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const runSource = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const sourceExplorerSource = readFileSync(new URL("../../components/research/SourceExplorerPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");

  assert.ok(storeSource.includes("table_index INTEGER NOT NULL"), "extracted_tables should persist table order");
  assert.ok(storeSource.includes("UNIQUE(document_id, table_index)"), "table persistence must be idempotent per document/index");
  assert.ok(storeSource.includes("export async function upsertExtractedTable"), "store should upsert extracted tables");
  assert.ok(runSource.includes("upsertExtractedTable"), "fetch stage should persist extracted tables through an upsert");
  assert.ok(runSource.includes("tableIndex: index"), "fetch stage should pass deterministic table index");
  assert.ok(routesSource.includes('router.get("/runs/:runId/tables"'), "API should expose extracted tables for a run");
  assert.ok(panelSource.includes("<SourceExplorer"), "Research UI should mount the source explorer");
  assert.ok(sourceExplorerSource.includes("ExtractedTablesPreview"), "Research UI should show extracted table previews");
  assert.ok(smokeSource.includes("/api/research/runs/smoke-run/tables"), "Playwright smoke should mock extracted tables deterministically");
  assert.ok(smokeSource.includes("工具对比"), "Playwright smoke should assert rendered extracted table content");
}

function testEvidenceGraphUiIsWired() {
  const sharedTypesSource = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(sharedTypesSource.includes("export interface EvidenceRelationSummary"), "frontend types should include evidence relation rows");
  assert.ok(sharedTypesSource.includes("export interface EvidenceGraphSummary"), "frontend types should include evidence graph summary counters");
  assert.ok(panelSource.includes("/api/research/runs/${run.id}/graph"), "Research UI should load the run evidence graph endpoint");
  assert.ok(panelSource.includes("EvidenceGraphPanel"), "Research UI should render an evidence graph panel");
  assert.ok(panelSource.includes("graphRelations"), "Research UI should store/render graph relations");
  assert.ok(smokeSource.includes("/api/research/runs/smoke-run/graph"), "Playwright smoke should mock the graph endpoint");
  assert.ok(smokeSource.includes("证据图谱"), "Playwright smoke should assert the evidence graph panel");
  assert.ok(readmeSource.includes("Evidence Graph"), "README should describe the frontend evidence graph surface");
}

function testDocumentLinksArePersistentAndVisible() {
  const backendTypesSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  const sharedTypesSource = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const runSource = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const sourceExplorerSource = readFileSync(new URL("../../components/research/SourceExplorerPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(backendTypesSource.includes("export interface DocumentLinkRecord"), "backend types should include persisted document links");
  assert.ok(sharedTypesSource.includes("export interface DocumentLinkSummary"), "frontend types should include document link summaries");
  assert.ok(storeSource.includes("UNIQUE(document_id, url)"), "document_links should be idempotent per source document/url");
  assert.ok(storeSource.includes("export async function upsertDocumentLink"), "store should upsert extracted document links");
  assert.ok(storeSource.includes("export async function listDocumentLinksForRun"), "store should list document links by run");
  assert.ok(runSource.includes("await saveDocumentLinks"), "fetch stage should persist extracted links before/while enqueueing frontier");
  assert.ok(routesSource.includes('router.get("/runs/:runId/links"'), "API should expose extracted links for a run");
  assert.ok(panelSource.includes("/api/research/runs/${run.id}/links"), "Research UI should load run document links");
  assert.ok(panelSource.includes("<SourceExplorer"), "Research UI should mount the source explorer");
  assert.ok(sourceExplorerSource.includes("DocumentLinksPreview"), "Source Explorer should render discovered links for the selected source");
  assert.ok(smokeSource.includes("/api/research/runs/smoke-run/links"), "Playwright smoke should mock discovered links deterministically");
  assert.ok(smokeSource.includes("发现外链"), "Playwright smoke should assert the discovered links panel");
  assert.ok(readmeSource.includes("/api/research/runs/:runId/links"), "README should document the run links API");
}

function testManualRunIterationControlsAreWired() {
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(storeSource.includes("export async function appendPlannedQueryForRun"), "store should append a manual planned query without replacing the plan");
  assert.ok(storeSource.includes("export async function resetFailedFrontierItemsForRun"), "store should reset failed/skipped frontier items for retry");
  assert.ok(storeSource.includes("status IN ('failed', 'skipped', 'fetching')"), "retry should also recover frontier items stranded in fetching after worker failure");
  assert.ok(routesSource.includes('router.post("/runs/:runId/queries"'), "API should expose manual query append");
  assert.ok(routesSource.includes('router.post("/runs/:runId/retry-failed"'), "API should expose failed frontier retry");
  assert.ok(routesSource.includes('attemptReason: "manual"'), "manual query append should enqueue discovery as a manual attempt");
  assert.ok(routesSource.includes('attemptReason: "retry"'), "retry-failed should enqueue fetch as a retry attempt");
  assert.ok(panelSource.includes("ManualRunControls"), "Research UI should render run-level manual iteration controls");
  assert.ok(panelSource.includes("/api/research/runs/${selectedRun.id}/queries"), "Research UI should call manual query append endpoint");
  assert.ok(panelSource.includes("/api/research/runs/${selectedRun.id}/retry-failed"), "Research UI should call retry-failed endpoint");
  assert.ok(smokeSource.includes("/api/research/runs/smoke-run/queries"), "Playwright smoke should mock manual query append");
  assert.ok(smokeSource.includes("/api/research/runs/smoke-run/retry-failed"), "Playwright smoke should mock retry-failed");
  assert.ok(smokeSource.includes("追加查询"), "Playwright smoke should assert the append query control");
  assert.ok(smokeSource.includes("重试失败项"), "Playwright smoke should assert the retry-failed control");
  assert.ok(readmeSource.includes("/api/research/runs/:runId/queries"), "README should document manual query append");
  assert.ok(readmeSource.includes("/api/research/runs/:runId/retry-failed"), "README should document failed frontier retry");
}

function testRunClaimsApiIsWired() {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(routesSource.includes('router.get("/runs/:runId/claims"'), "API should expose a dedicated run claims endpoint");
  assert.ok(panelSource.includes("/api/research/runs/${run.id}/claims"), "Research UI should load the dedicated run claims endpoint");
  assert.ok(panelSource.includes("ClaimsPanel"), "Research UI should render a claims-focused panel");
  assert.ok(smokeSource.includes("/api/research/runs/smoke-run/claims"), "Playwright smoke should mock the claims endpoint");
  assert.ok(smokeSource.includes("结论索引"), "Playwright smoke should assert the claims panel");
  assert.ok(readmeSource.includes("/api/research/runs/:runId/claims"), "README should document the run claims API");
}

function testEvidenceFallbackAndGraphAreMeaningful() {
  const analysisSource = readFileSync(new URL("./analysis.ts", import.meta.url), "utf8");
  const runSource = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const evidencePanelSource = readFileSync(new URL("../../components/research/EvidencePanels.tsx", import.meta.url), "utf8");
  const workflowPanelSource = readFileSync(new URL("../../components/research/RunWorkflowPanels.tsx", import.meta.url), "utf8");
  const frontierPanelSource = readFileSync(new URL("../../components/research/FrontierProviderPanels.tsx", import.meta.url), "utf8");
  const capabilityPanelSource = readFileSync(new URL("../../components/research/CapabilityAuditPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");

  assert.ok(analysisSource.includes("topicTermHits"), "fallback analysis should expose topic term hit coverage");
  assert.ok(analysisSource.includes("return { relevanceScore: 0, relevant: false"), "fallback analysis should reject unrelated fetched text instead of creating fake evidence");
  assert.ok(analysisSource.includes("summarizeEvidenceSnippet"), "fallback analysis should create a source summary from the fetched content");
  assert.ok(!runSource.includes("fallbackEvidenceFromDocument"), "analyze stage must not fabricate generic evidence when analysis finds no source-backed evidence");
  assert.ok(!runSource.includes("已抓取与"), "generic fallback evidence copy should not appear in research evidence generation");
  assert.ok(runSource.includes("updateEvidenceItemClaimId"), "analyze stage should write the generated claim id back onto evidence rows");
  assert.ok(storeSource.includes("export async function updateEvidenceItemClaimId"), "store should support linking saved evidence to claims");
  assert.ok(runSource.includes("sourceConfidenceAdjustment"), "credibility should vary by source type, relevance, and topic match coverage");
  assert.ok(evidencePanelSource.includes("EvidenceGraphCanvas"), "Evidence graph should render a graph-like node/link view, not only a flat list");
  assert.ok(evidencePanelSource.includes("EvidenceQualityPanel"), "Evidence UI should surface quality risks before the graph is trusted");
  assert.ok(evidencePanelSource.includes("legacyFallbackEvidence"), "Evidence UI should flag legacy fallback evidence stored by older runs");
  assert.ok(evidencePanelSource.includes("证据摘要") || evidencePanelSource.includes("Evidence summary"), "Evidence table should surface evidence summaries");
  assert.ok(workflowPanelSource.includes("newsAnalysisEmptyReason"), "news analysis panel should explain when 0 documents were analyzed");
  assert.ok(frontierPanelSource.includes("dataSourceDatasetExplanation"), "Data Lab export should explain what dataset is created and how to analyze it");
  assert.ok(capabilityPanelSource.includes("能力目标") || smokeSource.includes("能力目标"), "pressure smoke UI should label Quick/Standard/Deep as capability targets, not current run results");
}

function testResearchRuntimeMonitorUiIsWired() {
  const sharedTypesSource = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(sharedTypesSource.includes("export interface ResearchQueueStatusSummary"), "frontend types should include research queue status summaries");
  assert.ok(sharedTypesSource.includes("export interface ProviderHealthSummary"), "frontend types should include provider health summaries");
  assert.ok(routesSource.includes('router.get("/queues"'), "API should expose research queue health");
  assert.ok(routesSource.includes('router.get("/providers/health"'), "API should expose global provider health");
  assert.ok(panelSource.includes("/api/research/queues"), "Research UI should load global queue status");
  assert.ok(panelSource.includes("/api/research/providers/health"), "Research UI should load global provider health");
  assert.ok(panelSource.includes("RuntimeMonitorPanel"), "Research UI should render a runtime monitor panel");
  assert.ok(smokeSource.includes("/api/research/queues"), "Playwright smoke should mock queue status");
  assert.ok(smokeSource.includes("/api/research/providers/health"), "Playwright smoke should mock provider health");
  assert.ok(smokeSource.includes("运行监控"), "Playwright smoke should assert the runtime monitor panel");
  assert.ok(smokeSource.includes("Provider 健康"), "Playwright smoke should assert provider health output");
  assert.ok(readmeSource.includes("运行监控"), "README should describe runtime monitoring in the Research UI");
}

function testSourceExplorerFetchDiagnosticsAreVisible() {
  const backendTypesSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  const sharedTypesSource = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const crawlerSource = readFileSync(new URL("./crawler.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const sourceExplorerSource = readFileSync(new URL("../../components/research/SourceExplorerPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(backendTypesSource.includes("metadata?: CrawlDocumentMetadata"), "backend crawl documents should carry fetch diagnostics metadata");
  assert.ok(sharedTypesSource.includes("metadata?: ResearchDocumentMetadataSummary"), "frontend document summaries should expose fetch diagnostics metadata");
  assert.ok(storeSource.includes("metadata JSONB NOT NULL DEFAULT '{}'"), "research schema should persist crawl document metadata");
  assert.ok(storeSource.includes("document.metadata ?? {}"), "crawl document upsert should write metadata");
  assert.ok(crawlerSource.includes("readerPath"), "crawler should record the selected reader path");
  assert.ok(crawlerSource.includes("diagnostics"), "crawler should record fetch diagnostics");
  assert.ok(panelSource.includes("<SourceExplorer"), "Research UI should mount the source explorer");
  assert.ok(sourceExplorerSource.includes("SourceDiagnosticsPanel"), "Source Explorer should render fetch diagnostics");
  assert.ok(sourceExplorerSource.includes("读取路径"), "Source Explorer should label the reader path in Chinese");
  assert.ok(sourceExplorerSource.includes("诊断结果"), "Source Explorer should label diagnostics in Chinese");
  assert.ok(smokeSource.includes("读取路径"), "Playwright smoke should assert the reader path output");
  assert.ok(smokeSource.includes("诊断结果"), "Playwright smoke should assert diagnostics output");
  assert.ok(readmeSource.includes("读取路径"), "README should document Source Explorer diagnostics");
}

function testProviderPanelShowsDataSourceCoverage() {
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const frontierProviderSource = readFileSync(new URL("../../components/research/FrontierProviderPanels.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(panelSource.includes("ProviderPanel"), "Research UI should mount the provider panel");
  assert.ok(frontierProviderSource.includes("DataSourceCoveragePanel"), "Provider Panel should summarize data source coverage");
  assert.ok(frontierProviderSource.includes("ProviderDetailRows"), "Provider Panel should render provider detail rows");
  assert.ok(panelSource.includes("onOpenDataLab"), "Provider Panel should expose a Data Lab navigation callback");
  assert.ok(panelSource.includes("打开 Data Lab"), "Provider Panel should render a Data Lab navigation button");
  assert.ok(panelSource.includes("数据源覆盖"), "Provider Panel should label data source coverage in Chinese");
  assert.ok(frontierProviderSource.includes("data-catalog"), "Provider Panel should expose data catalog provider types");
  assert.ok(frontierProviderSource.includes("structured-api"), "Provider Panel should expose structured API provider types");
  assert.ok(frontierProviderSource.includes("competition-data"), "Provider Panel should expose competition data provider types");
  assert.ok(smokeSource.includes("生成 Data Lab 数据源清单"), "Playwright smoke should assert the data-source registry entry");
  assert.ok(smokeSource.includes("回到 Research run"), "Playwright smoke should assert round-trip navigation from Data Lab");
  assert.ok(smokeSource.includes("数据源覆盖"), "Playwright smoke should assert data source coverage output");
  assert.ok(smokeSource.includes("data-catalog"), "Playwright smoke should assert data catalog provider type output");
  assert.ok(smokeSource.includes("structured-api"), "Playwright smoke should assert structured API provider type output");
  assert.ok(smokeSource.includes("competition-data"), "Playwright smoke should assert competition data provider type output");
  assert.ok(readmeSource.includes("数据源覆盖"), "README should document provider data source coverage");
}

function testFrontierScoreExplainabilityIsPersistedAndVisible() {
  const backendTypesSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  const sharedTypesSource = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const queueSource = readFileSync(new URL("./frontier/queue.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const frontierProviderSource = readFileSync(new URL("../../components/research/FrontierProviderPanels.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const readmeSource = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.ok(backendTypesSource.includes("export interface FrontierScoreBreakdown"), "backend types should expose frontier score breakdown");
  assert.ok(sharedTypesSource.includes("export interface FrontierScoreBreakdownSummary"), "frontend types should expose frontier score breakdown");
  assert.ok(storeSource.includes("score_breakdown JSONB NOT NULL DEFAULT '{}'"), "fresh schema should persist frontier score breakdown");
  assert.ok(storeSource.includes("ALTER TABLE frontier_items ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'"), "schema migration should add score_breakdown to existing frontier tables");
  assert.ok(queueSource.includes("scoreFrontierItemBreakdown"), "frontier queue should compute score explainability while enqueueing");
  assert.ok(panelSource.includes("FrontierPanel"), "Research UI should mount the frontier panel");
  assert.ok(frontierProviderSource.includes("FrontierScoreBreakdownView"), "Frontier UI should render score explainability rows");
  for (const label of ["评分解释", "主题相关", "来源权威", "原始来源", "新鲜度", "来源多样性", "上下文质量", "权重"]) {
    assert.ok(panelSource.includes(label) || frontierProviderSource.includes(label), `Frontier UI should include Chinese label: ${label}`);
    assert.ok(smokeSource.includes(label), `Playwright smoke should assert rendered score label: ${label}`);
  }
  assert.ok(smokeSource.includes("scoreBreakdown"), "Playwright smoke should mock frontier score breakdown data");
  assert.ok(readmeSource.includes("Frontier 评分解释"), "README should document frontier score explainability");
  assert.ok(readmeSource.includes("主题相关度 25%"), "README should document fixed frontier scoring weights");
}

function testResearchCapabilityAuditSurfacesRealReadinessAndPressureTargets() {
  const audit = getResearchCapabilityAudit({
    DATABASE_URL: "postgres://local/politistream",
    REDIS_URL: "redis://127.0.0.1:6379/0",
    BRAVE_API_KEY: "brave-real-key-12345",
    SERPAPI_API_KEY: "",
    TAVILY_API_KEY: "tavily-real-key-12345",
    NEWSAPI_KEY: "",
    GITHUB_TOKEN: "github-real-token-12345",
    KAGGLE_USERNAME: "demo",
    KAGGLE_KEY: "kaggle-real-key-12345",
    FRED_API_KEY: "fred-real-key-12345",
    AI_BASE_URL: "https://relay.example.com/v1",
    AI_API_KEY: "relay-real-key-12345",
    AI_MODEL: "gpt-5.4",
  });

  assert.equal(audit.storage.ready, true, "capability audit should mark Postgres storage ready from DATABASE_URL");
  assert.equal(audit.queue.ready, true, "capability audit should mark Redis queue ready from REDIS_URL");
  assert.ok(audit.searchProviders.some((provider) => provider.name === "brave" && provider.configured), "audit should expose configured Brave search");
  assert.ok(audit.searchProviders.some((provider) => provider.name === "serpapi" && !provider.configured), "audit should expose missing SerpApi key");
  assert.ok(audit.dataProviders.some((provider) => provider.name === "kaggle" && provider.configured), "audit should expose configured Kaggle data provider");
  assert.ok(audit.dataProviders.some((provider) => provider.name === "sports"), "audit should expose sports data provider");
  assert.ok(audit.dataProviders.length >= 14, "audit should expose every implemented data provider");
  assert.ok(audit.extractors.some((extractor) => extractor.name === "pdf" && extractor.coverage === "implemented"), "audit should expose PDF extractor readiness");
  assert.ok(audit.pressureTargets.some((target) => target.mode === "Deep" && target.maxUrlsPerRun === 500), "audit should expose the Deep 500 URL pressure target");
  assert.ok(audit.frontendSurfaces.includes("Source Explorer"), "audit should list Source Explorer as a visible surface");
  assert.ok(audit.envChecklist.some((item) => item.name === "DATABASE_URL" && item.configured && item.requiredLevel === "required"), "audit should expose required DATABASE_URL env");
  assert.ok(audit.envChecklist.some((item) => item.name === "BRAVE_API_KEY" && item.configured && item.requiredLevel === "at-least-one"), "audit should expose configured search env");
  assert.ok(audit.envChecklist.some((item) => item.name === "SERPAPI_API_KEY" && !item.configured && item.requiredFor100), "audit should expose missing search env");
  assert.ok(audit.envChecklist.some((item) => item.name === "AI_API_KEY" && item.configured && item.group === "ai"), "audit should expose AI key env");
  assert.ok(audit.envChecklist.some((item) => item.name === "AI_BASE_URL" && item.configured && item.group === "ai"), "audit should expose AI base URL env");
  assert.ok(audit.envChecklist.every((item) => !("value" in item)), "audit must not expose secret env values");
  assert.ok(audit.extractorSamples.some((item) => item.name === "structured-data"), "audit should expose structured-data extractor sample");
  assert.ok(audit.extractorSamples.length >= 8, "audit should expose every extractor sample");
  assert.ok(audit.frontendSurfaces.includes("Agent Console"), "audit should list Agent Console as a visible surface");
  assert.ok(audit.frontendSurfaces.includes("自然语言调度"), "audit should list natural language dispatch as a visible surface");
  assert.ok(audit.compatibilityApis.some((api) => api.path === "/api/datasets/:id/validate"), "audit should expose compatibility API checks");
  assert.ok(audit.exportArtifacts.some((artifact) => artifact.format === "pptx"), "audit should expose PPTX export artifact checks");
  assert.ok(audit.remainingGates.includes("真实 provider 联网 smoke"), "audit should keep external provider smoke as an explicit remaining gate");
}

function testResearchCapabilityAuditApiAndUiAreWired() {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");

  assert.ok(routesSource.includes('router.get("/capabilities"'), "Research API should expose capability readiness");
  assert.ok(routesSource.includes('router.post("/capabilities/sample-acceptance"'), "Research API should expose sample acceptance");
  assert.ok(routesSource.includes('router.post("/capabilities/enhanced-fetch-smoke"'), "Research API should expose enhanced fetch smoke");
  assert.ok(panelSource.includes("/api/research/capabilities"), "Research UI should load capability readiness");
  assert.ok(panelSource.includes("/api/research/capabilities/sample-acceptance"), "Research UI should call sample acceptance");
  assert.ok(panelSource.includes("/api/research/capabilities/enhanced-fetch-smoke"), "Research UI should call enhanced fetch smoke");
  assert.ok(panelSource.includes("CapabilityAuditPanel"), "Research UI should render capability audit panel");
  assert.ok(panelSource.includes("envChecklist"), "Research UI should pass capability env checklist");
  assert.ok(!readFileSync(new URL("../../components/research/CapabilityAuditPanel.tsx", import.meta.url), "utf8").includes("dataProviders.slice(0, 8)"), "Capability audit should render all data providers");
  assert.ok(smokeSource.includes("/api/research/capabilities"), "UI smoke should mock capability readiness");
  assert.ok(smokeSource.includes("/api/research/capabilities/sample-acceptance"), "UI smoke should mock sample acceptance");
  assert.ok(smokeSource.includes("/api/research/capabilities/enhanced-fetch-smoke"), "UI smoke should mock enhanced fetch smoke");
  assert.ok(smokeSource.includes("能力验收台"), "UI smoke should assert capability audit panel");
  assert.ok(smokeSource.includes("样本验收"), "UI smoke should assert sample acceptance panel");
  assert.ok(smokeSource.includes("运行新闻溯源样本"), "UI smoke should assert news sample acceptance action");
  assert.ok(smokeSource.includes("运行数据处理样本"), "UI smoke should assert data sample acceptance action");
  assert.ok(smokeSource.includes("Extractor 逐类型样本"), "UI smoke should assert extractor sample matrix");
  assert.ok(smokeSource.includes("运行增强抓取 smoke"), "UI smoke should assert enhanced fetch smoke action");
  assert.ok(smokeSource.includes("兼容 API 验收"), "UI smoke should assert compatibility API panel");
  assert.ok(smokeSource.includes("导出产物验收"), "UI smoke should assert export artifact panel");
  assert.ok(smokeSource.includes("Agent Console"), "UI smoke should assert Agent Console capability surface");
  assert.ok(smokeSource.includes("Env 配置清单"), "UI smoke should assert env checklist visibility");
  assert.ok(smokeSource.includes("BRAVE_API_KEY"), "UI smoke should assert search env visibility");
  assert.ok(smokeSource.includes("AI_API_KEY"), "UI smoke should assert AI env visibility");
  assert.ok(smokeSource.includes("能力目标 / Deep"), "UI smoke should assert Deep pressure visibility as a capability target");
}

function testAnalysisReportOnlyHandoffStaysSideEffectFree() {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

  assert.ok(routesSource.includes('if (decision === "report_only") return "research-report";'), "report-only handoff should route back to the Research report");
  assert.ok(routesSource.includes('if (decision === "report_only") return [];'), "report-only handoff should not allow downstream analysis operations");
  assert.ok(routesSource.includes('message: "已记录 Research 到 Data Lab 的分析交接决策。"'), "handoff route should persist the report-only decision as a run event");
}

function testAnalysisFullHandoffCarriesWizardMetadata() {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

  assert.ok(routesSource.includes('if (decision === "full_analysis") return "wizard";'), "full-analysis handoff should target the Data Lab wizard");
  assert.ok(routesSource.includes('planId: planIdForHandoffDecision(input.decision, input.opportunity.id)'), "full-analysis handoff should carry a stable plan id");
  assert.ok(routesSource.includes('topicId: topicIdForHandoffDecision(input.decision, input.job.id)'), "full-analysis handoff should carry a stable topic id");
}

function testAnalysisContinueCrawlHandoffAddsFollowUpDiscovery() {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

  assert.ok(routesSource.includes('if (input.decision === "continue_crawl")'), "continue-crawl handoff should have an explicit branch");
  assert.ok(routesSource.includes("appendContinueCrawlQueries"), "continue-crawl handoff should append follow-up planned queries");
  assert.ok(routesSource.includes('updateResearchRunStatus(input.run.id, "queued", "discovery")'), "continue-crawl handoff should send the run back to discovery");
  assert.ok(routesSource.includes('enqueueResearchStage({ runId: input.run.id, jobId: input.job.id, stage: "discovery"'), "continue-crawl handoff should enqueue discovery");
  assert.ok(routesSource.includes('if (run.status === "cancelled") return res.status(409)'), "cancelled runs should be rejected safely");
}

function testResearchAnalysisDecisionUiIsWired() {
  const panelSource = readFileSync(new URL("../../components/ResearchPanel.tsx", import.meta.url), "utf8");
  const decisionSource = readFileSync(new URL("../../components/research/AnalysisDecisionPanel.tsx", import.meta.url), "utf8");

  assert.ok(panelSource.includes("AnalysisDecisionPanel"), "Research UI should render the analysis decision panel");
  assert.ok(panelSource.includes("/analysis-opportunity"), "Research UI should call the analysis opportunity API");
  assert.ok(panelSource.includes("/analysis-handoff"), "Research UI should call the analysis handoff API");
  assert.ok(panelSource.includes("page: decision === 'full_analysis' ? 'wizard' : 'sources'"), "Research UI should route Data Lab to sources or wizard by decision");
  assert.ok(decisionSource.includes("scoreBreakdown"), "Analysis drawer should show score breakdown");
  assert.ok(decisionSource.includes("recommendedDataSources"), "Analysis drawer should show recommended data sources");
  assert.ok(decisionSource.includes("evidenceSummary"), "Analysis drawer should show evidence summaries");
  assert.ok(decisionSource.includes("missingFields"), "Analysis drawer should show missing fields");
}

async function testProviderLiveSmokeHandlesConfiguredAndMissingProviders() {
  const result = await runProviderLiveSmoke({
    topic: "document conversion tools",
    config: {
      aiModel: "test",
      browserProvider: "local",
      braveApiKey: "configured-key",
      serpApiKey: "",
      tavilyApiKey: "",
      newsApiKey: "",
    },
    searchFn: async () => [
      {
        provider: "brave",
        enabled: true,
        candidates: [
          {
            jobId: "live-smoke",
            provider: "brave",
            query: "document conversion tools",
            url: "https://pandoc.org",
            canonicalUrl: "https://pandoc.org/",
            title: "Pandoc",
            snippet: "Universal markup converter",
            depth: 0,
          },
        ],
      },
      { provider: "serpapi", enabled: false, candidates: [], error: "provider_api_key_missing" },
    ],
  });

  assert.equal(result.topic, "document conversion tools");
  assert.equal(result.totalCandidates, 1);
  assert.ok(result.providers.some((provider) => provider.provider === "brave" && provider.status === "passed"));
  assert.ok(result.providers.some((provider) => provider.provider === "serpapi" && provider.status === "skipped"));
}

function testPressureSmokeExposesStandardAndDeepBudgets() {
  const result = runPressureSmoke("新闻溯源和文档转换工具调研");

  assert.ok(result.targets.some((target) => target.mode === "Standard" && target.maxUrlsPerRun === 150));
  assert.ok(result.targets.some((target) => target.mode === "Deep" && target.maxUrlsPerRun === 500));
  assert.ok(result.targets.every((target) => target.plannedQueries > 0), "pressure smoke should plan queries for every target");
  assert.ok(result.targets.every((target) => target.estimatedFrontierCapacity >= target.maxUrlsPerRun), "pressure smoke should estimate enough frontier capacity");
}

async function testDataSourceLiveSmokeUsesPublicDiscoveryProviders() {
  const result = await runDataSourceLiveSmoke({
    topic: "public climate dataset csv",
    providers: [
      {
        name: "ckan",
        type: "data-catalog",
        enabled: () => true,
        discover: async () => [
          {
            jobId: "data-source-smoke",
            runId: "data-source-smoke",
            provider: "ckan",
            providerType: "data-catalog",
            queryId: "data-source-smoke-query",
            query: "public climate dataset csv",
            url: "https://catalog.data.gov/dataset/climate",
            canonicalUrl: "https://catalog.data.gov/dataset/climate",
            title: "Climate dataset",
            snippet: "CSV public dataset",
            rank: 1,
            depth: 0,
            sourceType: "data-catalog",
            discoveredAt: "2026-06-08T00:00:00.000Z",
          },
        ],
      },
      {
        name: "openalex",
        type: "structured-api",
        enabled: () => true,
        discover: async () => [],
      },
    ],
  });

  assert.equal(result.totalCandidates, 1);
  assert.ok(result.providers.some((provider) => provider.provider === "ckan" && provider.status === "passed"));
  assert.ok(result.providers.some((provider) => provider.provider === "openalex" && provider.status === "failed"));
}

function testCapabilitySmokeApiAndUiAreWired() {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../../components/research/CapabilityAuditPanel.tsx", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("../../../scripts/ui-smoke.mjs", import.meta.url), "utf8");
  const packageSource = readFileSync(new URL("../../../package.json", import.meta.url), "utf8");

  assert.ok(routesSource.includes('router.post("/capabilities/provider-smoke"'), "Research API should expose provider live smoke");
  assert.ok(routesSource.includes('router.post("/capabilities/data-source-smoke"'), "Research API should expose data source live smoke");
  assert.ok(routesSource.includes('router.post("/capabilities/pressure-smoke"'), "Research API should expose pressure smoke");
  assert.ok(routesSource.includes("getLatestSmokeEvidence"), "Research capabilities API should include latest smoke evidence");
  assert.ok(panelSource.includes("onRunProviderSmoke"), "Capability audit panel should expose provider smoke action");
  assert.ok(panelSource.includes("onRunDataSourceSmoke"), "Capability audit panel should expose data source smoke action");
  assert.ok(panelSource.includes("onRunPressureSmoke"), "Capability audit panel should expose pressure smoke action");
  assert.ok(panelSource.includes("lastSmoke"), "Capability audit panel should render persisted smoke evidence");
  assert.ok(smokeSource.includes("/api/research/capabilities/provider-smoke"), "UI smoke should mock provider smoke action");
  assert.ok(smokeSource.includes("/api/research/capabilities/data-source-smoke"), "UI smoke should mock data source smoke action");
  assert.ok(smokeSource.includes("/api/research/capabilities/pressure-smoke"), "UI smoke should mock pressure smoke action");
  assert.ok(smokeSource.includes("运行 Provider smoke"), "UI smoke should assert provider smoke button");
  assert.ok(smokeSource.includes("运行数据源 smoke"), "UI smoke should assert data source smoke button");
  assert.ok(smokeSource.includes("运行 Deep 压测"), "UI smoke should assert pressure smoke button");
  assert.ok(packageSource.includes("smoke:research-capabilities"), "package scripts should expose a CLI research capability smoke");
  assert.ok(readFileSync(new URL("../../../scripts/research-capability-smoke.mjs", import.meta.url), "utf8").includes("persistSmokeEvidence"), "CLI smoke should persist evidence");
}

async function testResearchSampleAcceptanceUsesRealWorkerContract() {
  const runner = async ({ command, rows }: { command: string; rows: Array<Record<string, unknown>> }) => {
    assert.ok(rows.length >= 5, "sample acceptance should send meaningful sample rows to the worker");
    const results: Record<string, Record<string, unknown>> = {
      news: { documentCount: rows.length, clusters: [{}], timeline: [{}, {}, {}], sourceProfiles: [{}, {}, {}], conflictSignals: [] },
      profile: { columns: [{}] },
      stats: { numericColumns: [{}], correlations: [] },
      quality: { profile: {}, quality: {}, checks: [] },
      regression: { model: {} },
      logistic: { model: {} },
      poisson: { model: {} },
      dimension: { pca: {} },
      cluster: { clusterCounts: { A: 2 } },
      anomaly: { anomalies: [] },
      timeseries: { timeline: [] },
      text: { keywords: [] },
      deepml: { torch: {} },
      geo: { geojson: {} },
      chart: { files: { png: "/tmp/chart.png" } },
      report: { markdown: "# Report" },
      export: { files: { md: "/tmp/report.md", docx: "/tmp/report.docx", pdf: "/tmp/report.pdf", pptx: "/tmp/report.pptx" } },
    };
    return {
      command,
      engine: "python-worker" as const,
      result: results[command] ?? {},
      durationMs: 1,
    };
  };

  const news = await runResearchSampleAcceptance({ kind: "news-trace", runner: runner as any });
  assert.equal(news.status, "passed");
  assert.ok(news.checks.some((item) => item.id === "news-source-quality" && item.status === "passed"));

  const data = await runResearchSampleAcceptance({ kind: "data-processing", runner: runner as any });
  assert.equal(data.status, "passed");
  assert.ok(data.commands.includes("export"));
  assert.ok(data.checks.some((item) => item.id === "report-export" && item.status === "passed"));
}

function testEnhancedFetchSmokeExposesOptionalProviders() {
  const result = runEnhancedFetchSmoke({
    RESEARCH_BROWSER_FETCH_ENABLED: "true",
    FIRECRAWL_API_KEY: "",
    CRAWL4AI_URL: "",
    BROWSERLESS_URL: "",
  } as NodeJS.ProcessEnv);

  assert.equal(result.passed, true);
  assert.ok(result.rows.some((row) => row.provider === "http-fetcher" && row.status === "passed"));
  assert.ok(result.rows.some((row) => row.provider === "browser-fallback" && row.status === "passed"));
  assert.ok(result.rows.some((row) => row.provider === "firecrawl" && row.status === "skipped"));
  assert.ok(result.rows.some((row) => row.provider === "crawl4ai" && row.status === "skipped"));
  assert.ok(result.rows.some((row) => row.provider === "browserless" && row.status === "skipped"));
}

async function testSmokeEvidencePersistsLatestResult() {
  const dir = mkdtempSync(path.join(tmpdir(), "politistream-smoke-evidence-"));
  try {
    const pressure = runPressureSmoke("文档转换工具和公开数据源");
    const provider = await runProviderLiveSmoke({
      topic: "文档转换工具和公开数据源",
      searchFn: async () => [
        { provider: "brave", enabled: false, candidates: [], error: "provider_api_key_missing" },
      ],
    });
    const dataSource = await runDataSourceLiveSmoke({
      topic: "文档转换工具和公开数据源",
      providers: [{ name: "ckan", type: "data-catalog", enabled: () => true, discover: async () => [] }],
    });
    const evidence = persistSmokeEvidence({ provider, pressure, dataSource, dir });
    const latest = getLatestSmokeEvidence(dir);

    assert.equal(latest?.id, evidence.id);
    assert.equal(latest?.provider?.providers[0].status, "skipped");
    assert.equal(latest?.dataSource?.providers[0].provider, "ckan");
    assert.equal(latest?.pressure?.targets.some((target) => target.mode === "Deep"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

testUrlCanonicalization();
testBudgetLimits();
testBudgetNormalizerAcceptsUiStyleFields();
testProviderNormalization();
testDiscoveryCandidateNormalization();
await testDiscoveryProvidersRespectTopicIntent();
testAiProviderRouting();
testKaggleApiTokenEnablesDataProvider();
testFrontierPriorityScoring();
testExtractorRoutingAndTableExtraction();
testCredibilityAndEvidenceGraph();
testDefaultDiscoveryProvidersIncludeDataSources();
testPlannerClassifiesToolEvaluation();
testPlannerClassifiesDataResearch();
testPlannerClassifiesGenericDataResearch();
testResearchPlanningAgentExpandsTopicSpecificSubQuestions();
testPlannerClassifiesVerification();
testPlannerAddsSeedDomainQueries();
testPlannerHonorsResearchConstraints();
testReportGeneration();
testRSSSourceUrlValidation();
testResearchQueueNames();
testResearchSchemaCreatesReferencedTablesBeforeRelations();
testResearchStoreProtectsSchemaInitAndSanitizesCrawlerText();
testDocumentSearchUsesHybridFieldsBeyondContentText();
testResearchUiExplainsRunTransparencyAndProviderMeaning();
testDiscoveryIsBoundedAndObservable();
testStructuredResearchPlanPersistenceIsWired();
testResearchE2eUsesOfflineDiscoveryMode();
testUiSmokeDoesNotConsumeResearchQueues();
testExtractedTablePersistenceIsIdempotentAndVisible();
testEvidenceGraphUiIsWired();
testDocumentLinksArePersistentAndVisible();
testManualRunIterationControlsAreWired();
testRunClaimsApiIsWired();
testEvidenceFallbackAndGraphAreMeaningful();
testResearchRuntimeMonitorUiIsWired();
testSourceExplorerFetchDiagnosticsAreVisible();
testProviderPanelShowsDataSourceCoverage();
testFrontierScoreExplainabilityIsPersistedAndVisible();
testResearchCapabilityAuditSurfacesRealReadinessAndPressureTargets();
testResearchCapabilityAuditApiAndUiAreWired();
testAnalysisReportOnlyHandoffStaysSideEffectFree();
testAnalysisFullHandoffCarriesWizardMetadata();
testAnalysisContinueCrawlHandoffAddsFollowUpDiscovery();
testResearchAnalysisDecisionUiIsWired();
await testProviderLiveSmokeHandlesConfiguredAndMissingProviders();
testPressureSmokeExposesStandardAndDeepBudgets();
await testDataSourceLiveSmokeUsesPublicDiscoveryProviders();
testCapabilitySmokeApiAndUiAreWired();
await testResearchSampleAcceptanceUsesRealWorkerContract();
testEnhancedFetchSmokeExposesOptionalProviders();
await testSmokeEvidencePersistsLatestResult();

console.log("research tests passed");
