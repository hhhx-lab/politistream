import { randomUUID } from "crypto";
import { VisualizationArtifact, VisualizationSuggestion } from "./types";

export interface RenderVisualizationArtifactInput {
  rows: Array<Record<string, unknown>>;
  suggestion: VisualizationSuggestion;
  title?: string;
  datasetId?: string;
}

export function renderVisualizationArtifact(input: RenderVisualizationArtifactInput): VisualizationArtifact {
  const generatedAt = new Date().toISOString();
  return {
    id: randomUUID(),
    datasetId: input.datasetId,
    kind: input.suggestion.kind,
    engine: input.suggestion.engine,
    title: input.title || input.suggestion.title,
    description: input.suggestion.description,
    spec: buildSpec(input.rows, input.suggestion),
    exportFormats: input.suggestion.exportFormats,
    dataLineage: {
      datasetId: input.datasetId,
      rowCount: input.rows.length,
      x: input.suggestion.x,
      y: input.suggestion.y,
      color: input.suggestion.color,
      generatedAt,
    },
    reproducibleCode: buildReproducibleCode(input.rows, input.suggestion),
  };
}

function buildSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  switch (suggestion.kind) {
    case "bar":
      return buildBarSpec(rows, suggestion);
    case "line":
      return buildLineSpec(rows, suggestion);
    case "scatter":
      return buildScatterSpec(rows, suggestion);
    case "histogram":
      return buildHistogramSpec(rows, suggestion);
    case "table":
      return {
        columns: Object.keys(rows[0] ?? {}),
        rows: rows.slice(0, 100),
      };
    default:
      return {
        rows: rows.slice(0, 100),
        note: `${suggestion.kind} rendering is represented as a portable data spec until its renderer is enabled.`,
      };
  }
}

function buildBarSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const x = suggestion.x ?? Object.keys(rows[0] ?? {})[0] ?? "category";
  const y = suggestion.y ?? Object.keys(rows[0] ?? {})[1] ?? "value";
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[x] ?? "");
    const value = Number(row[y]);
    grouped.set(key, (grouped.get(key) ?? 0) + (Number.isFinite(value) ? value : 0));
  }
  return {
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: [...grouped.keys()] },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: [...grouped.values()] }],
  };
}

function buildLineSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const x = suggestion.x ?? Object.keys(rows[0] ?? {})[0] ?? "x";
  const y = suggestion.y ?? Object.keys(rows[0] ?? {})[1] ?? "y";
  const points = rows.map((row) => ({ x: row[x], y: Number(row[y]) || 0 }));
  return {
    data: points,
    layout: {
      xaxis: { title: x },
      yaxis: { title: y },
    },
    traces: [{ type: "scatter", mode: "lines+markers", x: points.map((point) => point.x), y: points.map((point) => point.y) }],
  };
}

function buildScatterSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const x = suggestion.x ?? Object.keys(rows[0] ?? {})[0] ?? "x";
  const y = suggestion.y ?? Object.keys(rows[0] ?? {})[1] ?? "y";
  return {
    x,
    y,
    color: suggestion.color,
    data: rows
      .map((row) => ({
        x: Number(row[x]),
        y: Number(row[y]),
        color: suggestion.color ? row[suggestion.color] : undefined,
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  };
}

function buildHistogramSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const x = suggestion.x ?? Object.keys(rows[0] ?? {})[0] ?? "value";
  const values = rows.map((row) => Number(row[x])).filter(Number.isFinite);
  return {
    field: x,
    values,
    binCount: Math.min(30, Math.max(5, Math.ceil(Math.sqrt(values.length || 1)))),
  };
}

function buildReproducibleCode(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const fields = [suggestion.x, suggestion.y, suggestion.color].filter(Boolean).join(", ");
  return [
    "# Reproduce this PolitiStream visualization",
    "import pandas as pd",
    "",
    `rows = ${JSON.stringify(rows.slice(0, 500), null, 2)}`,
    "df = pd.DataFrame(rows)",
    `# suggested engine: ${suggestion.engine}`,
    `# chart kind: ${suggestion.kind}`,
    `# fields: ${fields || "N/A"}`,
  ].join("\n");
}
