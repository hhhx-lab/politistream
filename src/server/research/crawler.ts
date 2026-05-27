import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { createRunBudgetState, canAcceptUrlForRun, recordAcceptedUrl } from "./budget";
import { canonicalizeUrl, getDomain, hashContent, resolveLink } from "./url";
import { CrawlDocument, ResearchBudget, SearchCandidate } from "./types";

export interface CrawlResult {
  document: CrawlDocument;
  discoveredLinks: string[];
}

export async function crawlPublicPage(candidate: SearchCandidate): Promise<CrawlResult> {
  const canonicalUrl = canonicalizeUrl(candidate.url) ?? candidate.canonicalUrl;
  const domain = getDomain(canonicalUrl);

  try {
    const response = await axios.get(candidate.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PolitiStreamResearchBot/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 15000,
      maxRedirects: 5,
      maxContentLength: 5 * 1024 * 1024,
    });

    const html = String(response.data ?? "");
    const dom = new JSDOM(html, { url: response.request?.res?.responseUrl ?? candidate.url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const contentText = (article?.textContent ?? dom.window.document.body?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const finalUrl = canonicalizeUrl(dom.window.location.href) ?? canonicalUrl;

    return {
      document: {
        jobId: candidate.jobId,
        url: candidate.url,
        canonicalUrl,
        finalUrl,
        title: article?.title ?? dom.window.document.title ?? candidate.title,
        domain,
        contentText,
        contentHash: hashContent(contentText),
        depth: candidate.depth,
        status: contentText ? "fetched" : "failed",
        error: contentText ? undefined : "empty_content",
        fetchedAt: new Date().toISOString(),
      },
      discoveredLinks: extractLinks(html, finalUrl),
    };
  } catch (error) {
    const status = axios.isAxiosError(error) && error.response && [401, 403, 451].includes(error.response.status)
      ? "blocked"
      : "failed";

    return {
      document: {
        jobId: candidate.jobId,
        url: candidate.url,
        canonicalUrl,
        domain,
        depth: candidate.depth,
        status,
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
      },
      discoveredLinks: [],
    };
  }
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
