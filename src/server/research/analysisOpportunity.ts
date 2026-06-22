import {
  AnalysisOpportunity,
  AnalysisOpportunityDataSource,
  AnalysisOpportunityMode,
  AnalysisOpportunityScoreBreakdown,
  AnalysisOpportunityTaskType,
  CrawlDocument,
  DiscoveryResult,
  EvidenceClaim,
  EvidenceItem,
  ExtractedTableRecord,
  FrontierItem,
  ResearchJob,
  ResearchReport,
  ResearchRun,
  SearchCandidate,
  SourceProfile,
  SourceType,
} from "./types";

export interface BuildAnalysisOpportunityInput {
  job: ResearchJob;
  run: ResearchRun;
  report?: ResearchReport | null;
  documents: CrawlDocument[];
  tables: ExtractedTableRecord[];
  assets: Array<{ url: string; assetType?: string; metadata?: Record<string, unknown> }>;
  candidates: SearchCandidate[];
  frontier: FrontierItem[];
  providers: DiscoveryResult[];
  evidence: EvidenceItem[];
  claims: EvidenceClaim[];
  sourceProfiles: SourceProfile[];
}

const SCORE_WEIGHTS = {
  structuredFieldDensity: 0.2,
  dimensionRichness: 0.18,
  sourceQuality: 0.2,
  evidenceCoverage: 0.16,
  analysisValue: 0.16,
  topicFit: 0.1,
};

const MARKET_TERMS = ["市场", "规模", "销量", "营收", "地区", "渠道", "人群", "购买", "增长", "份额", "market", "sales", "revenue", "consumer", "region"];
const TOOL_TERMS = ["工具", "软件", "编辑器", "好用", "对比", "功能", "价格", "license", "github", "文档", "tool", "editor", "compare"];
const NEWS_TRACE_TERMS = ["溯源", "查证", "真假", "事实", "新闻", "传播", "timeline", "source", "fact"];
const DATA_FIELD_TERMS = ["year", "年份", "date", "地区", "region", "province", "city", "revenue", "营收", "sales", "销量", "amount", "金额", "rate", "率", "count", "数量", "brand", "品牌", "channel", "渠道", "age", "年龄", "population", "人群"];
const DIMENSION_TERMS = ["year", "年份", "date", "地区", "region", "province", "city", "brand", "品牌", "channel", "渠道", "age", "年龄", "gender", "性别", "category", "分类"];
const NUMERIC_TERMS = ["revenue", "营收", "sales", "销量", "amount", "金额", "rate", "率", "count", "数量", "price", "价格", "downloads", "stars", "人口", "市场规模"];
const DATA_SOURCE_TYPES = new Set<SourceType>(["dataset", "data-catalog", "structured-api", "sports-data", "geospatial", "financial-data"]);

export function buildAnalysisOpportunity(input: BuildAnalysisOpportunityInput): AnalysisOpportunity {
  const topic = input.job.topic;
  const taskType = classifyTaskType(topic, input);
  const signalText = collectSignalText(input);
  const availableFields = detectFields(signalText);
  const requiredFields = requiredFieldsForTaskType(taskType, topic);
  const missingFields = requiredFields.filter((field) => !availableFields.includes(field));
  const candidateFeatures = unique([...requiredFields, ...availableFields, ...topicFeatures(topic, taskType)]).slice(0, 18);
  const recommendedDataSources = recommendedSources(input).slice(0, 10);
  const scoreBreakdown = scoreOpportunity({ input, taskType, availableFields, requiredFields, recommendedDataSources });
  const score = scoreBreakdown.finalScore;
  const recommendedAnalysisMode = chooseMode({ taskType, score, availableFields, requiredFields, recommendedDataSources, missingFields });
  const canEnterDataLab = recommendedAnalysisMode === "light_analysis" || recommendedAnalysisMode === "full_analysis";
  const warnings = buildWarnings({ input, recommendedAnalysisMode, missingFields, recommendedDataSources });

  return {
    topic,
    researchRunId: input.run.id,
    researchJobId: input.job.id,
    reportId: input.report?.id,
    taskType,
    canEnterDataLab,
    recommendedAnalysisMode,
    score,
    scoreBreakdown,
    decisionReason: decisionReason({ taskType, recommendedAnalysisMode, score, availableFields, missingFields, recommendedDataSources }),
    candidateFeatures,
    requiredFields,
    availableFields,
    missingFields,
    recommendedDataSources,
    recommendedActions: recommendedActionsForMode(recommendedAnalysisMode, missingFields),
    evidenceSummary: [
      ...input.claims.slice(0, 4).map((claim) => ({
        claim: claim.claim,
        sourceUrl: claim.primarySourceUrl,
        support: `claim_confidence:${Math.round(claim.confidence * 100)}%`,
      })),
      ...input.evidence.slice(0, 4).map((item) => ({
        sourceUrl: item.sourceUrl,
        documentId: item.documentId,
        support: item.explanation || item.snippet.slice(0, 140),
      })),
    ].slice(0, 6),
    warnings,
    createdDatasetIds: [],
    status: "ready",
  };
}

