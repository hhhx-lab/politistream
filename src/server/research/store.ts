import { Pool } from "pg";
import { randomUUID } from "crypto";
import { getResearchConfig, requireResearchDatabase } from "./config";
import { normalizeResearchBudget } from "./budget";
import {
  CrawlDocument,
  EvidenceItem,
  ResearchBudget,
  ResearchJob,
  ResearchReport,
  SearchCandidate,
} from "./types";

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireResearchDatabase(getResearchConfig()),
    });
  }

  return pool;
}

export async function closeResearchStore() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function initResearchSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      seed_urls JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      budget JSONB NOT NULL,
      query_plan JSONB NOT NULL DEFAULT '[]',
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS search_candidates (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      query TEXT NOT NULL,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      published_at TIMESTAMPTZ,
      depth INTEGER NOT NULL DEFAULT 0,
      discovered_from_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(job_id, canonical_url)
    );

    CREATE TABLE IF NOT EXISTS crawl_documents (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      final_url TEXT,
      title TEXT,
      domain TEXT NOT NULL,
      content_text TEXT,
      content_hash TEXT,
      depth INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT,
      fetched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(job_id, canonical_url)
    );

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES crawl_documents(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      snippet TEXT NOT NULL,
      explanation TEXT NOT NULL,
      relevance_score REAL NOT NULL,
      entities JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS research_reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      markdown TEXT NOT NULL,
      generated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_search_candidates_job ON search_candidates(job_id);
    CREATE INDEX IF NOT EXISTS idx_crawl_documents_job ON crawl_documents(job_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_items_job ON evidence_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_research_reports_job ON research_reports(job_id, created_at DESC);
  `);
}

export async function createResearchJob(input: {
  topic: string;
  seedUrls?: string[];
  budget?: Partial<ResearchBudget>;
  queryPlan?: string[];
  nextRunAt?: string;
}): Promise<ResearchJob> {
  const job: ResearchJob = {
    id: randomUUID(),
    topic: input.topic,
    seedUrls: input.seedUrls ?? [],
    status: "active",
    budget: normalizeResearchBudget(input.budget),
    queryPlan: input.queryPlan ?? [],
    nextRunAt: input.nextRunAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const row = await getPool().query(
    `
      INSERT INTO research_jobs (id, topic, seed_urls, status, budget, query_plan, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      job.id,
      job.topic,
      JSON.stringify(job.seedUrls),
      job.status,
      JSON.stringify(job.budget),
      JSON.stringify(job.queryPlan),
      job.nextRunAt ?? null,
    ],
  );

  return mapResearchJob(row.rows[0]);
}

export async function listResearchJobs(): Promise<ResearchJob[]> {
  const result = await getPool().query("SELECT * FROM research_jobs ORDER BY created_at DESC");
  return result.rows.map(mapResearchJob);
}

export async function getResearchJob(id: string): Promise<ResearchJob | null> {
  const result = await getPool().query("SELECT * FROM research_jobs WHERE id = $1", [id]);
  return result.rows[0] ? mapResearchJob(result.rows[0]) : null;
}

export async function updateResearchJobStatus(id: string, status: ResearchJob["status"]): Promise<ResearchJob | null> {
  const result = await getPool().query(
    "UPDATE research_jobs SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, status],
  );
  return result.rows[0] ? mapResearchJob(result.rows[0]) : null;
}

