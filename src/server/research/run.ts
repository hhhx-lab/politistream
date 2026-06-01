import { evidenceFromAnalysis, analyzeResearchDocument } from "./analysis";
import { writeRawAsset, RawAssetExtension } from "./assets/rawAssetStore";
import { canAcceptUrlForRun, createRunBudgetState, recordAcceptedUrl } from "./budget";
import { requireResearchQueue, getResearchAssetConfig, getResearchConfig, getResearchMemoryConfig } from "./config";
import { crawlPublicPage, CrawlResult } from "./crawler";
import {
  createDefaultDiscoveryProviders,
  inferSourceType,
  normalizeDiscoveredCandidate,
  runDiscoveryProviders,
} from "./discovery/registry";
import { buildEvidenceClaim, buildEvidenceRelation, createSourceProfile, credibilityScoreFor, summarizeEvidenceGraph } from "./evidence/graph";
import { candidateToFrontierItem, sortFrontier } from "./frontier/queue";
import { shouldReuseDocument } from "./memory/researchMemory";
import { planResearch } from "./queryPlanner";
import { generateMarkdownReport } from "./reports";
import {
  addDiscoveryResult,
  addEvidenceClaim,
  addEvidenceItem,
  addEvidenceRelation,
  addResearchReport,
  addRunEvent,
  createResearchRun,
  findLatestFetchedDocumentByCanonicalUrl,
  getResearchJob,
  getResearchRun,
  initResearchSchema,
  listCrawlDocumentsForRun,
  listEvidenceClaimsForRun,
  listEvidenceItemsForRun,
  listEvidenceRelationsForRun,
  listFrontierItemsForRun,
  listSearchCandidatesForRun,
  recordSourceMemory,
  updateFrontierItemStatus,
  updateResearchJobQueryPlan,
  updateResearchJobStatus,
  updateResearchRunStatus,
  upsertCrawlDocument,
  upsertDocumentAsset,
  upsertFrontierItem,
  upsertSearchCandidate,
  upsertSourceProfile,
} from "./store";
import { enqueueResearchRun } from "./workers/queues";
import {
  CrawlDocument,
  DiscoveredCandidate,
  EvidenceItem,
  FrontierItem,
  ProviderName,
  ResearchJob,
  ResearchReport,
  ResearchRun,
  SearchCandidate,
} from "./types";

export interface QueuedResearchRunResult {
  queued: true;
  job: ResearchJob;
  run: ResearchRun;
  message: string;
}

export interface ResearchRunResult {
  success: boolean;
  job: ResearchJob;
  run: ResearchRun;
  candidateCount: number;
  documentCount: number;
  evidenceCount: number;
  report: ResearchReport;
  message?: string;
}

export async function createQueuedResearchRun(jobId: string): Promise<QueuedResearchRunResult> {
  requireResearchQueue(getResearchConfig());
  await initResearchSchema();

  const job = await getResearchJob(jobId);
  if (!job) throw new Error("research_job_not_found");

  const run = await createResearchRun(job);
  await addRunEvent({
    jobId: job.id,
    runId: run.id,
    stage: "queued",
    level: "info",
    message: "研究 run 已创建并等待 worker 执行。",
    data: { budget: run.budget },
  });
  await enqueueResearchRun(run.id, job.id);
  await updateResearchJobStatus(job.id, "running");

  return {
    queued: true,
    job: await getResearchJob(job.id) ?? job,
    run,
    message: "research_run_queued",
  };
}

export async function runResearchJob(jobId: string): Promise<ResearchRunResult> {
  await initResearchSchema();
  const job = await getResearchJob(jobId);
  if (!job) throw new Error("research_job_not_found");

  const run = await createResearchRun(job);
  return executeResearchRun(run.id);
}

