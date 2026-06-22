import { getDomain } from "../url";
import { DiscoveryProviderType, FrontierScoreBreakdown, SourceType } from "../types";

export const FRONTIER_SCORE_WEIGHTS = {
  topicalRelevance: 0.25,
  sourceAuthority: 0.25,
  primarySourceLikelihood: 0.20,
  freshness: 0.10,
  sourceDiversity: 0.10,
  linkContextQuality: 0.10,
} as const;

export interface FrontierScoreInput {
  url: string;
  provider?: string;
  providerType?: DiscoveryProviderType;
  sourceType: SourceType;
  title?: string;
  snippet?: string;
  query?: string;
  rank?: number;
  topic: string;
  depth: number;
  discoveredDomainCount: number;
}

export function scoreFrontierItem(input: FrontierScoreInput) {
  return scoreFrontierItemBreakdown(input).finalScore;
}

export function scoreFrontierItemBreakdown(input: FrontierScoreInput): FrontierScoreBreakdown {
  const sourceAuthority = scoreSourceAuthority(input.url, input.sourceType);
  const topicalRelevance = scoreTopicalRelevance(input.topic, `${input.title ?? ""} ${input.snippet ?? ""} ${input.url} ${input.query ?? ""}`);
  const primarySourceLikelihood = scorePrimarySourceLikelihood(input.url, input.sourceType);
  const freshness = scoreFreshness(input.snippet ?? "");
  const sourceDiversity = clamp(1 - (input.discoveredDomainCount - 1) * 0.05);
  const rankQuality = input.rank && input.rank > 0 ? Math.max(0, 0.18 - Math.min(input.rank - 1, 10) * 0.012) : 0;
  const linkContextQuality = clamp((input.title ? 0.36 : 0) + (input.snippet ? 0.28 : 0) + (input.depth === 0 ? 0.18 : 0) + rankQuality);
  const rawScore =
    topicalRelevance * FRONTIER_SCORE_WEIGHTS.topicalRelevance +
    sourceAuthority * FRONTIER_SCORE_WEIGHTS.sourceAuthority +
    primarySourceLikelihood * FRONTIER_SCORE_WEIGHTS.primarySourceLikelihood +
    freshness * FRONTIER_SCORE_WEIGHTS.freshness +
    sourceDiversity * FRONTIER_SCORE_WEIGHTS.sourceDiversity +
    linkContextQuality * FRONTIER_SCORE_WEIGHTS.linkContextQuality;

  return {
    topicalRelevance,
    sourceAuthority,
    primarySourceLikelihood,
    freshness,
    sourceDiversity,
    linkContextQuality,
    weights: FRONTIER_SCORE_WEIGHTS,
    finalScore: adjustFrontierScore(clamp(rawScore), input, topicalRelevance),
  };
}

export function scoreSourceAuthority(url: string, sourceType: SourceType) {
  const domain = getDomain(url);
  if (sourceType === "official" || sourceType === "regulatory" || domain.endsWith(".gov") || domain.endsWith(".mil")) return 1;
  if (sourceType === "dataset" || sourceType === "data-catalog" || sourceType === "structured-api" || sourceType === "financial-data" || sourceType === "geospatial") return 0.9;
  if (sourceType === "mainstream-news" || sourceType === "academic") return 0.82;
  if (sourceType === "archive" || sourceType === "sports-data") return 0.78;
  if (sourceType === "github" || sourceType === "package-registry" || sourceType === "technical-doc") return 0.72;
  if (sourceType === "community" || sourceType === "benchmark") return 0.52;
  if (sourceType === "rss" || sourceType === "sitemap") return 0.5;
  return 0.25;
}

export function scoreTopicalRelevance(topic: string, text: string) {
  const topicTerms = terms(topic);
  if (topicTerms.length === 0) return 0.3;
  const haystack = text.toLowerCase();
  const hits = topicTerms.filter((term) => haystack.includes(term)).length;
  return clamp(hits / topicTerms.length);
}

export function scorePrimarySourceLikelihood(url: string, sourceType: SourceType) {
  const lower = url.toLowerCase();
  if (sourceType === "official" || sourceType === "regulatory") return 1;
  if (sourceType === "dataset" || sourceType === "data-catalog" || sourceType === "structured-api" || sourceType === "financial-data") return 0.9;
  if (lower.includes("press-release") || lower.includes("statement") || lower.endsWith(".pdf")) return 0.75;
  if (sourceType === "archive") return 0.7;
  if (sourceType === "github" || sourceType === "package-registry") return 0.66;
  if (sourceType === "mainstream-news") return 0.38;
  return 0.2;
}

