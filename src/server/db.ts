import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = "news.db";
let db: Database.Database;

try {
  db = new Database(dbPath);
  // Quick check to see if it's valid
  db.prepare("SELECT 1").run();
} catch (error) {
  console.error("Database corrupted, recreating...", error);
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  db = new Database(dbPath);
}

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');

export interface NewsItem {
  id?: number;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  contentSnippet: string;
  summary?: string;
  sentiment?: number;
  entities?: string; // JSON string of array
  processed: number; // boolean 0 or 1
  is_favorite?: number; // boolean 0 or 1
}

export interface RSSSource {
  id: number;
  name: string;
  url: string;
  enabled: number;
  is_default: number;
  last_fetched_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RSSSourceInput {
  name: string;
  url: string;
  enabled?: boolean;
  isDefault?: boolean;
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      link TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      pubDate TEXT,
      contentSnippet TEXT,
      summary TEXT,
      sentiment REAL,
      entities TEXT,
      processed INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create index on pubDate for faster sorting/pagination
  db.exec("CREATE INDEX IF NOT EXISTS idx_pubDate ON news(pubDate DESC)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS rss_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      last_fetched_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_rss_sources_enabled ON rss_sources(enabled)");
}

export function normalizeRSSSourceUrl(url: string) {
  const trimmed = url.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("invalid_rss_source_url");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("invalid_rss_source_url");
  }

  return parsed.toString();
}

function normalizeRSSSourceName(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("rss_source_name_required");
  }
  return normalized;
}

function mapRSSSource(row: any): RSSSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    is_default: row.is_default,
    last_fetched_at: row.last_fetched_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listRSSSources(includeDisabled = true) {
  const stmt = includeDisabled
    ? db.prepare("SELECT * FROM rss_sources ORDER BY is_default DESC, name ASC")
    : db.prepare("SELECT * FROM rss_sources WHERE enabled = 1 ORDER BY is_default DESC, name ASC");
  return stmt.all().map(mapRSSSource);
}

export function getRSSSourceById(id: number) {
  const row = db.prepare("SELECT * FROM rss_sources WHERE id = ?").get(id);
  return row ? mapRSSSource(row) : null;
}

export function addRSSSource(input: RSSSourceInput) {
  const name = normalizeRSSSourceName(input.name);
  const url = normalizeRSSSourceUrl(input.url);

  try {
    const info = db.prepare(`
      INSERT INTO rss_sources (name, url, enabled, is_default)
      VALUES (?, ?, ?, ?)
    `).run(name, url, input.enabled === false ? 0 : 1, input.isDefault ? 1 : 0);

    return getRSSSourceById(Number(info.lastInsertRowid));
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("rss_source_url_exists");
    }
    throw error;
  }
}

export function seedRSSSources(sources: RSSSourceInput[]) {
  const stmt = db.prepare(`
    INSERT INTO rss_sources (name, url, enabled, is_default)
    VALUES (?, ?, 1, 1)
    ON CONFLICT(url) DO UPDATE SET
      name = CASE WHEN rss_sources.is_default = 1 THEN excluded.name ELSE rss_sources.name END,
      is_default = CASE WHEN rss_sources.is_default = 1 THEN 1 ELSE rss_sources.is_default END,
      updated_at = CURRENT_TIMESTAMP
  `);

  const seed = db.transaction((items: RSSSourceInput[]) => {
    for (const source of items) {
      const name = normalizeRSSSourceName(source.name);
      const url = normalizeRSSSourceUrl(source.url);
      stmt.run(name, url);
    }
  });

  seed(sources);
  return listRSSSources();
}

export function setRSSSourceEnabled(id: number, enabled: boolean) {
  db.prepare(`
    UPDATE rss_sources
    SET enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enabled ? 1 : 0, id);
  return getRSSSourceById(id);
}

export function updateRSSSourceRefreshState(id: number, state: { fetchedAt?: string; error?: string | null }) {
  db.prepare(`
    UPDATE rss_sources
    SET last_fetched_at = COALESCE(?, last_fetched_at),
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(state.fetchedAt ?? null, state.error ?? null, id);
  return getRSSSourceById(id);
}

export function addNewsItem(item: Omit<NewsItem, "id" | "processed" | "is_favorite">) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO news (title, link, source, pubDate, contentSnippet, summary, sentiment, entities, processed, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  
  const info = stmt.run(
    item.title,
    item.link,
    item.source,
    item.pubDate,
    item.contentSnippet,
    item.summary || null,
    item.sentiment || 0,
    item.entities || "[]",
    0 // processed default to 0
  );
  
  return info.changes > 0 ? info.lastInsertRowid : null;
}

export function getNews(limit = 100, offset = 0) {
  const stmt = db.prepare("SELECT * FROM news ORDER BY pubDate DESC LIMIT ? OFFSET ?");
  return stmt.all(limit, offset) as NewsItem[];
}

export function getFavorites() {
  const stmt = db.prepare("SELECT * FROM news WHERE is_favorite = 1 ORDER BY pubDate DESC");
  return stmt.all() as NewsItem[];
}

export function getNewsWithoutSummary(limit = 50) {
  const stmt = db.prepare("SELECT * FROM news WHERE summary IS NULL OR summary = '' ORDER BY pubDate DESC LIMIT ?");
  return stmt.all(limit) as NewsItem[];
}

export function toggleFavorite(id: number, isFavorite: boolean) {
  const stmt = db.prepare("UPDATE news SET is_favorite = ? WHERE id = ?");
  stmt.run(isFavorite ? 1 : 0, id);
}

export function updateNewsItemAnalysis(id: number, summary: string, sentiment: number, entities: string[]) {
    const stmt = db.prepare(`
        UPDATE news 
        SET summary = ?, sentiment = ?, entities = ?, processed = 1
        WHERE id = ?
    `);
    stmt.run(summary, sentiment, JSON.stringify(entities), id);
}

export function updateNewsContent(id: number, content: string) {
  const stmt = db.prepare("UPDATE news SET contentSnippet = ? WHERE id = ?");
  stmt.run(content, id);
}
