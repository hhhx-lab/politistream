import { Router } from "express";
import path from "path";
import fs from "fs";
import { computeDescriptiveStatistics, getAnalyticsCapabilities, profileRows, suggestVisualizations } from "./engine";
import {
  createAnalyticsDataset,
  createDatasetProfile,
  getAnalyticsArtifact,
  getAnalyticsDataset,
  getAnalyticsJob,
  getLatestDatasetProfile,
  initAnalyticsSchema,
  listAnalyticsArtifacts,
  listAnalyticsDatasets,
  listAnalyticsJobs,
  updateAnalyticsJob,
} from "./store";
import { buildResearchDataSourceRows } from "./researchDataSources";
import {
  listCrawlDocumentsForRun,
  listDiscoveryResultsForRun,
  listFrontierItemsForRun,
  listSearchCandidatesForRun,
} from "../research/store";
import { extractPdfDocument } from "../research/extractors/pdfExtractor";
import { inspectStructuredBuffer } from "../research/extractors/structuredInspector";
import { normalizeAnalysisKind, renderDatasetVisualization, runDatasetAnalysis } from "./jobs";
import { DataSourceFetcher, materializeResearchDataSource, materializeResearchDataSources, refreshMaterializedDataSource } from "./sourceMaterializer";
import { researchDocumentsToNewsRows } from "./newsAnalysis";
import { VisualizationSuggestion } from "./types";
import { CrawlDocument, DiscoveryResult, ExtractedTable, ExtractorKind, FrontierItem, SearchCandidate } from "../research/types";

export interface AnalyticsRouterDependencies {
  listDocumentsForRun?: (runId: string) => Promise<CrawlDocument[]>;
  listCandidatesForRun?: (runId: string) => Promise<SearchCandidate[]>;
  listFrontierForRun?: (runId: string) => Promise<FrontierItem[]>;
  listProvidersForRun?: (runId: string) => Promise<DiscoveryResult[]>;
  fetchDataSource?: DataSourceFetcher;
}