export async function executeResearchRun(runId: string): Promise<ResearchRunResult> {
  const discovery = await runDiscoveryForRun(runId);
  await buildFrontierForRun(runId);
  const documents = await fetchFrontierForRun(runId);
  await extractDocumentsForRun(runId);
  const evidence = await analyzeDocumentsForRun(runId);
  return generateReportForRun(runId, {
    candidateCount: discovery.candidateCount,
    documentCount: documents.length,
    evidenceCount: evidence.length,
  });
}

export async function runDiscoveryForRun(runId: string) {
  await initResearchSchema();
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");

  const existing = await getResearchJob(run.jobId);
  if (!existing) throw new Error("research_job_not_found");

  const job = await updateResearchJobStatus(existing.id, "running") ?? existing;
  await moveRun(run, "planning", "开始规划研究查询。");

  const plan = planResearch(job.topic, job.seedUrls);
  await updateResearchJobQueryPlan(job.id, plan.queries.map((query) => query.text));
  await addRunEvent({
    jobId: job.id,
    runId,
    stage: "planning",
    level: "info",
    message: "查询计划已生成。",
    data: {
      taskType: plan.taskType,
      queryCount: plan.queries.length,
      requiredSourceTypes: plan.requiredSourceTypes,
    },
  });

  await moveRun(run, "discovery", "开始调用 discovery providers。");
  const discoveryProviders = createDefaultDiscoveryProviders(getResearchConfig());
  const discovered: DiscoveredCandidate[] = [];

  for (const query of plan.queries) {
    if (await shouldStop(runId)) return { candidateCount: 0 };
    const discovery = await runDiscoveryProviders(discoveryProviders, {
      jobId: job.id,
      runId,
      topic: job.topic,
      query,
      seedUrls: job.seedUrls,
    });

    for (const result of discovery.results) {
      await addDiscoveryResult({
        jobId: job.id,
        runId,
        provider: result.provider,
        providerType: result.providerType,
        queryId: query.id,
        candidateCount: result.candidates.length,
        error: result.error,
        durationMs: result.durationMs,
        costUnits: result.enabled ? 1 : 0,
      });
    }

    discovered.push(...discovery.candidates);
  }

  const storedCandidates: SearchCandidate[] = [];
  for (const candidate of dedupeDiscovered(discovered)) {
    storedCandidates.push(await upsertSearchCandidate(discoveredToSearchCandidate(candidate)));
  }

  return { candidateCount: storedCandidates.length };
}

export async function buildFrontierForRun(runId: string) {
  await initResearchSchema();
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");

  const job = await getResearchJob(run.jobId);
  if (!job) throw new Error("research_job_not_found");
  const storedCandidates = await listSearchCandidatesForRun(runId);

  await moveRun(run, "frontier", "开始构建优先级 frontier。");
  const domainCount = new Set(storedCandidates.map((candidate) => new URL(candidate.canonicalUrl).hostname)).size || 1;
  for (const candidate of storedCandidates) {
    await upsertFrontierItem(candidateToFrontierItem(searchCandidateToDiscovered(candidate, runId), job.topic, domainCount));
  }

  await addRunEvent({
    jobId: job.id,
    runId,
    stage: "frontier",
    level: "info",
    message: "Frontier 已按优先级生成。",
    data: { candidateCount: storedCandidates.length },
  });
}

export async function fetchFrontierForRun(runId: string) {
  await initResearchSchema();
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");

  const job = await getResearchJob(run.jobId);
  if (!job) throw new Error("research_job_not_found");

  return crawlFrontier(job, runId);
}

export async function extractDocumentsForRun(runId: string) {
  await initResearchSchema();
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");
  const documents = await listCrawlDocumentsForRun(runId);
  await moveRun(run, "extracting", "正文、链接、表格和元数据已由 extractor router 完成抽取。");
  await addRunEvent({
    jobId: run.jobId,
    runId,
    stage: "extracting",
    level: "info",
    message: "Extractor stage completed.",
    data: { documentCount: documents.length },
  });
  return documents;
}

