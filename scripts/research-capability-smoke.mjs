#!/usr/bin/env node
import "dotenv/config";
import { runProviderLiveSmoke, runDataSourceLiveSmoke, runPressureSmoke, persistSmokeEvidence } from "../src/server/research/evaluation/smoke.ts";

const topic = process.argv.slice(2).join(" ").trim() || "document conversion tools and news verification";

const provider = await runProviderLiveSmoke({ topic });
const dataSource = await runDataSourceLiveSmoke({ topic });
const pressure = runPressureSmoke(topic);
const evidence = persistSmokeEvidence({ provider, dataSource, pressure });

const summary = {
  id: evidence.id,
  generatedAt: evidence.generatedAt,
  verdict: evidence.verdict,
  topic,
  provider: {
    passed: provider.passed,
    totalCandidates: provider.totalCandidates,
    providers: provider.providers.map((row) => ({
      provider: row.provider,
      status: row.status,
      candidateCount: row.candidateCount,
      durationMs: row.durationMs,
      error: row.error,
    })),
  },
  pressure: {
    passed: pressure.passed,
    targets: pressure.targets.map((target) => ({
      mode: target.mode,
      maxUrlsPerRun: target.maxUrlsPerRun,
      maxDepth: target.maxDepth,
      maxDomainsPerRun: target.maxDomainsPerRun,
      plannedQueries: target.plannedQueries,
      estimatedFrontierCapacity: target.estimatedFrontierCapacity,
      status: target.status,
    })),
  },
  dataSource: {
    passed: dataSource.passed,
    totalCandidates: dataSource.totalCandidates,
    providers: dataSource.providers.map((row) => ({
      provider: row.provider,
      status: row.status,
      candidateCount: row.candidateCount,
      durationMs: row.durationMs,
      error: row.error,
    })),
  },
  notes: evidence.notes,
  evidencePath: ".data/research-smoke/latest.json",
};

console.log(JSON.stringify(summary, null, 2));

if (evidence.verdict === "failed") {
  process.exitCode = 1;
}
