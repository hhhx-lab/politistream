import React from 'react';
import {
  ResearchEnvRequirementSummary,
  EnhancedFetchSmokeResultSummary,
  ResearchCapabilityAuditSummary,
  ResearchCompatibilityApiSummary,
  ResearchExportArtifactCheckSummary,
  ResearchExtractorSampleSummary,
  ResearchCapabilityProviderSummary,
  DataSourceLiveSmokeResultSummary,
  ProviderLiveSmokeResultSummary,
  PressureSmokeResultSummary,
  ResearchSampleAcceptanceKindSummary,
  ResearchSampleAcceptanceResultSummary,
  ResearchPressureTargetSummary,
} from '../../types';
import { Language } from '../../i18n';
import { MiniMetric, Panel, ResearchPanelCopy } from './shared';

export const CapabilityAuditPanel: React.FC<{
  audit: ResearchCapabilityAuditSummary | null;
  error: string;
  providerSmoke: ProviderLiveSmokeResultSummary | null;
  dataSourceSmoke: DataSourceLiveSmokeResultSummary | null;
  pressureSmoke: PressureSmokeResultSummary | null;
  sampleAcceptance: ResearchSampleAcceptanceResultSummary | null;
  enhancedFetchSmoke: EnhancedFetchSmokeResultSummary | null;
  busy: '' | 'provider' | 'data-source' | 'pressure' | 'sample-news' | 'sample-data' | 'enhanced-fetch';
  onRunProviderSmoke: () => void;
  onRunDataSourceSmoke: () => void;
  onRunPressureSmoke: () => void;
  onRunSampleAcceptance: (kind: ResearchSampleAcceptanceKindSummary) => void;
  onRunEnhancedFetchSmoke: () => void;
  copy: ResearchPanelCopy;
  language: Language;
}> = ({ audit, error, providerSmoke, dataSourceSmoke, pressureSmoke, sampleAcceptance, enhancedFetchSmoke, busy, onRunProviderSmoke, onRunDataSourceSmoke, onRunPressureSmoke, onRunSampleAcceptance, onRunEnhancedFetchSmoke, copy, language }) => (
  <Panel title={copy.capabilityAudit}>
    {error && (
      <div className="mb-3 border border-rose-300 bg-rose-50 px-3 py-2 font-mono text-xs text-rose-700">
        {copy.capabilityAuditUnavailable}: {error}
      </div>
    )}
    {!audit ? (
      <p className="font-mono text-xs opacity-60">{copy.capabilityAuditLoading}</p>
    ) : (
      <div className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="border border-stone-900 bg-stone-900 p-3 text-stone-100">
            <div className="font-mono text-[10px] uppercase opacity-60">{copy.readinessScore}</div>
            <div className="font-serif text-3xl">{audit.readinessScore}%</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label={audit.storage.label} value={audit.storage.ready ? copy.ready : copy.missing} />
            <MiniMetric label={audit.queue.label} value={audit.queue.ready ? copy.ready : copy.missing} />
          </div>
        </div>

        {audit.lastSmoke && (
          <div className="border border-stone-300 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] uppercase opacity-50">{copy.latestSmokeEvidence}</div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${statusClass(audit.lastSmoke.verdict === 'passed' ? 'passed' : audit.lastSmoke.verdict === 'limited' ? 'skipped' : 'failed')}`}>
                {audit.lastSmoke.verdict}
              </span>
            </div>
            <div className="mb-2 font-mono text-[10px] opacity-50">{new Date(audit.lastSmoke.generatedAt).toLocaleString()}</div>
            <div className="flex flex-wrap gap-1">
              {audit.lastSmoke.notes.map((note) => (
                <span key={note} className="border border-stone-300 bg-stone-100 px-2 py-1 font-mono text-[10px]">
                  {note}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-3">
          <div className="border border-stone-300 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] uppercase opacity-50">{copy.providerLiveSmoke}</div>
              <button
                onClick={onRunProviderSmoke}
                disabled={busy !== ''}
                className="border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
              >
                {busy === 'provider' ? copy.runningSmoke : copy.runProviderSmoke}
              </button>
            </div>
            <ProviderSmokeResult result={providerSmoke} copy={copy} />
          </div>
          <div className="border border-stone-300 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] uppercase opacity-50">{copy.dataSourceLiveSmoke}</div>
              <button
                onClick={onRunDataSourceSmoke}
                disabled={busy !== ''}
                className="border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
              >
                {busy === 'data-source' ? copy.runningSmoke : copy.runDataSourceSmoke}
              </button>
            </div>
            <ProviderSmokeResult result={dataSourceSmoke} copy={copy} />
          </div>
          <div className="border border-stone-300 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] uppercase opacity-50">{copy.pressureSmoke}</div>
              <button
                onClick={onRunPressureSmoke}
                disabled={busy !== ''}
                className="border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
              >
                {busy === 'pressure' ? copy.runningSmoke : copy.runPressureSmoke}
              </button>
            </div>
            <PressureSmokeResult result={pressureSmoke} copy={copy} />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <ProviderGroup title={copy.searchProviders} providers={audit.searchProviders} copy={copy} />
          <ProviderGroup title={copy.dataProviders} providers={audit.dataProviders} copy={copy} />
          <ProviderGroup title={copy.extractorCoverage} providers={[...audit.extractors, ...audit.fetch, ...audit.ai]} copy={copy} />
        </div>

        <SampleAcceptancePanel
          result={sampleAcceptance}
          busy={busy}
          copy={copy}
          onRunSampleAcceptance={onRunSampleAcceptance}
        />

        <ExtractorSamplesPanel samples={audit.extractorSamples ?? []} copy={copy} />

        <EnhancedFetchSmokePanel
          result={enhancedFetchSmoke}
          busy={busy}
          copy={copy}
          onRun={onRunEnhancedFetchSmoke}
        />

        <div className="grid gap-3 xl:grid-cols-2">
          <CompatibilityApiPanel apis={audit.compatibilityApis ?? []} copy={copy} />
          <ExportArtifactsPanel artifacts={audit.exportArtifacts ?? []} copy={copy} />
        </div>

        <EnvChecklistPanel requirements={audit.envChecklist ?? []} copy={copy} language={language} />

        <div className="border border-stone-300 bg-white p-3">
          <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.pressureTargets}</div>
          <div className="grid gap-2 md:grid-cols-3">
            {audit.pressureTargets.map((target) => (
              <PressureCard key={target.mode} target={target} copy={copy} />
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="border border-stone-300 bg-white p-3">
            <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.visibleSurfaces}</div>
            <div className="flex flex-wrap gap-1">
              {audit.frontendSurfaces.map((surface) => (
                <span key={surface} className="border border-stone-300 bg-stone-100 px-2 py-1 font-mono text-[10px]">
                  {surface}
                </span>
              ))}
            </div>
          </div>
          <div className="border border-amber-300 bg-amber-50 p-3">
            <div className="mb-2 font-mono text-[10px] uppercase text-amber-900">{copy.remainingGates}</div>
            <ul className="space-y-1 text-xs leading-5 text-amber-950">
              {audit.remainingGates.map((gate) => (
                <li key={gate} className="border-l-2 border-amber-500 pl-2">{gate}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="font-mono text-[10px] opacity-50">
          {language === 'zh' ? '生成时间' : 'Generated'}: {new Date(audit.generatedAt).toLocaleString()}
        </p>
      </div>
    )}
  </Panel>
);

const ProviderSmokeResult: React.FC<{ result: ProviderLiveSmokeResultSummary | null; copy: ResearchPanelCopy }> = ({ result, copy }) => {
  if (!result) return <p className="font-mono text-xs opacity-60">{copy.noSmokeResult}</p>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label={copy.candidates} value={result.totalCandidates} />
        <MiniMetric label={copy.status} value={result.passed ? copy.passed : copy.failed} />
      </div>
      {result.providers.map((provider) => (
        <div key={provider.provider} className="border-b border-stone-200 pb-2 last:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{provider.provider}</span>
            <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(provider.status)}`}>{provider.status}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] opacity-60">
            {provider.candidateCount} {copy.candidates} / {provider.durationMs}ms
          </div>
          {provider.sampleUrls.length > 0 && (
            <div className="mt-1 space-y-1">
              {provider.sampleUrls.slice(0, 2).map((url) => <div key={url} className="truncate text-[10px] text-stone-600">{url}</div>)}
            </div>
          )}
          {provider.error && <div className="mt-1 text-[10px] text-rose-700">{provider.error}</div>}
        </div>
      ))}
    </div>
  );
};

