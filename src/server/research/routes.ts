import { Router } from "express";
import { normalizeResearchBudget } from "./budget";
import { aggregateProviderHealth } from "./discovery/providerRegistry";
import { getResearchCapabilityAudit } from "./evaluation/capabilityAudit";
import { runEnhancedFetchSmoke } from "./evaluation/enhancedFetchSmoke";
import { runResearchSampleAcceptance, type ResearchSampleAcceptanceKind } from "./evaluation/sampleAcceptance";
import { getLatestSmokeEvidence, persistSmokeEvidence, runDataSourceLiveSmoke, runPressureSmoke, runProviderLiveSmoke } from "./evaluation/smoke";
import { summarizeEvidenceGraph } from "./evidence/graph";
import { sendResearchConfigStatus, sendResearchError } from "./http";
import {
  addRunEvent,
  appendPlannedQueryForRun,
  createResearchJob,
  createResearchRun,
  getLatestResearchReportForRun,
  getLatestResearchReport,
  getLatestResearchPlanForRun,
  getResearchJob,
  getResearchRun,
  initResearchSchema,
  listCrawlDocumentsForJob,
  listCrawlDocumentsForRun,
  listDocumentAssetsForRun,
  listDocumentLinksForRun,
  listDiscoveryResults,
  listDiscoveryResultsForRun,
  listEvidenceClaimsForRun,
  listEvidenceItemsForRun,
  listEvidenceRelationsForRun,
  listExtractedTablesForRun,
  listFrontierItemsForRun,
  listPlannedQueriesForRun,
  listResearchJobs,
  listResearchRunsForJob,
  listRunEvents,
  listSourceProfiles,
  resetFailedFrontierItemsForRun,
  searchCrawlDocumentsForRun,
  updateResearchJobStatus,
  updateResearchJobQueryPlan,
  updateResearchRunStatus,
} from "./store";
import { createQueuedResearchRun } from "./run";
import { enqueueResearchStage, getQueueStatus } from "./workers/queues";
import { resumeStageForRunStatus } from "./workers/stageTypes";
import type { PlannedQuery, QueryPurpose, SourceType } from "./types";

