import { randomUUID } from "crypto";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { Pool } from "pg";
import { getResearchConfig, requireResearchDatabase } from "../research/config";
import { profileRows, suggestVisualizations } from "./engine";
import {
  AnalyticsArtifact,
  AnalyticsDatasetAsset,
  AnalyticsDatasetProfile,
  AnalyticsJob,
  AnalyticsJobKind,
  AnalyticsJobStatus,
  CreateAnalyticsDatasetInput,
} from "./types";

let pool: Pool | null = null;
let storeMode: "postgres" | "local" | null = null;

interface LocalAnalyticsStore {
  datasets: AnalyticsDatasetAsset[];
  profiles: AnalyticsDatasetProfile[];
  jobs: AnalyticsJob[];
  artifacts: AnalyticsArtifact[];
}

const DATASET_PREVIEW_ROW_LIMIT = 500;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireResearchDatabase(getResearchConfig()),
    });
  }
  return pool;
}

export async function closeAnalyticsStore() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  storeMode = null;
}

export async function initAnalyticsSchema() {
  if (storeMode === "local") {
    await readLocalStore();
    return;
  }
  try {
    await getPool().query(`
    CREATE TABLE IF NOT EXISTS analytics_dataset_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_ref TEXT,
      row_count INTEGER NOT NULL DEFAULT 0,
      column_count INTEGER NOT NULL DEFAULT 0,
      rows JSONB NOT NULL DEFAULT '[]',
      sample_rows JSONB NOT NULL DEFAULT '[]',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analytics_dataset_profiles (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES analytics_dataset_assets(id) ON DELETE CASCADE,
      profile JSONB NOT NULL,
      suggestions JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analytics_jobs (
      id TEXT PRIMARY KEY,
      dataset_id TEXT REFERENCES analytics_dataset_assets(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      request JSONB NOT NULL DEFAULT '{}',
      result JSONB NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analytics_artifacts (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES analytics_jobs(id) ON DELETE CASCADE,
      dataset_id TEXT REFERENCES analytics_dataset_assets(id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL,
      title TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_dataset_assets_created ON analytics_dataset_assets(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_dataset_profiles_dataset ON analytics_dataset_profiles(dataset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_jobs_dataset ON analytics_jobs(dataset_id, created_at DESC);
    `);
    await getPool().query("ALTER TABLE analytics_dataset_assets ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '[]'");
    await getPool().query(`
      UPDATE analytics_dataset_assets
      SET rows = sample_rows,
          metadata = metadata || jsonb_build_object(
            'storage',
            COALESCE(metadata->'storage', '{}'::jsonb) || jsonb_build_object(
              'rowStorage', 'postgres-jsonb',
              'sampleRowLimit', $1::int,
              'fullRowCount', row_count,
              'backfilledFromSampleRows', true
            )
          )
      WHERE jsonb_array_length(rows) = 0 AND jsonb_array_length(sample_rows) > 0
    `, [DATASET_PREVIEW_ROW_LIMIT]);
    storeMode = "postgres";
  } catch (error) {
    if (pool) {
      await pool.end().catch(() => undefined);
      pool = null;
    }
    if (!allowLocalAnalyticsFallback()) {
      storeMode = null;
      throw Object.assign(
        new Error(
          `analytics_postgres_unavailable: ${error instanceof Error ? error.message : String(error)}. ` +
          "Data Lab requires DATABASE_URL/Postgres by default; set ANALYTICS_ALLOW_LOCAL_FALLBACK=true only for temporary offline development.",
        ),
        { statusCode: 503 },
      );
    }
    storeMode = "local";
    console.warn(`Analytics store falling back to local JSON store: ${error instanceof Error ? error.message : String(error)}`);
    await readLocalStore();
  }
}

export async function createAnalyticsDataset(input: CreateAnalyticsDatasetInput) {
  await initAnalyticsSchema();
  const rows = input.rows;
  const sampleRows = rows.slice(0, DATASET_PREVIEW_ROW_LIMIT);
  const profile = profileRows({ rows });
  const id = randomUUID();
  const metadata = {
    ...(input.metadata ?? {}),
    storage: {
      rowStorage: "postgres-jsonb",
      sampleRowLimit: DATASET_PREVIEW_ROW_LIMIT,
      fullRowCount: rows.length,
    },
  };
  if (storeMode === "local") {
    const now = new Date().toISOString();
    const store = await readLocalStore();
    const dataset: AnalyticsDatasetAsset = {
      id,
      name: input.name.trim() || "Untitled dataset",
      sourceKind: input.sourceKind ?? "manual",
      sourceRef: input.sourceRef,
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      rows,
      sampleRows,
      metadata: {
        ...metadata,
        storage: {
          ...metadata.storage,
          rowStorage: "local-json",
        },
      },
      createdAt: now,
      updatedAt: now,
    };
    store.datasets.unshift(dataset);
    await writeLocalStore(store);
    const datasetProfile = await createDatasetProfile(dataset.id, rows);
    return { dataset: toDatasetSummary(dataset), profile: datasetProfile.profile, suggestions: datasetProfile.suggestions };
  }
  const result = await getPool().query(
    `
      INSERT INTO analytics_dataset_assets (
        id, name, source_kind, source_ref, row_count, column_count, rows, sample_rows, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `,
    [
      id,
      input.name.trim() || "Untitled dataset",
      input.sourceKind ?? "manual",
      input.sourceRef ?? null,
      profile.rowCount,
      profile.columnCount,
      JSON.stringify(rows),
      JSON.stringify(sampleRows),
      JSON.stringify(metadata),
    ],
  );
  const dataset = mapDatasetAsset(result.rows[0]);
  const datasetProfile = await createDatasetProfile(dataset.id, rows);
  return { dataset: toDatasetSummary(dataset), profile: datasetProfile.profile, suggestions: datasetProfile.suggestions };
}

