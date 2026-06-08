import {
  AnalyticsCapability,
  AnalyticsProfileInput,
  DescriptiveStatisticsResult,
  DatasetProfile,
  ProfileColumn,
  VisualizationSuggestion,
} from "./types";

export function getAnalyticsCapabilities(): AnalyticsCapability[] {
  return [
    {
      id: "news-story-clustering",
      kind: "news-processing",
      title: "新闻整理、去重、分类和时间线",
      description: "对 RSS/Research 文档做 story clustering、主题分类、来源统计、实体和时间线整理。",
      engines: ["Python worker", "TF-IDF", "heuristic entity extraction", "LLM-ready summaries"],
      entrypoint: "/api/analytics/datasets/:id/analyze kind=news-organization",
      status: "external-worker",
    },
    {
      id: "dataset-profile",
      kind: "data-profiling",
      title: "数据集 Schema 和质量画像",
      description: "对 CSV/JSON/Excel/Parquet 等数据资产生成字段类型、缺失率、唯一值、范围、均值和质量提示。",
      engines: ["DuckDB", "Pandas", "Polars", "current lightweight JS profiler"],
      entrypoint: "/api/analytics/profile",
      status: "available",
    },
    {
      id: "data-transformation-lineage",
      kind: "data-profiling",
      title: "数据转换、聚合、透视和 lineage",
      description: "对导入数据执行 groupby、pivot、rolling 统计，识别 join key，并输出可复现 Pandas 代码和转换链路。",
      engines: ["Python worker", "Pandas", "lineage metadata"],
      entrypoint: "/api/analytics/datasets/:id/analyze kind=data-transformation",
      status: "external-worker",
    },
    {
      id: "spss-statistics",
      kind: "statistics",
      title: "SPSS Pro 级统计分析",
      description: "描述统计、交叉表、相关、t 检验、ANOVA、回归、时间序列和可解释统计报告。",
      engines: ["SciPy", "statsmodels", "scikit-learn"],
      entrypoint: "/api/analytics/datasets/:id/analyze",
      status: "external-worker",
    },
    {
      id: "ml-pytorch",
      kind: "machine-learning",
      title: "机器学习和 PyTorch 深度学习",
      description: "文本分类、聚类、embedding、传统 ML、PyTorch 模型和 SHAP/误差分析。",
      engines: ["scikit-learn", "TF-IDF", "PCA", "PyTorch", "Transformers optional", "SHAP optional"],
      entrypoint: "/api/analytics/datasets/:id/analyze",
      status: "external-worker",
    },
    {
      id: "visualization-studio",
      kind: "visualization",
      title: "论文图、统计图、工程图和交互式可视化",
      description: "根据数据 profile 生成 Matplotlib/Seaborn/Plotly/Altair/ECharts/Graphviz/Mermaid 图表建议和导出任务。",
      engines: ["Matplotlib", "Seaborn", "Plotly", "Altair", "ECharts", "Graphviz", "Mermaid"],
      entrypoint: "/api/analytics/visualizations/suggest",
      status: "available",
    },
    {
      id: "reproducible-reporting",
      kind: "reporting",
      title: "可复现中文研究报告",
      description: "将数据、统计表、图表、代码和中文解释打包成 Markdown、DOCX、PDF、PPTX。",
      engines: ["Python worker", "Markdown", "Pandoc/LibreOffice-ready", "python-pptx optional"],
      entrypoint: "/api/analytics/datasets/:id/analyze kind=export-report",
      status: "external-worker",
    },
  ];
}

export function profileRows(input: AnalyticsProfileInput): DatasetProfile {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const columnNames = collectColumnNames(rows);
  const columns = columnNames.map((name) => profileColumn(name, rows));
  const missingCells = columns.reduce((sum, column) => sum + column.missingCount, 0);
  const totalCells = Math.max(1, rows.length * Math.max(1, columnNames.length));
  const mixedPenalty = columns.filter((column) => column.inferredType === "mixed").length / Math.max(1, columns.length);
  const qualityScore = clamp(1 - (missingCells / totalCells) * 0.7 - mixedPenalty * 0.3);

  return {
    rowCount: rows.length,
    columnCount: columnNames.length,
    columns,
    qualityScore,
    warnings: buildWarnings(rows.length, columns),
  };
}

