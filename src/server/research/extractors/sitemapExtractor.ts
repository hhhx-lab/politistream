import { JSDOM } from "jsdom";

export interface SitemapUrl {
  url: string;
  lastmod?: string;
  priority?: string;
}

export function extractSitemapUrls(xml: string): SitemapUrl[] {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  return Array.from(dom.window.document.querySelectorAll("url")).map((node) => ({
    url: node.querySelector("loc")?.textContent?.trim() ?? "",
    lastmod: node.querySelector("lastmod")?.textContent?.trim() || undefined,
    priority: node.querySelector("priority")?.textContent?.trim() || undefined,
  })).filter((entry) => entry.url);
}
