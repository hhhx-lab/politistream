import React, { useState } from 'react';
import { BarChart3, Database, FileText, GitBranch, Loader2, Search } from 'lucide-react';
import {
  AnalysisHandoffDecisionSummary,
  AnalysisHandoffSummary,
  AnalysisOpportunityModeSummary,
  AnalysisOpportunitySummary,
  ResearchRunSummary,
} from '../../types';
import { Language } from '../../i18n';
import { Badge, MiniMetric, Panel } from './shared';

interface AnalysisDecisionPanelProps {
  language: Language;
  run: ResearchRunSummary | null;
  opportunity: AnalysisOpportunitySummary | null;
  handoff: AnalysisHandoffSummary | null;
  busy: AnalysisHandoffDecisionSummary | 'opportunity' | '';
  error?: string;
  onGenerate: () => void;
  onDecision: (decision: AnalysisHandoffDecisionSummary) => void;
}

const decisionOrder: AnalysisHandoffDecisionSummary[] = [
  'report_only',
  'light_analysis',
  'full_analysis',
  'continue_crawl',
];

export const AnalysisDecisionPanel: React.FC<AnalysisDecisionPanelProps> = ({
  language,
  run,
  opportunity,
  handoff,
  busy,
  error,
  onGenerate,
  onDecision,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const zh = language === 'zh';
  const copy = analysisCopy[language];
  const terminal = run && ['completed', 'failed', 'cancelled'].includes(run.status);
  const canEvaluate = Boolean(run && terminal);

  return (
    <Panel title={copy.title}>
      {!opportunity ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem] md:items-center">
          <div className="text-sm leading-6 text-stone-700">
            {canEvaluate ? copy.readyHint : copy.waitHint}
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canEvaluate || busy === 'opportunity'}
            className="inline-flex h-10 items-center justify-center gap-2 border border-[#141414] bg-[#141414] px-3 text-xs font-mono uppercase text-white disabled:opacity-40"
          >
            {busy === 'opportunity' ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {copy.generate}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <MiniMetric label={copy.score} value={`${Math.round(opportunity.score * 100)}%`} />
            <MiniMetric label={copy.mode} value={modeLabel(opportunity.recommendedAnalysisMode, language)} />
            <MiniMetric label={copy.taskType} value={opportunity.taskType} />
            <MiniMetric label={copy.fields} value={`${opportunity.availableFields.length}/${opportunity.requiredFields.length || opportunity.availableFields.length}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <p className="text-sm leading-6 text-stone-700">{opportunity.decisionReason}</p>
              <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase">
                {opportunity.candidateFeatures.slice(0, 8).map((feature) => <Badge key={feature}>{feature}</Badge>)}
                {opportunity.missingFields.slice(0, 5).map((field) => <Badge key={`missing-${field}`}>{copy.missing}: {field}</Badge>)}
              </div>
              {handoff && (
                <div className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
                  {copy.decided}: {decisionLabel(handoff.decision, language)} / {copy.target}: {handoff.targetPage}
                </div>
              )}
              {error && (
                <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{error}</div>
              )}
            </div>
            <div className="grid gap-2">
              {decisionOrder.map((decision) => (
                <button
                  key={decision}
                  type="button"
                  onClick={() => onDecision(decision)}
                  disabled={Boolean(busy) || !run}
                  className="flex h-10 items-center justify-between gap-2 border border-stone-300 bg-white px-3 text-left text-xs hover:border-[#141414] disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-2">
                    {decisionIcon(decision)}
                    {decisionLabel(decision, language)}
                  </span>
                  {busy === decision && <Loader2 size={13} className="animate-spin" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDetailsOpen((value) => !value)}
                className="h-9 border border-stone-300 bg-stone-100 px-3 text-xs font-mono uppercase hover:bg-white"
              >
                {detailsOpen ? copy.hideDetails : copy.showDetails}
              </button>
            </div>
          </div>

          {detailsOpen && (
            <div className="grid gap-3 lg:grid-cols-2">
              <DetailBlock title={copy.breakdown} rows={scoreRows(opportunity)} />
              <DetailBlock title={copy.fieldCoverage} rows={[
                [copy.required, opportunity.requiredFields.join(', ') || '-'],
                [copy.available, opportunity.availableFields.join(', ') || '-'],
                [copy.missing, opportunity.missingFields.join(', ') || '-'],
              ]} />
              <DetailBlock title={copy.sources} rows={opportunity.recommendedDataSources.slice(0, 8).map((source) => [
                source.title || source.kind,
                [source.sourceType, source.provider, source.reason].filter(Boolean).join(' / '),
              ])} />
              <DetailBlock title={copy.evidence} rows={opportunity.evidenceSummary.slice(0, 8).map((item) => [
                item.claim || item.sourceUrl || '-',
                item.support,
              ])} />
              {opportunity.warnings.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 lg:col-span-2">
                  <div className="mb-2 font-mono text-[10px] uppercase opacity-70">{copy.warnings}</div>
                  <ul className="space-y-1">
                    {opportunity.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!zh && <span className="sr-only">Analysis decision bridge</span>}
    </Panel>
  );
};

const DetailBlock: React.FC<{ title: string; rows: Array<[string, string]> }> = ({ title, rows }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">{title}</div>
    <div className="space-y-2">
      {rows.length === 0 ? (
        <div className="text-xs text-stone-500">-</div>
      ) : rows.map(([label, value]) => (
        <div key={`${label}-${value}`} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs leading-5">
          <div className="truncate font-mono text-stone-500">{label}</div>
          <div className="min-w-0 break-words">{value}</div>
        </div>
      ))}
    </div>
  </div>
);

function decisionIcon(decision: AnalysisHandoffDecisionSummary) {
  if (decision === 'report_only') return <FileText size={14} />;
  if (decision === 'light_analysis') return <Database size={14} />;
  if (decision === 'full_analysis') return <BarChart3 size={14} />;
  return <Search size={14} />;
}

function scoreRows(opportunity: AnalysisOpportunitySummary): Array<[string, string]> {
  const score = opportunity.scoreBreakdown;
  return [
    ['structured', `${Math.round(score.structuredFieldDensity * 100)}%`],
    ['dimension', `${Math.round(score.dimensionRichness * 100)}%`],
    ['source', `${Math.round(score.sourceQuality * 100)}%`],
    ['evidence', `${Math.round(score.evidenceCoverage * 100)}%`],
    ['value', `${Math.round(score.analysisValue * 100)}%`],
    ['topic', `${Math.round(score.topicFit * 100)}%`],
  ];
}

function decisionLabel(decision: AnalysisHandoffDecisionSummary, language: Language) {
  const zh = language === 'zh';
  const labels = {
    report_only: zh ? '只保留报告' : 'Report only',
    light_analysis: zh ? '轻量分析' : 'Light analysis',
    full_analysis: zh ? '完整分析' : 'Full analysis',
    continue_crawl: zh ? '继续抓取' : 'Continue crawl',
  };
  return labels[decision];
}

function modeLabel(mode: AnalysisOpportunityModeSummary, language: Language) {
  return decisionLabel(mode, language);
}

const analysisCopy = {
  zh: {
    title: 'Research 到 Data Lab 决策',
    readyHint: '当前 run 已到终态，可以判断是否进入数据分析、只保留报告，或继续补抓缺失数据。',
    waitHint: '等待 run 完成后再生成分析机会。',
    generate: '生成判断',
    score: '分析适配度',
    mode: '推荐模式',
    taskType: '主题类型',
    fields: '字段覆盖',
    missing: '缺失',
    decided: '已记录决策',
    target: '目标页',
    showDetails: '查看依据',
    hideDetails: '收起依据',
    breakdown: '评分拆解',
    fieldCoverage: '字段覆盖',
    required: '需要',
    available: '已有',
    sources: '推荐数据源',
    evidence: '证据摘录',
    warnings: '风险提示',
  },
  en: {
    title: 'Research to Data Lab Decision',
    readyHint: 'The run is terminal. Decide whether to analyze data, keep the report, or continue crawling missing data.',
    waitHint: 'Generate an analysis opportunity after the run reaches a terminal state.',
    generate: 'Evaluate',
    score: 'Fit score',
    mode: 'Mode',
    taskType: 'Topic type',
    fields: 'Fields',
    missing: 'Missing',
    decided: 'Decision saved',
    target: 'Target',
    showDetails: 'Show evidence',
    hideDetails: 'Hide evidence',
    breakdown: 'Score breakdown',
    fieldCoverage: 'Field coverage',
    required: 'Required',
    available: 'Available',
    sources: 'Recommended sources',
    evidence: 'Evidence',
    warnings: 'Warnings',
  },
};