export function suggestVisualizations(profile: DatasetProfile): VisualizationSuggestion[] {
  const numeric = profile.columns.filter((column) => column.inferredType === "number");
  const categorical = profile.columns.filter((column) => ["string", "boolean"].includes(column.inferredType));
  const dates = profile.columns.filter((column) => column.inferredType === "date");
  const suggestions: VisualizationSuggestion[] = [];

  if (categorical[0] && numeric[0]) {
    suggestions.push({
      id: "category-bar",
      kind: "bar",
      title: `${categorical[0].name} 对 ${numeric[0].name}`,
      description: "按分类字段聚合数值字段，适合排行榜、来源分布和分组统计。",
      x: categorical[0].name,
      y: numeric[0].name,
      engine: "echarts",
      exportFormats: ["png", "svg", "html"],
    });
  }

  if (dates[0] && numeric[0]) {
    suggestions.push({
      id: "time-line",
      kind: "line",
      title: `${numeric[0].name} 时间趋势`,
      description: "按时间字段绘制趋势线，适合新闻热度、指标变化和赛事时间序列。",
      x: dates[0].name,
      y: numeric[0].name,
      engine: "plotly",
      exportFormats: ["png", "svg", "html"],
    });
  }

  if (numeric.length >= 2) {
    suggestions.push({
      id: "numeric-scatter",
      kind: "scatter",
      title: `${numeric[0].name} 与 ${numeric[1].name} 关系`,
      description: "比较两个数值变量的关系，适合相关性、离群点和回归前探索。",
      x: numeric[0].name,
      y: numeric[1].name,
      color: categorical[0]?.name,
      engine: "seaborn",
      exportFormats: ["png", "svg", "pdf"],
    });
    suggestions.push({
      id: "correlation-heatmap",
      kind: "heatmap",
      title: "数值变量相关矩阵",
      description: "生成相关矩阵热力图，适合论文图和统计报告。",
      engine: "matplotlib",
      exportFormats: ["png", "svg", "pdf"],
    });
  }

  if (numeric[0]) {
    suggestions.push({
      id: "numeric-histogram",
      kind: "histogram",
      title: `${numeric[0].name} 分布`,
      description: "查看单个数值字段分布、偏态和异常值。",
      x: numeric[0].name,
      engine: "seaborn",
      exportFormats: ["png", "svg", "pdf"],
    });
  }

  suggestions.push({
    id: "profile-table",
    kind: "table",
    title: "数据质量表",
    description: "展示字段类型、缺失值、唯一值、范围和质量提示。",
    engine: "echarts",
    exportFormats: ["html"],
  });

  return suggestions;
}

export function computeDescriptiveStatistics(input: AnalyticsProfileInput): DescriptiveStatisticsResult {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const profile = profileRows({ rows });
  const numericColumns = profile.columns
    .filter((column) => column.inferredType === "number")
    .map((column) => {
      const values = rows
        .map((row) => Number(row[column.name]))
        .filter(Number.isFinite)
        .sort((left, right) => left - right);
      const std = standardDeviation(values);
      const standardError = values.length ? std / Math.sqrt(values.length) : 0;
      const ciMargin = 1.96 * standardError;
      const average = mean(values);
      return {
        name: column.name,
        count: values.length,
        missingCount: column.missingCount,
        mean: average,
        median: median(values),
        min: values[0] ?? 0,
        max: values[values.length - 1] ?? 0,
        standardDeviation: std,
        standardError,
        confidenceInterval95: [average - ciMargin, average + ciMargin] as [number, number],
      };
    });

  const correlations = buildCorrelations(rows, numericColumns.map((column) => column.name));

  return { numericColumns, correlations };
}

function collectColumnNames(rows: Array<Record<string, unknown>>) {
  const names = new Set<string>();
  for (const row of rows) {
    Object.keys(row ?? {}).forEach((key) => names.add(key));
  }
  return [...names];
}

function buildCorrelations(rows: Array<Record<string, unknown>>, columns: string[]) {
  const correlations = [];
  for (let i = 0; i < columns.length; i += 1) {
    for (let j = i + 1; j < columns.length; j += 1) {
      const x = columns[i];
      const y = columns[j];
      correlations.push({ x, y, correlation: pearson(rows, x, y) });
    }
  }
  return correlations;
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

function median(values: number[]) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const valueMean = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function profileColumn(name: string, rows: Array<Record<string, unknown>>): ProfileColumn {
  const values = rows.map((row) => row[name]);
  const present = values.filter((value) => value !== null && value !== undefined && value !== "");
  const inferredType = inferType(present);
  const unique = new Set(present.map((value) => String(value)));
  const column: ProfileColumn = {
    name,
    inferredType,
    totalCount: rows.length,
    missingCount: rows.length - present.length,
    uniqueCount: unique.size,
  };

  if (inferredType === "number") {
    const nums = present.map(Number).filter(Number.isFinite);
    column.min = Math.min(...nums);
    column.max = Math.max(...nums);
    column.mean = nums.reduce((sum, value) => sum + value, 0) / Math.max(1, nums.length);
  } else if (inferredType === "date") {
    const timestamps = present.map((value) => Date.parse(String(value))).filter(Number.isFinite);
    column.min = new Date(Math.min(...timestamps)).toISOString();
    column.max = new Date(Math.max(...timestamps)).toISOString();
  }

  return column;
}

function inferType(values: unknown[]): ProfileColumn["inferredType"] {
  if (values.length === 0) return "empty";
  const typeChecks = {
    number: values.filter((value) => Number.isFinite(Number(value))).length,
    boolean: values.filter((value) => typeof value === "boolean" || ["true", "false"].includes(String(value).toLowerCase())).length,
    date: values.filter((value) => Number.isFinite(Date.parse(String(value))) && /[-/:T]/.test(String(value))).length,
  };
  const threshold = Math.max(1, Math.floor(values.length * 0.85));
  if (typeChecks.number >= threshold) return "number";
  if (typeChecks.boolean >= threshold) return "boolean";
  if (typeChecks.date >= threshold) return "date";
  if (values.every((value) => typeof value === "string")) return "string";
  return "mixed";
}

function buildWarnings(rowCount: number, columns: ProfileColumn[]) {
  const warnings: string[] = [];
  if (rowCount === 0) warnings.push("数据为空，无法执行统计分析。");
  for (const column of columns) {
    if (column.missingCount > 0) warnings.push(`${column.name} 存在 ${column.missingCount} 个缺失值。`);
    if (column.inferredType === "mixed") warnings.push(`${column.name} 类型混杂，建议先清洗。`);
  }
  return warnings.slice(0, 20);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