function classifyTaskType(topic: string, input: BuildAnalysisOpportunityInput): AnalysisOpportunityTaskType {
  const text = `${topic} ${collectSignalText(input)}`.toLowerCase();
  if (MARKET_TERMS.some((term) => text.includes(term.toLowerCase()))) return "market-research";
  if (NEWS_TRACE_TERMS.some((term) => text.includes(term.toLowerCase()))) return "news-trace";
  if (TOOL_TERMS.some((term) => text.includes(term.toLowerCase()))) return "product-comparison";
  if (input.frontier.some((item) => DATA_SOURCE_TYPES.has(item.sourceType))) return "data-research";
  return "unknown";
}

function requiredFieldsForTaskType(taskType: AnalysisOpportunityTaskType, topic: string) {
  const lower = topic.toLowerCase();
  if (taskType === "market-research") {
    const defaults = ["year", "region", "market_size", "sales", "revenue", "channel", "brand"];
    if (lower.includes("避孕套")) return [...defaults, "purchase_rate", "birth_rate", "marriage_rate", "age_group"];
    return defaults;
  }
  if (taskType === "sports-analysis") return ["team", "player", "season", "match_date", "score", "win_rate"];
  if (taskType === "product-comparison") return ["product", "price", "license", "feature", "release_date", "stars"];
  if (taskType === "news-trace") return ["event_date", "source", "claim", "timeline", "publisher"];
  return ["year", "category", "value"];
}

function topicFeatures(topic: string, taskType: AnalysisOpportunityTaskType) {
  const features = DATA_FIELD_TERMS.filter((term) => topic.toLowerCase().includes(term.toLowerCase()));
  if (taskType === "market-research") features.push("market_size", "sales", "revenue", "region", "channel");
  if (taskType === "product-comparison") features.push("product", "feature", "price", "license", "stars");
  if (taskType === "news-trace") features.push("timeline", "source", "claim");
  return features;
}

function detectFields(text: string) {
  const lower = text.toLowerCase();
  const fields = DATA_FIELD_TERMS.filter((term) => lower.includes(term.toLowerCase()));
  const normalized = fields.map((field) => normalizeFieldName(field));
  return unique(normalized);
}

function normalizeFieldName(field: string) {
  const lower = field.toLowerCase();
  const map: Record<string, string> = {
    "年份": "year",
    "地区": "region",
    "营收": "revenue",
    "销量": "sales",
    "金额": "amount",
    "数量": "count",
    "率": "rate",
    "品牌": "brand",
    "渠道": "channel",
    "年龄": "age",
    "人群": "population",
    "市场规模": "market_size",
  };
  return map[field] ?? map[lower] ?? lower.replace(/\s+/g, "_");
}

function collectSignalText(input: BuildAnalysisOpportunityInput) {
  return [
    input.job.topic,
    input.report?.markdown ?? "",
    input.documents.map((doc) => `${doc.title ?? ""} ${doc.url} ${doc.contentText ?? ""} ${JSON.stringify(doc.metadata ?? {})}`).join(" "),
    input.tables.map((table) => `${table.caption ?? ""} ${table.headers.join(" ")} ${table.rows.slice(0, 5).flat().join(" ")}`).join(" "),
    input.assets.map((asset) => `${asset.url} ${asset.assetType ?? ""} ${JSON.stringify(asset.metadata ?? {})}`).join(" "),
    input.candidates.map((candidate) => `${candidate.title} ${candidate.snippet} ${candidate.url}`).join(" "),
    input.frontier.map((item) => `${item.sourceType} ${item.reason} ${item.url} ${item.lastError ?? ""}`).join(" "),
    input.providers.map((provider) => `${provider.provider} ${provider.providerType} ${provider.error ?? ""}`).join(" "),
    input.evidence.map((item) => `${item.snippet} ${item.explanation} ${item.entities.join(" ")}`).join(" "),
    input.claims.map((claim) => claim.claim).join(" "),
    input.sourceProfiles.map((profile) => `${profile.domain} ${profile.sourceType} ${profile.authorityTier} ${profile.notes.join(" ")}`).join(" "),
  ].join(" ");
}

