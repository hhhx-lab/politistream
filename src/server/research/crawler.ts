import { JSDOM } from "jsdom";
import { createRunBudgetState, canAcceptUrlForRun, recordAcceptedUrl } from "./budget";
import { getResearchFetchConfig, ResearchFetchConfig } from "./config";
import { extractHtmlDocument } from "./extractors/htmlExtractor";
import { extractGitHubDocument } from "./extractors/githubExtractor";
import { extractNpmDocument, extractPyPiDocument } from "./extractors/packageExtractors";
import { extractPdfDocument } from "./extractors/pdfExtractor";
import { routeExtractorForUrl } from "./extractors/router";
import { extractSitemapUrls } from "./extractors/sitemapExtractor";
import { fetchBrowserContent } from "./fetchers/browserFetcher";
import { createDomainLimiter, robotsAllowsPath, shouldRetryFetch } from "./fetchers/fetchPolicy";
import { chooseFetcherKind, fetchErrorStatus, fetchHttpContent, FetchContentResult } from "./fetchers/httpFetcher";
import { canonicalizeUrl, getDomain, hashContent, resolveLink } from "./url";
import { CrawlDocument, ExtractedDocument, ResearchBudget, SearchCandidate } from "./types";

export interface CrawlResult {
  document: CrawlDocument;
  discoveredLinks: string[];
  rawContent?: {
    url: string;
    contentType: string;
    data: Buffer;
    fetchedAt: string;
  };
}

const domainLimiter = createDomainLimiter({ minDelayMs: getResearchFetchConfig().domainMinDelayMs });
const robotsCache = new Map<string, Promise<string | undefined>>();

export async function crawlPublicPage(candidate: SearchCandidate): Promise<CrawlResult> {
  const canonicalUrl = canonicalizeUrl(candidate.url) ?? candidate.canonicalUrl;
  const domain = getDomain(canonicalUrl);
  const fetchConfig = getResearchFetchConfig();

  try {
    if (await isBlockedByRobots(candidate.url, fetchConfig)) {
      return {
        document: {
          jobId: candidate.jobId,
          runId: candidate.runId,
          url: candidate.url,
          canonicalUrl,
          domain,
          depth: candidate.depth,
          status: "skipped",
          error: "robots_txt_disallowed",
          fetchedAt: new Date().toISOString(),
          memoryStatus: "stale",
        },
        discoveredLinks: [],
      };
    }

    let response = await fetchWithPolicy(candidate.url, domain, fetchConfig);
    let extracted = await extractResponseDocument(response.data, canonicalizeUrl(response.finalUrl) ?? canonicalUrl, response.contentType);
    let contentText = extracted.contentText.replace(/\s+/g, " ").trim();

    if (!contentText && shouldUseBrowserFallback(response, candidate.url, fetchConfig)) {
      response = await fetchBrowserContent(candidate.url);
      extracted = await extractResponseDocument(response.data, canonicalizeUrl(response.finalUrl) ?? canonicalUrl, response.contentType);
      contentText = extracted.contentText.replace(/\s+/g, " ").trim();
    }

    const finalUrl = canonicalizeUrl(response.finalUrl) ?? canonicalUrl;

    return {
      document: {
        jobId: candidate.jobId,
        runId: candidate.runId,
        url: candidate.url,
        canonicalUrl,
        finalUrl,
        title: extracted.title ?? candidate.title,
        domain,
        contentText,
        contentHash: hashContent(contentText),
        depth: candidate.depth,
        status: contentText ? "fetched" : "failed",
        error: contentText ? undefined : "empty_content",
        fetchedAt: response.fetchedAt,
        memoryStatus: "fresh",
      },
      discoveredLinks: extracted.links.map((link) => resolveLink(finalUrl, link.url)).filter(Boolean) as string[],
      rawContent: {
        url: finalUrl,
        contentType: response.contentType,
        data: response.data,
        fetchedAt: response.fetchedAt,
      },
    };
  } catch (error) {
    const status = fetchErrorStatus(error);
    const documentStatus = status && [401, 403, 451].includes(status)
      ? "blocked"
      : "failed";

    return {
      document: {
        jobId: candidate.jobId,
        runId: candidate.runId,
        url: candidate.url,
        canonicalUrl,
        domain,
        depth: candidate.depth,
        status: documentStatus,
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
        memoryStatus: "stale",
      },
      discoveredLinks: [],
    };
  }
}

