import { DiscoveryResult, QueryPurpose, SourceType } from "../types";
import { ProviderCapability } from "./providerTypes";

export interface ProviderHealthSummary {
  provider: string;
  calls: number;
  errors: number;
  candidateCount: number;
  durationMs: number;
  averageDurationMs: number;
  lastError?: string;
}

export function sortProvidersForQuery(
  providers: ProviderCapability[],
  wantedTypes: SourceType[],
  wantedPurpose?: QueryPurpose,
) {
  return [...providers].sort((left, right) => (
    providerScore(right, wantedTypes, wantedPurpose) - providerScore(left, wantedTypes, wantedPurpose)
  ));
}

export function aggregateProviderHealth(rows: Array<Pick<DiscoveryResult, "provider" | "candidateCount" | "error" | "durationMs">>): ProviderHealthSummary[] {
  const map = new Map<string, ProviderHealthSummary>();

  for (const row of rows) {
    const current = map.get(row.provider) ?? {
      provider: row.provider,
      calls: 0,
      errors: 0,
      candidateCount: 0,
      durationMs: 0,
      averageDurationMs: 0,
      lastError: undefined,
    };

    current.calls += 1;
    current.errors += row.error ? 1 : 0;
    current.candidateCount += row.candidateCount;
    current.durationMs += row.durationMs;
    current.averageDurationMs = Math.round(current.durationMs / current.calls);
    current.lastError = row.error ?? current.lastError;
    map.set(row.provider, current);
  }

  return [...map.values()].sort((left, right) => right.candidateCount - left.candidateCount || left.provider.localeCompare(right.provider));
}

function providerScore(provider: ProviderCapability, wantedTypes: SourceType[], wantedPurpose?: QueryPurpose) {
  const typeMatch = provider.sourceTypes.some((type) => wantedTypes.includes(type)) ? 1 : 0;
  const purposeMatch = wantedPurpose && provider.queryPurposes.includes(wantedPurpose) ? 0.3 : 0;
  const enabledPenalty = provider.enabled ? 0 : 2;
  return typeMatch + purposeMatch + provider.reliability - provider.costUnit - enabledPenalty;
}
