import axios from "axios";
import { extractHtmlDocument } from "../extractors/htmlExtractor";
import { canonicalizeUrl } from "../url";
import { ExtractedDocument, ExtractorKind } from "../types";
import { getResearchConfig, getResearchFetchConfig } from "../config";
import { FetchContentResult } from "./httpFetcher";

export interface EnhancedFetchResult {
  provider: "firecrawl" | "crawl4ai";
  fetch: FetchContentResult;
  document: ExtractedDocument;
}

export async function tryEnhancedFetch(url: string, kind: ExtractorKind) {
  const config = getResearchConfig();
  if (kind !== "html" && kind !== "pdf" && kind !== "table") return null;

  if (config.firecrawlApiKey) {
    const firecrawl = await fetchFromFirecrawl(url, config.firecrawlApiKey).catch(() => null);
    if (firecrawl) return firecrawl;
  }

  if (config.crawl4aiUrl) {
    const crawl4ai = await fetchFromCrawl4Ai(url, config.crawl4aiUrl).catch(() => null);
    if (crawl4ai) return crawl4ai;
  }

  return null;
}

async function fetchFromFirecrawl(url: string, apiKey: string): Promise<EnhancedFetchResult | null> {
  const startedAt = Date.now();
  const response = await axios.post(
    "https://api.firecrawl.dev/v2/scrape",
    {
      url,
      formats: ["markdown", "html"],
      onlyMainContent: true,
      includeTags: true,
      timeout: 30000,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const payload = response.data ?? {};
  const data = payload.data ?? payload.result ?? payload;
  const html = typeof data.html === "string" ? data.html : typeof data.rawHtml === "string" ? data.rawHtml : "";
  const markdown = typeof data.markdown === "string" ? data.markdown : typeof data.content === "string" ? data.content : "";
  const finalUrl = canonicalizeUrl(String(data.metadata?.sourceURL ?? data.metadata?.url ?? data.url ?? url)) ?? url;
  const contentType = html ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8";
  const body = html || markdown || JSON.stringify(data, null, 2);

  return {
    provider: "firecrawl",
    fetch: {
      requestedUrl: url,
      finalUrl,
      status: response.status,
      contentType,
      data: Buffer.from(body, "utf8"),
      fetchedAt: new Date().toISOString(),
      fetcher: "http",
      durationMs: Date.now() - startedAt,
    },
    document: documentFromRemotePayload({
      url: finalUrl,
      title: typeof data.metadata?.title === "string" ? data.metadata.title : typeof data.title === "string" ? data.title : undefined,
      html,
      markdown,
      links: Array.isArray(data.links) ? data.links : [],
      metadata: {
        ...safeObject(data.metadata),
        source: "firecrawl",
      },
    }),
  };
}

async function fetchFromCrawl4Ai(url: string, baseUrl: string): Promise<EnhancedFetchResult | null> {
  const startedAt = Date.now();
  const endpoint = new URL("/crawl", baseUrl).toString();
  const response = await axios.post(
    endpoint,
    {
      url,
      markdown: true,
      html: true,
      include_links: true,
      only_main_content: true,
      wait_for: 1000,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: getResearchFetchConfig().fetchTimeoutMs,
    },
  );

  const payload = response.data ?? {};
  const data = payload.data ?? payload.result ?? payload;
  const html = typeof data.html === "string" ? data.html : "";
  const markdown = typeof data.markdown === "string" ? data.markdown : typeof data.cleaned_markdown === "string" ? data.cleaned_markdown : "";
  if (!html && !markdown) return null;

  const finalUrl = canonicalizeUrl(String(data.finalUrl ?? data.url ?? url)) ?? url;
  const contentType = html ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8";
  const body = html || markdown;

  return {
    provider: "crawl4ai",
    fetch: {
      requestedUrl: url,
      finalUrl,
      status: response.status,
      contentType,
      data: Buffer.from(body, "utf8"),
      fetchedAt: new Date().toISOString(),
      fetcher: "http",
      durationMs: Date.now() - startedAt,
    },
    document: documentFromRemotePayload({
      url: finalUrl,
      title: typeof data.title === "string" ? data.title : undefined,
      html,
      markdown,
      links: Array.isArray(data.links) ? data.links : [],
      metadata: {
        ...safeObject(data.metadata),
        source: "crawl4ai",
      },
    }),
  };
}

function documentFromRemotePayload(input: {
  url: string;
  title?: string;
  html?: string;
  markdown?: string;
  links?: Array<{ url?: string; text?: string; context?: string }>;
  metadata?: Record<string, unknown>;
}): ExtractedDocument {
  if (input.html) {
    const extracted = extractHtmlDocument(input.html, input.url);
    return {
      ...extracted,
      title: input.title ?? extracted.title,
      contentText: input.markdown ? stripMarkdown(input.markdown) || extracted.contentText : extracted.contentText,
      contentMarkdown: input.markdown ? input.markdown : extracted.contentMarkdown,
      links: normalizeLinks(input.links).length > 0 ? normalizeLinks(input.links) : extracted.links,
      metadata: {
        ...extracted.metadata,
        ...(input.metadata ?? {}),
      },
    };
  }

  const contentText = stripMarkdown(input.markdown ?? "");
  return {
    url: input.url,
    canonicalUrl: canonicalizeUrl(input.url) ?? input.url,
    title: input.title,
    contentText,
    contentMarkdown: input.markdown,
    links: normalizeLinks(input.links),
    tables: [],
    metadata: input.metadata ?? {},
    extractor: "html",
  };
}

function normalizeLinks(links: Array<{ url?: string; text?: string; context?: string }> = []) {
  return links
    .map((link) => ({
      url: String(link.url ?? "").trim(),
      text: String(link.text ?? "").trim(),
      context: typeof link.context === "string" ? link.context : undefined,
    }))
    .filter((link) => Boolean(link.url));
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_`~]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
