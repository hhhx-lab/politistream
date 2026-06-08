#!/usr/bin/env node
import "dotenv/config";

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = new Set();
let shuttingDown = false;

const env = {
  ...process.env,
  APP_URL: process.env.APP_URL || `http://localhost:${process.env.FRONTEND_PORT || "3000"}`,
  FRONTEND_PORT: process.env.FRONTEND_PORT || "3000",
  BACKEND_PORT: process.env.BACKEND_PORT || process.env.PORT || "3001",
  VITE_API_PROXY_TARGET:
    process.env.VITE_API_PROXY_TARGET || process.env.API_URL || `http://localhost:${process.env.BACKEND_PORT || process.env.PORT || "3001"}`,
};

const options = parseOptions(process.argv.slice(2));

main().catch((error) => {
  console.error(`\n[start-all] 启动失败：${error.message}`);
  shutdown(1);
});

async function main() {
  process.chdir(rootDir);

  console.log("[start-all] PolitiStream 一键启动");
  console.log(`[start-all] 项目目录：${rootDir}`);
  console.log(`[start-all] 前端地址：${env.APP_URL}`);
  console.log(`[start-all] 后端地址：${env.VITE_API_PROXY_TARGET}`);

  if (!fs.existsSync(path.join(rootDir, ".env"))) {
    console.warn("[start-all] 未发现 .env，将使用默认值和系统环境变量。建议先从 .env.example 复制并填写。");
  }

  ensureDataDirs();
  printCapabilitySummary();

  if (!options.skipInfra) {
    await startDockerInfra();
  }

  if (!options.skipCrawl4ai) {
    await startCrawl4aiIfLocal();
  }

  await waitForConfiguredInfrastructure();
  checkAnalyticsWorker();

  const backend = spawnManaged("backend", "npm", ["run", "dev:backend"], env);
  const frontend = spawnManaged("frontend", "npm", ["run", "dev:frontend"], env);

  await Promise.all([
    waitForHttp(`${backendBaseUrl()}/api/health`, "后端 API", 60_000),
    waitForHttp(frontendBaseUrl(), "前端页面", 60_000),
  ]);

  console.log("");
  console.log("[start-all] 已就绪");
  console.log(`[start-all] 前端：${frontendBaseUrl()}`);
  console.log(`[start-all] 后端健康检查：${backendBaseUrl()}/api/health`);
  console.log(`[start-all] Research 配置状态：${backendBaseUrl()}/api/research/status`);
  console.log("[start-all] 按 Ctrl+C 会同时关闭前后端；Docker 基础设施会保留运行，便于下次快速启动。");

  await waitForChildren([backend, frontend]);
}

function parseOptions(args) {
  return {
    skipInfra: args.includes("--skip-infra") || readBoolean(env.POLITISTREAM_SKIP_INFRA, false),
    skipCrawl4ai: args.includes("--skip-crawl4ai") || readBoolean(env.POLITISTREAM_SKIP_CRAWL4AI, false),
  };
}

function ensureDataDirs() {
  const dirs = [
    env.RESEARCH_ASSET_DIR || ".data/research-assets",
    env.ANALYTICS_ARTIFACT_DIR || ".data/analytics-artifacts",
    env.RESEARCH_SMOKE_DIR || ".data/research-smoke",
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.resolve(rootDir, dir), { recursive: true });
  }

  if (env.ANALYTICS_STORE_FILE) {
    fs.mkdirSync(path.dirname(path.resolve(rootDir, env.ANALYTICS_STORE_FILE)), { recursive: true });
  }
}