export async function analyzeDocumentsForRun(runId: string) {
  await initResearchSchema();
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");
  const job = await getResearchJob(run.jobId);
  if (!job) throw new Error("research_job_not_found");

  const documents = await listCrawlDocumentsForRun(runId);
  const evidence: EvidenceItem[] = [];
  for (const document of documents) {
    if (document.status !== "fetched" || !document.contentText) continue;
    const sourceType = inferSourceType(document.finalUrl || document.url);
    const frontier: FrontierItem = {
      jobId: job.id,
      runId,
      url: document.url,
      canonicalUrl: document.canonicalUrl,
      depth: document.depth,
      sourceType,
      priorityScore: 0,
      status: "fetched",
      attempts: 1,
      reason: "document-analysis",
    };
    evidence.push(...await analyzeDocument(job, runId, document, frontier));
  }
  return evidence;
}

export async function generateReportForRun(
  runId: string,
  counts?: { candidateCount?: number; documentCount?: number; evidenceCount?: number },
): Promise<ResearchRunResult> {
  await initResearchSchema();
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");
  const job = await getResearchJob(run.jobId);
  if (!job) throw new Error("research_job_not_found");

  const candidates = await listSearchCandidatesForRun(runId);
  const documents = await listCrawlDocumentsForRun(runId);
  const evidence = await listEvidenceItemsForRun(runId);
  const claims = await listEvidenceClaimsForRun(runId);
  const relations = await listEvidenceRelationsForRun(runId);

  if (evidence.length === 0) {
    const report = await persistRunReport(job, runId, "failed", [
      `# ${job.topic}`,
      "",
      "## 研究摘要",
      "",
      "本次研究已完成 discovery 和抓取流程，但尚未得到可用证据。",
      "",
      `- 候选来源: ${candidates.length}`,
      `- 已抓取文档: ${documents.length}`,
      "",
      "## 尚不确定的问题",
      "",
      "- 需要补充搜索 provider key、种子 URL 或提高抓取预算后重试。",
    ].join("\n"));
    const failedRun = await updateResearchRunStatus(runId, "failed", "reporting") ?? run;
    const failedJob = await updateResearchJobStatus(job.id, "failed") ?? job;
    return {
      success: false,
      job: failedJob,
      run: failedRun,
      candidateCount: counts?.candidateCount ?? candidates.length,
      documentCount: counts?.documentCount ?? documents.length,
      evidenceCount: 0,
      report,
      message: "no_usable_evidence",
    };
  }

  await moveRun(run, "reporting", "开始生成中文研究报告。");
  const generated = generateMarkdownReport(job, evidence, summarizeEvidenceGraph({ claims, relations }));
  const report = await addResearchReport({ ...generated, runId });
  const completedRun = await updateResearchRunStatus(runId, "completed", "completed") ?? run;
  const completedJob = await updateResearchJobStatus(job.id, "completed") ?? job;
  await addRunEvent({
    jobId: completedJob.id,
    runId,
    stage: "completed",
    level: "info",
    message: "研究 run 已完成。",
    data: {
      documentCount: documents.length,
      evidenceCount: evidence.length,
    },
  });

  return {
    success: true,
    job: completedJob,
    run: completedRun,
    candidateCount: counts?.candidateCount ?? candidates.length,
    documentCount: counts?.documentCount ?? documents.length,
    evidenceCount: counts?.evidenceCount ?? evidence.length,
    report,
  };
}

