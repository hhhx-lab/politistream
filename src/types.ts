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

export interface ResearchBudget {
  maxDepth: number;
  maxUrlsPerRun: number;
  maxDomainsPerRun: number;
  runIntervalMinutes: number;
}

export interface ResearchJobSummary {
  id: string;
  topic: string;
  seedUrls: string[];
  status: 'active' | 'paused' | 'running' | 'completed' | 'failed';
  budget: ResearchBudget;
  queryPlan: string[];
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchDocumentSummary {
  id: string;
  jobId: string;
  url: string;
  title?: string;
  domain: string;
  relevanceScore?: number;
  status: string;
}

export interface ResearchReportSummary {
  jobId: string;
  status: 'not_ready' | 'ready' | 'failed';
  markdown: string;
  generatedAt?: string;
}
