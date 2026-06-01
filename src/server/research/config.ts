export interface ResearchConfig {
  databaseUrl?: string;
  redisUrl?: string;
  braveApiKey?: string;
  serpApiKey?: string;
  tavilyApiKey?: string;
  githubToken?: string;
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
  };
  enabledSearchProviderCount: number;
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
    braveApiKey: env.BRAVE_API_KEY,
    serpApiKey: env.SERPAPI_API_KEY,
    tavilyApiKey: env.TAVILY_API_KEY,
    githubToken: env.GITHUB_TOKEN,
  };
}

export function getResearchConfigStatus(config = getResearchConfig()): ResearchConfigStatus {
  const searchProviders = {
    brave: Boolean(config.braveApiKey),
    serpApi: Boolean(config.serpApiKey),
    tavily: Boolean(config.tavilyApiKey),
  };

  return {
    databaseConfigured: Boolean(config.databaseUrl),
    redisConfigured: Boolean(config.redisUrl),
    searchProviders,
    enabledSearchProviderCount: Object.values(searchProviders).filter(Boolean).length,
    readyForStorage: Boolean(config.databaseUrl),
    readyForQueue: Boolean(config.redisUrl),
  };
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

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
