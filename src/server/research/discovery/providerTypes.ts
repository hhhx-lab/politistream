import { DiscoveryProviderType, QueryPurpose, SourceType } from "../types";

export interface ProviderCapabilityInput {
  name: string;
  providerType?: DiscoveryProviderType;
  sourceTypes: SourceType[];
  queryPurposes?: QueryPurpose[];
  requiresApiKey?: boolean;
  costUnit: number;
  reliability: number;
  enabled?: boolean;
}

export interface ProviderCapability {
  name: string;
  providerType: DiscoveryProviderType;
  sourceTypes: SourceType[];
  queryPurposes: QueryPurpose[];
  requiresApiKey: boolean;
  costUnit: number;
  reliability: number;
  enabled: boolean;
}

export function normalizeProviderCapability(input: ProviderCapabilityInput): ProviderCapability {
  return {
    name: input.name,
    providerType: input.providerType ?? "web-search",
    sourceTypes: [...new Set(input.sourceTypes)],
    queryPurposes: [...new Set(input.queryPurposes ?? [])],
    requiresApiKey: input.requiresApiKey ?? false,
    costUnit: clamp(input.costUnit),
    reliability: clamp(input.reliability),
    enabled: input.enabled ?? true,
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