export async function createDatasetProfile(datasetId: string, rows?: Array<Record<string, unknown>>): Promise<AnalyticsDatasetProfile> {
  await initAnalyticsSchema();
  const dataset = await getAnalyticsDataset(datasetId);
  if (!dataset) throw new Error("analytics_dataset_not_found");
  const profileRowsInput = rows ?? dataset.rows ?? dataset.sampleRows;
  const profile = profileRows({ rows: profileRowsInput });
  const suggestions = suggestVisualizations(profile);
  const id = randomUUID();
  if (storeMode === "local") {
    const store = await readLocalStore();
    const datasetProfile: AnalyticsDatasetProfile = {
      id,
      datasetId,
      profile,
      suggestions,
      createdAt: new Date().toISOString(),
    };
    store.profiles.unshift(datasetProfile);
    await writeLocalStore(store);
    return datasetProfile;
  }
  const result = await getPool().query(
    `
      INSERT INTO analytics_dataset_profiles (id, dataset_id, profile, suggestions)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `,
    [id, datasetId, JSON.stringify(profile), JSON.stringify(suggestions)],
  );
  return mapDatasetProfile(result.rows[0]);
}

export async function listAnalyticsDatasets(limit = 50): Promise<AnalyticsDatasetAsset[]> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.datasets.slice(0, limit).map(toDatasetSummary);
  }
  const result = await getPool().query(
    `
      SELECT id, name, source_kind, source_ref, row_count, column_count, sample_rows, metadata, created_at, updated_at
      FROM analytics_dataset_assets
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows.map(mapDatasetAsset);
}

export async function getAnalyticsDataset(id: string): Promise<AnalyticsDatasetAsset | null> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.datasets.find((dataset) => dataset.id === id) ?? null;
  }
  const result = await getPool().query("SELECT * FROM analytics_dataset_assets WHERE id = $1", [id]);
  return result.rows[0] ? mapDatasetAsset(result.rows[0]) : null;
}

export async function getLatestDatasetProfile(datasetId: string): Promise<AnalyticsDatasetProfile | null> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.profiles.find((profile) => profile.datasetId === datasetId) ?? null;
  }
  const result = await getPool().query(
    "SELECT * FROM analytics_dataset_profiles WHERE dataset_id = $1 ORDER BY created_at DESC LIMIT 1",
    [datasetId],
  );
  return result.rows[0] ? mapDatasetProfile(result.rows[0]) : null;
}

export async function createAnalyticsJob(input: {
  datasetId?: string;
  kind: AnalyticsJobKind;
  status?: AnalyticsJobStatus;
  request?: Record<string, unknown>;
  result?: Record<string, unknown>;
}): Promise<AnalyticsJob> {
  await initAnalyticsSchema();
  const id = randomUUID();
  if (storeMode === "local") {
    const now = new Date().toISOString();
    const store = await readLocalStore();
    const job: AnalyticsJob = {
      id,
      datasetId: input.datasetId,
      kind: input.kind,
      status: input.status ?? "queued",
      request: input.request ?? {},
      result: input.result ?? {},
      createdAt: now,
      updatedAt: now,
    };
    store.jobs.unshift(job);
    await writeLocalStore(store);
    return job;
  }
  const result = await getPool().query(
    `
      INSERT INTO analytics_jobs (id, dataset_id, kind, status, request, result)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `,
    [
      id,
      input.datasetId ?? null,
      input.kind,
      input.status ?? "queued",
      JSON.stringify(input.request ?? {}),
      JSON.stringify(input.result ?? {}),
    ],
  );
  return mapAnalyticsJob(result.rows[0]);
}

export async function updateAnalyticsJob(input: {
  id: string;
  status: AnalyticsJobStatus;
  result?: Record<string, unknown>;
  error?: string | null;
}): Promise<AnalyticsJob> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    const index = store.jobs.findIndex((job) => job.id === input.id);
    if (index < 0) throw new Error("analytics_job_not_found");
    store.jobs[index] = {
      ...store.jobs[index],
      status: input.status,
      result: input.result ?? store.jobs[index].result,
      error: input.error ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    await writeLocalStore(store);
    return store.jobs[index];
  }
  const result = await getPool().query(
    `
      UPDATE analytics_jobs
      SET status = $2,
          result = COALESCE($3::jsonb, result),
          error = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      input.id,
      input.status,
      input.result === undefined ? null : JSON.stringify(input.result),
      input.error ?? null,
    ],
  );
  if (!result.rows[0]) throw new Error("analytics_job_not_found");
  return mapAnalyticsJob(result.rows[0]);
}

