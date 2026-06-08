import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Download,
  FlaskConical,
  GitBranch,
  LineChart,
  Network,
  Play,
  Rows3,
  Sparkles,
  TableProperties,
} from 'lucide-react';
import {
  AnalyticsDatasetSummary,
  AnalyticsJobKindSummary,
  DatasetProfileSummary,
  VisualizationSuggestionSummary,
} from '../../types';
import { Language } from '../../i18n';

type WizardTemplateId =
  | 'explore'
  | 'compare'
  | 'model'
  | 'cluster'
  | 'time'
  | 'news'
  | 'publication';

export interface DataLabWizardCopy {
  analysisWizard: string;
  analysisWizardHint: string;
  wizardDataset: string;
  wizardQuestion: string;
  wizardQuestionPlaceholder: string;
  wizardTemplate: string;
  wizardVariables: string;
  wizardVariablesHint: string;
  wizardTarget: string;
  wizardGroup: string;
  wizardTime: string;
  wizardWeight: string;
  wizardOutputs: string;
  wizardRunPlan: string;
  wizardRunPrimary: string;
  wizardRunAll: string;
  wizardNoDataset: string;
  wizardRecommended: string;
  wizardMethodChain: string;
  wizardChartPlan: string;
  wizardReportPlan: string;
  wizardDataQuality: string;
  wizardStatistical: string;
  wizardModeling: string;
  wizardVisual: string;
  wizardPaper: string;
  wizardSelectPlaceholder: string;
}

interface DataLabAnalysisWizardProps {
  language: Language;
  copy: DataLabWizardCopy;
  dataset?: AnalyticsDatasetSummary;
  profile: DatasetProfileSummary | null;
  suggestions: VisualizationSuggestionSummary[];
  busyKind: string;
  onRunAnalysis: (kind: AnalyticsJobKindSummary) => void;
  onRenderVisualization: (suggestion?: VisualizationSuggestionSummary) => void;
}

interface WizardTemplate {
  id: WizardTemplateId;
  label: string;
  eyebrow: string;
  description: string;
  accent: string;
  primary: AnalyticsJobKindSummary;
  chain: AnalyticsJobKindSummary[];
  outputs: Array<'chart' | 'report' | 'table' | 'model'>;
  icon: React.ReactNode;
}

const WIZARD_FIELDS = ['target', 'group', 'time', 'weight'] as const;

