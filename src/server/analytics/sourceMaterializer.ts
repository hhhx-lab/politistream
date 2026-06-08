import { performance } from "perf_hooks";
import net from "net";
import { inspectStructuredBuffer } from "../research/extractors/structuredInspector";
import { ExtractedDocument, ExtractedTable, ExtractorKind } from "../research/types";
import { AnalyticsDatasetAsset } from "./types";

export interface DataSourceFetchResult {
  url: string;
  finalUrl?: string;
  contentType: string;
  statusCode: number;
  durationMs: number;
  buffer: Buffer;
}

export type DataSourceFetcher = (url: string, input: { timeoutMs: number; maxBytes: number }) => Promise<DataSourceFetchResult>;

export interface MaterializeDataSourceInput {
  dataset: AnalyticsDatasetAsset;
  rowIndex?: number;
  url?: string;
  maxRows?: number;
  fetcher?: DataSourceFetcher;
}

export interface MaterializeDataSourceBatchInput {
  dataset: AnalyticsDatasetAsset;
  rowIndexes?: number[];
  limit?: number;
  maxRows?: number;
  fetcher?: DataSourceFetcher;
}

export async function materializeResearchDataSource(input: MaterializeDataSourceInput) {
  const sourceRow = selectDataSourceRow(input.dataset, input.rowIndex, input.url);
  return materializeDataSourceRow(sourceRow, input);
}

export async function refreshMaterializedDataSource(input: { dataset: AnalyticsDatasetAsset; maxRows?: number; fetcher?: DataSourceFetcher }) {
  const sourceRow = sourceRowFromMaterializedDataset(input.dataset);
  return materializeDataSourceRow(sourceRow, input);
}

async function materializeDataSourceRow(sourceRow: Record<string, unknown>, input: { maxRows?: number; fetcher?: DataSourceFetcher }) {
  const url = String(sourceRow.url ?? sourceRow.canonical_url ?? "").trim();
  if (!url) throw Object.assign(new Error("data_source_url_missing"), { statusCode: 400 });

  const fetched = await (input.fetcher ?? fetchDataSourceBuffer)(url, {
    timeoutMs: dataSourceFetchTimeoutMs(),
    maxBytes: dataSourceMaxBytes(),
  });
  const kind = inferMaterializeKind(sourceRow, fetched.contentType, fetched.finalUrl ?? fetched.url);
  const extracted = await inspectStructuredBuffer({
    url: fetched.finalUrl ?? fetched.url,
    contentType: fetched.contentType,
    kind,
    buffer: fetched.buffer,
    title: String(sourceRow.title ?? sourceRow.provider ?? "Materialized data source"),
    maxRows: input.maxRows ?? analyticsMaterializeMaxRows(),
  });
  const rows = rowsFromExtractedTables(extracted.tables, extracted.contentText, input.maxRows ?? analyticsMaterializeMaxRows());

  return {
    sourceRow,
    fetched: {
      url: fetched.url,
      finalUrl: fetched.finalUrl,
      contentType: fetched.contentType,
      statusCode: fetched.statusCode,
      durationMs: fetched.durationMs,
      sizeBytes: fetched.buffer.byteLength,
    },
    kind,
    extracted,
    rows,
  };
}

export async function materializeResearchDataSources(input: MaterializeDataSourceBatchInput) {
  const rows = selectDataSourceRows(input.dataset, input.rowIndexes, input.limit);
  const results = [];
  for (const item of rows) {
    try {
      const materialized = await materializeResearchDataSource({
        dataset: input.dataset,
        rowIndex: item.rowIndex,
        maxRows: input.maxRows,
        fetcher: input.fetcher,
      });
      results.push({
        ok: true,
        rowIndex: item.rowIndex,
        sourceRow: materialized.sourceRow,
        materialized,
      });
    } catch (error) {
      results.push({
        ok: false,
        rowIndex: item.rowIndex,
        sourceRow: item.row,
        error: error instanceof Error ? error.message : String(error),
        statusCode: isRecord(error) && typeof error.statusCode === "number" ? error.statusCode : 500,
      });
    }
  }
  return results;
}

export function selectDataSourceRow(dataset: AnalyticsDatasetAsset, rowIndex = 0, url?: string): Record<string, unknown> {
  if (dataset.sourceKind !== "research-data-source") {
    throw Object.assign(new Error("dataset_is_not_research_data_source_registry"), { statusCode: 409 });
  }
  const rows = getDataSourceRows(dataset);
  if (rows.length === 0) throw Object.assign(new Error("research_data_source_registry_empty"), { statusCode: 404 });
  if (url) {
    const match = rows.find((row) => String(row.url ?? row.canonical_url ?? "") === url);
    if (!match) throw Object.assign(new Error("research_data_source_url_not_found"), { statusCode: 404 });
    return match;
  }
  const index = Number.isFinite(rowIndex) ? Math.max(0, Math.floor(rowIndex)) : 0;
  const row = rows[index];
  if (!row) throw Object.assign(new Error("research_data_source_row_not_found"), { statusCode: 404 });
  return row;
}

export function selectDataSourceRows(dataset: AnalyticsDatasetAsset, rowIndexes?: number[], limit = dataSourceMaterializeBatchLimit()) {
  if (dataset.sourceKind !== "research-data-source") {
    throw Object.assign(new Error("dataset_is_not_research_data_source_registry"), { statusCode: 409 });
  }
  const rows = getDataSourceRows(dataset);
  if (rows.length === 0) throw Object.assign(new Error("research_data_source_registry_empty"), { statusCode: 404 });

  const maxCount = Math.max(1, Math.floor(limit || dataSourceMaterializeBatchLimit()));
  const selectedIndexes = Array.isArray(rowIndexes) && rowIndexes.length > 0
    ? rowIndexes.map((index) => Math.max(0, Math.floor(Number(index)))).filter(Number.isFinite)
    : rows.map((_, index) => index);
  const uniqueIndexes = [...new Set(selectedIndexes)].slice(0, maxCount);

  return uniqueIndexes.map((rowIndex) => {
    const row = rows[rowIndex];
    if (!row) throw Object.assign(new Error(`research_data_source_row_not_found:${rowIndex}`), { statusCode: 404 });
    return { rowIndex, row };
  });
}

