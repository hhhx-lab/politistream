import { DiscoveryResult, FrontierItem, SearchCandidate } from "../research/types";

const DATA_SOURCE_TYPES = new Set([
  "dataset",
  "data-catalog",
  "structured-api",
  "competition-data",
  "sports-data",
  "geospatial",
  "financial-data",
]);

const DATA_PROVIDER_TYPES = new Set([
  "data-catalog",
  "structured-api",
  "competition-data",
  "sports-data",
]);

export interface ResearchDataSourceRowsInput {
  runId: string;
  candidates: SearchCandidate[];
  frontier: FrontierItem[];
  providers: DiscoveryResult[];
}

export interface ResearchDataSourceDatasetSummary {
  runId: string;
  candidateCount: number;
  frontierCount: number;
  providerCount: number;
  dataSourceCount: number;
  providerTypes: string[];
  sourceTypes: string[];
}

export function buildResearchDataSourceRows(input: ResearchDataSourceRowsInput): {
  rows: Array<Record<string, unknown>>;
  summary: ResearchDataSourceDatasetSummary;
} {
  const frontierByCanonicalUrl = new Map(input.frontier.map((item) => [item.canonicalUrl, item]));
  const rows = input.candidates
    .map((candidate) => {
      const frontier = frontierByCanonicalUrl.get(candidate.canonicalUrl);
      const providerRows = providersForCandidate(candidate, frontier, input.providers);
      return dataSourceRowFromCandidate(candidate, frontier, providerRows);
    })
    .filter((row) => row !== null);

  const knownCanonicalUrls = new Set(rows.map((row) => String(row.canonical_url)));
  for (const item of input.frontier) {
    if (knownCanonicalUrls.has(item.canonicalUrl)) continue;
    if (!isDataSourceType(item.sourceType)) continue;
    rows.push(dataSourceRowFromFrontierItem(item, input.providers));
  }

  rows.sort((left, right) => Number(right.priority_score ?? 0) - Number(left.priority_score ?? 0));

  return {
    rows,
    summary: {
      runId: input.runId,
      candidateCount: input.candidates.length,
      frontierCount: input.frontier.length,
      providerCount: input.providers.length,
      dataSourceCount: rows.length,
      providerTypes: unique(rows.map((row) => String(row.provider_type ?? "")).filter(Boolean)),
      sourceTypes: unique(rows.map((row) => String(row.source_type ?? "")).filter(Boolean)),
    },
  };
}

function dataSourceRowFromCandidate(
  candidate: SearchCandidate,
  frontier: FrontierItem | undefined,
  providers: DiscoveryResult[],
): Record<string, unknown> | null {
  const sourceType = frontier?.sourceType ?? inferDataSourceType(candidate.url, candidate.provider);
  const providerType = providers.find((provider) => provider.provider === candidate.provider)?.providerType
    ?? providerTypeFromSourceType(sourceType);
  if (!isDataSourceType(sourceType) && !DATA_PROVIDER_TYPES.has(providerType)) return null;

  return withQualityFields({
    title: candidate.title || candidate.url,
    url: candidate.url,
    canonical_url: candidate.canonicalUrl,
    provider: candidate.provider,
    provider_type: providerType,
    source_type: sourceType,
    query: candidate.query,
    query_id: frontier?.queryId ?? "",
    rank: "",
    depth: candidate.depth,
    priority_score: round(frontier?.priorityScore ?? priorityFromProviderType(providerType)),
    status: frontier?.status ?? "candidate",
    published_at: candidate.publishedAt ?? "",
    snippet: candidate.snippet,
    access_mode: inferAccessMode(candidate.url, providerType),
    format_hint: inferFormatHint(candidate.url),
    license_hint: inferLicenseHint(candidate.url, candidate.snippet),
    provider_calls: providers.length,
    provider_errors: providers.filter((provider) => provider.error).length,
    provider_latency_ms: providers.reduce((total, provider) => total + provider.durationMs, 0),
    lineage_json: JSON.stringify({
      runId: candidate.runId,
      jobId: candidate.jobId,
      candidateId: candidate.id,
      frontierId: frontier?.id,
      discoveredFromUrl: candidate.discoveredFromUrl,
      providers: providers.map((provider) => ({
        id: provider.id,
        provider: provider.provider,
        providerType: provider.providerType,
        queryId: provider.queryId,
        candidateCount: provider.candidateCount,
        error: provider.error,
      })),
    }),
  });
}

