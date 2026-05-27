import assert from "assert";
import { normalizeRSSSourceUrl } from "../db";
import { normalizeResearchBudget, createRunBudgetState, canAcceptUrlForRun, recordAcceptedUrl } from "./budget";
import { generateMarkdownReport } from "./reports";
import { normalizeBraveResults, normalizeSerpApiResults, normalizeTavilyResults } from "./searchProviders";
import { canonicalizeUrl } from "./url";

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

testUrlCanonicalization();
testBudgetLimits();
testProviderNormalization();
testReportGeneration();
testRSSSourceUrlValidation();

console.log("research tests passed");
