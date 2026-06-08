import assert from "assert";
import { readFileSync } from "fs";
import { computeDescriptiveStatistics, getAnalyticsCapabilities, profileRows, suggestVisualizations } from "./engine";
import { buildAnalyticsWorkerCommand } from "./workerRunner";
import { renderVisualizationArtifact } from "./visualization";
import { normalizeAnalysisKind, workerCommandForKind } from "./jobs";
import { resolveAnalyticsArtifactFile } from "./routes";
import { buildResearchDataSourceRows, scoreDataSourceQuality } from "./researchDataSources";
import { inferMaterializeKind, selectDataSourceRow, selectDataSourceRows, sourceRowFromMaterializedDataset, validateMaterializeUrl } from "./sourceMaterializer";
import { extractPdfTextTables } from "../research/extractors/pdfExtractor";

function testCapabilityCatalog() {
  const capabilities = getAnalyticsCapabilities();
  assert.ok(capabilities.find((capability) => capability.id === "dataset-profile"));
  assert.ok(capabilities.find((capability) => capability.id === "visualization-studio"));
  assert.ok(capabilities.find((capability) => capability.engines.includes("PyTorch")));
}

function testProfileRows() {
  const profile = profileRows({
    rows: [
      { source: "Reuters", count: 12, date: "2026-06-01" },
      { source: "AP", count: 8, date: "2026-06-02" },
      { source: "BBC", count: "", date: "2026-06-03" },
    ],
  });

  assert.equal(profile.rowCount, 3);
  assert.equal(profile.columnCount, 3);
  assert.equal(profile.columns.find((column) => column.name === "count")?.inferredType, "number");
  assert.equal(profile.columns.find((column) => column.name === "date")?.inferredType, "date");
  assert.ok(profile.qualityScore < 1);
  assert.ok(profile.warnings.some((warning) => warning.includes("count")));
}

function testVisualizationSuggestions() {
  const profile = profileRows({
    rows: [
      { source: "Reuters", count: 12, date: "2026-06-01" },
      { source: "AP", count: 8, date: "2026-06-02" },
    ],
  });
  const suggestions = suggestVisualizations(profile);
  assert.ok(suggestions.find((suggestion) => suggestion.kind === "bar"));
  assert.ok(suggestions.find((suggestion) => suggestion.kind === "line"));
  assert.ok(suggestions.every((suggestion) => suggestion.exportFormats.length > 0));
}

function testDescriptiveStatistics() {
  const stats = computeDescriptiveStatistics({
    rows: [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ],
  });
  assert.equal(stats.numericColumns.find((column) => column.name === "x")?.mean, 2);
  assert.equal(stats.numericColumns.find((column) => column.name === "y")?.median, 4);
  assert.ok(stats.numericColumns.find((column) => column.name === "x")?.standardError);
  assert.equal(stats.numericColumns.find((column) => column.name === "x")?.confidenceInterval95?.length, 2);
  assert.equal(Math.round((stats.correlations[0]?.correlation ?? 0) * 100), 100);
}

function testAnalyticsWorkerCommand() {
  const command = buildAnalyticsWorkerCommand({
    command: "stats",
    inputPath: "/tmp/politistream-input.json",
    outputPath: "/tmp/politistream-output.json",
    env: {
      ANALYTICS_PYTHON_BIN: "/envs/politistream/bin/python",
      ANALYTICS_WORKER_DIR: "/workspace/workers-analytics",
    },
  });

  assert.equal(command.file, "/envs/politistream/bin/python");
  assert.equal(command.cwd, "/workspace/workers-analytics");
  assert.deepEqual(command.args, [
    "-m",
    "politistream_analytics.worker",
    "stats",
    "--input",
    "/tmp/politistream-input.json",
    "--output",
    "/tmp/politistream-output.json",
  ]);
}

