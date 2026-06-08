import React from 'react';
import { BarChart3, Database, RefreshCw } from 'lucide-react';
import {
  DiscoveryProviderSummary,
  FrontierItemSummary,
  FrontierScoreBreakdownSummary,
  ProviderHealthSummary,
  ResearchQueueStatusSummary,
  ResearchRunSummary,
} from '../../types';
import { Language, Translator } from '../../i18n';
import {
  labelForStatus,
  MiniMetric,
  Panel,
  ProviderStat,
  ResearchPanelCopy,
} from './shared';

export const FrontierPanel: React.FC<{
  frontier: FrontierItemSummary[];
  stats: Record<string, number>;
  language: Language;
  t: Translator;
  copy: ResearchPanelCopy;
}> = ({ frontier, stats, language, t, copy }) => (
  <Panel title={t('research.frontierView')}>
    <div className="grid grid-cols-5 gap-1 mb-3">
      {['queued', 'fetching', 'fetched', 'failed', 'skipped'].map((status) => (
        <MiniMetric key={status} label={labelForStatus(status, language)} value={stats[status] ?? 0} />
      ))}
    </div>
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {frontier.slice(0, 16).map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border-b border-stone-300 pb-2 last:border-b-0"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase opacity-50">
                {labelForStatus(item.status, language)} / {item.sourceType}
              </div>
              <div className="text-xs leading-snug truncate">{item.url}</div>
            </div>
            <div className="shrink-0 border border-stone-300 bg-stone-100 px-2 py-1 text-right">
              <div className="font-mono text-[9px] uppercase opacity-50">{copy.scoreTotal}</div>
              <div className="font-mono text-xs">{Math.round(item.priorityScore * 100)}</div>
            </div>
          </div>
          <FrontierScoreBreakdownView breakdown={item.scoreBreakdown} fallbackScore={item.priorityScore} copy={copy} />
          {item.lastError && <div className="text-xs text-rose-700 mt-1">{item.lastError}</div>}
        </a>
      ))}
    </div>
  </Panel>
);

