import { getResearchFetchConfig } from "../config";
import { FetchContentResult } from "./httpFetcher";
import { getBrowserPage } from "./browserPool";

export async function fetchBrowserContent(url: string): Promise<FetchContentResult> {
  const startedAt = Date.now();
  const page = await getBrowserPage();
  const { fetchTimeoutMs, maxContentBytes } = getResearchFetchConfig();

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: fetchTimeoutMs,
    });
    await page.waitForSelector("body", { timeout: Math.min(fetchTimeoutMs, 5000) }).catch(() => undefined);

    const html = await page.content();
    const data = Buffer.from(html.slice(0, maxContentBytes), "utf8");

    return {
      requestedUrl: url,
      finalUrl: page.url(),
      status: response?.status() ?? 200,
      contentType: response?.headers()["content-type"] ?? "text/html; charset=utf-8",
      data,
      fetchedAt: new Date().toISOString(),
      fetcher: "browser",
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}
