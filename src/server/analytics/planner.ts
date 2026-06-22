import type { AnalysisHandoff, AnalysisOpportunity } from "../research/types";
import { suggestVisualizations } from "./engine";
import type {
  AnalyticsChartRecommendation,
  AnalyticsFieldCoverage,
  AnalyticsMethodRecommendation,
  AnalyticsPlanMode,
  AnalyticsPlanQuestion,
  AnalyticsVariableRole,
  AnalyticsVariableRoleName,
  DatasetProfile,
  TopicAnalysisPlan,
  VisualizationSuggestion,
} from "./types";

export interface BuildTopicAnalysisPlanInput {
  opportunity: AnalysisOpportunity;
  handoff?: AnalysisHandoff;
  datasetId?: string;
  sourceRegistryDatasetId?: string;
  datasetProfile?: DatasetProfile | null;
  sourceRows?: Array<Record<string, unknown>>;
  mode?: AnalyticsPlanMode;
  allowedOperations?: string[];
}

export function buildTopicAnalysisPlan(input: BuildTopicAnalysisPlanInput): TopicAnalysisPlan {
  const mode = input.mode ?? input.handoff?.decision ?? input.opportunity.recommendedAnalysisMode;
  const allowedOperations = normalizeAllowedOperations(mode, input.allowedOperations ?? input.handoff?.allowedOperations);
  const fieldCoverage = buildFieldCoverage(input);
  const variableRoles = buildVariableRoles(input, fieldCoverage);
  const questions = buildPlanQuestions(input, mode, variableRoles);
  const recommendedMethods = buildMethodRecommendations({
    mode,
    allowedOperations,
    variableRoles,
    fieldCoverage,
  });
  const recommendedCharts = buildChartRecommendations({
    mode,
    profile: input.datasetProfile ?? null,
    variableRoles,
    allowedOperations,
  });
  const risks = buildPlanRisks({
    mode,
    opportunity: input.opportunity,
    fieldCoverage,
    profile: input.datasetProfile ?? null,
    sourceRows: input.sourceRows ?? [],
  });

  return {
    id: input.handoff?.planId ?? `analysis-plan:${input.opportunity.id ?? input.opportunity.researchRunId}`,
    topic: input.opportunity.topic,
    mode,
    questions,
    candidateVariables: unique([
      ...input.opportunity.candidateFeatures,
      ...fieldCoverage.availableFields,
    ]),
    variableRoles,
    fieldCoverage,
    recommendedMethods,
    recommendedCharts,
    risks,
    nextActions: nextActionsForPlan(mode, fieldCoverage, recommendedMethods),
    restrictions: restrictionsForMode(mode),
    lineage: {
      researchRunId: input.opportunity.researchRunId,
      researchJobId: input.opportunity.researchJobId,
      opportunityId: input.opportunity.id,
      handoffId: input.handoff?.id,
      datasetId: input.datasetId,
      sourceRegistryDatasetId: input.sourceRegistryDatasetId ?? input.handoff?.lineage.sourceDatasetId,
    },
  };
}

function buildFieldCoverage(input: BuildTopicAnalysisPlanInput): AnalyticsFieldCoverage {
  const profileFields = input.datasetProfile?.columns.map((column) => column.name) ?? [];
  const rowFields = collectRowFields(input.sourceRows ?? []);
  const availableFields = unique([
    ...input.opportunity.availableFields,
    ...profileFields,
    ...rowFields,
  ]);
  const requiredFields = unique(input.opportunity.requiredFields);
  const missingFields = requiredFields.filter((field) => !hasFieldLike(availableFields, field));
  const coverageRatio = requiredFields.length === 0
    ? (availableFields.length > 0 ? 1 : 0)
    : round((requiredFields.length - missingFields.length) / requiredFields.length);

  return {
    requiredFields,
    availableFields,
    missingFields,
    coverageRatio,
  };
}

function buildVariableRoles(input: BuildTopicAnalysisPlanInput, fieldCoverage: AnalyticsFieldCoverage): AnalyticsVariableRole[] {
  const profileByName = new Map((input.datasetProfile?.columns ?? []).map((column) => [column.name, column]));
  return fieldCoverage.availableFields.map((field) => {
    const column = profileByName.get(field);
    const role = inferVariableRole(field, column?.inferredType);
    return {
      field,
      role,
      inferredType: column?.inferredType,
      confidence: role === "unknown" ? 0.35 : column ? 0.84 : 0.62,
      reason: roleReason(field, role, column?.inferredType),
    };
  });
}

