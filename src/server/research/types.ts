export type ResearchJobStatus = "active" | "paused" | "running" | "completed" | "failed";
export type ResearchRunStatus = "queued" | "running" | "completed" | "failed";
export type ProviderName = "brave" | "serpapi" | "tavily";
export type CrawlStatus = "queued" | "fetched" | "failed" | "blocked" | "skipped";
export type AnalysisStatus = "pending" | "analyzed" | "irrelevant" | "failed";
export type ReportStatus = "not_ready" | "ready" | "failed";

export interface ResearchBudget {
  maxDepth: number;
  maxUrlsPerRun: number;
  maxDomainsPerRun: number;
  runIntervalMinutes: number;
}

export interface ResearchJob {
  id: string;
  topic: string;
  seedUrls: string[];
  status: ResearchJobStatus;
  budget: ResearchBudget;
  queryPlan: string[];
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchCandidate {
  id?: string;
  jobId: string;
  provider: ProviderName;
  query: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  publishedAt?: string;
  depth: number;
  discoveredFromUrl?: string;
}

export interface CrawlDocument {
  id?: string;
  jobId: string;
  url: string;
  canonicalUrl: string;
  finalUrl?: string;
  title?: string;
  domain: string;
  contentText?: string;
  contentHash?: string;
  depth: number;
  status: CrawlStatus;
  error?: string;
  fetchedAt?: string;
}

export interface EvidenceItem {
  id?: string;
  jobId: string;
  documentId: string;
  sourceUrl: string;
  snippet: string;
  explanation: string;
  relevanceScore: number;
  entities: string[];
  createdAt?: string;
}

export interface ResearchReport {
  id?: string;
  jobId: string;
  status: ReportStatus;
  markdown: string;
  generatedAt?: string;
}

export interface ResearchRunBudgetState {
  budget: ResearchBudget;
  acceptedUrls: number;
  domains: Set<string>;
}
