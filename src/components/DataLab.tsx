import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FlaskConical,
  GitBranch,
  LineChart,
  Network,
  Play,
  RefreshCw,
  Rows3,
  Sparkles,
  TableProperties,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  AnalyticsCapability,
  AnalyticsArtifactSummary,
  AnalyticsDatasetSummary,
  AnalyticsJobKindSummary,
  AnalyticsJobSummary,
  DatasetProfileSummary,
  DescriptiveStatisticsSummary,
  VisualizationArtifactSummary,
  VisualizationSuggestionSummary,
} from '../types';
import { Language } from '../i18n';
import { DataLabAnalysisWizard } from './data-lab/DataLabAnalysisWizard';

interface DataLabProps {
  language: Language;
  focus?: {
    runId?: string;
    datasetId?: string;
    handoffId?: string;
    planId?: string;
    mode?: 'report_only' | 'light_analysis' | 'full_analysis' | 'continue_crawl';
    page?: 'sources' | 'wizard';
  };
  onOpenResearchRun?: (runId: string) => void;
}

const text = {
  zh: {
    title: 'Data Lab',
    subtitle: '研究型数据工厂',
    hero: '多源导入、清洗转换、SPSS 级统计、机器学习、新闻整理、论文制图和报告导出都在这里闭环。',
    ingest: '数据入口',
    datasetName: '数据集名称',
    importKind: '导入格式',
    chooseFile: '选择文件',
    importDataset: '导入并解析',
    saveManual: '保存手动数据',
    profile: '快速画像',
    stats: '描述统计',
    manualRows: '手动 JSON 行数据',
    selectedFile: '已选文件',
    noFile: '未选择文件',
    selectedDataset: '当前数据集',
    noDataset: '尚未选择数据集',
    datasetWorkbench: '数据集操作台',
    datasetWorkbenchHint: '对当前数据集直接运行兼容 API：质量校验、清洗任务和字段查询。没有选中数据集时会先保存手动 JSON 行。',
    validateDataset: '运行质量校验',
    cleanDataset: '执行清洗',
    queryDataset: '字段查询',
    queryFields: '查询字段',
    queryLimit: '查询行数',
    queryFieldsPlaceholder: 'source,count',
    operationResult: '操作结果',
    operationHistory: '最近操作',
    validationResult: '质量校验结果',
    cleaningResult: '清洗结果',
    queryResult: '查询结果',
    jobActions: '任务操作',
    rerunJob: '重跑任务',
    cancelJob: '取消任务',
    jobRerunResult: '任务已重跑',
    jobCancelResult: '任务已取消',
    exportArtifact: '导出资产',
    exportResult: '导出结果',
    pipelines: '能力流水线',
    result: '运行结果',
    resultHint: '点击下方任一能力，结果会保存为 Postgres job 和 artifact，并在这里展开摘要。',
    assets: '资产与活动',
    apiSurface: 'API 接口面',
    apiSurfaceHint: '计划短路径已经映射到现有 Postgres / Worker / Artifact 能力。',
    dataSourceRegistry: '数据源资产清单',
    dataSourceRegistryHint: 'Research Provider 面板可以把 data-catalog、structured-api、competition-data、sports-data 候选导入为 Data Lab 数据集，保留 provider、优先级、格式、许可提示和 lineage。',
    dataSourceRegistryEmpty: '暂无 Research 数据源资产清单。先在 Research 的 Provider 面板点击“生成 Data Lab 数据源清单”。',
    sourceFilters: '数据源筛选',
    sourceSearchPlaceholder: '按标题、URL、provider、query 搜索',
    allProviders: '全部 Provider',
    allFormats: '全部格式',
    minQuality: '质量阈值',
    sourceQualityScore: '来源质量',
    materializeReadiness: '可导入性',
    qualityReason: '质量理由',
    versionHistory: '版本历史',
    noVersionHistory: '暂无其它快照版本。',
    researchContextLinked: '已定位 Research 数据源上下文',
    openResearchRun: '回到 Research run',
    linkedRun: '关联 run',
    providerType: 'Provider 类型',
    accessMode: '访问方式',
    formatHint: '格式',
    licenseHint: '许可提示',
    priorityScore: '优先级',
    sourceType: '来源类型',
    lineageJson: 'Lineage JSON',
    materializeSource: '导入数据快照',
    materializeBatch: '批量导入前 8 个',
    materializeBatchHint: '逐个抓取候选 URL，成功的落成独立数据集，失败的保留原因，避免单个坏源拖垮整批。',
    batchMaterialized: '批量快照完成',
    materializeStatus: '导入状态',
    materializePending: '待导入',
    materializeSucceeded: '已导入',
    materializeFailed: '导入失败',
    sourcePolicy: '默认拒绝 localhost / 私网 URL；如需本机测试，在 .env 显式开启 ANALYTICS_SOURCE_ALLOW_PRIVATE_NETWORKS。',
    refreshMaterializedSource: '刷新数据源快照',
    sourceRefreshed: '数据源快照已刷新',
    snapshotVersion: '快照版本',
    snapshotLineage: '快照链路',
    refreshSourceHint: '基于原始 sourceRow/sourceUrl 重新抓取，生成新版本数据集，旧快照保留用于复核。',
    sourceMaterialized: '数据源快照已导入',
    materializedRows: '快照行数',
    datasets: 'Postgres 数据集',
    jobs: '最近任务',
    artifacts: '分析资产',
    capabilities: '能力目录',
    chartSuggestions: '图表建议',
    renderChart: '生成交互图',
    files: '可下载文件',
    details: '摘要',
    columns: '字段画像',
    statistics: '统计结果',
    warnings: '质量提示',
    empty: '暂无记录',
    refresh: '刷新',
    rows: '行',
    cols: '列',
    preview: '预览',
    storage: '存储',
    sampleLimit: '预览限制',
    lineage: '处理链路',
    rawJson: '原始 JSON',
    visualPreview: '图表预览',
    histogramPreview: '直方图预览',
    tablePreview: '表格预览',
    svgChartPreview: 'SVG 图表预览',
    chartPreviewAlt: 'Analytics SVG 图表预览',
    columnName: '字段',
    columnType: '类型',
    missing: '缺失',
    unique: '唯一值',
    range: '范围',
    count: '样本数',
    mean: '均值',
    median: '中位数',
    std: '标准差',
    quality: '质量分',
    job: '任务',
    kind: '类型',
    status: '状态',
    engine: '引擎',
    source: '来源',
    created: '创建时间',
    samplePlaceholder: '[{"source":"Reuters","count":12,"date":"2026-06-01","group":"A"},{"source":"AP","count":8,"date":"2026-06-02","group":"B"}]',
    manualDataset: '手动数据集',
    importFormats: 'CSV / JSON / JSONL / Parquet / Excel / HTML / PDF / DOCX / PPTX / GeoJSON',
    analysisWizard: 'SPSS Pro 分析向导',
    analysisWizardHint: '按研究问题组织变量、统计方法、建模链路、图表和报告输出。它会复用下方 Worker 能力，但用更接近 SPSS 的流程来跑。',
    wizardDataset: '数据集',
    wizardQuestion: '研究问题',
    wizardQuestionPlaceholder: '例如：不同来源的新闻数量是否有显著差异，哪些变量能预测评分？',
    wizardTemplate: '分析模板',
    wizardVariables: '变量设置',
    wizardVariablesHint: '选择目标变量、分组变量、时间变量和权重变量，向导会推荐统计/建模链路。',
    wizardTarget: '目标变量',
    wizardGroup: '分组变量',
    wizardTime: '时间变量',
    wizardWeight: '权重变量',
    wizardOutputs: '输出物',
    wizardRunPlan: '运行方案',
    wizardRunPrimary: '运行主分析',
    wizardRunAll: '运行整套流程',
    wizardNoDataset: '先选择或导入一个数据集，向导会自动生成可运行方案。',
    wizardRecommended: '推荐流程',
    wizardMethodChain: '方法链',
    wizardChartPlan: '图表方案',
    wizardReportPlan: '报告与导出',
    wizardDataQuality: '质量',
    wizardStatistical: '统计',
    wizardModeling: '建模',
    wizardVisual: '可视化',
    wizardPaper: '生成论文/汇报输出',
    wizardSelectPlaceholder: '自动选择',
  },
  en: {
    title: 'Data Lab',
    subtitle: 'Research data factory',
    hero: 'Close the loop for multi-source import, cleaning, SPSS-grade statistics, machine learning, news organization, publication charts, and report export.',
    ingest: 'Data intake',
    datasetName: 'Dataset name',
    importKind: 'Import format',
    chooseFile: 'Choose file',
    importDataset: 'Import and parse',
    saveManual: 'Save manual data',
    profile: 'Quick profile',
    stats: 'Descriptive stats',
    manualRows: 'Manual JSON rows',
    selectedFile: 'Selected file',
    noFile: 'No file selected',
    selectedDataset: 'Selected dataset',
    noDataset: 'No dataset selected',
    datasetWorkbench: 'Dataset workbench',
    datasetWorkbenchHint: 'Run the compatibility API directly on the current dataset: validation, cleaning, and field query. If no dataset is selected, manual JSON rows are saved first.',
    validateDataset: 'Run quality validation',
    cleanDataset: 'Run cleaning',
    queryDataset: 'Field query',
    queryFields: 'Query fields',
    queryLimit: 'Query rows',
    queryFieldsPlaceholder: 'source,count',
    operationResult: 'Operation result',
    operationHistory: 'Recent operations',
    validationResult: 'Validation result',
    cleaningResult: 'Cleaning result',
    queryResult: 'Query result',
    jobActions: 'Job actions',
    rerunJob: 'Rerun job',
    cancelJob: 'Cancel job',
    jobRerunResult: 'Job rerun',
    jobCancelResult: 'Job cancelled',
    exportArtifact: 'Export asset',
    exportResult: 'Export result',
    pipelines: 'Capability pipelines',
    result: 'Run result',
    resultHint: 'Run any capability below; the result is stored as a Postgres job and artifact and summarized here.',
    assets: 'Assets and activity',
    apiSurface: 'API surface',
    apiSurfaceHint: 'Plan-level short paths are mapped to the existing Postgres / worker / artifact stack.',
    dataSourceRegistry: 'Data source asset registry',
    dataSourceRegistryHint: 'The Research Provider Panel can import data-catalog, structured-api, competition-data, and sports-data candidates as a Data Lab dataset with provider, priority, format, license hints, and lineage.',
    dataSourceRegistryEmpty: 'No Research data source registry yet. Click "Create Data Lab source registry" in the Research Provider Panel first.',
    sourceFilters: 'Source filters',
    sourceSearchPlaceholder: 'Search title, URL, provider, or query',
    allProviders: 'All providers',
    allFormats: 'All formats',
    minQuality: 'Quality floor',
    sourceQualityScore: 'Source quality',
    materializeReadiness: 'Readiness',
    qualityReason: 'Quality reason',
    versionHistory: 'Version history',
    noVersionHistory: 'No other snapshot versions yet.',
    researchContextLinked: 'Research data-source context focused',
    openResearchRun: 'Back to Research run',
    linkedRun: 'Linked run',
    providerType: 'Provider type',
    accessMode: 'Access mode',
    formatHint: 'Format',
    licenseHint: 'License hint',
    priorityScore: 'Priority',
    sourceType: 'Source type',
    lineageJson: 'Lineage JSON',
    materializeSource: 'Import data snapshot',
    materializeBatch: 'Batch import first 8',
    materializeBatchHint: 'Fetch candidate URLs one by one, save successful rows as independent datasets, and keep failure reasons without blocking the batch.',
    batchMaterialized: 'Batch snapshots finished',
    materializeStatus: 'Import status',
    materializePending: 'Pending',
    materializeSucceeded: 'Imported',
    materializeFailed: 'Failed',
    sourcePolicy: 'localhost and private-network URLs are blocked by default; enable ANALYTICS_SOURCE_ALLOW_PRIVATE_NETWORKS in .env only for local tests.',
    refreshMaterializedSource: 'Refresh source snapshot',
    sourceRefreshed: 'Data source snapshot refreshed',
    snapshotVersion: 'Snapshot version',
    snapshotLineage: 'Snapshot lineage',
    refreshSourceHint: 'Refetch from the original sourceRow/sourceUrl, create a new dataset version, and keep the old snapshot for audit.',
    sourceMaterialized: 'Data source snapshot imported',
    materializedRows: 'Snapshot rows',
    datasets: 'Postgres datasets',
    jobs: 'Recent jobs',
    artifacts: 'Artifacts',
    capabilities: 'Capability catalog',
    chartSuggestions: 'Chart suggestions',
    renderChart: 'Render chart',
    files: 'Downloadable files',
    details: 'Summary',
    columns: 'Column profile',
    statistics: 'Statistics',
    warnings: 'Warnings',
    empty: 'No records',
    refresh: 'Refresh',
    rows: 'Rows',
    cols: 'Columns',
    preview: 'Preview',
    storage: 'Storage',
    sampleLimit: 'Sample limit',
    lineage: 'Lineage',
    rawJson: 'Raw JSON',
    visualPreview: 'Visual preview',
    histogramPreview: 'Histogram preview',
    tablePreview: 'Table preview',
    svgChartPreview: 'SVG chart preview',
    chartPreviewAlt: 'Analytics SVG chart preview',
    columnName: 'Name',
    columnType: 'Type',
    missing: 'Missing',
    unique: 'Unique',
    range: 'Range',
    count: 'Count',
    mean: 'Mean',
    median: 'Median',
    std: 'Std',
    quality: 'Quality',
    job: 'Job',
    kind: 'Kind',
    status: 'Status',
    engine: 'Engine',
    source: 'Source',
    created: 'Created',
    samplePlaceholder: '[{"source":"Reuters","count":12,"date":"2026-06-01","group":"A"},{"source":"AP","count":8,"date":"2026-06-02","group":"B"}]',
    manualDataset: 'Manual dataset',
    importFormats: 'CSV / JSON / JSONL / Parquet / Excel / HTML / PDF / DOCX / PPTX / GeoJSON',
    analysisWizard: 'SPSS Pro Analysis Wizard',
    analysisWizardHint: 'Frame research questions into variables, statistical methods, modeling chains, charts, and report outputs. It reuses the worker stack below through a more SPSS-like workflow.',
    wizardDataset: 'Dataset',
    wizardQuestion: 'Research question',
    wizardQuestionPlaceholder: 'Example: do news counts differ by source, and which variables predict score?',
    wizardTemplate: 'Analysis template',
    wizardVariables: 'Variables',
    wizardVariablesHint: 'Pick target, group, time, and weight fields; the wizard recommends a statistical/modeling chain.',
    wizardTarget: 'Target',
    wizardGroup: 'Group',
    wizardTime: 'Time',
    wizardWeight: 'Weight',
    wizardOutputs: 'Outputs',
    wizardRunPlan: 'Run plan',
    wizardRunPrimary: 'Run primary',
    wizardRunAll: 'Run full flow',
    wizardNoDataset: 'Select or import a dataset first; the wizard will build a runnable plan.',
    wizardRecommended: 'Recommended workflow',
    wizardMethodChain: 'Method chain',
    wizardChartPlan: 'Chart plan',
    wizardReportPlan: 'Report and export',
    wizardDataQuality: 'Quality',
    wizardStatistical: 'Statistics',
    wizardModeling: 'Modeling',
    wizardVisual: 'Visual',
    wizardPaper: 'Generate paper/deck output',
    wizardSelectPlaceholder: 'Auto',
  },
} as const;

