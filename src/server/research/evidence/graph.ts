import { randomUUID } from "crypto";
import { getDomain } from "../url";
import {
  AuthorityTier,
  EvidenceClaim,
  EvidenceClaimStatus,
  EvidenceRelation,
  EvidenceRelationKind,
  SourceProfile,
  SourceType,
} from "../types";

export function createSourceProfile(url: string, sourceType: SourceType): SourceProfile {
  const domain = getDomain(url);
  const authorityTier = authorityTierFor(domain, sourceType);
  return {
    id: randomUUID(),
    domain,
    sourceType,
    authorityTier,
    officialLikelihood: officialLikelihoodFor(domain, sourceType, authorityTier),
    mainstreamLikelihood: mainstreamLikelihoodFor(domain, sourceType),
    notes: sourceNotes(domain, sourceType, authorityTier),
  };
}

export function buildEvidenceClaim(input: {
  jobId: string;
  runId: string;
  claim: string;
  supportingEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  firstSeenAt?: string;
  primarySourceUrl?: string;
}): EvidenceClaim {
  const status = claimStatus(input.supportingEvidenceIds.length, input.conflictingEvidenceIds.length);
  return {
    id: randomUUID(),
    jobId: input.jobId,
    runId: input.runId,
    claim: input.claim,
    normalizedClaim: normalizeClaim(input.claim),
    status,
    confidence: confidenceFor(status, input.supportingEvidenceIds.length, input.conflictingEvidenceIds.length),
    supportingEvidenceIds: input.supportingEvidenceIds,
    conflictingEvidenceIds: input.conflictingEvidenceIds,
    firstSeenAt: input.firstSeenAt,
    primarySourceUrl: input.primarySourceUrl,
    createdAt: new Date().toISOString(),
  };
}

export function credibilityScoreFor(profile: SourceProfile) {
  const tierScore = {
    T0: 1,
    T1: 0.84,
    T2: 0.68,
    T3: 0.42,
    T4: 0.15,
  } satisfies Record<AuthorityTier, number>;

  return Math.max(0, Math.min(1,
    tierScore[profile.authorityTier] * 0.7 +
    profile.officialLikelihood * 0.2 +
    profile.mainstreamLikelihood * 0.1,
  ));
}

export function buildEvidenceRelation(input: {
  claimId: string;
  evidenceId: string;
  relation: EvidenceRelationKind;
  confidence: number;
}): EvidenceRelation {
  return {
    id: randomUUID(),
    claimId: input.claimId,
    evidenceId: input.evidenceId,
    relation: input.relation,
    confidence: clamp(input.confidence),
    createdAt: new Date().toISOString(),
  };
}

export function summarizeEvidenceGraph(input: {
  claims: Array<{ status: EvidenceClaimStatus | string }>;
  relations: Array<{ relation: EvidenceRelationKind | string }>;
}) {
  return {
    supportedClaims: input.claims.filter((claim) => claim.status === "supported").length,
    contradictedClaims: input.claims.filter((claim) => claim.status === "contradicted").length,
    uncertainClaims: input.claims.filter((claim) => claim.status === "uncertain").length,
    unverifiedClaims: input.claims.filter((claim) => claim.status === "unverified").length,
    supportingRelations: input.relations.filter((relation) => relation.relation === "supports").length,
    conflictingRelations: input.relations.filter((relation) => relation.relation === "contradicts").length,
  };
}

export interface EvidenceQualityGateResult {
  passed: boolean;
  totalClaims: number;
  supportedClaims: number;
  contradictedClaims: number;
  uncertainClaims: number;
  unverifiedClaims: number;
  claimsWithEvidence: number;
  claimsWithoutEvidence: number;
  orphanEvidence: number;
  issues: string[];
}

