import { Router } from "express";
import { normalizeResearchBudget } from "./budget";
import { sendResearchConfigStatus, sendResearchError } from "./http";
import {
  createResearchJob,
  getLatestResearchReport,
  getResearchJob,
  initResearchSchema,
  listResearchJobs,
  updateResearchJobStatus,
} from "./store";

export function createResearchRouter() {
  const router = Router();

  router.get("/status", sendResearchConfigStatus);

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
      await initResearchSchema();
      const job = await updateResearchJobStatus(req.params.id, "running");
      if (!job) return res.status(404).json({ error: "research_job_not_found" });
      res.json({ success: true, job, queued: false, message: "Research queue runner is not wired yet." });
    } catch (error) {
      sendResearchError(res, error);
    }
  });

  router.get("/jobs/:id/documents", async (_req, res) => {
    res.json({ documents: [], message: "Research document listing will be populated by crawler workers." });
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