type ToolDefinition = {
  kind: AnalyticsJobKindSummary;
  label: string;
  description: string;
  icon: React.ReactNode;
};

type ToolGroup = {
  id: string;
  title: string;
  eyebrow: string;
  accent: string;
  tools: ToolDefinition[];
};

type MaterializeResultState = {
  rowIndex: number;
  ok: boolean;
  datasetId?: string;
  datasetName?: string;
  error?: string;
  rows?: number;
};

type DataLabPage = 'home' | 'import' | 'dataset' | 'wizard' | 'analysis' | 'visuals' | 'sources' | 'activity' | 'system';

function dataLabPages(language: Language): Array<{ id: DataLabPage; label: string; hint: string; icon: React.ReactNode }> {
  const zh = language === 'zh';
  return [
    { id: 'home', label: zh ? '首页' : 'Home', hint: zh ? '选择下一步工作流。' : 'Choose the next workflow.', icon: <FlaskConical size={15} /> },
    { id: 'import', label: zh ? '导入数据' : 'Import', hint: zh ? '上传文件或粘贴 JSON rows。' : 'Upload files or paste JSON rows.', icon: <Upload size={15} /> },
    { id: 'dataset', label: zh ? '数据集' : 'Dataset', hint: zh ? '预览、画像、校验、清洗和查询。' : 'Preview, profile, validate, clean, query.', icon: <Database size={15} /> },
    { id: 'wizard', label: zh ? '分析向导' : 'Wizard', hint: zh ? '按研究问题跑 SPSS 式流程。' : 'Run SPSS-style workflows by question.', icon: <Sparkles size={15} /> },
    { id: 'analysis', label: zh ? '统计建模' : 'Analysis', hint: zh ? '统计、建模、文本、时间序列。' : 'Stats, modeling, text, time series.', icon: <BrainCircuit size={15} /> },
    { id: 'visuals', label: zh ? '图表报告' : 'Charts', hint: zh ? '论文图、交互图和报告导出。' : 'Publication charts and exports.', icon: <LineChart size={15} /> },
    { id: 'sources', label: zh ? '数据源资产' : 'Sources', hint: zh ? '把 Research 数据源落成数据集。' : 'Materialize Research data sources.', icon: <Network size={15} /> },
    { id: 'activity', label: zh ? '任务产物' : 'Activity', hint: zh ? 'Jobs、artifacts、下载和重跑。' : 'Jobs, artifacts, downloads, reruns.', icon: <FileJson size={15} /> },
    { id: 'system', label: zh ? '系统接口' : 'System', hint: zh ? 'API surface 和能力目录。' : 'API surface and capability catalog.', icon: <Activity size={15} /> },
  ];
}

