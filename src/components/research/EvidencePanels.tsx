import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  EvidenceClaimSummary,
  EvidenceGraphSummary,
  EvidenceItemSummary,
  EvidenceRelationSummary,
} from '../../types';
import { Language, Translator } from '../../i18n';
import {
  labelForRelation,
  labelForStatus,
  MiniMetric,
  Panel,
  ResearchPanelCopy,
  safeDomain,
  summarizeClaimsForPanel,
} from './shared';

export const ClaimsPanel: React.FC<{
  claims: EvidenceClaimSummary[];
  language: Language;
  copy: ResearchPanelCopy;
}> = ({ claims, language, copy }) => {
  const statusCounts = useMemo(() => summarizeClaimsForPanel(claims), [claims]);
  const rankedClaims = useMemo(
    () => [...claims].sort((left, right) => right.confidence - left.confidence),
    [claims],
  );

  return (
    <Panel title={copy.claimsIndex}>
      <div className="grid grid-cols-2 gap-2 mb-4 md:grid-cols-5">
        <MiniMetric label={language === 'zh' ? '总数' : 'Total'} value={claims.length} />
        <MiniMetric label={labelForStatus('supported', language)} value={statusCounts.supported ?? 0} />
        <MiniMetric label={labelForStatus('contradicted', language)} value={statusCounts.contradicted ?? 0} />
        <MiniMetric label={labelForStatus('uncertain', language)} value={statusCounts.uncertain ?? 0} />
        <MiniMetric label={labelForStatus('unverified', language)} value={statusCounts.unverified ?? 0} />
      </div>
      {rankedClaims.length === 0 ? (
        <p className="font-mono text-xs opacity-60">{language === 'zh' ? '暂无结论。' : 'No claims yet.'}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rankedClaims.slice(0, 8).map((claim) => (
            <div key={claim.id} className="border border-stone-300 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase opacity-60 mb-2">
                <span>{labelForStatus(claim.status, language)}</span>
                <span>/</span>
                <span>{Math.round(claim.confidence * 100)}%</span>
                <span>/</span>
                <span>{claim.supportingEvidenceIds.length}+ {copy.supports}</span>
                {claim.conflictingEvidenceIds.length > 0 && (
                  <>
                    <span>/</span>
                    <span>{claim.conflictingEvidenceIds.length} {copy.conflicts}</span>
                  </>
                )}
              </div>
              <div className="text-sm leading-snug">{claim.claim}</div>
              {claim.primarySourceUrl && (
                <a
                  href={claim.primarySourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1 font-mono text-[10px] uppercase opacity-60 hover:opacity-100"
                >
                  <ExternalLink size={11} />
                  <span className="truncate">{safeDomain(claim.primarySourceUrl)}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};

export const EvidenceTable: React.FC<{
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

export const EvidenceGraphPanel: React.FC<{
  claims: EvidenceClaimSummary[];
  evidence: EvidenceItemSummary[];
  relations: EvidenceRelationSummary[];
  summary: EvidenceGraphSummary;
  copy: ResearchPanelCopy;
  language: Language;
}> = ({ claims, evidence, relations, summary, copy, language }) => {
  const claimById = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims]);
  const evidenceById = useMemo(() => new Map(evidence.map((item) => [item.id, item])), [evidence]);

  return (
    <Panel title={copy.evidenceGraph}>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <MiniMetric label={labelForStatus('supported', language)} value={summary.supportedClaims} />
        <MiniMetric label={labelForStatus('contradicted', language)} value={summary.contradictedClaims} />
        <MiniMetric label={labelForStatus('uncertain', language)} value={summary.uncertainClaims} />
        <MiniMetric label={labelForStatus('unverified', language)} value={summary.unverifiedClaims} />
        <MiniMetric label={copy.supports} value={summary.supportingRelations} />
        <MiniMetric label={copy.conflicts} value={summary.conflictingRelations} />
      </div>

      {relations.length === 0 ? (
        <p className="font-mono text-xs opacity-60">{copy.noRelations}</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {relations.slice(0, 12).map((relation) => {
            const claim = claimById.get(relation.claimId);
            const item = evidenceById.get(relation.evidenceId);
            const isConflict = relation.relation === 'contradicts';
            return (
              <div
                key={relation.id}
                className={`border bg-white p-3 ${isConflict ? 'border-rose-300' : 'border-emerald-300'}`}
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase opacity-60 mb-2">
                  <span>{labelForRelation(relation.relation, language)}</span>
                  <span>/</span>
                  <span>{Math.round(relation.confidence * 100)}%</span>
                  {item?.sourceUrl && (
                    <>
                      <span>/</span>
                      <span className="truncate max-w-[16rem]">{safeDomain(item.sourceUrl)}</span>
                    </>
                  )}
                </div>
                <div className="text-sm leading-snug line-clamp-2">{claim?.claim ?? relation.claimId}</div>
                {item && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block border-l-2 border-stone-400 pl-3 text-xs leading-5 hover:bg-stone-100"
                  >
                    <div className="font-mono opacity-50 mb-1">{Math.round((item.credibilityScore ?? 0) * 100)}% / {safeDomain(item.sourceUrl)}</div>
                    <div className="line-clamp-2">{item.quote || item.snippet}</div>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
