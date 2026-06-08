export type ResearchJobStatus = "active" | "paused" | "running" | "completed" | "failed";
export type ResearchRunStatus = "queued" | "planning" | "discovery" | "frontier" | "fetching" | "extracting" | "analyzing" | "reporting" | "completed" | "failed" | "paused" | "cancelled";
export type ProviderName = "brave" | "serpapi" | "tavily" | "newsapi" | "rss" | "sitemap" | "github" | "npm" | "pypi" | "official" | "gdelt" | "wayback" | "commoncrawl" | "ckan" | "socrata" | "arcgis" | "kaggle" | "huggingface" | "openml" | "worldbank" | "fred" | "openalex" | "crossref" | "sports";
export type ResearchTaskType = "survey" | "verification" | "tool-evaluation" | "policy" | "technical" | "competitive" | "monitoring" | "data-research" | "sports-analysis" | "analytics";
export type SourceType = "official" | "mainstream-news" | "technical-doc" | "github" | "package-registry" | "academic" | "regulatory" | "community" | "benchmark" | "company" | "rss" | "sitemap" | "dataset" | "data-catalog" | "structured-api" | "archive" | "sports-data" | "geospatial" | "financial-data" | "unknown";
export type QueryPurpose = "overview" | "official-source" | "primary-source" | "news-coverage" | "contradiction" | "benchmark" | "community-feedback" | "technical-detail" | "pricing" | "timeline" | "dataset-discovery" | "statistical-source" | "competition-data" | "sports-data" | "visualization";
export type CrawlStatus = "queued" | "fetched" | "failed" | "blocked" | "skipped";
export type DocumentMemoryStatus = "fresh" | "reused" | "stale";
export type AnalysisStatus = "pending" | "analyzed" | "irrelevant" | "failed";
export type ReportStatus = "not_ready" | "ready" | "failed";
export type DiscoveryProviderType = "web-search" | "rss" | "sitemap" | "github" | "package-registry" | "official" | "community" | "news-api" | "archive" | "data-catalog" | "structured-api" | "competition-data" | "sports-data";
export type FrontierStatus = "queued" | "fetching" | "fetched" | "failed" | "skipped";
export type ExtractorKind = "html" | "pdf" | "github" | "npm" | "pypi" | "sitemap" | "table" | "csv" | "json" | "jsonl" | "parquet" | "excel" | "geojson" | "sdmx" | "xbrl" | "netcdf" | "docx" | "pptx" | "txt" | "md";
export type AuthorityTier = "T0" | "T1" | "T2" | "T3" | "T4";
export type EvidenceClaimStatus = "supported" | "contradicted" | "uncertain" | "unverified";
export type EvidenceRelationKind = "supports" | "contradicts" | "mentions" | "derived_from";
export type ResearchFreshness = "latest" | "historical" | "mixed";

export interface ResearchBudget {
  maxDepth: number;
  maxUrlsPerRun: number;
  maxDomainsPerRun: number;
  runIntervalMinutes: number;
}

export interface ResearchTimeRangeConstraint {
  from?: string;
  to?: string;
  freshness?: ResearchFreshness;
}

export interface ResearchSourceScopeConstraint {
  domains?: string[];
  excludeDomains?: string[];
  sourceTypes?: SourceType[];
}

export interface ResearchConstraints {
  timeRange?: ResearchTimeRangeConstraint;
  contentTypes?: string[];
  sourceScope?: ResearchSourceScopeConstraint;
  languages?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
}

export interface PlannedQuery {
  id: string;
  text: string;
  purpose: QueryPurpose;
  sourceTypes: SourceType[];
  language: string;
  priority: number;
}

export interface ResearchPlan {
  taskType: ResearchTaskType;
  topic: string;
  normalizedTopic: string;
  claim?: string;
  subQuestions: string[];
  languages: string[];
  freshness: ResearchFreshness;
  requiredSourceTypes: SourceType[];
  queries: PlannedQuery[];
  budget: ResearchBudget;
  stopConditions: string[];
  constraints: ResearchConstraints;
}