async function fetchWithPolicy(
  url: string,
  domain: string,
  config: ResearchFetchConfig,
): Promise<FetchContentResult> {
  let lastError: unknown;

  for (let attempts = 1; attempts <= config.maxAttempts; attempts += 1) {
    await waitForDomain(domain);
    try {
      const kind = config.browserFetchEnabled && chooseFetcherKind({ url }) === "browser" ? "browser" : "http";
      return kind === "browser"
        ? await fetchBrowserContent(url)
        : await fetchHttpContent(url, {
          timeoutMs: config.fetchTimeoutMs,
          maxContentBytes: config.maxContentBytes,
        });
    } catch (error) {
      lastError = error;
      if (!shouldRetryFetch({ status: fetchErrorStatus(error), attempts, maxAttempts: config.maxAttempts })) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function waitForDomain(domain: string) {
  const nextAllowedAt = domainLimiter.nextAllowedAt(domain);
  const delayMs = nextAllowedAt.getTime() - Date.now();
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function isBlockedByRobots(url: string, config: ResearchFetchConfig) {
  if (!config.respectRobotsTxt) return false;

  try {
    const parsed = new URL(url);
    const robotsText = await getRobotsText(parsed.origin, config);
    if (!robotsText) return false;
    return !robotsAllowsPath(robotsText, parsed.pathname || "/");
  } catch {
    return false;
  }
}

async function getRobotsText(origin: string, config: ResearchFetchConfig) {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const robotsPromise = fetchHttpContent(`${origin}/robots.txt`, {
    timeoutMs: Math.min(config.fetchTimeoutMs, 5000),
    maxContentBytes: Math.min(config.maxContentBytes, 512 * 1024),
  })
    .then((response) => response.data.toString("utf8"))
    .catch(() => undefined);

  robotsCache.set(origin, robotsPromise);
  return robotsPromise;
}

function shouldUseBrowserFallback(
  response: FetchContentResult,
  url: string,
  config: ResearchFetchConfig,
) {
  if (!config.browserFetchEnabled || response.fetcher === "browser") return false;
  const contentType = response.contentType.toLowerCase();
  return chooseFetcherKind({ contentType, url }) === "browser" || contentType.includes("text/html");
}

async function extractResponseDocument(
  buffer: Buffer,
  url: string,
  contentType: string,
): Promise<ExtractedDocument> {
  const kind = routeExtractorForUrl(url, contentType);

  if (kind === "pdf") {
    return extractPdfDocument(buffer, url);
  }

  if (kind === "github") {
    return extractGitHubDocument(url);
  }

  if (kind === "npm") {
    return extractNpmDocument(url);
  }

  if (kind === "pypi") {
    return extractPyPiDocument(url);
  }

  const text = buffer.toString("utf8");
  if (kind === "sitemap") {
    const entries = extractSitemapUrls(text);
    return {
      url,
      canonicalUrl: canonicalizeUrl(url) ?? url,
      title: "Sitemap",
      contentText: entries.map((entry) => [entry.url, entry.lastmod, entry.priority].filter(Boolean).join(" ")).join("\n"),
      links: entries.map((entry) => ({ url: entry.url, text: entry.url, context: entry.lastmod })),
      tables: [],
      metadata: { entryCount: entries.length },
      extractor: "sitemap",
    };
  }

  return extractHtmlDocument(text, url);
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const links = new Set<string>();

  for (const anchor of Array.from(dom.window.document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const resolved = resolveLink(baseUrl, href);
    if (resolved) {
      links.add(resolved);
    }
  }

  return [...links];
}

export function filterLinksForBudget(
  links: string[],
  budget: ResearchBudget,
  depth: number,
  alreadySeen = new Set<string>(),
): string[] {
  const state = createRunBudgetState(budget);
  const accepted: string[] = [];

  for (const link of links) {
    const canonicalUrl = canonicalizeUrl(link);
    if (!canonicalUrl || alreadySeen.has(canonicalUrl)) continue;
    if (!canAcceptUrlForRun(state, canonicalUrl, depth)) continue;
    recordAcceptedUrl(state, canonicalUrl);
    accepted.push(canonicalUrl);
  }

  return accepted;
}
