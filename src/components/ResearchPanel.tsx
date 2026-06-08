import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  BarChart3,
  CirclePause,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  DiscoveryProviderSummary,
  DocumentLinkSummary,
  DocumentSearchResultSummary,
  EnhancedFetchSmokeResultSummary,
  EvidenceClaimSummary,
  EvidenceGraphSummary,
  EvidenceItemSummary,
  EvidenceRelationSummary,
  ExtractedTableSummary,
  ProviderHealthSummary,
  DataSourceLiveSmokeResultSummary,
  ProviderLiveSmokeResultSummary,
  PressureSmokeResultSummary,
  ResearchCapabilityAuditSummary,
  ResearchQueueStatusSummary,
  ResearchDocumentAssetSummary,
  FrontierItemSummary,
  PlannedQuerySummary,
  ResearchDocumentSummary,
  ResearchJobSummary,
  ResearchNewsAnalysisResponse,
  ResearchPlanSummary,
  ResearchReportSummary,
  ResearchSampleAcceptanceKindSummary,
  ResearchSampleAcceptanceResultSummary,
  ResearchRunResponse,
  ResearchRunSummary,
  ResearchRunEvent,
  SourceProfileSummary,
} from '../types';
import { Language, Translator } from '../i18n';
import { ClaimsPanel, EvidenceGraphPanel, EvidenceTable } from './research/EvidencePanels';
import { FrontierPanel, ProviderPanel, RuntimeMonitorPanel } from './research/FrontierProviderPanels';
import { CapabilityAuditPanel } from './research/CapabilityAuditPanel';
import {
  ManualRunControls,
  NewsAnalysisPanel,
  QueryPlanPanel,
  RunDocumentSearchPanel,
  RunTimeline,
} from './research/RunWorkflowPanels';
import { SourceExplorer } from './research/SourceExplorerPanel';
import {
  Badge,
  formatDate,
  formatShortId,
  IconButton,
  isTerminalRun,
  labelForStatus,
  Metric,
  Panel,
  summarizeFrontier,
  summarizeProviders,
} from './research/shared';

interface ResearchPanelProps {
  selectedJobId?: string;
  onSelectedJobChange?: (id: string | undefined) => void;
  onBackToSearch?: () => void;
  onOpenDataLab?: (focus: { runId?: string; datasetId?: string }) => void;
  language: Language;
  t: Translator;
}