export const DataLab: React.FC<DataLabProps> = ({ language, focus, onOpenResearchRun }) => {
  const copy = text[language];
  const [capabilities, setCapabilities] = useState<AnalyticsCapability[]>([]);
  const [datasets, setDatasets] = useState<AnalyticsDatasetSummary[]>([]);
  const [jobs, setJobs] = useState<AnalyticsJobSummary[]>([]);
  const [artifacts, setArtifacts] = useState<AnalyticsArtifactSummary[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [datasetName, setDatasetName] = useState(copy.manualDataset);
  const [importKind, setImportKind] = useState('json');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [rowsText, setRowsText] = useState(copy.samplePlaceholder);
  const [profile, setProfile] = useState<DatasetProfileSummary | null>(null);
  const [suggestions, setSuggestions] = useState<VisualizationSuggestionSummary[]>([]);
  const [statistics, setStatistics] = useState<DescriptiveStatisticsSummary | null>(null);
  const [workerJob, setWorkerJob] = useState<AnalyticsJobSummary | null>(null);
  const [workerPayload, setWorkerPayload] = useState<Record<string, unknown> | null>(null);
  const [visualizationArtifact, setVisualizationArtifact] = useState<VisualizationArtifactSummary | null>(null);
  const [datasetOperationPayload, setDatasetOperationPayload] = useState<Record<string, unknown> | null>(null);
  const [datasetOperationHistory, setDatasetOperationHistory] = useState<Array<Record<string, unknown>>>([]);
  const [datasetQueryFields, setDatasetQueryFields] = useState('source,count');
  const [datasetQueryLimit, setDatasetQueryLimit] = useState('25');
  const [materializingSourceKey, setMaterializingSourceKey] = useState('');
  const [materializeResults, setMaterializeResults] = useState<MaterializeResultState[]>([]);
  const [appliedFocusKey, setAppliedFocusKey] = useState('');
  const [busyKind, setBusyKind] = useState<string>('');
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState<DataLabPage>('home');

  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId);
  const dataSourceDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.sourceKind === 'research-data-source'),
    [datasets],
  );
  const activeDataSourceDataset = selectedDataset?.sourceKind === 'research-data-source'
    ? selectedDataset
    : dataSourceDatasets[0];
  const activeDataSourceRunId = activeDataSourceDataset ? runIdFromDataset(activeDataSourceDataset) : '';
  const toolGroups = useMemo<ToolGroup[]>(() => buildToolGroups(language), [language]);
  const apiEndpoints = useMemo(() => buildApiSurface(language), [language]);
  const labPages = useMemo(() => dataLabPages(language), [language]);
  const activePageMeta = labPages.find((page) => page.id === activePage) ?? labPages[0];
  const selectedVersionHistory = useMemo(
    () => selectedDataset ? buildMaterializedVersionHistory(selectedDataset, datasets) : [],
    [selectedDataset, datasets],
  );

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    await Promise.all([loadCapabilities(), loadDatasets(), loadAnalyticsActivity()]);
  };

  const loadCapabilities = async () => {
    try {
      const res = await fetch('/api/analytics/capabilities');
      const data = await res.json();
      if (res.ok) setCapabilities(data.capabilities ?? []);
    } catch (capabilityError) {
      setError(capabilityError instanceof Error ? capabilityError.message : String(capabilityError));
    }
  };

  const loadDatasets = async () => {
    try {
      const res = await fetch('/api/analytics/datasets');
      const data = await res.json();
      if (res.ok) setDatasets(data.datasets ?? []);
    } catch {
      setDatasets([]);
    }
  };

  const loadAnalyticsActivity = async () => {
    try {
      const [jobsRes, artifactsRes] = await Promise.all([
        fetch('/api/analytics/jobs'),
        fetch('/api/analytics/artifacts'),
      ]);
      const jobsData = await jobsRes.json();
      const artifactsData = await artifactsRes.json();
      if (jobsRes.ok) setJobs(jobsData.jobs ?? []);
      if (artifactsRes.ok) setArtifacts(artifactsData.artifacts ?? []);
    } catch {
      setJobs([]);
      setArtifacts([]);
    }
  };

  const parseRows = () => {
    const parsed = JSON.parse(rowsText);
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(rows)) throw new Error('rows must be a JSON array');
    return rows;
  };

  const clearDatasetOperationPayload = () => {
    setDatasetOperationPayload(null);
    setDatasetOperationHistory([]);
    setMaterializeResults([]);
  };

  const recordDatasetOperationPayload = (payload: Record<string, unknown>) => {
    const nextPayload = {
      at: new Date().toISOString(),
      ...payload,
    };
    setDatasetOperationPayload(nextPayload);
    setDatasetOperationHistory((history) => [nextPayload, ...history].slice(0, 6));
  };

  const selectDatasetSummary = (dataset: AnalyticsDatasetSummary, options: { clearOperation?: boolean } = {}) => {
    setSelectedDatasetId(dataset.id);
    setDatasetName(dataset.name);
    setRowsText(JSON.stringify(dataset.sampleRows, null, 2));
    setWorkerJob(null);
    setWorkerPayload(null);
    setVisualizationArtifact(null);
    if (options.clearOperation !== false) {
      clearDatasetOperationPayload();
    }
  };

  useEffect(() => {
    const focusKey = `${focus?.datasetId ?? ''}:${focus?.runId ?? ''}`;
    if (!focusKey || focusKey === ':' || appliedFocusKey === focusKey || datasets.length === 0) return;
    const datasetMatch = focus?.datasetId ? datasets.find((dataset) => dataset.id === focus.datasetId) : undefined;
    const runMatch = focus?.runId
      ? datasets.find((dataset) => dataset.sourceKind === 'research-data-source' && dataset.sourceRef === focus.runId)
        ?? datasets.find((dataset) => runIdFromDataset(dataset) === focus.runId)
      : undefined;
    const match = datasetMatch ?? runMatch;
    if (!match) return;
    selectDatasetSummary(match, { clearOperation: false });
    setActivePage(match.sourceKind === 'research-data-source' ? 'sources' : 'dataset');
    recordDatasetOperationPayload({
      operation: copy.researchContextLinked,
      runId: focus?.runId,
      datasetId: match.id,
      sourceKind: match.sourceKind,
    });
    setAppliedFocusKey(focusKey);
  }, [focus?.datasetId, focus?.runId, datasets, appliedFocusKey]);

  const runProfile = async () => {
    setBusyKind('profile');
    setError('');
    try {
      const rows = parseRows();
      const res = await fetch('/api/analytics/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProfile(data.profile);
      setSuggestions(data.suggestions ?? []);
      await runStatistics(rows);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : String(profileError));
    } finally {
      setBusyKind('');
    }
  };

  const runStatistics = async (rowsInput?: Array<Record<string, unknown>>) => {
    setError('');
    try {
      const rows = rowsInput ?? parseRows();
      const res = await fetch('/api/analytics/statistics/descriptive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatistics(data);
    } catch (statsError) {
      setError(statsError instanceof Error ? statsError.message : String(statsError));
    }
  };

  const createDataset = async () => {
    const rows = parseRows();
    const res = await fetch('/api/analytics/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: datasetName, rows, sourceKind: 'manual' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setSelectedDatasetId(data.dataset?.id ?? '');
    setProfile(data.profile);
    setSuggestions(data.suggestions ?? []);
    clearDatasetOperationPayload();
    await runStatistics(rows);
    await loadDatasets();
    return data.dataset as AnalyticsDatasetSummary;
  };

  const saveDataset = async () => {
    setBusyKind('save');
    setError('');
    try {
      await createDataset();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyKind('');
    }
  };

  const importDataset = async () => {
    setBusyKind('import');
    setError('');
    try {
      const importedContent = importFile ? await readImportFile(importFile, importKind) : { contentText: rowsText };
      const res = await fetch('/api/analytics/datasets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: datasetName,
          kind: importKind,
          url: importFile ? `file:///${encodeURIComponent(importFile.name)}` : undefined,
          contentType: importFile?.type || undefined,
          ...importedContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelectedDatasetId(data.dataset?.id ?? '');
      setProfile(data.profile);
      setSuggestions(data.suggestions ?? []);
      clearDatasetOperationPayload();
      setRowsText(JSON.stringify(data.dataset?.sampleRows ?? [], null, 2));
      await runStatistics(data.dataset?.sampleRows ?? []);
      await loadDatasets();
      await loadAnalyticsActivity();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setBusyKind('');
    }
  };

  const ensureDatasetId = async () => {
    if (selectedDatasetId) return selectedDatasetId;
    const dataset = await createDataset();
    return dataset.id;
  };

  const runWorkerAnalysis = async (kind: AnalyticsJobKindSummary) => {
    setBusyKind(kind);
    setError('');
    try {
      const datasetId = await ensureDatasetId();
      const res = await fetch(`/api/analytics/datasets/${datasetId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWorkerJob(data.job ?? null);
      setWorkerPayload(data.worker?.result ?? data.job?.result ?? null);
      if (kind === 'descriptive-statistics' && data.worker?.result?.numericColumns) {
        setStatistics(data.worker.result);
      }
      if (kind === 'profile' && data.worker?.result?.columns) {
        setProfile(data.worker.result);
      }
      await loadAnalyticsActivity();
    } catch (workerError) {
      setError(workerError instanceof Error ? workerError.message : String(workerError));
    } finally {
      setBusyKind('');
    }
  };

  const runDatasetValidation = async () => {
    setBusyKind('dataset-validate');
    setError('');
    try {
      const datasetId = await ensureDatasetId();
      const res = await fetch(`/api/datasets/${datasetId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProfile(data.profile ?? null);
      setSuggestions(data.suggestions ?? []);
      recordDatasetOperationPayload({
        operation: copy.validationResult,
        endpoint: `/api/datasets/${datasetId}/validate`,
        ...data,
      });
      await loadDatasets();
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : String(validationError));
    } finally {
      setBusyKind('');
    }
  };

  const runDatasetCleaning = async () => {
    setBusyKind('dataset-clean');
    setError('');
    try {
      const datasetId = await ensureDatasetId();
      const res = await fetch(`/api/datasets/${datasetId}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWorkerJob(data.job ?? null);
      setWorkerPayload(data.worker?.result ?? data.job?.result ?? data.result ?? null);
      recordDatasetOperationPayload({
        operation: copy.cleaningResult,
        endpoint: `/api/datasets/${datasetId}/clean`,
        ...data,
      });
      await loadAnalyticsActivity();
    } catch (cleaningError) {
      setError(cleaningError instanceof Error ? cleaningError.message : String(cleaningError));
    } finally {
      setBusyKind('');
    }
  };

  const runDatasetQuery = async () => {
    setBusyKind('dataset-query');
    setError('');
    try {
      const datasetId = await ensureDatasetId();
      const select = datasetQueryFields
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);
      const limit = Number.isFinite(Number(datasetQueryLimit)) ? Math.max(1, Math.floor(Number(datasetQueryLimit))) : 25;
      const res = await fetch(`/api/datasets/${datasetId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ select, limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      recordDatasetOperationPayload({
        operation: copy.queryResult,
        endpoint: `/api/datasets/${datasetId}/query`,
        select,
        limit,
        ...data,
      });
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : String(queryError));
    } finally {
      setBusyKind('');
    }
  };

  const rerunAnalysisJob = async (job: AnalyticsJobSummary) => {
    setBusyKind(`job-rerun-${job.id}`);
    setError('');
    try {
      const res = await fetch(`/api/analysis/jobs/${job.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWorkerJob(data.job ?? job);
      setWorkerPayload(data.worker?.result ?? data.job?.result ?? data.result ?? null);
      recordDatasetOperationPayload({
        operation: copy.jobRerunResult,
        endpoint: `/api/analysis/jobs/${job.id}/run`,
        ...data,
      });
      await loadAnalyticsActivity();
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : String(jobError));
    } finally {
      setBusyKind('');
    }
  };

  const cancelAnalysisJob = async (job: AnalyticsJobSummary) => {
    setBusyKind(`job-cancel-${job.id}`);
    setError('');
    try {
      const res = await fetch(`/api/analysis/jobs/${job.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWorkerJob(data.job ?? { ...job, status: 'cancelled' });
      recordDatasetOperationPayload({
        operation: copy.jobCancelResult,
        endpoint: `/api/analysis/jobs/${job.id}/cancel`,
        ...data,
      });
      await loadAnalyticsActivity();
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : String(jobError));
    } finally {
      setBusyKind('');
    }
  };

  const exportAnalyticsArtifact = async (artifact: AnalyticsArtifactSummary, format: string) => {
    const endpoint = artifact.artifactType === 'report'
      ? `/api/reports/${artifact.id}/export`
      : `/api/visualizations/${artifact.id}/export`;
    setBusyKind(`artifact-export-${artifact.id}-${format}`);
    setError('');
    try {
      const res = await fetch(`${endpoint}?format=${encodeURIComponent(format)}`);
      const contentType = res.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await res.json()
        : { body: await res.text() };
      if (!res.ok) throw new Error(isRecord(payload) && payload.error ? String(payload.error) : `HTTP ${res.status}`);
      recordDatasetOperationPayload({
        operation: copy.exportResult,
        endpoint,
        format,
        artifactId: artifact.id,
        artifactType: artifact.artifactType,
        ...payload,
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setBusyKind('');
    }
  };

  const materializeDataSource = async (dataset: AnalyticsDatasetSummary, rowIndex: number) => {
    const busyKey = `${dataset.id}-${rowIndex}`;
    setMaterializingSourceKey(busyKey);
    setError('');
    try {
      const res = await fetch(`/api/analytics/datasets/${dataset.id}/materialize-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex,
          name: `${dataset.name} / ${rowIndex + 1}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const nextDataset = data.dataset as AnalyticsDatasetSummary;
      setMaterializeResults((current) => [
        { rowIndex, ok: true, datasetId: nextDataset.id, datasetName: nextDataset.name, rows: nextDataset.rowCount },
        ...current.filter((item) => item.rowIndex !== rowIndex),
      ]);
      setSelectedDatasetId(nextDataset.id);
      setDatasetName(nextDataset.name);
      setRowsText(JSON.stringify(nextDataset.sampleRows ?? [], null, 2));
      setActivePage('dataset');
      setProfile(data.profile ?? null);
      setSuggestions(data.suggestions ?? []);
      recordDatasetOperationPayload({
        operation: copy.sourceMaterialized,
        endpoint: `/api/analytics/datasets/${dataset.id}/materialize-source`,
        sourceDatasetId: dataset.id,
        materializedDatasetId: nextDataset.id,
        rowCount: nextDataset.rowCount,
        fetched: data.fetched,
        extracted: data.extracted,
      });
      await runStatistics(nextDataset.sampleRows ?? []);
      await loadDatasets();
    } catch (sourceError) {
      setMaterializeResults((current) => [
        { rowIndex, ok: false, error: sourceError instanceof Error ? sourceError.message : String(sourceError) },
        ...current.filter((item) => item.rowIndex !== rowIndex),
      ]);
      setError(sourceError instanceof Error ? sourceError.message : String(sourceError));
    } finally {
      setMaterializingSourceKey('');
    }
  };

  const materializeDataSources = async (dataset: AnalyticsDatasetSummary) => {
    const limit = Math.min(8, Math.max(1, dataset.rowCount || dataset.sampleRows.length || 1));
    setMaterializingSourceKey(`${dataset.id}-batch`);
    setError('');
    try {
      const res = await fetch(`/api/analytics/datasets/${dataset.id}/materialize-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit,
          namePrefix: dataset.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const results = Array.isArray(data.results) ? data.results : [];
      const nextResults: MaterializeResultState[] = results.map((item: Record<string, unknown>) => {
        const datasetResult = isRecord(item.dataset) ? item.dataset as unknown as AnalyticsDatasetSummary : undefined;
        return {
          rowIndex: Number(item.rowIndex ?? 0),
          ok: Boolean(item.ok),
          datasetId: datasetResult?.id,
          datasetName: datasetResult?.name,
          rows: datasetResult?.rowCount,
          error: typeof item.error === 'string' ? item.error : undefined,
        };
      });
      setMaterializeResults(nextResults);
      const firstDataset = results.find((item: Record<string, unknown>) => item.ok && isRecord(item.dataset))?.dataset as AnalyticsDatasetSummary | undefined;
      if (firstDataset) {
        setSelectedDatasetId(firstDataset.id);
        setDatasetName(firstDataset.name);
        setRowsText(JSON.stringify(firstDataset.sampleRows ?? [], null, 2));
        await runStatistics(firstDataset.sampleRows ?? []);
      }
      recordDatasetOperationPayload({
        operation: copy.batchMaterialized,
        endpoint: `/api/analytics/datasets/${dataset.id}/materialize-sources`,
        sourceDatasetId: dataset.id,
        summary: data.summary,
        results: nextResults,
      });
      await loadDatasets();
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : String(sourceError));
    } finally {
      setMaterializingSourceKey('');
    }
  };

  const refreshMaterializedDataset = async () => {
    if (!selectedDataset || selectedDataset.sourceKind !== 'materialized-data-source') return;
    setBusyKind('materialized-refresh');
    setError('');
    try {
      const res = await fetch(`/api/analytics/datasets/${selectedDataset.id}/refresh-materialized-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${selectedDataset.name} / refresh`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const nextDataset = data.dataset as AnalyticsDatasetSummary;
      setSelectedDatasetId(nextDataset.id);
      setDatasetName(nextDataset.name);
      setRowsText(JSON.stringify(nextDataset.sampleRows ?? [], null, 2));
      setProfile(data.profile ?? null);
      setSuggestions(data.suggestions ?? []);
      recordDatasetOperationPayload({
        operation: copy.sourceRefreshed,
        endpoint: `/api/analytics/datasets/${selectedDataset.id}/refresh-materialized-source`,
        previousDatasetId: selectedDataset.id,
        refreshedDatasetId: nextDataset.id,
        rowCount: nextDataset.rowCount,
        refresh: data.refresh,
        fetched: data.fetched,
        extracted: data.extracted,
      });
      await runStatistics(nextDataset.sampleRows ?? []);
      await loadDatasets();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setBusyKind('');
    }
  };

  const renderVisualization = async (suggestionInput?: VisualizationSuggestionSummary) => {
    setBusyKind('visualization-render');
    setError('');
    try {
      const datasetId = await ensureDatasetId();
      const suggestion = suggestionInput ?? suggestions[0];
      if (!suggestion) throw new Error('visualization suggestion required');
      const res = await fetch('/api/analytics/visualizations/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, suggestion, title: suggestion.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVisualizationArtifact(data.artifact ?? null);
      await loadAnalyticsActivity();
    } catch (chartError) {
      setError(chartError instanceof Error ? chartError.message : String(chartError));
    } finally {
      setBusyKind('');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F1EFE7] text-[#151515]">
      <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
        <header className="border-2 border-[#151515] bg-[#F9F7EF]">
          <div className="grid gap-4 border-b-2 border-[#151515] p-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
            <div>
              <div className="mb-3 font-mono text-xs uppercase tracking-[0.32em] text-[#567068]">{copy.subtitle}</div>
              <h1 className="font-serif text-5xl leading-none lg:text-7xl">{copy.title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-stone-700">{copy.hero}</p>
              <div className="mt-4 inline-flex items-center gap-2 border border-stone-300 bg-white px-3 py-2 font-mono text-[10px] uppercase">
                {activePageMeta.icon}
                {activePageMeta.label}
              </div>
            </div>
            <div className="grid grid-cols-3 border-2 border-[#151515] bg-white">
              <StatusTile label={copy.datasets} value={datasets.length} />
              <StatusTile label={copy.jobs} value={jobs.length} />
              <StatusTile label={copy.artifacts} value={artifacts.length} />
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto p-3">
            {labPages.map((page) => (
              <button
                key={page.id}
                onClick={() => setActivePage(page.id)}
                className={`min-w-[9.5rem] shrink-0 border px-3 py-2 text-left transition ${activePage === page.id ? 'border-[#151515] bg-[#151515] text-white' : 'border-stone-300 bg-white hover:border-[#151515]'}`}
              >
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                  {page.icon}
                  {page.label}
                </div>
                <div className={`mt-1 text-[11px] leading-4 ${activePage === page.id ? 'text-stone-200' : 'text-stone-500'}`}>{page.hint}</div>
              </button>
            ))}
          </nav>
        </header>

        {error && (
          <div className="mt-4 border-2 border-[#A43D2C] bg-[#FFE9E1] px-4 py-3 font-mono text-xs text-[#762313]">
            {error}
          </div>
        )}

        <main className="mt-5 space-y-5">
          {activePage === 'home' && (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {labPages.filter((page) => page.id !== 'home' && page.id !== 'system').slice(0, 7).map((page) => (
                  <button key={page.id} onClick={() => setActivePage(page.id)} className="border-2 border-[#151515] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#151515]">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center border-2 border-[#151515] bg-[#E6F2EF]">{page.icon}</div>
                    <div className="font-serif text-2xl leading-tight">{page.label}</div>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{page.hint}</p>
                  </button>
                ))}
              </div>
              <section className="grid gap-5 lg:grid-cols-3">
                <ListPanel title={copy.datasets} empty={copy.empty}>
                  {datasets.slice(0, 5).map((dataset) => (
                    <button key={dataset.id} onClick={() => { selectDatasetSummary(dataset); setActivePage('dataset'); }} className="w-full border border-stone-300 bg-white p-3 text-left hover:border-[#151515]">
                      <div className="font-mono text-[10px] uppercase text-stone-500">{dataset.sourceKind} / {dataset.rowCount} x {dataset.columnCount}</div>
                      <div className="mt-1 truncate font-serif text-lg">{dataset.name}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(dataset.createdAt)}</div>
                    </button>
                  ))}
                </ListPanel>
                <ListPanel title={copy.jobs} empty={copy.empty}>
                  {jobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="border border-stone-300 bg-white p-3">
                      <div className="font-mono text-[10px] uppercase text-stone-500">{job.kind} / {job.status}</div>
                      <div className="mt-1 font-serif text-lg">{job.id.slice(0, 8)}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(job.createdAt)}</div>
                    </div>
                  ))}
                </ListPanel>
                <ListPanel title={copy.artifacts} empty={copy.empty}>
                  {artifacts.slice(0, 5).map((artifact) => (
                    <div key={artifact.id} className="border border-stone-300 bg-white p-3">
                      <div className="font-mono text-[10px] uppercase text-stone-500">{artifact.artifactType}</div>
                      <div className="mt-1 truncate font-serif text-lg">{artifact.title}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(artifact.createdAt)}</div>
                    </div>
                  ))}
                </ListPanel>
              </section>
            </section>
          )}

          {activePage === 'import' && (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
              <Panel title={copy.ingest} icon={<Upload size={18} />} accent="#B9472A">
                <div className="space-y-3">
                  <input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder={copy.datasetName} className="w-full border-2 border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#151515]" />
                  <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                    <select value={importKind} onChange={(event) => setImportKind(event.target.value)} className="border-2 border-stone-300 bg-white px-3 py-2 text-xs font-mono uppercase outline-none focus:border-[#151515]" aria-label={copy.importKind}>
                      {['json', 'jsonl', 'csv', 'html', 'table', 'excel', 'parquet', 'geojson', 'txt', 'md', 'pdf', 'docx', 'pptx'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                    <label className="flex cursor-pointer items-center justify-between gap-3 border-2 border-stone-300 bg-white px-3 py-2 text-xs font-mono uppercase hover:border-[#151515]">
                      <span className="inline-flex items-center gap-2"><Upload size={14} />{copy.chooseFile}</span>
                      <span className="truncate text-[10px] normal-case text-stone-500">{importFile ? importFile.name : copy.noFile}</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setImportFile(file);
                          if (file) {
                            setDatasetName(file.name.replace(/\.[^.]+$/, '') || file.name);
                            setImportKind(inferImportKind(file.name, importKind));
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.importFormats}</div>
                  <textarea value={rowsText} onChange={(event) => setRowsText(event.target.value)} className="min-h-64 w-full border-2 border-stone-300 bg-[#FFFCF4] p-3 font-mono text-xs leading-5 outline-none focus:border-[#151515]" aria-label={copy.manualRows} />
                  <div className="grid gap-2 sm:grid-cols-4">
                    <ActionButton active={busyKind === 'import'} onClick={importDataset} icon={<Upload size={14} />} label={copy.importDataset} tone="dark" />
                    <ActionButton active={busyKind === 'save'} onClick={saveDataset} icon={<Database size={14} />} label={copy.saveManual} />
                    <ActionButton active={busyKind === 'profile'} onClick={runProfile} icon={<Rows3 size={14} />} label={copy.profile} />
                    <ActionButton active={busyKind === 'stats'} onClick={() => runStatistics()} icon={<BarChart3 size={14} />} label={copy.stats} />
                  </div>
                </div>
              </Panel>
              <Panel title={copy.selectedDataset} icon={<Database size={18} />} accent="#16605D">
                {selectedDataset ? <DatasetSummaryBlock dataset={selectedDataset} profile={profile} copy={copy} /> : <EmptyBlock text={copy.noDataset} />}
              </Panel>
            </section>
          )}

          {activePage === 'dataset' && (
            <section className="space-y-5">
              <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title={copy.selectedDataset} icon={<Database size={18} />} accent="#16605D">
                  {selectedDataset ? <DatasetSummaryBlock dataset={selectedDataset} profile={profile} copy={copy} /> : <EmptyBlock text={copy.noDataset} />}
                </Panel>
                <Panel title={copy.datasetWorkbench} icon={<Database size={18} />} accent="#6C4AB6">
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-stone-600">{copy.datasetWorkbenchHint}</p>
                    {selectedDataset && runIdFromDataset(selectedDataset) && onOpenResearchRun && (
                      <button onClick={() => onOpenResearchRun(runIdFromDataset(selectedDataset))} className="inline-flex min-h-9 items-center gap-2 border border-[#151515] px-3 py-2 font-mono text-[10px] uppercase hover:bg-[#151515] hover:text-white">
                        <ExternalLink size={13} />{copy.openResearchRun}
                      </button>
                    )}
                    {selectedDataset?.sourceKind === 'materialized-data-source' && (
                      <div className="border border-[#16605D] bg-[#E6F2EF] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.snapshotLineage}</div>
                            <p className="mt-1 text-sm leading-6 text-stone-700">{copy.refreshSourceHint}</p>
                            <div className="mt-2 break-all font-mono text-[10px] text-stone-600">{sourceUrlFromDataset(selectedDataset)}</div>
                          </div>
                          <button onClick={refreshMaterializedDataset} disabled={busyKind === 'materialized-refresh'} className="inline-flex min-h-9 items-center gap-2 border-2 border-[#16605D] bg-white px-3 py-2 font-mono text-[10px] uppercase text-[#16605D] hover:bg-[#16605D] hover:text-white disabled:opacity-60">
                            {busyKind === 'materialized-refresh' ? <Activity size={13} className="animate-spin" /> : <RefreshCw size={13} />}{copy.refreshMaterializedSource}
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <MiniMetric label={copy.snapshotVersion} value={materializedVersionFromDataset(selectedDataset)} />
                          <MiniMetric label={copy.rows} value={selectedDataset.rowCount} />
                          <MiniMetric label={copy.storage} value={String((selectedDataset.metadata?.storage as Record<string, unknown> | undefined)?.rowStorage ?? 'postgres')} />
                        </div>
                        <div className="mt-3 border border-[#16605D]/40 bg-white/70 p-2">
                          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#16605D]">{copy.versionHistory}</div>
                          {selectedVersionHistory.length > 1 ? (
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {selectedVersionHistory.map((version) => (
                                <button
                                  key={version.id}
                                  onClick={() => selectDatasetSummary(version)}
                                  className={`shrink-0 border px-3 py-2 text-left ${version.id === selectedDataset.id ? 'border-[#16605D] bg-[#E6F2EF]' : 'border-stone-300 bg-white hover:border-[#16605D]'}`}
                                >
                                  <div className="font-mono text-[10px] uppercase text-stone-500">v{materializedVersionFromDataset(version)} / {version.rowCount} {copy.rows}</div>
                                  <div className="max-w-52 truncate text-xs">{version.id}</div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-stone-500">{copy.noVersionHistory}</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <ActionButton active={busyKind === 'dataset-validate'} onClick={runDatasetValidation} icon={<Activity size={14} />} label={copy.validateDataset} tone="dark" />
                      <ActionButton active={busyKind === 'dataset-clean'} onClick={runDatasetCleaning} icon={<GitBranch size={14} />} label={copy.cleanDataset} />
                      <ActionButton active={busyKind === 'dataset-query'} onClick={runDatasetQuery} icon={<TableProperties size={14} />} label={copy.queryDataset} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                      <input value={datasetQueryFields} onChange={(event) => setDatasetQueryFields(event.target.value)} placeholder={copy.queryFieldsPlaceholder} aria-label={copy.queryFields} className="w-full border-2 border-stone-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#151515]" />
                      <input value={datasetQueryLimit} onChange={(event) => setDatasetQueryLimit(event.target.value)} aria-label={copy.queryLimit} inputMode="numeric" className="w-full border-2 border-stone-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#151515]" />
                    </div>
                    <DatasetOperationResult payload={datasetOperationPayload} history={datasetOperationHistory} empty={copy.resultHint} labels={{ operationResult: copy.operationResult, operationHistory: copy.operationHistory, rawJson: copy.rawJson, rows: copy.rows, warnings: copy.warnings }} />
                  </div>
                </Panel>
              </section>
              <section className="grid gap-5 lg:grid-cols-2">
                <Panel title={copy.columns} icon={<TableProperties size={18} />} accent="#16605D"><ColumnProfile profile={profile} empty={copy.empty} copy={copy} /></Panel>
                <Panel title={copy.statistics} icon={<FlaskConical size={18} />} accent="#B9472A"><StatisticsTable statistics={statistics} empty={copy.empty} copy={copy} /></Panel>
              </section>
              {profile?.warnings.length ? <Panel title={copy.warnings} icon={<Activity size={18} />} accent="#B9472A"><ul className="space-y-2 text-sm leading-6">{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Panel> : null}
            </section>
          )}

          {activePage === 'wizard' && (
            <DataLabAnalysisWizard language={language} copy={copy} dataset={selectedDataset} profile={profile} suggestions={suggestions} busyKind={busyKind} onRunAnalysis={runWorkerAnalysis} onRenderVisualization={renderVisualization} />
          )}

          {activePage === 'analysis' && (
            <section className="space-y-5">
              <section className="border-2 border-[#151515] bg-[#F9F7EF]">
                <div className="flex items-center justify-between border-b-2 border-[#151515] px-4 py-3">
                  <h2 className="flex items-center gap-2 font-serif text-2xl italic"><Sparkles size={18} />{copy.pipelines}</h2>
                  <button onClick={loadAll} className="inline-flex items-center gap-2 border border-stone-400 px-3 py-2 font-mono text-[10px] uppercase hover:bg-white"><RefreshCw size={13} />{copy.refresh}</button>
                </div>
                <div className="grid gap-0 lg:grid-cols-2">
                  {toolGroups.map((group) => (
                    <div key={group.id} className="border-b border-r border-stone-300 p-4">
                      <div className="mb-3 flex items-end justify-between gap-3">
                        <div><div className="font-mono text-[10px] uppercase tracking-[0.24em]" style={{ color: group.accent }}>{group.eyebrow}</div><h3 className="mt-1 font-serif text-2xl">{group.title}</h3></div>
                        <div className="h-9 w-9 border-2 border-[#151515]" style={{ background: group.accent }} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.tools.map((tool) => (
                          <button key={tool.kind} onClick={() => runWorkerAnalysis(tool.kind)} className="group border border-stone-300 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#151515] hover:shadow-[4px_4px_0_#151515]" title={tool.kind}>
                            <div className="mb-2 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">{tool.icon}{tool.kind}</span>{busyKind === tool.kind ? <Activity size={13} className="animate-spin" /> : <Play size={13} />}</div>
                            <div className="font-serif text-lg leading-tight">{tool.label}</div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{tool.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <WorkerResultPanel workerJob={workerJob} workerPayload={workerPayload} visualizationArtifact={visualizationArtifact} datasetOperationPayload={datasetOperationPayload} datasetOperationHistory={datasetOperationHistory} copy={copy} />
            </section>
          )}

          {activePage === 'visuals' && (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
              <WorkerResultPanel workerJob={workerJob} workerPayload={workerPayload} visualizationArtifact={visualizationArtifact} datasetOperationPayload={datasetOperationPayload} datasetOperationHistory={datasetOperationHistory} copy={copy} />
              <Panel title={copy.chartSuggestions} icon={<LineChart size={18} />} accent="#6C4AB6">
                <div className="space-y-2">
                  {suggestions.length === 0 ? <p className="text-sm text-stone-500">{copy.empty}</p> : suggestions.slice(0, 8).map((suggestion) => (
                    <button key={suggestion.id} onClick={() => renderVisualization(suggestion)} className="w-full border border-stone-300 bg-white p-3 text-left hover:border-[#151515]">
                      <div className="font-mono text-[10px] uppercase text-stone-500">{suggestion.kind} / {suggestion.engine}</div>
                      <div className="mt-1 font-serif text-lg">{suggestion.title}</div>
                      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] uppercase text-stone-500"><span>{suggestion.exportFormats.join(' / ')}</span><span className="inline-flex items-center gap-1"><Play size={12} />{copy.renderChart}</span></div>
                    </button>
                  ))}
                </div>
              </Panel>
            </section>
          )}

          {activePage === 'sources' && (
            <section className="space-y-5">
              {activeDataSourceDataset && activeDataSourceRunId && onOpenResearchRun && (
                <div className="flex flex-col gap-3 border-2 border-[#151515] bg-[#E6F2EF] p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.linkedRun}</div>
                    <div className="mt-1 break-all font-mono text-xs text-stone-700">{activeDataSourceRunId}</div>
                  </div>
                  <button onClick={() => onOpenResearchRun(activeDataSourceRunId)} className="inline-flex min-h-9 items-center justify-center gap-2 border border-[#151515] bg-white px-3 py-2 font-mono text-[10px] uppercase hover:bg-[#151515] hover:text-white">
                    <ExternalLink size={13} />{copy.openResearchRun}
                  </button>
                </div>
              )}
              <DataSourceRegistryPanel dataset={activeDataSourceDataset} datasets={dataSourceDatasets} copy={copy} materializingKey={materializingSourceKey} onSelect={(dataset) => selectDatasetSummary(dataset)} onMaterialize={materializeDataSource} onMaterializeBatch={materializeDataSources} materializeResults={materializeResults} />
              <DatasetOperationResult payload={datasetOperationPayload} history={datasetOperationHistory} empty={copy.resultHint} labels={{ operationResult: copy.operationResult, operationHistory: copy.operationHistory, rawJson: copy.rawJson, rows: copy.rows, warnings: copy.warnings }} />
            </section>
          )}

          {activePage === 'activity' && (
            <section className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <ListPanel title={copy.datasets} empty={copy.empty}>
                  {datasets.slice(0, 20).map((dataset) => (
                    <button key={dataset.id} onClick={() => { selectDatasetSummary(dataset); setActivePage('dataset'); }} className={`w-full border p-3 text-left hover:border-[#151515] ${selectedDatasetId === dataset.id ? 'border-[#151515] bg-[#E6F2EF]' : 'border-stone-300 bg-white'}`}>
                      <div className="font-mono text-[10px] uppercase text-stone-500">{dataset.sourceKind} / {dataset.rowCount} x {dataset.columnCount}</div>
                      <div className="mt-1 truncate font-serif text-lg">{dataset.name}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(dataset.createdAt)}</div>
                    </button>
                  ))}
                </ListPanel>
                <ListPanel title={copy.jobs} empty={copy.empty}>
                  {jobs.slice(0, 20).map((job) => (
                    <div key={job.id} className="border border-stone-300 bg-white p-3">
                      <div className="font-mono text-[10px] uppercase text-stone-500">{job.kind} / {job.status}</div>
                      <div className="mt-1 font-serif text-lg">{job.id.slice(0, 8)}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(job.createdAt)}</div>
                      <div className="mt-3 border-t border-stone-200 pt-2">
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.jobActions}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => rerunAnalysisJob(job)} disabled={busyKind === `job-rerun-${job.id}`} className="inline-flex min-h-9 items-center justify-center gap-2 border border-stone-300 px-2 py-1 font-mono text-[10px] uppercase hover:border-[#151515] disabled:opacity-60">{busyKind === `job-rerun-${job.id}` ? <Activity size={12} className="animate-spin" /> : <RefreshCw size={12} />}{copy.rerunJob}</button>
                          <button onClick={() => cancelAnalysisJob(job)} disabled={busyKind === `job-cancel-${job.id}` || job.status === 'cancelled'} className="inline-flex min-h-9 items-center justify-center gap-2 border border-stone-300 px-2 py-1 font-mono text-[10px] uppercase hover:border-[#151515] disabled:opacity-60">{busyKind === `job-cancel-${job.id}` ? <Activity size={12} className="animate-spin" /> : <Activity size={12} />}{copy.cancelJob}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </ListPanel>
                <ListPanel title={copy.artifacts} empty={copy.empty}>
                  {artifacts.slice(0, 20).map((artifact) => (
                    <div key={artifact.id} className="border border-stone-300 bg-white p-3">
                      <div className="font-mono text-[10px] uppercase text-stone-500">{artifact.artifactType}</div>
                      <div className="mt-1 truncate font-serif text-lg">{artifact.title}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(artifact.createdAt)}</div>
                      {artifactExportFormats(artifact).length > 0 && <div className="mt-3 border-t border-stone-200 pt-2"><div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.exportArtifact}</div><div className="flex flex-wrap gap-2">{artifactExportFormats(artifact).map((format) => <button key={`${artifact.id}-${format}`} onClick={() => exportAnalyticsArtifact(artifact, format)} disabled={busyKind === `artifact-export-${artifact.id}-${format}`} className="inline-flex min-h-8 items-center gap-1 border border-stone-300 px-2 py-1 font-mono text-[10px] uppercase hover:border-[#151515] disabled:opacity-60">{busyKind === `artifact-export-${artifact.id}-${format}` ? <Activity size={11} className="animate-spin" /> : <Download size={11} />}{format}</button>)}</div></div>}
                    </div>
                  ))}
                </ListPanel>
              </div>
              <DatasetOperationResult payload={datasetOperationPayload} history={datasetOperationHistory} empty={copy.resultHint} labels={{ operationResult: copy.operationResult, operationHistory: copy.operationHistory, rawJson: copy.rawJson, rows: copy.rows, warnings: copy.warnings }} />
            </section>
          )}

          {activePage === 'system' && (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
              <Panel title={copy.apiSurface} icon={<Network size={18} />} accent="#16605D">
                <p className="mb-3 text-xs leading-5 text-stone-600">{copy.apiSurfaceHint}</p>
                <div className="space-y-2">{apiEndpoints.map((endpoint) => <div key={endpoint.path} className="border border-stone-300 bg-white p-3"><div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{endpoint.method}</div><div className="mt-1 break-all font-mono text-xs">{endpoint.path}</div><div className="mt-2 text-xs leading-5 text-stone-600">{endpoint.description}</div></div>)}</div>
              </Panel>
              <ListPanel title={copy.capabilities} empty={copy.empty}>
                {capabilities.map((capability) => <div key={capability.id} className="border border-stone-300 bg-white p-3"><div className="font-mono text-[10px] uppercase text-stone-500">{capability.kind} / {capability.status}</div><div className="mt-1 font-serif text-lg">{capability.title}</div><p className="mt-1 text-xs leading-5 text-stone-600">{capability.description}</p><div className="mt-2 flex flex-wrap gap-1">{capability.engines.slice(0, 5).map((engine) => <span key={engine} className="border border-stone-300 px-2 py-1 font-mono text-[10px]">{engine}</span>)}</div></div>)}
              </ListPanel>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

function buildApiSurface(language: Language) {
  const zh = language === 'zh';
  return [
    {
      method: 'GET / POST',
      path: '/api/datasets',
      description: zh ? '数据集列表、创建、画像、验证、清洗和查询的兼容入口。' : 'Compatibility entry for dataset listing, creation, profiling, validation, cleaning, and querying.',
    },
    {
      method: 'POST',
      path: '/api/analytics/datasets/from-research-run/:runId/data-sources',
      description: zh ? '把 Research run 的数据源 provider、frontier 和候选 URL 导入为 Data Lab 数据源资产清单。' : 'Import research data-source providers, frontier items, and candidate URLs into a Data Lab source asset registry.',
    },
    {
      method: 'POST',
      path: '/api/analytics/datasets/:id/materialize-source',
      description: zh ? '从数据源资产清单中抓取一行 URL，解析 CSV / JSON / API 快照并保存为可分析数据集。' : 'Fetch one URL from a source registry, parse a CSV / JSON / API snapshot, and save it as an analyzable dataset.',
    },
    {
      method: 'POST',
      path: '/api/analytics/datasets/:id/materialize-sources',
      description: zh ? '批量抓取数据源资产清单中的 URL，逐行返回成功/失败，并把成功项保存成独立数据集。' : 'Batch fetch source-registry URLs, return per-row success/failure states, and save successful rows as independent datasets.',
    },
    {
      method: 'POST',
      path: '/api/analytics/datasets/:id/refresh-materialized-source',
      description: zh ? '刷新已导入的数据源快照，创建带版本 lineage 的新数据集，不覆盖旧快照。' : 'Refresh an imported source snapshot into a new versioned dataset without overwriting the previous snapshot.',
    },
    {
      method: 'GET / POST',
      path: '/api/analysis/jobs',
      description: zh ? '分析任务列表、创建、查看、重跑和取消入口。' : 'Analysis job list, create, inspect, rerun, and cancel entrypoints.',
    },
    {
      method: 'GET / POST',
      path: '/api/visualizations',
      description: zh ? '生成、查看、渲染和导出可视化 artifact。' : 'Create, inspect, render, and export visualization artifacts.',
    },
	    {
	      method: 'GET / POST',
	      path: '/api/reports',
	      description: zh ? '生成、查看、渲染和导出 Markdown / HTML / DOCX / PDF / PPTX 报告。' : 'Create, inspect, render, and export Markdown / HTML / DOCX / PDF / PPTX reports.',
	    },
	    {
	      method: 'POST',
	      path: '/api/news-analysis/runs/:runId/cluster',
	      description: zh ? '把 Research run 文档导入 Data Lab 新闻 worker，生成同题聚类和重复内容统计。' : 'Import Research run documents into the Data Lab news worker for story clusters and duplicate counts.',
	    },
	    {
	      method: 'POST',
	      path: '/api/news-analysis/runs/:runId/timeline',
	      description: zh ? '基于 Research run 文档生成事件时间线，并保存为 Analytics job/artifact。' : 'Generate an event timeline from Research run documents and persist an Analytics job/artifact.',
	    },
	    {
	      method: 'POST',
	      path: '/api/news-analysis/runs/:runId/source-quality',
	      description: zh ? '汇总 Research run 的来源分层、官方概率、主流概率和文档覆盖。' : 'Summarize Research run source tiers, official likelihood, mainstream likelihood, and document coverage.',
	    },
	  ];
	}

function buildToolGroups(language: Language): ToolGroup[] {
  const zh = language === 'zh';
  return [
    {
      id: 'prepare',
      title: zh ? '清洗、质量与转换' : 'Cleaning and transformation',
      eyebrow: zh ? '数据处理' : 'processing',
      accent: '#16605D',
      tools: [
        { kind: 'profile', label: zh ? '数据画像' : 'Profile', description: zh ? '字段类型、缺失率、唯一值、质量分。' : 'Types, missingness, uniqueness, quality score.', icon: <Rows3 size={13} /> },
        { kind: 'quality-report', label: zh ? '质量门' : 'Quality gate', description: zh ? '重复、混合类型、缺失值和字段分。' : 'Duplicates, mixed types, missing values.', icon: <Activity size={13} /> },
        { kind: 'data-cleaning', label: zh ? '清洗与 lineage' : 'Cleaning and lineage', description: zh ? '去重、填补、单位提示和可追溯清洗链。' : 'Deduping, imputation, unit hints, lineage.', icon: <GitBranch size={13} /> },
        { kind: 'data-transformation', label: zh ? 'Groupby / Pivot / Rolling' : 'Groupby / pivot / rolling', description: zh ? '聚合、透视、滚动统计和 join key 识别。' : 'Aggregation, pivoting, rolling stats, join keys.', icon: <TableProperties size={13} /> },
      ],
    },
    {
      id: 'statistics',
      title: zh ? 'SPSS Pro 级统计' : 'SPSS-grade statistics',
      eyebrow: zh ? '统计建模' : 'statistics',
      accent: '#B9472A',
      tools: [
        { kind: 'descriptive-statistics', label: zh ? '描述统计' : 'Descriptive stats', description: zh ? '均值、中位数、标准差、相关矩阵。' : 'Mean, median, std, correlations.', icon: <BarChart3 size={13} /> },
        { kind: 'frequency-tables', label: zh ? '频数表' : 'Frequency tables', description: zh ? '分类值分布、比例和 Top 值。' : 'Categorical counts, percentages, top values.', icon: <Rows3 size={13} /> },
        { kind: 'crosstab', label: zh ? '交叉表' : 'Crosstab', description: zh ? '两个分类变量的列联表。' : 'Contingency tables for categories.', icon: <TableProperties size={13} /> },
        { kind: 'statistical-tests', label: zh ? '检验 / ANOVA / 非参' : 'Tests / ANOVA / nonparametric', description: zh ? 't 检验、卡方、ANOVA、Kruskal、Spearman。' : 't-test, chi-square, ANOVA, Kruskal, Spearman.', icon: <FlaskConical size={13} /> },
      ],
    },
    {
      id: 'modeling',
      title: zh ? '机器学习与深度分析' : 'Machine learning and deep analysis',
      eyebrow: zh ? 'ML / AI' : 'ml / ai',
      accent: '#6C4AB6',
      tools: [
        { kind: 'linear-regression', label: zh ? '线性回归' : 'Linear regression', description: zh ? '系数、R²、残差摘要。' : 'Coefficients, R², residual summary.', icon: <LineChart size={13} /> },
        { kind: 'logistic-regression', label: zh ? '逻辑回归' : 'Logistic regression', description: zh ? '二分类目标、系数和准确率。' : 'Binary target, coefficients, accuracy.', icon: <BrainCircuit size={13} /> },
        { kind: 'poisson-regression', label: zh ? '泊松回归' : 'Poisson regression', description: zh ? '计数型目标的 GLM 分析。' : 'GLM for count outcomes.', icon: <FlaskConical size={13} /> },
        { kind: 'dimensionality-reduction', label: zh ? 'PCA / 因子分析' : 'PCA / factor analysis', description: zh ? '降维、载荷和得分预览。' : 'Dimensionality reduction and loadings.', icon: <Network size={13} /> },
        { kind: 'cluster-analysis', label: zh ? '聚类分析' : 'Cluster analysis', description: zh ? 'KMeans 聚类、中心点和样本分配。' : 'KMeans clusters, centroids, assignments.', icon: <Network size={13} /> },
        { kind: 'anomaly-detection', label: zh ? '异常检测' : 'Anomaly detection', description: zh ? 'z-score 与 IsolationForest 异常信号。' : 'z-score and IsolationForest signals.', icon: <Activity size={13} /> },
        { kind: 'model-explanation', label: zh ? '模型解释' : 'Model explanation', description: zh ? '特征重要性和 SHAP 升级路径。' : 'Feature importance and SHAP upgrade path.', icon: <Sparkles size={13} /> },
        { kind: 'deep-learning-analysis', label: zh ? 'PyTorch / Embedding' : 'PyTorch / embedding', description: zh ? '深度学习环境检测、TF-IDF embedding、文本聚类和监督基线。' : 'DL readiness, TF-IDF embedding, text clusters, supervised baseline.', icon: <BrainCircuit size={13} /> },
      ],
    },
    {
      id: 'research',
      title: zh ? '新闻、文本和地理数据' : 'News, text, and geo data',
      eyebrow: zh ? '研究整理' : 'research',
      accent: '#7E5130',
      tools: [
        { kind: 'news-organization', label: zh ? '新闻整理' : 'News organization', description: zh ? '去重、同题聚类、来源分层、时间线和冲突信号。' : 'Deduping, clustering, source tiers, timeline, conflicts.', icon: <FileJson size={13} /> },
        { kind: 'text-analysis', label: zh ? '文本主题' : 'Text topics', description: zh ? '关键词、主题聚类和 embedding 升级说明。' : 'Keywords, topic clusters, embedding path.', icon: <BrainCircuit size={13} /> },
        { kind: 'time-series-analysis', label: zh ? '时间序列' : 'Time series', description: zh ? '趋势、滚动均值和自相关。' : 'Trend, rolling mean, autocorrelation.', icon: <LineChart size={13} /> },
        { kind: 'geospatial-analysis', label: zh ? '地理分析' : 'Geospatial analysis', description: zh ? '经纬度识别、bbox 和 GeoJSON。' : 'Lat/lon detection, bbox, GeoJSON.', icon: <Network size={13} /> },
      ],
    },
    {
      id: 'outputs',
      title: zh ? '论文图、工程图和报告' : 'Charts, diagrams, and reports',
      eyebrow: zh ? '输出交付' : 'outputs',
      accent: '#151515',
      tools: [
        { kind: 'publication-chart', label: zh ? '论文图资产' : 'Publication chart', description: zh ? 'Matplotlib PNG/SVG/PDF，适合论文制图。' : 'Matplotlib PNG/SVG/PDF assets.', icon: <BarChart3 size={13} /> },
        { kind: 'report-draft', label: zh ? '中文报告草稿' : 'Report draft', description: zh ? '数据概况、统计摘要、质量提示和建议。' : 'Overview, stats, quality notes, next steps.', icon: <FileJson size={13} /> },
        { kind: 'export-report', label: zh ? 'MD / HTML / DOCX / PDF / PPTX' : 'MD / HTML / DOCX / PDF / PPTX', description: zh ? '正式报告和汇报稿导出，可下载。' : 'Export downloadable report packages.', icon: <Download size={13} /> },
      ],
    },
  ];
}

const Panel: React.FC<{ title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }> = ({ title, icon, accent, children }) => (
  <section className="border-2 border-[#151515] bg-[#F9F7EF]">
    <div className="flex items-center justify-between border-b-2 border-[#151515] px-4 py-3">
      <h2 className="flex items-center gap-2 font-serif text-2xl italic">{icon}{title}</h2>
      <span className="h-3 w-14 border border-[#151515]" style={{ background: accent }} />
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const ListPanel: React.FC<{ title: string; empty: string; children: React.ReactNode }> = ({ title, empty, children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <section className="border-2 border-[#151515] bg-[#F9F7EF]">
      <div className="border-b-2 border-[#151515] px-4 py-3 font-serif text-xl italic">{title}</div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-3">
        {items.length ? items : <p className="font-mono text-xs text-stone-500">{empty}</p>}
      </div>
    </section>
  );
};

const DataSourceRegistryPanel: React.FC<{
  dataset: AnalyticsDatasetSummary | undefined;
  datasets: AnalyticsDatasetSummary[];
  copy: typeof text.zh | typeof text.en;
  materializingKey: string;
  materializeResults: MaterializeResultState[];
  onSelect: (dataset: AnalyticsDatasetSummary) => void;
  onMaterialize: (dataset: AnalyticsDatasetSummary, rowIndex: number) => void;
  onMaterializeBatch: (dataset: AnalyticsDatasetSummary) => void;
}> = ({ dataset, datasets, copy, materializingKey, materializeResults, onSelect, onMaterialize, onMaterializeBatch }) => {
  const [filterText, setFilterText] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [minQuality, setMinQuality] = useState(0);
  const rows = (dataset?.sampleRows ?? []).filter(isRecord);
  const summary = isRecord(dataset?.metadata?.summary) ? dataset?.metadata?.summary : undefined;
  const providerTypes = Array.isArray(summary?.providerTypes) ? summary.providerTypes.map(String) : [];
  const sourceTypes = Array.isArray(summary?.sourceTypes) ? summary.sourceTypes.map(String) : [];
  const providerOptions = uniqueStrings(rows.map((row) => String(row.provider_type ?? row.provider ?? '')).filter(Boolean));
  const formatOptions = uniqueStrings(rows.map((row) => String(row.format_hint ?? '')).filter(Boolean));
  const filteredRows = rows.filter((row) => {
    const haystack = [row.title, row.url, row.provider, row.provider_type, row.query, row.source_type].map((value) => String(value ?? '').toLowerCase()).join(' ');
    const quality = Number(row.source_quality_score ?? 0);
    return (
      (!filterText.trim() || haystack.includes(filterText.trim().toLowerCase())) &&
      (!providerFilter || String(row.provider_type ?? row.provider ?? '') === providerFilter) &&
      (!formatFilter || String(row.format_hint ?? '') === formatFilter) &&
      quality >= minQuality
    );
  });
  const resultByRow = new Map(materializeResults.map((item) => [item.rowIndex, item]));
  const succeeded = materializeResults.filter((item) => item.ok).length;
  const failed = materializeResults.filter((item) => !item.ok).length;

  return (
    <Panel title={copy.dataSourceRegistry} icon={<Database size={18} />} accent="#16605D">
      {!dataset ? (
        <div className="border border-dashed border-stone-300 bg-white/60 p-6 text-sm leading-6 text-stone-600">
          {copy.dataSourceRegistryEmpty}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{dataset.sourceKind}</div>
              <div className="mt-1 font-serif text-2xl leading-tight">{dataset.name}</div>
              <div className="mt-2 break-all font-mono text-[10px] text-stone-500">{dataset.sourceRef ?? dataset.id}</div>
            </div>
            <div className="grid grid-cols-3 border-2 border-[#151515] bg-white">
              <StatusTile label={copy.rows} value={dataset.rowCount} />
              <StatusTile label={copy.providerType} value={providerTypes.length || '-'} />
              <StatusTile label={copy.sourceType} value={sourceTypes.length || '-'} />
            </div>
          </div>

          <div className="grid gap-3 border border-stone-300 bg-[#F4F7F2] p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.materializeStatus}</div>
              <div className="mt-1 text-sm leading-6 text-stone-700">{copy.materializeBatchHint}</div>
              <div className="mt-1 text-xs leading-5 text-stone-500">{copy.sourcePolicy}</div>
              {materializeResults.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase">
                  <span className="border border-emerald-700 bg-white px-2 py-1 text-emerald-800">{copy.materializeSucceeded}: {succeeded}</span>
                  <span className="border border-red-700 bg-white px-2 py-1 text-red-800">{copy.materializeFailed}: {failed}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => onMaterializeBatch(dataset)}
              disabled={materializingKey === `${dataset.id}-batch`}
              className="inline-flex min-h-10 items-center justify-center gap-2 border-2 border-[#151515] bg-[#151515] px-4 py-2 font-mono text-[10px] uppercase text-white shadow-[3px_3px_0_#C6D8D2] disabled:opacity-60"
            >
              {materializingKey === `${dataset.id}-batch` ? <Activity size={13} className="animate-spin" /> : <Download size={13} />}
              {copy.materializeBatch}
            </button>
          </div>

          {datasets.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {datasets.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={`shrink-0 border px-3 py-2 text-left ${item.id === dataset.id ? 'border-[#151515] bg-[#E6F2EF]' : 'border-stone-300 bg-white hover:border-[#151515]'}`}
                >
                  <div className="font-mono text-[10px] uppercase text-stone-500">{item.rowCount} {copy.rows}</div>
                  <div className="max-w-56 truncate font-serif text-base">{item.name}</div>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-4">
            <MiniMetric label={copy.providerType} value={providerTypes.join(' / ') || '-'} />
            <MiniMetric label={copy.sourceType} value={sourceTypes.join(' / ') || '-'} />
            <MiniMetric label={copy.formatHint} value={uniqueRowValueCount(rows, 'format_hint')} />
            <MiniMetric label={copy.accessMode} value={uniqueRowValueCount(rows, 'access_mode')} />
          </div>

          <div className="grid gap-2 border border-stone-300 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_9rem]">
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.sourceFilters}</span>
              <input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder={copy.sourceSearchPlaceholder}
                className="w-full border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#151515]"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.providerType}</span>
              <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} className="w-full border border-stone-300 bg-white px-2 py-2 text-xs">
                <option value="">{copy.allProviders}</option>
                {providerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.formatHint}</span>
              <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} className="w-full border border-stone-300 bg-white px-2 py-2 text-xs">
                <option value="">{copy.allFormats}</option>
                {formatOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.minQuality}</span>
              <input
                value={minQuality}
                min={0}
                max={1}
                step={0.05}
                type="range"
                onChange={(event) => setMinQuality(Number(event.target.value))}
                className="w-full accent-[#16605D]"
              />
              <div className="font-mono text-[10px] text-stone-500">{Math.round(minQuality * 100)}% / {filteredRows.length} {copy.rows}</div>
            </label>
          </div>

          <div className="overflow-x-auto border border-stone-300 bg-white">
            <table className="w-full min-w-[76rem] text-left text-xs">
              <thead>
                <tr className="bg-stone-100 font-mono text-[10px] uppercase text-stone-500">
                  <th className="border-b border-stone-300 px-3 py-2">{copy.source}</th>
                  <th className="border-b border-stone-300 px-3 py-2">URL</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.providerType}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.accessMode}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.formatHint}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.licenseHint}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.sourceQualityScore}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.materializeReadiness}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.priorityScore}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.materializeStatus}</th>
                  <th className="border-b border-stone-300 px-3 py-2">{copy.materializeSource}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 12).map((row) => {
                  const originalIndex = rows.indexOf(row);
                  const status = resultByRow.get(originalIndex);
                  return (
                  <tr key={`${String(row.canonical_url ?? row.url ?? originalIndex)}-${originalIndex}`}>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">
                      <div className="line-clamp-2 font-serif text-base">{String(row.title ?? row.provider ?? '-')}</div>
                      <div className="mt-1 font-mono text-[10px] text-stone-500">{String(row.source_type ?? '-')}</div>
                    </td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">
                      <a className="line-clamp-2 break-all text-[#16605D] hover:underline" href={String(row.url ?? '#')} target="_blank" rel="noreferrer">
                        {String(row.url ?? '-')}
                      </a>
                    </td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top font-mono">{String(row.provider ?? '-')} / {String(row.provider_type ?? '-')}</td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">{String(row.access_mode ?? '-')}</td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">{String(row.format_hint ?? '-')}</td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">{String(row.license_hint ?? '-')}</td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">
                      <div className="font-mono">{formatQuality(row.source_quality_score)}</div>
                      <div className="mt-1 line-clamp-2 max-w-40 text-[10px] text-stone-500" title={String(row.quality_reason ?? '')}>{String(row.dataset_quality_tier ?? '-')} / {String(row.quality_reason ?? '-')}</div>
                    </td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">{String(row.materialize_readiness ?? '-')}</td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top font-mono">{formatPriority(row.priority_score)}</td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">
                      <MaterializeStatusBadge status={status} copy={copy} />
                    </td>
                    <td className="border-b border-stone-200 px-3 py-2 align-top">
                      <button
                        onClick={() => onMaterialize(dataset, originalIndex)}
                        disabled={materializingKey === `${dataset.id}-${originalIndex}`}
                        className="inline-flex min-h-8 items-center gap-1 border border-stone-300 px-2 py-1 font-mono text-[10px] uppercase hover:border-[#151515] disabled:opacity-60"
                      >
                        {materializingKey === `${dataset.id}-${originalIndex}` ? <Activity size={11} className="animate-spin" /> : <Download size={11} />}
                        {copy.materializeSource}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details className="border border-stone-300 bg-[#FFFCF4] p-3">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.lineageJson}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[10px]">
              {String(rows[0]?.lineage_json ?? JSON.stringify({
                datasetId: dataset.id,
                sourceKind: dataset.sourceKind,
                sourceRef: dataset.sourceRef,
                firstRow: rows[0] ?? null,
              }, null, 2))}
            </pre>
          </details>
        </div>
      )}
    </Panel>
  );
};

