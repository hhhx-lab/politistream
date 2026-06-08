import React from 'react';
import { FileSearch } from 'lucide-react';
import {
  DiscoveryProviderSummary,
  EvidenceClaimSummary,
  EvidenceRelationSummary,
  FrontierItemSummary,
  ResearchDocumentSummary,
  ResearchRunStatus,
  ResearchRunSummary,
} from '../../types';
import { Language } from '../../i18n';

export type ResearchPanelCopy = Record<string, string>;

export const RUN_STAGES: ResearchRunStatus[] = [
  'planning',
  'discovery',
  'frontier',
  'fetching',
  'extracting',
  'analyzing',
  'reporting',
  'completed',
];

export interface ProviderStat {
  provider: string;
  calls: number;
  candidates: number;
  errors: number;
  durationMs: number;
}

export const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border border-stone-300 bg-stone-100 p-4 min-w-0">
    <h3 className="font-serif italic text-lg mb-3 flex items-center gap-2">
      <FileSearch size={16} />
      {title}
    </h3>
    {children}
  </section>
);

export const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-stone-100 p-3">
    <div className="font-mono text-[10px] uppercase opacity-50">{label}</div>
    <div className="font-serif text-xl">{value}</div>
  </div>
);

export const MiniMetric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-stone-100 p-2 min-w-0">
    <div className="font-mono text-[9px] uppercase opacity-50 truncate">{label}</div>
    <div className="font-mono text-xs truncate">{value}</div>
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="border border-stone-300 bg-stone-100 px-2 py-1">{children}</span>
);

export const IconButton: React.FC<{ icon: React.ReactNode; title: string; disabled?: boolean; onClick: () => void }> = ({
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

export function summarizeProviders(providers: DiscoveryProviderSummary[]): ProviderStat[] {
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

export function summarizeFrontier(frontier: FrontierItemSummary[]) {
  return frontier.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
}

export function summarizeDocuments(documents: ResearchDocumentSummary[]) {
  return documents.reduce<Record<string, number>>(
    (acc, document) => {
      acc.total += 1;
      acc[document.status] = (acc[document.status] ?? 0) + 1;
      if (document.status === 'fetched') acc.fetched += 1;
      if (document.status === 'failed') acc.failed += 1;
      if (document.memoryStatus === 'reused') acc.reused += 1;
      return acc;
    },
    { total: 0, fetched: 0, failed: 0, reused: 0 },
  );
}

export function summarizeClaimsForPanel(claims: EvidenceClaimSummary[]) {
  return claims.reduce<Record<string, number>>((acc, claim) => {
    acc[claim.status] = (acc[claim.status] ?? 0) + 1;
    return acc;
  }, {});
}

export function isStageActive(run: ResearchRunSummary | null, stage: ResearchRunStatus) {
  if (!run) return false;
  return RUN_STAGES.indexOf(stage) <= RUN_STAGES.indexOf(run.stage);
}

export function isTerminalRun(status: string) {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

export function labelForStatus(status: string, language: Language) {
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

export function labelForMemoryStatus(status: ResearchDocumentSummary['memoryStatus'] | undefined, language: Language) {
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

export function labelForRelation(relation: EvidenceRelationSummary['relation'], language: Language) {
  const zh: Record<EvidenceRelationSummary['relation'], string> = {
    supports: '支持',
    contradicts: '反驳',
    mentions: '提及',
    derived_from: '派生',
  };
  const en: Record<EvidenceRelationSummary['relation'], string> = {
    supports: 'Supports',
    contradicts: 'Contradicts',
    mentions: 'Mentions',
    derived_from: 'Derived from',
  };
  return (language === 'zh' ? zh : en)[relation] ?? relation;
}

export function safeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatBytes(value: number | undefined) {
  const bytes = value ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatScore(value: number) {
  if (!Number.isFinite(value)) return '-';
  return value >= 1 ? value.toFixed(1) : `${Math.round(value * 100)}%`;
}

export function stripHeadlineTags(value: string) {
  return value.replace(/<\/?b>/gi, '').replace(/<\/?em>/gi, '');
}

export function formatShortId(id: string) {
  return id.slice(0, 8);
}

export function formatDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}
