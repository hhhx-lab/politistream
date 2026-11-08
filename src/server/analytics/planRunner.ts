import { createDatasetProfile, getAnalyticsDataset, getLatestDatasetProfile } from "./store";
import { normalizeAnalysisKind, renderDatasetVisualization, runDatasetAnalysis, type DatasetAnalysisContext } from "./jobs";
import type {
  AnalyticsChartRecommendation,
  AnalyticsJobKind,
  AnalyticsPlanMode,
  TopicAnalysisPlan,
  VisualizationSuggestion,
} from "./types";

export interface RunTopicAnalysisPlanInput {
  datasetId: string;
  plan: TopicAnalysisPlan;
  mode?: AnalyticsPlanMode;
  requestedKinds?: unknown[];
  chartLimit?: number;
  includeCharts?: boolean;
  includeReport?: boolean;
  context?: DatasetAnalysisContext;
}

export async function runTopicAnalysisPlan(input: RunTopicAnalysisPlanInput) {
  const dataset = await getAnalyticsDataset(input.datasetId);
  if (!dataset) throw Object.assign(new Error("analytics_dataset_not_found"), { statusCode: 404 });

  const mode = input.mode ?? input.plan.mode;
  const profile = await getLatestDatasetProfile(input.datasetId) ?? await createDatasetProfile(input.datasetId);
  const allowedKinds = allowedAnalysisKindsForMode(mode);
  const requestedKinds = normalizeRequestedKinds(input.requestedKinds);
  const plannedKinds = input.plan.recommendedMethods
    .filter((method) => method.allowed !== false)
    .map((method) => safeNormalizeAnalysisKind(method.kind))
    .filter((kind): kind is AnalyticsJobKind => Boolean(kind));
  const methodKinds = uniqueKinds((requestedKinds.length > 0 ? requestedKinds : plannedKinds)
    .filter((kind) => allowedKinds.includes(kind)));
  const includeReport = input.includeReport ?? mode === "full_analysis";
  if (includeReport && allowedKinds.includes("export-report") && !methodKinds.includes("export-report")) {
    methodKinds.push("export-report");
  }

  const methods = [];
  for (const kind of methodKinds) {
    try {
      const result = await runDatasetAnalysis(input.datasetId, kind, {
        ...input.context,
        mode,
        planId: input.context?.planId ?? input.plan.id,
      });
      methods.push({
        kind,
        ok: true,
        job: result.job,
        artifact: result.artifact,
        durationMs: result.worker.durationMs,
      });
    } catch (error) {
      methods.push({
        kind,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const shouldRenderCharts = input.includeCharts ?? (mode !== "report_only" && mode !== "continue_crawl");
  const visualizations = [];
  if (shouldRenderCharts && allowedKinds.includes("visualization-render")) {
    const chartLimit = Math.max(1, Math.min(8, Number(input.chartLimit ?? (mode === "full_analysis" ? 5 : 2))));
    const charts = input.plan.recommendedCharts
      .filter((chart) => chart.allowed !== false)
      .slice(0, chartLimit);
    for (const chart of charts) {
      try {
        const result = await renderDatasetVisualization({
          datasetId: input.datasetId,
          suggestion: chartRecommendationToSuggestion(chart),
          title: chart.title,
        });
        visualizations.push({
          kind: chart.kind,
          ok: true,
          artifact: result.artifact,
          job: result.job,
          storedArtifact: result.storedArtifact,
        });
      } catch (error) {
        visualizations.push({
          kind: chart.kind,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const succeeded = methods.filter((item) => item.ok).length + visualizations.filter((item) => item.ok).length;
  const failed = methods.filter((item) => !item.ok).length + visualizations.filter((item) => !item.ok).length;

  return {
    datasetId: input.datasetId,
    mode,
    plan: input.plan,
    profile,
    sequence: methodKinds,
    methods,
    visualizations,
    summary: {
      methodCount: methods.length,
      visualizationCount: visualizations.length,
      succeeded,
      failed,
      artifactCount: methods.filter((item) => item.ok && "artifact" in item).length + visualizations.filter((item) => item.ok).length,
      completedAt: new Date().toISOString(),
    },
  };
}

export function allowedAnalysisKindsForMode(mode: AnalyticsPlanMode): AnalyticsJobKind[] {
  if (mode === "report_only" || mode === "continue_crawl") return [];
  if (mode === "light_analysis") {
    return ["profile", "descriptive-statistics", "quality-report", "frequency-tables", "crosstab", "visualization-render"];
  }
  return [
    "profile",
    "descriptive-statistics",
    "quality-report",
    "frequency-tables",
    "crosstab",
    "statistical-tests",
    "linear-regression",
    "logistic-regression",
    "poisson-regression",
    "dimensionality-reduction",
    "cluster-analysis",
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
    "report-draft",
    "export-report",
    "visualization-render",
  ];
}

export function isAnalysisKindAllowedForPlanMode(kind: string, mode: AnalyticsPlanMode) {
  return allowedAnalysisKindsForMode(mode).includes(kind as AnalyticsJobKind);
}

function normalizeRequestedKinds(value: unknown[] | undefined) {
  return Array.isArray(value)
    ? uniqueKinds(value.map((item) => safeNormalizeAnalysisKind(item)).filter((kind): kind is AnalyticsJobKind => Boolean(kind)))
    : [];
}

function safeNormalizeAnalysisKind(value: unknown): AnalyticsJobKind | null {
  try {
    return normalizeAnalysisKind(value);
  } catch {
    return null;
  }
}

function uniqueKinds(kinds: AnalyticsJobKind[]) {
  return Array.from(new Set(kinds));
}

function chartRecommendationToSuggestion(chart: AnalyticsChartRecommendation): VisualizationSuggestion {
  const [x, y, color] = chart.fields;
  return {
    id: chart.id,
    kind: chart.kind,
    title: chart.title,
    description: chart.description,
    x,
    y,
    color,
    engine: chart.engine,
    exportFormats: chartExportFormats(chart.kind),
  };
}

function chartExportFormats(kind: AnalyticsChartRecommendation["kind"]): VisualizationSuggestion["exportFormats"] {
  if (kind === "table") return ["html"];
  if (kind === "line" || kind === "scatter") return ["png", "svg", "html"];
  return ["png", "svg", "pdf"];
}