export function createAnalyticsRouter(dependencies: AnalyticsRouterDependencies = {}) {
  const router = Router();
  const listDocuments = dependencies.listDocumentsForRun ?? listCrawlDocumentsForRun;
  const listCandidates = dependencies.listCandidatesForRun ?? listSearchCandidatesForRun;
  const listFrontier = dependencies.listFrontierForRun ?? listFrontierItemsForRun;
  const listProviders = dependencies.listProvidersForRun ?? listDiscoveryResultsForRun;

  router.get("/status", (_req, res) => {
    const capabilities = getAnalyticsCapabilities();
    res.json({
      status: "ok",
      available: capabilities.filter((capability) => capability.status === "available").length,
      externalWorker: capabilities.filter((capability) => capability.status === "external-worker").length,
      planned: capabilities.filter((capability) => capability.status === "planned").length,
    });
  });

  router.get("/capabilities", (_req, res) => {
    res.json({ capabilities: getAnalyticsCapabilities() });
  });

  router.post("/profile", (req, res) => {
    const profile = profileRows({ rows: Array.isArray(req.body.rows) ? req.body.rows : [] });
    res.json({ profile, suggestions: suggestVisualizations(profile) });
  });

  router.get("/datasets", async (req, res) => {
    try {
      await initAnalyticsSchema();
      const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50;
      res.json({ datasets: await listAnalyticsDatasets(limit) });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/jobs", async (req, res) => {
    try {
      const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50;
      res.json({ jobs: await listAnalyticsJobs(limit) });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/jobs/:id", async (req, res) => {
    try {
      const job = await getAnalyticsJob(req.params.id);
      if (!job) return res.status(404).json({ error: "analytics_job_not_found" });
      res.json({ job });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/artifacts", async (req, res) => {
    try {
      const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50;
      res.json({ artifacts: await listAnalyticsArtifacts(limit) });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/artifact-files", (req, res) => {
    const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
    const resolved = resolveAnalyticsArtifactFile({
      artifactDir: analyticsArtifactDir(),
      requestedPath,
    });
    if (!resolved.allowed || !resolved.path || !fs.existsSync(resolved.path)) {
      return res.status(404).json({ error: "analytics_artifact_file_not_found" });
    }
    res.download(resolved.path);
  });

  router.post("/datasets", async (req, res) => {
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      const result = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || "Manual dataset",
        sourceKind: req.body.sourceKind,
        sourceRef: req.body.sourceRef,
        rows,
        metadata: req.body.metadata ?? {},
      });
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/import", async (req, res) => {
    try {
      const kind = normalizeImportKind(req.body.kind);
      const name = String(req.body.name ?? "").trim() || `Imported ${kind} dataset`;
      const buffer = importBuffer(req.body);
      const url = typeof req.body.url === "string" ? req.body.url : `file:///${encodeURIComponent(name)}`;
      const maxRows = Number.isFinite(Number(req.body.maxRows)) ? Number(req.body.maxRows) : analyticsImportMaxRows();
      const extracted = kind === "pdf"
        ? await extractPdfDocument(buffer, url)
        : await inspectStructuredBuffer({
          url,
          contentType: typeof req.body.contentType === "string" ? req.body.contentType : contentTypeForKind(kind),
          kind,
          buffer,
          title: name,
          maxRows,
        });
      const rows = rowsFromExtracted(extracted.tables, extracted.contentText, maxRows);
      const result = await createAnalyticsDataset({
        name,
        sourceKind: "upload",
        sourceRef: typeof req.body.url === "string" ? req.body.url : undefined,
        rows,
        metadata: {
          imported: true,
          kind,
          extractor: extracted.extractor,
          tableCount: extracted.tables.length,
          linkCount: extracted.links.length,
          importMaxRows: maxRows,
          documentMetadata: extracted.metadata,
        },
      });
      res.status(201).json({ ...result, extracted });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/from-research-run/:runId", async (req, res) => {
    try {
      const documents = await listDocuments(req.params.runId);
      const rows = researchDocumentsToNewsRows(documents);
      const result = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || `Research run ${req.params.runId}`,
        sourceKind: "research-run",
        sourceRef: req.params.runId,
        rows,
        metadata: {
          runId: req.params.runId,
          documentCount: documents.length,
        },
      });
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/from-research-run/:runId/data-sources", async (req, res) => {
    try {
      const [candidates, frontier, providers] = await Promise.all([
        listCandidates(req.params.runId),
        listFrontier(req.params.runId),
        listProviders(req.params.runId),
      ]);
      const { rows, summary } = buildResearchDataSourceRows({
        runId: req.params.runId,
        candidates,
        frontier,
        providers,
      });
      const result = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || `Research data sources ${req.params.runId}`,
        sourceKind: "research-data-source",
        sourceRef: req.params.runId,
        rows,
        metadata: {
          runId: req.params.runId,
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
      res.status(201).json({
        ...result,
        summary,
      });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/datasets/:id", async (req, res) => {
    try {
      const dataset = await getAnalyticsDataset(req.params.id);
      if (!dataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const profile = await getLatestDatasetProfile(dataset.id);
      res.json({ dataset, profile });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/profile", async (req, res) => {
    try {
      const profile = await createDatasetProfile(req.params.id);
      res.status(201).json(profile);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/analyze", async (req, res) => {
    try {
      const kind = normalizeAnalysisKind(req.body.kind);
      const result = await runDatasetAnalysis(req.params.id, kind);
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/materialize-source", async (req, res) => {
    try {
      const registryDataset = await getAnalyticsDataset(req.params.id);
      if (!registryDataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const maxRows = Number.isFinite(Number(req.body.maxRows)) ? Number(req.body.maxRows) : analyticsImportMaxRows();
      const materialized = await materializeResearchDataSource({
        dataset: registryDataset,
        rowIndex: Number.isFinite(Number(req.body.rowIndex)) ? Number(req.body.rowIndex) : 0,
        url: typeof req.body.url === "string" ? req.body.url : undefined,
        maxRows,
        fetcher: dependencies.fetchDataSource,
      });
      const sourceTitle = String(materialized.sourceRow.title ?? materialized.sourceRow.provider ?? "Data source");
      const sourceUrl = String(materialized.sourceRow.url ?? materialized.sourceRow.canonical_url ?? "");
      const result = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || `${registryDataset.name} / ${sourceTitle}`,
        sourceKind: "materialized-data-source",
        sourceRef: sourceUrl,
        rows: materialized.rows,
        metadata: {
          materializedFromDatasetId: registryDataset.id,
          materializedFromDatasetName: registryDataset.name,
          sourceRow: materialized.sourceRow,
          sourceUrl,
          fetched: materialized.fetched,
          kind: materialized.kind,
          extractor: materialized.extracted.extractor,
          tableCount: materialized.extracted.tables.length,
          importMaxRows: maxRows,
          lineage: {
            parentDatasetId: registryDataset.id,
            parentSourceKind: registryDataset.sourceKind,
            sourceLineage: materialized.sourceRow.lineage_json,
          },
        },
      });
      res.status(201).json({
        ...result,
        sourceRow: materialized.sourceRow,
        fetched: materialized.fetched,
        extracted: {
          extractor: materialized.extracted.extractor,
          tableCount: materialized.extracted.tables.length,
          metadata: materialized.extracted.metadata,
        },
      });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/materialize-sources", async (req, res) => {
    try {
      const registryDataset = await getAnalyticsDataset(req.params.id);
      if (!registryDataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const maxRows = Number.isFinite(Number(req.body.maxRows)) ? Number(req.body.maxRows) : analyticsImportMaxRows();
      const requestedLimit = Number.isFinite(Number(req.body.limit)) ? Number(req.body.limit) : undefined;
      const rowIndexes = Array.isArray(req.body.rowIndexes)
        ? req.body.rowIndexes.map((value: unknown) => Number(value)).filter(Number.isFinite)
        : undefined;
      const materializedResults = await materializeResearchDataSources({
        dataset: registryDataset,
        rowIndexes,
        limit: requestedLimit,
        maxRows,
        fetcher: dependencies.fetchDataSource,
      });
      const results = [];
      for (const item of materializedResults) {
        if (!item.ok) {
          results.push({
            ok: false,
            rowIndex: item.rowIndex,
            sourceRow: item.sourceRow,
            error: item.error,
            statusCode: item.statusCode,
          });
          continue;
        }
        const sourceTitle = String(item.materialized.sourceRow.title ?? item.materialized.sourceRow.provider ?? `Data source ${item.rowIndex + 1}`);
        const sourceUrl = String(item.materialized.sourceRow.url ?? item.materialized.sourceRow.canonical_url ?? "");
        const created = await createAnalyticsDataset({
          name: String(req.body.namePrefix ?? "").trim()
            ? `${String(req.body.namePrefix).trim()} / ${sourceTitle}`
            : `${registryDataset.name} / ${sourceTitle}`,
          sourceKind: "materialized-data-source",
          sourceRef: sourceUrl,
          rows: item.materialized.rows,
          metadata: {
            materializedFromDatasetId: registryDataset.id,
            materializedFromDatasetName: registryDataset.name,
            materializedBatch: true,
            materializedRowIndex: item.rowIndex,
            sourceRow: item.materialized.sourceRow,
            sourceUrl,
            fetched: item.materialized.fetched,
            kind: item.materialized.kind,
            extractor: item.materialized.extracted.extractor,
            tableCount: item.materialized.extracted.tables.length,
            importMaxRows: maxRows,
            lineage: {
              parentDatasetId: registryDataset.id,
              parentSourceKind: registryDataset.sourceKind,
              sourceLineage: item.materialized.sourceRow.lineage_json,
            },
          },
        });
        results.push({
          ok: true,
          rowIndex: item.rowIndex,
          sourceRow: item.materialized.sourceRow,
          dataset: created.dataset,
          profile: created.profile,
          suggestions: created.suggestions,
          fetched: item.materialized.fetched,
          extracted: {
            extractor: item.materialized.extracted.extractor,
            tableCount: item.materialized.extracted.tables.length,
            metadata: item.materialized.extracted.metadata,
          },
        });
      }
      const succeeded = results.filter((item) => item.ok).length;
      res.status(207).json({
        summary: {
          requested: materializedResults.length,
          succeeded,
          failed: materializedResults.length - succeeded,
          maxRows,
        },
        results,
      });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/refresh-materialized-source", async (req, res) => {
    try {
      const previousDataset = await getAnalyticsDataset(req.params.id);
      if (!previousDataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const maxRows = Number.isFinite(Number(req.body.maxRows)) ? Number(req.body.maxRows) : analyticsImportMaxRows();
      const materialized = await refreshMaterializedDataSource({
        dataset: previousDataset,
        maxRows,
        fetcher: dependencies.fetchDataSource,
      });
      const previousMetadata = isRecord(previousDataset.metadata) ? previousDataset.metadata : {};
      const previousVersion = Number(previousMetadata.materializedVersion ?? previousMetadata.version ?? 1);
      const nextVersion = Number.isFinite(previousVersion) ? Math.max(1, Math.floor(previousVersion)) + 1 : 2;
      const refreshRootDatasetId = String(previousMetadata.refreshRootDatasetId ?? previousMetadata.refreshOfDatasetId ?? previousDataset.id);
      const sourceUrl = String(materialized.sourceRow.url ?? materialized.sourceRow.canonical_url ?? previousDataset.sourceRef ?? "");
      const created = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || `${previousDataset.name} / refresh v${nextVersion}`,
        sourceKind: "materialized-data-source",
        sourceRef: sourceUrl,
        rows: materialized.rows,
        metadata: {
          ...previousMetadata,
          materializedVersion: nextVersion,
          refreshOfDatasetId: previousDataset.id,
          refreshRootDatasetId,
          refreshedAt: new Date().toISOString(),
          materializedFromDatasetId: previousMetadata.materializedFromDatasetId,
          materializedFromDatasetName: previousMetadata.materializedFromDatasetName,
          sourceRow: materialized.sourceRow,
          sourceUrl,
          fetched: materialized.fetched,
          kind: materialized.kind,
          extractor: materialized.extracted.extractor,
          tableCount: materialized.extracted.tables.length,
          importMaxRows: maxRows,
          lineage: {
            ...(isRecord(previousMetadata.lineage) ? previousMetadata.lineage : {}),
            previousDatasetId: previousDataset.id,
            refreshRootDatasetId,
            sourceLineage: materialized.sourceRow.lineage_json ?? previousMetadata.lineage,
          },
        },
      });
      res.status(201).json({
        ...created,
        sourceRow: materialized.sourceRow,
        fetched: materialized.fetched,
        extracted: {
          extractor: materialized.extracted.extractor,
          tableCount: materialized.extracted.tables.length,
          metadata: materialized.extracted.metadata,
        },
        refresh: {
          previousDatasetId: previousDataset.id,
          refreshRootDatasetId,
          version: nextVersion,
        },
      });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/visualizations/suggest", (req, res) => {
    const profile = req.body.profile ?? profileRows({ rows: Array.isArray(req.body.rows) ? req.body.rows : [] });
    res.json({ suggestions: suggestVisualizations(profile) });
  });

  router.post("/visualizations/render", async (req, res) => {
    try {
      const datasetId = typeof req.body.datasetId === "string" ? req.body.datasetId : undefined;
      const result = await renderDatasetVisualization({
        datasetId,
        rows: Array.isArray(req.body.rows) ? req.body.rows : undefined,
        suggestion: req.body.suggestion as VisualizationSuggestion | undefined,
        title: typeof req.body.title === "string" ? req.body.title : undefined,
      });
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/statistics/descriptive", (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    res.json(computeDescriptiveStatistics({ rows }));
  });

  return router;
}

export function createAnalyticsCompatibilityRouter() {
  const router = Router();

  router.get("/datasets", async (req, res) => {
    try {
      await initAnalyticsSchema();
      const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50;
      res.json({ datasets: await listAnalyticsDatasets(limit) });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets", async (req, res) => {
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      const result = await createAnalyticsDataset({
        name: String(req.body.name ?? "").trim() || "Manual dataset",
        sourceKind: req.body.sourceKind,
        sourceRef: req.body.sourceRef,
        rows,
        metadata: {
          ...(req.body.metadata ?? {}),
          compatibilityApi: "/api/datasets",
        },
      });
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/datasets/:id", async (req, res) => {
    try {
      const dataset = await getAnalyticsDataset(req.params.id);
      if (!dataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const profile = await getLatestDatasetProfile(dataset.id);
      res.json({ dataset, profile });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/profile", async (req, res) => {
    try {
      const profile = await createDatasetProfile(req.params.id);
      res.status(201).json(profile);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/validate", async (req, res) => {
    try {
      const dataset = await getAnalyticsDataset(req.params.id);
      if (!dataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const profile = await getLatestDatasetProfile(dataset.id) ?? await createDatasetProfile(dataset.id);
      res.json({
        dataset,
        profile: profile.profile,
        suggestions: profile.suggestions,
        warnings: profile.profile.warnings,
        qualityScore: profile.profile.qualityScore,
      });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/clean", async (req, res) => {
    try {
      const result = await runDatasetAnalysis(req.params.id, "data-cleaning");
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/datasets/:id/query", async (req, res) => {
    try {
      const dataset = await getAnalyticsDataset(req.params.id);
      if (!dataset) return res.status(404).json({ error: "analytics_dataset_not_found" });
      const rows = queryDatasetRows(dataset.rows ?? dataset.sampleRows, {
        select: req.body.select,
        limit: req.body.limit,
      });
      res.json({
        datasetId: dataset.id,
        rows,
        rowCount: rows.length,
        sourceRowCount: dataset.rowCount,
      });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/analysis/jobs", async (req, res) => {
    try {
      const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50;
      res.json({ jobs: await listAnalyticsJobs(limit) });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/analysis/jobs", async (req, res) => {
    try {
      const datasetId = String(req.body.datasetId ?? "").trim();
      if (!datasetId) return res.status(400).json({ error: "analytics_dataset_id_required" });
      const result = await runDatasetAnalysis(datasetId, normalizeAnalysisKind(req.body.kind));
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/analysis/jobs/:id", async (req, res) => {
    try {
      const job = await getAnalyticsJob(req.params.id);
      if (!job) return res.status(404).json({ error: "analytics_job_not_found" });
      res.json({ job });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/analysis/jobs/:id/run", async (req, res) => {
    try {
      const job = await getAnalyticsJob(req.params.id);
      if (!job) return res.status(404).json({ error: "analytics_job_not_found" });
      if (!job.datasetId) return res.status(409).json({ error: "analytics_job_missing_dataset" });
      const result = await runDatasetAnalysis(job.datasetId, job.kind);
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/analysis/jobs/:id/cancel", async (req, res) => {
    try {
      const job = await updateAnalyticsJob({
        id: req.params.id,
        status: "cancelled",
        error: "cancelled_by_user",
      });
      res.json({ job });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/visualizations", async (req, res) => {
    try {
      const result = await renderDatasetVisualization({
        datasetId: typeof req.body.datasetId === "string" ? req.body.datasetId : undefined,
        rows: Array.isArray(req.body.rows) ? req.body.rows : undefined,
        suggestion: req.body.suggestion as VisualizationSuggestion | undefined,
        title: typeof req.body.title === "string" ? req.body.title : undefined,
      });
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/visualizations/:id", async (req, res) => {
    try {
      const artifact = await getAnalyticsArtifact(req.params.id);
      if (!artifact || artifact.artifactType !== "visualization") return res.status(404).json({ error: "visualization_not_found" });
      res.json({ artifact });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/visualizations/:id/render", async (req, res) => {
    try {
      if (req.body.datasetId || req.body.rows || req.body.suggestion) {
        const result = await renderDatasetVisualization({
          datasetId: typeof req.body.datasetId === "string" ? req.body.datasetId : undefined,
          rows: Array.isArray(req.body.rows) ? req.body.rows : undefined,
          suggestion: req.body.suggestion as VisualizationSuggestion | undefined,
          title: typeof req.body.title === "string" ? req.body.title : undefined,
        });
        return res.status(201).json(result);
      }
      const artifact = await getAnalyticsArtifact(req.params.id);
      if (!artifact || artifact.artifactType !== "visualization") return res.status(404).json({ error: "visualization_not_found" });
      res.json({ artifact });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/visualizations/:id/export", async (req, res) => {
    try {
      const artifact = await getAnalyticsArtifact(req.params.id);
      if (!artifact || artifact.artifactType !== "visualization") return res.status(404).json({ error: "visualization_not_found" });
      sendArtifactExport(res, artifact, String(req.query.format ?? "json"));
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/reports", async (req, res) => {
    try {
      const datasetId = String(req.body.datasetId ?? "").trim();
      if (!datasetId) return res.status(400).json({ error: "analytics_dataset_id_required" });
      const result = await runDatasetAnalysis(datasetId, "export-report");
      res.status(201).json(result);
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/reports/:id", async (req, res) => {
    try {
      const artifact = await getAnalyticsArtifact(req.params.id);
      if (!artifact || artifact.artifactType !== "report") return res.status(404).json({ error: "report_not_found" });
      res.json({ artifact });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.post("/reports/:id/render", async (req, res) => {
    try {
      if (req.body.datasetId) {
        const result = await runDatasetAnalysis(String(req.body.datasetId), "export-report");
        return res.status(201).json(result);
      }
      const artifact = await getAnalyticsArtifact(req.params.id);
      if (!artifact || artifact.artifactType !== "report") return res.status(404).json({ error: "report_not_found" });
      res.json({ artifact });
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  router.get("/reports/:id/export", async (req, res) => {
    try {
      const artifact = await getAnalyticsArtifact(req.params.id);
      if (!artifact || artifact.artifactType !== "report") return res.status(404).json({ error: "report_not_found" });
      sendArtifactExport(res, artifact, String(req.query.format ?? "json"));
    } catch (error) {
      sendAnalyticsError(res, error);
    }
  });

  return router;
}

export function resolveAnalyticsArtifactFile(input: { artifactDir: string; requestedPath: string }): { allowed: boolean; path?: string } {
  const artifactRoot = path.resolve(input.artifactDir);
  const requested = path.resolve(input.requestedPath);
  const relative = path.relative(artifactRoot, requested);
  if (!input.requestedPath || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { allowed: false };
  }
  return { allowed: true, path: requested };
}

function queryDatasetRows(rows: Array<Record<string, unknown>>, input: { select?: unknown; limit?: unknown }) {
  const fields = Array.isArray(input.select)
    ? input.select.map((field) => String(field)).filter(Boolean)
    : [];
  const limit = Number.isFinite(Number(input.limit)) ? Math.max(0, Math.floor(Number(input.limit))) : 100;
  const limitedRows = rows.slice(0, limit);
  if (fields.length === 0) return limitedRows;
  return limitedRows.map((row) => {
    const projected: Record<string, unknown> = {};
    fields.forEach((field) => {
      projected[field] = row[field];
    });
    return projected;
  });
}

function sendArtifactExport(res: any, artifact: { metadata: Record<string, unknown> }, format: string) {
  const normalizedFormat = format.toLowerCase();
  const files = artifactFileMap(artifact.metadata);
  const file = files[normalizedFormat];
  if (file) {
    const resolved = resolveAnalyticsArtifactFile({
      artifactDir: analyticsArtifactDir(),
      requestedPath: file,
    });
    if (resolved.allowed && resolved.path && fs.existsSync(resolved.path)) {
      return res.download(resolved.path);
    }
  }
  if (normalizedFormat === "html") {
    res.type("html").send(`<pre>${escapeHtml(JSON.stringify(artifact, null, 2))}</pre>`);
    return;
  }
  res.json({ artifact, format: normalizedFormat });
}

function artifactFileMap(metadata: Record<string, unknown>): Record<string, string> {
  const result = isRecord(metadata.result) ? metadata.result : undefined;
  const files = result && isRecord(result.files) ? result.files : undefined;
  if (!files) return {};
  return Object.fromEntries(
    Object.entries(files)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function analyticsArtifactDir() {
  const configured = process.env.ANALYTICS_ARTIFACT_DIR || ".data/analytics-artifacts";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function analyticsImportMaxRows() {
  const configured = Number(process.env.ANALYTICS_IMPORT_MAX_ROWS ?? 50000);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 50000;
}

function sendAnalyticsError(res: any, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { statusCode?: number })?.statusCode ?? (message.includes("not_found") ? 404 : 500);
  res.status(status).json({ error: message });
}

function normalizeImportKind(value: unknown): ExtractorKind {
  const kind = String(value ?? "csv").toLowerCase();
  if (["csv", "json", "jsonl", "parquet", "excel", "geojson", "html", "table", "txt", "md", "docx", "pptx", "sdmx", "xbrl", "netcdf", "pdf"].includes(kind)) {
    return kind as ExtractorKind;
  }
  throw Object.assign(new Error("unsupported_analytics_import_kind"), { statusCode: 400 });
}

function importBuffer(body: any): Buffer {
  if (typeof body.contentBase64 === "string") {
    return Buffer.from(body.contentBase64, "base64");
  }
  if (typeof body.contentText === "string") {
    return Buffer.from(body.contentText, "utf-8");
  }
  throw Object.assign(new Error("analytics_import_content_required"), { statusCode: 400 });
}

function contentTypeForKind(kind: ExtractorKind) {
  switch (kind) {
    case "csv":
      return "text/csv";
    case "json":
    case "geojson":
      return "application/json";
    case "jsonl":
      return "application/x-ndjson";
    case "excel":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "parquet":
      return "application/octet-stream";
    case "pdf":
      return "application/pdf";
    case "html":
    case "table":
      return "text/html";
    default:
      return "text/plain";
  }
}

function rowsFromExtracted(tables: ExtractedTable[], contentText: string, maxRows = 50000): Array<Record<string, unknown>> {
  if (tables.length > 0) {
    return tables.flatMap((table, tableIndex) => {
      const headers = table.headers.length ? table.headers : table.rows[0]?.map((_, index) => `column_${index + 1}`) ?? [];
      const bodyRows = table.headers.length ? table.rows : table.rows.slice(1);
      return bodyRows.map((row, rowIndex) => {
        const record: Record<string, unknown> = {
          _table: table.caption ?? `table_${tableIndex + 1}`,
          _row: rowIndex + 1,
        };
        headers.forEach((header, index) => {
          record[String(header || `column_${index + 1}`)] = row[index] ?? "";
        });
        return record;
      });
    }).slice(0, maxRows);
  }
  return contentText
    .split(/\n+/)
    .map((line, index) => ({ lineNumber: index + 1, text: line.trim() }))
    .filter((row) => row.text)
    .slice(0, maxRows);
}
