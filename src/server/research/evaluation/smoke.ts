import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normalizeResearchBudget } from "../budget";
import { getResearchConfig, ResearchConfig } from "../config";
import {
  createCkanDiscoveryProvider,
  createCrossrefDiscoveryProvider,
  createGdeltDiscoveryProvider,
  createHuggingFaceDatasetDiscoveryProvider,
  createOpenAlexDiscoveryProvider,
  createSocrataDiscoveryProvider,
  createWorldBankDiscoveryProvider,
  DiscoveryProvider,
  runDiscoveryProviders,
} from "../discovery/registry";
import { planResearch } from "../queryPlanner";
import { searchConfiguredProviders, SearchProviderResult } from "../searchProviders";
import { QueryPurpose, SourceType } from "../types";

export interface ProviderLiveSmokeRow {
  provider: string;
  status: "passed" | "failed" | "skipped";
  enabled: boolean;
  candidateCount: number;
  durationMs: number;
  sampleUrls: string[];
  error?: string;
}

export interface ProviderLiveSmokeResult {
  id: string;
  topic: string;
  query: string;
  generatedAt: string;
  totalCandidates: number;
  providers: ProviderLiveSmokeRow[];
  passed: boolean;
}

export interface PressureSmokeTarget {
  mode: "Quick" | "Standard" | "Deep";
  maxUrlsPerRun: number;
  maxDepth: number;
  maxDomainsPerRun: number;
  plannedQueries: number;
  plannedSourceTypes: string[];
  estimatedFrontierCapacity: number;
  evidenceTarget: number;
  status: "passed" | "needs-live-run";
}

export interface PressureSmokeResult {
  id: string;
  topic: string;
  generatedAt: string;
  targets: PressureSmokeTarget[];
  passed: boolean;
}

export interface DataSourceLiveSmokeRow {
  provider: string;
  providerType: string;
  status: "passed" | "failed" | "skipped";
  candidateCount: number;
  durationMs: number;
  sampleUrls: string[];
  error?: string;
}

export interface DataSourceLiveSmokeResult {
  id: string;
  topic: string;
  query: string;
  generatedAt: string;
  totalCandidates: number;
  providers: DataSourceLiveSmokeRow[];
  passed: boolean;
}

export interface ResearchSmokeEvidence {
  id: string;
  generatedAt: string;
  provider?: ProviderLiveSmokeResult;
  dataSource?: DataSourceLiveSmokeResult;
  pressure?: PressureSmokeResult;
  verdict: "passed" | "limited" | "failed";
  notes: string[];
}

type SearchFn = typeof searchConfiguredProviders;

export async function runProviderLiveSmoke(input: {
  topic?: string;
  config?: ResearchConfig;
  searchFn?: SearchFn;
} = {}): Promise<ProviderLiveSmokeResult> {
  const topic = normalizeSmokeTopic(input.topic);
  const config = input.config ?? getResearchConfig();
  const searchFn = input.searchFn ?? searchConfiguredProviders;
  const started = Date.now();
  const results = await searchFn({
    jobId: "live-smoke",
    query: topic,
    depth: 0,
    purpose: "overview" as QueryPurpose,
    sourceTypes: ["official", "technical-doc", "mainstream-news"] as SourceType[],
  }, config);

  const providers = results.map((result) => normalizeProviderSmokeRow(result, started));
  const totalCandidates = providers.reduce((total, provider) => total + provider.candidateCount, 0);

  return {
    id: randomUUID(),
    topic,
    query: topic,
    generatedAt: new Date().toISOString(),
    totalCandidates,
    providers,
    passed: providers.some((provider) => provider.status === "passed"),
  };
}

