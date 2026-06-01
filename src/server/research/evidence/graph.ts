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