function testAnalyticsJobKindMapping() {
  assert.equal(normalizeAnalysisKind("quality"), "quality-report");
  assert.equal(normalizeAnalysisKind("quality-report"), "quality-report");
  assert.equal(normalizeAnalysisKind("regression"), "linear-regression");
  assert.equal(normalizeAnalysisKind("linear-regression"), "linear-regression");
  assert.equal(normalizeAnalysisKind("cluster"), "cluster-analysis");
  assert.equal(normalizeAnalysisKind("cluster-analysis"), "cluster-analysis");
  assert.equal(normalizeAnalysisKind("report"), "report-draft");
  assert.equal(normalizeAnalysisKind("report-draft"), "report-draft");

  assert.equal(workerCommandForKind("quality-report"), "quality");
  assert.equal(workerCommandForKind("crosstab"), "crosstab");
  assert.equal(workerCommandForKind("linear-regression"), "regression");
  assert.equal(workerCommandForKind("cluster-analysis"), "cluster");
  assert.equal(workerCommandForKind("report-draft"), "report");

  assert.equal(normalizeAnalysisKind("frequency"), "frequency-tables");
  assert.equal(normalizeAnalysisKind("statistical-tests"), "statistical-tests");
  assert.equal(normalizeAnalysisKind("anova"), "statistical-tests");
  assert.equal(normalizeAnalysisKind("logistic-regression"), "logistic-regression");
  assert.equal(normalizeAnalysisKind("poisson-regression"), "poisson-regression");
  assert.equal(normalizeAnalysisKind("pca"), "dimensionality-reduction");
  assert.equal(normalizeAnalysisKind("factor-analysis"), "dimensionality-reduction");
  assert.equal(normalizeAnalysisKind("anomaly"), "anomaly-detection");
  assert.equal(normalizeAnalysisKind("time-series"), "time-series-analysis");
  assert.equal(normalizeAnalysisKind("transform"), "data-transformation");
  assert.equal(normalizeAnalysisKind("groupby"), "data-transformation");
  assert.equal(normalizeAnalysisKind("pivot-table"), "data-transformation");
  assert.equal(normalizeAnalysisKind("cleaning"), "data-cleaning");
  assert.equal(normalizeAnalysisKind("news"), "news-organization");
  assert.equal(normalizeAnalysisKind("publication-chart"), "publication-chart");
  assert.equal(normalizeAnalysisKind("export-report"), "export-report");
  assert.equal(normalizeAnalysisKind("text"), "text-analysis");
  assert.equal(normalizeAnalysisKind("embedding"), "text-analysis");
  assert.equal(normalizeAnalysisKind("topic-modeling"), "text-analysis");
  assert.equal(normalizeAnalysisKind("explain"), "model-explanation");
  assert.equal(normalizeAnalysisKind("deep-learning"), "deep-learning-analysis");
  assert.equal(normalizeAnalysisKind("pytorch"), "deep-learning-analysis");
  assert.equal(normalizeAnalysisKind("geospatial"), "geospatial-analysis");

  assert.equal(workerCommandForKind("frequency-tables"), "frequency");
  assert.equal(workerCommandForKind("statistical-tests"), "tests");
  assert.equal(workerCommandForKind("logistic-regression"), "logistic");
  assert.equal(workerCommandForKind("poisson-regression"), "poisson");
  assert.equal(workerCommandForKind("dimensionality-reduction"), "dimension");
  assert.equal(workerCommandForKind("anomaly-detection"), "anomaly");
  assert.equal(workerCommandForKind("time-series-analysis"), "timeseries");
  assert.equal(workerCommandForKind("data-transformation"), "transform");
  assert.equal(workerCommandForKind("data-cleaning"), "cleaning");
  assert.equal(workerCommandForKind("news-organization"), "news");
  assert.equal(workerCommandForKind("publication-chart"), "chart");
  assert.equal(workerCommandForKind("export-report"), "export");
  assert.equal(workerCommandForKind("text-analysis"), "text");
  assert.equal(workerCommandForKind("model-explanation"), "explain");
  assert.equal(workerCommandForKind("deep-learning-analysis"), "deepml");
  assert.equal(workerCommandForKind("geospatial-analysis"), "geo");
}

function testPlanCapabilitiesAreSurfaced() {
  const capabilities = getAnalyticsCapabilities();
  const required = [
    "news-story-clustering",
    "data-transformation-lineage",
    "spss-statistics",
    "ml-pytorch",
    "visualization-studio",
    "reproducible-reporting",
  ];
  for (const id of required) {
    const capability = capabilities.find((item) => item.id === id);
    assert.ok(capability, `${id} should be listed`);
    assert.notEqual(capability?.status, "planned", `${id} should no longer be hidden as a plan-only capability`);
  }
}

