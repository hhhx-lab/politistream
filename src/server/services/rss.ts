import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { addNewsItem, updateNewsItemAnalysis, updateNewsContent, getNewsWithoutSummary, getNews } from "../db";
import { analyzeContent } from "./ai";

// ... (rest of imports)

export async function processMissingSummaries() {
  console.log("Processing missing summaries...");
  const items = getNewsWithoutSummary(20); // Process 20 at a time to avoid rate limits
  let processedCount = 0;

  for (const item of items) {
    if (item.id && item.title && item.contentSnippet) {
      await processItemAI(item.id, item.title, item.contentSnippet, item.link);
      processedCount++;
    }
  }
  
  console.log(`Processed ${processedCount} missing summaries.`);
  return processedCount;
}

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*"
  }
});

export const FEEDS = [
  // Layer 1: Policy "Original Sources" (Most Important)
  { name: "Federal Reserve (Monetary Policy)", url: "https://www.federalreserve.gov/feeds/press_monetary.xml" },
  { name: "White House Briefing Room", url: "https://www.whitehouse.gov/briefing-room/feed/" },
  { name: "BLS (CPI)", url: "https://www.bls.gov/feed/news-release/cpi.rss" },
  { name: "BEA (GDP/Economy)", url: "https://apps.bea.gov/rss/rss.xml" },
  { name: "SEC Press Releases", url: "https://www.sec.gov/news/pressreleases.rss" },

  // Layer 2: News Aggregators & Market News
  { name: "CNBC Economy", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910247" },
  { name: "CNBC Finance", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664" },
  { name: "CNBC US News", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15837362" },
  { name: "CNBC World", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362" },
  { name: "CNBC Tech", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910" },
  { name: "The Hill (Politics)", url: "https://thehill.com/feed/" },
  { name: "Forbes Business", url: "https://www.forbes.com/business/feed/" },
  { name: "VentureBeat", url: "https://venturebeat.com/feed/" },
  { name: "Politico", url: "https://rss.politico.com/politics-news.xml" },
  { name: "MarketWatch Top Stories", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "WashPost World", url: "https://feeds.washingtonpost.com/rss/world" },
  { name: "WashPost Business", url: "https://feeds.washingtonpost.com/rss/business" },
  { name: "WashPost Tech", url: "https://feeds.washingtonpost.com/rss/business/technology" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "NYT Business", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { name: "NYT Tech", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "BBC Tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "The Guardian Business", url: "https://www.theguardian.com/business/rss" },
  { name: "The Guardian Tech", url: "https://www.theguardian.com/uk/technology/rss" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/rss" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "Engadget", url: "https://www.engadget.com/rss.xml" },
  
  // Layer 3: Context & Analysis
  { name: "CBS News Politics", url: "https://www.cbsnews.com/latest/rss/politics" },
  { name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml" },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
  { name: "NPR Business", url: "https://feeds.npr.org/1006/rss.xml" },
  { name: "NPR Tech", url: "https://feeds.npr.org/1019/rss.xml" }
];

async function fetchFullContent(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0"
      },
      timeout: 10000, // Increased timeout
      maxRedirects: 5
    });
    
    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (article && article.textContent) {
        // Clean up whitespace
        return article.textContent.replace(/\s+/g, ' ').trim();
    }
    
    return "";
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
        console.warn(`Access denied (403) for ${url}. Using snippet instead.`);
    } else {
        console.error(`Error fetching full content for ${url}:`, error instanceof Error ? error.message : String(error));
    }
    return "";
  }
}

export async function fetchAndProcessFeeds() {
  let newItemsCount = 0;
  console.log("Starting feed fetch...");

  // Process feeds in batches to avoid overwhelming the network/server
  const BATCH_SIZE = 5;
  for (let i = 0; i < FEEDS.length; i += BATCH_SIZE) {
    const batch = FEEDS.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (feedSource) => {
      try {
        console.log(`Fetching ${feedSource.name}...`);
        const feed = await parser.parseURL(feedSource.url);
        
        for (const item of feed.items) {
          if (!item.title || !item.link) continue;

          let content = item.contentSnippet || item.content || "";
          
          // If content is short, try to fetch full article
          // Only fetch full content if we haven't seen this link before (optimization)
          // Since we can't easily check existence before fetching full content without DB query,
          // we'll rely on the fact that addNewsItem ignores duplicates.
          // However, fetching full content is expensive, so we should ideally check first.
          // For now, we'll keep the logic but reduce timeout in fetchFullContent if needed.
          
          if (content.length < 500) {
              // console.log(`Content short for ${item.title}, fetching full article...`);
              // Skip full content fetch for now to speed up initial load, or make it very fast/optional
              // const fullContent = await fetchFullContent(item.link);
              // if (fullContent.length > content.length) {
              //     content = fullContent;
              // }
          }

          let isoDate = new Date().toISOString();
          if (item.isoDate) {
              isoDate = item.isoDate;
          } else if (item.pubDate) {
              const parsed = new Date(item.pubDate);
              if (!isNaN(parsed.getTime())) {
                  isoDate = parsed.toISOString();
              }
          }

          const addedId = addNewsItem({
            title: item.title,
            link: item.link,
            source: feedSource.name,
            pubDate: isoDate,
            contentSnippet: content, // Store the fuller content
            summary: "",
            sentiment: 0,
            entities: "[]"
          });

          if (addedId) {
            newItemsCount++;
            // Trigger AI analysis for the new item with the full content
            // Run in background, don't await
            processItemAI(Number(addedId), item.title, content, item.link).catch(e => console.error(e));
          }
        }
      } catch (error) {
        console.error(`Error fetching ${feedSource.name}:`, error instanceof Error ? error.message : String(error));
      }
    }));
  }
  
  console.log(`Fetch complete. Added ${newItemsCount} new items.`);
  return newItemsCount;
}

export async function analyzeSingleItem(id: number) {
  const item = getNews().find(n => n.id === id);
  if (!item) return null;

  let fullContent = item.contentSnippet || "";
  
  // If content is short, try to fetch full article
  if ((!fullContent || fullContent.length < 2000) && item.link) {
      const fetchedContent = await fetchFullContent(item.link);
      if (fetchedContent.length > fullContent.length) {
          fullContent = fetchedContent;
          updateNewsContent(id, fullContent);
      }
  }

  const truncatedSnippet = fullContent.length > 20000 ? fullContent.substring(0, 20000) + "..." : fullContent;
  const analysis = await analyzeContent(item.title, truncatedSnippet);
  
  // Update DB
  updateNewsItemAnalysis(id, analysis.summary, analysis.sentiment, analysis.entities);
  
  // Return updated item structure
  return { 
      ...item, 
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      entities: JSON.stringify(analysis.entities),
      contentSnippet: fullContent,
      processed: 1
  };
}

async function processItemAI(id: number, title: string, snippet: string, link?: string) {
    try {
        let fullContent = snippet;
        
        // If snippet is short and we have a link, try to fetch full content
        if (snippet.length < 2000 && link) {
            // console.log(`Fetching full content for AI analysis: ${title}`);
            const fetchedContent = await fetchFullContent(link);
            if (fetchedContent.length > snippet.length) {
                fullContent = fetchedContent;
                // Update DB with full content so we don't lose it
                updateNewsContent(id, fullContent);
            }
        }

        // Truncate snippet if too long to avoid token limits, but keep enough context
        const truncatedSnippet = fullContent.length > 20000 ? fullContent.substring(0, 20000) + "..." : fullContent;
        const analysis = await analyzeContent(title, truncatedSnippet);
        updateNewsItemAnalysis(id, analysis.summary, analysis.sentiment, analysis.entities);
    } catch (e) {
        console.error("AI Analysis failed for", title, e);
    }
}
