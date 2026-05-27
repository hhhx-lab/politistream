import { evidenceFromAnalysis, analyzeResearchDocument } from "./analysis";
import { canAcceptUrlForRun, createRunBudgetState, recordAcceptedUrl } from "./budget";
import { crawlPublicPage } from "./crawler";
import { planQueries } from "./queryPlanner";
import { generateMarkdownReport } from "./reports";
import { searchConfiguredProviders, SearchProviderResult } from "./searchProviders";
import {
  addEvidenceItem,
  addResearchReport,
  getResearchJob,
  initResearchSchema,
  updateResearchJobQueryPlan,
  updateResearchJobStatus,
  upsertCrawlDocument,
  upsertSearchCandidate,
} from "./store";
import { CrawlDocument, EvidenceItem, ResearchJob, ResearchReport, SearchCandidate } from "./types";

export interface ResearchRunResult {
  success: boolean;
  job: ResearchJob;
  providerResults: SearchProviderResult[];
  candidateCount: number;
  documentCount: number;
  evidenceCount: number;
  report: ResearchReport;
  message?: string;
}

export async function runResearchJob(jobId: string): Promise<ResearchRunResult> {
  await initResearchSchema();
  const existing = await getResearchJob(jobId);
  if (!existing) {
    throw new Error("research_job_not_found");
  }

  await updateResearchJobStatus(jobId, "running");
  const queryPlan = planQueries(existing.topic, existing.seedUrls);
  let job = await updateResearchJobQueryPlan(jobId, queryPlan) ?? existing;

  const providerResults = await runProviderSearches(job.id, queryPlan);
  const enabledProviders = providerResults.filter((result) => result.enabled);
  const candidates = providerResults.flatMap((result) => result.candidates);

  if (enabledProviders.length === 0) {
    const report = await persistRunReport(job, "failed", [
      `# ${job.topic}`,
      "",
      "Research could not run because no search provider API keys are configured.",
      "",
      "Configure BRAVE_API_KEY, SERPAPI_API_KEY, or TAVILY_API_KEY and retry this job.",
    ].join("\n"));
    job = await updateResearchJobStatus(job.id, "failed") ?? job;
    return {
      success: false,
      job,
      providerResults,
      candidateCount: 0,
      documentCount: 0,
      evidenceCount: 0,
      report,
      message: "provider_api_key_missing",
    };
  }

  const storedCandidates = await storeCandidates(candidates);
  const { documents, evidence } = await crawlAndExtractEvidence(job, storedCandidates);

  if (evidence.length === 0) {
    const report = await persistRunReport(job, "not_ready", [
      `# ${job.topic}`,
      "",
      "Research ran but did not produce usable evidence yet.",
      "",
      `- Provider result groups: ${providerResults.length}`,
      `- Candidates stored: ${storedCandidates.length}`,
      `- Documents fetched or attempted: ${documents.length}`,
    ].join("\n"));
    job = await updateResearchJobStatus(job.id, "failed") ?? job;
    return {
      success: false,
      job,
      providerResults,
      candidateCount: storedCandidates.length,
      documentCount: documents.length,
      evidenceCount: 0,
      report,
      message: "no_usable_evidence",
    };
  }

  const generated = generateMarkdownReport(job, evidence);
  const report = await addResearchReport(generated);
  job = await updateResearchJobStatus(job.id, "completed") ?? job;

  return {
    success: true,
    job,
    providerResults,
    candidateCount: storedCandidates.length,
    documentCount: documents.length,
    evidenceCount: evidence.length,
    report,
  };
}

async function runProviderSearches(jobId: string, queryPlan: string[]) {
  const results: SearchProviderResult[] = [];
  for (const query of queryPlan) {
    results.push(...await searchConfiguredProviders({ jobId, query }));
  }
  return results;
}

async function storeCandidates(candidates: SearchCandidate[]) {
  const stored: SearchCandidate[] = [];
  for (const candidate of candidates) {
    stored.push(await upsertSearchCandidate(candidate));
  }
  return stored;
}

async function crawlAndExtractEvidence(job: ResearchJob, candidates: SearchCandidate[]) {
  const budgetState = createRunBudgetState(job.budget);
  const documents: CrawlDocument[] = [];
  const evidence: EvidenceItem[] = [];

  for (const candidate of candidates) {
    if (!canAcceptUrlForRun(budgetState, candidate.canonicalUrl, candidate.depth)) continue;
    recordAcceptedUrl(budgetState, candidate.canonicalUrl);

    const result = await crawlPublicPage(candidate);
    const storedDocument = await upsertCrawlDocument(result.document);
    documents.push(storedDocument);

    if (storedDocument.status !== "fetched" || !storedDocument.contentText) continue;

    const analysis = await analyzeResearchDocument(job.topic, storedDocument);
    const analyzedEvidence = evidenceFromAnalysis(job.id, storedDocument, analysis);
    const evidenceItems = analyzedEvidence.length > 0
      ? analyzedEvidence
      : fallbackEvidenceFromDocument(job, storedDocument);

    for (const item of evidenceItems) {
      evidence.push(await addEvidenceItem(item));
    }
  }

  return { documents, evidence };
}

function fallbackEvidenceFromDocument(job: ResearchJob, document: CrawlDocument): EvidenceItem[] {
  if (!document.id || !document.contentText) return [];
  const snippet = document.contentText.slice(0, 600).trim();
  if (!snippet) return [];
  return [{
    jobId: job.id,
    documentId: document.id,
    sourceUrl: document.finalUrl || document.url,
    snippet,
    explanation: `Fetched source content related to ${job.topic}`,
    relevanceScore: 0.3,
    entities: [],
  }];
}

async function persistRunReport(
  job: ResearchJob,
  status: ResearchReport["status"],
  markdown: string,
) {
  return addResearchReport({
    jobId: job.id,
    status,
    markdown,
    generatedAt: new Date().toISOString(),
  });
}
