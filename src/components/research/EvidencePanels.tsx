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

export const EvidenceQualityPanel: React.FC<{
  claims: EvidenceClaimSummary[];
  evidence: EvidenceItemSummary[];
  relations: EvidenceRelationSummary[];
  language: Language;
}> = ({ claims, evidence, relations, language }) => {
  const quality = useMemo(() => summarizeEvidenceQuality(claims, evidence, relations), [claims, evidence, relations]);
  const hasWarning = quality.legacyFallbackEvidence > 0 || quality.singleScoreConcentration >= 0.9 || quality.unlinkedEvidence > 0;

  return (
    <Panel title={language === 'zh' ? '证据质量总览' : 'Evidence Quality'}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniMetric label={language === 'zh' ? '证据数' : 'Evidence'} value={evidence.length} />
        <MiniMetric label={language === 'zh' ? '图谱边' : 'Edges'} value={relations.length} />
        <MiniMetric label={language === 'zh' ? '可信度档位' : 'Score buckets'} value={quality.uniqueScoreCount} />
        <MiniMetric label={language === 'zh' ? '平均可信度' : 'Avg credibility'} value={`${quality.averageCredibility}%`} />
        <MiniMetric label={language === 'zh' ? '旧版模板' : 'Legacy fallback'} value={quality.legacyFallbackEvidence} />
        <MiniMetric label={language === 'zh' ? '孤立证据' : 'Orphans'} value={quality.unlinkedEvidence} />
      </div>
      <div className={`mt-3 border px-3 py-2 text-xs leading-5 ${hasWarning ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
        {hasWarning
          ? (language === 'zh'
              ? '这批证据存在质量风险：可能包含旧版 fallback 模板证据、可信度高度集中或没有绑定结论的证据。建议重新运行该研究，让新版证据抽取逻辑重新生成结论和图谱。'
              : 'This evidence set has quality risks: legacy fallback evidence, highly concentrated scores, or evidence without linked claims. Re-run the research to regenerate evidence with the updated analyzer.')
          : (language === 'zh'
              ? '这批证据已形成结论-证据-来源关系，可信度分布和绑定关系可用于继续审阅。'
              : 'This evidence set has claim-evidence-source relations and can be reviewed further.')}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <EvidenceQualityDetail
          label={language === 'zh' ? '可信度分布' : 'Credibility distribution'}
          value={quality.scoreDistributionLabel}
        />
        <EvidenceQualityDetail
          label={language === 'zh' ? '最大单一分数占比' : 'Largest score share'}
          value={`${Math.round(quality.singleScoreConcentration * 100)}%`}
        />
        <EvidenceQualityDetail
          label={language === 'zh' ? '有证据结论' : 'Claims with evidence'}
          value={`${quality.claimsWithEvidence}/${claims.length}`}
        />
      </div>
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
    {claims.length === 0 || evidence.length === 0 ? (
      <p className="font-mono text-xs opacity-60">{t('research.noEvidence')}</p>
    ) : (
      <div className="space-y-3">
        {claims.slice(0, 10).map((claim) => {
          const supporting = evidence.filter((item) => claim.supportingEvidenceIds.includes(item.id));
          const conflicting = evidence.filter((item) => claim.conflictingEvidenceIds.includes(item.id));
          const rows = [...supporting, ...conflicting].slice(0, 4);
          return (
            <div key={claim.id} className="border border-stone-300 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm leading-snug">{claim.claim}</div>
                <span className="font-mono text-[10px] uppercase whitespace-nowrap">{labelForStatus(claim.status, language)} / {Math.round(claim.confidence * 100)}%</span>
              </div>
              <div className="mt-3 space-y-2">
                {rows.map((item) => (
                  <a key={item.id} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className={`block text-xs border-l-2 pl-3 hover:bg-stone-100 ${claim.conflictingEvidenceIds.includes(item.id) ? 'border-rose-700' : 'border-emerald-700'}`}>
                    <div className="font-mono opacity-60 mb-1">
                      {language === 'zh' ? '证据摘要' : 'Evidence summary'} / {t('research.credibility')}: {Math.round((item.credibilityScore ?? 0) * 100)}% / {safeDomain(item.sourceUrl)}
                    </div>
                    <div className="font-medium leading-5 line-clamp-2">{item.paraphrase || item.explanation}</div>
                    <div className="mt-1 leading-5 opacity-70 line-clamp-2">{item.quote || item.snippet}</div>
                  </a>
                ))}
                {rows.length === 0 && (
                  <p className="border border-dashed border-stone-300 p-2 font-mono text-xs opacity-60">
                    {language === 'zh' ? '该结论还没有可追溯证据，不能作为有效结论。' : 'This claim has no linked evidence and should not be treated as validated.'}
                  </p>
                )}
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
  const graphRows = useMemo(
    () => relations
      .map((relation) => ({
        relation,
        claim: claimById.get(relation.claimId),
        evidence: evidenceById.get(relation.evidenceId),
      }))
      .filter((row) => row.claim && row.evidence)
      .slice(0, 10),
    [claimById, evidenceById, relations],
  );

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

      {graphRows.length === 0 ? (
        <p className="font-mono text-xs opacity-60">{copy.noRelations}</p>
      ) : (
        <EvidenceGraphCanvas rows={graphRows} language={language} />
      )}
    </Panel>
  );
};

function summarizeEvidenceQuality(
  claims: EvidenceClaimSummary[],
  evidence: EvidenceItemSummary[],
  relations: EvidenceRelationSummary[],
) {
  const scoreBuckets = new Map<number, number>();
  let scoreTotal = 0;
  let scored = 0;

  for (const item of evidence) {
    if (typeof item.credibilityScore !== 'number') continue;
    const bucket = Math.round(item.credibilityScore * 100);
    scoreBuckets.set(bucket, (scoreBuckets.get(bucket) ?? 0) + 1);
    scoreTotal += bucket;
    scored += 1;
  }

  const relationEvidenceIds = new Set(relations.map((relation) => relation.evidenceId));
  const claimEvidenceIds = new Set(claims.flatMap((claim) => [...claim.supportingEvidenceIds, ...claim.conflictingEvidenceIds]));
  const linkedEvidenceIds = new Set([...relationEvidenceIds, ...claimEvidenceIds]);
  const claimsWithEvidence = claims.filter((claim) => claim.supportingEvidenceIds.length + claim.conflictingEvidenceIds.length > 0).length;
  const legacyFallbackEvidence = evidence.filter((item) => isLegacyFallbackEvidence(item)).length;
  const largestBucket = Math.max(0, ...scoreBuckets.values());
  const scoreDistributionLabel = [...scoreBuckets.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([score, count]) => `${score}% x${count}`)
    .join(' / ') || '-';

  return {
    uniqueScoreCount: scoreBuckets.size,
    averageCredibility: scored > 0 ? Math.round(scoreTotal / scored) : 0,
    scoreDistributionLabel,
    singleScoreConcentration: evidence.length > 0 ? largestBucket / evidence.length : 0,
    legacyFallbackEvidence,
    unlinkedEvidence: evidence.filter((item) => !linkedEvidenceIds.has(item.id) && !item.claimId).length,
    claimsWithEvidence,
  };
}

function isLegacyFallbackEvidence(item: EvidenceItemSummary) {
  const text = `${item.explanation ?? ''}\n${item.paraphrase ?? ''}`;
  return text.includes('已抓取与') || text.includes('相关的可追溯正文内容');
}

const EvidenceQualityDetail: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-white p-2">
    <div className="font-mono text-[9px] uppercase text-stone-500">{label}</div>
    <div className="mt-1 font-mono text-xs text-stone-800">{value}</div>
  </div>
);

const EvidenceGraphCanvas: React.FC<{
  rows: Array<{
    relation: EvidenceRelationSummary;
    claim?: EvidenceClaimSummary;
    evidence?: EvidenceItemSummary;
  }>;
  language: Language;
}> = ({ rows, language }) => {
  const domains = [...new Set(rows.map((row) => row.evidence ? safeDomain(row.evidence.sourceUrl) : '').filter(Boolean))];

  return (
    <div className="EvidenceGraphCanvas overflow-x-auto border border-stone-300 bg-[#fbfaf6] p-3">
      <div className="grid min-w-[880px] grid-cols-[1fr_4rem_1fr_4rem_0.8fr] gap-2">
        <GraphColumnTitle>{language === 'zh' ? '结论节点' : 'Claim nodes'}</GraphColumnTitle>
        <div />
        <GraphColumnTitle>{language === 'zh' ? '证据节点' : 'Evidence nodes'}</GraphColumnTitle>
        <div />
        <GraphColumnTitle>{language === 'zh' ? '来源节点' : 'Source nodes'}</GraphColumnTitle>
        {rows.map((row) => {
          const isConflict = row.relation.relation === 'contradicts';
          const color = isConflict ? 'bg-rose-700' : 'bg-emerald-700';
          return (
            <React.Fragment key={row.relation.id}>
              <GraphNode tone={isConflict ? 'conflict' : 'support'}>
                <div className="font-mono text-[10px] uppercase opacity-60">{labelForRelation(row.relation.relation, language)} / {Math.round(row.relation.confidence * 100)}%</div>
                <div className="mt-1 line-clamp-3 text-sm leading-5">{row.claim?.claim}</div>
              </GraphNode>
              <GraphEdge color={color} />
              <GraphNode tone="evidence">
                <div className="font-mono text-[10px] uppercase opacity-60">
                  {language === 'zh' ? '证据摘要' : 'Evidence'} / {Math.round((row.evidence?.credibilityScore ?? 0) * 100)}%
                </div>
                <div className="mt-1 line-clamp-3 text-xs leading-5">{row.evidence?.paraphrase || row.evidence?.explanation}</div>
              </GraphNode>
              <GraphEdge color="bg-stone-500" />
              <a href={row.evidence?.sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
                <GraphNode tone="source">
                  <div className="font-mono text-[10px] uppercase opacity-60">{language === 'zh' ? '来源' : 'Source'}</div>
                  <div className="mt-1 truncate text-sm leading-5">{row.evidence ? safeDomain(row.evidence.sourceUrl) : '-'}</div>
                </GraphNode>
              </a>
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase opacity-60">
        <span>{language === 'zh' ? '来源域名' : 'Domains'}:</span>
        {domains.slice(0, 8).map((domain) => <span key={domain} className="border border-stone-300 bg-white px-2 py-1">{domain}</span>)}
      </div>
    </div>
  );
};

const GraphColumnTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-mono text-[10px] uppercase tracking-wide text-stone-500">{children}</div>
);

const GraphEdge: React.FC<{ color: string }> = ({ color }) => (
  <div className="flex items-center justify-center">
    <div className={`h-0.5 w-full ${color}`} />
  </div>
);

const GraphNode: React.FC<{ tone: 'support' | 'conflict' | 'evidence' | 'source'; children: React.ReactNode }> = ({ tone, children }) => {
  const className = {
    support: 'border-emerald-300 bg-emerald-50',
    conflict: 'border-rose-300 bg-rose-50',
    evidence: 'border-stone-300 bg-white',
    source: 'border-sky-300 bg-sky-50',
  }[tone];

  return (
    <div className={`min-h-20 border p-3 ${className}`}>
      {children}
    </div>
  );
};