function testVisualizationArtifact() {
  const rows = [
    { source: "Reuters", count: 12 },
    { source: "AP", count: 8 },
  ];
  const [suggestion] = suggestVisualizations(profileRows({ rows }));
  const artifact = renderVisualizationArtifact({
    rows,
    suggestion,
    title: "来源报道数量",
    datasetId: "dataset-1",
  });

  assert.equal(artifact.kind, "bar");
  assert.equal(artifact.engine, "echarts");
  assert.equal(artifact.datasetId, "dataset-1");
  assert.equal(artifact.dataLineage.rowCount, 2);
  assert.ok(artifact.reproducibleCode.includes("source"));
  assert.deepEqual((artifact.spec as any).xAxis.data, ["Reuters", "AP"]);
  assert.deepEqual((artifact.spec as any).series[0].data, [12, 8]);
}

function testArtifactFileResolution() {
  const safe = resolveAnalyticsArtifactFile({
    artifactDir: "/tmp/politistream-artifacts",
    requestedPath: "/tmp/politistream-artifacts/report.md",
  });
  assert.equal(safe.allowed, true);
  assert.equal(safe.path, "/tmp/politistream-artifacts/report.md");

  const unsafe = resolveAnalyticsArtifactFile({
    artifactDir: "/tmp/politistream-artifacts",
    requestedPath: "/tmp/other/secret.env",
  });
  assert.equal(unsafe.allowed, false);
}

function testPdfTextTableExtraction() {
  const tables = extractPdfTextTables([
    "Tool  Format  Score",
    "Pandoc  DOCX/PDF  9",
    "LibreOffice  DOCX/PDF/PPTX  8",
    "",
    "plain sentence without table",
  ].join("\n"));
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["Tool", "Format", "Score"]);
  assert.equal(tables[0].rows[0][0], "Pandoc");
}