async function crawlFrontier(job: ResearchJob, runId: string) {
  await moveRun({ id: runId, jobId: job.id } as ResearchRun, "fetching", "开始抓取 frontier URL。");
  const budgetState = createRunBudgetState(job.budget);
  const documents: CrawlDocument[] = [];
  const processed = new Set<string>();

  while (budgetState.acceptedUrls < job.budget.maxUrlsPerRun) {
    if (await shouldStop(runId)) break;

    const next = sortFrontier(await listFrontierItemsForRun(runId))
      .find((item) => item.status === "queued" && !processed.has(item.canonicalUrl));
    if (!next) break;
    processed.add(next.canonicalUrl);

    if (!canAcceptUrlForRun(budgetState, next.canonicalUrl, next.depth)) {
      await updateFrontierItemStatus(next.id!, "skipped", { reason: "budget_limit" });
      continue;
    }

    recordAcceptedUrl(budgetState, next.canonicalUrl);
    await updateFrontierItemStatus(next.id!, "fetching", { attempts: next.attempts + 1 });

    const reusedDocument = await maybeReuseDocument(job, runId, next);
    if (reusedDocument) {
      documents.push(reusedDocument);
      await updateFrontierItemStatus(next.id!, "fetched", {
        attempts: next.attempts + 1,
        reason: "memory_reuse",
      });
      continue;
    }

    const result = await crawlPublicPage(frontierToSearchCandidate(next));
    const storedDocument = await upsertCrawlDocument(result.document);
    await recordSourceMemory(storedDocument);
    await saveCrawlAssets(storedDocument, result);
    documents.push(storedDocument);

    if (storedDocument.status !== "fetched") {
      await updateFrontierItemStatus(next.id!, storedDocument.status === "skipped" ? "skipped" : "failed", {
        attempts: next.attempts + 1,
        lastError: storedDocument.error,
      });
      continue;
    }

    await updateFrontierItemStatus(next.id!, "fetched", { attempts: next.attempts + 1 });
    await upsertSourceProfile(createSourceProfile(storedDocument.finalUrl || storedDocument.url, next.sourceType));
    await enqueueDiscoveredLinks(job, runId, storedDocument, result.discoveredLinks, next.depth + 1);

  }

  return documents;
}

async function maybeReuseDocument(job: ResearchJob, runId: string, frontier: FrontierItem) {
  const memoryConfig = getResearchMemoryConfig();
  if (!memoryConfig.enabled) return null;

  const reusable = await findLatestFetchedDocumentByCanonicalUrl(frontier.canonicalUrl);
  if (!reusable || reusable.runId === runId || !reusable.fetchedAt || !reusable.contentHash) {
    return null;
  }

  if (!shouldReuseDocument({
    fetchedAt: reusable.fetchedAt,
    now: new Date().toISOString(),
    maxAgeHours: memoryConfig.maxAgeHours,
    contentHashMatches: Boolean(reusable.contentHash),
  })) {
    return null;
  }

  const reused = await upsertCrawlDocument({
    ...reusable,
    id: undefined,
    jobId: job.id,
    runId,
    depth: frontier.depth,
    memoryStatus: "reused",
  });
  await recordSourceMemory(reused);
  await addRunEvent({
    jobId: job.id,
    runId,
    stage: "fetching",
    level: "info",
    message: "document_reused",
    data: {
      canonicalUrl: frontier.canonicalUrl,
      previousRunId: reusable.runId,
      fetchedAt: reusable.fetchedAt,
    },
  });
  return reused;
}

async function saveCrawlAssets(document: CrawlDocument, result: CrawlResult) {
  if (!document.id || !document.runId) return;

  const config = getResearchAssetConfig();
  const rawAsset = result.rawContent ? rawAssetDescriptor(result.rawContent.contentType, result.rawContent.url) : null;
  if (rawAsset && shouldStoreRawAsset(rawAsset.assetType, config)) {
    const written = await writeRawAsset({
      rootDir: config.assetDir,
      runId: document.runId,
      documentId: `${document.id}.raw`,
      extension: rawAsset.extension,
      content: result.rawContent!.data,
    });
    await upsertDocumentAsset({
      jobId: document.jobId,
      runId: document.runId,
      documentId: document.id,
      url: result.rawContent!.url,
      assetType: rawAsset.assetType,
      metadata: {
        path: written.path,
        contentType: result.rawContent!.contentType,
        sizeBytes: written.sizeBytes,
        sha256: written.sha256,
        fetchedAt: result.rawContent!.fetchedAt,
      },
    });
  }

  if (config.storeRawText && document.contentText) {
    const written = await writeRawAsset({
      rootDir: config.assetDir,
      runId: document.runId,
      documentId: `${document.id}.text`,
      extension: "txt",
      content: document.contentText,
    });
    await upsertDocumentAsset({
      jobId: document.jobId,
      runId: document.runId,
      documentId: document.id,
      url: document.finalUrl || document.url,
      assetType: "text",
      metadata: {
        path: written.path,
        contentType: "text/plain; charset=utf-8",
        sizeBytes: written.sizeBytes,
        sha256: written.sha256,
      },
    });
  }
}

