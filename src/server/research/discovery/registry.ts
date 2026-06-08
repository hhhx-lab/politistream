import axios from "axios";
import { ResearchConfig, getResearchConfig } from "../config";
import { normalizeProviderTimestamp } from "../date";
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
  const results = await runProviderDiscoveryWithConcurrency(
    providers,
    input,
    positiveInt(process.env.RESEARCH_DISCOVERY_PROVIDER_CONCURRENCY, 4),
  );

  return {
    durationMs: Date.now() - startedAt,
    results,
    candidates: dedupeCandidates(results.flatMap((result) => result.candidates)),
  };
}

export async function runProviderDiscoveryWithConcurrency(
  providers: DiscoveryProvider[],
  input: DiscoveryProviderInput,
  concurrency: number,
) {
  const results: Array<{
    provider: string;
    providerType: DiscoveryProviderType;
    enabled: boolean;
    candidates: DiscoveredCandidate[];
    error?: string;
    durationMs: number;
  }> = [];
  let index = 0;

  async function next() {
    while (index < providers.length) {
      const provider = providers[index++];
      results.push(await runSingleProviderDiscovery(provider, input));
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, providers.length)) }, () => next()),
  );

  return results;
}

async function runSingleProviderDiscovery(provider: DiscoveryProvider, input: DiscoveryProviderInput) {
  const providerStartedAt = Date.now();
  if (!provider.enabled()) {
    return {
      provider: provider.name,
      providerType: provider.type,
      enabled: false,
      candidates: [],
      error: "provider_disabled",
      durationMs: 0,
    };
  }

  try {
    return {
      provider: provider.name,
      providerType: provider.type,
      enabled: true,
      candidates: await provider.discover(input),
      durationMs: Date.now() - providerStartedAt,
    };
  } catch (error) {
    return {
      provider: provider.name,
      providerType: provider.type,
      enabled: true,
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - providerStartedAt,
    };
  }
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
    publishedAt: normalizeProviderTimestamp(input.publishedAt),
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
        purpose: input.query.purpose,
        sourceTypes: input.query.sourceTypes,
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

export function createGdeltDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "gdelt",
    type: "news-api",
    enabled: () => true,
    async discover(input) {
      if (!input.query.sourceTypes.some((type) => ["mainstream-news", "official", "unknown"].includes(type))) {
        return [];
      }

      const response = await axios.get("https://api.gdeltproject.org/api/v2/doc/doc", {
        params: {
          query: input.query.text,
          mode: "ArtList",
          format: "json",
          maxrecords: 10,
          sort: "HybridRel",
        },
        timeout: 15000,
      });

      return (response.data?.articles ?? []).map((article: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "gdelt",
        providerType: "news-api",
        queryId: input.query.id,
        query: input.query.text,
        url: article.url,
        title: article.title,
        snippet: [article.domain, article.sourcecountry, article.language].filter(Boolean).join(" / "),
        rank: index + 1,
        publishedAt: article.seendate,
        sourceType: "mainstream-news",
        raw: article,
      }));
    },
  };
}

export function createWaybackDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "wayback",
    type: "archive",
    enabled: () => true,
    async discover(input) {
      const urls = input.seedUrls.length > 0
        ? input.seedUrls
        : inferLikelyDomains(input.topic).size > 0
          ? [...inferLikelyDomains(input.topic)].map((domain) => `https://${domain}/`)
          : [];

      return urls.slice(0, 8).map((url, index) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "wayback",
        providerType: "archive",
        queryId: input.query.id,
        query: input.query.text,
        url: `https://web.archive.org/cdx?url=${encodeURIComponent(url)}*&output=json&filter=statuscode:200&limit=25`,
        title: `Wayback snapshots: ${getDomain(url) || url}`,
        snippet: "Internet Archive CDX 历史快照查询入口，用于页面消失、内容改版和新闻溯源。",
        rank: index + 1,
        sourceType: "archive",
      }));
    },
  };
}

export function createCommonCrawlDiscoveryProvider(): DiscoveryProvider {
  return createStaticDiscoveryProvider({
    name: "commoncrawl",
    type: "archive",
    sourceType: "archive",
    urlFor: (query) => `https://index.commoncrawl.org/?url=${encodeURIComponent(query.text)}&output=json`,
    titleFor: (query) => `Common Crawl index: ${query.text}`,
    snippet: "Common Crawl 公开网页索引入口，适合历史公开网页和大规模语料检索。",
    onlyWhen: (input) => input.seedUrls.length > 0 || input.query.purpose === "dataset-discovery" || input.query.purpose === "timeline",
  });
}

