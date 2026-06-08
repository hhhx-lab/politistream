export interface ResearchConfig {
  databaseUrl?: string;
  redisUrl?: string;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel: string;
  braveApiKey?: string;
  serpApiKey?: string;
  tavilyApiKey?: string;
  newsApiKey?: string;
  githubToken?: string;
  fredApiKey?: string;
  kaggleApiToken?: string;
  kaggleUsername?: string;
  kaggleKey?: string;
  browserProvider: "local" | "browserless";
  browserlessUrl?: string;
  crawl4aiUrl?: string;
  firecrawlApiKey?: string;
}

export interface ResearchFetchConfig {
  maxAttempts: number;
  domainMinDelayMs: number;
  respectRobotsTxt: boolean;
  browserFetchEnabled: boolean;
  browserMaxPages: number;
  fetchTimeoutMs: number;
  maxContentBytes: number;
}

export interface ResearchAssetConfig {
  assetDir: string;
  storeRawHtml: boolean;
  storeRawPdf: boolean;
  storeRawText: boolean;
}

export interface ResearchMemoryConfig {
  enabled: boolean;
  maxAgeHours: number;
}

export interface ResearchConfigStatus {
  databaseConfigured: boolean;
  redisConfigured: boolean;
  searchProviders: {
    brave: boolean;
    serpApi: boolean;
    tavily: boolean;
    newsApi: boolean;
  };
  dataProviders: {
    gdelt: boolean;
    wayback: boolean;
    commonCrawl: boolean;
    ckan: boolean;
    socrata: boolean;
    arcgis: boolean;
    kaggle: boolean;
    huggingFace: boolean;
    openMl: boolean;
    worldBank: boolean;
    fred: boolean;
    openAlex: boolean;
    crossref: boolean;
    sports: boolean;
  };
  ai: {
    provider: string;
    baseUrl: string;
    model: string;
    configured: boolean;
    keyConfigured: boolean;
  };
  enabledSearchProviderCount: number;
  enabledDataProviderCount: number;
  readyForStorage: boolean;
  readyForQueue: boolean;
}

export class ResearchConfigurationError extends Error {
  statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "ResearchConfigurationError";
  }
}

export function getResearchConfig(env = process.env): ResearchConfig {
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    aiBaseUrl: normalizeAiBaseUrl(env.AI_BASE_URL),
    aiApiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL || "gpt-5.4",
    braveApiKey: env.BRAVE_API_KEY,
    serpApiKey: env.SERPAPI_API_KEY,
    tavilyApiKey: env.TAVILY_API_KEY,
    newsApiKey: env.NEWSAPI_KEY || env.NEWS_API_KEY,
    githubToken: env.GITHUB_TOKEN,
    fredApiKey: env.FRED_API_KEY,
    kaggleApiToken: env.KAGGLE_API_TOKEN,
    kaggleUsername: env.KAGGLE_USERNAME,
    kaggleKey: env.KAGGLE_KEY,
    browserProvider: env.RESEARCH_BROWSER_PROVIDER === "browserless" ? "browserless" : "local",
    browserlessUrl: env.BROWSERLESS_URL,
    crawl4aiUrl: env.CRAWL4AI_URL,
    firecrawlApiKey: env.FIRECRAWL_API_KEY,
  };
}

export function getResearchConfigStatus(config = getResearchConfig()): ResearchConfigStatus {
  const activeAiProvider = resolveAiProvider(config);
  const keyConfigured = isValidApiKey(config.aiApiKey, "MY_AI_API_KEY");
  const searchProviders = {
    brave: Boolean(config.braveApiKey),
    serpApi: Boolean(config.serpApiKey),
    tavily: Boolean(config.tavilyApiKey),
    newsApi: Boolean(config.newsApiKey),
  };
  const dataProviders = {
    gdelt: true,
    wayback: true,
    commonCrawl: true,
    ckan: true,
    socrata: true,
    arcgis: true,
    kaggle: hasKaggleCredentials(config),
    huggingFace: true,
    openMl: true,
    worldBank: true,
    fred: Boolean(config.fredApiKey),
    openAlex: true,
    crossref: true,
    sports: true,
  };

  return {
    databaseConfigured: Boolean(config.databaseUrl),
    redisConfigured: Boolean(config.redisUrl),
    searchProviders,
    dataProviders,
    ai: {
      provider: activeAiProvider ?? "gpt-compatible",
      baseUrl: resolveAiBaseUrl(config),
      model: resolveAiModel(config),
      configured: Boolean(activeAiProvider),
      keyConfigured,
    },
    enabledSearchProviderCount: Object.values(searchProviders).filter(Boolean).length,
    enabledDataProviderCount: Object.values(dataProviders).filter(Boolean).length,
    readyForStorage: Boolean(config.databaseUrl),
    readyForQueue: Boolean(config.redisUrl),
  };
}