function buildPlanQuestions(
  input: BuildTopicAnalysisPlanInput,
  mode: AnalyticsPlanMode,
  variableRoles: AnalyticsVariableRole[],
): AnalyticsPlanQuestion[] {
  if (mode === "report_only") {
    return [{
      id: "report-summary",
      title: `围绕“${input.opportunity.topic}”整理可信结论和证据`,
      rationale: "该主题目前更适合报告、对比或溯源，不强行进入统计建模。",
      priority: 100,
    }];
  }
  if (mode === "continue_crawl") {
    return [{
      id: "crawl-missing-data",
      title: `继续补齐“${input.opportunity.topic}”的数据字段和来源`,
      rationale: "当前字段覆盖不足，先补抓数据源再进入 Data Lab。",
      priority: 100,
    }];
  }

  const metrics = variableRoles.filter((item) => item.role === "metric" || item.role === "target");
  const dimensions = variableRoles.filter((item) => ["dimension", "group", "geography"].includes(item.role));
  const times = variableRoles.filter((item) => item.role === "time");
  const questions: AnalyticsPlanQuestion[] = [{
    id: "profile-data-quality",
    title: `“${input.opportunity.topic}”现有数据质量和字段覆盖如何？`,
    rationale: "先确认字段类型、缺失率、样本量和来源质量，避免在脏数据上直接建模。",
    priority: 96,
  }];

  if (metrics[0] && dimensions[0]) {
    questions.push({
      id: "compare-by-dimension",
      title: `${metrics[0].field} 在不同 ${dimensions[0].field} 下有什么差异？`,
      rationale: "适合市场、地区、人群、品牌、渠道等分组比较。",
      priority: 88,
    });
  }
  if (metrics[0] && times[0]) {
    questions.push({
      id: "trend-over-time",
      title: `${metrics[0].field} 是否存在时间趋势或周期变化？`,
      rationale: "当数据包含时间字段时，应优先检查趋势、拐点和异常波动。",
      priority: 82,
    });
  }
  if (mode === "full_analysis" && metrics.length >= 2) {
    questions.push({
      id: "drivers-and-models",
      title: `哪些变量可能解释或预测 ${metrics[0].field}？`,
      rationale: "完整分析模式允许在字段充分时进入相关、回归、聚类或时间序列。",
      priority: 76,
    });
  }

  return questions;
}

function buildMethodRecommendations(input: {
  mode: AnalyticsPlanMode;
  allowedOperations: string[];
  variableRoles: AnalyticsVariableRole[];
  fieldCoverage: AnalyticsFieldCoverage;
}): AnalyticsMethodRecommendation[] {
  const hasMetric = input.variableRoles.some((item) => item.role === "metric" || item.role === "target");
  const hasDimension = input.variableRoles.some((item) => ["dimension", "group", "geography"].includes(item.role));
  const hasTime = input.variableRoles.some((item) => item.role === "time");
  const lightMode = input.mode === "light_analysis";
  const reportOnly = input.mode === "report_only" || input.mode === "continue_crawl";

  const methods: AnalyticsMethodRecommendation[] = [
    method("profile", "字段画像和质量检查", "profile", !reportOnly && allows(input.allowedOperations, "profile"), "确认字段类型、缺失率、唯一值和样本量。", []),
    method("descriptive-statistics", "描述统计", "descriptive-statistics", !reportOnly && hasMetric && allows(input.allowedOperations, "stats"), "对数值指标输出均值、中位数、标准差和相关矩阵。", ["metric"]),
    method("frequency-tables", "频数表和构成分析", "frequency-tables", !reportOnly && hasDimension, "对分类字段做人群、地区、品牌、渠道等分布统计。", ["dimension"]),
    method("crosstab", "交叉表", "crosstab", !reportOnly && hasMetric && hasDimension && !lightMode, "完整模式下用于比较不同分组的指标差异。", ["metric", "dimension"]),
    method("statistical-tests", "显著性检验", "statistical-tests", !reportOnly && hasMetric && hasDimension && !lightMode, "字段满足时可进入 t 检验、ANOVA 或非参数检验。", ["metric", "group"]),
    method("linear-regression", "回归建模", "linear-regression", !reportOnly && hasMetric && !lightMode, "完整模式下探索影响因素和预测关系。", ["target", "metric"]),
    method("cluster-analysis", "聚类分析", "cluster-analysis", !reportOnly && hasMetric && !lightMode, "字段丰富时可发现样本群组和市场细分。", ["metric"]),
    method("time-series-analysis", "时间序列分析", "time-series-analysis", !reportOnly && hasMetric && hasTime && !lightMode, "有时间字段时检查趋势、季节性和异常点。", ["metric", "time"]),
  ];

  return methods.map((item) => {
    if (!item.allowed && lightMode && ["crosstab", "statistical-tests", "linear-regression", "cluster-analysis", "time-series-analysis"].includes(item.id)) {
      return { ...item, disabledReason: "轻量分析模式默认禁用重统计、建模和深度分析。" };
    }
    if (!item.allowed && input.fieldCoverage.missingFields.length > 0) {
      return { ...item, disabledReason: `缺少字段：${input.fieldCoverage.missingFields.slice(0, 4).join("、")}` };
    }
    return item;
  });
}