function recommendedSources(input: BuildAnalysisOpportunityInput): AnalysisOpportunityDataSource[] {
  const fromFrontier = input.frontier
    .filter((item) => DATA_SOURCE_TYPES.has(item.sourceType) || isStructuredUrl(item.url))
    .map((item) => ({
      kind: item.sourceType,
      url: item.url,
      title: item.reason || item.url,
      reason: `frontier:${item.status}; priority:${Math.round(item.priorityScore * 100)}%`,
      sourceType: item.sourceType,
      qualityScore: item.priorityScore,
    }));
  const fromCandidates = input.candidates
    .filter((candidate) => isStructuredUrl(candidate.url))
    .map((candidate) => ({
      kind: formatHint(candidate.url),
      url: candidate.url,
      title: candidate.title,
      reason: `candidate:${candidate.provider}; ${candidate.snippet.slice(0, 120)}`,
      provider: candidate.provider,
      qualityScore: 0.68,
    }));
  const fromTables = input.tables.map((table) => ({
    kind: "table",
    title: table.caption || `table:${table.documentId}`,
    reason: `headers:${table.headers.slice(0, 8).join("|")}; rows:${table.rows.length}`,
    qualityScore: table.rows.length > 5 ? 0.78 : 0.55,
  }));
  return uniqueSources([...fromFrontier, ...fromCandidates, ...fromTables]);
}

function scoreOpportunity(input: {
  input: BuildAnalysisOpportunityInput;
  taskType: AnalysisOpportunityTaskType;
  availableFields: string[];
  requiredFields: string[];
  recommendedDataSources: AnalysisOpportunityDataSource[];
}): AnalysisOpportunityScoreBreakdown {
  const structuredSignalCount =
    input.input.tables.length +
    input.input.assets.filter((asset) => isStructuredUrl(asset.url) || ["json", "pdf"].includes(String(asset.assetType ?? "").toLowerCase())).length +
    input.input.frontier.filter((item) => DATA_SOURCE_TYPES.has(item.sourceType) || isStructuredUrl(item.url)).length;
  const structuredFieldDensity = clamp(input.availableFields.length / Math.max(1, input.requiredFields.length));
  const dimensionRichness = clamp(DIMENSION_TERMS.filter((term) => input.availableFields.includes(normalizeFieldName(term))).length / 4);
  const sourceQuality = clamp((input.recommendedDataSources.reduce((sum, source) => sum + (source.qualityScore ?? 0.6), 0) / Math.max(1, input.recommendedDataSources.length)) + Math.min(0.2, structuredSignalCount * 0.025));
  const evidenceCoverage = clamp((input.input.evidence.length * 0.08) + (input.input.claims.length * 0.1) + (input.input.documents.filter((doc) => doc.status === "fetched").length * 0.025));
  const analysisValue = clamp((NUMERIC_TERMS.filter((term) => collectSignalText(input.input).toLowerCase().includes(term.toLowerCase())).length / 6) + (structuredSignalCount > 0 ? 0.25 : 0));
  const topicFit = input.taskType === "market-research" || input.taskType === "data-research" || input.taskType === "sports-analysis"
    ? 0.95
    : input.taskType === "product-comparison" || input.taskType === "news-trace"
      ? 0.35
      : 0.55;
  const finalScore = clamp(
    structuredFieldDensity * SCORE_WEIGHTS.structuredFieldDensity +
    dimensionRichness * SCORE_WEIGHTS.dimensionRichness +
    sourceQuality * SCORE_WEIGHTS.sourceQuality +
    evidenceCoverage * SCORE_WEIGHTS.evidenceCoverage +
    analysisValue * SCORE_WEIGHTS.analysisValue +
    topicFit * SCORE_WEIGHTS.topicFit,
  );
  return {
    structuredFieldDensity,
    dimensionRichness,
    sourceQuality,
    evidenceCoverage,
    analysisValue,
    topicFit,
    weights: SCORE_WEIGHTS,
    finalScore,
  };
}

