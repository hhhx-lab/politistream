import "dotenv/config";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";

const backendPort = Number(process.env.E2E_BACKEND_PORT || 3311);
const fixturePort = Number(process.env.E2E_FIXTURE_PORT || 3322);
const apiBase = `http://127.0.0.1:${backendPort}`;
const fixtureBase = `http://127.0.0.1:${fixturePort}`;
const redisUrl = process.env.E2E_REDIS_URL || isolatedRedisUrl(process.env.REDIS_URL);

const backendEnv = {
  ...process.env,
  BACKEND_PORT: String(backendPort),
  APP_URL: `http://localhost:${Number(process.env.E2E_FRONTEND_PORT || 3310)}`,
  RSS_REFRESH_ON_STARTUP: "false",
  RESEARCH_DOMAIN_MIN_DELAY_MS: "1",
  RESEARCH_FETCH_TIMEOUT_MS: "8000",
  RESEARCH_FETCH_MAX_ATTEMPTS: "1",
  RESEARCH_BROWSER_FETCH_ENABLED: "false",
  RESEARCH_RESPECT_ROBOTS_TXT: "false",
  RESEARCH_MEMORY_ENABLED: "false",
  RESEARCH_DISCOVERY_OFFLINE_ONLY: "true",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  REDIS_URL: redisUrl,
};

if (!backendEnv.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for research e2e smoke");
}
if (!backendEnv.REDIS_URL) {
  throw new Error("REDIS_URL is required for research e2e smoke");
}

const fixtureServer = createFixtureServer();
await listen(fixtureServer, fixturePort);

const backend = spawn("npm", ["run", "dev:backend"], {
  env: backendEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

let backendLog = "";
backend.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  backendLog += text;
  process.stdout.write(`[research-e2e backend] ${text}`);
});
backend.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  backendLog += text;
  process.stderr.write(`[research-e2e backend] ${text}`);
});

try {
  await waitForHealth(`${apiBase}/api/health`, 20000);
  await assertResearchStatus();
  const job = await createJob();
  const queued = await postJson(`${apiBase}/api/research/jobs/${job.id}/runs`, {});
  if (!queued.run?.id) throw new Error(`run was not queued: ${JSON.stringify(queued)}`);

  const runId = queued.run.id;
  const completed = await waitForRun(runId, 60000);
  if (completed.status !== "completed") {
    throw new Error(`expected completed run, got ${completed.status}/${completed.stage}`);
  }

  const [frontier, documents, evidence, report, events, queues] = await Promise.all([
    getJson(`${apiBase}/api/research/runs/${runId}/frontier`),
    getJson(`${apiBase}/api/research/runs/${runId}/documents`),
    getJson(`${apiBase}/api/research/runs/${runId}/evidence`),
    getJson(`${apiBase}/api/research/runs/${runId}`),
    getJson(`${apiBase}/api/research/runs/${runId}/events`),
    getJson(`${apiBase}/api/research/queues`),
  ]);

  assertArray(frontier.frontier, "frontier");
  assertArray(documents.documents, "documents");
  assertArray(evidence.evidence, "evidence");
  assertArray(events.events, "events");

  if (frontier.frontier.length < 1) throw new Error("expected at least one frontier item");
  if (!frontier.frontier[0].scoreBreakdown) throw new Error("frontier scoreBreakdown missing");
  if (!documents.documents.some((document) => document.status === "fetched" && document.contentText?.includes("PolitiStream fixture"))) {
    throw new Error("expected fetched fixture document with content text");
  }
  if (evidence.evidence.length < 1) throw new Error("expected evidence items");
  if (!report.report?.markdown?.includes("研究摘要")) throw new Error("expected Chinese markdown report");
  if (!events.events.some((event) => event.stage === "completed")) throw new Error("expected completed event");
  if (!Array.isArray(queues.names) || !queues.names.includes("research.discovery")) {
    throw new Error("expected queue status names");
  }

  console.log(JSON.stringify({
    status: "ok",
    jobId: job.id,
    runId,
    frontier: frontier.frontier.length,
    documents: documents.documents.length,
    evidence: evidence.evidence.length,
    events: events.events.length,
  }, null, 2));
} finally {
  backend.kill("SIGTERM");
  fixtureServer.close();
  await Promise.race([
    once(backend, "exit"),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]).catch(() => undefined);
  if (backend.exitCode === null) backend.kill("SIGKILL");
}

function createFixtureServer() {
  return createServer((req, res) => {
    const url = req.url || "/";
    if (url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (url === "/dataset.csv") {
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8" });
      res.end("tool,score\nPandoc,95\nLibreOffice,88\n");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html>
        <head>
          <title>PolitiStream fixture document conversion research</title>
          <meta name="description" content="Official fixture for document conversion tool research." />
        </head>
        <body>
          <article>
            <h1>PolitiStream fixture document conversion research</h1>
            <p>PolitiStream fixture content for document conversion tools, official sources, GitHub packages, PDF conversion, and evidence extraction.</p>
            <p>This local page is intentionally long enough for Readability extraction and research fallback evidence generation in Simplified Chinese reports.</p>
            <table>
              <caption>Fixture tool comparison</caption>
              <tr><th>Tool</th><th>Strength</th></tr>
              <tr><td>Pandoc</td><td>Markdown DOCX PDF conversion</td></tr>
              <tr><td>LibreOffice</td><td>Office document rendering</td></tr>
            </table>
            <a href="${fixtureBase}/dataset.csv">fixture dataset</a>
          </article>
        </body>
      </html>`);
  });
}

async function listen(server, port) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
}

async function waitForHealth(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling while backend starts.
    }
    await sleep(500);
  }
  throw new Error(`backend did not become healthy within ${timeoutMs}ms\n${backendLog}`);
}

async function assertResearchStatus() {
  const status = await getJson(`${apiBase}/api/research/status`);
  if (!status.storage?.ok) throw new Error(`research storage not ok: ${JSON.stringify(status.storage)}`);
  if (!status.queue?.ok) throw new Error(`research queue not ok: ${JSON.stringify(status.queue)}`);
}

async function createJob() {
  const job = await postJson(`${apiBase}/api/research/jobs`, {
    topic: "PolitiStream fixture official source smoke",
    seedUrls: [`${fixtureBase}/`],
    budget: {
      maxDepth: 1,
      maxUrlsPerRun: 5,
      maxDomainsPerRun: 2,
      runIntervalMinutes: 1440,
    },
    constraints: {
      languages: ["zh", "en"],
      contentTypes: ["html", "csv"],
      sourceScope: {
        sourceTypes: ["official"],
      },
      includeKeywords: ["document", "conversion", "fixture"],
    },
  });
  if (!job.id) throw new Error(`job creation failed: ${JSON.stringify(job)}`);
  return job;
}

async function waitForRun(runId, timeoutMs) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    latest = await getJson(`${apiBase}/api/research/runs/${runId}`);
    if (["completed", "failed", "cancelled"].includes(latest.run?.status)) {
      return latest.run;
    }
    await sleep(1000);
  }
  throw new Error(`run ${runId} did not finish within ${timeoutMs}ms; latest=${JSON.stringify(latest)}`);
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`GET ${url} failed HTTP ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`POST ${url} failed HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} should be an array`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isolatedRedisUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  const url = new URL(rawUrl);
  url.pathname = `/${process.env.E2E_REDIS_DB || "9"}`;
  return url.toString();
}
