import { getDomain } from "./url";
import { ResearchBudget, ResearchRunBudgetState } from "./types";

export const DEFAULT_RESEARCH_BUDGET: ResearchBudget = {
  maxDepth: 3,
  maxUrlsPerRun: 300,
  maxDomainsPerRun: 50,
  runIntervalMinutes: 60,
};

export const RESEARCH_BUDGET_PRESETS = {
  quick: { maxDepth: 1, maxUrlsPerRun: 30, maxDomainsPerRun: 10, runIntervalMinutes: 60 },
  standard: { maxDepth: 2, maxUrlsPerRun: 150, maxDomainsPerRun: 40, runIntervalMinutes: 60 },
  deep: { maxDepth: 3, maxUrlsPerRun: 500, maxDomainsPerRun: 100, runIntervalMinutes: 60 },
} satisfies Record<string, ResearchBudget>;

export interface ResearchBudgetInput extends Partial<ResearchBudget> {
  mode?: string;
  maxUrls?: unknown;
  maxDomains?: unknown;
  depth?: unknown;
}

export function normalizeResearchBudget(input: ResearchBudgetInput = {}): ResearchBudget {
  const raw = input;
  const preset = budgetPreset(raw.mode) ?? DEFAULT_RESEARCH_BUDGET;

  return {
    maxDepth: positiveInt(raw.maxDepth ?? raw.depth, preset.maxDepth),
    maxUrlsPerRun: positiveInt(raw.maxUrlsPerRun ?? raw.maxUrls, preset.maxUrlsPerRun),
    maxDomainsPerRun: positiveInt(raw.maxDomainsPerRun ?? raw.maxDomains, preset.maxDomainsPerRun),
    runIntervalMinutes: positiveInt(raw.runIntervalMinutes, preset.runIntervalMinutes),
  };
}

export function createRunBudgetState(budget: ResearchBudget): ResearchRunBudgetState {
  return {
    budget,
    acceptedUrls: 0,
    domains: new Set<string>(),
  };
}

export function canAcceptUrlForRun(state: ResearchRunBudgetState, url: string, depth: number): boolean {
  if (depth > state.budget.maxDepth) return false;
  if (state.acceptedUrls >= state.budget.maxUrlsPerRun) return false;

  const domain = getDomain(url);
  if (!domain) return false;
  if (!state.domains.has(domain) && state.domains.size >= state.budget.maxDomainsPerRun) return false;

  return true;
}

export function recordAcceptedUrl(state: ResearchRunBudgetState, url: string) {
  const domain = getDomain(url);
  if (domain) {
    state.domains.add(domain);
  }
  state.acceptedUrls += 1;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function budgetPreset(mode: unknown): ResearchBudget | null {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return RESEARCH_BUDGET_PRESETS[normalized as keyof typeof RESEARCH_BUDGET_PRESETS] ?? null;
}