const panelText = {
  zh: {
    exportToDataLab: '导出到 Data Lab',
    openDataLab: '打开 Data Lab',
    exportDataSourcesToDataLab: '导入数据源候选',
    dataSourceExportHint: '把 data-catalog、structured-api、competition-data、sports-data provider 与 frontier 生成 Data Lab 数据源资产清单。',
    dataSourceExported: '数据源候选已导入 Data Lab。',
    dataSourceRows: '条数据源',
    runtimeMonitor: '运行监控',
    runtimeMonitorHint: '观察 BullMQ discovery 队列和全局 discovery provider 健康，确认深度研究是否真的在排队、抓取和产出候选。',
    queueHealth: '队列健康',
    providerHealth: 'Provider 健康',
    dataSourceCoverage: '数据源覆盖',
    providerDetails: 'Provider 明细',
    queueNames: '队列',
    waiting: '等待',
    active: '运行',
    delayed: '延迟',
    completed: '完成',
    calls: '调用',
    candidates: '候选',
    errors: '错误',
    latency: '延迟',
    noProviderHealth: '暂无全局 provider 健康数据。',
    monitorUnavailable: '运行监控暂不可用',
    rawAssets: '原始资产',
    referencedClaims: '引用结论',
    memory: '记忆状态',
    noDatasets: '暂无数据集',
    noJobs: '暂无任务',
    noArtifacts: '暂无资产',
    job: '任务',
    kind: '类型',
    status: '状态',
    engine: '引擎',
    rows: '行数',
    taskType: '任务类型',
    freshness: '时效',
    scoreExplainability: '评分解释',
    scoreTotal: '总分',
    scoreTopical: '主题相关',
    scoreAuthority: '来源权威',
    scorePrimary: '原始来源',
    scoreFreshness: '新鲜度',
    scoreDiversity: '来源多样性',
    scoreContext: '上下文质量',
    scoreWeight: '权重',
    requiredSources: '必需来源',
    stopConditions: '停止条件',
    subQuestions: '子问题',
    purpose: '目的',
    sourceTypes: '来源类型',
    priority: '优先级',
    extractedTables: '抽取表格',
    tableRows: '表格行数',
    noTables: '暂无表格',
    sourceFiltersTitle: '来源筛选',
    sourceSearchPlaceholder: '搜索 URL、标题、域名或正文',
    allStatuses: '全部状态',
    allTiers: '全部等级',
    sortBy: '排序',
    sortAuthority: '权威优先',
    sortEvidence: '证据优先',
    sortErrors: '失败优先',
    errorSummary: '错误聚合',
    noErrors: '暂无抓取错误',
    claimTrace: 'Claim 反查',
    showClaimSources: '查看引用来源',
    filteredSources: '筛选来源',
    evidenceGraph: '证据图谱',
    claimsIndex: '结论索引',
    supports: '支持关系',
    conflicts: '冲突关系',
    noRelations: '暂无证据关系',
    discoveredLinks: '发现外链',
    noLinks: '暂无外链',
    enqueued: '已入队',
    observed: '已发现',
    manualIteration: '运行干预',
    manualQueryPlaceholder: '追加新的研究方向、子问题或检索式',
    appendQuery: '追加查询',
    retryFailed: '重试失败项',
    manualQueryQueued: '新的查询方向已追加，并重新进入 discovery。',
	    retryQueued: '失败项已重新排队。',
	    retryNothing: '当前没有失败或跳过的 frontier 项。',
	    documentSearch: '文档检索',
	    documentSearchHint: '在当前 run 的已抓取正文中检索关键词，快速定位来源、证据和上下文。',
	    documentSearchPlaceholder: '搜索当前 run 的正文，例如 Pandoc / license / pricing',
	    searchDocuments: '检索文档',
	    noSearchResults: '暂无检索结果。',
	    searchRank: '相关度',
	    newsAnalysis: '新闻分析',
	    newsAnalysisHint: '把当前 run 抓取到的文档送入 Data Lab 新闻整理 worker，生成同题聚类、事件时间线和来源质量判断。',
	    newsCluster: '新闻聚类',
	    newsTimeline: '事件时间线',
	    newsSourceQuality: '来源质量',
	    documentsAnalyzed: '分析文档',
	    duplicateCount: '重复文档',
	    clusters: '聚类',
	    timelineItems: '时间线',
	    sourceQuality: '来源质量',
	    noNewsAnalysis: '尚未运行新闻分析。',
    runNewsAnalysis: '运行',
    capabilityAudit: '能力验收台',
    capabilityAuditLoading: '正在检查真实爬虫和数据分析能力。',
    capabilityAuditUnavailable: '能力验收暂不可用',
    readinessScore: '就绪分',
    ready: '就绪',
    missing: '缺失',
    searchProviders: '搜索 Provider',
    dataProviders: '数据 Provider',
    extractorCoverage: '抓取/抽取/AI',
    pressureTargets: '深度压测目标',
    visibleSurfaces: '前端可见功能',
    remainingGates: '距离 100% 的验收门',
    requiredFor100: '100% 必需',
    implemented: '已实现',
    needsPressureSmoke: '需压测',
    depthLabel: '深度',
    domainsLabel: '域名',
    evidenceTarget: '证据目标',
    providerLiveSmoke: '真实 Provider smoke',
    pressureSmoke: 'Standard/Deep 压测',
    runProviderSmoke: '运行 Provider smoke',
    dataSourceLiveSmoke: '公开数据源 smoke',
    runDataSourceSmoke: '运行数据源 smoke',
    runPressureSmoke: '运行 Deep 压测',
    runningSmoke: '运行中',
    noSmokeResult: '尚未运行。',
    passed: '通过',
    failed: '失败',
    generatedTargets: '目标数',
    plannedQueries: '查询数',
    frontierCapacity: 'Frontier 容量',
    latestSmokeEvidence: '最近验收证据',
    sampleAcceptance: '样本验收',
    sampleAcceptanceHint: '用内置新闻溯源样本和数据处理样本跑真实分析链路，证明能力不是只停留在配置项。',
    runNewsTraceAcceptance: '运行新闻溯源样本',
    runDataProcessingAcceptance: '运行数据处理样本',
    commands: '命令数',
    extractorSamples: 'Extractor 逐类型样本',
    enhancedFetchSmoke: '增强抓取 smoke',
    enhancedFetchSmokeHint: '检查内置 HTTP/浏览器 fallback，以及 Firecrawl、Crawl4AI、Browserless 增强抓取配置状态。',
    runEnhancedFetchSmoke: '运行增强抓取 smoke',
    compatibilityApis: '兼容 API 验收',
    exportArtifactChecks: '导出产物验收',
    envChecklist: 'Env 配置清单',
    envChecklistHint: '只显示变量名和能力影响，不展示密钥值；补齐后重新运行 smoke 即可验收真实抓取能力。',
    envRuntime: '运行基础设施',
    envSearch: '全网搜索 Provider',
    envAi: 'AI 摘要与报告',
    envData: '数据源增强',
    envEnhancedFetch: '增强抓取服务',
    envRequired: '必填',
    envAtLeastOne: '至少一个',
    envRecommended: '建议',
    envOptional: '可选',
	  },
	  en: {
    exportToDataLab: 'Export to Data Lab',
    openDataLab: 'Open Data Lab',
    exportDataSourcesToDataLab: 'Import data source candidates',
    dataSourceExportHint: 'Turn data-catalog, structured-api, competition-data, sports-data providers and frontier into a Data Lab source asset registry.',
    dataSourceExported: 'Data source candidates imported to Data Lab.',
    dataSourceRows: 'data sources',
    runtimeMonitor: 'Runtime monitor',
    runtimeMonitorHint: 'Watch the BullMQ discovery queue and global discovery provider health to confirm deep research is actually queued, crawling, and producing candidates.',
    queueHealth: 'Queue health',
    providerHealth: 'Provider health',
    dataSourceCoverage: 'Data source coverage',
    providerDetails: 'Provider details',
    queueNames: 'Queues',
    waiting: 'Waiting',
    active: 'Active',
    delayed: 'Delayed',
    completed: 'Completed',
    calls: 'Calls',
    candidates: 'Candidates',
    errors: 'Errors',
    latency: 'Latency',
    noProviderHealth: 'No global provider health data yet.',
    monitorUnavailable: 'Runtime monitor unavailable',
    rawAssets: 'Raw assets',
    referencedClaims: 'Referenced claims',
    memory: 'Memory',
    noDatasets: 'No datasets',
    noJobs: 'No jobs',
    noArtifacts: 'No artifacts',
    job: 'Job',
    kind: 'Kind',
    status: 'Status',
    engine: 'Engine',
    rows: 'Rows',
    taskType: 'Task type',
    freshness: 'Freshness',
    scoreExplainability: 'Score explanation',
    scoreTotal: 'Total',
    scoreTopical: 'Topical',
    scoreAuthority: 'Authority',
    scorePrimary: 'Primary source',
    scoreFreshness: 'Freshness',
    scoreDiversity: 'Diversity',
    scoreContext: 'Context',
    scoreWeight: 'Weight',
    requiredSources: 'Required sources',
    stopConditions: 'Stop conditions',
    subQuestions: 'Sub-questions',
    purpose: 'Purpose',
    sourceTypes: 'Source types',
    priority: 'Priority',
    extractedTables: 'Extracted tables',
    tableRows: 'Rows',
    noTables: 'No tables',
    sourceFiltersTitle: 'Source filters',
    sourceSearchPlaceholder: 'Search URL, title, domain, or content',
    allStatuses: 'All statuses',
    allTiers: 'All tiers',
    sortBy: 'Sort by',
    sortAuthority: 'Authority first',
    sortEvidence: 'Evidence first',
    sortErrors: 'Failures first',
    errorSummary: 'Error summary',
    noErrors: 'No crawl errors',
    claimTrace: 'Claim trace',
    showClaimSources: 'Show cited sources',
    filteredSources: 'Filtered sources',
    evidenceGraph: 'Evidence Graph',
    claimsIndex: 'Claims Index',
    supports: 'Supports',
    conflicts: 'Conflicts',
    noRelations: 'No evidence relations',
    discoveredLinks: 'Discovered links',
    noLinks: 'No links',
    enqueued: 'Queued',
    observed: 'Observed',
    manualIteration: 'Run intervention',
    manualQueryPlaceholder: 'Append a research direction, sub-question, or search expression',
    appendQuery: 'Append query',
    retryFailed: 'Retry failed',
    manualQueryQueued: 'New query direction appended and discovery queued.',
	    retryQueued: 'Failed items queued for retry.',
	    retryNothing: 'No failed or skipped frontier items are available.',
	    documentSearch: 'Document search',
	    documentSearchHint: 'Search fetched text inside the current run to quickly locate sources, evidence, and context.',
	    documentSearchPlaceholder: 'Search this run, e.g. Pandoc / license / pricing',
	    searchDocuments: 'Search documents',
	    noSearchResults: 'No search results.',
	    searchRank: 'Rank',
	    newsAnalysis: 'News analysis',
	    newsAnalysisHint: 'Send documents from the current run into the Data Lab news worker for story clustering, event timelines, and source quality signals.',
	    newsCluster: 'News clustering',
	    newsTimeline: 'Event timeline',
	    newsSourceQuality: 'Source quality',
	    documentsAnalyzed: 'Documents',
	    duplicateCount: 'Duplicates',
	    clusters: 'Clusters',
	    timelineItems: 'Timeline',
	    sourceQuality: 'Source quality',
	    noNewsAnalysis: 'No news analysis has been run yet.',
	    runNewsAnalysis: 'Run',
    capabilityAudit: 'Capability audit',
    capabilityAuditLoading: 'Checking real crawler and analytics readiness.',
    capabilityAuditUnavailable: 'Capability audit unavailable',
    readinessScore: 'Readiness',
    ready: 'Ready',
    missing: 'Missing',
    searchProviders: 'Search providers',
    dataProviders: 'Data providers',
    extractorCoverage: 'Fetch / extract / AI',
    pressureTargets: 'Depth pressure targets',
    visibleSurfaces: 'Visible surfaces',
    remainingGates: 'Gates to 100%',
    requiredFor100: 'required for 100%',
    implemented: 'Implemented',
    needsPressureSmoke: 'Needs smoke',
    depthLabel: 'Depth',
    domainsLabel: 'Domains',
    evidenceTarget: 'Evidence',
    providerLiveSmoke: 'Live provider smoke',
    pressureSmoke: 'Standard/Deep pressure',
    runProviderSmoke: 'Run provider smoke',
    dataSourceLiveSmoke: 'Public data-source smoke',
    runDataSourceSmoke: 'Run data-source smoke',
    runPressureSmoke: 'Run Deep pressure',
    runningSmoke: 'Running',
    noSmokeResult: 'Not run yet.',
    passed: 'Passed',
    failed: 'Failed',
    generatedTargets: 'Targets',
    plannedQueries: 'Queries',
    frontierCapacity: 'Frontier capacity',
    latestSmokeEvidence: 'Latest smoke evidence',
    sampleAcceptance: 'Sample acceptance',
    sampleAcceptanceHint: 'Run built-in news tracing and data processing samples through the real analysis stack.',
    runNewsTraceAcceptance: 'Run news trace sample',
    runDataProcessingAcceptance: 'Run data processing sample',
    commands: 'Commands',
    extractorSamples: 'Extractor samples',
    enhancedFetchSmoke: 'Enhanced fetch smoke',
    enhancedFetchSmokeHint: 'Check built-in HTTP/browser fallback and Firecrawl, Crawl4AI, Browserless enhanced fetch configuration.',
    runEnhancedFetchSmoke: 'Run enhanced fetch smoke',
    compatibilityApis: 'Compatibility API acceptance',
    exportArtifactChecks: 'Export artifact acceptance',
    envChecklist: 'Env checklist',
    envChecklistHint: 'Only variable names and capability impact are shown; secret values are never exposed. Re-run smoke after filling keys.',
    envRuntime: 'Runtime infrastructure',
    envSearch: 'Web search providers',
    envAi: 'AI summaries and reports',
    envData: 'Data-source boosts',
    envEnhancedFetch: 'Enhanced fetch services',
    envRequired: 'required',
    envAtLeastOne: 'one required',
    envRecommended: 'recommended',
    envOptional: 'optional',
	  },
	} as const;

