import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import {
  addRSSSource,
  getFavorites,
  getNews,
  getNewsWithoutSummary,
  initDb,
  setRSSSourceEnabled,
  toggleFavorite,
} from "./src/server/db";
import {
  analyzeSingleItem,
  fetchAndProcessFeeds,
  getRSSSources,
  processMissingSummaries,
  refreshRSSSource,
} from "./src/server/services/rss";
import { sendResearchConfigStatus } from "./src/server/research/http";
import { createResearchRouter } from "./src/server/research/routes";

// ... (rest of imports)

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Database
initDb();

app.post("/api/refresh-ai", async (req, res) => {
  try {
    const batchSize = parseInt(req.query.batchSize as string) || 20;
    console.log(`Triggering AI re-analysis with batch size ${batchSize}...`);
    const count = await processMissingSummaries(batchSize);
    res.json({ success: true, processedCount: count });
  } catch (error) {
    console.error("Error reprocessing AI summaries:", error);
    res.status(500).json({ error: "Failed to reprocess AI summaries" });
  }
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/research/status", sendResearchConfigStatus);
app.use("/api/research", createResearchRouter());

function sendRSSSourceError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "rss_source_url_exists") {
    return res.status(409).json({ error: message });
  }
  if (message === "rss_source_not_found") {
    return res.status(404).json({ error: message });
  }
  if ([
    "invalid_rss_source_url",
    "rss_source_name_required",
    "rss_source_disabled",
  ].includes(message)) {
    return res.status(400).json({ error: message });
  }
  console.error("RSS source API error:", error);
  return res.status(500).json({ error: "rss_source_request_failed" });
}

app.get("/api/feeds", (req, res) => {
  try {
    res.json(getRSSSources());
  } catch (error) {
    sendRSSSourceError(res, error);
  }
});

app.post("/api/feeds", (req, res) => {
  try {
    const source = addRSSSource({
      name: String(req.body.name ?? ""),
      url: String(req.body.url ?? ""),
    });
    res.status(201).json(source);
  } catch (error) {
    sendRSSSourceError(res, error);
  }
});

app.patch("/api/feeds/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_rss_source_id" });
    const enabled = Boolean(req.body.enabled);
    const source = setRSSSourceEnabled(id, enabled);
    if (!source) return res.status(404).json({ error: "rss_source_not_found" });
    res.json(source);
  } catch (error) {
    sendRSSSourceError(res, error);
  }
});

app.post("/api/feeds/:id/refresh", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_rss_source_id" });
    const result = await refreshRSSSource(id);
    res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    sendRSSSourceError(res, error);
  }
});

app.get("/api/news", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const news = getNews(limit, offset);
    res.json(news);
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

app.get("/api/news/pending", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const news = getNewsWithoutSummary(limit);
    res.json(news);
  } catch (error) {
    console.error("Error fetching pending news:", error);
    res.status(500).json({ error: "Failed to fetch pending news" });
  }
});

app.get("/api/favorites", (req, res) => {
  try {
    const favorites = getFavorites();
    res.json(favorites);
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

app.post("/api/news/:id/analyze", async (req, res) => {
  try {
    const { id } = req.params;
    const item = getNews().find(n => n.id === Number(id));
    
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const result = await analyzeSingleItem(Number(id));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error analyzing item:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to analyze item" });
  }
});

app.post("/api/news/:id/favorite", (req, res) => {
  try {
    const { id } = req.params;
    const { isFavorite } = req.body;
    toggleFavorite(Number(id), isFavorite);
    res.json({ success: true });
  } catch (error) {
    console.error("Error toggling favorite:", error);
    res.status(500).json({ error: "Failed to toggle favorite" });
  }
});

app.post("/api/refresh", async (req, res) => {
  try {
    console.log("Triggering manual refresh...");
    const count = await fetchAndProcessFeeds();
    res.json({ success: true, newItems: count });
  } catch (error) {
    console.error("Error refreshing feeds:", error);
    res.status(500).json({ error: "Failed to refresh feeds" });
  }
});

// Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving would go here
    // app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Initial fetch on startup
    fetchAndProcessFeeds().catch(console.error);
  });
}

startServer();