const MaterializeStatusBadge: React.FC<{ status?: MaterializeResultState; copy: typeof text.zh | typeof text.en }> = ({ status, copy }) => {
  if (!status) {
    return <span className="font-mono text-[10px] uppercase text-stone-400">{copy.materializePending}</span>;
  }
  if (status.ok) {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1 border border-emerald-700 bg-emerald-50 px-2 py-1 font-mono text-[10px] uppercase text-emerald-800">
          <CheckCircle2 size={11} />{copy.materializeSucceeded}
        </span>
        {status.rows !== undefined && <div className="font-mono text-[10px] text-stone-500">{status.rows} {copy.rows}</div>}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1 border border-red-700 bg-red-50 px-2 py-1 font-mono text-[10px] uppercase text-red-800">
        <XCircle size={11} />{copy.materializeFailed}
      </span>
      {status.error && <div className="line-clamp-2 max-w-40 text-[11px] text-red-700">{status.error}</div>}
    </div>
  );
};

const StatusTile: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border-r border-[#151515] p-3 last:border-r-0">
    <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
    <div className="mt-1 font-serif text-3xl leading-none">{value}</div>
  </div>
);

const MiniMetric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
    <div className="mt-1 truncate font-serif text-xl">{value}</div>
  </div>
);

const EmptyBlock: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex min-h-52 items-center justify-center border border-dashed border-stone-300 bg-white/60 p-6 text-center text-sm text-stone-500">
    {text}
  </div>
);