function printCapabilitySummary() {
  const searchProviders = [
    ["Brave", env.BRAVE_API_KEY],
    ["SerpApi", env.SERPAPI_API_KEY],
    ["Tavily", env.TAVILY_API_KEY],
    ["NewsAPI", env.NEWSAPI_KEY || env.NEWS_API_KEY],
  ].filter(([, value]) => isConfigured(value));

  const dataProviders = [
    ["GitHub", env.GITHUB_TOKEN],
    ["FRED", env.FRED_API_KEY],
    ["Kaggle", env.KAGGLE_API_TOKEN || (env.KAGGLE_USERNAME && env.KAGGLE_KEY)],
  ].filter(([, value]) => isConfigured(value));

  console.log("[start-all] 能力检查：");
  console.log(`  - Postgres：${isConfigured(env.DATABASE_URL) ? "已配置" : "未配置"}`);
  console.log(`  - Redis/BullMQ：${isConfigured(env.REDIS_URL) ? "已配置" : "未配置"}`);
  console.log(`  - GPT 中转站：${isConfigured(env.AI_API_KEY) ? `已配置，模型 ${env.AI_MODEL || "gpt-5.4"}` : "未配置 AI_API_KEY"}`);
  console.log(`  - 搜索 Provider：${searchProviders.length ? searchProviders.map(([name]) => name).join(", ") : "未配置"}`);
  console.log(`  - 数据 Provider：${dataProviders.length ? dataProviders.map(([name]) => name).join(", ") : "未配置"}`);
  console.log(`  - Crawl4AI：${isConfigured(env.CRAWL4AI_URL) ? env.CRAWL4AI_URL : "未配置"}`);
}

async function startDockerInfra() {
  if (!fs.existsSync(path.join(rootDir, "docker-compose.yml"))) return;
  if (!commandExists("docker")) {
    console.warn("[start-all] 未找到 docker，跳过 Postgres/Redis 自动启动。");
    return;
  }

  const composeCheck = spawnSync("docker", ["compose", "version"], { cwd: rootDir, encoding: "utf8" });
  if (composeCheck.status !== 0) {
    console.warn("[start-all] docker compose 不可用，跳过 Postgres/Redis 自动启动。");
    return;
  }

  console.log("[start-all] 启动 Docker 基础设施：postgres、redis");
  await runOnce("docker", ["compose", "up", "-d", "postgres", "redis"], { cwd: rootDir });
}

async function startCrawl4aiIfLocal() {
  if (!isConfigured(env.CRAWL4AI_URL)) return;

  const url = safeUrl(env.CRAWL4AI_URL);
  if (!url) {
    console.warn("[start-all] CRAWL4AI_URL 格式无效，跳过 Crawl4AI 自动启动。");
    return;
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    console.log("[start-all] CRAWL4AI_URL 指向远程服务，跳过本地容器启动。");
    return;
  }

  if (!commandExists("docker")) {
    console.warn("[start-all] 未找到 docker，无法自动启动 Crawl4AI。");
    return;
  }

  const healthy = await isHttpReady(`${trimSlash(env.CRAWL4AI_URL)}/monitor/health`, 3_000);
  if (healthy) {
    console.log("[start-all] Crawl4AI 已在本地运行。");
    return;
  }

  const containerName = env.CRAWL4AI_CONTAINER_NAME || "politistream-crawl4ai";
  const port = url.port || "11235";
  const inspect = spawnSync("docker", ["inspect", containerName], { encoding: "utf8" });

  try {
    if (inspect.status === 0) {
      console.log(`[start-all] 启动已有 Crawl4AI 容器：${containerName}`);
      await runOnce("docker", ["start", containerName]);
    } else {
      console.log(`[start-all] 创建 Crawl4AI 容器：${containerName}`);
      await runOnce("docker", [
        "run",
        "-d",
        "--name",
        containerName,
        "-p",
        `${port}:11235`,
        "--shm-size=1g",
        "unclecode/crawl4ai:latest",
      ]);
    }

    await waitForHttp(`${trimSlash(env.CRAWL4AI_URL)}/monitor/health`, "Crawl4AI", 90_000);
  } catch (error) {
    console.warn(`[start-all] Crawl4AI 自动启动失败，主系统继续启动：${error.message}`);
    console.warn("[start-all] 之后可手动重试：docker run -d --name politistream-crawl4ai -p 11235:11235 --shm-size=1g unclecode/crawl4ai:latest");
  }
}

