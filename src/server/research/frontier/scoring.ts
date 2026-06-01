import { getDomain } from "../url";
import { SourceType } from "../types";

export interface FrontierScoreInput {
  url: string;
  sourceType: SourceType;
  title?: string;
  snippet?: string;
  topic: string;
  depth: number;
  discoveredDomainCount: number;
}

export function scoreFrontierItem(input: FrontierScoreInput) {
  const sourceAuthority = scoreSourceAuthority(input.url, input.sourceType);
  const topicalRelevance = scoreTopicalRelevance(input.topic, `${input.title ?? ""} ${input.snippet ?? ""}`);
  const primarySourceLikelihood = scorePrimarySourceLikelihood(input.url, input.sourceType);
  const freshness = scoreFreshness(input.snippet ?? "");
  const sourceDiversity = clamp(1 - (input.discoveredDomainCount - 1) * 0.08);
  const linkContextQuality = clamp((input.title ? 0.45 : 0) + (input.snippet ? 0.35 : 0) + (input.depth === 0 ? 0.2 : 0));

  return clamp(
    sourceAuthority * 0.25 +
    topicalRelevance * 0.25 +
    primarySourceLikelihood * 0.20 +
    freshness * 0.10 +
    sourceDiversity * 0.10 +
    linkContextQuality * 0.10,
  );
}

export function scoreSourceAuthority(url: string, sourceType: SourceType) {
  const domain = getDomain(url);
  if (sourceType === "official" || sourceType === "regulatory" || domain.endsWith(".gov") || domain.endsWith(".mil")) return 1;
  if (sourceType === "mainstream-news" || sourceType === "academic") return 0.82;
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
  if (lower.includes("press-release") || lower.includes("statement") || lower.endsWith(".pdf")) return 0.75;
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
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1)
    .slice(0, 12);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