const DatasetSummaryBlock: React.FC<{
  dataset: AnalyticsDatasetSummary;
  profile: DatasetProfileSummary | null;
  copy: typeof text.zh | typeof text.en;
}> = ({ dataset, profile, copy }) => (
  <div className="space-y-4">
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{dataset.sourceKind}</div>
      <div className="mt-1 font-serif text-3xl leading-tight">{dataset.name}</div>
      <div className="mt-2 break-all font-mono text-[10px] text-stone-500">{dataset.id}</div>
    </div>
    <div className="grid grid-cols-4 border-2 border-[#151515] bg-white">
      <StatusTile label={copy.rows} value={dataset.rowCount} />
      <StatusTile label={copy.cols} value={dataset.columnCount} />
      <StatusTile label={copy.preview} value={dataset.sampleRows?.length ?? 0} />
      <StatusTile label={copy.quality} value={profile ? `${Math.round(profile.qualityScore * 100)}%` : '-'} />
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <MiniMetric label={copy.storage} value={String(dataset.metadata?.storage && typeof dataset.metadata.storage === 'object' ? (dataset.metadata.storage as Record<string, unknown>).rowStorage ?? 'postgres' : 'postgres')} />
      <MiniMetric label={copy.sampleLimit} value={String(dataset.metadata?.storage && typeof dataset.metadata.storage === 'object' ? (dataset.metadata.storage as Record<string, unknown>).sampleRowLimit ?? dataset.sampleRows?.length ?? 0 : dataset.sampleRows?.length ?? 0)} />
    </div>
    <div className="max-h-40 overflow-auto border border-stone-300 bg-[#FFFCF4] p-2 font-mono text-[10px]">
      {JSON.stringify(dataset.metadata ?? {}, null, 2)}
    </div>
  </div>
);