export function createCkanDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "ckan",
    type: "data-catalog",
    enabled: () => true,
    async discover(input) {
      if (!wantsData(input.query.sourceTypes, input.query.text)) return [];
      const response = await axios.get("https://catalog.data.gov/api/3/action/package_search", {
        params: { q: input.query.text, rows: 8 },
        timeout: 15000,
      });
      return (response.data?.result?.results ?? []).map((dataset: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "ckan",
        providerType: "data-catalog",
        queryId: input.query.id,
        query: input.query.text,
        url: dataset.url || `https://catalog.data.gov/dataset/${dataset.name}`,
        title: dataset.title || dataset.name,
        snippet: dataset.notes || "",
        rank: index + 1,
        publishedAt: dataset.metadata_modified,
        sourceType: "data-catalog",
        raw: {
          organization: dataset.organization?.title,
          license: dataset.license_title,
          resources: dataset.resources?.map((resource: any) => ({
            name: resource.name,
            format: resource.format,
            url: resource.url,
          })),
        },
      }));
    },
  };
}

export function createSocrataDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "socrata",
    type: "data-catalog",
    enabled: () => true,
    async discover(input) {
      if (!wantsData(input.query.sourceTypes, input.query.text)) return [];
      const response = await axios.get("https://api.us.socrata.com/api/catalog/v1", {
        params: { search_context: "data.gov", q: input.query.text, limit: 8 },
        timeout: 15000,
      });
      return (response.data?.results ?? []).map((row: any, index: number) => {
        const resource = row.resource ?? {};
        return normalizeDiscoveredCandidate({
          jobId: input.jobId,
          runId: input.runId,
          provider: "socrata",
          providerType: "data-catalog",
          queryId: input.query.id,
          query: input.query.text,
          url: row.permalink || resource.url || `https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(input.query.text)}`,
          title: resource.name || row.name || "Socrata dataset",
          snippet: resource.description || "",
          rank: index + 1,
          publishedAt: resource.updatedAt,
          sourceType: "data-catalog",
          raw: resource,
        });
      });
    },
  };
}

export function createArcgisDiscoveryProvider(): DiscoveryProvider {
  return createStaticDiscoveryProvider({
    name: "arcgis",
    type: "data-catalog",
    sourceType: "geospatial",
    urlFor: (query) => `https://hub.arcgis.com/search?q=${encodeURIComponent(query.text)}`,
    titleFor: (query) => `ArcGIS Hub search: ${query.text}`,
    snippet: "ArcGIS Hub 地理空间数据搜索入口，适合地图、城市、灾害、环境和空间分析。",
    onlyWhen: (input) => wantsData(input.query.sourceTypes, input.query.text) || /地图|地理|geo|gis|spatial|城市|环境/i.test(input.query.text),
  });
}

export function createKaggleDiscoveryProvider(config: ResearchConfig = getResearchConfig()): DiscoveryProvider {
  return createStaticDiscoveryProvider({
    name: "kaggle",
    type: "competition-data",
    sourceType: "dataset",
    urlFor: (query) => `https://www.kaggle.com/search?q=${encodeURIComponent(query.text)}`,
    titleFor: (query) => `Kaggle search: ${query.text}`,
    snippet: config.kaggleApiToken || (config.kaggleUsername && config.kaggleKey)
      ? "Kaggle 竞赛和数据集搜索入口；已配置 API 凭据，后续可接 CLI/API 下载授权数据。"
      : "Kaggle 竞赛和数据集搜索入口；下载竞赛数据需要配置新版 KAGGLE_API_TOKEN 并遵守比赛规则。",
    onlyWhen: (input) => wantsData(input.query.sourceTypes, input.query.text) || input.query.purpose === "competition-data",
  });
}

export function createHuggingFaceDatasetDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "huggingface",
    type: "data-catalog",
    enabled: () => true,
    async discover(input) {
      if (!wantsData(input.query.sourceTypes, input.query.text) && !/hugging\s*face|模型|dataset/i.test(input.query.text)) return [];
      const response = await axios.get("https://huggingface.co/api/datasets", {
        params: { search: input.query.text, limit: 8 },
        timeout: 15000,
      });
      return (response.data ?? []).map((dataset: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "huggingface",
        providerType: "data-catalog",
        queryId: input.query.id,
        query: input.query.text,
        url: `https://huggingface.co/datasets/${dataset.id}`,
        title: dataset.id,
        snippet: [dataset.author, dataset.cardData?.license, `downloads:${dataset.downloads ?? 0}`].filter(Boolean).join(" / "),
        rank: index + 1,
        publishedAt: dataset.lastModified,
        sourceType: "dataset",
        raw: dataset,
      }));
    },
  };
}

