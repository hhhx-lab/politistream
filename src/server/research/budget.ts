import { getDomain } from "./url";
import { ResearchBudget, ResearchRunBudgetState } from "./types";

export const DEFAULT_RESEARCH_BUDGET: ResearchBudget = {
  maxDepth: 3,
  maxUrlsPerRun: 300,
  maxDomainsPerRun: 50,
  runIntervalMinutes: 60,
};

export function normalizeResearchBudget(input: Partial<ResearchBudget> = {}): ResearchBudget {
  return {
    maxDepth: positiveInt(input.maxDepth, DEFAULT_RESEARCH_BUDGET.maxDepth),
    maxUrlsPerRun: positiveInt(input.maxUrlsPerRun, DEFAULT_RESEARCH_BUDGET.maxUrlsPerRun),
    maxDomainsPerRun: positiveInt(input.maxDomainsPerRun, DEFAULT_RESEARCH_BUDGET.maxDomainsPerRun),
    runIntervalMinutes: positiveInt(input.runIntervalMinutes, DEFAULT_RESEARCH_BUDGET.runIntervalMinutes),
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
