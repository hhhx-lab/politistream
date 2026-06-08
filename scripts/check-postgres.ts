import "dotenv/config";
import pg from "pg";
import { closeAnalyticsStore, initAnalyticsSchema } from "../src/server/analytics/store";
import { closeResearchStore, initResearchSchema } from "../src/server/research/store";

const databaseUrl = process.env.DATABASE_URL;
const redacted = databaseUrl?.replace(/(:\/\/[^:\s]+:)[^@\s]+(@)/, "$1***$2");

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

try {
  const result = await pool.query("select current_database() as database, current_user as user");
  await assertResearchSchema();
  await assertAnalyticsSchema();
  console.log(JSON.stringify({
    status: "ok",
    databaseUrl: redacted,
    schema: {
      research: "ok",
      analytics: "ok",
    },
    ...result.rows[0],
  }, null, 2));
} catch (error) {
  const typedError = error as { code?: string };
  console.error(JSON.stringify({
    status: "error",
    databaseUrl: redacted,
    code: typedError.code,
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
} finally {
  await closeAnalyticsStore().catch(() => undefined);
  await closeResearchStore().catch(() => undefined);
  await pool.end().catch(() => undefined);
}

async function assertResearchSchema() {
  await initResearchSchema();
  const tables = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `,
    [[
      "research_runs",
      "discovery_results",
	      "frontier_items",
	      "crawl_documents",
	      "document_links",
	      "document_assets",
	      "extracted_tables",
	      "evidence_items",
      "evidence_claims",
      "evidence_relations",
      "source_profiles",
      "run_events",
    ]],
  );
  const names = new Set(tables.rows.map((row: { table_name: string }) => row.table_name));
  for (const expected of ["crawl_documents", "document_links", "document_assets", "extracted_tables", "evidence_items", "evidence_relations", "run_events"]) {
    if (!names.has(expected)) throw new Error(`research_schema_missing:${expected}`);
  }
  await assertResearchTableColumns();
}

async function assertResearchTableColumns() {
  const linkColumns = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'document_links'
    `,
  );
  const linkNames = new Set(linkColumns.rows.map((row: { column_name: string }) => row.column_name));
  for (const expected of ["document_id", "url", "text", "context", "enqueued"]) {
    if (!linkNames.has(expected)) throw new Error(`research_schema_missing:document_links.${expected}`);
  }

  const columns = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'extracted_tables'
    `,
  );
  const names = new Set(columns.rows.map((row: { column_name: string }) => row.column_name));
  for (const expected of ["document_id", "table_index", "headers", "rows"]) {
    if (!names.has(expected)) throw new Error(`research_schema_missing:extracted_tables.${expected}`);
  }
}

async function assertAnalyticsSchema() {
  await initAnalyticsSchema();
  const tables = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `,
    [["analytics_dataset_assets", "analytics_dataset_profiles", "analytics_jobs", "analytics_artifacts"]],
  );
  const names = new Set(tables.rows.map((row: { table_name: string }) => row.table_name));
  for (const expected of ["analytics_dataset_assets", "analytics_jobs", "analytics_artifacts"]) {
    if (!names.has(expected)) throw new Error(`analytics_schema_missing:${expected}`);
  }
}
