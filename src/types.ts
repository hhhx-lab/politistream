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

export interface ResearchTimeRangeConstraint {
  from?: string;
  to?: string;
  freshness?: 'latest' | 'historical' | 'mixed';
}

export interface ResearchSourceScopeConstraint {
  domains?: string[];
  excludeDomains?: string[];
  sourceTypes?: string[];
}

export interface ResearchConstraints {
  timeRange?: ResearchTimeRangeConstraint;
  contentTypes?: string[];
  sourceScope?: ResearchSourceScopeConstraint;
  languages?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
}

export interface PlannedQuerySummary {
  id: string;
  text: string;
  purpose: string;
  sourceTypes: string[];
  language: string;
  priority: number;
}

export interface ResearchPlanSummary {
  taskType: string;
  topic: string;
  normalizedTopic: string;
  claim?: string;
  subQuestions: string[];
  languages: string[];
  freshness: string;
  requiredSourceTypes: string[];
  queries: PlannedQuerySummary[];
  budget: ResearchBudget;
  stopConditions: string[];
  constraints: ResearchConstraints;
}

export interface ResearchJobSummary {
  id: string;
  topic: string;
  seedUrls: string[];
  status: 'active' | 'paused' | 'running' | 'completed' | 'failed';
  budget: ResearchBudget;
  constraints?: ResearchConstraints;
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
  metadata?: ResearchDocumentMetadataSummary;
}

