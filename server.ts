import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { initDb, getNews, addNewsItem, toggleFavorite, getFavorites } from "./src/server/db";
import { fetchAndProcessFeeds, FEEDS } from "./src/server/services/rss";

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Database
initDb();

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/feeds", (req, res) => {
  res.json(FEEDS);
});

app.get("/api/news", (req, res) => {
  try {
    const news = getNews();
    res.json(news);
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
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
    
    // Schedule periodic fetch every 5 minutes (300000 ms)
    setInterval(() => {
      console.log("Running scheduled feed refresh...");
      fetchAndProcessFeeds().catch(console.error);
    }, 300000);
  });
}

startServer();