export const DataLabAnalysisWizard: React.FC<DataLabAnalysisWizardProps> = ({
  language,
  copy,
  dataset,
  profile,
  suggestions,
  busyKind,
  onRunAnalysis,
  onRenderVisualization,
}) => {
  const templates = useMemo(() => buildWizardTemplates(language), [language]);
  const [templateId, setTemplateId] = useState<WizardTemplateId>('explore');
  const [question, setQuestion] = useState('');
  const [fieldSelections, setFieldSelections] = useState<Record<(typeof WIZARD_FIELDS)[number], string>>({
    target: '',
    group: '',
    time: '',
    weight: '',
  });
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? templates[0];
  const columns = profile?.columns ?? inferColumnsFromDataset(dataset);
  const numericColumns = columns.filter((column) => column.inferredType === 'number' || column.inferredType === 'integer' || column.inferredType === 'float');
  const categoricalColumns = columns.filter((column) => !numericColumns.includes(column));
  const suggestedTarget = fieldSelections.target || numericColumns[0]?.name || columns[0]?.name || '';
  const suggestedGroup = fieldSelections.group || categoricalColumns[0]?.name || columns[1]?.name || '';
  const selectedSuggestion = suggestions.find((suggestion) => (
    suggestion.x === suggestedGroup || suggestion.y === suggestedTarget || suggestion.title.includes(suggestedTarget)
  )) ?? suggestions[0];

  const recommended = recommendWizardMethods(selectedTemplate, {
    hasNumeric: numericColumns.length > 0,
    hasCategorical: categoricalColumns.length > 0,
    hasTime: columns.some((column) => column.inferredType === 'date' || /date|time|year|month|day/i.test(column.name)),
  });

  const runChain = async () => {
    for (const kind of recommended) {
      onRunAnalysis(kind);
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    if (selectedTemplate.outputs.includes('chart')) {
      onRenderVisualization(selectedSuggestion);
    }
  };

  return (
    <section className="border-2 border-[#151515] bg-[#F9F7EF]">
      <div className="grid gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="border-b-2 border-[#151515] bg-[#E6F2EF] p-4 lg:border-b-0 lg:border-r-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#16605D]">{copy.wizardRecommended}</div>
          <h2 className="mt-2 flex items-center gap-2 font-serif text-3xl italic">
            <Sparkles size={20} />
            {copy.analysisWizard}
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-700">{copy.analysisWizardHint}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <WizardMetric label={copy.wizardDataset} value={dataset ? dataset.rowCount : '-'} />
            <WizardMetric label={language === 'zh' ? '字段' : 'Fields'} value={columns.length} />
            <WizardMetric label={language === 'zh' ? '数值' : 'Numeric'} value={numericColumns.length} />
            <WizardMetric label={language === 'zh' ? '分类' : 'Category'} value={categoricalColumns.length} />
          </div>
        </div>

        <div className="min-w-0 p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setTemplateId(template.id)}
                    aria-label={`${copy.wizardTemplate}: ${template.label}`}
                    className={`min-h-28 border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#151515] ${
                      selectedTemplate.id === template.id
                        ? 'border-[#151515] bg-white shadow-[4px_4px_0_#151515]'
                        : 'border-stone-300 bg-[#FFFCF4]'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: template.accent }}>
                        {template.icon}
                        {template.eyebrow}
                      </span>
                      <span className="h-5 w-5 border border-[#151515]" style={{ background: template.accent }} />
                    </div>
                    <div className="font-serif text-lg leading-tight">{template.label}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{template.description}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 border border-stone-300 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
                <label className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.wizardQuestion}</span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={copy.wizardQuestionPlaceholder}
                    className="w-full border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#151515]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onRunAnalysis(selectedTemplate.primary)}
                    disabled={!dataset || busyKind === selectedTemplate.primary}
                    className="inline-flex min-h-10 items-center justify-center gap-2 border-2 border-[#151515] bg-[#151515] px-3 py-2 font-mono text-[10px] uppercase text-white disabled:opacity-50"
                  >
                    {busyKind === selectedTemplate.primary ? <Activity size={13} className="animate-spin" /> : <Play size={13} />}
                    {copy.wizardRunPrimary}
                  </button>
                  <button
                    onClick={runChain}
                    disabled={!dataset || busyKind !== ''}
                    className="inline-flex min-h-10 items-center justify-center gap-2 border-2 border-[#151515] bg-white px-3 py-2 font-mono text-[10px] uppercase disabled:opacity-50"
                  >
                    {busyKind ? <Activity size={13} className="animate-spin" /> : <GitBranch size={13} />}
                    {copy.wizardRunAll}
                  </button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                {WIZARD_FIELDS.map((field) => (
                  <label key={field} className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{fieldLabel(field, copy)}</span>
                    <select
                      value={fieldSelections[field]}
                      onChange={(event) => setFieldSelections((current) => ({ ...current, [field]: event.target.value }))}
                      className="w-full border border-stone-300 bg-white px-2 py-2 text-xs"
                    >
                      <option value="">{copy.wizardSelectPlaceholder}</option>
                      {columns.map((column) => (
                        <option key={`${field}-${column.name}`} value={column.name}>
                          {column.name} / {column.inferredType}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="border border-stone-300 bg-[#FFFCF4] p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.wizardMethodChain}</div>
                <div className="space-y-2">
                  {recommended.map((kind, index) => (
                    <button
                      key={`${kind}-${index}`}
                      onClick={() => onRunAnalysis(kind)}
                      disabled={!dataset || busyKind === kind}
                      className="flex w-full items-center justify-between gap-2 border border-stone-300 bg-white px-3 py-2 text-left hover:border-[#151515] disabled:opacity-50"
                    >
                      <span className="font-mono text-[10px] uppercase">{index + 1}. {kind}</span>
                      {busyKind === kind ? <Activity size={12} className="animate-spin" /> : <Play size={12} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <WizardMetric label={copy.wizardDataQuality} value={recommended.includes('quality-report') ? 'on' : 'opt'} />
                <WizardMetric label={copy.wizardStatistical} value={recommended.some((kind) => kind.includes('statistics') || kind.includes('tests')) ? 'on' : 'opt'} />
                <WizardMetric label={copy.wizardModeling} value={recommended.some((kind) => kind.includes('regression') || kind.includes('cluster') || kind.includes('learning')) ? 'on' : 'opt'} />
                <WizardMetric label={copy.wizardVisual} value={selectedTemplate.outputs.includes('chart') ? 'on' : 'opt'} />
              </div>

              <div className="border border-stone-300 bg-white p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.wizardChartPlan}</div>
                {selectedSuggestion ? (
                  <button
                    onClick={() => onRenderVisualization(selectedSuggestion)}
                    disabled={!dataset || busyKind === 'visualization-render'}
                    aria-label={`${copy.wizardChartPlan}: ${selectedSuggestion.title}`}
                    className="w-full border border-[#6C4AB6] bg-[#F0ECFF] p-3 text-left hover:bg-white disabled:opacity-50"
                  >
                    <div className="font-mono text-[10px] uppercase text-[#6C4AB6]">{selectedSuggestion.kind} / {selectedSuggestion.exportFormats.join(' / ')}</div>
                    <div className="mt-1 font-serif text-lg leading-tight">{selectedSuggestion.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{selectedSuggestion.description}</p>
                  </button>
                ) : (
                  <p className="text-xs leading-5 text-stone-500">{copy.wizardNoDataset}</p>
                )}
              </div>

              <div className="border border-stone-300 bg-white p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{copy.wizardReportPlan}</div>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.outputs.map((output) => (
                    <span key={output} className="inline-flex items-center gap-1 border border-stone-300 bg-stone-100 px-2 py-1 font-mono text-[10px] uppercase">
                      {outputIcon(output)}
                      {output}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onRunAnalysis('export-report')}
                  disabled={!dataset || busyKind === 'export-report'}
                  className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 border border-[#151515] bg-white px-3 py-2 font-mono text-[10px] uppercase hover:bg-[#151515] hover:text-white disabled:opacity-50"
                >
                  {busyKind === 'export-report' ? <Activity size={13} className="animate-spin" /> : <Download size={13} />}
                  {copy.wizardPaper}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function buildWizardTemplates(language: Language): WizardTemplate[] {
  const zh = language === 'zh';
  return [
    {
      id: 'explore',
      label: zh ? '快速探索画像' : 'Exploratory profile',
      eyebrow: zh ? '探索' : 'explore',
      description: zh ? '先做字段画像、质量门、描述统计和推荐图表，适合刚导入的数据。' : 'Run profile, quality gate, descriptive stats, and chart suggestions for newly imported data.',
      accent: '#16605D',
      primary: 'profile',
      chain: ['profile', 'quality-report', 'descriptive-statistics'],
      outputs: ['chart', 'table', 'report'],
      icon: <Rows3 size={13} />,
    },
    {
      id: 'compare',
      label: zh ? '组间比较 / 问卷统计' : 'Group comparison',
      eyebrow: zh ? '检验' : 'tests',
      description: zh ? '频数、交叉表、t 检验、卡方、ANOVA 和非参检验组合。' : 'Frequencies, crosstabs, t-tests, chi-square, ANOVA, and nonparametric checks.',
      accent: '#B9472A',
      primary: 'statistical-tests',
      chain: ['frequency-tables', 'crosstab', 'statistical-tests'],
      outputs: ['table', 'chart', 'report'],
      icon: <FlaskConical size={13} />,
    },
    {
      id: 'model',
      label: zh ? '预测建模 / 回归' : 'Predictive modeling',
      eyebrow: zh ? '建模' : 'model',
      description: zh ? '按目标变量选择线性、逻辑、泊松回归，并补模型解释。' : 'Choose linear, logistic, or Poisson regression around a target variable and add interpretation.',
      accent: '#6C4AB6',
      primary: 'linear-regression',
      chain: ['linear-regression', 'logistic-regression', 'poisson-regression', 'model-explanation'],
      outputs: ['model', 'chart', 'report'],
      icon: <BrainCircuit size={13} />,
    },
    {
      id: 'cluster',
      label: zh ? '聚类 / 降维 / 异常' : 'Cluster and reduce',
      eyebrow: zh ? '结构' : 'structure',
      description: zh ? 'PCA、因子分析、聚类和异常检测，适合多指标数据。' : 'PCA, factor analysis, clustering, and anomaly detection for multi-metric datasets.',
      accent: '#7E5130',
      primary: 'cluster-analysis',
      chain: ['dimensionality-reduction', 'cluster-analysis', 'anomaly-detection'],
      outputs: ['model', 'chart', 'report'],
      icon: <Network size={13} />,
    },
    {
      id: 'time',
      label: zh ? '时间序列 / 趋势' : 'Time-series trend',
      eyebrow: zh ? '趋势' : 'trend',
      description: zh ? '识别时间字段，输出趋势、滚动均值、自相关和折线图。' : 'Detect time fields and produce trend, rolling mean, autocorrelation, and line charts.',
      accent: '#244F8F',
      primary: 'time-series-analysis',
      chain: ['time-series-analysis', 'anomaly-detection'],
      outputs: ['chart', 'table', 'report'],
      icon: <LineChart size={13} />,
    },
    {
      id: 'news',
      label: zh ? '新闻文本整理' : 'News and text mining',
      eyebrow: zh ? '文本' : 'text',
      description: zh ? '对新闻原文做去重、同题聚类、时间线、主题和来源质量判断。' : 'Deduplicate news, cluster stories, build timelines, extract topics, and score sources.',
      accent: '#4B6B35',
      primary: 'news-organization',
      chain: ['news-organization', 'text-analysis', 'model-explanation'],
      outputs: ['table', 'chart', 'report'],
      icon: <TableProperties size={13} />,
    },
    {
      id: 'publication',
      label: zh ? '论文制图 / 报告交付' : 'Publication output',
      eyebrow: zh ? '交付' : 'output',
      description: zh ? '生成 Matplotlib 风格论文图、报告草稿和可导出文件。' : 'Create Matplotlib-style figures, report drafts, and exportable artifacts.',
      accent: '#151515',
      primary: 'publication-chart',
      chain: ['publication-chart', 'report-draft', 'export-report'],
      outputs: ['chart', 'report'],
      icon: <BarChart3 size={13} />,
    },
  ];
}

function recommendWizardMethods(template: WizardTemplate, signals: { hasNumeric: boolean; hasCategorical: boolean; hasTime: boolean }) {
  const chain = [...template.chain];
  if (!chain.includes('quality-report')) chain.unshift('quality-report');
  if (template.id === 'model' && !signals.hasCategorical) {
    return chain.filter((kind) => kind !== 'logistic-regression');
  }
  if (template.id === 'compare' && !signals.hasCategorical) {
    return ['quality-report', 'descriptive-statistics', 'statistical-tests'] as AnalyticsJobKindSummary[];
  }
  if (template.id === 'time' && !signals.hasTime) {
    return ['quality-report', 'descriptive-statistics', 'publication-chart'] as AnalyticsJobKindSummary[];
  }
  return chain;
}

function inferColumnsFromDataset(dataset?: AnalyticsDatasetSummary): DatasetProfileSummary['columns'] {
  const sample = dataset?.sampleRows?.[0];
  if (!sample) return [];
  return Object.entries(sample).map(([name, value]) => ({
    name,
    inferredType: typeof value === 'number' ? 'number' : /date|time/i.test(name) ? 'date' : 'string',
    totalCount: dataset?.sampleRows?.length ?? 0,
    missingCount: 0,
    uniqueCount: 0,
    min: typeof value === 'number' ? value : undefined,
    max: typeof value === 'number' ? value : undefined,
  }));
}

function fieldLabel(field: (typeof WIZARD_FIELDS)[number], copy: DataLabWizardCopy) {
  if (field === 'target') return copy.wizardTarget;
  if (field === 'group') return copy.wizardGroup;
  if (field === 'time') return copy.wizardTime;
  return copy.wizardWeight;
}

function outputIcon(output: 'chart' | 'report' | 'table' | 'model') {
  if (output === 'chart') return <BarChart3 size={11} />;
  if (output === 'table') return <Rows3 size={11} />;
  if (output === 'model') return <BrainCircuit size={11} />;
  return <Download size={11} />;
}

const WizardMetric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-white p-2">
    <div className="truncate font-mono text-[9px] uppercase tracking-wider text-stone-500">{label}</div>
    <div className="mt-1 truncate font-serif text-lg">{value}</div>
  </div>
);