async function waitForConfiguredInfrastructure() {
  const checks = [];

  if (isConfigured(env.DATABASE_URL)) {
    const databaseUrl = safeUrl(env.DATABASE_URL);
    if (databaseUrl) checks.push(waitForTcp(databaseUrl.hostname, databaseUrl.port || "5432", "Postgres", 60_000));
  }

  if (isConfigured(env.REDIS_URL)) {
    const redisUrl = safeUrl(env.REDIS_URL);
    if (redisUrl) checks.push(waitForTcp(redisUrl.hostname, redisUrl.port || "6379", "Redis", 60_000));
  }

  await Promise.all(checks);
}

function checkAnalyticsWorker() {
  const workerDir = path.resolve(rootDir, env.ANALYTICS_WORKER_DIR || "workers-analytics");
  const configuredPython = env.ANALYTICS_PYTHON_BIN || ".venv/bin/python";
  const pythonPath = path.isAbsolute(configuredPython)
    ? configuredPython
    : path.resolve(workerDir, configuredPython);

  if (fs.existsSync(pythonPath)) {
    console.log(`[start-all] Analytics Python worker：${pythonPath}`);
    return;
  }

  console.warn("[start-all] Analytics Python worker 尚未就绪。Data Lab 轻量接口可启动，但完整 Python 分析需先执行：");
  console.warn("[start-all]   cd workers-analytics && uv sync --extra ml --extra reports --python 3.12");
}

function spawnManaged(label, command, args, childEnv) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: childEnv,
    stdio: ["inherit", "pipe", "pipe"],
  });

  children.add(child);

  child.stdout.on("data", (chunk) => prefixLog(label, chunk));
  child.stderr.on("data", (chunk) => prefixLog(label, chunk));
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[start-all] ${label} 已退出：code=${code ?? "null"} signal=${signal ?? "null"}`);
      shutdown(code || 1);
    }
  });

  return child;
}

function prefixLog(label, chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) console.log(`[${label}] ${line}`);
  }
}

async function runOnce(command, args, spawnOptions = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...spawnOptions, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} 退出码 ${code}`));
    });
    child.on("error", reject);
  });
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return result.status === 0;
}

async function waitForHttp(url, label, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpReady(url, 2_000)) {
      console.log(`[start-all] ${label} 已就绪：${url}`);
      return;
    }
    await sleep(1_000);
  }
  throw new Error(`${label} 未在 ${Math.round(timeoutMs / 1000)} 秒内就绪：${url}`);
}

async function isHttpReady(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForTcp(host, port, label, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(host, Number(port))) {
      console.log(`[start-all] ${label} 端口已就绪：${host}:${port}`);
      return;
    }
    await sleep(1_000);
  }
  throw new Error(`${label} 未在 ${Math.round(timeoutMs / 1000)} 秒内就绪：${host}:${port}`);
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(2_000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

function waitForChildren(processes) {
  return new Promise((resolve) => {
    let remaining = processes.length;
    for (const child of processes) {
      child.on("exit", () => {
        remaining -= 1;
        if (remaining === 0) resolve();
      });
    }
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const child of children) {
      child.kill("SIGKILL");
    }
    process.exit(code);
  }, 2_000).unref();

  if (children.size === 0) process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function frontendBaseUrl() {
  return `http://localhost:${env.FRONTEND_PORT}`;
}

function backendBaseUrl() {
  const target = safeUrl(env.VITE_API_PROXY_TARGET);
  if (target) return `${target.protocol}//${target.host}`;
  return `http://localhost:${env.BACKEND_PORT}`;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isConfigured(value) {
  if (!value) return false;
  const normalized = String(value).trim();
  return Boolean(normalized) && !normalized.includes("MY_") && !normalized.includes("your-") && normalized !== "\"\"";
}

function readBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