function scoreFreshness(text: string) {
  const lower = text.toLowerCase();
  if (/\b(2026|2025|latest|updated|today|recent)\b/.test(lower)) return 0.85;
  if (/\b(2024|2023)\b/.test(lower)) return 0.55;
  return 0.35;
}

function terms(value: string) {
  const normalized = value.toLowerCase();
  const latinTerms = normalized
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1 && !STOP_TERMS.has(term));
  const cjkTerms = [...normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)]
    .flatMap((match) => cjkSearchTerms(match[0]));
  return [...new Set([...latinTerms, ...cjkTerms])]
    .filter((term) => term.length > 1 && !STOP_TERMS.has(term))
    .slice(0, 18);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function adjustFrontierScore(rawScore: number, input: FrontierScoreInput, topicalRelevance: number) {
  const lower = input.url.toLowerCase();
  const provider = (input.provider ?? "").toLowerCase();
  const query = `${input.query ?? ""} ${input.topic}`.toLowerCase();
  let score = rawScore;

  if (provider === "official" && input.depth === 0) {
    score = Math.max(score, 0.96);
  }

  if (provider === "github" || input.sourceType === "github") {
    score = Math.max(score, topicalRelevance >= 0.12 ? 0.86 : 0.74);
  }

  if (provider === "npm" || provider === "pypi" || input.sourceType === "package-registry") {
    score = Math.max(score, topicalRelevance >= 0.12 ? 0.82 : 0.7);
  }

  if (isSearchDoorway(lower) && !wantsDatasetFrontier(query)) {
    score = Math.min(score, 0.46);
  }

  if ((input.sourceType === "rss" || provider === "rss") && !wantsNewsFrontier(query)) {
    score = Math.min(score, 0.34);
  }

  if ((input.sourceType === "archive" || input.providerType === "archive") && !wantsArchiveFrontier(query)) {
    score = Math.min(score, 0.42);
  }

  if (isLikelyOfficialProjectUrl(lower) && !isDerivedOrDoorwaySource(input, lower, provider)) {
    score = Math.max(score, 0.88);
  }

  return clamp(score);
}

function isDerivedOrDoorwaySource(input: FrontierScoreInput, url: string, provider: string) {
  return (
    input.sourceType === "archive" ||
    input.providerType === "archive" ||
    input.sourceType === "rss" ||
    provider === "rss" ||
    isSearchDoorway(url)
  );
}

function isSearchDoorway(url: string) {
  return [
    "kaggle.com/search",
    "hub.arcgis.com/search",
    "openml.org/search",
    "pypi.org/search",
    "npmjs.com/search",
    "api.worldbank.org",
    "index.commoncrawl.org",
    "api.crossref.org",
    "api.openalex.org",
  ].some((pattern) => url.includes(pattern));
}

function isLikelyOfficialProjectUrl(url: string) {
  return (
    url.includes("pandoc.org") ||
    url.includes("docs.") ||
    url.includes("/docs") ||
    url.includes("documentation") ||
    url.includes("github.com/")
  );
}

function wantsDatasetFrontier(text: string) {
  return /数据|dataset|data source|csv|excel|parquet|统计|指标|可视化|chart|spss|kaggle|open data|比赛数据|公开数据/i.test(text);
}

function wantsNewsFrontier(text: string) {
  return /新闻|报道|媒体|latest|recent|today|reuters|ap|bbc|news|press release|监控|rss|溯源|查证/i.test(text);
}

function wantsArchiveFrontier(text: string) {
  return /溯源|查证|原始出处|历史|timeline|first reported|wayback|archive|common crawl|网页快照/i.test(text);
}

function cjkSearchTerms(value: string) {
  const dictionary = [
    "文档",
    "转换",
    "工具",
    "官网",
    "官方",
    "开源",
    "市场",
    "消费",
    "人群",
    "地区",
    "出生率",
    "结婚率",
    "数据",
    "数据源",
    "统计",
    "报告",
    "赛事",
    "比赛",
    "新闻",
    "溯源",
  ];
  const hits = dictionary.filter((term) => value.includes(term));
  if (hits.length > 0) return hits;
  return value.length > 8 ? [value.slice(0, 4), value.slice(4, 8)] : [value];
}

const STOP_TERMS = new Set([
  "codex",
  "验收",
  "同步",
  "调研",
  "研究",
  "比较",
  "以及",
  "还有",
  "the",
  "and",
  "for",
  "with",
  "about",
]);