export type ActiveAiProvider = "gpt-compatible";

export function resolveAiProvider(config = getResearchConfig()): ActiveAiProvider | null {
  return isValidApiKey(config.aiApiKey, "MY_AI_API_KEY") ? "gpt-compatible" : null;
}

export function resolveAiModel(config = getResearchConfig()) {
  return config.aiModel;
}

export function resolveAiBaseUrl(config = getResearchConfig()) {
  return normalizeAiBaseUrl(config.aiBaseUrl);
}

export function requireResearchDatabase(config = getResearchConfig()) {
  if (!config.databaseUrl) {
    throw new ResearchConfigurationError("DATABASE_URL is required for research crawler storage.");
  }

  return config.databaseUrl;
}

export function requireResearchQueue(config = getResearchConfig()) {
  if (!config.redisUrl) {
    throw new ResearchConfigurationError("REDIS_URL is required for research crawler queues.");
  }

  return config.redisUrl;
}

export function getEnabledSearchProviders(config = getResearchConfig()) {
  return {
    brave: Boolean(config.braveApiKey),
    serpApi: Boolean(config.serpApiKey),
    tavily: Boolean(config.tavilyApiKey),
  };
}

export function getResearchFetchConfig(env = process.env): ResearchFetchConfig {
  return {
    maxAttempts: positiveInt(env.RESEARCH_FETCH_MAX_ATTEMPTS, 3),
    domainMinDelayMs: positiveInt(env.RESEARCH_DOMAIN_MIN_DELAY_MS, 1500),
    respectRobotsTxt: parseBoolean(env.RESEARCH_RESPECT_ROBOTS_TXT, true),
    browserFetchEnabled: parseBoolean(env.RESEARCH_BROWSER_FETCH_ENABLED, true),
    browserMaxPages: positiveInt(env.RESEARCH_BROWSER_MAX_PAGES, 2),
    fetchTimeoutMs: positiveInt(env.RESEARCH_FETCH_TIMEOUT_MS, 15000),
    maxContentBytes: positiveInt(env.RESEARCH_MAX_CONTENT_BYTES, 5 * 1024 * 1024),
  };
}

export function getResearchAssetConfig(env = process.env): ResearchAssetConfig {
  return {
    assetDir: env.RESEARCH_ASSET_DIR || ".data/research-assets",
    storeRawHtml: parseBoolean(env.RESEARCH_STORE_RAW_HTML, true),
    storeRawPdf: parseBoolean(env.RESEARCH_STORE_RAW_PDF, true),
    storeRawText: parseBoolean(env.RESEARCH_STORE_RAW_TEXT, true),
  };
}

export function getResearchMemoryConfig(env = process.env): ResearchMemoryConfig {
  return {
    enabled: parseBoolean(env.RESEARCH_MEMORY_ENABLED, true),
    maxAgeHours: positiveInt(env.RESEARCH_MEMORY_MAX_AGE_HOURS, 24),
  };
}

export function isValidApiKey(value: string | undefined, placeholder?: string) {
  if (!value || value === placeholder) return false;
  return value.trim().length > 10;
}

export function hasKaggleCredentials(config: Pick<ResearchConfig, "kaggleApiToken" | "kaggleUsername" | "kaggleKey">) {
  return isValidApiKey(config.kaggleApiToken, "MY_KAGGLE_API_TOKEN") || Boolean(config.kaggleUsername && config.kaggleKey);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeAiBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || "https://api.openai.com/v1";
}
