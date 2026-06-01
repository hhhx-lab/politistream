export interface ServerRuntimeConfig {
  port: number;
  appUrl: string;
  refreshRssOnStartup: boolean;
}

const DEFAULT_BACKEND_PORT = 3001;
const DEFAULT_APP_URL = "http://localhost:3000";

export function getServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ServerRuntimeConfig {
  return {
    port: parsePort(env.BACKEND_PORT ?? env.PORT, DEFAULT_BACKEND_PORT),
    appUrl: env.APP_URL || DEFAULT_APP_URL,
    refreshRssOnStartup: parseBoolean(env.RSS_REFRESH_ON_STARTUP, false),
  };
}

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