export function createResearchRouter() {
  const router = Router();

  router.get("/status", sendResearchConfigStatus);

  router.get("/queues", async (_req, res) => {
    try {
      res.json(await getQueueStatus());
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/providers/health", async (_req, res) => {
    try {
      await initResearchSchema();
      res.json({ providers: aggregateProviderHealth(await listDiscoveryResults()) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/capabilities", (_req, res) => {
    try {
      res.json({
        ...getResearchCapabilityAudit(),
        lastSmoke: getLatestSmokeEvidence(),
      });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/capabilities/provider-smoke", async (req, res) => {
    try {
      const provider = await runProviderLiveSmoke({ topic: String(req.body?.topic ?? "") });
      const previous = getLatestSmokeEvidence();
      const latest = persistSmokeEvidence({ provider, dataSource: previous?.dataSource, pressure: previous?.pressure });
      res.json({ ...provider, latest });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/capabilities/pressure-smoke", (req, res) => {
    try {
      const pressure = runPressureSmoke(String(req.body?.topic ?? ""));
      const previous = getLatestSmokeEvidence();
      const latest = persistSmokeEvidence({ provider: previous?.provider, dataSource: previous?.dataSource, pressure });
      res.json({ ...pressure, latest });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/capabilities/data-source-smoke", async (req, res) => {
    try {
      const dataSource = await runDataSourceLiveSmoke({ topic: String(req.body?.topic ?? "") });
      const previous = getLatestSmokeEvidence();
      const latest = persistSmokeEvidence({ provider: previous?.provider, dataSource, pressure: previous?.pressure });
      res.json({ ...dataSource, latest });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/capabilities/enhanced-fetch-smoke", (_req, res) => {
    try {
      res.json(runEnhancedFetchSmoke());
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/capabilities/sample-acceptance", async (req, res) => {
    try {
      const kind = String(req.body?.kind ?? "news-trace") as ResearchSampleAcceptanceKind;
      if (!["news-trace", "data-processing"].includes(kind)) {
        return res.status(400).json({ error: "unsupported_sample_acceptance_kind" });
      }
      res.json(await runResearchSampleAcceptance({ kind }));
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/jobs", async (req, res) => {
    try {
      await initResearchSchema();
      const job = await createResearchJob({
        topic: String(req.body.topic ?? "").trim(),
        seedUrls: Array.isArray(req.body.seedUrls) ? req.body.seedUrls : [],
        budget: normalizeResearchBudget(req.body.budget ?? {}),
        constraints: req.body.constraints ?? {},
      });
      res.status(201).json(job);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/jobs", async (_req, res) => {
    try {
      await initResearchSchema();
      res.json(await listResearchJobs());
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/jobs/:id", async (req, res) => {
    try {
      await initResearchSchema();
      const job = await getResearchJob(req.params.id);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });
      res.json(job);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.patch("/jobs/:id", async (req, res) => {
    try {
      await initResearchSchema();
      const status = req.body.status;
      if (!["active", "paused", "running", "completed", "failed"].includes(status)) {
        return res.status(400).json({ error: "invalid_research_job_status" });
      }
      const job = await updateResearchJobStatus(req.params.id, status);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });
      res.json(job);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/jobs/:id/run", async (req, res) => {
    try {
      const result = await createQueuedResearchRun(req.params.id);
      res.status(202).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "research_job_not_found") {
        return res.status(404).json({ error: "research_job_not_found" });
      }
      sendResearchError(res, error);
    }
  });

  router.post("/jobs/:id/runs", async (req, res) => {
    try {
      const result = await createQueuedResearchRun(req.params.id);
      res.status(202).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "research_job_not_found") {
        return res.status(404).json({ error: "research_job_not_found" });
      }
      sendResearchError(res, error);
    }
  });

  router.get("/jobs/:id/runs", async (req, res) => {
    try {
      await initResearchSchema();
      const job = await getResearchJob(req.params.id);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });
      res.json({ runs: await listResearchRunsForJob(req.params.id) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      const job = await getResearchJob(run.jobId);
      const report = await getLatestResearchReportForRun(run.id);
      res.json({ run, job, report });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/pause", async (req, res) => {
    try {
      await initResearchSchema();
      const current = await getResearchRun(req.params.runId);
      if (!current) return res.status(404).json({ error: "research_run_not_found" });
      const run = await updateResearchRunStatus(current.id, "paused", current.stage) ?? current;
      await addRunEvent({ jobId: run.jobId, runId: run.id, stage: run.stage, level: "warn", message: "研究 run 已暂停。", data: { resumeFrom: run.stage } });
      res.json(run);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/resume", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      const resumeStage = resumeStageForRunStatus(run.stage) ?? resumeStageForRunStatus(run.status);
      if (!resumeStage) return res.status(409).json({ error: "research_run_not_resumable" });
      const resumed = await updateResearchRunStatus(run.id, "queued", run.stage) ?? run;
      await addRunEvent({ jobId: run.jobId, runId: run.id, stage: run.stage, level: "info", message: "研究 run 已恢复并重新入队。", data: { resumeStage } });
      await enqueueResearchStage({ runId: run.id, jobId: run.jobId, stage: resumeStage, attemptReason: "resume" });
      res.status(202).json(resumed);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/cancel", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await updateResearchRunStatus(req.params.runId, "cancelled", "cancelled");
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      await addRunEvent({ jobId: run.jobId, runId: run.id, stage: "cancelled", level: "warn", message: "研究 run 已取消。" });
      res.json(run);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/events", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ events: await listRunEvents(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/plan", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      res.json({
        plan: await getLatestResearchPlanForRun(req.params.runId),
        queries: await listPlannedQueriesForRun(req.params.runId),
      });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/queries", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      if (run.status === "cancelled") return res.status(409).json({ error: "research_run_cancelled" });
      const job = await getResearchJob(run.jobId);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });

      const text = String(req.body.text ?? "").trim();
      if (!text) return res.status(400).json({ error: "manual_query_text_required" });

      const query = await appendPlannedQueryForRun({
        jobId: job.id,
        runId: run.id,
        text,
        purpose: normalizeQueryPurpose(req.body.purpose),
        sourceTypes: normalizeRouteSourceTypes(req.body.sourceTypes),
        language: normalizeQueryLanguage(req.body.language, text),
        priority: normalizeQueryPriority(req.body.priority),
      });
      const queries = await listPlannedQueriesForRun(run.id);
      await updateResearchJobQueryPlan(job.id, queries.map((row) => row.text));
      const queuedRun = await updateResearchRunStatus(run.id, "queued", "discovery") ?? run;
      await updateResearchJobStatus(job.id, "running");
      await addRunEvent({
        jobId: job.id,
        runId: run.id,
        stage: "discovery",
        level: "info",
        message: "已追加新的研究查询方向并重新进入 discovery。",
        data: { query },
      });
      await enqueueResearchStage({ runId: run.id, jobId: job.id, stage: "discovery", attemptReason: "manual" });
      res.status(202).json({ query, run: queuedRun, queued: true });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/retry-failed", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      if (run.status === "cancelled") return res.status(409).json({ error: "research_run_cancelled" });
      const job = await getResearchJob(run.jobId);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });

      const resetItems = await resetFailedFrontierItemsForRun(run.id);
      const queuedRun = await updateResearchRunStatus(run.id, "queued", "fetching") ?? run;
      await updateResearchJobStatus(job.id, "running");
      await addRunEvent({
        jobId: job.id,
        runId: run.id,
        stage: "fetching",
        level: resetItems.length > 0 ? "info" : "warn",
        message: resetItems.length > 0 ? "失败或跳过的 frontier 项已重置并等待重试。" : "没有可重试的失败或跳过 frontier 项。",
        data: { resetCount: resetItems.length },
      });
      if (resetItems.length > 0) {
        await enqueueResearchStage({ runId: run.id, jobId: job.id, stage: "fetch", attemptReason: "retry" });
      }
      res.status(202).json({ resetCount: resetItems.length, frontier: resetItems, run: queuedRun, queued: resetItems.length > 0 });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/frontier", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ frontier: await listFrontierItemsForRun(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/documents", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ documents: await listCrawlDocumentsForRun(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/assets", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ assets: await listDocumentAssetsForRun(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/tables", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ tables: await listExtractedTablesForRun(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/links", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ links: await listDocumentLinksForRun(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/search", async (req, res) => {
    try {
      await initResearchSchema();
      const query = String(req.query.q ?? "").trim();
      res.json({ results: await searchCrawlDocumentsForRun(req.params.runId, query) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/evidence", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({
        claims: await listEvidenceClaimsForRun(req.params.runId),
        evidence: await listEvidenceItemsForRun(req.params.runId),
      });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/claims", async (req, res) => {
    try {
      await initResearchSchema();
      const claims = await listEvidenceClaimsForRun(req.params.runId);
      res.json({
        claims,
        summary: summarizeClaims(claims),
      });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/graph", async (req, res) => {
    try {
      await initResearchSchema();
      const claims = await listEvidenceClaimsForRun(req.params.runId);
      const evidence = await listEvidenceItemsForRun(req.params.runId);
      const relations = await listEvidenceRelationsForRun(req.params.runId);
      const sources = await listSourceProfiles();
      res.json({
        claims,
        evidence,
        relations,
        sources,
        summary: summarizeEvidenceGraph({ claims, relations }),
      });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/providers", async (req, res) => {
    try {
      await initResearchSchema();
      res.json({ providers: await listDiscoveryResultsForRun(req.params.runId) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/runs/:runId/sources", async (_req, res) => {
    try {
      await initResearchSchema();
      res.json({ sources: await listSourceProfiles() });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/jobs/:id/documents", async (req, res) => {
    try {
      await initResearchSchema();
      const job = await getResearchJob(req.params.id);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });
      res.json({ documents: await listCrawlDocumentsForJob(req.params.id) });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/jobs/:id/report", async (req, res) => {
    try {
      await initResearchSchema();
      const report = await getLatestResearchReport(req.params.id);
      if (!report) return res.status(202).json({ status: "not_ready", markdown: "" });
      res.json(report);
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  return router;
}

function summarizeClaims(claims: Awaited<ReturnType<typeof listEvidenceClaimsForRun>>) {
  return claims.reduce<Record<string, number>>((acc, claim) => {
    acc.total = (acc.total ?? 0) + 1;
    acc[claim.status] = (acc[claim.status] ?? 0) + 1;
    return acc;
  }, { total: 0, supported: 0, contradicted: 0, uncertain: 0, unverified: 0 });
}

const QUERY_PURPOSE_VALUES: QueryPurpose[] = [
  "overview",
  "official-source",
  "primary-source",
  "news-coverage",
  "contradiction",
  "benchmark",
  "community-feedback",
  "technical-detail",
  "pricing",
  "timeline",
  "dataset-discovery",
  "statistical-source",
  "competition-data",
  "sports-data",
  "visualization",
];

const SOURCE_TYPE_VALUES: SourceType[] = [
  "official",
  "mainstream-news",
  "technical-doc",
  "github",
  "package-registry",
  "academic",
  "regulatory",
  "community",
  "benchmark",
  "company",
  "rss",
  "sitemap",
  "dataset",
  "data-catalog",
  "structured-api",
  "archive",
  "sports-data",
  "geospatial",
  "financial-data",
  "unknown",
];

function normalizeQueryPurpose(value: unknown): PlannedQuery["purpose"] {
  return QUERY_PURPOSE_VALUES.includes(value as QueryPurpose) ? value as QueryPurpose : "overview";
}

function normalizeRouteSourceTypes(value: unknown): PlannedQuery["sourceTypes"] {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((row) => String(row ?? "").trim())
    .filter((row): row is SourceType => SOURCE_TYPE_VALUES.includes(row as SourceType));
  return [...new Set(normalized)];
}

function normalizeQueryLanguage(value: unknown, text: string) {
  const language = String(value ?? "").trim().slice(0, 16);
  if (language) return language;
  return /[\u4e00-\u9fff]/.test(text) ? "mixed" : "en";
}

function normalizeQueryPriority(value: unknown) {
  const priority = Number(value);
  if (!Number.isFinite(priority)) return 75;
  return Math.max(1, Math.min(100, priority));
}