function rawAssetDescriptor(contentType: string, url: string): { assetType: "html" | "pdf" | "json"; extension: RawAssetExtension } | null {
  const normalizedContentType = contentType.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  if (normalizedContentType.includes("pdf") || normalizedUrl.endsWith(".pdf")) {
    return { assetType: "pdf", extension: "pdf" };
  }
  if (normalizedContentType.includes("json")) {
    return { assetType: "json", extension: "json" };
  }
  if (
    normalizedContentType.includes("html")
    || normalizedContentType.includes("xml")
    || normalizedContentType.includes("text/")
    || !normalizedContentType
  ) {
    return { assetType: "html", extension: "html" };
  }
  return null;
}

function shouldStoreRawAsset(
  assetType: "html" | "pdf" | "json",
  config: ReturnType<typeof getResearchAssetConfig>,
) {
  if (assetType === "pdf") return config.storeRawPdf;
  if (assetType === "html") return config.storeRawHtml;
  return true;
}

async function analyzeDocument(
  job: ResearchJob,
  runId: string,
  document: CrawlDocument,
  frontier: FrontierItem,
) {
  await moveRun({ id: runId, jobId: job.id } as ResearchRun, "analyzing", "正在抽取证据。");
  const analysis = await analyzeResearchDocument(job.topic, document);
  const profile = createSourceProfile(document.finalUrl || document.url, frontier.sourceType);
  const credibilityScore = credibilityScoreFor(profile);
  const analyzedEvidence = evidenceFromAnalysis(job.id, document, analysis);
  const evidenceItems = analyzedEvidence.length > 0
    ? analyzedEvidence
    : fallbackEvidenceFromDocument(job, runId, document, credibilityScore);
  const storedEvidence: EvidenceItem[] = [];

  for (const item of evidenceItems) {
    const saved = await addEvidenceItem({
      ...item,
      runId,
      credibilityScore,
      supportsClaim: true,
      contradictsClaim: false,
      quote: item.quote ?? item.snippet,
      paraphrase: item.paraphrase ?? item.explanation,
    });
    const claim = await addEvidenceClaim(buildEvidenceClaim({
      jobId: job.id,
      runId,
      claim: saved.explanation,
      supportingEvidenceIds: saved.id ? [saved.id] : [],
      conflictingEvidenceIds: [],
      primarySourceUrl: saved.sourceUrl,
    }));
    if (saved.id && claim.id) {
      saved.claimId = claim.id;
      await addEvidenceRelation(buildEvidenceRelation({
        claimId: claim.id,
        evidenceId: saved.id,
        relation: saved.contradictsClaim ? "contradicts" : "supports",
        confidence: saved.credibilityScore ?? credibilityScore,
      }));
    }
    storedEvidence.push(saved);
  }

  return storedEvidence;
}

async function enqueueDiscoveredLinks(
  job: ResearchJob,
  runId: string,
  document: CrawlDocument,
  links: string[],
  depth: number,
) {
  if (depth > job.budget.maxDepth) return;

  for (const link of links.slice(0, 30)) {
    const candidate = normalizeDiscoveredCandidate({
      jobId: job.id,
      runId,
      provider: "frontier-link",
      providerType: "web-search",
      queryId: "link-expansion",
      query: job.topic,
      url: link,
      title: link,
      snippet: `由 ${document.finalUrl || document.url} 链接发现。`,
      depth,
      sourceType: inferSourceType(link),
    });
    const item = candidateToFrontierItem(candidate, job.topic);
    item.discoveredFromDocumentId = document.id;
    item.discoveredFromUrl = document.finalUrl || document.url;
    await upsertFrontierItem(item);
  }
}