export function createOpenMlDiscoveryProvider(): DiscoveryProvider {
  return createStaticDiscoveryProvider({
    name: "openml",
    type: "data-catalog",
    sourceType: "dataset",
    urlFor: (query) => `https://www.openml.org/search?type=data&sort=runs&status=active&q=${encodeURIComponent(query.text)}`,
    titleFor: (query) => `OpenML dataset search: ${query.text}`,
    snippet: "OpenML 数据集、任务和评测搜索入口，适合机器学习 benchmark 和比赛数据补充。",
    onlyWhen: (input) => wantsData(input.query.sourceTypes, input.query.text) || /openml|machine learning|benchmark/i.test(input.query.text),
  });
}

export function createWorldBankDiscoveryProvider(): DiscoveryProvider {
  return createStaticDiscoveryProvider({
    name: "worldbank",
    type: "structured-api",
    sourceType: "structured-api",
    urlFor: (query) => `https://api.worldbank.org/v2/indicator?format=json&per_page=50&source=2&query=${encodeURIComponent(query.text)}`,
    titleFor: (query) => `World Bank indicators: ${query.text}`,
    snippet: "World Bank 国家/地区指标和时间序列 API 入口。",
    onlyWhen: (input) => wantsData(input.query.sourceTypes, input.query.text) || /world bank|人口|gdp|宏观|经济|国家/i.test(input.query.text),
  });
}

export function createFredDiscoveryProvider(config: ResearchConfig = getResearchConfig()): DiscoveryProvider {
  return {
    name: "fred",
    type: "structured-api",
    enabled: () => Boolean(config.fredApiKey),
    async discover(input) {
      if (!config.fredApiKey || (!wantsData(input.query.sourceTypes, input.query.text) && !/fred|利率|通胀|就业|经济/i.test(input.query.text))) return [];
      const response = await axios.get("https://api.stlouisfed.org/fred/series/search", {
        params: { api_key: config.fredApiKey, file_type: "json", search_text: input.query.text, limit: 8 },
        timeout: 15000,
      });
      return (response.data?.seriess ?? []).map((series: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "fred",
        providerType: "structured-api",
        queryId: input.query.id,
        query: input.query.text,
        url: `https://fred.stlouisfed.org/series/${series.id}`,
        title: series.title,
        snippet: [series.frequency, series.units, series.notes].filter(Boolean).join(" / "),
        rank: index + 1,
        publishedAt: series.last_updated,
        sourceType: "financial-data",
        raw: series,
      }));
    },
  };
}

export function createOpenAlexDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "openalex",
    type: "structured-api",
    enabled: () => true,
    async discover(input) {
      if (!input.query.sourceTypes.includes("academic") && !/paper|论文|学术|citation|openalex/i.test(input.query.text)) return [];
      const response = await axios.get("https://api.openalex.org/works", {
        params: { search: input.query.text, per_page: 8 },
        timeout: 15000,
      });
      return (response.data?.results ?? []).map((work: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "openalex",
        providerType: "structured-api",
        queryId: input.query.id,
        query: input.query.text,
        url: work.primary_location?.landing_page_url || work.id,
        title: work.title,
        snippet: [work.publication_year, work.type, `cited:${work.cited_by_count ?? 0}`].filter(Boolean).join(" / "),
        rank: index + 1,
        publishedAt: work.publication_date,
        sourceType: "academic",
        raw: work,
      }));
    },
  };
}

export function createCrossrefDiscoveryProvider(): DiscoveryProvider {
  return {
    name: "crossref",
    type: "structured-api",
    enabled: () => true,
    async discover(input) {
      if (!input.query.sourceTypes.includes("academic") && !/doi|paper|论文|crossref|journal/i.test(input.query.text)) return [];
      const response = await axios.get("https://api.crossref.org/works", {
        params: { query: input.query.text, rows: 8 },
        timeout: 15000,
      });
      return (response.data?.message?.items ?? []).map((work: any, index: number) => normalizeDiscoveredCandidate({
        jobId: input.jobId,
        runId: input.runId,
        provider: "crossref",
        providerType: "structured-api",
        queryId: input.query.id,
        query: input.query.text,
        url: work.URL || `https://doi.org/${work.DOI}`,
        title: work.title?.[0] || work.DOI,
        snippet: [work.publisher, work.type, work["container-title"]?.[0]].filter(Boolean).join(" / "),
        rank: index + 1,
        sourceType: "academic",
        raw: work,
      }));
    },
  };
}

export function createSportsDiscoveryProvider(): DiscoveryProvider {
  return createStaticDiscoveryProvider({
    name: "sports",
    type: "sports-data",
    sourceType: "sports-data",
    urlFor: (query) => sportsSearchUrl(query.text),
    titleFor: (query) => `Sports data source: ${query.text}`,
    snippet: "公开体育/赛事数据入口，会按 F1、足球、NBA、开源事件数据等方向路由。",
    onlyWhen: (input) => input.query.purpose === "sports-data" || input.query.sourceTypes.includes("sports-data") || /比赛|赛事|球队|球员|f1|nba|football|soccer|sports/i.test(input.query.text),
  });
}

