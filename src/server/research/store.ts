import { Pool } from "pg";
import { randomUUID } from "crypto";
import { getResearchConfig, requireResearchDatabase } from "./config";
import { normalizeResearchBudget } from "./budget";
import { normalizeResearchConstraints } from "./queryPlanner";
import { topicFingerprint } from "./memory/researchMemory";
import { normalizeDocumentSearchQuery } from "./search/documentIndex";
import {
  CrawlDocument,
  DocumentAsset,
  DocumentLinkRecord,
  DocumentSearchResult,
  DiscoveryResult,
  EvidenceClaim,
  EvidenceItem,
  EvidenceRelation,
  ExtractedTableRecord,
  FrontierItem,
  PlannedQuery,
  ResearchBudget,
  ResearchJob,
  ResearchPlan,
  ResearchReport,
  ResearchRun,
  ResearchRunStatus,
  RunEvent,
  SearchCandidate,
  SourceProfile,
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
      constraints JSONB NOT NULL DEFAULT '{}',
      query_plan JSONB NOT NULL DEFAULT '[]',
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      budget JSONB NOT NULL,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS search_candidates (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS research_plans (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
      plan JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS planned_queries (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      purpose TEXT NOT NULL,
      source_types JSONB NOT NULL DEFAULT '[]',
      language TEXT NOT NULL,
      priority REAL NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS discovery_results (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      query_id TEXT,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      cost_units REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS frontier_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      depth INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      priority_score REAL NOT NULL,
      score_breakdown JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      discovered_from_url TEXT,
      discovered_from_document_id TEXT,
      query_id TEXT,
      reason TEXT NOT NULL DEFAULT '',
      next_attempt_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(run_id, canonical_url)
    );

    CREATE TABLE IF NOT EXISTS crawl_documents (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
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
      memory_status TEXT NOT NULL DEFAULT 'fresh',
      metadata JSONB NOT NULL DEFAULT '{}',
      search_vector TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(job_id, canonical_url)
    );

    CREATE TABLE IF NOT EXISTS document_links (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES crawl_documents(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      context TEXT,
      enqueued INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(document_id, url)
    );

    CREATE TABLE IF NOT EXISTS document_assets (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES crawl_documents(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

	    CREATE TABLE IF NOT EXISTS extracted_tables (
	      id TEXT PRIMARY KEY,
	      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
	      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
	      document_id TEXT REFERENCES crawl_documents(id) ON DELETE CASCADE,
	      table_index INTEGER NOT NULL DEFAULT 0,
	      caption TEXT,
	      headers JSONB NOT NULL DEFAULT '[]',
	      rows JSONB NOT NULL DEFAULT '[]',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      UNIQUE(document_id, table_index)
	    );

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES crawl_documents(id) ON DELETE CASCADE,
      claim_id TEXT,
      source_url TEXT NOT NULL,
      quote TEXT,
      paraphrase TEXT,
      snippet TEXT NOT NULL,
      explanation TEXT NOT NULL,
      relevance_score REAL NOT NULL,
      credibility_score REAL,
      supports_claim BOOLEAN,
      contradicts_claim BOOLEAN,
      entities JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS evidence_claims (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      claim TEXT NOT NULL,
      normalized_claim TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence REAL NOT NULL,
      supporting_evidence_ids JSONB NOT NULL DEFAULT '[]',
      conflicting_evidence_ids JSONB NOT NULL DEFAULT '[]',
      first_seen_at TIMESTAMPTZ,
      primary_source_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS source_profiles (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      authority_tier TEXT NOT NULL,
      official_likelihood REAL NOT NULL,
      mainstream_likelihood REAL NOT NULL,
      notes JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS research_topic_memory (
      id TEXT PRIMARY KEY,
      topic_fingerprint TEXT NOT NULL UNIQUE,
      latest_job_id TEXT,
      latest_run_id TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS source_memory (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      source_profile_id TEXT,
      successful_fetches INTEGER NOT NULL DEFAULT 0,
      failed_fetches INTEGER NOT NULL DEFAULT 0,
      last_success_at TIMESTAMPTZ,
      last_failure_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS evidence_relations (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES evidence_claims(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(claim_id, evidence_id, relation)
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS research_reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES research_runs(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      markdown TEXT NOT NULL,
      generated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE crawl_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
    ALTER TABLE frontier_items ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}';

    CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_search_candidates_job ON search_candidates(job_id);
    CREATE INDEX IF NOT EXISTS idx_crawl_documents_job ON crawl_documents(job_id);
    CREATE INDEX IF NOT EXISTS idx_crawl_documents_search_vector ON crawl_documents USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS idx_evidence_items_job ON evidence_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_research_reports_job ON research_reports(job_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_research_runs_job ON research_runs(job_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_frontier_items_run ON frontier_items(run_id, status, priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_document_links_run ON document_links(run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_evidence_claims_run ON evidence_claims(run_id);
	    CREATE INDEX IF NOT EXISTS idx_evidence_relations_claim ON evidence_relations(claim_id);
	    CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, created_at DESC);

    ALTER TABLE search_candidates ADD COLUMN IF NOT EXISTS run_id TEXT;
    ALTER TABLE crawl_documents ADD COLUMN IF NOT EXISTS run_id TEXT;
    ALTER TABLE crawl_documents ADD COLUMN IF NOT EXISTS memory_status TEXT NOT NULL DEFAULT 'fresh';
    ALTER TABLE crawl_documents ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS run_id TEXT;
    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS claim_id TEXT;
    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS quote TEXT;
    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS paraphrase TEXT;
    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS credibility_score REAL;
    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS supports_claim BOOLEAN;
	    ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS contradicts_claim BOOLEAN;
	    ALTER TABLE research_reports ADD COLUMN IF NOT EXISTS run_id TEXT;
	    ALTER TABLE research_jobs ADD COLUMN IF NOT EXISTS constraints JSONB NOT NULL DEFAULT '{}';
	    ALTER TABLE document_links ADD COLUMN IF NOT EXISTS run_id TEXT;
	    ALTER TABLE document_links ADD COLUMN IF NOT EXISTS context TEXT;
	    ALTER TABLE document_links ADD COLUMN IF NOT EXISTS enqueued INTEGER NOT NULL DEFAULT 0;
	    ALTER TABLE extracted_tables ADD COLUMN IF NOT EXISTS table_index INTEGER NOT NULL DEFAULT 0;
	    WITH ranked_tables AS (
	      SELECT
	        id,
	        ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at ASC, id ASC) - 1 AS next_index
	      FROM extracted_tables
	    )
	    UPDATE extracted_tables
	    SET table_index = ranked_tables.next_index
	    FROM ranked_tables
	    WHERE extracted_tables.id = ranked_tables.id;
	  `);
  await ensureDocumentLinksUniqueIndex();
  await ensureExtractedTablesUniqueIndex();
}

async function ensureDocumentLinksUniqueIndex() {
  await getPool().query(`
    DELETE FROM document_links a
    USING document_links b
    WHERE a.document_id = b.document_id
      AND a.url = b.url
      AND a.created_at > b.created_at
  `);
  await getPool().query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_links_document_url
    ON document_links(document_id, url)
  `);
}

async function ensureExtractedTablesUniqueIndex() {
  const existingConstraint = await getPool().query(
    `
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'extracted_tables_document_id_table_index_key'
      LIMIT 1
    `,
  );
  if (existingConstraint.rows[0]) return;

  await getPool().query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_extracted_tables_document_index
    ON extracted_tables(document_id, table_index)
  `);
}

export async function createResearchJob(input: {
  topic: string;
  seedUrls?: string[];
  budget?: Partial<ResearchBudget>;
  constraints?: Partial<import("./types").ResearchConstraints>;
  queryPlan?: string[];
  nextRunAt?: string;
}): Promise<ResearchJob> {
  const job: ResearchJob = {
    id: randomUUID(),
    topic: input.topic,
    seedUrls: input.seedUrls ?? [],
    status: "active",
    budget: normalizeResearchBudget(input.budget),
    constraints: normalizeResearchConstraints(input.constraints ?? {}),
    queryPlan: input.queryPlan ?? [],
    nextRunAt: input.nextRunAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const row = await getPool().query(
    `
      INSERT INTO research_jobs (id, topic, seed_urls, status, budget, constraints, query_plan, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      job.id,
      job.topic,
      JSON.stringify(job.seedUrls),
      job.status,
      JSON.stringify(job.budget),
      JSON.stringify(job.constraints),
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

export async function updateResearchJobQueryPlan(id: string, queryPlan: string[]): Promise<ResearchJob | null> {
  const result = await getPool().query(
    "UPDATE research_jobs SET query_plan = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, JSON.stringify(queryPlan)],
  );
  return result.rows[0] ? mapResearchJob(result.rows[0]) : null;
}

export async function addResearchPlan(input: {
  jobId: string;
  runId: string;
  plan: ResearchPlan;
}) {
  const id = randomUUID();
  await getPool().query(
    `
      INSERT INTO research_plans (id, job_id, run_id, plan)
      VALUES ($1,$2,$3,$4)
    `,
    [id, input.jobId, input.runId, JSON.stringify(input.plan)],
  );
  await replacePlannedQueries({
    jobId: input.jobId,
    runId: input.runId,
    queries: input.plan.queries,
  });
  return { id, jobId: input.jobId, runId: input.runId, plan: input.plan };
}

export async function getLatestResearchPlanForRun(runId: string): Promise<ResearchPlan | null> {
  const result = await getPool().query(
    "SELECT plan FROM research_plans WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1",
    [runId],
  );
  return result.rows[0]?.plan ?? null;
}

export async function replacePlannedQueries(input: {
  jobId: string;
  runId: string;
  queries: PlannedQuery[];
}) {
  await getPool().query("DELETE FROM planned_queries WHERE run_id = $1", [input.runId]);
  const seenIds = new Set<string>();
  for (const query of input.queries) {
    const scopedId = scopedPlannedQueryId(input.runId, query.id);
    if (seenIds.has(scopedId)) continue;
    seenIds.add(scopedId);
    await getPool().query(
      `
        INSERT INTO planned_queries (
          id, job_id, run_id, text, purpose, source_types, language, priority
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
        scopedId,
        input.jobId,
        input.runId,
        query.text,
        query.purpose,
        JSON.stringify(query.sourceTypes),
        query.language,
        query.priority,
      ],
    );
  }
}

export async function appendPlannedQueryForRun(input: {
  jobId: string;
  runId: string;
  text: string;
  purpose?: PlannedQuery["purpose"];
  sourceTypes?: PlannedQuery["sourceTypes"];
  language?: string;
  priority?: number;
}): Promise<PlannedQuery> {
  const normalizedText = input.text.trim().replace(/\s+/g, " ");
  const query: PlannedQuery = {
    id: `manual-${randomUUID()}`,
    text: normalizedText,
    purpose: input.purpose ?? "overview",
    sourceTypes: input.sourceTypes?.length ? input.sourceTypes : ["unknown"],
    language: input.language ?? (/[\u4e00-\u9fff]/.test(normalizedText) ? "mixed" : "en"),
    priority: input.priority ?? 75,
  };

  const result = await getPool().query(
    `
      INSERT INTO planned_queries (
        id, job_id, run_id, text, purpose, source_types, language, priority
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, text, purpose, source_types, language, priority
    `,
    [
      query.id,
      input.jobId,
      input.runId,
      query.text,
      query.purpose,
      JSON.stringify(query.sourceTypes),
      query.language,
      query.priority,
    ],
  );

  return mapPlannedQuery(result.rows[0]);
}

function scopedPlannedQueryId(runId: string, queryId: string) {
  if (queryId.startsWith("manual-") || queryId.startsWith(`${runId}-`)) {
    return queryId;
  }
  return `${runId}-${queryId}`;
}

export async function listPlannedQueriesForRun(runId: string): Promise<PlannedQuery[]> {
  const result = await getPool().query(
    `
      SELECT id, text, purpose, source_types, language, priority
      FROM planned_queries
      WHERE run_id = $1
      ORDER BY priority DESC, created_at ASC
    `,
    [runId],
  );
  return result.rows.map(mapPlannedQuery);
}

export async function createResearchRun(job: ResearchJob): Promise<ResearchRun> {
  const id = randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO research_runs (id, job_id, status, stage, budget)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `,
    [id, job.id, "queued", "queued", JSON.stringify(job.budget)],
  );
  await recordResearchTopicMemory(job.topic, job.id, id);
  return mapResearchRun(result.rows[0]);
}

async function recordResearchTopicMemory(topic: string, jobId: string, runId: string) {
  await getPool().query(
    `
      INSERT INTO research_topic_memory (id, topic_fingerprint, latest_job_id, latest_run_id, run_count)
      VALUES ($1,$2,$3,$4,1)
      ON CONFLICT (topic_fingerprint) DO UPDATE SET
        latest_job_id = EXCLUDED.latest_job_id,
        latest_run_id = EXCLUDED.latest_run_id,
        run_count = research_topic_memory.run_count + 1,
        updated_at = NOW()
    `,
    [randomUUID(), topicFingerprint(topic), jobId, runId],
  );
}

export async function listResearchRunsForJob(jobId: string): Promise<ResearchRun[]> {
  const result = await getPool().query(
    "SELECT * FROM research_runs WHERE job_id = $1 ORDER BY created_at DESC",
    [jobId],
  );
  return result.rows.map(mapResearchRun);
}

export async function getResearchRun(runId: string): Promise<ResearchRun | null> {
  const result = await getPool().query("SELECT * FROM research_runs WHERE id = $1", [runId]);
  return result.rows[0] ? mapResearchRun(result.rows[0]) : null;
}

export async function updateResearchRunStatus(
  runId: string,
  status: ResearchRunStatus,
  stage: ResearchRunStatus = status,
): Promise<ResearchRun | null> {
  const result = await getPool().query(
    `
      UPDATE research_runs
      SET status = $2,
          stage = $3,
          started_at = CASE WHEN started_at IS NULL AND $2 NOT IN ('queued') THEN NOW() ELSE started_at END,
          finished_at = CASE WHEN $2 IN ('completed','failed','cancelled') THEN NOW() ELSE finished_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [runId, status, stage],
  );
  return result.rows[0] ? mapResearchRun(result.rows[0]) : null;
}

export async function addRunEvent(event: RunEvent): Promise<RunEvent> {
  const id = event.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO run_events (id, job_id, run_id, stage, level, message, data)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,
    [id, event.jobId, event.runId, event.stage, event.level, event.message, JSON.stringify(event.data ?? {})],
  );
  return mapRunEvent(result.rows[0]);
}

export async function listRunEvents(runId: string): Promise<RunEvent[]> {
  const result = await getPool().query(
    "SELECT * FROM run_events WHERE run_id = $1 ORDER BY created_at ASC",
    [runId],
  );
  return result.rows.map(mapRunEvent);
}

export async function listDiscoveryResultsForRun(runId: string): Promise<DiscoveryResult[]> {
  const result = await getPool().query(
    "SELECT * FROM discovery_results WHERE run_id = $1 ORDER BY created_at ASC",
    [runId],
  );
  return result.rows.map(mapDiscoveryResult);
}

export async function listDiscoveryResults(limit = 500): Promise<DiscoveryResult[]> {
  const result = await getPool().query(
    "SELECT * FROM discovery_results ORDER BY created_at DESC LIMIT $1",
    [limit],
  );
  return result.rows.map(mapDiscoveryResult);
}

export async function upsertFrontierItem(item: FrontierItem): Promise<FrontierItem> {
  const id = item.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO frontier_items (
        id, job_id, run_id, url, canonical_url, depth, source_type, priority_score, score_breakdown, status, attempts,
        discovered_from_url, discovered_from_document_id, query_id, reason, next_attempt_at, last_error
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (run_id, canonical_url) DO UPDATE SET
        priority_score = GREATEST(frontier_items.priority_score, EXCLUDED.priority_score),
        score_breakdown = CASE
          WHEN EXCLUDED.priority_score >= frontier_items.priority_score THEN EXCLUDED.score_breakdown
          ELSE frontier_items.score_breakdown
        END,
        reason = EXCLUDED.reason,
        updated_at = NOW()
      RETURNING *
    `,
    [
      id,
      item.jobId,
      item.runId,
      item.url,
      item.canonicalUrl,
      item.depth,
      item.sourceType,
      item.priorityScore,
      item.scoreBreakdown ?? {},
      item.status,
      item.attempts,
      item.discoveredFromUrl ?? null,
      item.discoveredFromDocumentId ?? null,
      item.queryId ?? null,
      item.reason,
      item.nextAttemptAt ?? null,
      item.lastError ?? null,
    ],
  );
  return mapFrontierItem(result.rows[0]);
}

export async function updateFrontierItemStatus(
  id: string,
  status: FrontierItem["status"],
  input: { attempts?: number; lastError?: string; reason?: string } = {},
): Promise<FrontierItem | null> {
  const result = await getPool().query(
    `
      UPDATE frontier_items
      SET status = $2,
          attempts = COALESCE($3, attempts),
          last_error = $4,
          reason = COALESCE($5, reason),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, status, input.attempts ?? null, input.lastError ?? null, input.reason ?? null],
  );
  return result.rows[0] ? mapFrontierItem(result.rows[0]) : null;
}

export async function resetFailedFrontierItemsForRun(runId: string): Promise<FrontierItem[]> {
  const result = await getPool().query(
    `
      UPDATE frontier_items
      SET status = 'queued',
          last_error = NULL,
          next_attempt_at = NULL,
          reason = 'manual_retry',
          updated_at = NOW()
      WHERE run_id = $1
        AND status IN ('failed', 'skipped')
      RETURNING *
    `,
    [runId],
  );
  return result.rows.map(mapFrontierItem);
}

export async function listFrontierItemsForRun(runId: string): Promise<FrontierItem[]> {
  const result = await getPool().query(
    "SELECT * FROM frontier_items WHERE run_id = $1 ORDER BY priority_score DESC, created_at ASC",
    [runId],
  );
  return result.rows.map(mapFrontierItem);
}

export async function addDiscoveryResult(input: {
  jobId: string;
  runId: string;
  provider: string;
  providerType: string;
  queryId?: string;
  candidateCount: number;
  error?: string;
  durationMs?: number;
  costUnits?: number;
}) {
  const id = randomUUID();
  await getPool().query(
    `
      INSERT INTO discovery_results (
        id, job_id, run_id, provider, provider_type, query_id, candidate_count, error, duration_ms, cost_units
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      id,
      input.jobId,
      input.runId,
      input.provider,
      input.providerType,
      input.queryId ?? null,
      input.candidateCount,
      input.error ?? null,
      input.durationMs ?? 0,
      input.costUnits ?? 0,
    ],
  );
}

export async function upsertSearchCandidate(candidate: SearchCandidate): Promise<SearchCandidate> {
  const id = candidate.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO search_candidates (
        id, job_id, run_id, provider, query, url, canonical_url, title, snippet, published_at, depth, discovered_from_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (job_id, canonical_url) DO UPDATE SET
        title = EXCLUDED.title,
        snippet = EXCLUDED.snippet,
        run_id = COALESCE(EXCLUDED.run_id, search_candidates.run_id)
      RETURNING *
    `,
    [
      id,
      candidate.jobId,
      candidate.runId ?? null,
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

export async function listSearchCandidatesForRun(runId: string): Promise<SearchCandidate[]> {
  const result = await getPool().query(
    "SELECT * FROM search_candidates WHERE run_id = $1 ORDER BY created_at ASC",
    [runId],
  );
  return result.rows.map(mapSearchCandidate);
}

export async function upsertCrawlDocument(document: CrawlDocument): Promise<CrawlDocument> {
  const id = document.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO crawl_documents (
        id, job_id, run_id, url, canonical_url, final_url, title, domain, content_text, content_hash, depth, status, error, fetched_at, memory_status, metadata, search_vector
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,to_tsvector('simple', COALESCE($7, '') || ' ' || COALESCE($9, '')))
      ON CONFLICT (job_id, canonical_url) DO UPDATE SET
        run_id = COALESCE(EXCLUDED.run_id, crawl_documents.run_id),
        final_url = EXCLUDED.final_url,
        title = EXCLUDED.title,
        content_text = EXCLUDED.content_text,
        content_hash = EXCLUDED.content_hash,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        fetched_at = EXCLUDED.fetched_at,
        memory_status = EXCLUDED.memory_status,
        metadata = EXCLUDED.metadata,
        search_vector = to_tsvector('simple', COALESCE(EXCLUDED.title, '') || ' ' || COALESCE(EXCLUDED.content_text, '')),
        updated_at = NOW()
      RETURNING *
    `,
    [
      id,
      document.jobId,
      document.runId ?? null,
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
      document.memoryStatus ?? "fresh",
      JSON.stringify(document.metadata ?? {}),
    ],
  );

  return mapCrawlDocument(result.rows[0]);
}

export async function findLatestFetchedDocumentByCanonicalUrl(canonicalUrl: string): Promise<CrawlDocument | null> {
  const result = await getPool().query(
    `
      SELECT *
      FROM crawl_documents
      WHERE canonical_url = $1
        AND status = 'fetched'
        AND content_hash IS NOT NULL
        AND fetched_at IS NOT NULL
      ORDER BY fetched_at DESC
      LIMIT 1
    `,
    [canonicalUrl],
  );
  return result.rows[0] ? mapCrawlDocument(result.rows[0]) : null;
}

export async function recordSourceMemory(document: CrawlDocument) {
  if (!document.domain) return;
  const successful = document.status === "fetched";
  await getPool().query(
    `
      INSERT INTO source_memory (
        id, domain, successful_fetches, failed_fetches, last_success_at, last_failure_at
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (domain) DO UPDATE SET
        successful_fetches = source_memory.successful_fetches + EXCLUDED.successful_fetches,
        failed_fetches = source_memory.failed_fetches + EXCLUDED.failed_fetches,
        last_success_at = COALESCE(EXCLUDED.last_success_at, source_memory.last_success_at),
        last_failure_at = COALESCE(EXCLUDED.last_failure_at, source_memory.last_failure_at),
        updated_at = NOW()
    `,
    [
      randomUUID(),
      document.domain,
      successful ? 1 : 0,
      successful ? 0 : 1,
      successful ? document.fetchedAt ?? new Date().toISOString() : null,
      successful ? null : document.fetchedAt ?? new Date().toISOString(),
    ],
  );
}

export async function upsertDocumentAsset(asset: DocumentAsset): Promise<DocumentAsset> {
  const sha256 = asset.metadata.sha256;
  const existing = await getPool().query(
    `
      SELECT * FROM document_assets
      WHERE document_id = $1
        AND asset_type = $2
        AND metadata->>'sha256' = $3
      LIMIT 1
    `,
    [asset.documentId, asset.assetType, sha256],
  );
  if (existing.rows[0]) return mapDocumentAsset(existing.rows[0]);

  const id = asset.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO document_assets (id, job_id, run_id, document_id, url, asset_type, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,
    [
      id,
      asset.jobId,
      asset.runId ?? null,
      asset.documentId,
      asset.url,
      asset.assetType,
      JSON.stringify(asset.metadata),
    ],
  );
  return mapDocumentAsset(result.rows[0]);
}

export async function listDocumentAssetsForRun(runId: string): Promise<DocumentAsset[]> {
  const result = await getPool().query(
    "SELECT * FROM document_assets WHERE run_id = $1 ORDER BY created_at DESC",
    [runId],
  );
  return result.rows.map(mapDocumentAsset);
}

export async function upsertDocumentLink(link: DocumentLinkRecord): Promise<DocumentLinkRecord> {
  const id = link.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO document_links (id, job_id, run_id, document_id, url, text, context, enqueued)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (document_id, url) DO UPDATE SET
        run_id = COALESCE(EXCLUDED.run_id, document_links.run_id),
        text = CASE WHEN EXCLUDED.text <> '' THEN EXCLUDED.text ELSE document_links.text END,
        context = COALESCE(EXCLUDED.context, document_links.context),
        enqueued = GREATEST(document_links.enqueued, EXCLUDED.enqueued)
      RETURNING *
    `,
    [
      id,
      link.jobId,
      link.runId ?? null,
      link.documentId,
      link.url,
      link.text,
      link.context ?? null,
      link.enqueued ? 1 : 0,
    ],
  );
  return mapDocumentLink(result.rows[0]);
}

export async function listDocumentLinksForRun(runId: string): Promise<DocumentLinkRecord[]> {
  const result = await getPool().query(
    `
      SELECT *
      FROM document_links
      WHERE run_id = $1
      ORDER BY enqueued DESC, created_at ASC
    `,
    [runId],
  );
  return result.rows.map(mapDocumentLink);
}

export async function upsertExtractedTable(table: ExtractedTableRecord): Promise<ExtractedTableRecord> {
  const id = table.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO extracted_tables (id, job_id, run_id, document_id, table_index, caption, headers, rows)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (document_id, table_index) DO UPDATE SET
        caption = EXCLUDED.caption,
        headers = EXCLUDED.headers,
        rows = EXCLUDED.rows
      RETURNING *
    `,
    [
      id,
      table.jobId,
      table.runId ?? null,
      table.documentId,
      table.tableIndex,
      table.caption ?? null,
      JSON.stringify(table.headers),
      JSON.stringify(table.rows),
    ],
  );
  return mapExtractedTable(result.rows[0]);
}

export async function listExtractedTablesForRun(runId: string): Promise<ExtractedTableRecord[]> {
  const result = await getPool().query(
    "SELECT * FROM extracted_tables WHERE run_id = $1 ORDER BY document_id ASC, table_index ASC",
    [runId],
  );
  return result.rows.map(mapExtractedTable);
}

export async function searchCrawlDocumentsForRun(
  runId: string,
  query: string,
): Promise<DocumentSearchResult[]> {
  const normalizedQuery = normalizeDocumentSearchQuery(query);
  if (!normalizedQuery) return [];

  try {
    const result = await getPool().query(
      `
        WITH q AS (SELECT to_tsquery('simple', $2) AS query)
        SELECT
          crawl_documents.id,
          crawl_documents.title,
          crawl_documents.url,
          ts_rank_cd(crawl_documents.search_vector, q.query) AS rank,
          ts_headline(
            'simple',
            COALESCE(crawl_documents.content_text, ''),
            q.query,
            'MaxWords=30,MinWords=8,ShortWord=2'
          ) AS snippet
        FROM crawl_documents, q
        WHERE crawl_documents.run_id = $1
          AND crawl_documents.search_vector @@ q.query
        ORDER BY rank DESC, crawl_documents.created_at DESC
        LIMIT 25
      `,
      [runId, normalizedQuery],
    );
    return result.rows.map(mapDocumentSearchResult);
  } catch {
    const result = await getPool().query(
      `
        SELECT id, title, url, 0.1 AS rank, LEFT(COALESCE(content_text, ''), 240) AS snippet
        FROM crawl_documents
        WHERE run_id = $1
          AND (title ILIKE $2 OR content_text ILIKE $2)
        ORDER BY created_at DESC
        LIMIT 25
      `,
      [runId, `%${query.trim()}%`],
    );
    return result.rows.map(mapDocumentSearchResult);
  }
}

export async function addEvidenceItem(item: EvidenceItem): Promise<EvidenceItem> {
  const id = item.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO evidence_items (
        id, job_id, run_id, document_id, claim_id, source_url, quote, paraphrase, snippet,
        explanation, relevance_score, credibility_score, supports_claim, contradicts_claim, entities
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `,
    [
      id,
      item.jobId,
      item.runId ?? null,
      item.documentId,
      item.claimId ?? null,
      item.sourceUrl,
      item.quote ?? null,
      item.paraphrase ?? null,
      item.snippet,
      item.explanation,
      item.relevanceScore,
      item.credibilityScore ?? null,
      item.supportsClaim ?? null,
      item.contradictsClaim ?? null,
      JSON.stringify(item.entities),
    ],
  );

  return mapEvidenceItem(result.rows[0]);
}

export async function listEvidenceItemsForRun(runId: string): Promise<EvidenceItem[]> {
  const result = await getPool().query(
    "SELECT * FROM evidence_items WHERE run_id = $1 ORDER BY relevance_score DESC, created_at ASC",
    [runId],
  );
  return result.rows.map(mapEvidenceItem);
}

export async function addEvidenceClaim(claim: EvidenceClaim): Promise<EvidenceClaim> {
  const id = claim.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO evidence_claims (
        id, job_id, run_id, claim, normalized_claim, status, confidence,
        supporting_evidence_ids, conflicting_evidence_ids, first_seen_at, primary_source_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `,
    [
      id,
      claim.jobId,
      claim.runId,
      claim.claim,
      claim.normalizedClaim,
      claim.status,
      claim.confidence,
      JSON.stringify(claim.supportingEvidenceIds),
      JSON.stringify(claim.conflictingEvidenceIds),
      claim.firstSeenAt ?? null,
      claim.primarySourceUrl ?? null,
    ],
  );
  return mapEvidenceClaim(result.rows[0]);
}

export async function listEvidenceClaimsForRun(runId: string): Promise<EvidenceClaim[]> {
  const result = await getPool().query(
    "SELECT * FROM evidence_claims WHERE run_id = $1 ORDER BY confidence DESC, created_at ASC",
    [runId],
  );
  return result.rows.map(mapEvidenceClaim);
}

export async function addEvidenceRelation(relation: EvidenceRelation): Promise<EvidenceRelation> {
  const id = relation.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO evidence_relations (id, claim_id, evidence_id, relation, confidence)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (claim_id, evidence_id, relation) DO UPDATE SET
        confidence = GREATEST(evidence_relations.confidence, EXCLUDED.confidence)
      RETURNING *
    `,
    [id, relation.claimId, relation.evidenceId, relation.relation, relation.confidence],
  );
  return mapEvidenceRelation(result.rows[0]);
}

export async function listEvidenceRelationsForRun(runId: string): Promise<EvidenceRelation[]> {
  const result = await getPool().query(
    `
      SELECT evidence_relations.*
      FROM evidence_relations
      INNER JOIN evidence_claims ON evidence_claims.id = evidence_relations.claim_id
      WHERE evidence_claims.run_id = $1
      ORDER BY evidence_relations.created_at ASC
    `,
    [runId],
  );
  return result.rows.map(mapEvidenceRelation);
}

export async function upsertSourceProfile(profile: SourceProfile): Promise<SourceProfile> {
  const id = profile.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO source_profiles (
        id, domain, source_type, authority_tier, official_likelihood, mainstream_likelihood, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (domain) DO UPDATE SET
        source_type = EXCLUDED.source_type,
        authority_tier = EXCLUDED.authority_tier,
        official_likelihood = EXCLUDED.official_likelihood,
        mainstream_likelihood = EXCLUDED.mainstream_likelihood,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `,
    [
      id,
      profile.domain,
      profile.sourceType,
      profile.authorityTier,
      profile.officialLikelihood,
      profile.mainstreamLikelihood,
      JSON.stringify(profile.notes),
    ],
  );
  return mapSourceProfile(result.rows[0]);
}

export async function listSourceProfiles(): Promise<SourceProfile[]> {
  const result = await getPool().query(
    "SELECT * FROM source_profiles ORDER BY authority_tier ASC, domain ASC",
  );
  return result.rows.map(mapSourceProfile);
}

export async function addResearchReport(report: ResearchReport): Promise<ResearchReport> {
  const id = report.id ?? randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO research_reports (id, job_id, run_id, status, markdown, generated_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `,
    [id, report.jobId, report.runId ?? null, report.status, report.markdown, report.generatedAt ?? null],
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

export async function getLatestResearchReportForRun(runId: string): Promise<ResearchReport | null> {
  const result = await getPool().query(
    "SELECT * FROM research_reports WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1",
    [runId],
  );
  return result.rows[0] ? mapResearchReport(result.rows[0]) : null;
}

export async function listCrawlDocumentsForJob(jobId: string): Promise<CrawlDocument[]> {
  const result = await getPool().query(
    "SELECT * FROM crawl_documents WHERE job_id = $1 ORDER BY created_at DESC",
    [jobId],
  );
  return result.rows.map(mapCrawlDocument);
}

export async function listCrawlDocumentsForRun(runId: string): Promise<CrawlDocument[]> {
  const result = await getPool().query(
    "SELECT * FROM crawl_documents WHERE run_id = $1 ORDER BY created_at DESC",
    [runId],
  );
  return result.rows.map(mapCrawlDocument);
}

function mapResearchJob(row: any): ResearchJob {
  return {
    id: row.id,
    topic: row.topic,
    seedUrls: row.seed_urls ?? [],
    status: row.status,
    budget: normalizeResearchBudget(row.budget ?? {}),
    constraints: normalizeResearchConstraints(row.constraints ?? {}),
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
    runId: row.run_id ?? undefined,
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

function mapResearchRun(row: any): ResearchRun {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    stage: row.stage,
    budget: normalizeResearchBudget(row.budget ?? {}),
    startedAt: row.started_at?.toISOString?.() ?? row.started_at ?? undefined,
    finishedAt: row.finished_at?.toISOString?.() ?? row.finished_at ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function mapPlannedQuery(row: any): PlannedQuery {
  return {
    id: row.id,
    text: row.text,
    purpose: row.purpose,
    sourceTypes: row.source_types ?? [],
    language: row.language,
    priority: Number(row.priority ?? 0),
  };
}

function mapDiscoveryResult(row: any): DiscoveryResult {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id,
    provider: row.provider,
    providerType: row.provider_type,
    queryId: row.query_id ?? undefined,
    candidateCount: row.candidate_count,
    error: row.error ?? undefined,
    durationMs: row.duration_ms,
    costUnits: row.cost_units,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapRunEvent(row: any): RunEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id,
    stage: row.stage,
    level: row.level,
    message: row.message,
    data: row.data ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapFrontierItem(row: any): FrontierItem {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    depth: row.depth,
    sourceType: row.source_type,
    priorityScore: row.priority_score,
    scoreBreakdown: row.score_breakdown ?? undefined,
    status: row.status,
    attempts: row.attempts,
    discoveredFromUrl: row.discovered_from_url ?? undefined,
    discoveredFromDocumentId: row.discovered_from_document_id ?? undefined,
    queryId: row.query_id ?? undefined,
    reason: row.reason,
    nextAttemptAt: row.next_attempt_at?.toISOString?.() ?? row.next_attempt_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? undefined,
  };
}

function mapCrawlDocument(row: any): CrawlDocument {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id ?? undefined,
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
    memoryStatus: row.memory_status ?? undefined,
    metadata: row.metadata ?? {},
  };
}

function mapDocumentAsset(row: any): DocumentAsset {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id ?? undefined,
    documentId: row.document_id,
    url: row.url,
    assetType: row.asset_type,
    metadata: row.metadata ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapDocumentLink(row: any): DocumentLinkRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id ?? undefined,
    documentId: row.document_id,
    url: row.url,
    text: row.text,
    context: row.context ?? undefined,
    enqueued: Boolean(row.enqueued),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapExtractedTable(row: any): ExtractedTableRecord {
	  return {
	    id: row.id,
	    jobId: row.job_id,
	    runId: row.run_id ?? undefined,
	    documentId: row.document_id,
	    tableIndex: row.table_index,
	    caption: row.caption ?? undefined,
	    headers: row.headers ?? [],
	    rows: row.rows ?? [],
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapDocumentSearchResult(row: any): DocumentSearchResult {
  return {
    documentId: row.id,
    title: row.title ?? undefined,
    url: row.url,
    rank: Number(row.rank ?? 0),
    snippet: row.snippet ?? "",
  };
}

function mapEvidenceItem(row: any): EvidenceItem {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id ?? undefined,
    documentId: row.document_id,
    claimId: row.claim_id ?? undefined,
    sourceUrl: row.source_url,
    quote: row.quote ?? undefined,
    paraphrase: row.paraphrase ?? undefined,
    snippet: row.snippet,
    explanation: row.explanation,
    relevanceScore: row.relevance_score,
    credibilityScore: row.credibility_score ?? undefined,
    supportsClaim: row.supports_claim ?? undefined,
    contradictsClaim: row.contradicts_claim ?? undefined,
    entities: row.entities ?? [],
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapEvidenceClaim(row: any): EvidenceClaim {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id,
    claim: row.claim,
    normalizedClaim: row.normalized_claim,
    status: row.status,
    confidence: row.confidence,
    supportingEvidenceIds: row.supporting_evidence_ids ?? [],
    conflictingEvidenceIds: row.conflicting_evidence_ids ?? [],
    firstSeenAt: row.first_seen_at?.toISOString?.() ?? row.first_seen_at ?? undefined,
    primarySourceUrl: row.primary_source_url ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapEvidenceRelation(row: any): EvidenceRelation {
  return {
    id: row.id,
    claimId: row.claim_id,
    evidenceId: row.evidence_id,
    relation: row.relation,
    confidence: row.confidence,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
  };
}

function mapSourceProfile(row: any): SourceProfile {
  return {
    id: row.id,
    domain: row.domain,
    sourceType: row.source_type,
    authorityTier: row.authority_tier,
    officialLikelihood: row.official_likelihood,
    mainstreamLikelihood: row.mainstream_likelihood,
    notes: row.notes ?? [],
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? undefined,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? undefined,
  };
}

function mapResearchReport(row: any): ResearchReport {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id ?? undefined,
    status: row.status,
    markdown: row.markdown,
    generatedAt: row.generated_at?.toISOString?.() ?? row.generated_at ?? undefined,
  };
}