const FrontierScoreBreakdownView: React.FC<{
  breakdown?: FrontierScoreBreakdownSummary;
  fallbackScore: number;
  copy: ResearchPanelCopy;
}> = ({ breakdown, fallbackScore, copy }) => {
  const resolved = breakdown ?? {
    topicalRelevance: fallbackScore,
    sourceAuthority: fallbackScore,
    primarySourceLikelihood: fallbackScore,
    freshness: fallbackScore,
    sourceDiversity: fallbackScore,
    linkContextQuality: fallbackScore,
    weights: {
      topicalRelevance: 0.25,
      sourceAuthority: 0.25,
      primarySourceLikelihood: 0.2,
      freshness: 0.1,
      sourceDiversity: 0.1,
      linkContextQuality: 0.1,
    },
    finalScore: fallbackScore,
  };
  const rows = [
    [copy.scoreTopical, resolved.topicalRelevance, resolved.weights.topicalRelevance],
    [copy.scoreAuthority, resolved.sourceAuthority, resolved.weights.sourceAuthority],
    [copy.scorePrimary, resolved.primarySourceLikelihood, resolved.weights.primarySourceLikelihood],
    [copy.scoreFreshness, resolved.freshness, resolved.weights.freshness],
    [copy.scoreDiversity, resolved.sourceDiversity, resolved.weights.sourceDiversity],
    [copy.scoreContext, resolved.linkContextQuality, resolved.weights.linkContextQuality],
  ] as const;

  return (
    <div className="mt-2 border border-stone-200 bg-white/70 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[9px] uppercase text-stone-500">
        <span>{copy.scoreExplainability}</span>
        <span>{copy.scoreWeight}</span>
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {rows.map(([label, value, weight]) => (
          <div key={label} className="min-w-0">
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-stone-600">
              <span className="truncate">{label}</span>
              <span className="shrink-0">{Math.round(value * 100)} / {Math.round(weight * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden bg-stone-200">
              <div className="h-full bg-stone-800" style={{ width: `${Math.round(value * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ProviderPanel: React.FC<{
  stats: ProviderStat[];
  providers: DiscoveryProviderSummary[];
  copy: ResearchPanelCopy;
  t: Translator;
  run: ResearchRunSummary | null;
  exporting: boolean;
  onExportDataSources: () => void;
  onOpenDataLab?: () => void;
}> = ({ stats, providers, copy, t, run, exporting, onExportDataSources, onOpenDataLab }) => (
  <Panel title={t('research.providerPanel')}>
    <p className="mb-3 border border-stone-300 bg-white/70 px-3 py-2 text-xs leading-5 text-stone-600">{copy.providerExplanation}</p>
    {stats.length === 0 ? (
      <p className="font-mono text-xs opacity-60">{t('research.noProviders')}</p>
    ) : (
      <div className="space-y-3">
        <DataSourceCoveragePanel
          providers={providers}
          copy={copy}
          disabled={!run || exporting}
          exporting={exporting}
          onExport={onExportDataSources}
          onOpenDataLab={onOpenDataLab}
        />
        <div className="space-y-2">
          {stats.map((stat) => (
            <div key={stat.provider} className="border border-stone-300 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs uppercase">{stat.provider}</div>
                <div className="font-mono text-[10px] opacity-50">{stat.calls} {t('research.calls')}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <MiniMetric label={t('research.candidates')} value={stat.candidates} />
                <MiniMetric label={t('research.errors')} value={stat.errors} />
                <MiniMetric label={t('research.latency')} value={`${stat.durationMs}ms`} />
              </div>
            </div>
          ))}
        </div>
        <ProviderDetailRows providers={providers} copy={copy} />
      </div>
    )}
  </Panel>
);

const DATA_SOURCE_PROVIDER_TYPES = ['data-catalog', 'structured-api', 'competition-data', 'sports-data'];

const DataSourceCoveragePanel: React.FC<{
  providers: DiscoveryProviderSummary[];
  copy: ResearchPanelCopy;
  disabled: boolean;
  exporting: boolean;
  onExport: () => void;
  onOpenDataLab?: () => void;
}> = ({ providers, copy, disabled, exporting, onExport, onOpenDataLab }) => {
  const counts = DATA_SOURCE_PROVIDER_TYPES.map((type) => ({
    type,
    count: providers.filter((provider) => provider.providerType === type).length,
    candidates: providers
      .filter((provider) => provider.providerType === type)
      .reduce((total, provider) => total + provider.candidateCount, 0),
  }));

  return (
    <div className="border border-stone-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase opacity-50">{copy.dataSourceCoverage}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={onOpenDataLab}
            disabled={!onOpenDataLab}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
          >
            <BarChart3 size={11} />
            {copy.openDataLab}
          </button>
          <button
            onClick={onExport}
            disabled={disabled}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
          >
            {exporting ? <RefreshCw size={11} className="animate-spin" /> : <Database size={11} />}
            {copy.exportDataSourcesToDataLab}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs leading-5 text-stone-600">{copy.dataSourceExportHint}</p>
      <p className="mb-3 border border-stone-300 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">{copy.dataSourceDatasetExplanation}</p>
      <div className="grid grid-cols-2 gap-2">
        {counts.map((item) => (
          <div key={item.type} className="border border-stone-300 bg-stone-100 p-2 min-w-0">
            <div className="font-mono text-[9px] opacity-50 truncate">{item.type}</div>
            <div className="font-mono text-xs truncate">{item.count}/{item.candidates}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProviderDetailRows: React.FC<{ providers: DiscoveryProviderSummary[]; copy: ResearchPanelCopy }> = ({ providers, copy }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.providerDetails}</div>
    <div className="space-y-2 max-h-52 overflow-y-auto">
      {providers.slice(0, 12).map((provider) => (
        <div key={provider.id} className="border-b border-stone-200 pb-2 last:border-b-0">
          <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
            <span className="truncate">{provider.provider}</span>
            <span className="shrink-0 opacity-60">{provider.providerType}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <MiniMetric label="query" value={provider.queryId ?? '-'} />
            <MiniMetric label="candidates" value={provider.candidateCount} />
            <MiniMetric label="time" value={`${provider.durationMs}ms`} />
          </div>
          {provider.error && <div className="mt-1 text-[10px] leading-4 text-rose-700">{provider.error}</div>}
        </div>
      ))}
    </div>
  </div>
);

export const RuntimeMonitorPanel: React.FC<{
  queueStatus: ResearchQueueStatusSummary | null;
  providerHealth: ProviderHealthSummary[];
  error: string;
  copy: ResearchPanelCopy;
}> = ({ queueStatus, providerHealth, error, copy }) => {
  const queueStages: Array<keyof Omit<ResearchQueueStatusSummary, 'names'>> = [
    'discovery',
    'frontier',
    'fetch',
    'extract',
    'analyze',
    'report',
  ];

  return (
    <Panel title={copy.runtimeMonitor}>
      <p className="mb-3 text-sm leading-6 opacity-70">{copy.runtimeMonitorHint}</p>
      {error && (
        <div className="mb-3 border border-rose-300 bg-rose-50 px-3 py-2 font-mono text-xs text-rose-700">
          {copy.monitorUnavailable}: {error}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] uppercase opacity-50">{copy.queueHealth}</div>
            <div className="truncate font-mono text-[10px] opacity-50">
              {copy.queueNames}: {queueStatus?.names?.length ? queueStatus.names.join(' / ') : '-'}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {queueStages.map((stage) => {
              const counts = queueStatus?.[stage];
              return (
                <div key={stage} className="border border-stone-300 bg-white p-3">
                  <div className="mb-2 font-mono text-xs uppercase">{stage}</div>
                  <div className="grid grid-cols-5 gap-1">
                    <MiniMetric label={copy.waiting} value={counts?.waiting ?? 0} />
                    <MiniMetric label={copy.active} value={counts?.active ?? 0} />
                    <MiniMetric label={copy.delayed} value={counts?.delayed ?? 0} />
                    <MiniMetric label={copy.errors} value={counts?.failed ?? 0} />
                    <MiniMetric label={copy.completed} value={counts?.completed ?? 0} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 font-mono text-[10px] opacity-50">{copy.providerHealth}</div>
          {providerHealth.length === 0 ? (
            <p className="border border-dashed border-stone-300 bg-white/60 p-3 font-mono text-xs opacity-60">{copy.noProviderHealth}</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {providerHealth.slice(0, 8).map((provider) => (
                <div key={provider.provider} className="border border-stone-300 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 truncate font-mono text-xs uppercase">{provider.provider}</div>
                    <div className={`shrink-0 font-mono text-[10px] ${provider.errors > 0 ? 'text-rose-700' : 'opacity-50'}`}>
                      {copy.errors}: {provider.errors}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <MiniMetric label={copy.calls} value={provider.calls} />
                    <MiniMetric label={copy.candidates} value={provider.candidateCount} />
                    <MiniMetric label={copy.latency} value={`${provider.averageDurationMs}ms`} />
                  </div>
                  {provider.lastError && <div className="mt-2 text-[10px] leading-4 text-rose-700">{provider.lastError}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};
