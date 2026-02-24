export interface NewsItem {
  id: number;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  contentSnippet: string;
  summary?: string;
  sentiment?: number;
  entities?: string; // JSON string
  processed: number;
}

export interface ParsedNewsItem extends Omit<NewsItem, 'entities'> {
  entities: string[];
  is_favorite?: number;
}

export interface FeedSource {
  name: string;
  url: string;
}