function buildChartRecommendations(input: {
  mode: AnalyticsPlanMode;
  profile: DatasetProfile | null;
  variableRoles: AnalyticsVariableRole[];
  allowedOperations: string[];
}): AnalyticsChartRecommendation[] {
  if (input.mode === "report_only" || input.mode === "continue_crawl") return [];
  const suggestions = input.profile ? suggestVisualizations(input.profile) : fallbackVisualizationSuggestions(input.variableRoles);
  return suggestions.slice(0, 8).map((suggestion) => ({
    id: suggestion.id,
    kind: suggestion.kind,
    title: suggestion.title,
    description: suggestion.description,
    fields: [suggestion.x, suggestion.y, suggestion.color].filter(Boolean).map(String),
    engine: suggestion.engine,
    allowed: allows(input.allowedOperations, "chart"),
  }));
}

function buildPlanRisks(input: {
  mode: AnalyticsPlanMode;
  opportunity: AnalysisOpportunity;
  fieldCoverage: AnalyticsFieldCoverage;
  profile: DatasetProfile | null;
  sourceRows: Array<Record<string, unknown>>;
}) {
  const risks = [...input.opportunity.warnings];
  if (input.fieldCoverage.missingFields.length > 0) {
    risks.push(`字段覆盖不足：${input.fieldCoverage.missingFields.slice(0, 6).join("、")}`);
  }
  if (input.profile && input.profile.rowCount === 0) {
    risks.push("当前数据集没有可分析行，需要先导入或物化数据源。");
  }
  if (!input.profile && input.sourceRows.length === 0 && input.mode !== "report_only") {
    risks.push("当前只有 Research opportunity，还没有 Data Lab 数据集或 source registry rows。");
  }
  if (input.mode === "light_analysis") {
    risks.push("轻量模式只允许画像、描述统计和基础图表，重统计/建模需要升级到完整分析。");
  }
  if (input.opportunity.score < 0.45 && input.mode === "full_analysis") {
    risks.push("系统评分偏低，完整分析前建议继续抓取或人工确认数据源。");
  }
  return unique(risks);
}

function nextActionsForPlan(
  mode: AnalyticsPlanMode,
  fieldCoverage: AnalyticsFieldCoverage,
  methods: AnalyticsMethodRecommendation[],
) {
  if (mode === "report_only") return ["在 Research 报告中继续整理证据和结论"];
  if (mode === "continue_crawl") return ["回到 Research discovery 补齐缺失字段和数据源"];
  const actions = ["确认字段映射", "物化或选择真实数据集", "先运行字段画像和质量检查"];
  if (fieldCoverage.missingFields.length > 0) {
    actions.push(`补齐缺失字段：${fieldCoverage.missingFields.slice(0, 4).join("、")}`);
  }
  if (methods.some((method) => method.allowed && method.kind === "linear-regression")) {
    actions.push("字段确认后可运行回归或驱动因素分析");
  }
  return actions;
}

function restrictionsForMode(mode: AnalyticsPlanMode) {
  if (mode === "report_only") return ["不创建可执行统计任务，Research 报告是主产物。"];
  if (mode === "continue_crawl") return ["先补抓数据，暂不运行 Data Lab 统计任务。"];
  if (mode === "light_analysis") return ["默认只允许 profile、stats、chart；回归、聚类、深度学习和重导出禁用。"];
  return ["完整分析仍需要真实数据集和字段覆盖，数值结果只能由确定性 Worker 产生。"];
}

