import { Request, Response } from "express";
import { Pool } from "pg";
import Redis from "ioredis";
import {
  getResearchConfig,
  getResearchConfigStatus,
  ResearchConfigurationError,
} from "./config";

export async function sendResearchConfigStatus(_req: Request, res: Response) {
  const config = getResearchConfig();
  const status = getResearchConfigStatus(config);
  const [storage, queue] = await Promise.all([
    checkPostgres(config.databaseUrl),
    checkRedis(config.redisUrl),
  ]);
  res.json({
    ...status,
    readyForStorage: storage.ok,
    readyForQueue: queue.ok,
    storage: {
      configured: Boolean(config.databaseUrl),
      ok: storage.ok,
      error: storage.error,
    },
    queue: {
      configured: Boolean(config.redisUrl),
      ok: queue.ok,
      error: queue.error,
    },
  });
}

export function sendResearchError(res: Response, error: unknown) {
  if (error instanceof ResearchConfigurationError) {
    return res.status(error.statusCode).json({
      error: "research_configuration_error",
      message: error.message,
      status: getResearchConfigStatus(getResearchConfig()),
    });
  }

  console.error("Research API error:", error);
  return res.status(500).json({
    error: "research_internal_error",
    message: error instanceof Error ? error.message : "Unknown research API error",
  });
}

async function checkPostgres(databaseUrl?: string): Promise<{ ok: boolean; error?: string }> {
  if (!databaseUrl) return { ok: false, error: "DATABASE_URL missing" };
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function checkRedis(redisUrl?: string): Promise<{ ok: boolean; error?: string }> {
  if (!redisUrl) return { ok: false, error: "REDIS_URL missing" };
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 2000,
  });
  try {
    await redis.connect();
    await redis.ping();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    redis.disconnect();
  }
}
