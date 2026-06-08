import { randomUUID } from "crypto";
import { researchDocumentsToNewsRows } from "../../analytics/newsAnalysis";
import { runAnalyticsWorker } from "../../analytics/workerRunner";
import { AnalyticsWorkerCommandName, AnalyticsWorkerRunResult } from "../../analytics/types";
import { CrawlDocument } from "../types";

export type ResearchSampleAcceptanceKind = "news-trace" | "data-processing";

export interface ResearchSampleAcceptanceCheck {
  id: string;
  label: string;
  status: "passed" | "failed";
  detail: string;
  metric?: string | number;
}

export interface ResearchSampleAcceptanceResult {
  id: string;
  kind: ResearchSampleAcceptanceKind;
  label: string;
  generatedAt: string;
  durationMs: number;
  status: "passed" | "failed";
  checks: ResearchSampleAcceptanceCheck[];
  commands: string[];
}

type AnalyticsRunner = typeof runAnalyticsWorker;

export async function runResearchSampleAcceptance(input: {
  kind: ResearchSampleAcceptanceKind;
  runner?: AnalyticsRunner;
}): Promise<ResearchSampleAcceptanceResult> {
  if (input.kind === "news-trace") return runNewsTraceSampleAcceptance(input.runner ?? runAnalyticsWorker);
  return runDataProcessingSampleAcceptance(input.runner ?? runAnalyticsWorker);
}

async function runNewsTraceSampleAcceptance(runner: AnalyticsRunner): Promise<ResearchSampleAcceptanceResult> {
  const started = Date.now();
  const worker = await runner({
    command: "news",
    rows: researchDocumentsToNewsRows(buildNewsTraceDocuments()),
  });
  const result = worker.result;
  const checks = [
    check("news-documents", "新闻样本文档进入整理链路", Number(result.documentCount ?? 0) >= 5, `${result.documentCount ?? 0} documents`, result.documentCount as number),
    check("news-clusters", "同题新闻可聚类", Array.isArray(result.clusters) && result.clusters.length >= 1, `${arrayLength(result.clusters)} clusters`, arrayLength(result.clusters)),
    check("news-timeline", "可生成事件时间线", Array.isArray(result.timeline) && result.timeline.length >= 3, `${arrayLength(result.timeline)} timeline items`, arrayLength(result.timeline)),
    check("news-source-quality", "可评估来源质量", Array.isArray(result.sourceProfiles) && result.sourceProfiles.length >= 3, `${arrayLength(result.sourceProfiles)} source profiles`, arrayLength(result.sourceProfiles)),
    check("news-conflicts", "可暴露冲突或反证信号", Array.isArray(result.conflictSignals), `${arrayLength(result.conflictSignals)} conflict signals`, arrayLength(result.conflictSignals)),
  ];

  return sampleResult({
    kind: "news-trace",
    label: "真实新闻溯源样本验收",
    started,
    checks,
    commands: [worker.command],
  });
}

async function runDataProcessingSampleAcceptance(runner: AnalyticsRunner): Promise<ResearchSampleAcceptanceResult> {
  const started = Date.now();
  const rows = buildAnalyticsRows();
  const commands: AnalyticsWorkerCommandName[] = [
    "profile",
    "stats",
    "quality",
    "regression",
    "logistic",
    "poisson",
    "dimension",
    "cluster",
    "anomaly",
    "timeseries",
    "news",
    "text",
    "deepml",
    "geo",
    "chart",
    "report",
    "export",
  ];
  const workers: AnalyticsWorkerRunResult[] = [];
  for (const command of commands) {
    workers.push(await runner({ command, rows }));
  }
  const byCommand = new Map(workers.map((worker) => [worker.command, worker]));
  const resultFor = (command: AnalyticsWorkerCommandName) => byCommand.get(command)?.result ?? {};
  const exportFiles = resultFor("export").files;
  const chartFiles = resultFor("chart").files;
  const checks = [
    check("profile", "Schema 和质量画像可生成", Array.isArray(resultFor("profile").columns), "profile columns"),
    check("statistics", "描述统计和相关矩阵可生成", Array.isArray(resultFor("stats").numericColumns) && Array.isArray(resultFor("stats").correlations), "stats + correlations"),
    check("models", "回归、Logistic、Poisson 可运行", ["regression", "logistic", "poisson"].every((command) => Boolean(resultFor(command as AnalyticsWorkerCommandName).model)), "3 model families"),
    check("ml", "PCA、聚类、异常检测、PyTorch/深度学习信号可运行", Boolean(resultFor("dimension").pca) && Boolean(resultFor("cluster").clusterCounts) && Array.isArray(resultFor("anomaly").anomalies) && Boolean(resultFor("deepml").torch), "dimension + cluster + anomaly + deepml"),
    check("time-text-news-geo", "时间序列、文本、新闻整理、地理数据可运行", Boolean(resultFor("timeseries").timeline) && Array.isArray(resultFor("text").keywords) && Array.isArray(resultFor("news").clusters) && Boolean(resultFor("geo").geojson), "time/text/news/geo"),
    check("visualization", "图表和论文制图产物可生成", hasAnyFile(chartFiles), "chart files"),
    check("report-export", "Markdown/DOCX/PDF/PPTX 等报告导出链路可生成", hasAnyFile(exportFiles) && Boolean(resultFor("report").markdown), "report + export files"),
  ];

  return sampleResult({
    kind: "data-processing",
    label: "真实数据处理样本验收",
    started,
    checks,
    commands,
  });
}

