import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CirclePause,
  ExternalLink,
  FileSearch,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  DiscoveryProviderSummary,
  EvidenceClaimSummary,
  EvidenceItemSummary,
  ResearchDocumentAssetSummary,
  FrontierItemSummary,
  ResearchDocumentSummary,
  ResearchJobSummary,
  ResearchReportSummary,
  ResearchRunResponse,
  ResearchRunStatus,
  ResearchRunSummary,
  ResearchRunEvent,
  SourceProfileSummary,
} from '../types';
import { Language, Translator } from '../i18n';

interface ResearchPanelProps {
  selectedJobId?: string;
  onSelectedJobChange?: (id: string | undefined) => void;
  onBackToSearch?: () => void;
  language: Language;
  t: Translator;
}

const RUN_STAGES: ResearchRunStatus[] = [
  'planning',
  'discovery',
  'frontier',
  'fetching',
  'extracting',
  'analyzing',
  'reporting',
  'completed',
];

export const ResearchPanel: React.FC<ResearchPanelProps> = ({
  selectedJobId,
  onSelectedJobChange,
  onBackToSearch,
  language,
  t,
}) => {
  const [jobs, setJobs] = useState<ResearchJobSummary[]>([]);
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<ResearchJobSummary | null>(null);
  const [selectedRun, setSelectedRun] = useState<ResearchRunSummary | null>(null);
  const [topic, setTopic] = useState('');
  const [report, setReport] = useState<ResearchReportSummary | null>(null);
  const [documents, setDocuments] = useState<ResearchDocumentSummary[]>([]);
  const [assets, setAssets] = useState<ResearchDocumentAssetSummary[]>([]);
  const [frontier, setFrontier] = useState<FrontierItemSummary[]>([]);
  const [events, setEvents] = useState<ResearchRunEvent[]>([]);
  const [claims, setClaims] = useState<EvidenceClaimSummary[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItemSummary[]>([]);
  const [sources, setSources] = useState<SourceProfileSummary[]>([]);
  const [providers, setProviders] = useState<DiscoveryProviderSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];
  const sourceByDomain = useMemo(() => new Map(sources.map((source) => [source.domain, source])), [sources]);
  const providerStats = useMemo(() => summarizeProviders(providers), [providers]);
  const frontierStats = useMemo(() => summarizeFrontier(frontier), [frontier]);

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
    setProviders([]);
    setAssets([]);
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
    setSelectedRun(run);
    const [detailRes, eventsRes, frontierRes, documentsRes, assetsRes, evidenceRes, sourcesRes, providersRes] = await Promise.all([
      fetch(`/api/research/runs/${run.id}`),
      fetch(`/api/research/runs/${run.id}/events`),
      fetch(`/api/research/runs/${run.id}/frontier`),
      fetch(`/api/research/runs/${run.id}/documents`),
      fetch(`/api/research/runs/${run.id}/assets`),
      fetch(`/api/research/runs/${run.id}/evidence`),
      fetch(`/api/research/runs/${run.id}/sources`),
      fetch(`/api/research/runs/${run.id}/providers`),
    ]);

    const [detail, eventsData, frontierData, documentsData, assetsData, evidenceData, sourcesData, providersData] = await Promise.all([
      detailRes.json(),
      eventsRes.json(),
      frontierRes.json(),
      documentsRes.json(),
      assetsRes.json(),
      evidenceRes.json(),
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
    setSelectedDocumentId((documentsData.documents ?? [])[0]?.id ?? '');
    setClaims(evidenceData.claims ?? []);
    setEvidence(evidenceData.evidence ?? []);
    setSources(sourcesData.sources ?? []);
    setProviders(providersData.providers ?? []);
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

  useEffect(() => {
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
    }, 4000);
    return () => window.clearInterval(timer);
  }, [selectedRun?.id, selectedRun?.status]);

  return (
    <div className="h-full flex bg-[#E4E3E0] text-[#141414]">
      <aside className="w-[21rem] border-r border-[#141414] bg-[#F5F5F4] flex flex-col">
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

        <div className="overflow-y-auto flex-1">
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

      <main className="flex-1 min-w-0 overflow-y-auto p-5">
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
                </div>
              </div>

              <RunTimeline run={selectedRun} events={events} language={language} t={t} />

              <div className="grid md:grid-cols-4 gap-3">
                <Metric label={t('research.docs')} value={documents.length} />
                <Metric label={t('research.frontier')} value={frontier.length} />
                <Metric label={t('research.claims')} value={claims.length} />
                <Metric label={t('research.providers')} value={providers.length} />
              </div>

              <Panel title={t('research.latestReport')}>
                {report?.markdown ? (
                  <pre className="whitespace-pre-wrap text-sm leading-6 font-sans">{report.markdown}</pre>
                ) : (
                  <p className="font-mono text-sm opacity-60">{t('research.reportNotReady')}</p>
                )}
              </Panel>

              <EvidenceTable claims={claims} evidence={evidence} language={language} t={t} />
            </section>

            <aside className="space-y-5 min-w-0">
              <SourceExplorer
                documents={documents}
                selectedDocument={selectedDocument}
                assets={assets}
                claims={claims}
                evidence={evidence}
                sourceByDomain={sourceByDomain}
                onSelect={setSelectedDocumentId}
                language={language}
                t={t}
              />
              <FrontierPanel frontier={frontier} stats={frontierStats} language={language} t={t} />
              <ProviderPanel stats={providerStats} t={t} />
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

const RunTimeline: React.FC<{
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

const EvidenceTable: React.FC<{
  claims: EvidenceClaimSummary[];
  evidence: EvidenceItemSummary[];
  language: Language;
  t: Translator;
}> = ({ claims, evidence, language, t }) => (
  <Panel title={t('research.evidenceTable')}>
    {claims.length === 0 ? (
      <p className="font-mono text-xs opacity-60">{t('research.noEvidence')}</p>
    ) : (
      <div className="space-y-3">
        {claims.slice(0, 10).map((claim) => {
          const supporting = evidence.filter((item) => claim.supportingEvidenceIds.includes(item.id));
          return (
            <div key={claim.id} className="border border-stone-300 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm leading-snug">{claim.claim}</div>
                <span className="font-mono text-[10px] uppercase whitespace-nowrap">{labelForStatus(claim.status, language)} / {Math.round(claim.confidence * 100)}%</span>
              </div>
              <div className="mt-3 space-y-2">
                {supporting.slice(0, 3).map((item) => (
                  <a key={item.id} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-xs border-l-2 border-emerald-700 pl-3 hover:bg-stone-100">
                    <div className="font-mono opacity-50 mb-1">{t('research.credibility')}: {Math.round((item.credibilityScore ?? 0) * 100)}%</div>
                    <div className="line-clamp-2">{item.snippet}</div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Panel>
);

const SourceExplorer: React.FC<{
  documents: ResearchDocumentSummary[];
  selectedDocument?: ResearchDocumentSummary;
  assets: ResearchDocumentAssetSummary[];
  claims: EvidenceClaimSummary[];
  evidence: EvidenceItemSummary[];
  sourceByDomain: Map<string, SourceProfileSummary>;
  onSelect: (id: string) => void;
  language: Language;
  t: Translator;
}> = ({ documents, selectedDocument, assets, claims, evidence, sourceByDomain, onSelect, language, t }) => {
  const profile = selectedDocument ? sourceByDomain.get(selectedDocument.domain) : undefined;
  const selectedEvidence = selectedDocument
    ? evidence.filter((item) => item.documentId === selectedDocument.id)
    : [];
  const selectedEvidenceIds = new Set(selectedEvidence.map((item) => item.id));
  const selectedClaims = claims.filter((claim) => (
    claim.supportingEvidenceIds.some((id) => selectedEvidenceIds.has(id))
    || claim.conflictingEvidenceIds.some((id) => selectedEvidenceIds.has(id))
    || selectedEvidence.some((item) => item.claimId === claim.id)
  ));
  const selectedAssets = selectedDocument
    ? assets.filter((asset) => asset.documentId === selectedDocument.id)
    : [];
  return (
    <Panel title={t('research.sourceExplorer')}>
      <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
        {documents.length === 0 ? (
          <p className="font-mono text-xs opacity-60">{t('research.noDocuments')}</p>
        ) : documents.map((document) => (
          <button
            key={document.id}
            onClick={() => onSelect(document.id)}
            className={`w-full text-left border px-3 py-2 ${selectedDocument?.id === document.id ? 'border-stone-900 bg-white' : 'border-stone-300 bg-stone-100 hover:bg-white'}`}
          >
            <div className="font-mono text-[10px] uppercase opacity-50">{document.status} / {labelForMemoryStatus(document.memoryStatus, language)} / {document.domain}</div>
            <div className="text-sm leading-snug truncate">{document.title || document.url}</div>
          </button>
        ))}
      </div>
      {selectedDocument && (
        <div className="border-t border-stone-300 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase opacity-50">{selectedDocument.domain}</div>
              <div className="font-serif text-lg leading-tight">{selectedDocument.title || selectedDocument.url}</div>
            </div>
            <a href={selectedDocument.finalUrl || selectedDocument.url} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-stone-200 rounded" title={t('research.openSource')}>
              <ExternalLink size={15} />
            </a>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MiniMetric label={t('research.tier')} value={profile?.authorityTier ?? 'T4'} />
            <MiniMetric label={t('research.official')} value={`${Math.round((profile?.officialLikelihood ?? 0) * 100)}%`} />
            <MiniMetric label={t('research.mainstream')} value={`${Math.round((profile?.mainstreamLikelihood ?? 0) * 100)}%`} />
          </div>
          <div className="mt-2">
            <MiniMetric label={language === 'zh' ? '记忆状态' : 'Memory'} value={labelForMemoryStatus(selectedDocument.memoryStatus, language)} />
          </div>
          {selectedAssets.length > 0 && (
            <div className="mt-3">
              <div className="font-mono text-[10px] uppercase opacity-50 mb-1">{language === 'zh' ? '原始资产' : 'Raw assets'}</div>
              <div className="flex flex-wrap gap-2">
                {selectedAssets.map((asset) => (
                  <span key={asset.id} className="border border-stone-300 bg-stone-100 px-2 py-1 text-[10px] font-mono uppercase">
                    {asset.assetType} / {formatBytes(asset.metadata.sizeBytes)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {selectedClaims.length > 0 && (
            <div className="mt-3">
              <div className="font-mono text-[10px] uppercase opacity-50 mb-1">{language === 'zh' ? '引用结论' : 'Referenced claims'}</div>
              <ul className="space-y-1">
                {selectedClaims.slice(0, 4).map((claim) => (
                  <li key={claim.id} className="text-xs leading-5 border-l-2 border-stone-500 pl-2">
                    {claim.claim}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selectedDocument.error && <p className="text-xs text-rose-700 mt-3">{selectedDocument.error}</p>}
          {selectedDocument.contentText && (
            <p className="text-xs leading-5 mt-3 line-clamp-6">{selectedDocument.contentText}</p>
          )}
        </div>
      )}
    </Panel>
  );
};

const FrontierPanel: React.FC<{
  frontier: FrontierItemSummary[];
  stats: Record<string, number>;
  language: Language;
  t: Translator;
}> = ({ frontier, stats, language, t }) => (
  <Panel title={t('research.frontierView')}>
    <div className="grid grid-cols-5 gap-1 mb-3">
      {['queued', 'fetching', 'fetched', 'failed', 'skipped'].map((status) => (
        <MiniMetric key={status} label={labelForStatus(status, language)} value={stats[status] ?? 0} />
      ))}
    </div>
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {frontier.slice(0, 16).map((item) => (
        <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="block border-b border-stone-300 pb-2 last:border-b-0">
          <div className="font-mono text-[10px] uppercase opacity-50">
            {labelForStatus(item.status, language)} / {item.sourceType} / {Math.round(item.priorityScore * 100)}
          </div>
          <div className="text-xs leading-snug truncate">{item.url}</div>
          {item.lastError && <div className="text-xs text-rose-700 mt-1">{item.lastError}</div>}
        </a>
      ))}
    </div>
  </Panel>
);

const ProviderPanel: React.FC<{ stats: ProviderStat[]; t: Translator }> = ({ stats, t }) => (
  <Panel title={t('research.providerPanel')}>
    {stats.length === 0 ? (
      <p className="font-mono text-xs opacity-60">{t('research.noProviders')}</p>
    ) : (
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
    )}
  </Panel>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border border-stone-300 bg-stone-100 p-4 min-w-0">
    <h3 className="font-serif italic text-lg mb-3 flex items-center gap-2">
      <FileSearch size={16} />
      {title}
    </h3>
    {children}
  </section>
);

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-stone-100 p-3">
    <div className="font-mono text-[10px] uppercase opacity-50">{label}</div>
    <div className="font-serif text-xl">{value}</div>
  </div>
);

const MiniMetric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-stone-100 p-2 min-w-0">
    <div className="font-mono text-[9px] uppercase opacity-50 truncate">{label}</div>
    <div className="font-mono text-xs truncate">{value}</div>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="border border-stone-300 bg-stone-100 px-2 py-1">{children}</span>
);

const IconButton: React.FC<{ icon: React.ReactNode; title: string; disabled?: boolean; onClick: () => void }> = ({
  icon,
  title,
  disabled,
  onClick,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-9 h-9 inline-flex items-center justify-center border border-stone-400 bg-stone-100 hover:bg-white disabled:opacity-40"
  >
    {icon}
  </button>
);

interface ProviderStat {
  provider: string;
  calls: number;
  candidates: number;
  errors: number;
  durationMs: number;
}

function summarizeProviders(providers: DiscoveryProviderSummary[]): ProviderStat[] {
  const map = new Map<string, ProviderStat>();
  for (const provider of providers) {
    const row = map.get(provider.provider) ?? {
      provider: provider.provider,
      calls: 0,
      candidates: 0,
      errors: 0,
      durationMs: 0,
    };
    row.calls += 1;
    row.candidates += provider.candidateCount;
    row.errors += provider.error ? 1 : 0;
    row.durationMs += provider.durationMs;
    map.set(provider.provider, row);
  }
  return [...map.values()].sort((left, right) => right.candidates - left.candidates);
}

function summarizeFrontier(frontier: FrontierItemSummary[]) {
  return frontier.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
}

function isStageActive(run: ResearchRunSummary | null, stage: ResearchRunStatus) {
  if (!run) return false;
  return RUN_STAGES.indexOf(stage) <= RUN_STAGES.indexOf(run.stage);
}

function isTerminalRun(status: string) {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

function labelForStatus(status: string, language: Language) {
  const zh: Record<string, string> = {
    active: '启用',
    paused: '暂停',
    running: '运行中',
    completed: '完成',
    failed: '失败',
    queued: '排队',
    planning: '规划',
    discovery: '发现',
    frontier: '队列',
    fetching: '抓取',
    extracting: '抽取',
    analyzing: '分析',
    reporting: '报告',
    cancelled: '取消',
    skipped: '跳过',
    fetched: '已抓取',
    supported: '支持',
    contradicted: '冲突',
    uncertain: '不确定',
    unverified: '未验证',
  };
  const en: Record<string, string> = {
    active: 'Active',
    paused: 'Paused',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    queued: 'Queued',
    planning: 'Planning',
    discovery: 'Discovery',
    frontier: 'Frontier',
    fetching: 'Fetching',
    extracting: 'Extracting',
    analyzing: 'Analyzing',
    reporting: 'Reporting',
    cancelled: 'Cancelled',
    skipped: 'Skipped',
    fetched: 'Fetched',
    supported: 'Supported',
    contradicted: 'Contradicted',
    uncertain: 'Uncertain',
    unverified: 'Unverified',
  };
  return (language === 'zh' ? zh : en)[status] ?? status;
}

function labelForMemoryStatus(status: ResearchDocumentSummary['memoryStatus'] | undefined, language: Language) {
  const zh: Record<string, string> = {
    fresh: '新抓取',
    reused: '已复用',
    stale: '未复用',
  };
  const en: Record<string, string> = {
    fresh: 'fresh',
    reused: 'reused',
    stale: 'stale',
  };
  return (language === 'zh' ? zh : en)[status ?? 'fresh'] ?? (status ?? 'fresh');
}

function formatBytes(value: number | undefined) {
  const bytes = value ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatShortId(id: string) {
  return id.slice(0, 8);
}

function formatDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}
