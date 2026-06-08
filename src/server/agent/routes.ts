import { Router } from "express";
import { getAnalyticsCapabilities, profileRows, suggestVisualizations } from "../analytics/engine";
import { normalizeAnalysisKind, renderDatasetVisualization, runDatasetAnalysis } from "../analytics/jobs";
import { createAnalyticsDataset } from "../analytics/store";
import { normalizeResearchBudget } from "../research/budget";
import { createResearchJob, initResearchSchema } from "../research/store";
import { createQueuedResearchRun } from "../research/run";
import { planAgentDispatch } from "./dispatcher";

export function createAgentRouter() {
  const router = Router();

  router.get("/capabilities", (_req, res) => {
    res.json({
      agent: {
        role: "任务分配 Agent",
        modelRouting: "AI_BASE_URL、AI_API_KEY、AI_MODEL 指向 GPT 中转站；当前轻量分派器本身不依赖模型调用。",
      },
      analytics: getAnalyticsCapabilities(),
      research: [
        "web-search",
        "rss",
        "sitemap",
        "newsapi",
        "gdelt",
        "wayback",
        "commoncrawl",
        "github",
        "npm",
        "pypi",
        "ckan",
        "socrata",
        "arcgis",
        "kaggle",
        "huggingface",
        "openml",
        "worldbank",
        "fred",
        "openalex",
        "crossref",
        "sports",
      ],
    });
  });

  router.post("/dispatch", async (req, res) => {
    try {
      const plan = planAgentDispatch({
        message: String(req.body.message ?? ""),
        execute: Boolean(req.body.execute),
        seedUrls: Array.isArray(req.body.seedUrls) ? req.body.seedUrls : undefined,
        budget: req.body.budget,
        dataRows: Array.isArray(req.body.dataRows) ? req.body.dataRows : undefined,
      });

      if (!req.body.execute) {
        return res.json({ plan, executed: false });
      }

      const executions: unknown[] = [];

      if (plan.tasks.some((task) => task.intent === "research-crawl")) {
        await initResearchSchema();
        const job = await createResearchJob({
          topic: String(req.body.message ?? ""),
          seedUrls: Array.isArray(req.body.seedUrls) ? req.body.seedUrls : [],
          budget: normalizeResearchBudget(req.body.budget ?? {}),
        });
        executions.push(await createQueuedResearchRun(job.id));
      }

      if (plan.tasks.some((task) => task.intent === "data-analysis" || task.intent === "visualization")) {
        const rows = Array.isArray(req.body.dataRows) ? req.body.dataRows : [];
        if (rows.length > 0) {
          const datasetResult = await createAnalyticsDataset({
            name: `Agent dataset: ${String(req.body.message ?? "").slice(0, 80)}`,
            sourceKind: "manual",
            rows,
            metadata: { createdBy: "agent" },
          });
          executions.push({ type: "analytics-dataset", ...datasetResult });

          const analysisTasks = plan.tasks.filter((task) => task.endpoint === "/api/analytics/datasets/:datasetId/analyze");
          for (const task of analysisTasks) {
            const kind = normalizeAnalysisKind(task.body?.kind);
            executions.push({
              type: `python-${kind}`,
              taskId: task.id,
              ...(await runDatasetAnalysis(datasetResult.dataset.id, kind)),
            });
          }

          if (plan.tasks.some((task) => task.id === "render-visualization-artifact")) {
            executions.push({
              type: "visualization-artifact",
              ...(await renderDatasetVisualization({
                datasetId: datasetResult.dataset.id,
                title: String(req.body.message ?? "Agent visualization"),
              })),
            });
          }
        } else {
          const profile = profileRows({ rows });
          executions.push({ profile, suggestions: suggestVisualizations(profile) });
        }
      }

      return res.status(202).json({ plan, executed: true, executions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { statusCode?: number })?.statusCode ?? 500;
      return res.status(status).json({ error: message });
    }
  });

  return router;
}
