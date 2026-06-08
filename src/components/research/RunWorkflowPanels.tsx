import React, { useMemo } from 'react';
import { Check, CircleDot, Clock3, Plus, RotateCcw, Search, TriangleAlert } from 'lucide-react';
import {
  DocumentSearchResultSummary,
  PlannedQuerySummary,
  ResearchNewsAnalysisResponse,
  ResearchPlanSummary,
  ResearchRunEvent,
  ResearchRunSummary,
} from '../../types';
import { Language, Translator } from '../../i18n';
import {
  formatDate,
  formatScore,
  labelForStatus,
  MiniMetric,
  Panel,
  RUN_STAGES,
  isTerminalRun,
  safeDomain,
  stripHeadlineTags,
  ResearchPanelCopy,
} from './shared';

export const RunTimeline: React.FC<{
  run: ResearchRunSummary | null;
  events: ResearchRunEvent[];
  language: Language;
  t: Translator;
}> = ({ run, events, language, t }) => {
  const stageRows = useMemo(() => buildTimelineStages(run, events, language), [run, events, language]);
  const activeIndex = stageRows.findIndex((stage) => stage.state === 'active');
  const completedCount = stageRows.filter((stage) => stage.state === 'done').length;
  const failedEvent = [...events].reverse().find((event) => event.level === 'error');
  const latestEvent = events.at(-1);
  const headline = run
    ? stageRows.find((stage) => stage.state === 'active')?.message
      || latestEvent?.message
      || (language === 'zh' ? '等待下一条 run 事件。' : 'Waiting for the next run event.')
    : (language === 'zh' ? '还没有选中 run。' : 'No run selected yet.');

  return (
    <Panel title={t('research.timeline')}>
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="border border-stone-900 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase text-stone-500">{language === 'zh' ? '当前流水线' : 'Current pipeline'}</div>
              <div className="mt-1 text-sm leading-5">{headline}</div>
            </div>
            <div className="shrink-0 border border-stone-300 bg-stone-100 px-3 py-2 text-right">
              <div className="font-mono text-[9px] uppercase text-stone-500">{language === 'zh' ? '阶段进度' : 'Stage progress'}</div>
              <div className="font-mono text-sm">{completedCount}/{RUN_STAGES.length}</div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden bg-stone-200">
            <div
              className={`h-full ${run?.status === 'failed' ? 'bg-rose-700' : run?.status === 'cancelled' ? 'bg-amber-700' : 'bg-emerald-700'}`}
              style={{ width: `${Math.round((Math.max(0, activeIndex) + (isTerminalRun(run?.status ?? '') ? 1 : 0)) / RUN_STAGES.length * 100)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          <MiniMetric label={language === 'zh' ? '当前阶段' : 'Stage'} value={run ? labelForStatus(run.stage, language) : '-'} />
          <MiniMetric label={language === 'zh' ? '事件数' : 'Events'} value={events.length} />
          <MiniMetric label={language === 'zh' ? '错误' : 'Errors'} value={events.filter((event) => event.level === 'error').length} />
        </div>
      </div>

      <div className="relative mb-5 overflow-x-auto pb-2">
        <div className="absolute left-4 right-4 top-6 hidden h-0.5 bg-stone-300 md:block" />
        <div className="grid min-w-[58rem] grid-cols-8 gap-2">
          {stageRows.map((stage, index) => (
            <TimelineStageCard key={stage.stage} stage={stage} index={index} language={language} />
          ))}
        </div>
      </div>

      {failedEvent && (
        <div className="mb-4 border border-rose-300 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900">
          <div className="font-mono text-[10px] uppercase opacity-70">{language === 'zh' ? '最近错误' : 'Latest error'} / {labelForStatus(failedEvent.stage, language)} / {formatDate(failedEvent.createdAt)}</div>
          <div className="mt-1">{failedEvent.message}</div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="border border-stone-300 bg-white p-3">
          <div className="font-mono text-[10px] uppercase text-stone-500">{language === 'zh' ? '事件流' : 'Event stream'}</div>
          <p className="mt-2 text-xs leading-5 text-stone-600">
            {language === 'zh'
              ? '按时间展示真实 run_events；不是静态步骤图。'
              : 'Chronological run_events, not a static step diagram.'}
          </p>
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {events.length === 0 ? (
            <p className="border border-dashed border-stone-300 bg-white/60 p-3 font-mono text-xs opacity-60">{t('research.noEvents')}</p>
          ) : events.slice(-14).reverse().map((event) => (
            <div key={event.id} className={`border bg-white p-3 ${event.level === 'error' ? 'border-rose-300' : event.level === 'warn' ? 'border-amber-300' : 'border-stone-300'}`}>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase opacity-60">
                <span>{formatDate(event.createdAt)}</span>
                <span>/</span>
                <span>{labelForStatus(event.stage, language)}</span>
                <span>/</span>
                <span>{event.level}</span>
              </div>
              <div className="mt-1 text-sm leading-snug">{event.message}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
};

type TimelineStageState = 'done' | 'active' | 'waiting' | 'failed' | 'cancelled';

interface TimelineStageRow {
  stage: ResearchRunSummary['stage'];
  state: TimelineStageState;
  label: string;
  message: string;
  eventCount: number;
  latestEvent?: ResearchRunEvent;
}

function buildTimelineStages(
  run: ResearchRunSummary | null,
  events: ResearchRunEvent[],
  language: Language,
): TimelineStageRow[] {
  const currentIndex = run ? RUN_STAGES.indexOf(run.stage) : -1;
  const terminalIndex = run && isTerminalRun(run.status) ? RUN_STAGES.length - 1 : currentIndex;

  return RUN_STAGES.map((stage, index) => {
    const stageEvents = events.filter((event) => event.stage === stage);
    const latestEvent = stageEvents.at(-1);
    const hasError = stageEvents.some((event) => event.level === 'error');
    let state: TimelineStageState = 'waiting';

    if (run?.status === 'cancelled' && index === currentIndex) {
      state = 'cancelled';
    } else if ((run?.status === 'failed' && index === currentIndex) || hasError) {
      state = 'failed';
    } else if (index < currentIndex || (run?.status === 'completed' && index <= terminalIndex)) {
      state = 'done';
    } else if (index === currentIndex) {
      state = 'active';
    }

    return {
      stage,
      state,
      label: labelForStatus(stage, language),
      message: latestEvent?.message ?? defaultStageMessage(stage, state, language),
      eventCount: stageEvents.length,
      latestEvent,
    };
  });
}

function defaultStageMessage(stage: ResearchRunSummary['stage'], state: TimelineStageState, language: Language) {
  if (state === 'waiting') return language === 'zh' ? '等待前置阶段完成。' : 'Waiting for prior stages.';
  const zh: Record<string, string> = {
    planning: '拆解研究主题、子问题和检索式。',
    discovery: '调用搜索和数据 provider 发现候选来源。',
    frontier: '按优先级整理待抓取 URL。',
    fetching: '抓取网页、文档和结构化数据。',
    extracting: '抽取正文、链接、表格和元数据。',
    analyzing: '抽取 claim、evidence 和冲突关系。',
    reporting: '生成中文摘要、证据表和报告。',
    completed: '研究 run 已完成。',
  };
  const en: Record<string, string> = {
    planning: 'Break topic into questions and queries.',
    discovery: 'Call search and data providers.',
    frontier: 'Prioritize URLs for crawling.',
    fetching: 'Fetch pages, documents, and data.',
    extracting: 'Extract text, links, tables, and metadata.',
    analyzing: 'Extract claims, evidence, and conflicts.',
    reporting: 'Generate Chinese summary and report.',
    completed: 'Research run completed.',
  };
  return (language === 'zh' ? zh : en)[stage] ?? stage;
}

const TimelineStageCard: React.FC<{
  stage: TimelineStageRow;
  index: number;
  language: Language;
}> = ({ stage, index, language }) => {
  const style = {
    done: {
      card: 'border-emerald-300 bg-emerald-50',
      dot: 'border-emerald-700 bg-emerald-700 text-white',
      bar: 'bg-emerald-700',
      icon: <Check size={13} />,
    },
    active: {
      card: 'border-stone-900 bg-white shadow-[0_0_0_1px_#141414]',
      dot: 'border-stone-900 bg-stone-900 text-white',
      bar: 'bg-stone-900',
      icon: <CircleDot size={13} />,
    },
    waiting: {
      card: 'border-stone-300 bg-stone-100 text-stone-500',
      dot: 'border-stone-300 bg-stone-100 text-stone-500',
      bar: 'bg-stone-300',
      icon: <Clock3 size={13} />,
    },
    failed: {
      card: 'border-rose-300 bg-rose-50 text-rose-950',
      dot: 'border-rose-700 bg-rose-700 text-white',
      bar: 'bg-rose-700',
      icon: <TriangleAlert size={13} />,
    },
    cancelled: {
      card: 'border-amber-300 bg-amber-50 text-amber-950',
      dot: 'border-amber-700 bg-amber-700 text-white',
      bar: 'bg-amber-700',
      icon: <TriangleAlert size={13} />,
    },
  }[stage.state];

  return (
    <div className={`relative border p-3 ${style.card}`}>
      <div className={`relative z-10 mb-3 flex h-7 w-7 items-center justify-center rounded-full border ${style.dot}`}>
        {style.icon}
      </div>
      <div className="font-mono text-[9px] uppercase opacity-60">
        {String(index + 1).padStart(2, '0')} / {stage.state}
      </div>
      <div className="mt-1 font-serif text-lg leading-tight">{stage.label}</div>
      <div className="mt-2 h-1.5 overflow-hidden bg-white/70">
        <div className={`h-full ${style.bar}`} style={{ width: stage.state === 'waiting' ? '0%' : '100%' }} />
      </div>
      <p className="mt-2 line-clamp-3 min-h-12 text-xs leading-4">{stage.message}</p>
      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[9px] uppercase opacity-60">
        <span>{language === 'zh' ? '事件' : 'Events'} {stage.eventCount}</span>
        <span>{stage.latestEvent?.createdAt ? formatDate(stage.latestEvent.createdAt) : '-'}</span>
      </div>
    </div>
  );
};

export const ManualRunControls: React.FC<{
  run: ResearchRunSummary | null;
  query: string;
  onQueryChange: (value: string) => void;
  onAppendQuery: () => void;
  onRetryFailed: () => void;
  busy: 'query' | 'retry' | '';
  failedCount: number;
  copy: ResearchPanelCopy;
  language: Language;
}> = ({ run, query, onQueryChange, onAppendQuery, onRetryFailed, busy, failedCount, copy, language }) => (
  <Panel title={copy.manualIteration}>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAppendQuery();
            }}
            disabled={!run || busy !== ''}
            placeholder={copy.manualQueryPlaceholder}
            className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={onAppendQuery}
            disabled={!run || !query.trim() || busy !== ''}
            className="inline-flex items-center justify-center gap-2 border border-stone-900 bg-stone-900 px-3 py-2 text-sm text-stone-100 disabled:opacity-40"
          >
            <Plus size={14} />
            {busy === 'query' ? labelForStatus('queued', language) : copy.appendQuery}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-stretch gap-2">
        <MiniMetric label={copy.retryFailed} value={failedCount} />
        <button
          onClick={onRetryFailed}
          disabled={!run || busy !== ''}
          className="inline-flex w-11 items-center justify-center border border-stone-400 bg-white hover:bg-stone-100 disabled:opacity-40"
          title={copy.retryFailed}
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  </Panel>
);

export const RunDocumentSearchPanel: React.FC<{
  run: ResearchRunSummary | null;
  query: string;
  results: DocumentSearchResultSummary[];
  busy: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelectDocument: (id: string) => void;
  copy: ResearchPanelCopy;
  language: Language;
}> = ({ run, query, results, busy, onQueryChange, onSearch, onSelectDocument, copy, language }) => (
  <Panel title={copy.documentSearch}>
    <p className="mb-3 text-sm leading-6 opacity-70">{copy.documentSearchHint}</p>
    <p className="mb-3 border border-stone-300 bg-white/70 px-3 py-2 text-xs leading-5 text-stone-600">{copy.documentCountHint}</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSearch();
        }}
        disabled={!run || busy}
        placeholder={copy.documentSearchPlaceholder}
        className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2 text-sm"
      />
      <button
        onClick={onSearch}
        disabled={!run || busy || !query.trim()}
        className="inline-flex items-center justify-center gap-2 border border-stone-900 bg-stone-900 px-3 py-2 text-sm text-stone-100 disabled:opacity-40"
      >
        <Search size={14} />
        {busy ? labelForStatus('running', language) : copy.searchDocuments}
      </button>
    </div>

    <div className="mt-3 space-y-2">
      {results.length === 0 ? (
        <p className="border border-dashed border-stone-300 bg-white/60 p-3 text-xs leading-5 opacity-70">{copy.noSearchResults} {copy.documentCountHint}</p>
      ) : results.slice(0, 8).map((result) => (
        <button
          key={`${result.documentId}-${result.url}`}
          onClick={() => onSelectDocument(result.documentId)}
          className="w-full border border-stone-300 bg-white p-3 text-left hover:border-stone-900 hover:bg-stone-100"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-serif text-lg leading-tight line-clamp-1">{result.title || result.url}</div>
              <div className="mt-1 truncate font-mono text-[10px] uppercase opacity-50">{safeDomain(result.url)}</div>
            </div>
            <span className="shrink-0 font-mono text-[10px] opacity-50">
              {copy.searchRank}: {formatScore(result.rank)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase text-stone-500">
            {result.status ? <span>{copy.status}: {labelForStatus(result.status, language)}</span> : null}
            <span>{language === 'zh' ? '域名' : 'Domain'}: {result.domain || safeDomain(result.url)}</span>
            {typeof result.matchCount === 'number' ? (
              <span>{language === 'zh' ? '命中词' : 'Matches'}: {result.matchCount}</span>
            ) : null}
          </div>
          <div className="mt-2 text-xs leading-5 line-clamp-3">{stripHeadlineTags(result.snippet)}</div>
        </button>
      ))}
    </div>
  </Panel>
);

export const NewsAnalysisPanel: React.FC<{
  run: ResearchRunSummary | null;
  result: ResearchNewsAnalysisResponse | null;
  busy: ResearchNewsAnalysisResponse['endpoint'] | '';
  onRun: (endpoint: ResearchNewsAnalysisResponse['endpoint']) => void;
  copy: ResearchPanelCopy;
  language: Language;
}> = ({ run, result, busy, onRun, copy, language }) => {
  const actions: Array<{ endpoint: ResearchNewsAnalysisResponse['endpoint']; label: string }> = [
    { endpoint: 'cluster', label: copy.newsCluster },
    { endpoint: 'timeline', label: copy.newsTimeline },
    { endpoint: 'source-quality', label: copy.newsSourceQuality },
  ];

  return (
    <Panel title={copy.newsAnalysis}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0">
          <p className="text-sm leading-6 opacity-70">{copy.newsAnalysisHint}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <MiniMetric label={copy.documentsAnalyzed} value={result?.documentCount ?? 0} />
            <MiniMetric label={copy.duplicateCount} value={result?.duplicateCount ?? 0} />
            <MiniMetric label={copy.clusters} value={result?.clusters.length ?? 0} />
            <MiniMetric label={copy.timelineItems} value={result?.timeline.length ?? 0} />
            <MiniMetric label={copy.sourceQuality} value={result?.sourceProfiles.length ?? 0} />
          </div>
        </div>
        <div className="grid gap-2">
          {actions.map((action) => (
            <button
              key={action.endpoint}
              onClick={() => onRun(action.endpoint)}
              disabled={!run || busy !== ''}
              className="inline-flex items-center justify-between gap-2 border border-stone-900 bg-white px-3 py-2 text-left text-sm hover:bg-stone-100 disabled:opacity-40"
            >
              <span>{action.label}</span>
              <span className="font-mono text-[10px] uppercase opacity-60">
                {busy === action.endpoint ? labelForStatus('running', language) : copy.runNewsAnalysis}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!result ? (
        <p className="mt-4 border border-dashed border-stone-300 bg-white/60 p-3 font-mono text-xs opacity-60">{copy.noNewsAnalysis}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {result.documentCount === 0 && (
            <p className="border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{copy.newsAnalysisEmptyReason}</p>
          )}
          {result.clusters.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.newsCluster}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {result.clusters.slice(0, 6).map((cluster) => (
                  <div key={cluster.id} className="border border-stone-300 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 font-serif text-lg leading-tight">{cluster.canonicalTitle}</div>
                      <span className="shrink-0 font-mono text-[10px] opacity-50">{cluster.sourceCount} src</span>
                    </div>
                    {cluster.entityHints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {cluster.entityHints.slice(0, 6).map((entity) => (
                          <span key={entity} className="border border-stone-300 bg-stone-100 px-2 py-1 font-mono text-[10px]">
                            {entity}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      {cluster.documents.slice(0, 3).map((document) => (
                        <a key={`${cluster.id}-${document.index}-${document.url}`} href={document.url} target="_blank" rel="noopener noreferrer" className="block border-l-2 border-stone-400 pl-2 text-xs leading-5 hover:bg-stone-100">
                          <div className="font-mono opacity-50">{document.sourceTier ?? '-'} / {document.source || safeDomain(document.url)}</div>
                          <div className="line-clamp-2">{document.title || document.url}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.timeline.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.newsTimeline}</div>
              <div className="space-y-2">
                {result.timeline.slice(0, 8).map((item, index) => (
                  <a key={`${item.date}-${item.url}-${index}`} href={item.url} target="_blank" rel="noopener noreferrer" className="grid gap-2 border border-stone-300 bg-white p-3 text-sm hover:bg-stone-100 md:grid-cols-[8rem_minmax(0,1fr)_9rem]">
                    <span className="font-mono text-[10px] opacity-60">{formatDate(item.date)}</span>
                    <span className="min-w-0 leading-snug">{item.title}</span>
                    <span className="truncate font-mono text-[10px] opacity-60">{item.source || safeDomain(item.url)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.sourceProfiles.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.newsSourceQuality}</div>
              <div className="overflow-x-auto border border-stone-300 bg-white">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead>
                    <tr className="bg-stone-100">
                      <th className="border-b border-stone-300 px-3 py-2 font-mono uppercase opacity-60">{language === 'zh' ? '来源' : 'Source'}</th>
                      <th className="border-b border-stone-300 px-3 py-2 font-mono uppercase opacity-60">{language === 'zh' ? '等级' : 'Tier'}</th>
                      <th className="border-b border-stone-300 px-3 py-2 font-mono uppercase opacity-60">{language === 'zh' ? '文档' : 'Docs'}</th>
                      <th className="border-b border-stone-300 px-3 py-2 font-mono uppercase opacity-60">{language === 'zh' ? '官方概率' : 'Official'}</th>
                      <th className="border-b border-stone-300 px-3 py-2 font-mono uppercase opacity-60">{language === 'zh' ? '主流概率' : 'Mainstream'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sourceProfiles.slice(0, 10).map((profile) => (
                      <tr key={`${profile.source}-${profile.domain ?? ''}`}>
                        <td className="border-b border-stone-200 px-3 py-2">{profile.domain ?? profile.source}</td>
                        <td className="border-b border-stone-200 px-3 py-2 font-mono">{profile.tier ?? profile.authorityTier ?? '-'}</td>
                        <td className="border-b border-stone-200 px-3 py-2 font-mono">{profile.documentCount}</td>
                        <td className="border-b border-stone-200 px-3 py-2 font-mono">{Math.round((profile.officialLikelihood ?? 0) * 100)}%</td>
                        <td className="border-b border-stone-200 px-3 py-2 font-mono">{Math.round((profile.mainstreamLikelihood ?? 0) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

export const QueryPlanPanel: React.FC<{
  plan: ResearchPlanSummary | null;
  plannedQueries: PlannedQuerySummary[];
  fallbackQueries: string[];
  copy: ResearchPanelCopy;
  t: Translator;
}> = ({ plan, plannedQueries, fallbackQueries, copy, t }) => {
  const queries = plannedQueries.length > 0
    ? plannedQueries
    : fallbackQueries.map((text, index) => ({
        id: `legacy-${index + 1}`,
        text,
        purpose: 'legacy',
        sourceTypes: [],
        language: '',
        priority: 0,
      }));

  return (
    <Panel title={t('research.queryPlan')}>
      {plan && (
        <div className="grid md:grid-cols-4 gap-2 mb-4">
          <MiniMetric label={copy.taskType} value={plan.taskType} />
          <MiniMetric label={copy.freshness} value={plan.freshness} />
          <MiniMetric label={copy.requiredSources} value={plan.requiredSourceTypes.slice(0, 4).join(', ') || '-'} />
          <MiniMetric label={copy.stopConditions} value={plan.stopConditions.length} />
        </div>
      )}

      {plan?.subQuestions?.length ? (
        <div className="mb-4 border border-stone-300 bg-white p-3">
          <div className="font-mono text-[10px] uppercase opacity-50 mb-2">{copy.subQuestions}</div>
          <ul className="space-y-1">
            {plan.subQuestions.slice(0, 18).map((question) => (
              <li key={question} className="text-xs leading-5 border-l-2 border-stone-400 pl-2">{question}</li>
            ))}
          </ul>
          {plan.subQuestions.length > 18 ? (
            <div className="mt-2 font-mono text-[10px] uppercase opacity-50">+{plan.subQuestions.length - 18}</div>
          ) : null}
        </div>
      ) : null}

      {queries.length === 0 ? (
        <p className="font-mono text-xs opacity-60">{t('research.reportNotReady')}</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {queries.slice(0, 20).map((query) => (
            <div key={query.id} className="border border-stone-300 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase opacity-50 mb-2">
                <span>{copy.purpose}: {query.purpose}</span>
                <span>/</span>
                <span>{copy.priority}: {Math.round(query.priority)}</span>
                {query.language && (
                  <>
                    <span>/</span>
                    <span>{query.language}</span>
                  </>
                )}
              </div>
              <div className="text-sm leading-snug">{query.text}</div>
              {query.sourceTypes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {query.sourceTypes.map((sourceType) => (
                    <span key={sourceType} className="border border-stone-300 bg-stone-100 px-2 py-1 text-[10px] font-mono uppercase">
                      {sourceType}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};