function normalizeAllowedOperations(mode: AnalyticsPlanMode, operations?: string[]) {
  if (operations?.length) return operations;
  if (mode === "light_analysis") return ["profile", "stats", "chart"];
  if (mode === "full_analysis") return ["profile", "stats", "quality", "frequency", "crosstab", "tests", "regression", "cluster", "timeseries", "geo", "chart", "report", "export"];
  if (mode === "continue_crawl") return ["discovery", "planned_queries"];
  return [];
}

function allows(operations: string[], operation: string) {
  if (operations.includes(operation)) return true;
  if (operation === "chart") return operations.includes("visualization");
  if (operation === "stats") return operations.includes("descriptive-statistics");
  return false;
}

function method(
  id: AnalyticsMethodRecommendation["id"],
  title: string,
  kind: AnalyticsMethodRecommendation["kind"],
  allowed: boolean,
  reason: string,
  requiredRoles: AnalyticsVariableRoleName[],
): AnalyticsMethodRecommendation {
  return { id, title, kind, allowed, reason, requiredRoles };
}

function fallbackVisualizationSuggestions(roles: AnalyticsVariableRole[]): VisualizationSuggestion[] {
  const metric = roles.find((item) => item.role === "metric" || item.role === "target")?.field;
  const dimension = roles.find((item) => ["dimension", "group", "geography"].includes(item.role))?.field;
  const time = roles.find((item) => item.role === "time")?.field;
  const suggestions: VisualizationSuggestion[] = [];
  if (dimension && metric) {
    suggestions.push({ id: "topic-bar", kind: "bar", title: `${dimension} 对 ${metric}`, description: "按维度聚合核心指标。", x: dimension, y: metric, engine: "echarts", exportFormats: ["png", "svg", "html"] });
    suggestions.push({ id: "topic-pie", kind: "pie", title: `${dimension} 构成`, description: "查看维度占比结构。", x: dimension, y: metric, engine: "echarts", exportFormats: ["png", "svg", "html"] });
  }
  if (time && metric) {
    suggestions.push({ id: "topic-line", kind: "line", title: `${metric} 时间趋势`, description: "查看指标随时间变化。", x: time, y: metric, engine: "plotly", exportFormats: ["png", "svg", "html"] });
  }
  if (metric) {
    suggestions.push({ id: "topic-histogram", kind: "histogram", title: `${metric} 分布`, description: "查看指标分布和异常值。", x: metric, engine: "seaborn", exportFormats: ["png", "svg", "pdf"] });
  }
  return suggestions;
}

function inferVariableRole(field: string, inferredType?: string): AnalyticsVariableRoleName {
  const value = field.toLowerCase();
  if (/(id|uuid|url|链接|编号)/.test(value)) return "identifier";
  if (/(date|time|year|month|day|quarter|时间|日期|年份|月份|季度)/.test(value)) return "time";
  if (/(region|province|city|country|state|location|geo|地区|省|城市|国家|区域)/.test(value)) return "geography";
  if (/(revenue|sales|amount|count|price|rate|ratio|share|score|value|volume|营收|销售|金额|数量|价格|率|占比|份额|评分|销量|购买)/.test(value)) return inferredType === "string" ? "dimension" : "metric";
  if (/(brand|channel|category|source|segment|group|type|品牌|渠道|类别|来源|人群|分组|类型)/.test(value)) return "dimension";
  if (/(title|summary|text|content|snippet|正文|摘要|标题)/.test(value)) return "text";
  if (inferredType === "number") return "metric";
  if (inferredType === "date") return "time";
  if (inferredType === "string" || inferredType === "boolean") return "dimension";
  return "unknown";
}

function roleReason(field: string, role: AnalyticsVariableRoleName, inferredType?: string) {
  if (role === "unknown") return `${field} 暂无法判断角色，需要人工确认。`;
  if (inferredType) return `${field} 根据字段名和 ${inferredType} 类型推断为 ${role}。`;
  return `${field} 根据字段名语义推断为 ${role}。`;
}

function hasFieldLike(fields: string[], target: string) {
  const normalizedTarget = normalizeField(target);
  return fields.some((field) => {
    const normalized = normalizeField(field);
    return normalized === normalizedTarget || normalized.includes(normalizedTarget) || normalizedTarget.includes(normalized);
  });
}

function collectRowFields(rows: Array<Record<string, unknown>>) {
  const fields = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row ?? {})) fields.add(key);
  }
  return [...fields];
}

function normalizeField(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