export async function listAnalyticsJobs(limit = 50): Promise<AnalyticsJob[]> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.jobs.slice(0, limit);
  }
  const result = await getPool().query(
    "SELECT * FROM analytics_jobs ORDER BY created_at DESC LIMIT $1",
    [limit],
  );
  return result.rows.map(mapAnalyticsJob);
}

export async function getAnalyticsJob(id: string): Promise<AnalyticsJob | null> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.jobs.find((job) => job.id === id) ?? null;
  }
  const result = await getPool().query("SELECT * FROM analytics_jobs WHERE id = $1", [id]);
  return result.rows[0] ? mapAnalyticsJob(result.rows[0]) : null;
}

export async function createAnalyticsArtifact(input: {
  jobId?: string;
  datasetId?: string;
  artifactType: AnalyticsArtifact["artifactType"];
  title: string;
  metadata?: Record<string, unknown>;
}): Promise<AnalyticsArtifact> {
  await initAnalyticsSchema();
  const id = randomUUID();
  if (storeMode === "local") {
    const store = await readLocalStore();
    const artifact: AnalyticsArtifact = {
      id,
      jobId: input.jobId,
      datasetId: input.datasetId,
      artifactType: input.artifactType,
      title: input.title,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    store.artifacts.unshift(artifact);
    await writeLocalStore(store);
    return artifact;
  }
  const result = await getPool().query(
    `
      INSERT INTO analytics_artifacts (id, job_id, dataset_id, artifact_type, title, metadata)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `,
    [
      id,
      input.jobId ?? null,
      input.datasetId ?? null,
      input.artifactType,
      input.title,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return mapAnalyticsArtifact(result.rows[0]);
}

export async function listAnalyticsArtifacts(limit = 50): Promise<AnalyticsArtifact[]> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.artifacts.slice(0, limit);
  }
  const result = await getPool().query(
    "SELECT * FROM analytics_artifacts ORDER BY created_at DESC LIMIT $1",
    [limit],
  );
  return result.rows.map(mapAnalyticsArtifact);
}

export async function getAnalyticsArtifact(id: string): Promise<AnalyticsArtifact | null> {
  await initAnalyticsSchema();
  if (storeMode === "local") {
    const store = await readLocalStore();
    return store.artifacts.find((artifact) => artifact.id === id) ?? null;
  }
  const result = await getPool().query("SELECT * FROM analytics_artifacts WHERE id = $1", [id]);
  return result.rows[0] ? mapAnalyticsArtifact(result.rows[0]) : null;
}

function localStorePath() {
  const configured = process.env.ANALYTICS_STORE_FILE || ".data/analytics-store.json";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function allowLocalAnalyticsFallback() {
  return ["1", "true", "yes", "on"].includes(String(process.env.ANALYTICS_ALLOW_LOCAL_FALLBACK ?? "").toLowerCase());
}

async function readLocalStore(): Promise<LocalAnalyticsStore> {
  const file = localStorePath();
  try {
    const parsed = JSON.parse(await readFile(file, "utf-8"));
    return {
      datasets: Array.isArray(parsed.datasets) ? parsed.datasets : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    };
  } catch {
    return { datasets: [], profiles: [], jobs: [], artifacts: [] };
  }
}

async function writeLocalStore(store: LocalAnalyticsStore) {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2), "utf-8");
}

function mapDatasetAsset(row: any): AnalyticsDatasetAsset {
  const rows = Array.isArray(row.rows) && row.rows.length ? row.rows : undefined;
  return {
    id: row.id,
    name: row.name,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref ?? undefined,
    rowCount: Number(row.row_count ?? 0),
    columnCount: Number(row.column_count ?? 0),
    rows,
    sampleRows: row.sample_rows ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function toDatasetSummary(dataset: AnalyticsDatasetAsset): AnalyticsDatasetAsset {
  const { rows: _rows, ...summary } = dataset;
  return summary;
}

function mapDatasetProfile(row: any): AnalyticsDatasetProfile {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    profile: row.profile,
    suggestions: row.suggestions ?? [],
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

function mapAnalyticsJob(row: any): AnalyticsJob {
  return {
    id: row.id,
    datasetId: row.dataset_id ?? undefined,
    kind: row.kind,
    status: row.status,
    request: row.request ?? {},
    result: row.result ?? {},
    error: row.error ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function mapAnalyticsArtifact(row: any): AnalyticsArtifact {
  return {
    id: row.id,
    jobId: row.job_id ?? undefined,
    datasetId: row.dataset_id ?? undefined,
    artifactType: row.artifact_type,
    title: row.title,
    metadata: row.metadata ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}
