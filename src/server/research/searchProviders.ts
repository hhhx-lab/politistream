import axios from "axios";
import { getResearchConfig, ResearchConfig } from "./config";
import { canonicalizeUrl } from "./url";
import { ProviderName, SearchCandidate } from "./types";

interface ProviderSearchInput {
  jobId: string;
  query: string;
  depth?: number;
}

interface ProviderAdapter {
  name: ProviderName;
  enabled(config: ResearchConfig): boolean;
  search(input: ProviderSearchInput, config: ResearchConfig): Promise<SearchCandidate[]>;
}

export interface SearchProviderResult {
  provider: ProviderName;
  enabled: boolean;
  candidates: SearchCandidate[];
  error?: string;
}

const braveProvider: ProviderAdapter = {
  name: "brave",
  enabled: (config) => Boolean(config.braveApiKey),
  async search(input, config) {
    const response = await axios.get("https://api.search.brave.com/res/v1/web/search", {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": config.braveApiKey,
      },
      params: { q: input.query, count: 10 },
      timeout: 15000,
    });

    return normalizeBraveResults(response.data, input);
  },
};

const serpApiProvider: ProviderAdapter = {
  name: "serpapi",
  enabled: (config) => Boolean(config.serpApiKey),
  async search(input, config) {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: input.query,
        api_key: config.serpApiKey,
      },
      timeout: 15000,
    });

    return normalizeSerpApiResults(response.data, input);
  },
};

const tavilyProvider: ProviderAdapter = {
  name: "tavily",
  enabled: (config) => Boolean(config.tavilyApiKey),
  async search(input, config) {
    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: config.tavilyApiKey,
        query: input.query,
        search_depth: "advanced",
        include_raw_content: false,
        max_results: 10,
      },
      { timeout: 15000 },
    );

    return normalizeTavilyResults(response.data, input);
  },
};

export const SEARCH_PROVIDERS: ProviderAdapter[] = [braveProvider, serpApiProvider, tavilyProvider];

export async function searchConfiguredProviders(
  input: ProviderSearchInput,
  config = getResearchConfig(),
): Promise<SearchProviderResult[]> {
  const results: SearchProviderResult[] = [];

  for (const provider of SEARCH_PROVIDERS) {
    if (!provider.enabled(config)) {
      results.push({ provider: provider.name, enabled: false, candidates: [], error: "provider_api_key_missing" });
      continue;
    }

    try {
      results.push({
        provider: provider.name,
        enabled: true,
        candidates: await provider.search(input, config),
      });
    } catch (error) {
      results.push({
        provider: provider.name,
        enabled: true,
        candidates: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export function normalizeBraveResults(data: any, input: ProviderSearchInput): SearchCandidate[] {
  return normalizeResultList(data?.web?.results ?? [], input, "brave", {
    url: "url",
    title: "title",
    snippet: "description",
  });
}

export function normalizeSerpApiResults(data: any, input: ProviderSearchInput): SearchCandidate[] {
  return normalizeResultList(data?.organic_results ?? [], input, "serpapi", {
    url: "link",
    title: "title",
    snippet: "snippet",
  });
}

export function normalizeTavilyResults(data: any, input: ProviderSearchInput): SearchCandidate[] {
  return normalizeResultList(data?.results ?? [], input, "tavily", {
    url: "url",
    title: "title",
    snippet: "content",
  });
}

function normalizeResultList(
  rows: any[],
  input: ProviderSearchInput,
  provider: ProviderName,
  fields: { url: string; title: string; snippet: string },
): SearchCandidate[] {
  const seen = new Set<string>();
  const candidates: SearchCandidate[] = [];

  for (const row of rows) {
    const rawUrl = String(row?.[fields.url] ?? "");
    const canonicalUrl = canonicalizeUrl(rawUrl);
    if (!canonicalUrl || seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    candidates.push({
      jobId: input.jobId,
      provider,
      query: input.query,
      url: rawUrl,
      canonicalUrl,
      title: String(row?.[fields.title] ?? ""),
      snippet: String(row?.[fields.snippet] ?? ""),
      publishedAt: row?.date ?? row?.published_date ?? undefined,
      depth: input.depth ?? 0,
    });
  }

  return candidates;
}