function testDataLabSurfacesAdvancedTools() {
  const source = readFileSync("src/components/DataLab.tsx", "utf-8");
  for (const kind of [
    "frequency-tables",
    "statistical-tests",
    "logistic-regression",
    "poisson-regression",
    "dimensionality-reduction",
    "anomaly-detection",
    "time-series-analysis",
    "data-transformation",
    "data-cleaning",
    "news-organization",
    "text-analysis",
    "model-explanation",
    "deep-learning-analysis",
    "geospatial-analysis",
    "publication-chart",
    "export-report",
  ]) {
    assert.ok(source.includes(`kind: '${kind}'`), `Data Lab should expose ${kind}`);
  }
  assert.ok(source.includes("/api/analytics/artifact-files"), "Data Lab should expose downloadable artifact files");
  assert.ok(source.includes("/api/analytics/datasets/import"), "Data Lab should expose multi-format imports");
  assert.ok(source.includes("Postgres 数据集"), "Data Lab should label Postgres-backed datasets");
  assert.ok(source.includes("sampleLimit"), "Data Lab should surface localized preview row limits");
  assert.ok(source.includes("95% CI"), "Data Lab should surface confidence intervals");
  assert.ok(source.includes('type="file"'), "Data Lab should expose a real file input");
  assert.ok(source.includes("FileReader"), "Data Lab should read selected files in the browser");
  assert.ok(source.includes("contentBase64"), "Data Lab should send binary imports as base64");
  assert.ok(source.includes("contentText"), "Data Lab should send text imports as text");
  assert.ok(source.includes("'pptx'"), "Data Lab should expose PPTX import/export-adjacent formats");
  assert.ok(source.includes("API 接口面"), "Data Lab should surface the compatibility API panel");
  assert.ok(source.includes("/api/datasets"), "Data Lab should surface dataset compatibility endpoints");
  assert.ok(source.includes("数据集操作台"), "Data Lab should expose a dataset operations workbench");
  assert.ok(source.includes("/api/datasets/${datasetId}/validate"), "Data Lab should call the dataset validation compatibility endpoint");
  assert.ok(source.includes("/api/datasets/${datasetId}/clean"), "Data Lab should call the dataset cleaning compatibility endpoint");
  assert.ok(source.includes("/api/datasets/${datasetId}/query"), "Data Lab should call the dataset query compatibility endpoint");
  assert.ok(source.includes("runDatasetValidation"), "Data Lab should wire a dedicated validation action");
  assert.ok(source.includes("runDatasetCleaning"), "Data Lab should wire a dedicated cleaning action");
  assert.ok(source.includes("runDatasetQuery"), "Data Lab should wire a dedicated query action");
  assert.ok(source.includes("任务操作"), "Data Lab should expose analysis job actions");
  assert.ok(source.includes("/api/analysis/jobs/${job.id}/run"), "Data Lab should call the analysis job rerun compatibility endpoint");
  assert.ok(source.includes("/api/analysis/jobs/${job.id}/cancel"), "Data Lab should call the analysis job cancel compatibility endpoint");
  assert.ok(source.includes("rerunAnalysisJob"), "Data Lab should wire a dedicated job rerun action");
  assert.ok(source.includes("cancelAnalysisJob"), "Data Lab should wire a dedicated job cancel action");
  assert.ok(source.includes("导出资产"), "Data Lab should expose artifact export actions");
  assert.ok(source.includes("/api/visualizations/${artifact.id}/export"), "Data Lab should call visualization export compatibility endpoint");
  assert.ok(source.includes("/api/reports/${artifact.id}/export"), "Data Lab should call report export compatibility endpoint");
  assert.ok(source.includes("exportAnalyticsArtifact"), "Data Lab should wire a dedicated artifact export action");
  assert.ok(source.includes("数据源资产清单"), "Data Lab should explain research data source datasets");
  assert.ok(source.includes("数据源筛选"), "Data Lab should expose data source filters");
  assert.ok(source.includes("来源质量"), "Data Lab should expose data source quality scoring");
  assert.ok(source.includes("可导入性"), "Data Lab should expose data source materialization readiness");
  assert.ok(source.includes("导入数据快照"), "Data Lab should expose data source materialization");
  assert.ok(source.includes("/api/analytics/datasets/${dataset.id}/materialize-source"), "Data Lab should call data source materialization endpoint");
  assert.ok(source.includes("批量导入前 8 个"), "Data Lab should expose batch data source materialization");
  assert.ok(source.includes("/api/analytics/datasets/${dataset.id}/materialize-sources"), "Data Lab should call batch data source materialization endpoint");
  assert.ok(source.includes("刷新数据源快照"), "Data Lab should expose materialized source refresh");
  assert.ok(source.includes("/api/analytics/datasets/${selectedDataset.id}/refresh-materialized-source"), "Data Lab should call materialized source refresh endpoint");
  assert.ok(source.includes("快照版本"), "Data Lab should render materialized snapshot version");
  assert.ok(source.includes("版本历史"), "Data Lab should render materialized snapshot version history");
  assert.ok(source.includes("已定位 Research 数据源上下文"), "Data Lab should acknowledge focused Research data-source context");
  assert.ok(source.includes("回到 Research run"), "Data Lab should link back to the associated Research run");
  assert.ok(source.includes("runIdFromDataset"), "Data Lab should resolve Research run lineage from datasets");
  assert.ok(source.includes("ANALYTICS_SOURCE_ALLOW_PRIVATE_NETWORKS"), "Data Lab should explain the private-network source policy");
  assert.ok(source.includes("/api/analysis/jobs"), "Data Lab should surface analysis job compatibility endpoints");
  assert.ok(source.includes("/api/visualizations"), "Data Lab should surface visualization compatibility endpoints");
  assert.ok(source.includes("/api/reports"), "Data Lab should surface report compatibility endpoints");

  const smokeSource = readFileSync("scripts/ui-smoke.mjs", "utf-8");
  assert.ok(smokeSource.includes("/api/datasets/.*/validate"), "Playwright smoke should mock dataset validation");
  assert.ok(smokeSource.includes("/api/datasets/.*/clean"), "Playwright smoke should mock dataset cleaning");
  assert.ok(smokeSource.includes("/api/datasets/.*/query"), "Playwright smoke should mock dataset query");
  assert.ok(smokeSource.includes("运行质量校验"), "Playwright smoke should assert validation controls");
  assert.ok(smokeSource.includes("执行清洗"), "Playwright smoke should assert cleaning controls");
  assert.ok(smokeSource.includes("字段查询"), "Playwright smoke should assert query controls");
  assert.ok(smokeSource.includes("/api/analysis/jobs/.*/run"), "Playwright smoke should mock analysis job rerun");
  assert.ok(smokeSource.includes("/api/analysis/jobs/.*/cancel"), "Playwright smoke should mock analysis job cancel");
  assert.ok(smokeSource.includes("/api/visualizations/.*/export"), "Playwright smoke should mock visualization export");
  assert.ok(smokeSource.includes("/api/reports/.*/export"), "Playwright smoke should mock report export");
  assert.ok(smokeSource.includes("重跑任务"), "Playwright smoke should assert job rerun controls");
  assert.ok(smokeSource.includes("取消任务"), "Playwright smoke should assert job cancel controls");
  assert.ok(smokeSource.includes("导出资产"), "Playwright smoke should assert artifact export controls");
  assert.ok(smokeSource.includes("/api/analytics/datasets/from-research-run/smoke-run/data-sources"), "Playwright smoke should mock research data source dataset export");
  assert.ok(smokeSource.includes("生成 Data Lab 数据源清单"), "Playwright smoke should assert data source registry export controls");
  assert.ok(smokeSource.includes("已定位 Research 数据源上下文"), "Playwright smoke should assert Research-to-Data-Lab focused navigation");
  assert.ok(smokeSource.includes("回到 Research run"), "Playwright smoke should assert Data-Lab-to-Research navigation");
  assert.ok(smokeSource.includes("数据源筛选"), "Playwright smoke should assert data source filters");
  assert.ok(smokeSource.includes("来源质量"), "Playwright smoke should assert source quality output");
  assert.ok(smokeSource.includes("/api/analytics/datasets/smoke-data-source-dataset/materialize-source"), "Playwright smoke should mock data source materialization");
  assert.ok(smokeSource.includes("/api/analytics/datasets/smoke-data-source-dataset/materialize-sources"), "Playwright smoke should mock batch data source materialization");
  assert.ok(smokeSource.includes("/api/analytics/datasets/materialized-smoke-dataset/refresh-materialized-source"), "Playwright smoke should mock materialized source refresh");
  assert.ok(smokeSource.includes("批量导入前 8 个"), "Playwright smoke should assert batch data source materialization controls");
  assert.ok(smokeSource.includes("批量快照完成"), "Playwright smoke should assert batch data source materialization feedback");
  assert.ok(smokeSource.includes("刷新数据源快照"), "Playwright smoke should assert materialized source refresh controls");
  assert.ok(smokeSource.includes("数据源快照已刷新"), "Playwright smoke should assert materialized source refresh feedback");
  assert.ok(smokeSource.includes("数据源快照已导入"), "Playwright smoke should assert data source materialization feedback");
}

