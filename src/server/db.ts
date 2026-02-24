import Database from "better-sqlite3";
import path from "path";

const db = new Database("news.db");

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  try {
    db.exec("ALTER TABLE news ADD COLUMN is_favorite INTEGER DEFAULT 0");
  } catch (e) {
    // Column likely already exists
  }
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

export function getNews(limit = 500) {
  const stmt = db.prepare("SELECT * FROM news ORDER BY pubDate DESC LIMIT ?");
  return stmt.all(limit) as NewsItem[];
}

export function getFavorites() {
  const stmt = db.prepare("SELECT * FROM news WHERE is_favorite = 1 ORDER BY pubDate DESC");
  return stmt.all() as NewsItem[];
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
