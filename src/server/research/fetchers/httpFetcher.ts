import axios from "axios";

export type FetcherKind = "http" | "browser";

export interface FetchContentResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  data: Buffer;
  fetchedAt: string;
  fetcher: FetcherKind;
  durationMs: number;
}

export interface FetchHttpContentOptions {
  timeoutMs?: number;
  maxContentBytes?: number;
}

export function chooseFetcherKind(input: { contentType?: string; url: string }): FetcherKind {
  const url = input.url.toLowerCase();
  const contentType = (input.contentType ?? "").toLowerCase();
  if (contentType.includes("pdf") || url.endsWith(".pdf")) return "http";
  if (url.includes("spa=true") || url.includes("#/")) return "browser";
  return "http";
}

export async function fetchHttpContent(
  url: string,
  options: FetchHttpContentOptions = {},
): Promise<FetchContentResult> {
  const startedAt = Date.now();
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PolitiStreamResearchBot/1.0)",
      Accept: "text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8",
    },
    timeout: options.timeoutMs ?? 15000,
    maxRedirects: 5,
    maxContentLength: options.maxContentBytes ?? 10 * 1024 * 1024,
    responseType: "arraybuffer",
  });

  return {
    requestedUrl: url,
    finalUrl: response.request?.res?.responseUrl ?? url,
    status: response.status,
    contentType: String(response.headers["content-type"] ?? ""),
    data: Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data ?? ""),
    fetchedAt: new Date().toISOString(),
    fetcher: "http",
    durationMs: Date.now() - startedAt,
  };
}

export function fetchErrorStatus(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    return error.response.status;
  }
  return undefined;
}