function testResearchDataSourceRows() {
  const { rows, summary } = buildResearchDataSourceRows({
    runId: "run-data",
    candidates: [
      {
        id: "candidate-data",
        jobId: "job-data",
        runId: "run-data",
        provider: "ckan",
        query: "climate dataset",
        url: "https://catalog.data.gov/dataset/climate.csv",
        canonicalUrl: "https://catalog.data.gov/dataset/climate.csv",
        title: "Climate CSV dataset",
        snippet: "Open data license mentioned",
        depth: 0,
      },
      {
        id: "candidate-web",
        jobId: "job-data",
        runId: "run-data",
        provider: "brave",
        query: "climate news",
        url: "https://news.example/climate",
        canonicalUrl: "https://news.example/climate",
        title: "Climate news",
        snippet: "Not a dataset",
        depth: 0,
      },
    ],
    frontier: [
      {
        id: "frontier-data",
        jobId: "job-data",
        runId: "run-data",
        url: "https://catalog.data.gov/dataset/climate.csv",
        canonicalUrl: "https://catalog.data.gov/dataset/climate.csv",
        depth: 0,
        sourceType: "data-catalog",
        priorityScore: 0.93,
        status: "fetched",
        attempts: 1,
        queryId: "query-data",
        reason: "ckan:climate dataset",
      },
      {
        id: "frontier-api",
        jobId: "job-data",
        runId: "run-data",
        url: "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json",
        canonicalUrl: "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json",
        depth: 0,
        sourceType: "structured-api",
        priorityScore: 0.88,
        status: "queued",
        attempts: 0,
        queryId: "query-api",
        reason: "worldbank population api",
      },
    ],
    providers: [
      {
        id: "provider-data",
        jobId: "job-data",
        runId: "run-data",
        provider: "ckan",
        providerType: "data-catalog",
        queryId: "query-data",
        candidateCount: 1,
        durationMs: 120,
        costUnits: 0,
      },
      {
        id: "provider-api",
        jobId: "job-data",
        runId: "run-data",
        provider: "worldbank",
        providerType: "structured-api",
        queryId: "query-api",
        candidateCount: 1,
        durationMs: 80,
        costUnits: 0,
      },
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Climate CSV dataset");
  assert.equal(rows[0].provider_type, "data-catalog");
  assert.equal(rows[0].format_hint, "csv");
  assert.equal(rows[0].access_mode, "download");
  assert.equal(rows[0].materialize_readiness, "ready");
  assert.equal(rows[0].dataset_quality_tier, "A");
  assert.ok(Number(rows[0].source_quality_score) > 0.85);
  assert.ok(String(rows[0].quality_reason).includes("provider:data-catalog"));
  assert.ok(String(rows[0].lineage_json).includes("frontier-data"));
  assert.equal(rows[1].provider_type, "structured-api");
  assert.equal(rows[1].access_mode, "api");
  assert.equal(rows[1].materialize_readiness, "ready");
  assert.equal(summary.dataSourceCount, 2);
  assert.deepEqual(summary.providerTypes.sort(), ["data-catalog", "structured-api"]);

  const platformScore = scoreDataSourceQuality({
    priority_score: 0.7,
    provider_type: "competition-data",
    access_mode: "platform",
    format_hint: "unknown",
    license_hint: "platform-specific",
    status: "candidate",
  });
  assert.equal(platformScore.materialize_readiness, "platform-auth");
  assert.ok(platformScore.source_quality_score < Number(rows[0].source_quality_score));
}

function testDataSourceMaterializerHelpers() {
  const dataset = {
    id: "registry-dataset",
    name: "Registry",
    sourceKind: "research-data-source" as const,
    sourceRef: "run-data",
    rowCount: 2,
    columnCount: 8,
    sampleRows: [
      {
        title: "Climate CSV",
        url: "https://catalog.example/climate.csv",
        format_hint: "csv",
      },
      {
        title: "World Bank JSON",
        url: "https://api.worldbank.org/v2/country/all?format=json",
        format_hint: "unknown",
      },
    ],
    metadata: {},
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
  assert.equal(selectDataSourceRow(dataset, 1).title, "World Bank JSON");
  assert.equal(selectDataSourceRow(dataset, 0, "https://catalog.example/climate.csv").title, "Climate CSV");
  assert.deepEqual(selectDataSourceRows(dataset, [1, 0, 1], 3).map((item) => item.rowIndex), [1, 0]);
  assert.deepEqual(selectDataSourceRows(dataset, undefined, 1).map((item) => item.rowIndex), [0]);
  assert.equal(inferMaterializeKind(dataset.sampleRows[0], "text/plain", "https://fallback.example/file.txt"), "csv");
  assert.equal(inferMaterializeKind(dataset.sampleRows[1], "application/json", "https://api.example/data"), "json");
  assert.equal(validateMaterializeUrl("https://catalog.example/data.csv").hostname, "catalog.example");
  assert.throws(() => validateMaterializeUrl("ftp://catalog.example/data.csv"), /unsupported_data_source_protocol/);
  assert.throws(() => validateMaterializeUrl("http://localhost:8080/data.csv"), /private_network_data_source_blocked/);
  assert.equal(validateMaterializeUrl("http://localhost:8080/data.csv", { allowPrivateNetworks: true }).hostname, "localhost");
  assert.equal(sourceRowFromMaterializedDataset({
    ...dataset,
    id: "materialized-dataset",
    sourceKind: "materialized-data-source" as const,
    sourceRef: "https://catalog.example/climate.csv",
    metadata: { sourceRow: dataset.sampleRows[0] },
  }).title, "Climate CSV");
  assert.equal(sourceRowFromMaterializedDataset({
    ...dataset,
    id: "materialized-fallback",
    sourceKind: "materialized-data-source" as const,
    sourceRef: "https://catalog.example/fallback.csv",
    metadata: { kind: "csv" },
  }).url, "https://catalog.example/fallback.csv");
  assert.throws(() => selectDataSourceRow({ ...dataset, sourceKind: "manual" as const }, 0), /dataset_is_not_research_data_source_registry/);
}

testCapabilityCatalog();
testProfileRows();
testVisualizationSuggestions();
testDescriptiveStatistics();
testAnalyticsWorkerCommand();
testAnalyticsJobKindMapping();
testPlanCapabilitiesAreSurfaced();
testVisualizationArtifact();
testArtifactFileResolution();
testPdfTextTableExtraction();
testDataLabSurfacesAdvancedTools();
testResearchDataSourceRows();
testDataSourceMaterializerHelpers();

console.log("analytics tests passed");