const WorkerResultPanel: React.FC<{
  workerJob: AnalyticsJobSummary | null;
  workerPayload: Record<string, unknown> | null;
  visualizationArtifact: VisualizationArtifactSummary | null;
  datasetOperationPayload: Record<string, unknown> | null;
  datasetOperationHistory: Array<Record<string, unknown>>;
  copy: typeof text.zh | typeof text.en;
}> = ({ workerJob, workerPayload, visualizationArtifact, datasetOperationPayload, datasetOperationHistory, copy }) => (
  <Panel title={copy.result} icon={<Activity size={18} />} accent="#7E5130">
    {workerJob || workerPayload || visualizationArtifact || datasetOperationPayload ? (
      <div className="space-y-4">
        {datasetOperationPayload && (
          <DatasetOperationResult payload={datasetOperationPayload} history={datasetOperationHistory} empty={copy.empty} labels={{ operationResult: copy.operationResult, operationHistory: copy.operationHistory, rawJson: copy.rawJson, rows: copy.rows, warnings: copy.warnings }} />
        )}
        {workerJob && (
          <div className="grid grid-cols-3 border-2 border-[#151515] bg-white">
            <StatusTile label={copy.job} value={workerJob.id.slice(0, 8)} />
            <StatusTile label={copy.kind} value={workerJob.kind} />
            <StatusTile label={copy.status} value={workerJob.status} />
          </div>
        )}
        {workerPayload && <WorkerResultSummary payload={workerPayload} labels={{ files: copy.files, details: copy.details, lineage: copy.lineage, rawJson: copy.rawJson, svgChartPreview: copy.svgChartPreview, chartPreviewAlt: copy.chartPreviewAlt }} />}
        {visualizationArtifact && (
          <div className="border border-[#6C4AB6] bg-[#F0ECFF] p-3">
            <div className="grid grid-cols-3 gap-2">
              <MiniMetric label={copy.kind} value={visualizationArtifact.kind} />
              <MiniMetric label={copy.engine} value={visualizationArtifact.engine} />
              <MiniMetric label={copy.rows} value={visualizationArtifact.dataLineage.rowCount} />
            </div>
            <VisualizationPreview artifact={visualizationArtifact} copy={copy} />
            <pre className="mt-3 max-h-52 overflow-auto border border-violet-200 bg-white p-3 text-xs">
              {JSON.stringify(visualizationArtifact.spec, null, 2)}
            </pre>
          </div>
        )}
      </div>
    ) : (
      <div className="border border-dashed border-stone-300 bg-white/60 p-6 text-sm leading-6 text-stone-600">{copy.resultHint}</div>
    )}
  </Panel>
);

