import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const workerDir = process.env.ANALYTICS_WORKER_DIR
  ? path.resolve(projectRoot, process.env.ANALYTICS_WORKER_DIR)
  : path.join(projectRoot, "workers-analytics");
const pythonBin = process.env.ANALYTICS_PYTHON_BIN
  ? path.resolve(workerDir, process.env.ANALYTICS_PYTHON_BIN)
  : path.join(workerDir, ".venv/bin/python");

if (!existsSync(pythonBin)) {
  throw new Error(`Analytics Python binary not found: ${pythonBin}. Run: cd workers-analytics && uv sync --python 3.12`);
}

const workDir = mkdtempSync(path.join(tmpdir(), "politistream-analytics-worker-smoke-"));
const inputPath = path.join(workDir, "input.json");
const artifactDir = path.join(workDir, "artifacts");

const rows = [
  { title: "Reuters confirms policy update", content: "Official agency confirmed new policy details with timeline.", source: "Reuters", url: "https://reuters.com/a", date: "2026-06-01", group: "A", category: "yes", x: 1, y: 2, count: 1, lat: 31.23, lon: 121.47 },
  { title: "AP reports policy update", content: "AP says the policy update was approved after debate.", source: "AP", url: "https://apnews.com/a", date: "2026-06-02", group: "A", category: "no", x: 2, y: 4, count: 2, lat: 31.24, lon: 121.48 },
  { title: "BBC covers policy contradiction", content: "BBC noted criticism and denied claims from opposition groups.", source: "BBC", url: "https://bbc.com/a", date: "2026-06-03", group: "B", category: "yes", x: 3, y: 5, count: 3, lat: 31.25, lon: 121.49 },
  { title: "Government official statement", content: "Official statement confirms implementation schedule.", source: "agency.gov", url: "https://agency.gov/a", date: "2026-06-04", group: "B", category: "no", x: 4, y: 9, count: 4, lat: 31.26, lon: 121.50 },
  { title: "Community says false rumor", content: "Community discussion says some rumors are false and contradicted.", source: "Reddit", url: "https://reddit.com/a", date: "2026-06-05", group: "C", category: "yes", x: 5, y: 11, count: 5, lat: 31.27, lon: 121.51 },
  { title: "Policy market analysis", content: "Market analysis covers impact, timeline, and official documents.", source: "Bloomberg", url: "https://bloomberg.com/a", date: "2026-06-06", group: "C", category: "no", x: 6, y: 13, count: 6, lat: 31.28, lon: 121.52 },
  { title: "Policy market analysis duplicate", content: "Market analysis covers impact, timeline, and official documents.", source: "Bloomberg", url: "https://bloomberg.com/b", date: "2026-06-06", group: "C", category: "yes", x: 6, y: 13, count: 7, lat: 31.28, lon: 121.52 },
  { title: "Outlier record", content: "Unusual record for anomaly detection.", source: "Blog", url: "https://blog.example/a", date: "2026-06-07", group: "D", category: "no", x: 100, y: 200, count: 8, lat: 31.29, lon: 121.53 },
];
writeFileSync(inputPath, JSON.stringify({ rows }, null, 2), "utf-8");

const checks = [
  ["profile", ["columns"]],
  ["stats", ["numericColumns", "correlations"]],
  ["quality", ["profile", "quality", "checks"]],
  ["frequency", ["kind", "tables"]],
  ["crosstab", ["tables"]],
  ["tests", ["kind", "tests"]],
  ["regression", ["model", "coefficients"]],
  ["logistic", ["model", "coefficients"]],
  ["poisson", ["model", "coefficients"]],
  ["dimension", ["kind", "pca"]],
  ["cluster", ["model", "clusterCounts"]],
  ["anomaly", ["kind", "anomalies"]],
  ["timeseries", ["kind", "timeline"]],
  ["transform", ["kind", "operations", "lineage"]],
  ["cleaning", ["kind", "lineage", "cleanedRowsPreview"]],
  ["news", ["kind", "clusters", "sourceProfiles"]],
  ["text", ["kind", "keywords"]],
  ["explain", ["kind", "featureImportances"]],
  ["deepml", ["kind", "torch", "recommendedNextSteps"]],
  ["geo", ["kind", "geojson"]],
  ["chart", ["kind", "files"]],
  ["report", ["markdown", "profile"]],
  ["export", ["kind", "files", "markdown"]],
];

try {
  for (const [command, requiredKeys] of checks) {
    const outputPath = path.join(workDir, `${command}.json`);
    const child = spawnSync(
      pythonBin,
      ["-m", "politistream_analytics.worker", command, "--input", inputPath, "--output", outputPath],
      {
        cwd: workerDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          PYTHONPATH: workerDir,
          ANALYTICS_ARTIFACT_DIR: artifactDir,
          ANALYTICS_USE_DOC_TOOLS: "false",
        },
      },
    );
    if (child.status !== 0) {
      throw new Error(`${command} failed\nstdout:\n${child.stdout}\nstderr:\n${child.stderr}`);
    }
    const result = JSON.parse(readFileSync(outputPath, "utf-8"));
    for (const key of requiredKeys) {
      if (!(key in result)) {
        throw new Error(`${command} output missing key: ${key}`);
      }
    }
    console.log(`${command}: ok`);
  }
  const artifacts = existsSync(artifactDir) ? readdirSync(artifactDir) : [];
  for (const extension of [".png", ".svg", ".pdf", ".docx", ".pptx", ".html", ".md", ".mmd", ".dot", ".json"]) {
    if (!artifacts.some((file) => file.endsWith(extension))) {
      throw new Error(`expected exported artifact with extension ${extension}`);
    }
  }
  if (!artifacts.some((file) => file.includes("plotly") && file.endsWith(".html"))) {
    throw new Error("expected Plotly HTML chart artifact");
  }
  console.log(`analytics worker smoke passed (${artifacts.length} artifacts)`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
