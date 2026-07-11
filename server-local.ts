import "dotenv/config";
import app, { runtime } from "./server";
import { sendResearchConfigStatus } from "./src/server/research/http";
import { createResearchRouter } from "./src/server/research/routes";
import { startResearchWorkers } from "./src/server/research/workers/worker";
import { createAnalyticsCompatibilityRouter, createAnalyticsRouter } from "./src/server/analytics/routes";
import { createNewsAnalysisRouter } from "./src/server/analytics/newsAnalysis";
import { createAgentRouter } from "./src/server/agent/routes";
import { fetchAndProcessFeeds } from "./src/server/services/rss";

app.get("/api/research/status", sendResearchConfigStatus);
app.use("/api/research", createResearchRouter());
app.use("/api/analytics", createAnalyticsRouter());
app.use("/api", createAnalyticsCompatibilityRouter());
app.use("/api/news-analysis", createNewsAnalysisRouter());
app.use("/api/agent", createAgentRouter());

app.listen(runtime.port, "0.0.0.0", () => {
  console.log(`API server running on http://localhost:${runtime.port}`);
  startResearchWorkers();
  if (runtime.refreshRssOnStartup) {
    fetchAndProcessFeeds().catch(console.error);
  } else {
    console.log("RSS startup refresh disabled. Use POST /api/refresh to fetch feeds.");
  }
});
