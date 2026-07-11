import "dotenv/config";
import app, { runtime } from "./server";
import { startResearchWorkers } from "./src/server/research/workers/worker";
import { fetchAndProcessFeeds } from "./src/server/services/rss";

app.listen(runtime.port, "0.0.0.0", () => {
  console.log(`API server running on http://localhost:${runtime.port}`);
  startResearchWorkers();
  if (runtime.refreshRssOnStartup) {
    fetchAndProcessFeeds().catch(console.error);
  } else {
    console.log("RSS startup refresh disabled. Use POST /api/refresh to fetch feeds.");
  }
});
