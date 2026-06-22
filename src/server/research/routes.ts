import { Router } from "express";
import { normalizeResearchBudget } from "./budget";
import { aggregateProviderHealth } from "./discovery/providerRegistry";
import { getResearchCapabilityAudit } from "./evaluation/capabilityAudit";
import { runEnhancedFetchSmoke } from "./evaluation/enhancedFetchSmoke";
import { runResearchSampleAcceptance, type ResearchSampleAcceptanceKind } from "./evaluation/sampleAcceptance";
import { getLatestSmokeEvidence, persistSmokeEvidence, runDataSourceLiveSmoke, runPressureSmoke, runProviderLiveSmoke } from "./evaluation/smoke";
import { summarizeEvidenceGraph } from "./evidence/graph";
import { sendResearchConfigStatus, sendResearchError } from "./http";
import { buildAnalysisOpportunityWithLlmExpansion } from "./analysisOpportunity";
import {
  addRunEvent,
  appendPlannedQueryForRun,
  createResearchJob,
  createResearchRun,
  getAnalysisOpportunityForRun,
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
  listSearchCandidatesForRun,
  listSourceProfiles,
  upsertAnalysisOpportunity,
  upsertAnalysisHandoff,
  resetFailedFrontierItemsForRun,
  searchCrawlDocumentsForRun,
  updateResearchJobStatus,
  updateResearchJobQueryPlan,
  updateResearchRunStatus,
} from "./store";
import { createQueuedResearchRun } from "./run";
import { enqueueResearchStage, getQueueStatus } from "./workers/queues";
import { resumeStageForRunStatus } from "./workers/stageTypes";
import type { AnalysisHandoff, AnalysisHandoffDecision, AnalysisOpportunity, PlannedQuery, QueryPurpose, ResearchJob, ResearchRun, SourceType } from "./types";
import { createAnalyticsDataset, listAnalyticsDatasets } from "../analytics/store";
import { buildResearchDataSourceRows, type ResearchDataSourceDatasetSummary } from "../analytics/researchDataSources";

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

  router.get("/runs/:runId/analysis-opportunity", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      const opportunity = await getAnalysisOpportunityForRun(run.id);
      if (!opportunity) {
        return res.status(404).json({
          error: "analysis_opportunity_not_ready",
          nextAction: "POST /api/research/runs/:runId/analysis-opportunity",
        });
      }
      res.json({ opportunity });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/analysis-opportunity", async (req, res) => {
    try {
      await initResearchSchema();
      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      const job = await getResearchJob(run.jobId);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });
      const existing = req.body?.forceRefresh ? null : await getAnalysisOpportunityForRun(run.id);
      if (existing) return res.json({ opportunity: existing, cached: true });

      const opportunity = await buildAnalysisOpportunityWithLlmExpansion({
        job,
        run,
        report: await getLatestResearchReportForRun(run.id),
        documents: await listCrawlDocumentsForRun(run.id),
        tables: await listExtractedTablesForRun(run.id),
        assets: await listDocumentAssetsForRun(run.id),
        candidates: await listSearchCandidatesForRun(run.id),
        frontier: await listFrontierItemsForRun(run.id),
        providers: await listDiscoveryResultsForRun(run.id),
        evidence: await listEvidenceItemsForRun(run.id),
        claims: await listEvidenceClaimsForRun(run.id),
        sourceProfiles: await listSourceProfiles(),
      });
      const saved = await upsertAnalysisOpportunity(opportunity);
      await addRunEvent({
        jobId: job.id,
        runId: run.id,
        stage: run.stage,
        level: "info",
        message: "已生成 Research 到 Data Lab 的分析机会评估。",
        data: {
          opportunityId: saved.id,
          recommendedAnalysisMode: saved.recommendedAnalysisMode,
          score: saved.score,
          canEnterDataLab: saved.canEnterDataLab,
        },
      });
      res.status(201).json({ opportunity: saved, cached: false });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.post("/runs/:runId/analysis-handoff", async (req, res) => {
    try {
      await initResearchSchema();
      const decision = normalizeAnalysisHandoffDecisionInput(req.body?.decision);
      if (!decision) {
        return res.status(400).json({
          error: "invalid_analysis_handoff_decision",
          allowedDecisions: ANALYSIS_HANDOFF_DECISIONS,
        });
      }

      const run = await getResearchRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      if (run.status === "cancelled") return res.status(409).json({ error: "research_run_cancelled" });

      const job = await getResearchJob(run.jobId);
      if (!job) return res.status(404).json({ error: "research_job_not_found" });

      const opportunity = await ensureAnalysisOpportunityForHandoff({
        job,
        run,
        forceRefresh: Boolean(req.body?.forceRefreshOpportunity),
      });
      if (!opportunity.id) {
        return res.status(500).json({ error: "analysis_opportunity_id_missing" });
      }

      const sideEffects = await prepareAnalysisHandoffSideEffects({ decision, opportunity, job, run });
      const handoffDraft = buildAnalysisHandoffDraft({
        opportunity,
        job,
        run,
        decision,
        datasetIds: sideEffects.datasetIds,
        sourceDatasetId: sideEffects.sourceDatasetId,
        extraWarnings: sideEffects.warnings,
        nextActions: sideEffects.nextActions,
      });
      const handoff = await upsertAnalysisHandoff(handoffDraft);
      await addRunEvent({
        jobId: job.id,
        runId: run.id,
        stage: decision === "continue_crawl" ? "discovery" : run.stage,
        level: "info",
        message: "已记录 Research 到 Data Lab 的分析交接决策。",
        data: {
          handoffId: handoff.id,
          opportunityId: opportunity.id,
          decision: handoff.decision,
          targetPage: handoff.targetPage,
          datasetIds: handoff.datasetIds,
          plannedQueryCount: sideEffects.plannedQueries.length,
        },
      });

      res.status(201).json(formatAnalysisHandoffResponse({
        handoff,
        opportunity,
        datasets: sideEffects.datasets,
        plannedQueries: sideEffects.plannedQueries,
      }));
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
        message: resetItems.length > 0 ? "失败、跳过或卡在抓取中的 frontier 项已重置并等待重试。" : "没有可重试的失败、跳过或卡住 frontier 项。",
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

const ANALYSIS_HANDOFF_DECISIONS: AnalysisHandoffDecision[] = [
  "report_only",
  "light_analysis",
  "full_analysis",
  "continue_crawl",
];

async function ensureAnalysisOpportunityForHandoff(input: {
  job: ResearchJob;
  run: ResearchRun;
  forceRefresh?: boolean;
}): Promise<AnalysisOpportunity> {
  const existing = input.forceRefresh ? null : await getAnalysisOpportunityForRun(input.run.id);
  if (existing) return existing;

  const opportunity = await buildAnalysisOpportunityWithLlmExpansion({
    job: input.job,
    run: input.run,
    report: await getLatestResearchReportForRun(input.run.id),
    documents: await listCrawlDocumentsForRun(input.run.id),
    tables: await listExtractedTablesForRun(input.run.id),
    assets: await listDocumentAssetsForRun(input.run.id),
    candidates: await listSearchCandidatesForRun(input.run.id),
    frontier: await listFrontierItemsForRun(input.run.id),
    providers: await listDiscoveryResultsForRun(input.run.id),
    evidence: await listEvidenceItemsForRun(input.run.id),
    claims: await listEvidenceClaimsForRun(input.run.id),
    sourceProfiles: await listSourceProfiles(),
  });
  const saved = await upsertAnalysisOpportunity(opportunity);
  await addRunEvent({
    jobId: input.job.id,
    runId: input.run.id,
    stage: input.run.stage,
    level: "info",
    message: "分析交接前已自动生成 Research 到 Data Lab 的分析机会评估。",
    data: {
      opportunityId: saved.id,
      recommendedAnalysisMode: saved.recommendedAnalysisMode,
      score: saved.score,
      canEnterDataLab: saved.canEnterDataLab,
    },
  });
  return saved;
}

function buildAnalysisHandoffDraft(input: {
  opportunity: AnalysisOpportunity;
  job: ResearchJob;
  run: ResearchRun;
  decision: AnalysisHandoffDecision;
  datasetIds: string[];
  sourceDatasetId?: string;
  extraWarnings?: string[];
  nextActions?: string[];
}): AnalysisHandoff {
  const warnings = [
    ...input.opportunity.warnings,
    ...handoffWarningsForDecision(input.decision, input.opportunity),
    ...(input.extraWarnings ?? []),
  ];
  return {
    opportunityId: input.opportunity.id ?? "",
    researchRunId: input.run.id,
    researchJobId: input.job.id,
    reportId: input.opportunity.reportId,
    decision: input.decision,
    targetPage: targetPageForHandoffDecision(input.decision),
    topicId: topicIdForHandoffDecision(input.decision, input.job.id),
    datasetIds: input.datasetIds,
    planId: planIdForHandoffDecision(input.decision, input.opportunity.id),
    allowedOperations: allowedOperationsForHandoffDecision(input.decision),
    nextActions: input.nextActions ?? nextActionsForHandoffDecision(input.decision, input.opportunity),
    warnings,
    lineage: {
      runId: input.run.id,
      jobId: input.job.id,
      reportId: input.opportunity.reportId,
      sourceDatasetId: input.sourceDatasetId,
      opportunityId: input.opportunity.id ?? "",
    },
  };
}

async function prepareAnalysisHandoffSideEffects(input: {
  decision: AnalysisHandoffDecision;
  opportunity: AnalysisOpportunity;
  job: ResearchJob;
  run: ResearchRun;
}): Promise<{
  datasetIds: string[];
  datasets: Array<Record<string, unknown>>;
  plannedQueries: PlannedQuery[];
  sourceDatasetId?: string;
  nextActions?: string[];
  warnings: string[];
}> {
  if (input.decision === "report_only") {
    return {
      datasetIds: [],
      datasets: [],
      plannedQueries: [],
      warnings: [],
      nextActions: nextActionsForHandoffDecision(input.decision, input.opportunity),
    };
  }

  if (input.decision === "continue_crawl") {
    const plannedQueries = await appendContinueCrawlQueries({
      job: input.job,
      run: input.run,
      opportunity: input.opportunity,
    });
    if (plannedQueries.length > 0) {
      const queries = await listPlannedQueriesForRun(input.run.id);
      await updateResearchJobQueryPlan(input.job.id, queries.map((query) => query.text));
      await updateResearchRunStatus(input.run.id, "queued", "discovery");
      await updateResearchJobStatus(input.job.id, "running");
      await enqueueResearchStage({ runId: input.run.id, jobId: input.job.id, stage: "discovery", attemptReason: "manual" });
    }
    return {
      datasetIds: [],
      datasets: [],
      plannedQueries,
      warnings: plannedQueries.length > 0 ? [] : ["未能生成额外的继续抓取查询。"],
      nextActions: nextActionsForHandoffDecision(input.decision, input.opportunity),
    };
  }

  const registry = await ensureResearchDataSourceRegistryDataset(input);
  return {
    datasetIds: [registry.dataset.id],
    datasets: [formatHandoffDataset(registry)],
    plannedQueries: [],
    sourceDatasetId: registry.dataset.id,
    warnings: registry.warnings,
    nextActions: input.decision === "light_analysis"
      ? ["进入 Data Lab 来源页", "检查并物化可用数据源", "运行画像、描述统计和基础图表"]
      : nextActionsForHandoffDecision(input.decision, input.opportunity),
  };
}

async function ensureResearchDataSourceRegistryDataset(input: {
  opportunity: AnalysisOpportunity;
  job: ResearchJob;
  run: ResearchRun;
}): Promise<{
  dataset: Awaited<ReturnType<typeof createAnalyticsDataset>>["dataset"];
  summary: ResearchDataSourceDatasetSummary;
  reused: boolean;
  warnings: string[];
}> {
  const existing = await findResearchDataSourceRegistryDataset(input.run.id);
  if (existing) {
    return {
      dataset: existing.dataset,
      summary: existing.summary,
      reused: true,
      warnings: existing.dataset.rowCount > 0 ? [] : ["已复用但当前 source registry 仍为空。"],
    };
  }

  const [candidates, frontier, providers] = await Promise.all([
    listSearchCandidatesForRun(input.run.id),
    listFrontierItemsForRun(input.run.id),
    listDiscoveryResultsForRun(input.run.id),
  ]);
  const { rows, summary } = buildResearchDataSourceRows({
    runId: input.run.id,
    candidates,
    frontier,
    providers,
  });
  const result = await createAnalyticsDataset({
    name: `${input.job.topic} / Research data sources`,
    sourceKind: "research-data-source",
    sourceRef: input.run.id,
    rows,
    metadata: {
      runId: input.run.id,
      jobId: input.job.id,
      topic: input.job.topic,
      analysisOpportunityId: input.opportunity.id,
      recommendedAnalysisMode: input.opportunity.recommendedAnalysisMode,
      sourceDatasetType: "research-data-source-candidates",
      summary,
      lineage: {
        candidates: candidates.length,
        frontier: frontier.length,
        providers: providers.length,
        generatedFrom: [
          "search_candidates",
          "frontier_items",
          "discovery_results",
        ],
      },
    },
  });
  return {
    dataset: result.dataset,
    summary,
    reused: false,
    warnings: rows.length > 0 ? [] : ["当前 Research run 尚未整理出可复用的数据源，source registry 为空。"],
  };
}

async function findResearchDataSourceRegistryDataset(runId: string) {
  const datasets = await listAnalyticsDatasets(200);
  const dataset = datasets.find((item) => item.sourceKind === "research-data-source" && item.sourceRef === runId);
  if (!dataset) return null;
  const summarySource = isRecord(dataset.metadata?.summary) ? dataset.metadata.summary : {};
  const summary = isResearchDataSourceDatasetSummary(dataset.metadata?.summary)
    ? dataset.metadata.summary as ResearchDataSourceDatasetSummary
    : {
      runId,
      candidateCount: Number(summarySource.candidateCount ?? 0),
      frontierCount: Number(summarySource.frontierCount ?? 0),
      providerCount: Number(summarySource.providerCount ?? 0),
      dataSourceCount: Number(summarySource.dataSourceCount ?? dataset.rowCount ?? 0),
      providerTypes: Array.isArray(summarySource.providerTypes) ? summarySource.providerTypes.map(String) : [],
      sourceTypes: Array.isArray(summarySource.sourceTypes) ? summarySource.sourceTypes.map(String) : [],
    };
  return { dataset, summary };
}

function formatHandoffDataset(input: {
  dataset: Awaited<ReturnType<typeof createAnalyticsDataset>>["dataset"];
  summary: ResearchDataSourceDatasetSummary;
  reused: boolean;
}): Record<string, unknown> {
  return {
    id: input.dataset.id,
    name: input.dataset.name,
    sourceKind: input.dataset.sourceKind,
    sourceRef: input.dataset.sourceRef,
    rowCount: input.dataset.rowCount,
    columnCount: input.dataset.columnCount,
    reused: input.reused,
    summary: input.summary,
    metadata: input.dataset.metadata,
  };
}

function isResearchDataSourceDatasetSummary(value: unknown): value is ResearchDataSourceDatasetSummary {
  return Boolean(value && typeof value === "object" && "runId" in value && "candidateCount" in value && "frontierCount" in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function appendContinueCrawlQueries(input: {
  job: ResearchJob;
  run: ResearchRun;
  opportunity: AnalysisOpportunity;
}): Promise<PlannedQuery[]> {
  const plannedQueries: PlannedQuery[] = [];
  const existingQueries = await listPlannedQueriesForRun(input.run.id);
  const existingTexts = new Set(existingQueries.map((query) => query.text));
  const derivedQueries = deriveContinueCrawlQueries(input);
  for (const query of derivedQueries) {
    if (existingTexts.has(query.text)) continue;
    const saved = await appendPlannedQueryForRun({
      jobId: input.job.id,
      runId: input.run.id,
      text: query.text,
      purpose: query.purpose,
      sourceTypes: query.sourceTypes,
      language: query.language,
      priority: query.priority,
    });
    plannedQueries.push(saved);
  }
  return plannedQueries;
}

function deriveContinueCrawlQueries(input: {
  job: ResearchJob;
  opportunity: AnalysisOpportunity;
}): PlannedQuery[] {
  const topic = input.job.topic.trim() || input.opportunity.topic.trim() || "研究主题";
  const missingFields = input.opportunity.missingFields.slice(0, 6);
  const sourceHints = input.opportunity.recommendedDataSources.slice(0, 4);
  const queries: PlannedQuery[] = [];

  for (const field of missingFields) {
    queries.push({
      id: "",
      text: `${topic} ${field} 数据来源`,
      purpose: "dataset-discovery",
      sourceTypes: ["dataset", "data-catalog", "structured-api"],
      language: /[\u4e00-\u9fff]/.test(`${topic} ${field}`) ? "mixed" : "en",
      priority: 88,
    });
  }

  for (const source of sourceHints) {
    const sourceName = source.title?.trim() || source.kind.trim() || source.reason.trim();
    queries.push({
      id: "",
      text: `${topic} ${sourceName} 结构化数据`,
      purpose: "statistical-source",
      sourceTypes: source.sourceType ? [source.sourceType] : ["dataset", "data-catalog", "structured-api"],
      language: /[\u4e00-\u9fff]/.test(`${topic} ${sourceName}`) ? "mixed" : "en",
      priority: Math.max(70, Math.round((source.qualityScore ?? 0.72) * 100)),
    });
  }

  if (queries.length === 0) {
    queries.push({
      id: "",
      text: `${topic} 补充结构化数据源`,
      purpose: "dataset-discovery",
      sourceTypes: ["dataset", "data-catalog", "structured-api"],
      language: /[\u4e00-\u9fff]/.test(topic) ? "mixed" : "en",
      priority: 80,
    });
  }

  return queries;
}

function formatAnalysisHandoffResponse(input: {
  handoff: AnalysisHandoff;
  opportunity: AnalysisOpportunity;
  datasets: Array<Record<string, unknown>>;
  plannedQueries: PlannedQuery[];
}) {
  return {
    handoff: input.handoff,
    opportunity: input.opportunity,
    handoff_id: input.handoff.id,
    decision: input.handoff.decision,
    target_page: input.handoff.targetPage,
    targetPage: input.handoff.targetPage,
    topic_id: input.handoff.topicId,
    plan_id: input.handoff.planId,
    dataset_ids: input.handoff.datasetIds,
    datasets: input.datasets,
    plannedQueries: input.plannedQueries,
    next_actions: input.handoff.nextActions,
    warnings: input.handoff.warnings,
  };
}

function normalizeAnalysisHandoffDecisionInput(value: unknown): AnalysisHandoffDecision | null {
  return ANALYSIS_HANDOFF_DECISIONS.includes(value as AnalysisHandoffDecision)
    ? value as AnalysisHandoffDecision
    : null;
}

function targetPageForHandoffDecision(decision: AnalysisHandoffDecision): AnalysisHandoff["targetPage"] {
  if (decision === "report_only") return "research-report";
  if (decision === "continue_crawl") return "research-discovery";
  if (decision === "light_analysis") return "sources";
  if (decision === "full_analysis") return "wizard";
  return "wizard";
}

function topicIdForHandoffDecision(decision: AnalysisHandoffDecision, jobId: string) {
  return decision === "full_analysis" ? `research-topic:${jobId}` : undefined;
}

function planIdForHandoffDecision(decision: AnalysisHandoffDecision, opportunityId?: string) {
  return decision === "full_analysis" && opportunityId ? `analysis-plan:${opportunityId}` : undefined;
}

function allowedOperationsForHandoffDecision(decision: AnalysisHandoffDecision) {
  if (decision === "report_only") return [];
  if (decision === "continue_crawl") return ["discovery", "planned_queries"];
  if (decision === "light_analysis") return ["profile", "stats", "chart"];
  return [
    "profile",
    "stats",
    "quality",
    "frequency",
    "crosstab",
    "tests",
    "regression",
    "cluster",
    "timeseries",
    "geo",
    "chart",
    "report",
    "export",
  ];
}

function nextActionsForHandoffDecision(decision: AnalysisHandoffDecision, opportunity: AnalysisOpportunity) {
  if (decision === "report_only") {
    return ["继续查看 Research 报告", "如后续发现结构化数据，可重新生成分析机会"];
  }
  if (decision === "light_analysis") {
    return ["进入 Data Lab 来源页", "检查并物化可用数据源", "运行画像、描述统计和基础图表"];
  }
  if (decision === "full_analysis") {
    return ["进入 Data Lab 分析向导", "确认字段覆盖和字段映射", "生成主题驱动的数据分析计划"];
  }
  const missing = opportunity.missingFields.slice(0, 4).join("、");
  return missing
    ? [`补充抓取缺失字段：${missing}`, "重新进入 Research discovery"]
    : ["补充抓取更多结构化数据源", "重新进入 Research discovery"];
}

function handoffWarningsForDecision(decision: AnalysisHandoffDecision, opportunity: AnalysisOpportunity) {
  const warnings: string[] = [];
  if ((decision === "light_analysis" || decision === "full_analysis") && !opportunity.canEnterDataLab) {
    warnings.push("当前 Research 结果的数据分析适配度较低，建议先检查字段覆盖或继续抓取。");
  }
  if (decision === "full_analysis" && opportunity.missingFields.length > 0) {
    warnings.push(`完整分析仍缺少字段：${opportunity.missingFields.slice(0, 6).join("、")}`);
  }
  if (decision !== opportunity.recommendedAnalysisMode) {
    warnings.push(`用户选择了 ${decision}，与系统推荐的 ${opportunity.recommendedAnalysisMode} 不同。`);
  }
  return warnings;
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