function dataSourceRowFromFrontierItem(item: FrontierItem, providers: DiscoveryResult[]): Record<string, unknown> {
  const matchingProviders = item.queryId
    ? providers.filter((provider) => provider.queryId === item.queryId)
    : providers.filter((provider) => DATA_PROVIDER_TYPES.has(provider.providerType));
  const provider = matchingProviders[0];
  const providerType = provider?.providerType ?? providerTypeFromSourceType(item.sourceType);

  return withQualityFields({
    title: item.reason || item.url,
    url: item.url,
    canonical_url: item.canonicalUrl,
    provider: provider?.provider ?? "frontier",
    provider_type: providerType,
    source_type: item.sourceType,
    query: item.reason,
    query_id: item.queryId ?? "",
    rank: "",
    depth: item.depth,
    priority_score: round(item.priorityScore),
    status: item.status,
    published_at: "",
    snippet: item.lastError ?? "",
    access_mode: inferAccessMode(item.url, providerType),
    format_hint: inferFormatHint(item.url),
    license_hint: inferLicenseHint(item.url, item.reason),
    provider_calls: matchingProviders.length,
    provider_errors: matchingProviders.filter((row) => row.error).length,
    provider_latency_ms: matchingProviders.reduce((total, row) => total + row.durationMs, 0),
    lineage_json: JSON.stringify({
      runId: item.runId,
      jobId: item.jobId,
      frontierId: item.id,
      discoveredFromUrl: item.discoveredFromUrl,
      discoveredFromDocumentId: item.discoveredFromDocumentId,
      providers: matchingProviders.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerType: row.providerType,
        queryId: row.queryId,
        candidateCount: row.candidateCount,
        error: row.error,
      })),
    }),
  });
}

export function scoreDataSourceQuality(row: Record<string, unknown>) {
  const priority = normalizePriority(row.priority_score);
  const providerType = String(row.provider_type ?? "");
  const accessMode = String(row.access_mode ?? "");
  const formatHint = String(row.format_hint ?? "");
  const licenseHint = String(row.license_hint ?? "");
  const status = String(row.status ?? "");
  const providerErrors = Number(row.provider_errors ?? 0);
  const providerCalls = Number(row.provider_calls ?? 0);

  const providerScore = providerTypeScore(providerType);
  const accessScore = accessModeScore(accessMode);
  const formatScore = formatHintScore(formatHint);
  const licenseScore = licenseHintScore(licenseHint);
  const statusScore = status === "fetched" || status === "candidate" || status === "queued" ? 1 : status === "failed" || status === "skipped" ? 0.35 : 0.65;
  const providerReliability = providerCalls > 0 ? Math.max(0, 1 - providerErrors / providerCalls) : 0.75;
  const score = round(
    priority * 0.32 +
    providerScore * 0.2 +
    accessScore * 0.16 +
    formatScore * 0.16 +
    licenseScore * 0.08 +
    statusScore * 0.04 +
    providerReliability * 0.04,
  );
  return {
    source_quality_score: score,
    dataset_quality_tier: score >= 0.86 ? "A" : score >= 0.72 ? "B" : score >= 0.58 ? "C" : "D",
    materialize_readiness: materializeReadiness(accessMode, formatHint),
    quality_reason: [
      `priority:${Math.round(priority * 100)}%`,
      `provider:${providerType || "unknown"}`,
      `access:${accessMode || "unknown"}`,
      `format:${formatHint || "unknown"}`,
      `license:${licenseHint || "unknown"}`,
      providerErrors > 0 ? `provider_errors:${providerErrors}` : "provider_errors:0",
    ].join("; "),
  };
}

function withQualityFields(row: Record<string, unknown>) {
  const quality = scoreDataSourceQuality(row);
  return {
    ...row,
    ...quality,
    analysis_field_hints: inferAnalysisFieldHints(row),
    analysis_next_step: analysisNextStep(quality.materialize_readiness, inferAnalysisFieldHints(row)),
  };
}

function providersForCandidate(candidate: SearchCandidate, frontier: FrontierItem | undefined, providers: DiscoveryResult[]) {
  if (frontier?.queryId) {
    const matches = providers.filter((provider) => provider.queryId === frontier.queryId);
    if (matches.length > 0) return matches;
  }
  const providerMatches = providers.filter((provider) => provider.provider === candidate.provider);
  if (providerMatches.length > 0) return providerMatches;
  return providers.filter((provider) => DATA_PROVIDER_TYPES.has(provider.providerType));
}

function isDataSourceType(sourceType: string) {
  return DATA_SOURCE_TYPES.has(sourceType);
}

function providerTypeFromSourceType(sourceType: string) {
  if (sourceType === "sports-data") return "sports-data";
  if (sourceType === "dataset" || sourceType === "data-catalog" || sourceType === "geospatial") return "data-catalog";
  if (sourceType === "structured-api" || sourceType === "financial-data") return "structured-api";
  return "web-search";
}

function inferDataSourceType(url: string, provider: string) {
  const value = `${provider} ${url}`.toLowerCase();
  if (value.includes("kaggle")) return "dataset";
  if (value.includes("data.gov") || value.includes("ckan") || value.includes("socrata") || value.includes("arcgis")) return "data-catalog";
  if (value.includes("worldbank") || value.includes("fred") || value.includes("/api/")) return "structured-api";
  if (value.includes("sports")) return "sports-data";
  if (value.includes("openml") || value.includes("huggingface.co/datasets")) return "dataset";
  return "unknown";
}