export function validateEvidenceQualityGate(input: {
  claims: Array<{
    id?: string;
    status: EvidenceClaimStatus | string;
    supportingEvidenceIds?: string[];
    conflictingEvidenceIds?: string[];
  }>;
  evidence: Array<{ id?: string; claimId?: string }>;
}): EvidenceQualityGateResult {
  const evidenceIds = new Set(input.evidence.map((item) => item.id).filter(Boolean));
  const linkedEvidenceIds = new Set<string>();
  const issues: string[] = [];
  let claimsWithEvidence = 0;

  for (const claim of input.claims) {
    const claimId = claim.id ?? "unknown-claim";
    const supporting = claim.supportingEvidenceIds ?? [];
    const conflicting = claim.conflictingEvidenceIds ?? [];
    const linked = [...supporting, ...conflicting].filter((id) => evidenceIds.has(id));
    for (const id of linked) linkedEvidenceIds.add(id);
    if (linked.length > 0) claimsWithEvidence += 1;

    if ((claim.status === "supported" || claim.status === "contradicted") && linked.length === 0) {
      issues.push(`claim_without_linked_evidence:${claimId}:${claim.status}`);
    }
    if (claim.status === "supported" && supporting.length === 0) {
      issues.push(`supported_claim_without_support:${claimId}`);
    }
    if (claim.status === "contradicted" && conflicting.length === 0) {
      issues.push(`contradicted_claim_without_conflict:${claimId}`);
    }
    if ((claim.status === "uncertain" || claim.status === "unverified") && supporting.length === 0 && conflicting.length === 0) {
      issues.push(`explicit_uncertainty_without_evidence:${claimId}`);
    }
  }

  for (const item of input.evidence) {
    if (item.id && !linkedEvidenceIds.has(item.id) && !item.claimId) {
      issues.push(`orphan_evidence:${item.id}`);
    }
  }

  const totalClaims = input.claims.length;
  return {
    passed: issues.length === 0 && totalClaims > 0,
    totalClaims,
    supportedClaims: input.claims.filter((claim) => claim.status === "supported").length,
    contradictedClaims: input.claims.filter((claim) => claim.status === "contradicted").length,
    uncertainClaims: input.claims.filter((claim) => claim.status === "uncertain").length,
    unverifiedClaims: input.claims.filter((claim) => claim.status === "unverified").length,
    claimsWithEvidence,
    claimsWithoutEvidence: Math.max(0, totalClaims - claimsWithEvidence),
    orphanEvidence: issues.filter((issue) => issue.startsWith("orphan_evidence:")).length,
    issues,
  };
}

function authorityTierFor(domain: string, sourceType: SourceType): AuthorityTier {
  if (sourceType === "official" || sourceType === "regulatory" || domain.endsWith(".gov") || domain.endsWith(".mil")) return "T0";
  if (sourceType === "mainstream-news" || sourceType === "academic") return "T1";
  if (sourceType === "github" || sourceType === "package-registry" || sourceType === "technical-doc") return "T2";
  if (sourceType === "community" || sourceType === "benchmark") return "T3";
  return "T4";
}

function officialLikelihoodFor(domain: string, sourceType: SourceType, tier: AuthorityTier) {
  if (tier === "T0") return 0.95;
  if (sourceType === "company" || sourceType === "github" || sourceType === "package-registry") return 0.55;
  if (domain.endsWith(".org")) return 0.45;
  return 0.2;
}

function mainstreamLikelihoodFor(domain: string, sourceType: SourceType) {
  if (sourceType === "mainstream-news") return 0.9;
  if (/(reuters|apnews|bbc|nytimes|washingtonpost|guardian|politico|cnbc)\./.test(domain)) return 0.85;
  return 0.2;
}

function sourceNotes(domain: string, sourceType: SourceType, tier: AuthorityTier) {
  const notes = [`domain:${domain}`, `source_type:${sourceType}`, `authority_tier:${tier}`];
  if (tier === "T0") notes.push("primary_or_official_source_candidate");
  return notes;
}

function claimStatus(supportCount: number, conflictCount: number): EvidenceClaimStatus {
  if (supportCount > 0 && conflictCount === 0) return "supported";
  if (supportCount === 0 && conflictCount > 0) return "contradicted";
  if (supportCount > 0 && conflictCount > 0) return "uncertain";
  return "unverified";
}

function confidenceFor(status: EvidenceClaimStatus, supportCount: number, conflictCount: number) {
  if (status === "supported") return Math.min(0.95, 0.55 + supportCount * 0.16);
  if (status === "contradicted") return Math.min(0.9, 0.5 + conflictCount * 0.15);
  if (status === "uncertain") return 0.45;
  return 0.15;
}

function normalizeClaim(claim: string) {
  return claim.replace(/\s+/g, " ").trim().toLowerCase();
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