const ActionButton: React.FC<{ active?: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone?: 'dark' | 'light' }> = ({ active, onClick, icon, label, tone = 'light' }) => (
  <button
    onClick={onClick}
    disabled={active}
    className={`inline-flex items-center justify-center gap-2 border-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition disabled:opacity-60 ${
      tone === 'dark'
        ? 'border-[#151515] bg-[#151515] text-white hover:bg-[#343434]'
        : 'border-stone-300 bg-white hover:border-[#151515]'
    }`}
  >
    {active ? <Activity size={14} className="animate-spin" /> : icon}
    {label}
  </button>
);

const DatasetOperationResult: React.FC<{
  payload: Record<string, unknown> | null;
  history: Array<Record<string, unknown>>;
  empty: string;
  labels: { operationResult: string; operationHistory: string; rawJson: string; rows: string; warnings: string };
}> = ({ payload, history, empty, labels }) => {
  if (!payload) {
    return (
      <div className="flex min-h-40 items-center justify-center border border-dashed border-stone-300 bg-white/60 p-5 text-sm leading-6 text-stone-600">
        {empty}
      </div>
    );
  }

  const operation = String(payload.operation ?? labels.operationResult);
  const endpoint = String(payload.endpoint ?? '');
  const rows = Array.isArray(payload.rows) ? payload.rows.filter(isRecord) : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
  const profile = isRecord(payload.profile) ? payload.profile : undefined;
  const qualityScore = Number(payload.qualityScore ?? profile?.qualityScore);
  const metricValues: Array<{ label: string; value: string | number }> = [
    { label: 'operation', value: operation },
    ...(payload.message !== undefined ? [{ label: 'message', value: String(payload.message) }] : []),
    ...(endpoint ? [{ label: 'endpoint', value: endpoint }] : []),
    ...(Number.isFinite(qualityScore) ? [{ label: 'qualityScore', value: `${Math.round(qualityScore * 100)}%` }] : []),
    ...(payload.rowCount !== undefined ? [{ label: 'rowCount', value: String(payload.rowCount) }] : []),
    ...(payload.sourceRowCount !== undefined ? [{ label: 'sourceRowCount', value: String(payload.sourceRowCount) }] : []),
    ...(warnings.length ? [{ label: labels.warnings, value: warnings.length }] : []),
  ];
  const columns = rows.length ? Object.keys(rows[0]).slice(0, 6) : [];

  return (
    <div className="space-y-3 border border-[#6C4AB6] bg-[#F0ECFF] p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{labels.operationResult}</div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {metricValues.slice(0, 6).map((metric) => <MiniMetric key={metric.label} label={metric.label} value={metric.value} />)}
      </div>
      {warnings.length > 0 && (
        <div className="border border-[#B9472A] bg-[#FFF2EA] p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#B9472A]">{labels.warnings}</div>
          <ul className="space-y-1 text-xs leading-5 text-stone-700">
            {warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto border border-stone-300 bg-white p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{labels.rows}</div>
          <table className="w-full text-xs">
            <thead>
              <tr>{columns.map((column) => <th key={column} className="border-b border-stone-300 py-1 pr-3 text-left font-mono">{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => <td key={column} className="border-b border-stone-200 py-1 pr-3">{String(row[column] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history.length > 1 && (
        <div className="border border-stone-300 bg-white p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{labels.operationHistory}</div>
          <div className="space-y-2">
            {history.slice(1, 6).map((item, index) => <OperationHistoryItem key={`${String(item.at ?? index)}-${index}`} item={item} />)}
          </div>
        </div>
      )}
      <details className="border border-stone-300 bg-white p-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-stone-500">{labels.rawJson}</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
};

const OperationHistoryItem: React.FC<{ item: Record<string, unknown> }> = ({ item }) => {
  const rows = Array.isArray(item.rows) ? item.rows.filter(isRecord) : [];
  const firstRowText = rows[0] ? Object.values(rows[0]).map((value) => String(value ?? '')).filter(Boolean).join(' / ') : '';
  const summary = [
    String(item.operation ?? 'operation'),
    item.message !== undefined ? String(item.message) : '',
    firstRowText,
    item.endpoint !== undefined ? String(item.endpoint) : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="border border-stone-200 bg-[#FFFCF4] p-2">
      <div className="break-words text-xs leading-5 text-stone-700">{summary}</div>
      {item.at !== undefined && <div className="mt-1 font-mono text-[10px] text-stone-400">{formatDate(String(item.at))}</div>}
    </div>
  );
};

const ColumnProfile: React.FC<{ profile: DatasetProfileSummary | null; empty: string; copy: typeof text.zh | typeof text.en }> = ({ profile, empty, copy }) => {
  if (!profile) return <p className="text-sm text-stone-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="font-mono text-[10px] uppercase text-stone-500">
          <tr>
            <th className="py-2 text-left">{copy.columnName}</th>
            <th className="py-2 text-left">{copy.columnType}</th>
            <th className="py-2 text-left">{copy.missing}</th>
            <th className="py-2 text-left">{copy.unique}</th>
            <th className="py-2 text-left">{copy.range}</th>
          </tr>
        </thead>
        <tbody>
          {profile.columns.slice(0, 20).map((column) => (
            <tr key={column.name} className="border-t border-stone-300">
              <td className="py-2 font-mono">{column.name}</td>
              <td className="py-2">{column.inferredType}</td>
              <td className="py-2">{column.missingCount}</td>
              <td className="py-2">{column.uniqueCount}</td>
              <td className="py-2">{formatRange(column.min, column.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StatisticsTable: React.FC<{ statistics: DescriptiveStatisticsSummary | null; empty: string; copy: typeof text.zh | typeof text.en }> = ({ statistics, empty, copy }) => {
  if (!statistics) return <p className="text-sm text-stone-500">{empty}</p>;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="font-mono text-[10px] uppercase text-stone-500">
            <tr>
              <th className="py-2 text-left">{copy.columnName}</th>
              <th className="py-2 text-left">{copy.count}</th>
              <th className="py-2 text-left">{copy.mean}</th>
              <th className="py-2 text-left">{copy.median}</th>
              <th className="py-2 text-left">{copy.std}</th>
              <th className="py-2 text-left">SE</th>
              <th className="py-2 text-left">95% CI</th>
              <th className="py-2 text-left">min / max</th>
            </tr>
          </thead>
          <tbody>
            {statistics.numericColumns.slice(0, 12).map((column) => (
              <tr key={column.name} className="border-t border-stone-300">
                <td className="py-2 font-mono">{column.name}</td>
                <td className="py-2">{column.count}</td>
                <td className="py-2">{formatNumber(column.mean)}</td>
                <td className="py-2">{formatNumber(column.median)}</td>
                <td className="py-2">{formatNumber(column.standardDeviation)}</td>
                <td className="py-2">{formatNumber(column.standardError ?? 0)}</td>
                <td className="py-2">{Array.isArray(column.confidenceInterval95) ? column.confidenceInterval95.map(formatNumber).join(' ~ ') : '-'}</td>
                <td className="py-2">{formatNumber(column.min)} / {formatNumber(column.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {statistics.correlations.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {statistics.correlations.slice(0, 8).map((cell) => (
            <MiniMetric key={`${cell.x}-${cell.y}`} label={`${cell.x} ~ ${cell.y}`} value={formatNumber(cell.correlation)} />
          ))}
        </div>
      )}
    </div>
  );
};

const WorkerResultSummary: React.FC<{ payload: Record<string, unknown>; labels: { files: string; details: string; lineage: string; rawJson: string; svgChartPreview: string; chartPreviewAlt: string } }> = ({ payload, labels }) => {
  const files = isRecord(payload.files) ? payload.files : undefined;
  const svgFile = files ? Object.entries(files).find(([format, file]) => format.toLowerCase().includes('svg') && String(file).endsWith('.svg'))?.[1] : undefined;
  const markdown = typeof payload.markdown === 'string' ? payload.markdown : '';
  const operations = isRecord(payload.operations) ? payload.operations : undefined;
  const lineage = isRecord(payload.lineage) ? payload.lineage : undefined;
  const quickMetrics = summarizePayload(payload);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {quickMetrics.map((metric) => <MiniMetric key={metric.label} label={metric.label} value={metric.value} />)}
      </div>
      {files && (
        <div className="border border-[#16605D] bg-[#E6F2EF] p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#16605D]">{labels.files}</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(files).map(([format, file]) => (
              <a
                key={format}
                href={`/api/analytics/artifact-files?path=${encodeURIComponent(String(file))}`}
                className="inline-flex max-w-full items-center gap-2 border border-[#16605D] bg-white px-2 py-1 font-mono text-[10px] uppercase hover:bg-[#F7FFF9]"
                target="_blank"
                rel="noreferrer"
              >
                <Download size={12} />
                <span>{format}</span>
                <span className="truncate normal-case text-stone-500">{String(file)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {svgFile && <SvgArtifactPreview file={String(svgFile)} label={labels.svgChartPreview} alt={labels.chartPreviewAlt} />}
      {operations && (
        <div className="grid gap-2 md:grid-cols-2">
          {Object.entries(operations).map(([name, value]) => (
            <div key={name} className="border border-stone-300 bg-white p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{name}</div>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px]">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
      {lineage && (
        <div className="border border-stone-300 bg-white p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{labels.lineage}</div>
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(lineage, null, 2)}</pre>
        </div>
      )}
      {markdown && (
        <div className="border border-stone-300 bg-[#FFFCF4] p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{labels.details}</div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5">{markdown}</pre>
        </div>
      )}
      <details className="border border-stone-300 bg-white p-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-stone-500">{labels.rawJson}</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
};

function summarizePayload(payload: Record<string, unknown>) {
  const metricMap: Array<[string, unknown]> = [
    ['tests', Array.isArray(payload.tests) ? payload.tests.length : undefined],
    ['clusters', Array.isArray(payload.clusters) ? payload.clusters.length : undefined],
    ['text clusters', Array.isArray(payload.textClusters) ? payload.textClusters.length : undefined],
    ['topics', Array.isArray(payload.topics) ? payload.topics.length : undefined],
    ['features', Array.isArray(payload.featureImportances) ? payload.featureImportances.length : undefined],
    ['timeline', Array.isArray(payload.timeline) ? payload.timeline.length : undefined],
    ['anomalies', Array.isArray(payload.anomalies) ? payload.anomalies.length : undefined],
    ['tables', Array.isArray(payload.tables) ? payload.tables.length : undefined],
    ['operations', isRecord(payload.operations) ? Object.keys(payload.operations).length : undefined],
    ['torch', isRecord(payload.torch) ? (payload.torch.available ? String(payload.torch.device ?? 'ready') : 'off') : undefined],
    ['torch mlp', isRecord(payload.torchSupervisedBaseline) ? String(payload.torchSupervisedBaseline.accuracy ?? 'ready') : undefined],
    ['embedding', isRecord(payload.embedding) ? String((payload.embedding.shape as unknown[])?.join(' x ') ?? payload.embedding.engine ?? 'ready') : undefined],
  ];
  const metrics = metricMap
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([label, value]) => ({ label, value: String(value) }));
  if (metrics.length) return metrics.slice(0, 9);
  return [
    { label: 'kind', value: String(payload.kind ?? payload.model ?? payload.format ?? 'analysis') },
    { label: 'engine', value: String(payload.engine ?? 'worker') },
    { label: 'fields', value: Object.keys(payload).length },
  ];
}

const VisualizationPreview: React.FC<{ artifact: VisualizationArtifactSummary; copy: typeof text.zh | typeof text.en }> = ({ artifact, copy }) => {
  const spec = artifact.spec ?? {};
  if (artifact.kind === 'bar' && Array.isArray((spec as any).xAxis?.data) && Array.isArray((spec as any).series?.[0]?.data)) {
    const labels = (spec as any).xAxis.data.map(String).slice(0, 12);
    const values = (spec as any).series[0].data.map(Number).slice(0, 12);
    const max = Math.max(...values.map((value) => Math.abs(value)), 1);
    return (
      <div className="mt-3 border border-violet-200 bg-white p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{copy.visualPreview}</div>
        <div className="space-y-2">
          {labels.map((label, index) => (
            <div key={`${label}-${index}`} className="grid grid-cols-[5rem_minmax(0,1fr)_4rem] items-center gap-2 text-xs">
              <span className="truncate font-mono" title={label}>{label}</span>
              <span className="h-5 border border-[#6C4AB6] bg-[#F0ECFF]">
                <span className="block h-full bg-[#6C4AB6]" style={{ width: `${Math.max(2, Math.abs(values[index] ?? 0) / max * 100)}%` }} />
              </span>
              <span className="text-right font-mono">{formatNumber(values[index] ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artifact.kind === 'line' && Array.isArray((spec as any).traces?.[0]?.x) && Array.isArray((spec as any).traces?.[0]?.y)) {
    return <SvgSeriesPreview x={(spec as any).traces[0].x} y={(spec as any).traces[0].y} mode="line" label={`${copy.visualPreview} / line`} />;
  }

  if (artifact.kind === 'scatter' && Array.isArray((spec as any).data)) {
    const points = ((spec as any).data as Array<Record<string, unknown>>).map((point) => ({ x: Number(point.x), y: Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    return <SvgSeriesPreview x={points.map((point) => point.x)} y={points.map((point) => point.y)} mode="scatter" label={`${copy.visualPreview} / scatter`} />;
  }

  if (artifact.kind === 'histogram' && Array.isArray((spec as any).values)) {
    const values = ((spec as any).values as unknown[]).map(Number).filter(Number.isFinite);
    const bins = histogramBins(values, Number((spec as any).binCount ?? 10));
    const max = Math.max(...bins.map((bin) => bin.count), 1);
    return (
      <div className="mt-3 border border-violet-200 bg-white p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{copy.histogramPreview}</div>
        <div className="flex h-40 items-end gap-1">
          {bins.map((bin, index) => (
            <div key={index} className="flex-1 bg-[#6C4AB6]" title={`${formatNumber(bin.from)}-${formatNumber(bin.to)}: ${bin.count}`} style={{ height: `${Math.max(2, bin.count / max * 100)}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (artifact.kind === 'pie' && Array.isArray((spec as any).series?.[0]?.data)) {
    const slices = ((spec as any).series[0].data as Array<Record<string, unknown>>)
      .map((item) => ({ name: String(item.name ?? '-'), value: Number(item.value) }))
      .filter((item) => Number.isFinite(item.value))
      .slice(0, 10);
    const total = slices.reduce((sum, item) => sum + item.value, 0) || 1;
    return (
      <div className="mt-3 border border-violet-200 bg-white p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{copy.visualPreview} / pie</div>
        <div className="space-y-2">
          {slices.map((slice, index) => (
            <div key={`${slice.name}-${index}`} className="grid grid-cols-[5rem_minmax(0,1fr)_4rem] items-center gap-2 text-xs">
              <span className="truncate font-mono" title={slice.name}>{slice.name}</span>
              <span className="h-4 rounded-full bg-[#F0ECFF]">
                <span className="block h-full rounded-full bg-[#6C4AB6]" style={{ width: `${Math.max(2, slice.value / total * 100)}%` }} />
              </span>
              <span className="text-right font-mono">{Math.round(slice.value / total * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artifact.kind === 'box' && Array.isArray((spec as any).groups)) {
    const groups = ((spec as any).groups as Array<Record<string, unknown>>).slice(0, 8);
    const values = groups.flatMap((group) => [Number(group.min), Number(group.max)]).filter(Number.isFinite);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    return (
      <div className="mt-3 border border-violet-200 bg-white p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{copy.visualPreview} / box</div>
        <div className="space-y-3">
          {groups.map((group, index) => (
            <BoxPreviewRow key={`${group.name}-${index}`} group={group} min={min} max={max} />
          ))}
        </div>
      </div>
    );
  }

  if (artifact.kind === 'heatmap' && Array.isArray((spec as any).series?.[0]?.data) && Array.isArray((spec as any).xAxis?.data)) {
    const labels = ((spec as any).xAxis.data as unknown[]).map(String).slice(0, 8);
    const cells = ((spec as any).series[0].data as unknown[][]).filter((cell) => cell.length >= 3);
    return (
      <div className="mt-3 border border-violet-200 bg-white p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{copy.visualPreview} / heatmap</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, labels.length)}, minmax(0, 1fr))` }}>
          {labels.flatMap((_, yIndex) => labels.map((__, xIndex) => {
            const value = Number(cells.find((cell) => Number(cell[0]) === xIndex && Number(cell[1]) === yIndex)?.[2] ?? 0);
            const intensity = Math.min(1, Math.abs(value));
            return (
              <div
                key={`${xIndex}-${yIndex}`}
                className="flex aspect-square items-center justify-center border border-violet-100 font-mono text-[9px]"
                title={`${labels[xIndex]} ~ ${labels[yIndex]}: ${formatNumber(value)}`}
                style={{ background: value >= 0 ? `rgba(108,74,182,${0.12 + intensity * 0.72})` : `rgba(185,71,42,${0.12 + intensity * 0.72})`, color: intensity > 0.55 ? '#fff' : '#1c1917' }}
              >
                {formatNumber(value)}
              </div>
            );
          }))}
        </div>
        <div className="mt-2 truncate font-mono text-[10px] text-stone-500">{labels.join(' / ')}</div>
      </div>
    );
  }

  if (artifact.kind === 'table' && Array.isArray((spec as any).rows)) {
    const rows = (spec as any).rows.slice(0, 6) as Array<Record<string, unknown>>;
    const columns = Array.isArray((spec as any).columns) ? (spec as any).columns.slice(0, 6).map(String) : Object.keys(rows[0] ?? {}).slice(0, 6);
    return (
      <div className="mt-3 overflow-x-auto border border-violet-200 bg-white p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{copy.tablePreview}</div>
        <table className="w-full text-xs">
          <thead>
            <tr>{columns.map((column) => <th key={column} className="border-b border-stone-300 py-1 text-left font-mono">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>{columns.map((column) => <td key={column} className="border-b border-stone-200 py-1">{String(row[column] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
};

const BoxPreviewRow: React.FC<{ group: Record<string, unknown>; min: number; max: number }> = ({ group, min, max }) => {
  const scale = (value: unknown) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return 0;
    return ((numberValue - min) / Math.max(1, max - min)) * 100;
  };
  const left = scale(group.q1);
  const right = scale(group.q3);
  const median = scale(group.median);
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs">
      <span className="truncate font-mono" title={String(group.name ?? '-')}>{String(group.name ?? '-')}</span>
      <span className="relative h-7 border-y border-violet-100">
        <span className="absolute top-1/2 h-px -translate-y-1/2 bg-[#6C4AB6]" style={{ left: `${scale(group.min)}%`, width: `${Math.max(2, scale(group.max) - scale(group.min))}%` }} />
        <span className="absolute top-1/2 h-5 -translate-y-1/2 border border-[#6C4AB6] bg-[#F0ECFF]" style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} />
        <span className="absolute top-0 h-7 border-l-2 border-[#151515]" style={{ left: `${median}%` }} />
      </span>
      <span className="text-right font-mono">{String(group.count ?? '-')}</span>
    </div>
  );
};

const SvgSeriesPreview: React.FC<{ x: unknown[]; y: unknown[]; mode: 'line' | 'scatter'; label: string }> = ({ x, y, mode, label }) => {
  const points = y.map((value, index) => ({ x: index, y: Number(value) })).filter((point) => Number.isFinite(point.y));
  if (points.length === 0) return null;
  const ys = points.map((point) => point.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 560;
  const height = 180;
  const pad = 18;
  const pathPoints = points.map((point, index) => {
    const px = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
    const py = height - pad - ((point.y - minY) / Math.max(1, maxY - minY)) * (height - pad * 2);
    return [px, py] as const;
  });
  const d = pathPoints.map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px},${py}`).join(' ');
  return (
    <div className="mt-3 border border-violet-200 bg-white p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{label}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#d6d3d1" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#d6d3d1" />
        {mode === 'line' && <path d={d} fill="none" stroke="#6C4AB6" strokeWidth="3" />}
        {pathPoints.map(([px, py], index) => <circle key={index} cx={px} cy={py} r={mode === 'scatter' ? 4 : 3} fill="#6C4AB6" />)}
      </svg>
      <div className="mt-1 truncate font-mono text-[10px] text-stone-500">{String(x[0] ?? 'start')} {'->'} {String(x[x.length - 1] ?? 'end')}</div>
    </div>
  );
};

const SvgArtifactPreview: React.FC<{ file: string; label: string; alt: string }> = ({ file, label, alt }) => (
  <div className="border border-[#6C4AB6] bg-[#F0ECFF] p-3">
    <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#6C4AB6]">{label}</div>
    <img
      src={`/api/analytics/artifact-files?path=${encodeURIComponent(file)}`}
      alt={alt}
      className="max-h-80 w-full border border-violet-200 bg-white object-contain"
    />
  </div>
);

function histogramBins(values: number[], desiredBins: number) {
  if (values.length === 0) return [];
  const binCount = Math.min(30, Math.max(3, desiredBins || 10));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / binCount;
  return Array.from({ length: binCount }, (_, index) => {
    const from = min + width * index;
    const to = index === binCount - 1 ? max : from + width;
    const count = values.filter((value) => value >= from && (index === binCount - 1 ? value <= to : value < to)).length;
    return { from, to, count };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function uniqueRowValueCount(rows: Array<Record<string, unknown>>, field: string) {
  return new Set(rows.map((row) => String(row[field] ?? '')).filter(Boolean)).size;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function formatPriority(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '-';
  return numberValue > 1 ? numberValue.toFixed(1) : `${Math.round(numberValue * 100)}%`;
}

function formatQuality(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '-';
  return `${Math.round(numberValue * 100)}%`;
}

function materializedVersionFromDataset(dataset: AnalyticsDatasetSummary) {
  const version = Number(dataset.metadata?.materializedVersion ?? dataset.metadata?.version ?? 1);
  return Number.isFinite(version) ? version : 1;
}

function buildMaterializedVersionHistory(dataset: AnalyticsDatasetSummary, datasets: AnalyticsDatasetSummary[]) {
  if (dataset.sourceKind !== 'materialized-data-source') return [];
  const rootId = String(dataset.metadata?.refreshRootDatasetId ?? dataset.metadata?.refreshOfDatasetId ?? dataset.id);
  return datasets
    .filter((item) => {
      if (item.sourceKind !== 'materialized-data-source') return false;
      const itemRootId = String(item.metadata?.refreshRootDatasetId ?? item.metadata?.refreshOfDatasetId ?? item.id);
      return item.id === rootId || itemRootId === rootId || item.id === dataset.id;
    })
    .sort((left, right) => materializedVersionFromDataset(right) - materializedVersionFromDataset(left));
}

function sourceUrlFromDataset(dataset: AnalyticsDatasetSummary) {
  const sourceRow = isRecord(dataset.metadata?.sourceRow) ? dataset.metadata.sourceRow : undefined;
  return String(sourceRow?.url ?? sourceRow?.canonical_url ?? dataset.metadata?.sourceUrl ?? dataset.sourceRef ?? '-');
}

function runIdFromDataset(dataset: AnalyticsDatasetSummary) {
  if (dataset.sourceKind === 'research-data-source' && dataset.sourceRef) {
    return dataset.sourceRef;
  }
  if (typeof dataset.metadata?.runId === 'string') {
    return dataset.metadata.runId;
  }

  const sourceRow = isRecord(dataset.metadata?.sourceRow) ? dataset.metadata.sourceRow : undefined;
  const sourceRowLineage = typeof sourceRow?.lineage_json === 'string' ? parseMaybeJson(sourceRow.lineage_json) : undefined;
  if (isRecord(sourceRowLineage) && typeof sourceRowLineage.runId === 'string') {
    return sourceRowLineage.runId;
  }

  const lineage = isRecord(dataset.metadata?.lineage) ? dataset.metadata.lineage : undefined;
  const sourceLineage = typeof lineage?.sourceLineage === 'string' ? parseMaybeJson(lineage.sourceLineage) : undefined;
  if (isRecord(sourceLineage) && typeof sourceLineage.runId === 'string') {
    return sourceLineage.runId;
  }

  return '';
}

function parseMaybeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function artifactExportFormats(artifact: AnalyticsArtifactSummary) {
  if (artifact.artifactType === 'visualization') return ['json', 'png', 'svg'];
  if (artifact.artifactType === 'report') return ['md', 'html', 'docx', 'pdf', 'pptx', 'json'];
  return [];
}

function readImportFile(file: File, kind: string): Promise<{ contentText?: string; contentBase64?: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    if (isTextImportKind(kind)) {
      reader.onload = () => resolve({ contentText: String(reader.result ?? '') });
      reader.readAsText(file);
      return;
    }
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve({ contentBase64: result.includes(',') ? result.split(',', 2)[1] : result });
    };
    reader.readAsDataURL(file);
  });
}

function isTextImportKind(kind: string) {
  return ['json', 'jsonl', 'csv', 'html', 'table', 'geojson', 'txt', 'md'].includes(kind);
}

function inferImportKind(filename: string, fallback: string) {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return fallback;
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  if (extension === 'ndjson') return 'jsonl';
  if (extension === 'htm') return 'html';
  if (['json', 'jsonl', 'csv', 'html', 'parquet', 'geojson', 'txt', 'md', 'pdf', 'docx', 'pptx'].includes(extension)) {
    return extension;
  }
  return fallback;
}

function formatRange(min: unknown, max: unknown) {
  if (min === undefined && max === undefined) return '-';
  return `${String(min ?? '-')} -> ${String(max ?? '-')}`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3).replace(/\.?0+$/, '');
}

function formatDate(value?: string) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
