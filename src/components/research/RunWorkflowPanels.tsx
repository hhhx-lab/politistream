import React from 'react';
import { Plus, RotateCcw, Search } from 'lucide-react';
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
  safeDomain,
  stripHeadlineTags,
  isStageActive,
  ResearchPanelCopy,
} from './shared';

export const RunTimeline: React.FC<{
  run: ResearchRunSummary | null;
  events: ResearchRunEvent[];
  language: Language;
  t: Translator;
}> = ({ run, events, language, t }) => (
  <Panel title={t('research.timeline')}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      {RUN_STAGES.map((stage) => (
        <div key={stage} className={`border px-3 py-2 ${isStageActive(run, stage) ? 'border-stone-900 bg-white' : 'border-stone-300 bg-stone-100'}`}>
          <div className="font-mono text-[10px] uppercase opacity-50">{labelForStatus(stage, language)}</div>
          <div className="h-1 bg-stone-300 mt-2">
            <div className={`h-full ${isStageActive(run, stage) ? 'bg-emerald-700' : 'bg-transparent'}`} />
          </div>
        </div>
      ))}
    </div>
    <div className="space-y-2 max-h-44 overflow-y-auto">
      {events.length === 0 ? (
        <p className="font-mono text-xs opacity-60">{t('research.noEvents')}</p>
      ) : events.slice(-12).reverse().map((event) => (
        <div key={event.id} className="border-b border-stone-300 pb-2 last:border-b-0">
          <div className="font-mono text-[10px] uppercase opacity-50">{formatDate(event.createdAt)} / {labelForStatus(event.stage, language)}</div>
          <div className="text-sm leading-snug">{event.message}</div>
        </div>
      ))}
    </div>
  </Panel>
);

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
        <p className="border border-dashed border-stone-300 bg-white/60 p-3 font-mono text-xs opacity-60">{copy.noSearchResults}</p>
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
            {plan.subQuestions.slice(0, 6).map((question) => (
              <li key={question} className="text-xs leading-5 border-l-2 border-stone-400 pl-2">{question}</li>
            ))}
          </ul>
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
