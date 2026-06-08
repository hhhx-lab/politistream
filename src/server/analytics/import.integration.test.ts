import assert from "assert";
import express from "express";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { createAnalyticsCompatibilityRouter, createAnalyticsRouter } from "./routes";
import { createNewsAnalysisRouter } from "./newsAnalysis";
import { closeAnalyticsStore } from "./store";
import { CrawlDocument, DiscoveryResult, FrontierItem, SearchCandidate } from "../research/types";

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "politistream-analytics-api-"));
process.env.ANALYTICS_STORE_FILE = path.join(tmpDir, "analytics-store.json");
process.env.ANALYTICS_ALLOW_LOCAL_FALLBACK = "true";
process.env.ANALYTICS_ARTIFACT_DIR = path.join(tmpDir, "artifacts");
process.env.ANALYTICS_USE_DOC_TOOLS = "false";
process.env.ANALYTICS_PYTHON_BIN = path.resolve("workers-analytics/.venv/bin/python");
process.env.ANALYTICS_WORKER_DIR = path.resolve("workers-analytics");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use("/api/analytics", createAnalyticsRouter({
  listDocumentsForRun: async (runId) => researchDocuments.filter((document) => document.runId === runId),
  listCandidatesForRun: async (runId) => researchCandidates.filter((candidate) => candidate.runId === runId),
  listFrontierForRun: async (runId) => researchFrontier.filter((item) => item.runId === runId),
  listProvidersForRun: async (runId) => researchProviders.filter((provider) => provider.runId === runId),
  fetchDataSource: async (url) => ({
    url,
    finalUrl: url,
    contentType: "text/csv",
    statusCode: 200,
    durationMs: 7,
    buffer: Buffer.from("tool,format,score\nPandoc,DOCX/PDF,9\nLibreOffice,DOCX/PDF,8\n", "utf-8"),
  }),
}));
app.use("/api", createAnalyticsCompatibilityRouter());
app.use("/api/news-analysis", createNewsAnalysisRouter({
  listDocumentsForRun: async (runId) => researchDocuments.filter((document) => document.runId === runId),
}));

const researchDocuments: CrawlDocument[] = [
  {
    id: "doc-1",
    jobId: "job-news",
    runId: "run-news",
    url: "https://reuters.example/world/doc-tool-market",
    canonicalUrl: "https://reuters.example/world/doc-tool-market",
    finalUrl: "https://reuters.example/world/doc-tool-market",
    title: "Pandoc and LibreOffice lead document conversion comparisons",
    domain: "reuters.example",
    contentText: "Pandoc, LibreOffice and CloudConvert are compared across DOCX, PDF and PPTX conversion quality.",
    depth: 1,
    status: "fetched",
    fetchedAt: "2026-06-07T08:00:00.000Z",
    memoryStatus: "fresh",
  },
  {
    id: "doc-2",
    jobId: "job-news",
    runId: "run-news",
    url: "https://ap.example/tools/pandoc-libreoffice",
    canonicalUrl: "https://ap.example/tools/pandoc-libreoffice",
    finalUrl: "https://ap.example/tools/pandoc-libreoffice",
    title: "Document conversion tools compared for research teams",
    domain: "ap.example",
    contentText: "Research teams compare Pandoc and LibreOffice for reproducible document workflows and batch conversion.",
    depth: 1,
    status: "fetched",
    fetchedAt: "2026-06-07T09:30:00.000Z",
    memoryStatus: "fresh",
  },
  {
    id: "doc-3",
    jobId: "job-news",
    runId: "run-news",
    url: "https://vendor.example/blog/file-converter",
    canonicalUrl: "https://vendor.example/blog/file-converter",
    finalUrl: "https://vendor.example/blog/file-converter",
    title: "Vendor guide to file conversion automation",
    domain: "vendor.example",
    contentText: "A vendor guide promotes online conversion automation and discusses enterprise document workflows.",
    depth: 2,
    status: "fetched",
    fetchedAt: "2026-06-08T10:00:00.000Z",
    memoryStatus: "fresh",
  },
];