function discoveredToSearchCandidate(candidate: DiscoveredCandidate): SearchCandidate {
  return {
    jobId: candidate.jobId,
    runId: candidate.runId,
    provider: candidate.provider as ProviderName,
    query: candidate.query,
    url: candidate.url,
    canonicalUrl: candidate.canonicalUrl,
    title: candidate.title,
    snippet: candidate.snippet,
    publishedAt: candidate.publishedAt,
    depth: candidate.depth,
  };
}

function searchCandidateToDiscovered(candidate: SearchCandidate, runId: string): DiscoveredCandidate {
  return normalizeDiscoveredCandidate({
    jobId: candidate.jobId,
    runId,
    provider: candidate.provider,
    providerType: "web-search",
    queryId: candidate.query,
    query: candidate.query,
    url: candidate.url,
    title: candidate.title,
    snippet: candidate.snippet,
    publishedAt: candidate.publishedAt,
    depth: candidate.depth,
    sourceType: inferSourceType(candidate.url),
  });
}

function frontierToSearchCandidate(item: FrontierItem): SearchCandidate {
  return {
    jobId: item.jobId,
    runId: item.runId,
    provider: "official",
    query: item.reason,
    url: item.url,
    canonicalUrl: item.canonicalUrl,
    title: item.url,
    snippet: item.reason,
    depth: item.depth,
    discoveredFromUrl: item.discoveredFromUrl,
  };
}

function fallbackEvidenceFromDocument(
  job: ResearchJob,
  runId: string,
  document: CrawlDocument,
  credibilityScore: number,
): EvidenceItem[] {
  if (!document.id || !document.contentText) return [];
  const snippet = document.contentText.slice(0, 600).trim();
  if (!snippet) return [];
  return [{
    jobId: job.id,
    runId,
    documentId: document.id,
    sourceUrl: document.finalUrl || document.url,
    snippet,
    quote: snippet,
    explanation: `已抓取与 ${job.topic} 相关的来源内容`,
    relevanceScore: 0.3,
    credibilityScore,
    supportsClaim: true,
    contradictsClaim: false,
    entities: [],
  }];
}

async function persistRunReport(
  job: ResearchJob,
  runId: string,
  status: ResearchReport["status"],
  markdown: string,
) {
  return addResearchReport({
    jobId: job.id,
    runId,
    status,
    markdown,
    generatedAt: new Date().toISOString(),
  });
}

async function moveRun(run: ResearchRun, stage: ResearchRun["stage"], message: string) {
  await updateResearchRunStatus(run.id, stage, stage);
  await addRunEvent({
    jobId: run.jobId,
    runId: run.id,
    stage,
    level: "info",
    message,
  });
}

async function shouldStop(runId: string) {
  const latest = await getResearchRun(runId);
  return latest?.status === "paused" || latest?.status === "cancelled";
}

async function stoppedResult(job: ResearchJob, runId: string, message: string): Promise<ResearchRunResult> {
  const run = await getResearchRun(runId);
  if (!run) throw new Error("research_run_not_found");
  const report = await persistRunReport(job, runId, "not_ready", "");
  return {
    success: false,
    job,
    run,
    candidateCount: 0,
    documentCount: 0,
    evidenceCount: 0,
    report,
    message,
  };
}

function dedupeDiscovered(candidates: DiscoveredCandidate[]) {
  const seen = new Set<string>();
  const deduped: DiscoveredCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.canonicalUrl)) continue;
    seen.add(candidate.canonicalUrl);
    deduped.push(candidate);
  }
  return deduped;
}