export async function upsertSearchCandidate(candidate: SearchCandidate): Promise<SearchCandidate> {
  const id = candidate.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO search_candidates (
        id, job_id, provider, query, url, canonical_url, title, snippet, published_at, depth, discovered_from_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (job_id, canonical_url) DO UPDATE SET
        title = EXCLUDED.title,
        snippet = EXCLUDED.snippet
      RETURNING *
    `,
    [
      id,
      candidate.jobId,
      candidate.provider,
      candidate.query,
      candidate.url,
      candidate.canonicalUrl,
      candidate.title,
      candidate.snippet,
      candidate.publishedAt ?? null,
      candidate.depth,
      candidate.discoveredFromUrl ?? null,
    ],
  );

  return mapSearchCandidate(result.rows[0]);
}

export async function upsertCrawlDocument(document: CrawlDocument): Promise<CrawlDocument> {
  const id = document.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO crawl_documents (
        id, job_id, url, canonical_url, final_url, title, domain, content_text, content_hash, depth, status, error, fetched_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (job_id, canonical_url) DO UPDATE SET
        final_url = EXCLUDED.final_url,
        title = EXCLUDED.title,
        content_text = EXCLUDED.content_text,
        content_hash = EXCLUDED.content_hash,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = NOW()
      RETURNING *
    `,
    [
      id,
      document.jobId,
      document.url,
      document.canonicalUrl,
      document.finalUrl ?? null,
      document.title ?? null,
      document.domain,
      document.contentText ?? null,
      document.contentHash ?? null,
      document.depth,
      document.status,
      document.error ?? null,
      document.fetchedAt ?? null,
    ],
  );

  return mapCrawlDocument(result.rows[0]);
}

export async function addEvidenceItem(item: EvidenceItem): Promise<EvidenceItem> {
  const id = item.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO evidence_items (
        id, job_id, document_id, source_url, snippet, explanation, relevance_score, entities
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `,
    [id, item.jobId, item.documentId, item.sourceUrl, item.snippet, item.explanation, item.relevanceScore, JSON.stringify(item.entities)],
  );

  return mapEvidenceItem(result.rows[0]);
}

export async function addResearchReport(report: ResearchReport): Promise<ResearchReport> {
  const id = report.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO research_reports (id, job_id, status, markdown, generated_at)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `,
    [id, report.jobId, report.status, report.markdown, report.generatedAt ?? null],
  );

  return mapResearchReport(result.rows[0]);
}

export async function getLatestResearchReport(jobId: string): Promise<ResearchReport | null> {
  const result = await getPool().query(
    "SELECT * FROM research_reports WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
    [jobId],
  );
  return result.rows[0] ? mapResearchReport(result.rows[0]) : null;
}

function mapResearchJob(row: any): ResearchJob {
  return {
    id: row.id,
    topic: row.topic,
    seedUrls: row.seed_urls ?? [],
    status: row.status,
    budget: normalizeResearchBudget(row.budget ?? {}),
    queryPlan: row.query_plan ?? [],
    nextRunAt: row.next_run_at?.toISOString?.() ?? row.next_run_at ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function mapSearchCandidate(row: any): SearchCandidate {
  return {
    id: row.id,
    jobId: row.job_id,
    provider: row.provider,
    query: row.query,
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title,
    snippet: row.snippet,
    publishedAt: row.published_at?.toISOString?.() ?? row.published_at ?? undefined,
    depth: row.depth,
    discoveredFromUrl: row.discovered_from_url ?? undefined,
  };
}

function mapCrawlDocument(row: any): CrawlDocument {
  return {
    id: row.id,
    jobId: row.job_id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    finalUrl: row.final_url ?? undefined,
    title: row.title ?? undefined,
    domain: row.domain,
    contentText: row.content_text ?? undefined,
    contentHash: row.content_hash ?? undefined,
    depth: row.depth,
    status: row.status,
    error: row.error ?? undefined,
    fetchedAt: row.fetched_at?.toISOString?.() ?? row.fetched_at ?? undefined,
  };
}

function mapEvidenceItem(row: any): EvidenceItem {
  return {
    id: row.id,
    jobId: row.job_id,
    documentId: row.document_id,
    sourceUrl: row.source_url,
    snippet: row.snippet,
    explanation: row.explanation,
    relevanceScore: row.relevance_score,
    entities: row.entities ?? [],
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapResearchReport(row: any): ResearchReport {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    markdown: row.markdown,
    generatedAt: row.generated_at?.toISOString?.() ?? row.generated_at ?? undefined,
  };
}