const researchCandidates: SearchCandidate[] = [
  {
    id: "candidate-ckan",
    jobId: "job-news",
    runId: "run-news",
    provider: "ckan",
    query: "document conversion benchmark dataset",
    url: "https://catalog.data.gov/dataset/document-conversion-benchmark.csv",
    canonicalUrl: "https://catalog.data.gov/dataset/document-conversion-benchmark.csv",
    title: "Document conversion benchmark CSV",
    snippet: "Open data table for conversion benchmark scores.",
    depth: 0,
  },
  {
    id: "candidate-news",
    jobId: "job-news",
    runId: "run-news",
    provider: "brave",
    query: "document conversion news",
    url: "https://news.example/tools",
    canonicalUrl: "https://news.example/tools",
    title: "News article",
    snippet: "A normal article, not a data source.",
    depth: 0,
  },
];

const researchFrontier: FrontierItem[] = [
  {
    id: "frontier-ckan",
    jobId: "job-news",
    runId: "run-news",
    url: "https://catalog.data.gov/dataset/document-conversion-benchmark.csv",
    canonicalUrl: "https://catalog.data.gov/dataset/document-conversion-benchmark.csv",
    depth: 0,
    sourceType: "data-catalog",
    priorityScore: 0.91,
    status: "fetched",
    attempts: 1,
    queryId: "query-data",
    reason: "ckan:document conversion benchmark dataset",
  },
  {
    id: "frontier-worldbank",
    jobId: "job-news",
    runId: "run-news",
    url: "https://api.worldbank.org/v2/country/all/indicator/IT.NET.USER.ZS?format=json",
    canonicalUrl: "https://api.worldbank.org/v2/country/all/indicator/IT.NET.USER.ZS?format=json",
    depth: 0,
    sourceType: "structured-api",
    priorityScore: 0.87,
    status: "queued",
    attempts: 0,
    queryId: "query-api",
    reason: "worldbank internet users structured api",
  },
];

const researchProviders: DiscoveryResult[] = [
  {
    id: "provider-ckan",
    jobId: "job-news",
    runId: "run-news",
    provider: "ckan",
    providerType: "data-catalog",
    queryId: "query-data",
    candidateCount: 1,
    durationMs: 120,
    costUnits: 0,
  },
  {
    id: "provider-worldbank",
    jobId: "job-news",
    runId: "run-news",
    provider: "worldbank",
    providerType: "structured-api",
    queryId: "query-api",
    candidateCount: 1,
    durationMs: 80,
    costUnits: 0,
  },
];

