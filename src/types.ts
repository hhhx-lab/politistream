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
  id: number;
  name: string;
  url: string;
  enabled: number;
  is_default?: number;
  last_fetched_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FeedRefreshResult {
  source: FeedSource;
  success: boolean;
  newItems: number;
  fetchedAt?: string;
  error?: string;
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
  finalUrl?: string;
  title?: string;
  domain: string;
  relevanceScore?: number;
  status: string;
  error?: string;
  fetchedAt?: string;
}

export interface ResearchReportSummary {
  jobId: string;
  status: 'not_ready' | 'ready' | 'failed';
  markdown: string;
  generatedAt?: string;
}

export interface SearchProviderRunResult {
  provider: 'brave' | 'serpapi' | 'tavily';
  enabled: boolean;
  candidates: unknown[];
  error?: string;
}

export interface ResearchRunResponse {
  success: boolean;
  queued?: boolean;
  job: ResearchJobSummary;
  providerResults: SearchProviderRunResult[];
  candidateCount: number;
  documentCount: number;
  evidenceCount: number;
  report: ResearchReportSummary;
  message?: string;
}

export interface ResearchDocumentsResponse {
  documents: ResearchDocumentSummary[];
}
