import { profileRows, suggestVisualizations } from "./engine";
import {
  createAnalyticsArtifact,
  createAnalyticsJob,
  getAnalyticsDataset,
  updateAnalyticsJob,
} from "./store";
import { runAnalyticsWorker } from "./workerRunner";
import { renderVisualizationArtifact } from "./visualization";
import { AnalyticsJobKind, AnalyticsWorkerCommandName, VisualizationSuggestion } from "./types";

export async function runDatasetAnalysis(datasetId: string, kind: AnalyticsJobKind = "descriptive-statistics") {
  let jobId: string | undefined;
  try {
    const dataset = await getAnalyticsDataset(datasetId);
    if (!dataset) throw Object.assign(new Error("analytics_dataset_not_found"), { statusCode: 404 });

    const workerCommand = workerCommandForKind(kind);
    const job = await createAnalyticsJob({
      datasetId: dataset.id,
      kind,
      status: "running",
      request: {
        kind,
        engine: "python-worker",
        rowCount: dataset.rowCount,
      },
    });
    jobId = job.id;

    const analysisRows = dataset.rows ?? dataset.sampleRows;
    const worker = await runAnalyticsWorker({
      command: workerCommand,
      rows: analysisRows,
    });
    const artifact = await createAnalyticsArtifact({
      jobId: job.id,
      datasetId: dataset.id,
      artifactType: artifactTypeForKind(kind),
      title: artifactTitleForKind(dataset.name, kind),
      metadata: {
        engine: worker.engine,
        command: worker.command,
        durationMs: worker.durationMs,
        rowCount: analysisRows.length,
        result: worker.result,
      },
    });
    const updated = await updateAnalyticsJob({
      id: job.id,
      status: "succeeded",
      result: {
        worker,
        artifactId: artifact.id,
      },
    });

    return { job: updated, artifact, worker };
  } catch (error) {
    if (jobId) {
      await updateAnalyticsJob({
        id: jobId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function renderDatasetVisualization(input: {
  datasetId?: string;
  rows?: Array<Record<string, unknown>>;
  suggestion?: VisualizationSuggestion;
  title?: string;
}) {
  const dataset = input.datasetId ? await getAnalyticsDataset(input.datasetId) : null;
  if (input.datasetId && !dataset) throw Object.assign(new Error("analytics_dataset_not_found"), { statusCode: 404 });

  const rows = dataset?.rows ?? dataset?.sampleRows ?? input.rows ?? [];
  const suggestion = input.suggestion ?? suggestVisualizations(profileRows({ rows }))[0];
  if (!suggestion) throw Object.assign(new Error("visualization_suggestion_required"), { statusCode: 400 });

  const artifact = renderVisualizationArtifact({
    rows,
    suggestion,
    title: input.title,
    datasetId: input.datasetId,
  });

  if (!input.datasetId) return { artifact };

  const job = await createAnalyticsJob({
    datasetId: input.datasetId,
    kind: "visualization-render",
    status: "succeeded",
    request: {
      suggestion,
      title: input.title,
    },
    result: {
      artifact: artifact as unknown as Record<string, unknown>,
    },
  });
  const storedArtifact = await createAnalyticsArtifact({
    jobId: job.id,
    datasetId: input.datasetId,
    artifactType: "visualization",
    title: artifact.title,
    metadata: { artifact: artifact as unknown as Record<string, unknown> },
  });

  return { artifact, job, storedArtifact };
}

export function normalizeAnalysisKind(value: unknown): AnalyticsJobKind {
  if (value === "profile") return "profile";
  if (value === "descriptive-statistics" || value === "stats" || value === undefined) return "descriptive-statistics";
  if (value === "quality" || value === "quality-report") return "quality-report";
  if (value === "frequency" || value === "frequency-tables") return "frequency-tables";
  if (value === "crosstab") return "crosstab";
  if (value === "tests" || value === "statistical-tests" || value === "t-test" || value === "chi-square" || value === "anova" || value === "nonparametric") return "statistical-tests";
  if (value === "regression" || value === "linear-regression") return "linear-regression";
  if (value === "logistic" || value === "logistic-regression") return "logistic-regression";
  if (value === "poisson" || value === "poisson-regression") return "poisson-regression";
  if (value === "dimension" || value === "dimensionality-reduction" || value === "pca" || value === "factor-analysis") return "dimensionality-reduction";
  if (value === "cluster" || value === "cluster-analysis") return "cluster-analysis";
  if (value === "anomaly" || value === "anomaly-detection" || value === "outlier") return "anomaly-detection";
  if (value === "timeseries" || value === "time-series" || value === "time-series-analysis") return "time-series-analysis";
  if (value === "transform" || value === "data-transformation" || value === "groupby" || value === "group-by" || value === "pivot" || value === "pivot-table" || value === "rolling") return "data-transformation";
  if (value === "cleaning" || value === "data-cleaning" || value === "lineage") return "data-cleaning";
  if (value === "news" || value === "news-organization" || value === "story-clustering") return "news-organization";
  if (value === "text" || value === "text-analysis" || value === "embedding" || value === "topic-modeling") return "text-analysis";
  if (value === "explain" || value === "model-explanation" || value === "shap") return "model-explanation";
  if (value === "deepml" || value === "deep-learning" || value === "deep-learning-analysis" || value === "pytorch" || value === "transformers") return "deep-learning-analysis";
  if (value === "geo" || value === "geospatial" || value === "geospatial-analysis") return "geospatial-analysis";
  if (value === "chart" || value === "publication-chart") return "publication-chart";
  if (value === "report" || value === "report-draft") return "report-draft";
  if (value === "export" || value === "export-report") return "export-report";
  throw Object.assign(new Error("unsupported_analytics_job_kind"), { statusCode: 400 });
}

export function workerCommandForKind(kind: AnalyticsJobKind): AnalyticsWorkerCommandName {
  if (kind === "profile") return "profile";
  if (kind === "descriptive-statistics") return "stats";
  if (kind === "quality-report") return "quality";
  if (kind === "frequency-tables") return "frequency";
  if (kind === "crosstab") return "crosstab";
  if (kind === "statistical-tests") return "tests";
  if (kind === "linear-regression") return "regression";
  if (kind === "logistic-regression") return "logistic";
  if (kind === "poisson-regression") return "poisson";
  if (kind === "dimensionality-reduction") return "dimension";
  if (kind === "cluster-analysis") return "cluster";
  if (kind === "anomaly-detection") return "anomaly";
  if (kind === "time-series-analysis") return "timeseries";
  if (kind === "data-transformation") return "transform";
  if (kind === "data-cleaning") return "cleaning";
  if (kind === "news-organization") return "news";
  if (kind === "text-analysis") return "text";
  if (kind === "model-explanation") return "explain";
  if (kind === "deep-learning-analysis") return "deepml";
  if (kind === "geospatial-analysis") return "geo";
  if (kind === "publication-chart") return "chart";
  if (kind === "report-draft") return "report";
  if (kind === "export-report") return "export";
  throw Object.assign(new Error("unsupported_worker_job_kind"), { statusCode: 400 });
}

function artifactTypeForKind(kind: AnalyticsJobKind) {
  if (kind === "profile") return "profile";
  if (kind === "linear-regression" || kind === "logistic-regression" || kind === "poisson-regression" || kind === "cluster-analysis" || kind === "dimensionality-reduction" || kind === "model-explanation" || kind === "deep-learning-analysis") return "model";
  if (kind === "report-draft" || kind === "export-report") return "report";
  if (kind === "publication-chart") return "visualization";
  if (kind === "data-cleaning" || kind === "data-transformation") return "dataset";
  if (kind === "news-organization") return "news";
  if (kind === "text-analysis") return "text";
  if (kind === "geospatial-analysis") return "geo";
  return "statistics";
}

function artifactTitleForKind(datasetName: string, kind: AnalyticsJobKind) {
  switch (kind) {
    case "profile":
      return `${datasetName} profile`;
    case "descriptive-statistics":
      return `${datasetName} descriptive statistics`;
    case "quality-report":
      return `${datasetName} quality report`;
    case "frequency-tables":
      return `${datasetName} frequency tables`;
    case "crosstab":
      return `${datasetName} crosstab`;
    case "statistical-tests":
      return `${datasetName} statistical tests`;
    case "linear-regression":
      return `${datasetName} linear regression`;
    case "logistic-regression":
      return `${datasetName} logistic regression`;
    case "poisson-regression":
      return `${datasetName} poisson regression`;
    case "dimensionality-reduction":
      return `${datasetName} PCA and factor analysis`;
    case "cluster-analysis":
      return `${datasetName} cluster analysis`;
    case "anomaly-detection":
      return `${datasetName} anomaly detection`;
    case "time-series-analysis":
      return `${datasetName} time series analysis`;
    case "data-transformation":
      return `${datasetName} transformations`;
    case "data-cleaning":
      return `${datasetName} cleaning and lineage`;
    case "news-organization":
      return `${datasetName} news organization`;
    case "text-analysis":
      return `${datasetName} text analysis`;
    case "model-explanation":
      return `${datasetName} model explanation`;
    case "deep-learning-analysis":
      return `${datasetName} deep learning analysis`;
    case "geospatial-analysis":
      return `${datasetName} geospatial analysis`;
    case "publication-chart":
      return `${datasetName} publication chart`;
    case "report-draft":
      return `${datasetName} report draft`;
    case "export-report":
      return `${datasetName} exported report`;
    default:
      return `${datasetName} analysis`;
  }
}
