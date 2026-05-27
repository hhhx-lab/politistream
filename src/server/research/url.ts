import { createHash } from "crypto";

export function canonicalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    const removableParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];
    removableParams.forEach((param) => url.searchParams.delete(param));
    url.searchParams.sort();

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function resolveLink(baseUrl: string, href: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
