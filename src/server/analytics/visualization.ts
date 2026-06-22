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
    case "pie":
      return buildPieSpec(rows, suggestion);
    case "box":
      return buildBoxSpec(rows, suggestion);
    case "heatmap":
      return buildHeatmapSpec(rows);
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

function buildPieSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const x = suggestion.x ?? Object.keys(rows[0] ?? {})[0] ?? "category";
  const y = suggestion.y;
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[x] ?? "未命名");
    const value = y ? Number(row[y]) : 1;
    grouped.set(key, (grouped.get(key) ?? 0) + (Number.isFinite(value) ? value : 1));
  }
  return {
    tooltip: { trigger: "item" },
    legend: { type: "scroll" },
    series: [{
      type: "pie",
      radius: ["35%", "70%"],
      data: [...grouped.entries()].slice(0, 30).map(([name, value]) => ({ name, value })),
    }],
  };
}

function buildBoxSpec(rows: Array<Record<string, unknown>>, suggestion: VisualizationSuggestion) {
  const group = suggestion.x ?? Object.keys(rows[0] ?? {})[0] ?? "group";
  const valueField = suggestion.y ?? Object.keys(rows[0] ?? {})[1] ?? "value";
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const value = Number(row[valueField]);
    if (!Number.isFinite(value)) continue;
    const key = String(row[group] ?? "未分组");
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return {
    x: group,
    y: valueField,
    groups: [...grouped.entries()].slice(0, 30).map(([name, values]) => ({
      name,
      count: values.length,
      ...fiveNumberSummary(values),
    })),
  };
}

function buildHeatmapSpec(rows: Array<Record<string, unknown>>) {
  const columns = Object.keys(rows[0] ?? {}).filter((column) => (
    rows.filter((row) => Number.isFinite(Number(row[column]))).length >= Math.max(2, Math.ceil(rows.length * 0.5))
  )).slice(0, 12);
  const data = [];
  for (let i = 0; i < columns.length; i += 1) {
    for (let j = 0; j < columns.length; j += 1) {
      data.push([i, j, pearson(rows, columns[i], columns[j])]);
    }
  }
  return {
    xAxis: { type: "category", data: columns },
    yAxis: { type: "category", data: columns },
    visualMap: { min: -1, max: 1 },
    series: [{ type: "heatmap", data }],
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

function fiveNumberSummary(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: quantile(sorted, 0),
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: quantile(sorted, 1),
  };
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

function pearson(rows: Array<Record<string, unknown>>, x: string, y: string) {
  const pairs = rows
    .map((row) => [Number(row[x]), Number(row[y])] as const)
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  if (pairs.length < 2) return 0;
  const xs = pairs.map(([left]) => left);
  const ys = pairs.map(([, right]) => right);
  const xMean = mean(xs);
  const yMean = mean(ys);
  const numerator = pairs.reduce((sum, [left, right]) => sum + (left - xMean) * (right - yMean), 0);
  const xDenominator = Math.sqrt(xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
  const yDenominator = Math.sqrt(ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
  const denominator = xDenominator * yDenominator;
  return denominator === 0 ? 0 : numerator / denominator;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
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
