import axios from "axios";
import { ResearchConfig, getResearchConfig } from "../config";
import { searchConfiguredProviders } from "../searchProviders";
import { canonicalizeUrl, getDomain } from "../url";
import {
  DiscoveredCandidate,
  DiscoveryProviderType,
  PlannedQuery,
  SourceType,
} from "../types";

export interface DiscoveryProviderInput {
  jobId: string;
  runId: string;
  topic: string;
  query: PlannedQuery;
  seedUrls: string[];
}

export interface DiscoveryProvider {
  name: string;
  type: DiscoveryProviderType;
  enabled(): boolean;
  discover(input: DiscoveryProviderInput): Promise<DiscoveredCandidate[]>;
}

export interface RawDiscoveredCandidate {
  jobId: string;
  runId: string;
  provider: string;
  providerType: DiscoveryProviderType;
  queryId: string;
  query: string;
  url: string;
  title?: string;
  snippet?: string;
  rank?: number;
  publishedAt?: string;
  depth?: number;
  sourceType?: SourceType;
  raw?: unknown;
}

export async function runDiscoveryProviders(
  providers: DiscoveryProvider[],
  input: DiscoveryProviderInput,
) {
  const startedAt = Date.now();
  const results: Array<{
    provider: string;
    providerType: DiscoveryProviderType;
    enabled: boolean;
    candidates: DiscoveredCandidate[];
    error?: string;
    durationMs: number;
  }> = [];

  for (const provider of providers) {
    const providerStartedAt = Date.now();
    if (!provider.enabled()) {
      results.push({
        provider: provider.name,
        providerType: provider.type,
        enabled: false,
        candidates: [],
        error: "provider_disabled",
        durationMs: 0,
      });
      continue;
    }

    try {
      results.push({
        provider: provider.name,
        providerType: provider.type,
        enabled: true,
        candidates: await provider.discover(input),
        durationMs: Date.now() - providerStartedAt,
      });
    } catch (error) {
      results.push({
        provider: provider.name,
        providerType: provider.type,
        enabled: true,
        candidates: [],
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - providerStartedAt,
      });
    }
  }

  return {
    durationMs: Date.now() - startedAt,
    results,
    candidates: dedupeCandidates(results.flatMap((result) => result.candidates)),
  };
}

export function normalizeDiscoveredCandidate(input: RawDiscoveredCandidate): DiscoveredCandidate {
  const canonicalUrl = canonicalizeUrl(input.url) ?? input.url;
  return {
    jobId: input.jobId,
    runId: input.runId,
    provider: input.provider,
    providerType: input.providerType,
    queryId: input.queryId,
    query: input.query,
    url: input.url,
    canonicalUrl,
    title: input.title ?? "",
    snippet: input.snippet ?? "",
    sourceType: input.sourceType ?? inferSourceType(input.url, input.providerType),
    rank: input.rank,
    publishedAt: input.publishedAt,
    depth: input.depth ?? 0,
    discoveredAt: new Date().toISOString(),
    raw: input.raw,
  };
}

export function createSeedUrlProvider(): DiscoveryProvider {
  return {
    name: "official",
    type: "official",
    enabled: () => true,
    async discover(input) {
      return input.seedUrls.map((url, index) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "official",
        providerType: "official",
        queryId: input.query.id,
        query: input.query.text,
        url,
        title: getDomain(url),
        snippet: "用户提供的种子来源。",
        rank: index + 1,
        sourceType: "official",
      }));
    },
  };
}

export function createRSSDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "rss",
    type: "rss",
    enabled: () => true,
    async discover(input) {
      const { getRSSSources } = await import("../../services/rss");
      const sources = getRSSSources();
      return sources
        .filter((source) => source.enabled)
        .slice(0, 30)
        .map((source, index) => normalizeDiscoveredCandidate({
          jobId: input.jobId,
          runId: input.runId,
          provider: "rss",
          providerType: "rss",
          queryId: input.query.id,
          query: input.query.text,
          url: source.url,
          title: source.name,
          snippet: `RSS source for ${input.topic}`,
          rank: index + 1,
          sourceType: "rss",
        }));
    },
  };
}

export function createWebSearchDiscoveryProvider(config: ResearchConfig = getResearchConfig()): DiscoveryProvider {
  return {
    name: "web-search",
    type: "web-search",
    enabled: () => Boolean(config.braveApiKey || config.serpApiKey || config.tavilyApiKey),
    async discover(input) {
      const results = await searchConfiguredProviders({
        jobId: input.jobId,
        query: input.query.text,
        depth: 0,
      }, config);

      return results.flatMap((result) => result.candidates.map((candidate, index) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: result.provider,
        providerType: "web-search",
        queryId: input.query.id,
        query: input.query.text,
        url: candidate.url,
        title: candidate.title,
        snippet: candidate.snippet,
        rank: index + 1,
        publishedAt: candidate.publishedAt,
        sourceType: inferSourceType(candidate.url, "web-search"),
      })));
    },
  };
}

