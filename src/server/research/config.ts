export interface ResearchConfig {
  databaseUrl?: string;
  redisUrl?: string;
  braveApiKey?: string;
  serpApiKey?: string;
  tavilyApiKey?: string;
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