function sampleResult(input: {
  kind: ResearchSampleAcceptanceKind;
  label: string;
  started: number;
  checks: ResearchSampleAcceptanceCheck[];
  commands: string[];
}): ResearchSampleAcceptanceResult {
  return {
    id: randomUUID(),
    kind: input.kind,
    label: input.label,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - input.started,
    status: input.checks.every((item) => item.status === "passed") ? "passed" : "failed",
    checks: input.checks,
    commands: input.commands,
  };
}

function check(id: string, label: string, passed: boolean, detail: string, metric?: string | number): ResearchSampleAcceptanceCheck {
  return {
    id,
    label,
    status: passed ? "passed" : "failed",
    detail,
    metric,
  };
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function hasAnyFile(value: unknown) {
  return typeof value === "object" && value !== null && Object.keys(value as Record<string, unknown>).length > 0;
}

function buildNewsTraceDocuments(): CrawlDocument[] {
  const fetchedAt = "2026-06-08T00:00:00.000Z";
  return [
    document("official", "https://agency.gov/policy", "官方发布政策执行时间表", "官方声明确认政策将于 2026 年 7 月执行，并列出实施时间线。", fetchedAt, "agency.gov"),
    document("reuters", "https://reuters.example/policy", "Reuters confirms policy update", "Reuters confirms the policy update and cites the official agency statement.", fetchedAt, "reuters.example"),
    document("ap", "https://apnews.example/policy", "AP reports policy update", "AP reports the same policy update and adds reactions from affected companies.", fetchedAt, "apnews.example"),
    document("bbc", "https://bbc.example/policy", "BBC notes dispute", "BBC notes criticism and a contradiction about whether the policy has already started.", fetchedAt, "bbc.example"),
    document("community", "https://forum.example/rumor", "Community rumor check", "Community discussion says an earlier viral claim is false and contradicted by the agency statement.", fetchedAt, "forum.example"),
  ];
}

function document(id: string, url: string, title: string, contentText: string, fetchedAt: string, domain: string): CrawlDocument {
  return {
    id,
    jobId: "sample-news-trace",
    runId: "sample-news-trace-run",
    url,
    canonicalUrl: url,
    finalUrl: url,
    title,
    domain,
    depth: 0,
    status: "fetched",
    contentText,
    fetchedAt,
  };
}

function buildAnalyticsRows() {
  return [
    { title: "Reuters confirms policy update", content: "Official agency confirmed new policy details with timeline.", source: "Reuters", url: "https://reuters.example/a", date: "2026-06-01", group: "A", category: "yes", x: 1, y: 2, count: 1, lat: 31.23, lon: 121.47 },
    { title: "AP reports policy update", content: "AP says the policy update was approved after debate.", source: "AP", url: "https://apnews.example/a", date: "2026-06-02", group: "A", category: "no", x: 2, y: 4, count: 2, lat: 31.24, lon: 121.48 },
    { title: "BBC covers policy contradiction", content: "BBC noted criticism and denied claims from opposition groups.", source: "BBC", url: "https://bbc.example/a", date: "2026-06-03", group: "B", category: "yes", x: 3, y: 5, count: 3, lat: 31.25, lon: 121.49 },
    { title: "Government official statement", content: "Official statement confirms implementation schedule.", source: "agency.gov", url: "https://agency.gov/a", date: "2026-06-04", group: "B", category: "no", x: 4, y: 9, count: 4, lat: 31.26, lon: 121.5 },
    { title: "Community says false rumor", content: "Community discussion says some rumors are false and contradicted.", source: "Forum", url: "https://forum.example/a", date: "2026-06-05", group: "C", category: "yes", x: 5, y: 11, count: 5, lat: 31.27, lon: 121.51 },
    { title: "Policy market analysis", content: "Market analysis covers impact, timeline, and official documents.", source: "Bloomberg", url: "https://bloomberg.example/a", date: "2026-06-06", group: "C", category: "no", x: 6, y: 13, count: 6, lat: 31.28, lon: 121.52 },
    { title: "Policy market analysis duplicate", content: "Market analysis covers impact, timeline, and official documents.", source: "Bloomberg", url: "https://bloomberg.example/b", date: "2026-06-06", group: "C", category: "yes", x: 6, y: 13, count: 7, lat: 31.28, lon: 121.52 },
    { title: "Outlier record", content: "Unusual record for anomaly detection.", source: "Blog", url: "https://blog.example/a", date: "2026-06-07", group: "D", category: "no", x: 100, y: 200, count: 8, lat: 31.29, lon: 121.53 },
  ];
}
