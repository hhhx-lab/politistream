import React, { useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import {
  DocumentLinkSummary,
  EvidenceClaimSummary,
  EvidenceItemSummary,
  ExtractedTableSummary,
  ResearchDocumentAssetSummary,
  ResearchDocumentSummary,
  SourceProfileSummary,
} from '../../types';
import { Language, Translator } from '../../i18n';
import {
  formatBytes,
  labelForMemoryStatus,
  MiniMetric,
  Panel,
  ResearchPanelCopy,
  safeDomain,
} from './shared';

export const SourceExplorer: React.FC<{
  documents: ResearchDocumentSummary[];
  selectedDocument?: ResearchDocumentSummary;
  assets: ResearchDocumentAssetSummary[];
  links: DocumentLinkSummary[];
  tables: ExtractedTableSummary[];
  claims: EvidenceClaimSummary[];
  evidence: EvidenceItemSummary[];
  sourceByDomain: Map<string, SourceProfileSummary>;
  onSelect: (id: string) => void;
  language: Language;
  copy: ResearchPanelCopy;
  t: Translator;
}> = ({ documents, selectedDocument, assets, links, tables, claims, evidence, sourceByDomain, onSelect, language, copy, t }) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sortMode, setSortMode] = useState<'authority' | 'evidence' | 'errors'>('authority');
  const [claimFilterId, setClaimFilterId] = useState('');
  const profile = selectedDocument ? sourceByDomain.get(selectedDocument.domain) : undefined;
  const evidenceCountByDocument = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of evidence) counts.set(item.documentId, (counts.get(item.documentId) ?? 0) + 1);
    return counts;
  }, [evidence]);
  const claimDocumentIds = useMemo(() => {
    if (!claimFilterId) return new Set<string>();
    const claim = claims.find((item) => item.id === claimFilterId);
    const evidenceIds = new Set([...(claim?.supportingEvidenceIds ?? []), ...(claim?.conflictingEvidenceIds ?? [])]);
    return new Set(evidence.filter((item) => evidenceIds.has(item.id) || item.claimId === claimFilterId).map((item) => item.documentId));
  }, [claimFilterId, claims, evidence]);
  const statusOptions = useMemo(() => uniqueStrings(documents.map((document) => document.status).filter(Boolean)), [documents]);
  const tierOptions = useMemo(
    () => uniqueStrings([...sourceByDomain.values()].map((source) => source.authorityTier).filter(Boolean)),
    [sourceByDomain],
  );
  const errorRows = useMemo(() => {
    const grouped = new Map<string, { key: string; count: number; domains: Set<string> }>();
    for (const document of documents) {
      if (!document.error && document.status !== 'failed') continue;
      const key = document.error || document.status;
      const row = grouped.get(key) ?? { key, count: 0, domains: new Set<string>() };
      row.count += 1;
      row.domains.add(document.domain);
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }, [documents]);
  const visibleDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const claimScoped = claimFilterId ? claimDocumentIds : undefined;
    return documents
      .filter((document) => {
        const documentProfile = sourceByDomain.get(document.domain);
        const haystack = [document.url, document.finalUrl, document.title, document.domain, document.contentText, document.error].join(' ').toLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (!statusFilter || document.status === statusFilter) &&
          (!tierFilter || documentProfile?.authorityTier === tierFilter) &&
          (!claimScoped || claimScoped.has(document.id))
        );
      })
      .sort((left, right) => {
        const leftProfile = sourceByDomain.get(left.domain);
        const rightProfile = sourceByDomain.get(right.domain);
        if (sortMode === 'errors') {
          return Number(Boolean(right.error || right.status === 'failed')) - Number(Boolean(left.error || left.status === 'failed'));
        }
        if (sortMode === 'evidence') {
          return (evidenceCountByDocument.get(right.id) ?? 0) - (evidenceCountByDocument.get(left.id) ?? 0);
        }
        return authorityRank(leftProfile?.authorityTier) - authorityRank(rightProfile?.authorityTier)
          || (rightProfile?.officialLikelihood ?? 0) - (leftProfile?.officialLikelihood ?? 0);
      });
  }, [documents, query, statusFilter, tierFilter, sortMode, claimFilterId, claimDocumentIds, sourceByDomain, evidenceCountByDocument]);
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
  const selectedTables = selectedDocument
    ? tables.filter((table) => table.documentId === selectedDocument.id)
    : [];
  const selectedLinks = selectedDocument
    ? links.filter((link) => link.documentId === selectedDocument.id)
    : [];
  return (
    <Panel title={t('research.sourceExplorer')}>
      <div className="mb-3 space-y-2 border border-stone-300 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-[10px] uppercase opacity-50">{copy.sourceFiltersTitle}</div>
          <div className="font-mono text-[10px] opacity-50">{copy.filteredSources}: {visibleDocuments.length}/{documents.length}</div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_8rem_8rem]">
          <label className="relative min-w-0">
            <Search size={13} className="absolute left-2 top-2.5 text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.sourceSearchPlaceholder}
              className="w-full border border-stone-300 bg-stone-50 py-2 pl-7 pr-2 text-xs outline-none focus:border-stone-900"
            />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-stone-300 bg-stone-50 px-2 py-2 text-xs">
            <option value="">{copy.allStatuses}</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)} className="border border-stone-300 bg-stone-50 px-2 py-2 text-xs">
            <option value="">{copy.allTiers}</option>
            {tierOptions.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
          </select>
        </div>
        <div className="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)]">
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)} className="border border-stone-300 bg-stone-50 px-2 py-2 text-xs" aria-label={copy.sortBy}>
            <option value="authority">{copy.sortAuthority}</option>
            <option value="evidence">{copy.sortEvidence}</option>
            <option value="errors">{copy.sortErrors}</option>
          </select>
          <select value={claimFilterId} onChange={(event) => setClaimFilterId(event.target.value)} className="border border-stone-300 bg-stone-50 px-2 py-2 text-xs" aria-label={copy.claimTrace}>
            <option value="">{copy.claimTrace}</option>
            {claims.map((claim) => <option key={claim.id} value={claim.id}>{claim.claim}</option>)}
          </select>
        </div>
        <div className="border border-stone-200 bg-stone-50 p-2">
          <div className="mb-1 font-mono text-[10px] uppercase opacity-50">{copy.errorSummary}</div>
          {errorRows.length === 0 ? (
            <p className="font-mono text-[10px] opacity-50">{copy.noErrors}</p>
          ) : (
            <div className="space-y-1">
              {errorRows.slice(0, 3).map((row) => (
                <button
                  key={row.key}
                  onClick={() => {
                    setStatusFilter('failed');
                    setQuery(row.key);
                    setSortMode('errors');
                  }}
                  className="flex w-full items-center justify-between gap-2 border border-rose-200 bg-rose-50 px-2 py-1 text-left text-[10px] text-rose-800"
                >
                  <span className="line-clamp-1">{row.key}</span>
                  <span className="font-mono">{row.count} / {row.domains.size} domains</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
        {visibleDocuments.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white/70 p-3">
            <p className="font-mono text-xs opacity-60">
              {documents.length === 0
                ? t('research.noDocuments')
                : language === 'zh'
                  ? '当前筛选没有命中文档，清空关键词、状态、等级或 Claim 反查后再看。'
                  : 'No documents match the current filters. Clear keyword, status, tier, or claim filters.'}
            </p>
            {documents.length > 0 && <p className="mt-2 text-xs leading-5 text-stone-600">{copy.documentCountHint}</p>}
          </div>
        ) : visibleDocuments.map((document) => (
          <button
            key={document.id}
            onClick={() => onSelect(document.id)}
            className={`w-full text-left border px-3 py-2 ${selectedDocument?.id === document.id ? 'border-stone-900 bg-white' : 'border-stone-300 bg-stone-100 hover:bg-white'}`}
          >
            <div className="font-mono text-[10px] uppercase opacity-50">
              {document.status} / {sourceByDomain.get(document.domain)?.authorityTier ?? 'T4'} / {evidenceCountByDocument.get(document.id) ?? 0} ev / {labelForMemoryStatus(document.memoryStatus, language)} / {document.domain}
            </div>
            <div className="text-sm leading-snug truncate">{document.title || document.url}</div>
            {document.error && <div className="mt-1 line-clamp-1 text-[10px] text-rose-700">{document.error}</div>}
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
          <SourceDiagnosticsPanel document={selectedDocument} language={language} />
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
          <DocumentLinksPreview links={selectedLinks} copy={copy} />
          <ExtractedTablesPreview tables={selectedTables} copy={copy} />
          {selectedClaims.length > 0 && (
            <div className="mt-3">
              <div className="font-mono text-[10px] uppercase opacity-50 mb-1">{copy.claimTrace}</div>
              <ul className="space-y-1">
                {selectedClaims.slice(0, 4).map((claim) => (
                  <li key={claim.id} className="border-l-2 border-stone-500 pl-2 text-xs leading-5">
                    {claim.claim}
                    <button
                      onClick={() => setClaimFilterId(claim.id)}
                      className="ml-2 border border-stone-300 bg-white px-2 py-0.5 font-mono text-[9px] uppercase hover:border-stone-900"
                    >
                      {copy.showClaimSources}
                    </button>
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

function authorityRank(tier?: string) {
  const ranks: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
  return ranks[tier ?? 'T4'] ?? 4;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

const SourceDiagnosticsPanel: React.FC<{ document: ResearchDocumentSummary; language: Language }> = ({ document, language }) => {
  const metadata = document.metadata ?? {};
  const diagnostics = Array.isArray(metadata.diagnostics) ? metadata.diagnostics.map(String) : [];
  const readerPath = String(metadata.readerPath ?? metadata.fetcher ?? 'unknown');
  const detailMetrics = [
    { label: language === 'zh' ? '读取路径' : 'Reader path', value: readerPath },
    { label: 'fetcher', value: String(metadata.fetcher ?? '-') },
    { label: 'status', value: metadata.statusCode !== undefined ? String(metadata.statusCode) : document.status },
    { label: 'type', value: String(metadata.contentType ?? '-') },
    { label: 'time', value: metadata.durationMs !== undefined ? `${metadata.durationMs}ms` : '-' },
    { label: 'fallback', value: metadata.fallbackUsed ? 'yes' : 'no' },
  ];

  return (
    <div className="mt-3 border border-stone-300 bg-white p-3">
      <div className="mb-2 font-mono text-[10px] uppercase opacity-50">{language === 'zh' ? '诊断结果' : 'Diagnostics'}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {detailMetrics.map((metric) => <MiniMetric key={metric.label} label={metric.label} value={metric.value} />)}
      </div>
      {diagnostics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {diagnostics.slice(0, 8).map((item) => (
            <span key={item} className="border border-stone-300 bg-stone-100 px-2 py-1 font-mono text-[10px]">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const DocumentLinksPreview: React.FC<{
  links: DocumentLinkSummary[];
  copy: ResearchPanelCopy;
}> = ({ links, copy }) => (
  <div className="mt-3">
    <div className="font-mono text-[10px] uppercase opacity-50 mb-1">{copy.discoveredLinks}</div>
    {links.length === 0 ? (
      <p className="text-[10px] font-mono opacity-50">{copy.noLinks}</p>
    ) : (
      <div className="space-y-2 max-h-44 overflow-y-auto">
        {links.slice(0, 12).map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block border border-stone-300 bg-white px-2 py-2 hover:bg-stone-100"
          >
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase opacity-50">
              <span className="truncate">{safeDomain(link.url)}</span>
              <span className={link.enqueued ? 'text-emerald-700' : ''}>{link.enqueued ? copy.enqueued : copy.observed}</span>
            </div>
            <div className="mt-1 text-xs leading-snug line-clamp-2">{link.text || link.url}</div>
            {link.context && <div className="mt-1 text-[10px] leading-4 opacity-60 line-clamp-2">{link.context}</div>}
          </a>
        ))}
      </div>
    )}
  </div>
);

const ExtractedTablesPreview: React.FC<{
  tables: ExtractedTableSummary[];
  copy: ResearchPanelCopy;
}> = ({ tables, copy }) => (
  <div className="mt-3">
    <div className="font-mono text-[10px] uppercase opacity-50 mb-1">{copy.extractedTables}</div>
    {tables.length === 0 ? (
      <p className="text-[10px] font-mono opacity-50">{copy.noTables}</p>
    ) : (
      <div className="space-y-3">
        {tables.slice(0, 3).map((table) => (
          <div key={table.id} className="border border-stone-300 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-stone-300 px-2 py-1">
              <div className="min-w-0 truncate text-xs font-serif">{table.caption || copy.extractedTables}</div>
              <div className="shrink-0 font-mono text-[10px] opacity-50">{copy.tableRows}: {table.rows.length}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[18rem] text-left text-[10px]">
                <thead>
                  <tr className="bg-stone-100">
                    {table.headers.slice(0, 5).map((header, index) => (
                      <th key={`${table.id}-h-${index}`} className="border-b border-stone-300 px-2 py-1 font-mono uppercase opacity-70">
                        {header || `col_${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, 4).map((row, rowIndex) => (
                    <tr key={`${table.id}-r-${rowIndex}`}>
                      {table.headers.slice(0, 5).map((_, cellIndex) => (
                        <td key={`${table.id}-r-${rowIndex}-${cellIndex}`} className="border-b border-stone-200 px-2 py-1 align-top">
                          <span className="line-clamp-2">{row[cellIndex] ?? ''}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
