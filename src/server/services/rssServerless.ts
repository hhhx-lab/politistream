import Parser from "rss-parser";
import {
  addNewsItem,
  getRSSSourceById,
  listRSSSources,
  seedRSSSources,
  updateRSSSourceRefreshState,
} from "../db.js";
import type { RSSSource, RSSSourceInput } from "../db.js";

const parser = new Parser();

const DEMO_FEEDS: RSSSourceInput[] = [
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_monetary.xml" },
  { name: "SEC Press Releases", url: "https://www.sec.gov/news/pressreleases.rss" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
];

export type FeedRefreshResult = {
  source: RSSSource;
  success: boolean;
  newItems: number;
  fetchedAt?: string;
  error?: string;
};

export function getServerlessRSSSources(includeDisabled = true) {
  seedRSSSources(DEMO_FEEDS);
  return listRSSSources(includeDisabled);
}

export async function refreshServerlessRSSSource(sourceId: number): Promise<FeedRefreshResult> {
  getServerlessRSSSources();
  const source = getRSSSourceById(sourceId);
  if (!source) throw new Error("rss_source_not_found");
  if (!source.enabled) throw new Error("rss_source_disabled");
  return refreshSource(source);
}

export async function refreshServerlessFeeds() {
  const sources = getServerlessRSSSources(false);
  const results = await Promise.all(sources.map(refreshSource));
  return {
    newItems: results.reduce((sum, result) => sum + result.newItems, 0),
    results,
  };
}

async function refreshSource(source: RSSSource): Promise<FeedRefreshResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const feed = await parser.parseURL(source.url);
    let newItems = 0;
    for (const item of feed.items) {
      if (!item.title || !item.link) continue;
      const parsedDate = new Date(item.isoDate || item.pubDate || fetchedAt);
      const pubDate = Number.isNaN(parsedDate.valueOf()) ? fetchedAt : parsedDate.toISOString();
      if (addNewsItem({
        title: item.title,
        link: item.link,
        source: source.name,
        pubDate,
        contentSnippet: item.contentSnippet || item.content || "",
        summary: "",
        sentiment: 0,
        entities: "[]",
      })) newItems += 1;
    }
    return {
      source: updateRSSSourceRefreshState(source.id, { fetchedAt, error: null }) || source,
      success: true,
      newItems,
      fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source: updateRSSSourceRefreshState(source.id, { error: message }) || source,
      success: false,
      newItems: 0,
      error: message,
    };
  }
}