export function sourceRowFromMaterializedDataset(dataset: AnalyticsDatasetAsset): Record<string, unknown> {
  if (dataset.sourceKind !== "materialized-data-source") {
    throw Object.assign(new Error("dataset_is_not_materialized_data_source"), { statusCode: 409 });
  }
  const metadata = isRecord(dataset.metadata) ? dataset.metadata : {};
  const sourceRow = isRecord(metadata.sourceRow)
    ? metadata.sourceRow
    : {
        title: dataset.name,
        url: metadata.sourceUrl ?? dataset.sourceRef,
        canonical_url: metadata.sourceUrl ?? dataset.sourceRef,
        format_hint: metadata.kind,
        provider: metadata.provider,
        provider_type: metadata.providerType,
        source_type: metadata.sourceType,
      };
  const url = String(sourceRow.url ?? sourceRow.canonical_url ?? "").trim();
  if (!url) throw Object.assign(new Error("materialized_source_url_missing"), { statusCode: 400 });
  return sourceRow;
}

export function inferMaterializeKind(row: Record<string, unknown>, contentType: string, url: string): ExtractorKind {
  const hint = String(row.format_hint ?? "").toLowerCase();
  if (isSupportedMaterializeKind(hint)) return hint;

  const value = `${contentType} ${url}`.toLowerCase();
  if (value.includes("text/csv") || value.endsWith(".csv")) return "csv";
  if (value.includes("application/json") || value.includes("format=json") || value.endsWith(".json")) return "json";
  if (value.includes("geo+json") || value.endsWith(".geojson")) return "geojson";
  if (value.includes("spreadsheet") || value.endsWith(".xlsx") || value.endsWith(".xls")) return "excel";
  if (value.endsWith(".jsonl") || value.endsWith(".ndjson")) return "jsonl";
  if (value.endsWith(".parquet")) return "parquet";
  throw Object.assign(new Error("unsupported_data_source_materialize_kind"), { statusCode: 415 });
}

export async function fetchDataSourceBuffer(url: string, input: { timeoutMs: number; maxBytes: number }): Promise<DataSourceFetchResult> {
  validateMaterializeUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/csv,application/json,application/geo+json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.5",
        "user-agent": "PolitiStream-DataLab/1.0 (+research data source materializer)",
      },
    });
    if (!response.ok) {
      throw Object.assign(new Error(`data_source_fetch_failed:${response.status}`), { statusCode: 502 });
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > input.maxBytes) {
      throw Object.assign(new Error("data_source_too_large"), { statusCode: 413 });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > input.maxBytes) {
      throw Object.assign(new Error("data_source_too_large"), { statusCode: 413 });
    }
    return {
      url,
      finalUrl: response.url || url,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      buffer,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateMaterializeUrl(url: string, options: { allowPrivateNetworks?: boolean } = {}) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error("invalid_data_source_url"), { statusCode: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("unsupported_data_source_protocol"), { statusCode: 400 });
  }
  const allowPrivateNetworks = options.allowPrivateNetworks ?? analyticsSourceAllowPrivateNetworks();
  if (!allowPrivateNetworks && isPrivateOrLocalHostname(parsed.hostname)) {
    throw Object.assign(new Error("private_network_data_source_blocked"), { statusCode: 403 });
  }
  return parsed;
}

function rowsFromExtractedTables(tables: ExtractedTable[], contentText: ExtractedDocument["contentText"], maxRows: number): Array<Record<string, unknown>> {
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
  return String(contentText ?? "")
    .split(/\r?\n/)
    .map((line, index) => ({ lineNumber: index + 1, text: line }))
    .filter((row) => row.text.trim())
    .slice(0, maxRows);
}

function isSupportedMaterializeKind(kind: string): kind is ExtractorKind {
  return ["csv", "json", "jsonl", "excel", "parquet", "geojson"].includes(kind);
}

function getDataSourceRows(dataset: AnalyticsDatasetAsset) {
  return (Array.isArray(dataset.rows) && dataset.rows.length > 0 ? dataset.rows : dataset.sampleRows).filter(isRecord);
}

function analyticsMaterializeMaxRows() {
  const configured = Number(process.env.ANALYTICS_MATERIALIZE_MAX_ROWS ?? process.env.ANALYTICS_IMPORT_MAX_ROWS ?? 50000);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 50000;
}

function dataSourceMaterializeBatchLimit() {
  const configured = Number(process.env.ANALYTICS_MATERIALIZE_BATCH_LIMIT ?? 8);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 8;
}

function dataSourceFetchTimeoutMs() {
  const configured = Number(process.env.ANALYTICS_SOURCE_FETCH_TIMEOUT_MS ?? 30000);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 30000;
}

function dataSourceMaxBytes() {
  const configured = Number(process.env.ANALYTICS_SOURCE_MAX_BYTES ?? 25 * 1024 * 1024);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 25 * 1024 * 1024;
}

function analyticsSourceAllowPrivateNetworks() {
  return ["1", "true", "yes", "on"].includes(String(process.env.ANALYTICS_SOURCE_ALLOW_PRIVATE_NETWORKS ?? "").toLowerCase());
}

function isPrivateOrLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);
  return false;
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 0) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(value: string) {
  return (
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80:") ||
    value === "::" ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
