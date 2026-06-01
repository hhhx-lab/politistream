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
  runId?: string;
  url: string;
  canonicalUrl?: string;
  finalUrl?: string;
  title?: string;
  domain: string;
  contentText?: string;
  relevanceScore?: number;
  status: string;
  error?: string;
  fetchedAt?: string;
  memoryStatus?: 'fresh' | 'reused' | 'stale';
}

export interface ResearchDocumentAssetSummary {
  id: string;
  jobId: string;
  runId?: string;
  documentId: string;
  url: string;
  assetType: 'html' | 'pdf' | 'text' | 'json';
  metadata: {
    path: string;
    contentType?: string;
    sizeBytes: number;
    sha256: string;
    [key: string]: unknown;
  };
  createdAt?: string;
}

export interface ResearchReportSummary {
  jobId: string;
  runId?: string;
  status: 'not_ready' | 'ready' | 'failed';
  markdown: string;
  generatedAt?: string;
}

export type ResearchRunStatus =
  | 'queued'
  | 'planning'
  | 'discovery'
  | 'frontier'
  | 'fetching'
  | 'extracting'
  | 'analyzing'
  | 'reporting'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface ResearchRunSummary {
  id: string;
  jobId: string;
  status: ResearchRunStatus;
  stage: ResearchRunStatus;
  budget: ResearchBudget;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchRunEvent {
  id: string;
  jobId: string;
  runId: string;
  stage: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  createdAt?: string;
}

export interface FrontierItemSummary {
  id: string;
  jobId: string;
  runId: string;
  url: string;
  canonicalUrl: string;
  depth: number;
  sourceType: string;
  priorityScore: number;
  status: 'queued' | 'fetching' | 'fetched' | 'failed' | 'skipped';
  attempts: number;
  discoveredFromUrl?: string;
  discoveredFromDocumentId?: string;
  queryId?: string;
  reason: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvidenceItemSummary {
  id: string;
  jobId: string;
  runId?: string;
  documentId: string;
  claimId?: string;
  sourceUrl: string;
  quote?: string;
  paraphrase?: string;
  snippet: string;
  explanation: string;
  relevanceScore: number;
  credibilityScore?: number;
  supportsClaim?: boolean;
  contradictsClaim?: boolean;
  entities: string[];
  createdAt?: string;
}

export interface EvidenceClaimSummary {
  id: string;
  jobId: string;
  runId: string;
  claim: string;
  normalizedClaim: string;
  status: 'supported' | 'contradicted' | 'uncertain' | 'unverified';
  confidence: number;
  supportingEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  firstSeenAt?: string;
  primarySourceUrl?: string;
  createdAt?: string;
}

export interface SourceProfileSummary {
  id: string;
  domain: string;
  sourceType: string;
  authorityTier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  officialLikelihood: number;
  mainstreamLikelihood: number;
  notes: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DiscoveryProviderSummary {
  id: string;
  jobId: string;
  runId: string;
  provider: string;
  providerType: string;
  queryId?: string;
  candidateCount: number;
  error?: string;
  durationMs: number;
  costUnits: number;
  createdAt?: string;
}

export interface SearchProviderRunResult {
  provider: 'brave' | 'serpapi' | 'tavily';
  enabled: boolean;
  candidates: unknown[];
  error?: string;
}

export interface ResearchRunResponse {
  success?: boolean;
  queued?: boolean;
  job: ResearchJobSummary;
  run?: ResearchRunSummary;
  providerResults?: SearchProviderRunResult[];
  candidateCount?: number;
  documentCount?: number;
  evidenceCount?: number;
  report?: ResearchReportSummary;
  message?: string;
}

export interface ResearchDocumentsResponse {
  documents: ResearchDocumentSummary[];
}

export interface ResearchConfigStatus {
  databaseConfigured: boolean;
  redisConfigured: boolean;
  searchProviders: {
    brave: boolean;
    serpApi: boolean;
    tavily: boolean;
  };
  enabledSearchProviderCount: number;
  readyForStorage: boolean;
  readyForQueue: boolean;
}

export interface RuntimeStatus {
  api: 'ok';
  port: number;
  appUrl: string;
  refreshRssOnStartup: boolean;
}