export interface ResearchJob {
  id: string;
  topic: string;
  seedUrls: string[];
  status: ResearchJobStatus;
  budget: ResearchBudget;
  constraints: ResearchConstraints;
  queryPlan: string[];
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchRun {
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

export interface DiscoveryResult {
  id?: string;
  jobId: string;
  runId: string;
  provider: string;
  providerType: DiscoveryProviderType;
  queryId?: string;
  candidateCount: number;
  error?: string;
  durationMs: number;
  costUnits: number;
  createdAt?: string;
}

export interface RunEvent {
  id?: string;
  jobId: string;
  runId: string;
  stage: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
  createdAt?: string;
}

export interface DiscoveredCandidate {
  id?: string;
  jobId: string;
  runId: string;
  provider: string;
  providerType: DiscoveryProviderType;
  queryId: string;
  query: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  sourceType: SourceType;
  rank?: number;
  publishedAt?: string;
  depth: number;
  discoveredAt: string;
  raw?: unknown;
}

export interface FrontierItem {
  id?: string;
  jobId: string;
  runId: string;
  url: string;
  canonicalUrl: string;
  depth: number;
  sourceType: SourceType;
  priorityScore: number;
  scoreBreakdown?: FrontierScoreBreakdown;
  status: FrontierStatus;
  attempts: number;
  discoveredFromUrl?: string;
  discoveredFromDocumentId?: string;
  queryId?: string;
  reason: string;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FrontierScoreBreakdown {
  topicalRelevance: number;
  sourceAuthority: number;
  primarySourceLikelihood: number;
  freshness: number;
  sourceDiversity: number;
  linkContextQuality: number;
  weights: {
    topicalRelevance: number;
    sourceAuthority: number;
    primarySourceLikelihood: number;
    freshness: number;
    sourceDiversity: number;
    linkContextQuality: number;
  };
  finalScore: number;
}

export interface SearchCandidate {
  id?: string;
  jobId: string;
  runId?: string;
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
  runId?: string;
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
  memoryStatus?: DocumentMemoryStatus;
  metadata?: CrawlDocumentMetadata;
}

export interface CrawlDocumentMetadata {
  readerPath?: string;
  fetcher?: string;
  contentType?: string;
  statusCode?: number;
  durationMs?: number;
  fallbackUsed?: boolean;
  extractor?: ExtractorKind;
  diagnostics?: string[];
  [key: string]: unknown;
}

export interface DocumentAsset {
  id?: string;
  jobId: string;
  runId?: string;
  documentId: string;
  url: string;
  assetType: "html" | "pdf" | "text" | "json";
  metadata: {
    path: string;
    contentType?: string;
    sizeBytes: number;
    sha256: string;
    [key: string]: unknown;
  };
  createdAt?: string;
}

export interface DocumentLinkRecord {
  id?: string;
  jobId: string;
  runId?: string;
  documentId: string;
  url: string;
  text: string;
  context?: string;
  enqueued: boolean;
  createdAt?: string;
}

export interface DocumentSearchResult {
  documentId: string;
  title?: string;
  url: string;
  rank: number;
  snippet: string;
  matchCount?: number;
  status?: string;
  domain?: string;
}

export interface EvidenceItem {
  id?: string;
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

export interface EvidenceClaim {
  id?: string;
  jobId: string;
  runId: string;
  claim: string;
  normalizedClaim: string;
  status: EvidenceClaimStatus;
  confidence: number;
  supportingEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  firstSeenAt?: string;
  primarySourceUrl?: string;
  createdAt?: string;
}

export interface EvidenceRelation {
  id?: string;
  claimId: string;
  evidenceId: string;
  relation: EvidenceRelationKind;
  confidence: number;
  createdAt?: string;
}

export interface SourceProfile {
  id?: string;
  domain: string;
  sourceType: SourceType;
  authorityTier: AuthorityTier;
  officialLikelihood: number;
  mainstreamLikelihood: number;
  notes: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ExtractedLink {
  url: string;
  text: string;
  context?: string;
}

export interface ExtractedTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface ExtractedTableRecord extends ExtractedTable {
  id?: string;
  jobId: string;
  runId?: string;
  documentId: string;
  tableIndex: number;
  createdAt?: string;
}

export interface ExtractedDocument {
  url: string;
  canonicalUrl: string;
  title?: string;
  contentText: string;
  contentMarkdown?: string;
  links: ExtractedLink[];
  tables: ExtractedTable[];
  metadata: Record<string, unknown>;
  extractor: ExtractorKind;
}

export interface ResearchReport {
  id?: string;
  jobId: string;
  runId?: string;
  status: ReportStatus;
  markdown: string;
  generatedAt?: string;
}

export interface ResearchRunBudgetState {
  budget: ResearchBudget;
  acceptedUrls: number;
  domains: Set<string>;
}