const server = app.listen(0, "127.0.0.1");
const port = await new Promise<number>((resolve) => {
  server.on("listening", () => {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    resolve(address.port);
  });
});
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const csv = "group,season,score,date\nA,2026,12,2026-01-01\nA,2026,16,2026-01-02\nB,2026,9,2026-01-03\nB,2026,11,2026-01-04";
  const imported = await postJson("/api/analytics/datasets/import", {
    name: "CSV import integration",
    kind: "csv",
    contentText: csv,
  });

  assert.equal(imported.dataset.rowCount, 4);
  assert.equal(imported.dataset.rows, undefined);
  assert.equal(imported.dataset.metadata.storage.fullRowCount, 4);
  assert.equal(imported.dataset.metadata.storage.rowStorage, "local-json");
  assert.equal(imported.extracted.extractor, "csv");
  assert.equal(imported.extracted.tables.length, 1);

  const transform = await postJson(`/api/analytics/datasets/${imported.dataset.id}/analyze`, {
    kind: "data-transformation",
  });
  assert.equal(transform.job.kind, "data-transformation");
  assert.equal(transform.job.status, "succeeded");
  assert.ok(transform.worker.result.operations.groupby);
  assert.ok(transform.worker.result.operations.pivot);
  assert.ok(transform.worker.result.operations.rolling);
  assert.ok(transform.worker.result.engineAcceleration);
  assert.ok(transform.worker.result.lineage.processingEngines.includes("pandas"));

  const bigRows = Array.from({ length: 620 }, (_, index) => `G${index % 4},2026,${index},2026-02-${String((index % 20) + 1).padStart(2, "0")}`);
  const bigImported = await postJson("/api/analytics/datasets/import", {
    name: "Full row storage integration",
    kind: "csv",
    contentText: `group,season,score,date\n${bigRows.join("\n")}`,
  });
  assert.equal(bigImported.dataset.rowCount, 620);
  assert.equal(bigImported.dataset.sampleRows.length, 500);
  const bigTransform = await postJson(`/api/analytics/datasets/${bigImported.dataset.id}/analyze`, {
    kind: "data-transformation",
  });
  assert.equal(bigTransform.worker.result.rowCount, 620);
  assert.equal(bigTransform.worker.result.lineage.sourceRows, 620);

  const exported = await postJson(`/api/analytics/datasets/${imported.dataset.id}/analyze`, {
    kind: "export-report",
  });
  const files = exported.worker.result.files;
  assert.ok(files.md);
  assert.ok(files.docx);
  assert.ok(files.pdf);
  assert.ok(files.pptx);

  const download = await fetch(`${baseUrl}/api/analytics/artifact-files?path=${encodeURIComponent(files.pptx)}`);
  assert.equal(download.status, 200);
  assert.ok((await download.arrayBuffer()).byteLength > 200);

  const exportedPdf = await readFile(files.pdf);
  const pdfImport = await postJson("/api/analytics/datasets/import", {
    name: "PDF import integration",
    kind: "pdf",
    contentBase64: exportedPdf.toString("base64"),
  });
  assert.equal(pdfImport.extracted.extractor, "pdf");
  assert.ok(pdfImport.dataset.rowCount >= 1);
  assert.ok(pdfImport.extracted.metadata.tableExtraction);

  const compatibilityDataset = await postJson("/api/datasets", {
    name: "Compatibility dataset",
    rows: [
      { group: "A", score: 5 },
      { group: "B", score: 7 },
    ],
  });
  assert.equal(compatibilityDataset.dataset.rowCount, 2);

  const listedDatasets = await getJson("/api/datasets");
  assert.ok(listedDatasets.datasets.some((dataset: any) => dataset.id === compatibilityDataset.dataset.id));

  const compatibilityProfile = await postJson(`/api/datasets/${compatibilityDataset.dataset.id}/profile`, {}, 201);
  assert.equal(compatibilityProfile.datasetId, compatibilityDataset.dataset.id);

  const compatibilityValidation = await postJson(`/api/datasets/${compatibilityDataset.dataset.id}/validate`, {}, 200);
  assert.ok(compatibilityValidation.profile);
  assert.ok(Array.isArray(compatibilityValidation.warnings));

  const compatibilityClean = await postJson(`/api/datasets/${compatibilityDataset.dataset.id}/clean`, {}, 201);
  assert.equal(compatibilityClean.job.kind, "data-cleaning");

  const compatibilityQuery = await postJson(`/api/datasets/${compatibilityDataset.dataset.id}/query`, {
    select: ["group", "score"],
    limit: 1,
  }, 200);
  assert.equal(compatibilityQuery.rows.length, 1);

  const analysisJob = await postJson("/api/analysis/jobs", {
    datasetId: compatibilityDataset.dataset.id,
    kind: "descriptive-statistics",
  });
  assert.equal(analysisJob.job.kind, "descriptive-statistics");
  assert.equal(analysisJob.job.status, "succeeded");

  const analysisJobs = await getJson("/api/analysis/jobs");
  assert.ok(analysisJobs.jobs.some((job: any) => job.id === analysisJob.job.id));

  const analysisJobDetail = await getJson(`/api/analysis/jobs/${analysisJob.job.id}`);
  assert.equal(analysisJobDetail.job.id, analysisJob.job.id);

  const visualization = await postJson("/api/visualizations", {
    datasetId: compatibilityDataset.dataset.id,
    title: "Compatibility chart",
  });
  assert.equal(visualization.artifact.datasetId, compatibilityDataset.dataset.id);

  const visualizationDetail = await getJson(`/api/visualizations/${visualization.storedArtifact.id}`);
  assert.equal(visualizationDetail.artifact.id, visualization.storedArtifact.id);

  const report = await postJson("/api/reports", {
    datasetId: compatibilityDataset.dataset.id,
    format: "md",
  });
  assert.equal(report.job.kind, "export-report");
  assert.ok(report.worker.result.files.md);

  const reportDetail = await getJson(`/api/reports/${report.artifact.id}`);
  assert.equal(reportDetail.artifact.id, report.artifact.id);

  const newsCluster = await postJson("/api/news-analysis/runs/run-news/cluster", {}, 201);
  assert.equal(newsCluster.dataset.sourceKind, "research-run");
  assert.equal(newsCluster.dataset.sourceRef, "run-news");
  assert.equal(newsCluster.job.kind, "news-organization");
  assert.ok(Array.isArray(newsCluster.clusters));
  assert.ok(newsCluster.clusters.length >= 1);
  assert.equal(typeof newsCluster.duplicateCount, "number");

  const newsTimeline = await postJson("/api/news-analysis/runs/run-news/timeline", {}, 201);
  assert.ok(Array.isArray(newsTimeline.timeline));
  assert.ok(newsTimeline.timeline.length >= 1);
  assert.equal(newsTimeline.timeline[0].date, "2026-06-07T08:00:00.000Z");

  const newsSourceQuality = await postJson("/api/news-analysis/runs/run-news/source-quality", {}, 201);
  assert.ok(Array.isArray(newsSourceQuality.sourceProfiles));
  assert.ok(newsSourceQuality.sourceProfiles.some((source: any) => source.domain === "reuters.example" || source.source === "reuters.example"));
  assert.equal(newsSourceQuality.dataset.metadata.analysisEndpoint, "/api/news-analysis/runs/:runId/source-quality");

  const dataSources = await postJson("/api/analytics/datasets/from-research-run/run-news/data-sources", {
    name: "Research data source candidates",
  }, 201);
  assert.equal(dataSources.dataset.sourceKind, "research-data-source");
  assert.equal(dataSources.dataset.sourceRef, "run-news");
  assert.equal(dataSources.dataset.rowCount, 2);
  assert.equal(dataSources.summary.dataSourceCount, 2);
  assert.ok(dataSources.summary.providerTypes.includes("data-catalog"));
  assert.ok(dataSources.summary.providerTypes.includes("structured-api"));
  assert.equal(dataSources.dataset.sampleRows[0].format_hint, "csv");
  assert.equal(dataSources.dataset.sampleRows[0].materialize_readiness, "ready");
  assert.equal(dataSources.dataset.sampleRows[0].dataset_quality_tier, "A");
  assert.ok(Number(dataSources.dataset.sampleRows[0].source_quality_score) > 0.85);
  assert.ok(String(dataSources.dataset.sampleRows[0].lineage_json).includes("frontier-ckan"));

  const materialized = await postJson(`/api/analytics/datasets/${dataSources.dataset.id}/materialize-source`, {
    rowIndex: 0,
    name: "Materialized benchmark data",
  }, 201);
  assert.equal(materialized.dataset.sourceKind, "materialized-data-source");
  assert.equal(materialized.dataset.sourceRef, "https://catalog.data.gov/dataset/document-conversion-benchmark.csv");
  assert.equal(materialized.dataset.rowCount, 2);
  assert.equal(materialized.dataset.sampleRows[0].tool, "Pandoc");
  assert.equal(materialized.fetched.contentType, "text/csv");
  assert.equal(materialized.extracted.extractor, "csv");
  assert.equal(materialized.dataset.metadata.materializedFromDatasetId, dataSources.dataset.id);

  const refreshedMaterialized = await postJson(`/api/analytics/datasets/${materialized.dataset.id}/refresh-materialized-source`, {
    name: "Materialized benchmark data refresh",
  }, 201);
  assert.equal(refreshedMaterialized.dataset.sourceKind, "materialized-data-source");
  assert.equal(refreshedMaterialized.dataset.metadata.refreshOfDatasetId, materialized.dataset.id);
  assert.equal(refreshedMaterialized.dataset.metadata.refreshRootDatasetId, materialized.dataset.id);
  assert.equal(refreshedMaterialized.dataset.metadata.materializedVersion, 2);
  assert.equal(refreshedMaterialized.refresh.version, 2);
  assert.equal(refreshedMaterialized.dataset.sampleRows[0].tool, "Pandoc");

  const batchMaterialized = await postJson(`/api/analytics/datasets/${dataSources.dataset.id}/materialize-sources`, {
    limit: 2,
    namePrefix: "Batch materialized benchmark",
  }, 207);
  assert.equal(batchMaterialized.summary.requested, 2);
  assert.equal(batchMaterialized.summary.succeeded, 2);
  assert.equal(batchMaterialized.summary.failed, 0);
  assert.equal(batchMaterialized.results.length, 2);
  assert.ok(batchMaterialized.results.every((result: any) => result.ok === true));
  assert.equal(batchMaterialized.results[0].dataset.sourceKind, "materialized-data-source");
  assert.equal(batchMaterialized.results[0].dataset.metadata.materializedBatch, true);

  console.log("analytics import integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeAnalyticsStore();
  await rm(tmpDir, { recursive: true, force: true });
}

async function postJson(pathname: string, body: Record<string, unknown>, expectedStatus = 201) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(data));
  return data;
}

async function getJson(pathname: string, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  assert.equal(response.status, expectedStatus, JSON.stringify(data));
  return data;
}