export function createSitemapDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "sitemap",
    type: "sitemap",
    enabled: () => true,
    async discover(input) {
      const domains = new Set(input.seedUrls.map(getDomain).filter(Boolean));
      const topicDomains = inferLikelyDomains(input.topic);
      topicDomains.forEach((domain) => domains.add(domain));

      return [...domains].slice(0, 10).map((domain, index) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "sitemap",
        providerType: "sitemap",
        queryId: input.query.id,
        query: input.query.text,
        url: `https://${domain}/sitemap.xml`,
        title: `${domain} sitemap`,
        snippet: "站点地图入口，用于发现官方或一手页面。",
        rank: index + 1,
        sourceType: "sitemap",
      }));
    },
  };
}

export function createGitHubDiscoveryProvider(config: ResearchConfig = getResearchConfig()): DiscoveryProvider {
  return {
    name: "github",
    type: "github",
    enabled: () => true,
    async discover(input) {
      if (!input.query.sourceTypes.includes("github") && !input.query.text.toLowerCase().includes("github")) {
        return [];
      }

      const response = await axios.get("https://api.github.com/search/repositories", {
        params: { q: input.query.text.replace(/\bgithub\b/ig, "").trim() || input.topic, per_page: 8 },
        headers: config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : undefined,
        timeout: 15000,
      });

      return (response.data?.items ?? []).map((repo: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "github",
        providerType: "github",
        queryId: input.query.id,
        query: input.query.text,
        url: repo.html_url,
        title: repo.full_name,
        snippet: repo.description ?? "",
        rank: index + 1,
        sourceType: "github",
        raw: {
          stars: repo.stargazers_count,
          license: repo.license?.spdx_id,
          updatedAt: repo.updated_at,
        },
      }));
    },
  };
}

export function createNpmDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "npm",
    type: "package-registry",
    enabled: () => true,
    async discover(input) {
      if (!input.query.sourceTypes.includes("package-registry") && !/\bnpm\b/i.test(input.query.text)) {
        return [];
      }

      const response = await axios.get("https://registry.npmjs.org/-/v1/search", {
        params: { text: input.query.text, size: 8 },
        timeout: 15000,
      });

      return (response.data?.objects ?? []).map((row: any, index: number) => {
        const pkg = row.package ?? {};
        return normalizeDiscoveredCandidate({
          jobId: input.jobId,
          runId: input.runId,
          provider: "npm",
          providerType: "package-registry",
          queryId: input.query.id,
          query: input.query.text,
          url: pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
          title: pkg.name,
          snippet: pkg.description ?? "",
          rank: index + 1,
          publishedAt: pkg.date,
          sourceType: "package-registry",
          raw: {
            version: pkg.version,
            publisher: pkg.publisher?.username,
            score: row.score,
          },
        });
      });
    },
  };
}

export function createPyPiDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "pypi",
    type: "package-registry",
    enabled: () => true,
    async discover(input) {
      if (!input.query.sourceTypes.includes("package-registry") && !/\bpypi|python\b/i.test(input.query.text)) {
        return [];
      }

      return [normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "pypi",
        providerType: "package-registry",
        queryId: input.query.id,
        query: input.query.text,
        url: `https://pypi.org/search/?q=${encodeURIComponent(input.query.text)}`,
        title: `PyPI search: ${input.query.text}`,
        snippet: "PyPI 包注册表搜索入口。",
        rank: 1,
        sourceType: "package-registry",
      })];
    },
  };
}

export function createDefaultDiscoveryProviders(config: ResearchConfig = getResearchConfig()): DiscoveryProvider[] {
  return [
    createSeedUrlProvider(),
    createWebSearchDiscoveryProvider(config),
    createRSSDiscoveryProvider(),
    createSitemapDiscoveryProvider(),
    createGitHubDiscoveryProvider(config),
    createNpmDiscoveryProvider(),
    createPyPiDiscoveryProvider(),
  ];
}

export function inferSourceType(url: string, providerType?: DiscoveryProviderType): SourceType {
  const lower = url.toLowerCase();
  const domain = getDomain(url);

  if (providerType === "rss" || lower.endsWith(".rss") || lower.includes("/feed")) return "rss";
  if (providerType === "sitemap" || lower.endsWith("sitemap.xml")) return "sitemap";
  if (providerType === "github" || domain === "github.com") return "github";
  if (providerType === "package-registry" || domain === "npmjs.com" || domain === "pypi.org") return "package-registry";
  if (domain.endsWith(".gov") || domain.endsWith(".mil") || providerType === "official") return "official";
  if (domain.includes("reuters.com") || domain.includes("apnews.com") || domain.includes("bbc.") || domain.includes("nytimes.com")) return "mainstream-news";
  if (lower.includes("/docs") || lower.includes("documentation")) return "technical-doc";
  return "unknown";
}

function inferLikelyDomains(topic: string) {
  const domains = new Set<string>();
  const matches = topic.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi) ?? [];
  matches.forEach((domain) => domains.add(domain.toLowerCase().replace(/^www\./, "")));
  return domains;
}

function dedupeCandidates(candidates: DiscoveredCandidate[]) {
  const seen = new Set<string>();
  const deduped: DiscoveredCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.canonicalUrl)) continue;
    seen.add(candidate.canonicalUrl);
    deduped.push(candidate);
  }
  return deduped;
}