export interface ResearchDocumentMetadataSummary {
  readerPath?: string;
  fetcher?: string;
  contentType?: string;
  statusCode?: number;
  durationMs?: number;
  fallbackUsed?: boolean;
  extractor?: string;
  diagnostics?: string[];
  [key: string]: unknown;
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

export interface DocumentLinkSummary {
  id: string;
  jobId: string;
  runId?: string;
  documentId: string;
  url: string;
  text: string;
  context?: string;
  enqueued: boolean;
  createdAt?: string;
}

export interface DocumentSearchResultSummary {
  documentId: string;
  title?: string;
  url: string;
  rank: number;
  snippet: string;
  matchCount?: number;
  status?: string;
  domain?: string;
}

export interface ExtractedTableSummary {
  id: string;
  jobId: string;
  runId?: string;
  documentId: string;
  tableIndex: number;
  caption?: string;
  headers: string[];
  rows: string[][];
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

export interface FrontierScoreBreakdownSummary {
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

export interface FrontierItemSummary {
  id: string;
  jobId: string;
  runId: string;
  url: string;
  canonicalUrl: string;
  depth: number;
  sourceType: string;
  priorityScore: number;
  scoreBreakdown?: FrontierScoreBreakdownSummary;
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

export interface EvidenceRelationSummary {
  id: string;
  claimId: string;
  evidenceId: string;
  relation: 'supports' | 'contradicts' | 'mentions' | 'derived_from';
  confidence: number;
  createdAt?: string;
}

export interface EvidenceGraphSummary {
  supportedClaims: number;
  contradictedClaims: number;
  uncertainClaims: number;
  unverifiedClaims: number;
  supportingRelations: number;
  conflictingRelations: number;
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

export interface ResearchQueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export interface ResearchQueueStatusSummary {
  names: string[];
  discovery?: ResearchQueueCounts;
  frontier?: ResearchQueueCounts;
  fetch?: ResearchQueueCounts;
  extract?: ResearchQueueCounts;
  analyze?: ResearchQueueCounts;
  report?: ResearchQueueCounts;
}

export interface ProviderHealthSummary {
  provider: string;
  calls: number;
  errors: number;
  candidateCount: number;
  durationMs: number;
  averageDurationMs: number;
  lastError?: string;
}

export interface ResearchCapabilityReadinessSummary {
  ready: boolean;
  label: string;
  detail: string;
}

export interface ResearchCapabilityProviderSummary {
  name: string;
  category: 'search' | 'data' | 'extractor' | 'ai' | 'fetch';
  configured: boolean;
  requiredFor100: boolean;
  coverage: 'implemented' | 'configured' | 'missing-key' | 'needs-live-smoke';
  detail: string;
}

export interface ResearchPressureTargetSummary {
  mode: 'Quick' | 'Standard' | 'Deep';
  maxUrlsPerRun: number;
  maxDepth: number;
  maxDomainsPerRun: number;
  evidenceTarget: number;
  status: 'implemented' | 'needs-pressure-smoke';
}

export interface ResearchEnvRequirementSummary {
  name: string;
  group: 'runtime' | 'search' | 'ai' | 'data' | 'enhanced-fetch';
  requiredLevel: 'required' | 'at-least-one' | 'recommended' | 'optional';
  configured: boolean;
  requiredFor100: boolean;
  impact: string;
  howToGet: string;
}

export interface ResearchExtractorSampleSummary {
  name: string;
  sampleInput: string;
  sampleOutput: string;
  status: 'passed';
  detail: string;
}

export interface ResearchCompatibilityApiSummary {
  method: 'GET' | 'POST';
  path: string;
  area: 'datasets' | 'analysis-jobs' | 'visualizations' | 'reports';
  status: 'implemented';
  detail: string;
}

export interface ResearchExportArtifactCheckSummary {
  format: string;
  status: 'implemented';
  detail: string;
}

export interface ResearchCapabilityAuditSummary {
  generatedAt: string;
  storage: ResearchCapabilityReadinessSummary;
  queue: ResearchCapabilityReadinessSummary;
  searchProviders: ResearchCapabilityProviderSummary[];
  dataProviders: ResearchCapabilityProviderSummary[];
  extractors: ResearchCapabilityProviderSummary[];
  ai: ResearchCapabilityProviderSummary[];
  fetch: ResearchCapabilityProviderSummary[];
  pressureTargets: ResearchPressureTargetSummary[];
  frontendSurfaces: string[];
  envChecklist: ResearchEnvRequirementSummary[];
  extractorSamples: ResearchExtractorSampleSummary[];
  compatibilityApis: ResearchCompatibilityApiSummary[];
  exportArtifacts: ResearchExportArtifactCheckSummary[];
  readinessScore: number;
  remainingGates: string[];
  lastSmoke?: ResearchSmokeEvidenceSummary | null;
}

export interface ProviderLiveSmokeRowSummary {
  provider: string;
  status: 'passed' | 'failed' | 'skipped';
  enabled: boolean;
  candidateCount: number;
  durationMs: number;
  sampleUrls: string[];
  error?: string;
}

export interface ProviderLiveSmokeResultSummary {
  id: string;
  topic: string;
  query: string;
  generatedAt: string;
  totalCandidates: number;
  providers: ProviderLiveSmokeRowSummary[];
  passed: boolean;
}

export interface DataSourceLiveSmokeRowSummary {
  provider: string;
  providerType: string;
  status: 'passed' | 'failed' | 'skipped';
  candidateCount: number;
  durationMs: number;
  sampleUrls: string[];
  error?: string;
}

export interface DataSourceLiveSmokeResultSummary {
  id: string;
  topic: string;
  query: string;
  generatedAt: string;
  totalCandidates: number;
  providers: DataSourceLiveSmokeRowSummary[];
  passed: boolean;
}

export interface PressureSmokeTargetSummary {
  mode: 'Quick' | 'Standard' | 'Deep';
  maxUrlsPerRun: number;
  maxDepth: number;
  maxDomainsPerRun: number;
  plannedQueries: number;
  plannedSourceTypes: string[];
  estimatedFrontierCapacity: number;
  evidenceTarget: number;
  status: 'passed' | 'needs-live-run';
}

export interface PressureSmokeResultSummary {
  id: string;
  topic: string;
  generatedAt: string;
  targets: PressureSmokeTargetSummary[];
  passed: boolean;
}

export interface ResearchSmokeEvidenceSummary {
  id: string;
  generatedAt: string;
  provider?: ProviderLiveSmokeResultSummary;
  dataSource?: DataSourceLiveSmokeResultSummary;
  pressure?: PressureSmokeResultSummary;
  verdict: 'passed' | 'limited' | 'failed';
  notes: string[];
}

export type ResearchSampleAcceptanceKindSummary = 'news-trace' | 'data-processing';

export interface ResearchSampleAcceptanceCheckSummary {
  id: string;
  label: string;
  status: 'passed' | 'failed';
  detail: string;
  metric?: string | number;
}

export interface ResearchSampleAcceptanceResultSummary {
  id: string;
  kind: ResearchSampleAcceptanceKindSummary;
  label: string;
  generatedAt: string;
  durationMs: number;
  status: 'passed' | 'failed';
  checks: ResearchSampleAcceptanceCheckSummary[];
  commands: string[];
}

export interface EnhancedFetchSmokeRowSummary {
  provider: 'http-fetcher' | 'browser-fallback' | 'firecrawl' | 'crawl4ai' | 'browserless';
  configured: boolean;
  status: 'passed' | 'skipped' | 'failed';
  sampleInput: string;
  sampleOutput: string;
  detail: string;
  error?: string;
}

export interface EnhancedFetchSmokeResultSummary {
  id: string;
  generatedAt: string;
  passed: boolean;
  rows: EnhancedFetchSmokeRowSummary[];
}

export interface ResearchNewsClusterDocumentSummary {
  index: number;
  title: string;
  url: string;
  source: string;
  date?: string;
  sourceTier?: string;
}

export interface ResearchNewsClusterSummary {
  id: string;
  canonicalTitle: string;
  documents: ResearchNewsClusterDocumentSummary[];
  sourceCount: number;
  entityHints: string[];
}

export interface ResearchNewsTimelineItemSummary {
  date: string;
  title: string;
  source: string;
  url: string;
  clusterId?: string;
}

export interface ResearchNewsSourceProfileSummary {
  domain?: string;
  source: string;
  documentCount: number;
  tier?: string;
  authorityTier?: string;
  mainstreamLikelihood: number;
  officialLikelihood: number;
}

export interface ResearchNewsAnalysisResponse {
  endpoint: 'cluster' | 'timeline' | 'source-quality';
  runId: string;
  documentCount: number;
  duplicateCount: number;
  clusters: ResearchNewsClusterSummary[];
  timeline: ResearchNewsTimelineItemSummary[];
  sourceProfiles: ResearchNewsSourceProfileSummary[];
  entities?: Array<Record<string, unknown>>;
  conflictSignals?: Array<Record<string, unknown>>;
  dataset?: AnalyticsDatasetSummary;
  job?: AnalyticsJobSummary;
  artifact?: AnalyticsArtifactSummary;
}

export interface SearchProviderRunResult {
  provider: 'brave' | 'serpapi' | 'tavily' | 'newsapi';
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
    newsApi: boolean;
  };
  dataProviders?: Record<string, boolean>;
  ai?: {
    provider: string;
    baseUrl: string;
    model: string;
    configured: boolean;
    keyConfigured: boolean;
  };
  enabledSearchProviderCount: number;
  enabledDataProviderCount?: number;
  readyForStorage: boolean;
  readyForQueue: boolean;
  storage?: {
    configured: boolean;
    ok: boolean;
    error?: string;
  };
  queue?: {
    configured: boolean;
    ok: boolean;
    error?: string;
  };
}

export interface RuntimeStatus {
  api: 'ok';
  port: number;
  appUrl: string;
  refreshRssOnStartup: boolean;
}

export interface AnalyticsCapability {
  id: string;
  kind: string;
  title: string;
  description: string;
  engines: string[];
  entrypoint: string;
  status: 'available' | 'planned' | 'external-worker';
}

export interface ProfileColumnSummary {
  name: string;
  inferredType: 'number' | 'string' | 'boolean' | 'date' | 'empty' | 'mixed';
  totalCount: number;
  missingCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
}

export interface DatasetProfileSummary {
  rowCount: number;
  columnCount: number;
  columns: ProfileColumnSummary[];
  qualityScore: number;
  warnings: string[];
}

export interface AnalyticsDatasetSummary {
  id: string;
  name: string;
  sourceKind: 'manual' | 'research-run' | 'research-data-source' | 'materialized-data-source' | 'crawler' | 'upload' | 'api';
  sourceRef?: string;
  rowCount: number;
  columnCount: number;
  rows?: Array<Record<string, unknown>>;
  sampleRows: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsDatasetProfileSummary {
  id: string;
  datasetId: string;
  profile: DatasetProfileSummary;
  suggestions: VisualizationSuggestionSummary[];
  createdAt: string;
}

export interface VisualizationSuggestionSummary {
  id: string;
  kind: string;
  title: string;
  description: string;
  x?: string;
  y?: string;
  color?: string;
  engine: string;
  exportFormats: string[];
}

export interface VisualizationArtifactSummary {
  id: string;
  datasetId?: string;
  kind: string;
  engine: string;
  title: string;
  description: string;
  spec: Record<string, unknown>;
  exportFormats: string[];
  dataLineage: {
    datasetId?: string;
    rowCount: number;
    x?: string;
    y?: string;
    color?: string;
    generatedAt: string;
  };
  reproducibleCode: string;
}

export type AnalyticsJobKindSummary =
  | 'profile'
  | 'descriptive-statistics'
  | 'quality-report'
  | 'frequency-tables'
  | 'crosstab'
  | 'statistical-tests'
  | 'linear-regression'
  | 'logistic-regression'
  | 'poisson-regression'
  | 'dimensionality-reduction'
  | 'cluster-analysis'
  | 'anomaly-detection'
  | 'time-series-analysis'
  | 'data-transformation'
  | 'data-cleaning'
  | 'news-organization'
  | 'text-analysis'
  | 'model-explanation'
  | 'deep-learning-analysis'
  | 'geospatial-analysis'
  | 'publication-chart'
  | 'report-draft'
  | 'export-report'
  | 'visualization-render';

export interface AnalyticsJobSummary {
  id: string;
  datasetId?: string;
  kind: AnalyticsJobKindSummary;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsArtifactSummary {
  id: string;
  jobId?: string;
  datasetId?: string;
  artifactType: 'profile' | 'statistics' | 'visualization' | 'report' | 'model' | 'dataset' | 'news' | 'text' | 'geo';
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NumericColumnStatsSummary {
  name: string;
  count: number;
  missingCount: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  standardError?: number;
  confidenceInterval95?: [number, number];
}

export interface CorrelationCellSummary {
  x: string;
  y: string;
  correlation: number;
}

export interface DescriptiveStatisticsSummary {
  numericColumns: NumericColumnStatsSummary[];
  correlations: CorrelationCellSummary[];
}

export interface AgentTaskPlanSummary {
  id: string;
  intent: string;
  title: string;
  description: string;
  method: 'GET' | 'POST';
  endpoint: string;
  body?: Record<string, unknown>;
}

export interface AgentDispatchResponse {
  plan: {
    intent: string;
    answer: string;
    tasks: AgentTaskPlanSummary[];
    warnings: string[];
  };
  executed: boolean;
  executions?: unknown[];
  error?: string;
}
