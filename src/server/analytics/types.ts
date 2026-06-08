export type AnalyticsCapabilityKind = "news-processing" | "data-profiling" | "statistics" | "machine-learning" | "visualization" | "reporting";
export type VisualizationKind = "bar" | "line" | "scatter" | "histogram" | "box" | "heatmap" | "map" | "network" | "timeline" | "table";

export interface AnalyticsCapability {
  id: string;
  kind: AnalyticsCapabilityKind;
  title: string;
  description: string;
  engines: string[];
  entrypoint: string;
  status: "available" | "planned" | "external-worker";
}

export interface ProfileColumn {
  name: string;
  inferredType: "number" | "string" | "boolean" | "date" | "empty" | "mixed";
  totalCount: number;
  missingCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  columns: ProfileColumn[];
  qualityScore: number;
  warnings: string[];
}

export interface AnalyticsDatasetAsset {
  id: string;
  name: string;
  sourceKind: "manual" | "research-run" | "research-data-source" | "materialized-data-source" | "crawler" | "upload" | "api";
  sourceRef?: string;
  rowCount: number;
  columnCount: number;
  rows?: Array<Record<string, unknown>>;
  sampleRows: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsDatasetProfile {
  id: string;
  datasetId: string;
  profile: DatasetProfile;
  suggestions: VisualizationSuggestion[];
  createdAt: string;
}

export interface VisualizationSuggestion {
  id: string;
  kind: VisualizationKind;
  title: string;
  description: string;
  x?: string;
  y?: string;
  color?: string;
  engine: "matplotlib" | "seaborn" | "plotly" | "altair" | "echarts" | "graphviz" | "mermaid";
  exportFormats: Array<"png" | "svg" | "pdf" | "html">;
}

export interface VisualizationArtifact {
  id: string;
  datasetId?: string;
  kind: VisualizationKind;
  engine: VisualizationSuggestion["engine"];
  title: string;
  description: string;
  spec: Record<string, unknown>;
  exportFormats: VisualizationSuggestion["exportFormats"];
  dataLineage: {
    datasetId?: string;
    rowCount: number;
    x?: string;
    y?: string;
    color?: string;
    generatedAt: string;
  };
  reproducibleCode: string;
}

export type AnalyticsWorkerCommandName =
  | "profile"
  | "stats"
  | "quality"
  | "frequency"
  | "crosstab"
  | "tests"
  | "regression"
  | "logistic"
  | "poisson"
  | "dimension"
  | "cluster"
  | "anomaly"
  | "timeseries"
  | "transform"
  | "cleaning"
  | "news"
  | "text"
  | "explain"
  | "deepml"
  | "geo"
  | "chart"
  | "report"
  | "export";

export interface AnalyticsWorkerCommand {
  file: string;
  args: string[];
  cwd: string;
}

export interface AnalyticsWorkerRunResult {
  command: AnalyticsWorkerCommandName;
  engine: "python-worker";
  result: Record<string, unknown>;
  durationMs: number;
}

export type AnalyticsJobKind =
  | "profile"
  | "descriptive-statistics"
  | "quality-report"
  | "frequency-tables"
  | "crosstab"
  | "statistical-tests"
  | "linear-regression"
  | "logistic-regression"
  | "poisson-regression"
  | "dimensionality-reduction"
  | "cluster-analysis"
  | "anomaly-detection"
  | "time-series-analysis"
  | "data-transformation"
  | "data-cleaning"
  | "news-organization"
  | "text-analysis"
  | "model-explanation"
  | "deep-learning-analysis"
  | "geospatial-analysis"
  | "publication-chart"
  | "report-draft"
  | "export-report"
  | "visualization-render";
export type AnalyticsJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AnalyticsJob {
  id: string;
  datasetId?: string;
  kind: AnalyticsJobKind;
  status: AnalyticsJobStatus;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsArtifact {
  id: string;
  jobId?: string;
  datasetId?: string;
  artifactType: "profile" | "statistics" | "visualization" | "report" | "model" | "dataset" | "news" | "text" | "geo";
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AnalyticsProfileInput {
  rows: Array<Record<string, unknown>>;
}

export interface NumericColumnStats {
  name: string;
  count: number;
  missingCount: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  standardError?: number;
  confidenceInterval95?: [number, number];
}

export interface CorrelationCell {
  x: string;
  y: string;
  correlation: number;
}

export interface DescriptiveStatisticsResult {
  numericColumns: NumericColumnStats[];
  correlations: CorrelationCell[];
}

export interface CreateAnalyticsDatasetInput {
  name: string;
  sourceKind?: AnalyticsDatasetAsset["sourceKind"];
  sourceRef?: string;
  rows: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}
