import { Router } from "express";
import { normalizeResearchBudget } from "./budget";
import { aggregateProviderHealth } from "./discovery/providerRegistry";
import { summarizeEvidenceGraph } from "./evidence/graph";
import { sendResearchConfigStatus, sendResearchError } from "./http";
import {
  addRunEvent,
  createResearchJob,
  createResearchRun,
  getLatestResearchReportForRun,
  getLatestResearchReport,
  getResearchJob,
  getResearchRun,
  initResearchSchema,
  listCrawlDocumentsForJob,
  listCrawlDocumentsForRun,
  listDocumentAssetsForRun,
  listDiscoveryResults,
  listDiscoveryResultsForRun,
  listEvidenceClaimsForRun,
  listEvidenceItemsForRun,
  listEvidenceRelationsForRun,
  listFrontierItemsForRun,
  listResearchJobs,
  listResearchRunsForJob,
  listRunEvents,
  listSourceProfiles,
  searchCrawlDocumentsForRun,
  updateResearchJobStatus,
  updateResearchRunStatus,
} from "./store";
import { createQueuedResearchRun } from "./run";
import { enqueueResearchRun, getQueueStatus } from "./workers/queues";

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

  router.post("/jobs", async (req, res) => {
    try {
      await initResearchSchema();
      const job = await createResearchJob({
        topic: String(req.body.topic ?? "").trim(),
        seedUrls: Array.isArray(req.body.seedUrls) ? req.body.seedUrls : [],
        budget: normalizeResearchBudget(req.body.budget ?? {}),
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
      const run = await updateResearchRunStatus(req.params.runId, "paused", "paused");
      if (!run) return res.status(404).json({ error: "research_run_not_found" });
      await addRunEvent({ jobId: run.jobId, runId: run.id, stage: "paused", level: "warn", message: "研究 run 已暂停。" });
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
      const resumed = await updateResearchRunStatus(run.id, "queued", "queued") ?? run;
      await addRunEvent({ jobId: run.jobId, runId: run.id, stage: "queued", level: "info", message: "研究 run 已恢复并重新入队。" });
      await enqueueResearchRun(run.id, run.jobId);
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