const PressureSmokeResult: React.FC<{ result: PressureSmokeResultSummary | null; copy: ResearchPanelCopy }> = ({ result, copy }) => {
  if (!result) return <p className="font-mono text-xs opacity-60">{copy.noSmokeResult}</p>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label={copy.status} value={result.passed ? copy.passed : copy.failed} />
        <MiniMetric label={copy.generatedTargets} value={result.targets.length} />
      </div>
      {result.targets.map((target) => (
        <div key={target.mode} className="border-b border-stone-200 pb-2 last:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-base">{target.mode} / {target.maxUrlsPerRun} URL</span>
            <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(target.status === 'passed' ? 'passed' : 'failed')}`}>{target.status}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <MiniMetric label={copy.plannedQueries} value={target.plannedQueries} />
            <MiniMetric label={copy.frontierCapacity} value={target.estimatedFrontierCapacity} />
            <MiniMetric label={copy.evidenceTarget} value={target.evidenceTarget} />
          </div>
        </div>
      ))}
    </div>
  );
};

const SampleAcceptancePanel: React.FC<{
  result: ResearchSampleAcceptanceResultSummary | null;
  busy: '' | 'provider' | 'data-source' | 'pressure' | 'sample-news' | 'sample-data' | 'enhanced-fetch';
  copy: ResearchPanelCopy;
  onRunSampleAcceptance: (kind: ResearchSampleAcceptanceKindSummary) => void;
}> = ({ result, busy, copy, onRunSampleAcceptance }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="font-mono text-[10px] uppercase opacity-50">{copy.sampleAcceptance}</div>
        <p className="mt-1 text-xs leading-5 text-stone-600">{copy.sampleAcceptanceHint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onRunSampleAcceptance('news-trace')}
          disabled={busy !== ''}
          className="border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
        >
          {busy === 'sample-news' ? copy.runningSmoke : copy.runNewsTraceAcceptance}
        </button>
        <button
          onClick={() => onRunSampleAcceptance('data-processing')}
          disabled={busy !== ''}
          className="border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
        >
          {busy === 'sample-data' ? copy.runningSmoke : copy.runDataProcessingAcceptance}
        </button>
      </div>
    </div>
    {!result ? (
      <p className="font-mono text-xs opacity-60">{copy.noSmokeResult}</p>
    ) : (
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <MiniMetric label={copy.status} value={result.status === 'passed' ? copy.passed : copy.failed} />
          <MiniMetric label={copy.kind} value={result.kind} />
          <MiniMetric label={copy.latency} value={`${result.durationMs}ms`} />
          <MiniMetric label={copy.commands} value={result.commands.length} />
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {result.checks.map((item) => (
            <div key={item.id} className="border border-stone-200 bg-stone-50 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">{item.label}</span>
                <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(item.status)}`}>{item.status}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-stone-600">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ExtractorSamplesPanel: React.FC<{ samples: ResearchExtractorSampleSummary[]; copy: ResearchPanelCopy }> = ({ samples, copy }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.extractorSamples}</div>
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {samples.map((sample) => (
        <div key={sample.name} className="border border-stone-200 bg-stone-50 p-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{sample.name}</span>
            <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(sample.status)}`}>{sample.status}</span>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-stone-500">{sample.sampleInput}</div>
          <div className="mt-1 text-[10px] leading-4 text-stone-700">{sample.sampleOutput}</div>
        </div>
      ))}
    </div>
  </div>
);

const EnhancedFetchSmokePanel: React.FC<{
  result: EnhancedFetchSmokeResultSummary | null;
  busy: '' | 'provider' | 'data-source' | 'pressure' | 'sample-news' | 'sample-data' | 'enhanced-fetch';
  copy: ResearchPanelCopy;
  onRun: () => void;
}> = ({ result, busy, copy, onRun }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="font-mono text-[10px] uppercase opacity-50">{copy.enhancedFetchSmoke}</div>
        <p className="mt-1 text-xs leading-5 text-stone-600">{copy.enhancedFetchSmokeHint}</p>
      </div>
      <button
        onClick={onRun}
        disabled={busy !== ''}
        className="border border-stone-400 px-2 py-1 font-mono text-[10px] uppercase hover:border-stone-900 disabled:opacity-50"
      >
        {busy === 'enhanced-fetch' ? copy.runningSmoke : copy.runEnhancedFetchSmoke}
      </button>
    </div>
    {!result ? (
      <p className="font-mono text-xs opacity-60">{copy.noSmokeResult}</p>
    ) : (
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {result.rows.map((row) => (
          <div key={row.provider} className="border border-stone-200 bg-stone-50 p-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs">{row.provider}</span>
              <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(row.status)}`}>{row.status}</span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-stone-500">{row.sampleInput}</div>
            <div className="mt-1 text-[10px] leading-4 text-stone-700">{row.sampleOutput}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const CompatibilityApiPanel: React.FC<{ apis: ResearchCompatibilityApiSummary[]; copy: ResearchPanelCopy }> = ({ apis, copy }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.compatibilityApis}</div>
    <div className="space-y-1">
      {apis.map((api) => (
        <div key={`${api.method}-${api.path}`} className="grid grid-cols-[3rem_minmax(0,1fr)_5rem] gap-2 border border-stone-200 bg-stone-50 px-2 py-1 font-mono text-[10px]">
          <span>{api.method}</span>
          <span className="truncate">{api.path}</span>
          <span className="text-emerald-700">{api.status}</span>
        </div>
      ))}
    </div>
  </div>
);

const ExportArtifactsPanel: React.FC<{ artifacts: ResearchExportArtifactCheckSummary[]; copy: ResearchPanelCopy }> = ({ artifacts, copy }) => (
  <div className="border border-stone-300 bg-white p-3">
    <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{copy.exportArtifactChecks}</div>
    <div className="flex flex-wrap gap-1">
      {artifacts.map((artifact) => (
        <span key={artifact.format} className="border border-emerald-300 bg-emerald-50 px-2 py-1 font-mono text-[10px] text-emerald-800">
          {artifact.format}
        </span>
      ))}
    </div>
  </div>
);

const EnvChecklistPanel: React.FC<{
  requirements: ResearchEnvRequirementSummary[];
  copy: ResearchPanelCopy;
  language: Language;
}> = ({ requirements, copy, language }) => {
  const groups: Array<{ group: ResearchEnvRequirementSummary['group']; title: string; hint: string }> = [
    { group: 'runtime', title: copy.envRuntime, hint: language === 'zh' ? '没有这组，长任务不会真正持久化或排队。' : 'Without these, long runs will not persist or queue correctly.' },
    { group: 'search', title: copy.envSearch, hint: language === 'zh' ? '至少填一个；三个都填，全网发现和新闻溯源更稳。' : 'Configure at least one; all three make discovery and verification stronger.' },
    { group: 'ai', title: copy.envAi, hint: language === 'zh' ? '至少填一个；报告和证据抽取默认输出简体中文。' : 'Configure at least one; reports and evidence summaries default to Simplified Chinese.' },
    { group: 'data', title: copy.envData, hint: language === 'zh' ? '比赛数据、宏观指标、代码仓库和公开数据集增强。' : 'Enhances competition datasets, indicators, repositories, and public data discovery.' },
    { group: 'enhanced-fetch', title: copy.envEnhancedFetch, hint: language === 'zh' ? '可选增强项；不填仍会走本地 HTTP 和浏览器 fallback。' : 'Optional boosts; local HTTP and browser fallback still work without them.' },
  ];

  return (
    <div className="border border-stone-300 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase opacity-50">{copy.envChecklist}</div>
          <p className="mt-1 text-xs leading-5 text-stone-600">{copy.envChecklistHint}</p>
        </div>
        <span className="border border-stone-300 bg-stone-100 px-2 py-1 font-mono text-[10px]">
          {requirements.filter((item) => item.configured).length}/{requirements.length} {copy.ready}
        </span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {groups.map((group) => {
          const items = requirements.filter((item) => item.group === group.group);
          if (items.length === 0) return null;
          return (
            <div key={group.group} className="border border-stone-200 bg-stone-50 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-serif text-base">{group.title}</div>
                <span className="font-mono text-[10px] opacity-50">
                  {items.filter((item) => item.configured).length}/{items.length}
                </span>
              </div>
              <p className="mb-2 text-[11px] leading-4 text-stone-600">{group.hint}</p>
              <div className="space-y-2">
                {items.map((item) => (
                  <EnvRequirementCard key={item.name} item={item} copy={copy} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EnvRequirementCard: React.FC<{ item: ResearchEnvRequirementSummary; copy: ResearchPanelCopy }> = ({ item, copy }) => (
  <div className="border border-stone-200 bg-white p-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <code className="break-all font-mono text-xs">{item.name}</code>
      <div className="flex flex-wrap gap-1">
        <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${item.configured ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>
          {item.configured ? copy.ready : copy.missing}
        </span>
        <span className="border border-stone-300 bg-stone-100 px-1.5 py-0.5 font-mono text-[9px] uppercase">
          {envLevelLabel(item.requiredLevel, copy)}
        </span>
        {item.requiredFor100 && (
          <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-amber-800">
            {copy.requiredFor100}
          </span>
        )}
      </div>
    </div>
    <p className="mt-1 text-[10px] leading-4 text-stone-700">{item.impact}</p>
    <p className="mt-1 border-l border-stone-300 pl-2 text-[10px] leading-4 text-stone-500">{item.howToGet}</p>
  </div>
);

function envLevelLabel(level: ResearchEnvRequirementSummary['requiredLevel'], copy: ResearchPanelCopy) {
  if (level === 'required') return copy.envRequired;
  if (level === 'at-least-one') return copy.envAtLeastOne;
  if (level === 'recommended') return copy.envRecommended;
  return copy.envOptional;
}

const ProviderGroup: React.FC<{
  title: string;
  providers: ResearchCapabilityProviderSummary[];
  copy: ResearchPanelCopy;
}> = ({ title, providers, copy }) => (
  <div className="border border-stone-300 bg-white p-3 min-w-0">
    <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{title}</div>
    <div className="space-y-2">
      {providers.map((provider) => (
        <div key={`${provider.category}-${provider.name}`} className="border-b border-stone-200 pb-2 last:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-xs">{provider.name}</span>
            <span className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase ${provider.configured ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>
              {provider.configured ? copy.ready : copy.missing}
            </span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase opacity-50">
            {provider.coverage}{provider.requiredFor100 ? ` / ${copy.requiredFor100}` : ''}
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-600">{provider.detail}</p>
        </div>
      ))}
    </div>
  </div>
);

const PressureCard: React.FC<{ target: ResearchPressureTargetSummary; copy: ResearchPanelCopy }> = ({ target, copy }) => (
  <div className="border border-stone-300 bg-stone-100 p-3">
    <div className="flex items-center justify-between gap-2">
      <div className="font-serif text-lg">{target.mode} / {target.maxUrlsPerRun} URL</div>
      <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${target.status === 'implemented' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
        {target.status === 'implemented' ? copy.implemented : copy.needsPressureSmoke}
      </span>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2">
      <MiniMetric label={copy.depthLabel} value={target.maxDepth} />
      <MiniMetric label={copy.domainsLabel} value={target.maxDomainsPerRun} />
      <MiniMetric label={copy.evidenceTarget} value={target.evidenceTarget} />
    </div>
  </div>
);

function statusClass(status: string) {
  if (status === 'passed') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'skipped') return 'border-stone-300 bg-stone-100 text-stone-700';
  return 'border-rose-300 bg-rose-50 text-rose-800';
}