export function runPressureSmoke(topic = "新闻溯源、文档转换工具和公开数据源调研"): PressureSmokeResult {
  const normalizedTopic = normalizeSmokeTopic(topic);
  const plan = planResearch(normalizedTopic, [], {});
  const sourceTypes = [...new Set(plan.queries.flatMap((query) => query.sourceTypes))];
  const targets: PressureSmokeTarget[] = [
    buildPressureTarget("Quick", 30, 1, 10, 4, plan.queries.length, sourceTypes),
    buildPressureTarget("Standard", 150, 2, 40, 8, plan.queries.length, sourceTypes),
    buildPressureTarget("Deep", 500, 3, 100, 15, plan.queries.length, sourceTypes),
  ];

  return {
    id: randomUUID(),
    topic: normalizedTopic,
    generatedAt: new Date().toISOString(),
    targets,
    passed: targets.every((target) => target.plannedQueries > 0 && target.estimatedFrontierCapacity >= target.maxUrlsPerRun),
  };
}

export async function runDataSourceLiveSmoke(input: {
  topic?: string;
  providers?: DiscoveryProvider[];
} = {}): Promise<DataSourceLiveSmokeResult> {
  const topic = normalizeSmokeTopic(input.topic || "public open dataset csv statistics");
  const plan = planResearch(topic, [], { sourceScope: { sourceTypes: ["dataset", "data-catalog", "structured-api", "academic"] } });
  const query = plan.queries.find((item) => item.purpose === "dataset-discovery")
    ?? plan.queries.find((item) => item.sourceTypes.some((type) => ["dataset", "data-catalog", "structured-api", "academic"].includes(type)))
    ?? plan.queries[0];
  const providers = input.providers ?? createDefaultDataSourceSmokeProviders();
  const result = await runDiscoveryProviders(providers, {
    jobId: "data-source-smoke",
    runId: "data-source-smoke",
    topic,
    query: {
      ...query,
      id: "data-source-smoke-query",
      text: query?.text || topic,
      sourceTypes: [...new Set([...(query?.sourceTypes ?? []), "dataset", "data-catalog", "structured-api", "academic"])] as SourceType[],
      purpose: query?.purpose ?? "dataset-discovery",
    },
    seedUrls: [],
  });
  const rows = result.results.map((row): DataSourceLiveSmokeRow => ({
    provider: row.provider,
    providerType: row.providerType,
    status: !row.enabled ? "skipped" : row.candidates.length > 0 && !row.error ? "passed" : "failed",
    candidateCount: row.candidates.length,
    durationMs: row.durationMs,
    sampleUrls: row.candidates.slice(0, 3).map((candidate) => candidate.canonicalUrl || candidate.url),
    error: row.error,
  }));
  const totalCandidates = rows.reduce((sum, row) => sum + row.candidateCount, 0);

  return {
    id: randomUUID(),
    topic,
    query: query?.text || topic,
    generatedAt: new Date().toISOString(),
    totalCandidates,
    providers: rows,
    passed: rows.some((row) => row.status === "passed"),
  };
}

export function persistSmokeEvidence(input: {
  provider?: ProviderLiveSmokeResult;
  dataSource?: DataSourceLiveSmokeResult;
  pressure?: PressureSmokeResult;
  dir?: string;
}): ResearchSmokeEvidence {
  const evidence: ResearchSmokeEvidence = {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    provider: input.provider,
    dataSource: input.dataSource,
    pressure: input.pressure,
    verdict: resolveEvidenceVerdict(input.provider, input.dataSource, input.pressure),
    notes: buildEvidenceNotes(input.provider, input.dataSource, input.pressure),
  };
  const dir = input.dir ?? defaultSmokeEvidenceDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(dir, `${evidence.generatedAt.replace(/[:.]/g, "-")}-${evidence.id}.json`), JSON.stringify(evidence, null, 2));
  return evidence;
}

export function getLatestSmokeEvidence(dir = defaultSmokeEvidenceDir()): ResearchSmokeEvidence | null {
  const file = path.join(dir, "latest.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ResearchSmokeEvidence;
  } catch {
    return null;
  }
}

function normalizeProviderSmokeRow(result: SearchProviderResult, started: number): ProviderLiveSmokeRow {
  const candidateCount = result.candidates.length;
  return {
    provider: result.provider,
    status: !result.enabled ? "skipped" : candidateCount > 0 && !result.error ? "passed" : "failed",
    enabled: result.enabled,
    candidateCount,
    durationMs: Math.max(1, Date.now() - started),
    sampleUrls: result.candidates.slice(0, 3).map((candidate) => candidate.canonicalUrl || candidate.url),
    error: result.error,
  };
}