const emptyGraphSummary: EvidenceGraphSummary = {
  supportedClaims: 0,
  contradictedClaims: 0,
  uncertainClaims: 0,
  unverifiedClaims: 0,
  supportingRelations: 0,
  conflictingRelations: 0,
};

export const ResearchPanel: React.FC<ResearchPanelProps> = ({
  selectedJobId,
  onSelectedJobChange,
  onBackToSearch,
  onOpenDataLab,
  language,
  t,
}) => {
  const copy = panelText[language];
  const [jobs, setJobs] = useState<ResearchJobSummary[]>([]);
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<ResearchJobSummary | null>(null);
  const [selectedRun, setSelectedRun] = useState<ResearchRunSummary | null>(null);
  const [topic, setTopic] = useState('');
  const [report, setReport] = useState<ResearchReportSummary | null>(null);
  const [documents, setDocuments] = useState<ResearchDocumentSummary[]>([]);
  const [assets, setAssets] = useState<ResearchDocumentAssetSummary[]>([]);
  const [documentLinks, setDocumentLinks] = useState<DocumentLinkSummary[]>([]);
  const [tables, setTables] = useState<ExtractedTableSummary[]>([]);
  const [frontier, setFrontier] = useState<FrontierItemSummary[]>([]);
  const [events, setEvents] = useState<ResearchRunEvent[]>([]);
  const [claims, setClaims] = useState<EvidenceClaimSummary[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItemSummary[]>([]);
  const [graphRelations, setGraphRelations] = useState<EvidenceRelationSummary[]>([]);
  const [graphSummary, setGraphSummary] = useState<EvidenceGraphSummary>(emptyGraphSummary);
  const [sources, setSources] = useState<SourceProfileSummary[]>([]);
  const [providers, setProviders] = useState<DiscoveryProviderSummary[]>([]);
  const [plan, setPlan] = useState<ResearchPlanSummary | null>(null);
  const [plannedQueries, setPlannedQueries] = useState<PlannedQuerySummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
	  const [message, setMessage] = useState('');
	  const [running, setRunning] = useState(false);
	  const [exportingDataset, setExportingDataset] = useState(false);
	  const [exportingDataSources, setExportingDataSources] = useState(false);
	  const [manualQuery, setManualQuery] = useState('');
	  const [manualAction, setManualAction] = useState<'query' | 'retry' | ''>('');
	  const [newsAnalysis, setNewsAnalysis] = useState<ResearchNewsAnalysisResponse | null>(null);
	  const [newsAnalysisAction, setNewsAnalysisAction] = useState<ResearchNewsAnalysisResponse['endpoint'] | ''>('');
  const [documentSearchQuery, setDocumentSearchQuery] = useState('');
  const [documentSearchResults, setDocumentSearchResults] = useState<DocumentSearchResultSummary[]>([]);
  const [documentSearchBusy, setDocumentSearchBusy] = useState(false);
  const [queueStatus, setQueueStatus] = useState<ResearchQueueStatusSummary | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthSummary[]>([]);
  const [runtimeMonitorError, setRuntimeMonitorError] = useState('');
  const [capabilityAudit, setCapabilityAudit] = useState<ResearchCapabilityAuditSummary | null>(null);
  const [capabilityAuditError, setCapabilityAuditError] = useState('');
  const [providerSmoke, setProviderSmoke] = useState<ProviderLiveSmokeResultSummary | null>(null);
  const [dataSourceSmoke, setDataSourceSmoke] = useState<DataSourceLiveSmokeResultSummary | null>(null);
  const [pressureSmoke, setPressureSmoke] = useState<PressureSmokeResultSummary | null>(null);
  const [sampleAcceptance, setSampleAcceptance] = useState<ResearchSampleAcceptanceResultSummary | null>(null);
  const [enhancedFetchSmoke, setEnhancedFetchSmoke] = useState<EnhancedFetchSmokeResultSummary | null>(null);
  const [capabilitySmokeBusy, setCapabilitySmokeBusy] = useState<'' | 'provider' | 'data-source' | 'pressure' | 'sample-news' | 'sample-data' | 'enhanced-fetch'>('');

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];
  const sourceByDomain = useMemo(() => new Map(sources.map((source) => [source.domain, source])), [sources]);
  const providerStats = useMemo(() => summarizeProviders(providers), [providers]);
  const frontierStats = useMemo(() => summarizeFrontier(frontier), [frontier]);

  const loadRuntimeMonitor = async () => {
    try {
      const [queueRes, healthRes] = await Promise.all([
        fetch('/api/research/queues'),
        fetch('/api/research/providers/health'),
      ]);
      const [queueData, healthData] = await Promise.all([
        queueRes.json(),
        healthRes.json(),
      ]);
      if (!queueRes.ok) throw new Error(queueData.message || queueData.error || `HTTP ${queueRes.status}`);
      if (!healthRes.ok) throw new Error(healthData.message || healthData.error || `HTTP ${healthRes.status}`);
      setQueueStatus(queueData);
      setProviderHealth(healthData.providers ?? []);
      setRuntimeMonitorError('');
    } catch (error) {
      setRuntimeMonitorError(error instanceof Error ? error.message : String(error));
    }
  };

  const loadCapabilityAudit = async () => {
    try {
      const res = await fetch('/api/research/capabilities');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setCapabilityAudit(data);
      setProviderSmoke(data.lastSmoke?.provider ?? null);
      setDataSourceSmoke(data.lastSmoke?.dataSource ?? null);
      setPressureSmoke(data.lastSmoke?.pressure ?? null);
      setCapabilityAuditError('');
    } catch (error) {
      setCapabilityAuditError(error instanceof Error ? error.message : String(error));
    }
  };

  const runProviderSmoke = async () => {
    setCapabilitySmokeBusy('provider');
    setMessage('');
    try {
      const res = await fetch('/api/research/capabilities/provider-smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedJob?.topic || topic || 'document conversion tools and news verification' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setProviderSmoke(data);
      if (data.latest) {
        setProviderSmoke(data.latest.provider ?? data);
        setDataSourceSmoke(data.latest.dataSource ?? dataSourceSmoke);
        setPressureSmoke(data.latest.pressure ?? pressureSmoke);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilitySmokeBusy('');
    }
  };

  const runDataSourceSmoke = async () => {
    setCapabilitySmokeBusy('data-source');
    setMessage('');
    try {
      const res = await fetch('/api/research/capabilities/data-source-smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedJob?.topic || topic || 'public open dataset csv statistics' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setDataSourceSmoke(data);
      if (data.latest) {
        setProviderSmoke(data.latest.provider ?? providerSmoke);
        setDataSourceSmoke(data.latest.dataSource ?? data);
        setPressureSmoke(data.latest.pressure ?? pressureSmoke);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilitySmokeBusy('');
    }
  };

  const runPressureSmokeAction = async () => {
    setCapabilitySmokeBusy('pressure');
    setMessage('');
    try {
      const res = await fetch('/api/research/capabilities/pressure-smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedJob?.topic || topic || 'document conversion tools and news verification' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setPressureSmoke(data);
      if (data.latest) {
        setProviderSmoke(data.latest.provider ?? providerSmoke);
        setDataSourceSmoke(data.latest.dataSource ?? dataSourceSmoke);
        setPressureSmoke(data.latest.pressure ?? data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilitySmokeBusy('');
    }
  };

  const runSampleAcceptance = async (kind: ResearchSampleAcceptanceKindSummary) => {
    setCapabilitySmokeBusy(kind === 'news-trace' ? 'sample-news' : 'sample-data');
    setMessage('');
    try {
      const res = await fetch('/api/research/capabilities/sample-acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setSampleAcceptance(data);
      setMessage(`${data.label} ${data.status === 'passed' ? copy.passed : copy.failed}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilitySmokeBusy('');
    }
  };

  const runEnhancedFetchSmoke = async () => {
    setCapabilitySmokeBusy('enhanced-fetch');
    setMessage('');
    try {
      const res = await fetch('/api/research/capabilities/enhanced-fetch-smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setEnhancedFetchSmoke(data);
      setMessage(`${copy.enhancedFetchSmoke} ${data.passed ? copy.passed : copy.failed}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilitySmokeBusy('');
    }
  };

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/research/jobs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setJobs(data);
      setMessage('');
      return data as ResearchJobSummary[];
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return [];
    }
  };

  const loadJobArtifacts = async (job: ResearchJobSummary) => {
    setSelectedJob(job);
    onSelectedJobChange?.(job.id);
    setSelectedRun(null);
    setReport(null);
    const loadedRuns = await loadRuns(job.id);
    if (loadedRuns[0]) {
      await loadRunArtifacts(loadedRuns[0]);
    } else {
      await loadLegacyArtifacts(job.id);
    }
  };

  const loadRuns = async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/runs`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setRuns(data.runs ?? []);
      return data.runs as ResearchRunSummary[];
    } catch {
      setRuns([]);
      return [];
    }
  };

  const loadLegacyArtifacts = async (jobId: string) => {
    await Promise.all([loadLegacyReport(jobId), loadLegacyDocuments(jobId)]);
    setFrontier([]);
    setEvents([]);
    setClaims([]);
    setEvidence([]);
    setGraphRelations([]);
    setGraphSummary(emptyGraphSummary);
    setProviders([]);
    setAssets([]);
    setDocumentLinks([]);
	    setTables([]);
	    setPlan(null);
	    setPlannedQueries([]);
	    setNewsAnalysis(null);
	    setDocumentSearchResults([]);
	  };

  const loadLegacyReport = async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/report`);
      const data = await res.json();
      setReport(data);
    } catch (error) {
      setReport({ jobId, status: 'failed', markdown: String(error) });
    }
  };

  const loadLegacyDocuments = async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/documents`);
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setSelectedDocumentId(data.documents?.[0]?.id ?? '');
    } catch {
      setDocuments([]);
    }
  };

	  const loadRunArtifacts = async (run: ResearchRunSummary) => {
	    if (selectedRun?.id !== run.id) {
	      setNewsAnalysis(null);
	      setDocumentSearchResults([]);
	    }
	    setSelectedRun(run);
	    const [detailRes, planRes, eventsRes, frontierRes, documentsRes, assetsRes, linksRes, tablesRes, evidenceRes, claimsRes, graphRes, sourcesRes, providersRes] = await Promise.all([
      fetch(`/api/research/runs/${run.id}`),
      fetch(`/api/research/runs/${run.id}/plan`),
      fetch(`/api/research/runs/${run.id}/events`),
      fetch(`/api/research/runs/${run.id}/frontier`),
      fetch(`/api/research/runs/${run.id}/documents`),
      fetch(`/api/research/runs/${run.id}/assets`),
      fetch(`/api/research/runs/${run.id}/links`),
      fetch(`/api/research/runs/${run.id}/tables`),
      fetch(`/api/research/runs/${run.id}/evidence`),
      fetch(`/api/research/runs/${run.id}/claims`),
      fetch(`/api/research/runs/${run.id}/graph`),
      fetch(`/api/research/runs/${run.id}/sources`),
      fetch(`/api/research/runs/${run.id}/providers`),
    ]);

    const [detail, planData, eventsData, frontierData, documentsData, assetsData, linksData, tablesData, evidenceData, claimsData, graphData, sourcesData, providersData] = await Promise.all([
      detailRes.json(),
      planRes.json(),
      eventsRes.json(),
      frontierRes.json(),
      documentsRes.json(),
      assetsRes.json(),
      linksRes.json(),
      tablesRes.json(),
      evidenceRes.json(),
      claimsRes.json(),
      graphRes.json(),
      sourcesRes.json(),
      providersRes.json(),
    ]);

    if (detail.run) setSelectedRun(detail.run);
    if (detail.job) setSelectedJob(detail.job);
    setReport(detail.report ?? null);
    setEvents(eventsData.events ?? []);
    setFrontier(frontierData.frontier ?? []);
    setDocuments(documentsData.documents ?? []);
    setAssets(assetsData.assets ?? []);
    setDocumentLinks(linksData.links ?? []);
    setTables(tablesData.tables ?? []);
    setSelectedDocumentId((documentsData.documents ?? [])[0]?.id ?? '');
    setClaims(claimsData.claims ?? evidenceData.claims ?? []);
    setEvidence(evidenceData.evidence ?? []);
    setGraphRelations(graphData.relations ?? []);
    setGraphSummary(graphData.summary ?? emptyGraphSummary);
    setSources(sourcesData.sources ?? []);
    setProviders(providersData.providers ?? []);
    setPlan(planData.plan ?? null);
    setPlannedQueries(planData.queries ?? []);
  };

  const createAndRunJob = async () => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) return;
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch('/api/research/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: normalizedTopic }),
      });
      const job = await res.json();
      if (!res.ok) throw new Error(job.message || job.error || `HTTP ${res.status}`);
      setTopic('');
      await queueRun(job.id);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const queueRun = async (jobId = selectedJob?.id) => {
    if (!jobId) return;
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/runs`, { method: 'POST' });
      const data = await res.json() as ResearchRunResponse;
      if (!res.ok && res.status !== 202) throw new Error((data as any).message || (data as any).error || `HTTP ${res.status}`);
      setSelectedJob(data.job);
      if (data.run) {
        setRuns((current) => [data.run!, ...current.filter((run) => run.id !== data.run!.id)]);
        await loadRunArtifacts(data.run);
      }
      setMessage(t('research.runQueued'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const controlRun = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!selectedRun) return;
    try {
      const res = await fetch(`/api/research/runs/${selectedRun.id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      await loadRuns(selectedRun.jobId);
      await loadRunArtifacts(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const exportRunToDataset = async () => {
    if (!selectedRun) return;
    setExportingDataset(true);
    setMessage('');
    try {
      const res = await fetch(`/api/analytics/datasets/from-research-run/${selectedRun.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${selectedJob?.topic ?? 'Research'} / ${formatShortId(selectedRun.id)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setMessage(language === 'zh' ? '当前 run 已导出为 Data Lab 数据集。' : 'Current run exported as a Data Lab dataset.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setExportingDataset(false);
    }
  };

  const exportRunDataSourcesToDataset = async () => {
    if (!selectedRun) return;
    setExportingDataSources(true);
    setMessage('');
    try {
      const res = await fetch(`/api/analytics/datasets/from-research-run/${selectedRun.id}/data-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${selectedJob?.topic ?? 'Research'} / ${formatShortId(selectedRun.id)} / data sources` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      const count = data.summary?.dataSourceCount ?? data.dataset?.rowCount ?? 0;
      setMessage(`${copy.dataSourceExported} ${count} ${copy.dataSourceRows}`);
      onOpenDataLab?.({ runId: selectedRun.id, datasetId: data.dataset?.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setExportingDataSources(false);
    }
  };

  const appendManualQuery = async () => {
    const normalizedQuery = manualQuery.trim();
    if (!selectedRun || !normalizedQuery) return;
    const currentRun = selectedRun;
    setManualAction('query');
    setMessage('');
    try {
      const res = await fetch(`/api/research/runs/${selectedRun.id}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: normalizedQuery,
          purpose: 'overview',
          sourceTypes: ['unknown'],
          priority: 78,
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setManualQuery('');
      const nextRun = data.run ?? currentRun;
      await loadRuns(currentRun.jobId);
      await loadRunArtifacts(nextRun);
      setMessage(copy.manualQueryQueued);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setManualAction('');
    }
  };

	  const retryFailedFrontier = async () => {
    if (!selectedRun) return;
    const currentRun = selectedRun;
    setManualAction('retry');
    setMessage('');
    try {
      const res = await fetch(`/api/research/runs/${selectedRun.id}/retry-failed`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      const nextRun = data.run ?? currentRun;
      await loadRuns(currentRun.jobId);
      await loadRunArtifacts(nextRun);
      setMessage((data.resetCount ?? 0) > 0 ? copy.retryQueued : copy.retryNothing);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setManualAction('');
    }
	  };

	  const runNewsAnalysis = async (endpoint: ResearchNewsAnalysisResponse['endpoint']) => {
	    if (!selectedRun) return;
	    setNewsAnalysisAction(endpoint);
	    setMessage('');
	    try {
	      const res = await fetch(`/api/news-analysis/runs/${selectedRun.id}/${endpoint}`, {
	        method: 'POST',
	        headers: { 'Content-Type': 'application/json' },
	      });
	      const data = await res.json() as ResearchNewsAnalysisResponse & { message?: string; error?: string };
	      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
	      setNewsAnalysis(data);
	      setMessage(language === 'zh' ? '新闻分析已完成，结果已保存为 Data Lab 资产。' : 'News analysis completed and saved as a Data Lab artifact.');
	    } catch (error) {
	      setMessage(error instanceof Error ? error.message : String(error));
	    } finally {
	      setNewsAnalysisAction('');
	    }
	  };

	  const searchRunDocuments = async () => {
	    const query = documentSearchQuery.trim();
	    if (!selectedRun || !query) return;
	    setDocumentSearchBusy(true);
	    setMessage('');
	    try {
	      const res = await fetch(`/api/research/runs/${selectedRun.id}/search?q=${encodeURIComponent(query)}`);
	      const data = await res.json() as { results?: DocumentSearchResultSummary[]; message?: string; error?: string };
	      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
	      setDocumentSearchResults(data.results ?? []);
	    } catch (error) {
	      setMessage(error instanceof Error ? error.message : String(error));
	      setDocumentSearchResults([]);
	    } finally {
	      setDocumentSearchBusy(false);
	    }
	  };

  useEffect(() => {
    loadRuntimeMonitor();
    loadCapabilityAudit();
    loadJobs().then((loadedJobs) => {
      const selected = selectedJobId ? loadedJobs.find((job) => job.id === selectedJobId) : loadedJobs[0];
      if (selected) loadJobArtifacts(selected);
    });
  }, [selectedJobId]);

  useEffect(() => {
    if (!selectedRun || isTerminalRun(selectedRun.status)) return;
    const timer = window.setInterval(() => {
      loadRunArtifacts(selectedRun);
      loadRuns(selectedRun.jobId);
      loadRuntimeMonitor();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [selectedRun?.id, selectedRun?.status]);

  return (
    <div className="h-full flex flex-col bg-[#E4E3E0] text-[#141414] lg:flex-row">
      <aside className="max-h-[42vh] border-b border-[#141414] bg-[#F5F5F4] flex flex-col lg:max-h-none lg:w-[21rem] lg:border-b-0 lg:border-r">
        <div className="p-4 border-b border-stone-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBackToSearch && (
              <button className="p-2 hover:bg-stone-200 rounded" onClick={onBackToSearch} title={t('research.backToSearch')}>
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="font-serif italic text-stone-600 truncate">{t('research.title')}</h2>
          </div>
          <button className="p-2 hover:bg-stone-200 rounded" onClick={loadJobs} title={t('research.refreshJobs')}>
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="p-4 border-b border-stone-300 space-y-3">
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t('research.topicPlaceholder')}
            className="w-full border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={createAndRunJob}
            disabled={running || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 text-stone-100 px-3 py-2 text-sm disabled:opacity-50"
          >
            <Search size={14} />
            {running ? t('research.running') : t('research.createAndRun')}
          </button>
          {message && <p className="text-xs text-rose-700 font-mono leading-relaxed">{message}</p>}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {jobs.map((job) => (
            <div key={job.id} className={`border-b border-stone-300 ${selectedJob?.id === job.id ? 'bg-stone-200' : ''}`}>
              <button onClick={() => loadJobArtifacts(job)} className="w-full text-left p-4 hover:bg-stone-100">
                <div className="font-serif text-lg leading-tight">{job.topic}</div>
                <div className="font-mono text-[10px] uppercase mt-2 opacity-50">
                  {labelForStatus(job.status, language)} / {t('research.depth')} {job.budget.maxDepth}
                </div>
              </button>
              {selectedJob?.id === job.id && runs.length > 0 && (
                <div className="px-3 pb-3 space-y-1">
                  {runs.slice(0, 8).map((run) => (
                    <button
                      key={run.id}
                      onClick={() => loadRunArtifacts(run)}
                      className={`w-full text-left border px-3 py-2 text-xs ${selectedRun?.id === run.id ? 'border-stone-900 bg-white' : 'border-stone-300 bg-stone-100 hover:bg-white'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{formatShortId(run.id)}</span>
                        <span>{labelForStatus(run.status, language)}</span>
                      </div>
                      <div className="mt-1 opacity-50">{formatDate(run.createdAt)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 lg:p-5">
        {selectedJob ? (
          <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem] gap-5">
            <section className="min-w-0 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-3">
                    {t('research.job')} {formatShortId(selectedJob.id)}
                    {selectedRun && ` / RUN ${formatShortId(selectedRun.id)}`}
                  </div>
                  <h1 className="font-serif text-4xl leading-tight mb-3">{selectedJob.topic}</h1>
                  <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase">
                    <Badge>{labelForStatus(selectedRun?.status ?? selectedJob.status, language)}</Badge>
                    <Badge>{t('research.urls')}: {selectedRun?.budget.maxUrlsPerRun ?? selectedJob.budget.maxUrlsPerRun}</Badge>
                    <Badge>{t('research.domains')}: {selectedRun?.budget.maxDomainsPerRun ?? selectedJob.budget.maxDomainsPerRun}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <IconButton onClick={() => queueRun(selectedJob.id)} disabled={running} title={t('research.runAgain')} icon={<Play size={15} />} />
                  <IconButton onClick={() => controlRun('pause')} disabled={!selectedRun || isTerminalRun(selectedRun.status)} title={t('research.pauseRun')} icon={<CirclePause size={15} />} />
                  <IconButton onClick={() => controlRun('resume')} disabled={!selectedRun || selectedRun.status !== 'paused'} title={t('research.resumeRun')} icon={<RefreshCw size={15} />} />
                  <IconButton onClick={() => controlRun('cancel')} disabled={!selectedRun || isTerminalRun(selectedRun.status)} title={t('research.cancelRun')} icon={<Ban size={15} />} />
                  <IconButton onClick={exportRunToDataset} disabled={!selectedRun || exportingDataset} title={copy.exportToDataLab} icon={<BarChart3 size={15} />} />
                </div>
              </div>
              {message && <p className="font-mono text-xs text-rose-700">{message}</p>}

              <CapabilityAuditPanel
                audit={capabilityAudit}
                error={capabilityAuditError}
                providerSmoke={providerSmoke}
                dataSourceSmoke={dataSourceSmoke}
                pressureSmoke={pressureSmoke}
                sampleAcceptance={sampleAcceptance}
                enhancedFetchSmoke={enhancedFetchSmoke}
                busy={capabilitySmokeBusy}
                onRunProviderSmoke={runProviderSmoke}
                onRunDataSourceSmoke={runDataSourceSmoke}
                onRunPressureSmoke={runPressureSmokeAction}
                onRunSampleAcceptance={runSampleAcceptance}
                onRunEnhancedFetchSmoke={runEnhancedFetchSmoke}
                copy={copy}
                language={language}
              />

              <RuntimeMonitorPanel
                queueStatus={queueStatus}
                providerHealth={providerHealth}
                error={runtimeMonitorError}
                copy={copy}
              />

              <RunTimeline run={selectedRun} events={events} language={language} t={t} />

              <ManualRunControls
                run={selectedRun}
                query={manualQuery}
                onQueryChange={setManualQuery}
                onAppendQuery={appendManualQuery}
                onRetryFailed={retryFailedFrontier}
                busy={manualAction}
                failedCount={(frontierStats.failed ?? 0) + (frontierStats.skipped ?? 0)}
                copy={copy}
                language={language}
              />

              <QueryPlanPanel
                plan={plan}
                plannedQueries={plannedQueries}
                fallbackQueries={selectedJob.queryPlan}
                copy={copy}
                t={t}
              />

	              <div className="grid md:grid-cols-4 gap-3">
	                <Metric label={t('research.docs')} value={documents.length} />
	                <Metric label={t('research.frontier')} value={frontier.length} />
	                <Metric label={t('research.claims')} value={claims.length} />
	                <Metric label={t('research.providers')} value={providers.length} />
	              </div>

	              <RunDocumentSearchPanel
	                run={selectedRun}
	                query={documentSearchQuery}
	                results={documentSearchResults}
	                busy={documentSearchBusy}
	                onQueryChange={setDocumentSearchQuery}
	                onSearch={searchRunDocuments}
	                onSelectDocument={setSelectedDocumentId}
	                copy={copy}
	                language={language}
	              />

	              <NewsAnalysisPanel
	                run={selectedRun}
	                result={newsAnalysis}
	                busy={newsAnalysisAction}
	                onRun={runNewsAnalysis}
	                copy={copy}
	                language={language}
	              />

	              <Panel title={t('research.latestReport')}>
                {report?.markdown ? (
                  <pre className="whitespace-pre-wrap text-sm leading-6 font-sans">{report.markdown}</pre>
                ) : (
                  <p className="font-mono text-sm opacity-60">{t('research.reportNotReady')}</p>
                )}
              </Panel>

              <ClaimsPanel claims={claims} language={language} copy={copy} />
              <EvidenceTable claims={claims} evidence={evidence} language={language} t={t} />
              <EvidenceGraphPanel
                claims={claims}
                evidence={evidence}
                relations={graphRelations}
                summary={graphSummary}
                copy={copy}
                language={language}
              />
            </section>

            <aside className="space-y-5 min-w-0">
              <SourceExplorer
                documents={documents}
                selectedDocument={selectedDocument}
                assets={assets}
                links={documentLinks}
                tables={tables}
                claims={claims}
                evidence={evidence}
                sourceByDomain={sourceByDomain}
                onSelect={setSelectedDocumentId}
                language={language}
                copy={copy}
                t={t}
              />
              <FrontierPanel frontier={frontier} stats={frontierStats} language={language} t={t} copy={copy} />
              <ProviderPanel
                stats={providerStats}
                providers={providers}
                copy={copy}
                t={t}
                run={selectedRun}
                exporting={exportingDataSources}
                onExportDataSources={exportRunDataSourcesToDataset}
                onOpenDataLab={selectedRun ? () => onOpenDataLab?.({ runId: selectedRun.id }) : undefined}
              />
            </aside>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center opacity-30">
            <div className="text-center">
              <div className="text-5xl font-serif italic mb-3">{t('research.emptyTitle')}</div>
              <div className="font-mono text-sm">{t('research.emptyHint')}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