function chooseMode(input: {
  taskType: AnalysisOpportunityTaskType;
  score: number;
  availableFields: string[];
  requiredFields: string[];
  recommendedDataSources: AnalysisOpportunityDataSource[];
  missingFields: string[];
}): AnalysisOpportunityMode {
  const numericLikeFields = input.availableFields.filter((field) => NUMERIC_TERMS.some((term) => normalizeFieldName(term) === field || field.includes(normalizeFieldName(term))));
  const dimensionLikeFields = input.availableFields.filter((field) => DIMENSION_TERMS.some((term) => normalizeFieldName(term) === field || field.includes(normalizeFieldName(term))));
  if (input.taskType === "product-comparison" && input.score < 0.75) return input.score >= 0.45 ? "light_analysis" : "report_only";
  if (input.taskType === "news-trace" && input.score < 0.7) return input.score >= 0.5 ? "light_analysis" : "report_only";
  if (input.score >= 0.75 && numericLikeFields.length >= 2 && dimensionLikeFields.length >= 1) return "full_analysis";
  if ((input.taskType === "market-research" || input.taskType === "data-research") && input.recommendedDataSources.length > 0) {
    return input.missingFields.length > input.requiredFields.length / 2 ? "continue_crawl" : "full_analysis";
  }
  if (input.score >= 0.45) return "light_analysis";
  return input.missingFields.length > 0 && input.recommendedDataSources.length > 0 ? "continue_crawl" : "report_only";
}

function decisionReason(input: {
  taskType: AnalysisOpportunityTaskType;
  recommendedAnalysisMode: AnalysisOpportunityMode;
  score: number;
  availableFields: string[];
  missingFields: string[];
  recommendedDataSources: AnalysisOpportunityDataSource[];
}) {
  const scoreText = `${Math.round(input.score * 100)}%`;
  if (input.recommendedAnalysisMode === "full_analysis") {
    return `可分析性 ${scoreText}：已发现 ${input.availableFields.length} 个字段线索和 ${input.recommendedDataSources.length} 个可结构化来源，适合进入完整 Data Lab。`;
  }
  if (input.recommendedAnalysisMode === "light_analysis") {
    return `可分析性 ${scoreText}：当前适合先做字段画像、描述统计和基础图表，重型建模需要更多字段。`;
  }
  if (input.recommendedAnalysisMode === "continue_crawl") {
    return `可分析性 ${scoreText}：课题需要数据分析，但仍缺 ${input.missingFields.slice(0, 5).join(", ")} 等字段，建议继续补抓数据源。`;
  }
  return `可分析性 ${scoreText}：${input.taskType} 更适合保留 Research 报告或对比分析，不建议强行进入完整统计分析。`;
}

function recommendedActionsForMode(mode: AnalysisOpportunityMode, missingFields: string[]) {
  if (mode === "full_analysis") return ["创建或复用数据源清单", "物化关键数据源", "生成数据画像", "进入完整分析向导"];
  if (mode === "light_analysis") return ["创建或复用轻量数据集", "生成字段画像", "运行描述统计", "生成基础图表"];
  if (mode === "continue_crawl") return ["追加缺失字段检索式", ...missingFields.slice(0, 4).map((field) => `补抓字段:${field}`)];
  return ["保留 Research 报告", "查看证据表", "导出来源列表"];
}

function buildWarnings(input: {
  input: BuildAnalysisOpportunityInput;
  recommendedAnalysisMode: AnalysisOpportunityMode;
  missingFields: string[];
  recommendedDataSources: AnalysisOpportunityDataSource[];
}) {
  const warnings: string[] = [];
  if (input.input.documents.filter((doc) => doc.status === "fetched").length === 0) warnings.push("no_fetched_documents");
  if (input.recommendedDataSources.length === 0) warnings.push("no_structured_data_sources");
  if (input.missingFields.length > 0) warnings.push(`missing_fields:${input.missingFields.slice(0, 8).join("|")}`);
  if (input.recommendedAnalysisMode === "full_analysis" && input.missingFields.length > 0) warnings.push("full_analysis_requires_field_review");
  return warnings;
}

function isStructuredUrl(url: string) {
  const lower = url.toLowerCase();
  return [".csv", ".json", ".jsonl", ".xlsx", ".xls", ".parquet", ".geojson", ".pdf", "api", "dataset", "data."].some((term) => lower.includes(term));
}

function formatHint(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("api")) return "structured-api";
  return "structured-source";
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function uniqueSources(items: AnalysisOpportunityDataSource[]) {
  const seen = new Set<string>();
  const result: AnalysisOpportunityDataSource[] = [];
  for (const item of items) {
    const key = item.url ?? `${item.kind}:${item.title}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