function buildPressureTarget(
  mode: PressureSmokeTarget["mode"],
  maxUrlsPerRun: number,
  maxDepth: number,
  maxDomainsPerRun: number,
  evidenceTarget: number,
  plannedQueries: number,
  plannedSourceTypes: string[],
): PressureSmokeTarget {
  const budget = normalizeResearchBudget({ maxUrlsPerRun, maxDepth, maxDomainsPerRun });
  const estimatedFrontierCapacity = Math.max(budget.maxUrlsPerRun, plannedQueries * Math.max(10, budget.maxDomainsPerRun));
  return {
    mode,
    maxUrlsPerRun: budget.maxUrlsPerRun,
    maxDepth: budget.maxDepth,
    maxDomainsPerRun: budget.maxDomainsPerRun,
    plannedQueries,
    plannedSourceTypes,
    estimatedFrontierCapacity,
    evidenceTarget,
    status: estimatedFrontierCapacity >= budget.maxUrlsPerRun ? "passed" : "needs-live-run",
  };
}

function normalizeSmokeTopic(topic: string | undefined) {
  const normalized = String(topic ?? "").trim().replace(/\s+/g, " ");
  return normalized || "document conversion tools and news verification";
}

function createDefaultDataSourceSmokeProviders(): DiscoveryProvider[] {
  return [
    createCkanDiscoveryProvider(),
    createSocrataDiscoveryProvider(),
    createHuggingFaceDatasetDiscoveryProvider(),
    createWorldBankDiscoveryProvider(),
    createOpenAlexDiscoveryProvider(),
    createCrossrefDiscoveryProvider(),
    createGdeltDiscoveryProvider(),
  ];
}

function defaultSmokeEvidenceDir() {
  return process.env.RESEARCH_SMOKE_DIR || ".data/research-smoke";
}

function resolveEvidenceVerdict(provider?: ProviderLiveSmokeResult, dataSource?: DataSourceLiveSmokeResult, pressure?: PressureSmokeResult): ResearchSmokeEvidence["verdict"] {
  if ((provider?.passed || dataSource?.passed) && pressure?.passed) return provider?.passed ? "passed" : "limited";
  if (provider || dataSource || pressure) return "limited";
  return "failed";
}

function buildEvidenceNotes(provider?: ProviderLiveSmokeResult, dataSource?: DataSourceLiveSmokeResult, pressure?: PressureSmokeResult) {
  const notes: string[] = [];
  if (provider) {
    const skipped = provider.providers.filter((row) => row.status === "skipped").map((row) => row.provider);
    const failed = provider.providers.filter((row) => row.status === "failed").map((row) => row.provider);
    if (provider.passed) notes.push(`provider_live_smoke:passed candidates=${provider.totalCandidates}`);
    if (!provider.passed) notes.push("provider_live_smoke:limited no configured provider returned candidates");
    if (skipped.length) notes.push(`provider_skipped:${skipped.join(",")}`);
    if (failed.length) notes.push(`provider_failed:${failed.join(",")}`);
  }
  if (dataSource) {
    const passed = dataSource.providers.filter((row) => row.status === "passed").map((row) => row.provider);
    const failed = dataSource.providers.filter((row) => row.status === "failed").map((row) => row.provider);
    if (dataSource.passed) notes.push(`data_source_live_smoke:passed candidates=${dataSource.totalCandidates}`);
    if (!dataSource.passed) notes.push("data_source_live_smoke:limited no public data provider returned candidates");
    if (passed.length) notes.push(`data_source_passed:${passed.join(",")}`);
    if (failed.length) notes.push(`data_source_failed:${failed.join(",")}`);
  }
  if (pressure) {
    notes.push(`pressure_smoke:${pressure.passed ? "passed" : "failed"} targets=${pressure.targets.length}`);
    const deep = pressure.targets.find((target) => target.mode === "Deep");
    if (deep) notes.push(`deep_target:${deep.maxUrlsPerRun}_urls depth=${deep.maxDepth} domains=${deep.maxDomainsPerRun}`);
  }
  return notes;
}
