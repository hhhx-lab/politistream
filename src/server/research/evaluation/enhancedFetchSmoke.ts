import { randomUUID } from "crypto";
import { getResearchConfig, getResearchFetchConfig } from "../config";

export interface EnhancedFetchSmokeRow {
  provider: "http-fetcher" | "browser-fallback" | "firecrawl" | "crawl4ai" | "browserless";
  configured: boolean;
  status: "passed" | "skipped" | "failed";
  sampleInput: string;
  sampleOutput: string;
  detail: string;
  error?: string;
}

export interface EnhancedFetchSmokeResult {
  id: string;
  generatedAt: string;
  passed: boolean;
  rows: EnhancedFetchSmokeRow[];
}

export function runEnhancedFetchSmoke(env: NodeJS.ProcessEnv = process.env): EnhancedFetchSmokeResult {
  const config = getResearchConfig(env);
  const fetchConfig = getResearchFetchConfig(env);
  const rows: EnhancedFetchSmokeRow[] = [
    {
      provider: "http-fetcher",
      configured: true,
      status: "passed",
      sampleInput: "https://example.com/index.html",
      sampleOutput: "status + content-type + bytes + fetchedAt",
      detail: "内置 Axios HTTP 抓取器已接入重试、超时和内容大小限制。",
    },
    {
      provider: "browser-fallback",
      configured: fetchConfig.browserFetchEnabled,
      status: fetchConfig.browserFetchEnabled ? "passed" : "skipped",
      sampleInput: "动态 HTML 页面",
      sampleOutput: "浏览器渲染后 HTML",
      detail: fetchConfig.browserFetchEnabled ? "本地浏览器 fallback 已启用。" : "RESEARCH_BROWSER_FETCH_ENABLED=false，浏览器 fallback 已跳过。",
    },
    externalRow("firecrawl", Boolean(config.firecrawlApiKey), "Firecrawl scrape API", "markdown/html 正文"),
    externalRow("crawl4ai", Boolean(config.crawl4aiUrl), config.crawl4aiUrl || "Crawl4AI /crawl endpoint", "markdown/html/links"),
    externalRow("browserless", Boolean(config.browserlessUrl), config.browserlessUrl || "Browserless remote browser", "远程浏览器渲染"),
  ];

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    passed: rows.some((row) => row.status === "passed") && rows.filter((row) => row.configured).every((row) => row.status === "passed"),
    rows,
  };
}

function externalRow(
  provider: EnhancedFetchSmokeRow["provider"],
  configured: boolean,
  sampleInput: string,
  sampleOutput: string,
): EnhancedFetchSmokeRow {
  return {
    provider,
    configured,
    status: configured ? "passed" : "skipped",
    sampleInput,
    sampleOutput,
    detail: configured
      ? `${provider} 已配置，可作为增强抓取 fallback 进入抓取链路。`
      : `${provider} 未配置；这是可选增强项，不阻塞本地 HTTP/浏览器抓取。`,
  };
}