function inferAnalysisFieldHints(row: Record<string, unknown>) {
  const value = [
    row.title,
    row.url,
    row.snippet,
    row.query,
    row.source_type,
    row.provider_type,
  ].map((item) => String(item ?? "").toLowerCase()).join(" ");
  const hints = new Set<string>();
  if (/(region|province|city|country|state|geo|area|地区|省|城市|国家|区域)/.test(value)) {
    hints.add("region");
  }
  if (/(date|time|year|month|quarter|timeline|时间|日期|年份|月份|季度|趋势)/.test(value)) {
    hints.add("time");
  }
  if (/(sales|revenue|income|amount|volume|price|market|营收|收入|销售|销量|价格|市场|份额|购买)/.test(value)) {
    hints.add("metric");
  }
  if (/(brand|company|manufacturer|channel|category|segment|品牌|公司|厂商|渠道|类别|人群)/.test(value)) {
    hints.add("dimension");
  }
  if (/(population|consumer|user|demographic|age|gender|人群|用户|消费者|人口|年龄|性别)/.test(value)) {
    hints.add("audience");
  }
  if (/(score|rating|review|rank|评价|评分|排名)/.test(value)) {
    hints.add("rating");
  }
  if (/(lat|lon|lng|map|geojson|坐标|经纬度|地图)/.test(value)) {
    hints.add("geography");
  }
  if (hints.size === 0) {
    const sourceType = String(row.source_type ?? row.provider_type ?? "");
    if (sourceType.includes("sports")) hints.add("sports_metric");
    if (sourceType.includes("financial")) hints.add("financial_metric");
    if (sourceType.includes("structured") || sourceType.includes("data")) hints.add("structured_fields");
  }
  return [...hints];
}

function analysisNextStep(materializeReadiness: string, hints: string[]) {
  if (materializeReadiness === "ready" && hints.length > 0) return "materialize_then_profile";
  if (materializeReadiness === "ready") return "materialize_then_inspect_fields";
  if (materializeReadiness === "platform-auth") return "open_platform_or_add_credentials";
  return "review_source_before_analysis";
}

function inferAccessMode(url: string, providerType: string) {
  const normalized = url.toLowerCase();
  if (providerType === "structured-api" || normalized.includes("/api/")) return "api";
  if (normalized.endsWith(".csv") || normalized.endsWith(".json") || normalized.endsWith(".zip")) return "download";
  if (normalized.includes("kaggle.com")) return "platform";
  return "landing-page";
}

function inferFormatHint(url: string) {
  const normalized = url.toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".json") || normalized.includes("format=json")) return "json";
  if (normalized.endsWith(".xlsx") || normalized.endsWith(".xls")) return "excel";
  if (normalized.endsWith(".parquet")) return "parquet";
  if (normalized.endsWith(".zip")) return "archive";
  if (normalized.includes("arcgis")) return "geojson";
  return "unknown";
}

function inferLicenseHint(url: string, text: string) {
  const value = `${url} ${text}`.toLowerCase();
  if (value.includes("open data") || value.includes("data.gov")) return "open-data";
  if (value.includes("license")) return "license-mentioned";
  if (value.includes("kaggle")) return "platform-specific";
  return "unknown";
}

function priorityFromProviderType(providerType: string) {
  if (providerType === "structured-api") return 0.86;
  if (providerType === "data-catalog") return 0.82;
  if (providerType === "competition-data") return 0.78;
  if (providerType === "sports-data") return 0.76;
  return 0.65;
}

function normalizePriority(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.65;
  return number > 1 ? Math.min(1, number / 100) : Math.max(0, Math.min(1, number));
}

function providerTypeScore(providerType: string) {
  if (providerType === "structured-api") return 0.94;
  if (providerType === "data-catalog") return 0.9;
  if (providerType === "competition-data") return 0.84;
  if (providerType === "sports-data") return 0.82;
  return 0.62;
}

function accessModeScore(accessMode: string) {
  if (accessMode === "api") return 0.96;
  if (accessMode === "download") return 0.92;
  if (accessMode === "platform") return 0.68;
  if (accessMode === "landing-page") return 0.52;
  return 0.45;
}

function formatHintScore(formatHint: string) {
  if (["csv", "json", "jsonl", "excel", "parquet", "geojson"].includes(formatHint)) return 0.95;
  if (formatHint === "archive") return 0.55;
  if (formatHint === "unknown") return 0.42;
  return 0.5;
}

function licenseHintScore(licenseHint: string) {
  if (licenseHint === "open-data") return 0.95;
  if (licenseHint === "license-mentioned") return 0.78;
  if (licenseHint === "platform-specific") return 0.62;
  return 0.45;
}

function materializeReadiness(accessMode: string, formatHint: string) {
  if (["csv", "json", "jsonl", "excel", "parquet", "geojson"].includes(formatHint) && (accessMode === "api" || accessMode === "download")) {
    return "ready";
  }
  if (accessMode === "platform") return "platform-auth";
  if (formatHint === "archive") return "needs-unpack";
  return "needs-review";
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
