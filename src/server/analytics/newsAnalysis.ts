import { Router } from "express";
import { createAnalyticsDataset } from "./store";
import { runDatasetAnalysis } from "./jobs";
import { listCrawlDocumentsForRun } from "../research/store";
import { CrawlDocument } from "../research/types";

type NewsAnalysisEndpoint = "cluster" | "timeline" | "source-quality";

interface NewsAnalysisRouterOptions {
  listDocumentsForRun?: (runId: string) => Promise<CrawlDocument[]>;
}

export function createNewsAnalysisRouter(options: NewsAnalysisRouterOptions = {}) {
  const router = Router();
  const listDocuments = options.listDocumentsForRun ?? listCrawlDocumentsForRun;

  router.post("/runs/:runId/cluster", createRunNewsAnalysisHandler({
    endpoint: "cluster",
    listDocuments,
  }));
  router.post("/runs/:runId/timeline", createRunNewsAnalysisHandler({
    endpoint: "timeline",
    listDocuments,
  }));
  router.post("/runs/:runId/source-quality", createRunNewsAnalysisHandler({
    endpoint: "source-quality",
    listDocuments,
  }));

  return router;
}

function createRunNewsAnalysisHandler(input: {
  endpoint: NewsAnalysisEndpoint;
  listDocuments: (runId: string) => Promise<CrawlDocument[]>;
}) {
  return async (req: any, res: any) => {
    try {
      const runId = String(req.params.runId ?? "").trim();
      if (!runId) return res.status(400).json({ error: "research_run_id_required" });

      const documents = await input.listDocuments(runId);
      const rows = researchDocumentsToNewsRows(documents);
      const datasetResult = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || `Research run ${runId} news analysis`,
        sourceKind: "research-run",
        sourceRef: runId,
        rows,
        metadata: {
          runId,
          documentCount: documents.length,
          fetchedDocumentCount: rows.filter((row) => row.status === "fetched").length,
          analysisEndpoint: `/api/news-analysis/runs/:runId/${input.endpoint}`,
          analysisKind: "news-organization",
        },
      });
      const analysis = await runDatasetAnalysis(datasetResult.dataset.id, "news-organization");
      const result = normalizeNewsWorkerResult(analysis.worker.result);

      res.status(201).json({
        endpoint: input.endpoint,
        runId,
        dataset: datasetResult.dataset,
        profile: datasetResult.profile,
        suggestions: datasetResult.suggestions,
        job: analysis.job,
        artifact: analysis.artifact,
        worker: analysis.worker,
        documentCount: result.documentCount,
        duplicateCount: result.duplicateCount,
        clusters: result.clusters,
        timeline: result.timeline,
        sourceProfiles: result.sourceProfiles,
        entities: result.entities,
        conflictSignals: result.conflictSignals,
      });
    } catch (error) {
      sendNewsAnalysisError(res, error);
    }
  };
}

export function researchDocumentsToNewsRows(documents: CrawlDocument[]): Array<Record<string, unknown>> {
  return documents.map((document) => {
    const url = document.finalUrl || document.url;
    const domain = document.domain || domainFromUrl(url);
    return {
      documentId: document.id ?? "",
      title: document.title ?? "",
      url,
      sourceUrl: url,
      domain,
      source: domain,
      content: document.contentText ?? "",
      contentText: document.contentText ?? "",
      text: document.contentText ?? "",
      date: document.fetchedAt ?? "",
      fetchedAt: document.fetchedAt ?? "",
      status: document.status,
      depth: document.depth,
      memoryStatus: document.memoryStatus ?? "",
      textLength: document.contentText?.length ?? 0,
      hasError: Boolean(document.error),
      error: document.error ?? "",
    };
  });
}

function normalizeNewsWorkerResult(result: Record<string, unknown>) {
  return {
    documentCount: Number(result.documentCount ?? 0),
    duplicateCount: Number(result.duplicateCount ?? 0),
    clusters: Array.isArray(result.clusters) ? result.clusters : [],
    timeline: Array.isArray(result.timeline) ? result.timeline : [],
    sourceProfiles: normalizeSourceProfiles(result.sourceProfiles),
    entities: Array.isArray(result.entities) ? result.entities : [],
    conflictSignals: Array.isArray(result.conflictSignals) ? result.conflictSignals : [],
  };
}

function normalizeSourceProfiles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!isRecord(item)) return item;
    const source = String(item.source ?? item.domain ?? "unknown");
    return {
      ...item,
      domain: String(item.domain ?? source),
      source,
    };
  });
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendNewsAnalysisError(res: any, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { statusCode?: number })?.statusCode ?? (message.includes("not_found") ? 404 : 500);
  res.status(status).json({ error: message });
}
