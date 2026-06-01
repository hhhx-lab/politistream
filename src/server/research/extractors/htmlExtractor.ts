import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { canonicalizeUrl } from "../url";
import { ExtractedDocument, ExtractedLink } from "../types";
import { extractTablesFromHtml } from "./tableExtractor";

export function extractHtmlDocument(html: string, url: string): ExtractedDocument {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title ?? dom.window.document.title ?? undefined;
  const contentText = (article?.textContent ?? dom.window.document.body?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    url,
    canonicalUrl: canonicalizeUrl(url) ?? url,
    title,
    contentText,
    contentMarkdown: article?.textContent ?? undefined,
    links: extractDocumentLinks(dom),
    tables: extractTablesFromHtml(html),
    metadata: extractMetadata(dom),
    extractor: "html",
  };
}

function extractDocumentLinks(dom: JSDOM): ExtractedLink[] {
  return Array.from(dom.window.document.querySelectorAll("a[href]")).map((anchor) => ({
    url: String(anchor.getAttribute("href") ?? ""),
    text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
  })).filter((link) => link.url);
}

function extractMetadata(dom: JSDOM) {
  const metadata: Record<string, unknown> = {};
  for (const meta of Array.from(dom.window.document.querySelectorAll("meta"))) {
    const key = meta.getAttribute("property") ?? meta.getAttribute("name");
    const content = meta.getAttribute("content");
    if (key && content) metadata[key] = content;
  }
  return metadata;
}