export function createDefaultDiscoveryProviders(config: ResearchConfig = getResearchConfig()): DiscoveryProvider[] {
  if (process.env.RESEARCH_DISCOVERY_OFFLINE_ONLY === "true") {
    return [
      createSeedUrlProvider(),
    ];
  }

  return [
    createSeedUrlProvider(),
    createWebSearchDiscoveryProvider(config),
    createGdeltDiscoveryProvider(),
    createRSSDiscoveryProvider(),
    createSitemapDiscoveryProvider(),
    createWaybackDiscoveryProvider(),
    createCommonCrawlDiscoveryProvider(),
    createGitHubDiscoveryProvider(config),
    createNpmDiscoveryProvider(),
    createPyPiDiscoveryProvider(),
    createCkanDiscoveryProvider(),
    createSocrataDiscoveryProvider(),
    createArcgisDiscoveryProvider(),
    createKaggleDiscoveryProvider(config),
    createHuggingFaceDatasetDiscoveryProvider(),
    createOpenMlDiscoveryProvider(),
    createWorldBankDiscoveryProvider(),
    createFredDiscoveryProvider(config),
    createOpenAlexDiscoveryProvider(),
    createCrossrefDiscoveryProvider(),
    createSportsDiscoveryProvider(),
  ];
}

export function inferSourceType(url: string, providerType?: DiscoveryProviderType): SourceType {
  const lower = url.toLowerCase();
  const domain = getDomain(url);

  if (providerType === "rss" || lower.endsWith(".rss") || lower.includes("/feed")) return "rss";
  if (providerType === "sitemap" || lower.endsWith("sitemap.xml")) return "sitemap";
  if (providerType === "github" || domain === "github.com") return "github";
  if (providerType === "package-registry" || domain === "npmjs.com" || domain === "pypi.org") return "package-registry";
  if (providerType === "archive" || domain.includes("web.archive.org") || domain.includes("commoncrawl.org")) return "archive";
  if (providerType === "data-catalog" || domain.includes("data.gov") || domain.includes("socrata.com") || domain.includes("arcgis.com") || domain.includes("kaggle.com") || domain.includes("huggingface.co") || domain.includes("openml.org")) return "dataset";
  if (providerType === "sports-data" || domain.includes("openf1.org") || domain.includes("football-data.org") || domain.includes("balldontlie.io") || domain.includes("statsbomb")) return "sports-data";
  if (providerType === "structured-api" || domain.includes("worldbank.org") || domain.includes("stlouisfed.org") || domain.includes("openalex.org") || domain.includes("crossref.org")) return "structured-api";
  if (domain.endsWith(".gov") || domain.endsWith(".mil") || providerType === "official") return "official";
  if (domain.includes("reuters.com") || domain.includes("apnews.com") || domain.includes("bbc.") || domain.includes("nytimes.com")) return "mainstream-news";
  if (lower.includes("/docs") || lower.includes("documentation")) return "technical-doc";
  return "unknown";
}

function createStaticDiscoveryProvider(input: {
  name: string;
  type: DiscoveryProviderType;
  sourceType: SourceType;
  urlFor: (query: PlannedQuery) => string;
  titleFor: (query: PlannedQuery) => string;
  snippet: string;
  onlyWhen?: (input: DiscoveryProviderInput) => boolean;
}): DiscoveryProvider {
  return {
    name: input.name,
    type: input.type,
    enabled: () => true,
    async discover(providerInput) {
      if (input.onlyWhen && !input.onlyWhen(providerInput)) return [];
      return [normalizeDiscoveredCandidate({
        jobId: providerInput.jobId,
        runId: providerInput.runId,
        provider: input.name,
        providerType: input.type,
        queryId: providerInput.query.id,
        query: providerInput.query.text,
        url: input.urlFor(providerInput.query),
        title: input.titleFor(providerInput.query),
        snippet: input.snippet,
        rank: 1,
        sourceType: input.sourceType,
      })];
    },
  };
}

function wantsData(sourceTypes: SourceType[], text: string) {
  return sourceTypes.some((type) => ["dataset", "data-catalog", "structured-api", "benchmark", "financial-data", "geospatial"].includes(type))
    || /数据|dataset|data source|csv|excel|parquet|统计|指标|可视化|chart|spss|kaggle|open data/i.test(text);
}

function sportsSearchUrl(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("f1") || lower.includes("formula")) return "https://openf1.org/";
  if (lower.includes("nba")) return "https://docs.balldontlie.io/";
  if (lower.includes("football") || lower.includes("soccer") || lower.includes("足球")) return "https://www.football-data.org/documentation/quickstart";
  return `https://www.kaggle.com/search?q=${encodeURIComponent(`${text} sports dataset`)}`;
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

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
