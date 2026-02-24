import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";
import { addNewsItem, updateNewsItemAnalysis } from "../db";
import { analyzeContent } from "./ai";

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
  { name: "Reuters Politics", url: "https://www.reutersagency.com/feed/?best-topics=politics&post_type=best" },
  { name: "Reuters Business", url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best" },
  { name: "Politico", url: "https://rss.politico.com/politics-news.xml" },
  { name: "MarketWatch Top Stories", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  
  // Layer 3: Context & Analysis
  { name: "CBS News Politics", url: "https://www.cbsnews.com/latest/rss/politics" },
  { name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml" }
];

async function fetchFullContent(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
      timeout: 8000,
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove scripts, styles, and ads
    $('script, style, nav, footer, header, .ad, .advertisement, .social-share').remove();
    
    // Try common article selectors
    let content = "";
    const selectors = [
      'article',
      '[itemprop="articleBody"]',
      '.article-body',
      '.story-text',
      '.story-body',
      '.content-body',
      '.post-content',
      '.entry-content',
      '#main-content',
      'main'
    ];
    
    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        // Remove nested unwanted elements
        element.find('script, style, nav, footer, header, .ad, .advertisement, .social-share, .related-stories').remove();
        
        // Get text from paragraphs to avoid menu items
        content = element.find('p').map((i, el) => $(el).text().trim()).get().filter(text => text.length > 20).join('\n\n');
        if (content.length > 200) break;
      }
    }
    
    // Fallback: just grab all paragraphs if specific selectors fail
    if (content.length < 200) {
      content = $('p').map((i, el) => $(el).text().trim()).get().filter(text => text.length > 40).join('\n\n');
    }
    
    return content.trim();
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

  // Process feeds in batches to avoid overwhelming resources but still be faster
  const BATCH_SIZE = 3;
  for (let i = 0; i < FEEDS.length; i += BATCH_SIZE) {
    const batch = FEEDS.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (feedSource) => {
      try {
        console.log(`Fetching ${feedSource.name}...`);
        const feed = await parser.parseURL(feedSource.url);
        
        // Process items sequentially within a feed to maintain order logic if needed
        for (const item of feed.items) {
          if (!item.title || !item.link) continue;

          // Check if item already exists before doing heavy lifting (fetching full content)
          // Note: addNewsItem checks for uniqueness on link, but we can't check return value without running it.
          // However, fetching full content is expensive. 
          // Ideally we'd check existence first. But since we use SQLite, a quick select is cheap.
          // For now, we'll rely on the fact that if it's a new run, we might re-fetch content for existing items 
          // if we don't check. 
          // OPTIMIZATION: We should probably check if link exists in DB before fetching content.
          // But `addNewsItem` does INSERT OR IGNORE. 
          // Let's assume for "real-time" speed, we only fetch full content if we are actually inserting.
          
          // To do this properly without changing DB schema too much, we'll just proceed.
          // But to speed up, we can skip fetching full content if the snippet is long enough OR
          // if we are just polling frequently.
          
          let content = item.contentSnippet || item.content || "";
          
          // Only fetch full content if snippet is very short AND it looks like a new item
          // (We can't easily know if it's new without querying DB, but let's do the expensive fetch)
          if (content.length < 500) {
              // console.log(`Content short for ${item.title}, fetching full article...`);
              // For real-time speed, let's skip full content fetch on the scheduled loop 
              // UNLESS we really need it. Or maybe only do it for high-value sources.
              // Let's keep it but maybe timeout faster or just accept snippets for speed?
              // Actually, user wants "latest data", so speed is key.
              // Let's keep the logic but maybe we can optimize by checking date?
              
              // If item is older than 24 hours, skip full fetch to save time on old items
              const itemDate = item.pubDate ? new Date(item.pubDate) : new Date();
              const ageInHours = (Date.now() - itemDate.getTime()) / (1000 * 60 * 60);
              
              if (ageInHours < 24) {
                 try {
                    const fullContent = await fetchFullContent(item.link);
                    if (fullContent.length > content.length) {
                        content = fullContent;
                    }
                 } catch (e) {
                    // Ignore full content fetch error and use snippet
                 }
              }
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
            contentSnippet: content,
            summary: "",
            sentiment: 0,
            entities: "[]"
          });

          if (addedId) {
            newItemsCount++;
            // Trigger AI analysis for the new item
            // Run in background, don't await
            processItemAI(Number(addedId), item.title, content).catch(console.error);
          }
        }
      } catch (error) {
        console.error(`Error fetching ${feedSource.name}:`, error);
      }
    }));
  }
  
  console.log(`Fetch complete. Added ${newItemsCount} new items.`);
  return newItemsCount;
}

async function processItemAI(id: number, title: string, snippet: string) {
    try {
        // Truncate snippet if too long to avoid token limits, but keep enough context
        const truncatedSnippet = snippet.length > 10000 ? snippet.substring(0, 10000) + "..." : snippet;
        const analysis = await analyzeContent(title, truncatedSnippet);
        updateNewsItemAnalysis(id, analysis.summary, analysis.sentiment, analysis.entities);
    } catch (e) {
        console.error("AI Analysis failed for", title, e);
    }
}
