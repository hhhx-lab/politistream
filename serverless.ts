import express from "express";
import {
  addRSSSource,
  getFavorites,
  getNews,
  getNewsWithoutSummary,
  initDb,
  setRSSSourceEnabled,
  toggleFavorite,
} from "./src/server/db.js";
import {
  getServerlessRSSSources,
  refreshServerlessFeeds,
  refreshServerlessRSSSource,
} from "./src/server/services/rssServerless.js";
import { getServerRuntimeConfig } from "./src/server/runtime.js";

const app = express();
const runtime = getServerRuntimeConfig();

app.use(express.json({ limit: "25mb" }));
initDb();

app.get("/api/health", (_req, res) => res.json({ status: "ok", mode: "serverless_demo" }));
app.get("/api/runtime/status", (_req, res) => {
  res.json({ api: "ok", port: runtime.port, appUrl: runtime.appUrl, serverlessDemo: true });
});
app.get("/api/research/status", (_req, res) => {
  res.status(503).json({
    ok: false,
    mode: "serverless_demo",
    error: "research_worker_requires_postgres_redis_and_a_persistent_runtime",
  });
});

app.get("/api/feeds", (_req, res) => res.json(getServerlessRSSSources()));
app.post("/api/feeds", (req, res) => {
  try {
    res.status(201).json(addRSSSource({ name: String(req.body.name || ""), url: String(req.body.url || "") }));
  } catch (error) {
    sendRSSSourceError(res, error);
  }
});
app.patch("/api/feeds/:id", (req, res) => {
  const source = setRSSSourceEnabled(Number(req.params.id), Boolean(req.body.enabled));
  if (!source) return res.status(404).json({ error: "rss_source_not_found" });
  res.json(source);
});
app.post("/api/feeds/:id/refresh", async (req, res) => {
  try {
    const result = await refreshServerlessRSSSource(Number(req.params.id));
    res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    sendRSSSourceError(res, error);
  }
});
app.get("/api/news", (req, res) => res.json(getNews(Number(req.query.limit) || 100, Number(req.query.offset) || 0)));
app.get("/api/news/pending", (req, res) => res.json(getNewsWithoutSummary(Number(req.query.limit) || 50)));
app.get("/api/favorites", (_req, res) => res.json(getFavorites()));
app.post("/api/news/:id/favorite", (req, res) => {
  toggleFavorite(Number(req.params.id), Boolean(req.body.isFavorite));
  res.json({ success: true });
});
app.post("/api/refresh", async (_req, res) => res.json(await refreshServerlessFeeds()));

const unavailable = (_req: express.Request, res: express.Response) => {
  res.status(503).json({ error: "This capability requires the local PolitiStream worker runtime.", mode: "serverless_demo" });
};
app.post("/api/refresh-ai", unavailable);
app.post("/api/news/:id/analyze", unavailable);
app.use("/api/research", unavailable);
app.use("/api/analytics", unavailable);
app.use("/api/news-analysis", unavailable);
app.use("/api/agent", unavailable);

function sendRSSSourceError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = ["invalid_rss_source_url", "rss_source_name_required", "rss_source_disabled"].includes(message)
    ? 400
    : message === "rss_source_url_exists"
      ? 409
      : 500;
  return res.status(status).json({ error: message });
}

export default app;
