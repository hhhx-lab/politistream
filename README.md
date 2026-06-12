# PolitiStream

<div align="center">

**A deep-research command center for web evidence, RSS intelligence, source exploration, and data analysis.**

![Web App](https://img.shields.io/badge/Web%20App-React%20%2B%20Vite-2563eb)
![Research](https://img.shields.io/badge/Research-Provider%20Registry-7c3aed)
![Crawler](https://img.shields.io/badge/Crawler-Frontier%20Queue-c2410c)
![Analytics](https://img.shields.io/badge/Analytics-Data%20Lab-059669)
![AI](https://img.shields.io/badge/AI-GPT%20Compatible-111827)

`npm install && cp .env.example .env && npm run start:all`

</div>

> PolitiStream turns a research question into a visible operating loop: planned searches, discovered sources, prioritized crawling, extracted evidence, source quality signals, and analysis-ready datasets.

PolitiStream is not just an RSS reader and not just a search box. It is a local-first research workbench built with React, Express, Postgres, Redis/BullMQ, SQLite, and a Python analytics lane. It is designed for users who need to investigate topics, trace news, inspect sources, collect data assets, and convert messy web material into structured evidence and charts.

The current project is best classified as a **web application** with two strong secondary identities: **agent system** and **data analytics project**.

## The 30-Second Version

| You need | PolitiStream gives you |
|---|---|
| A topic to investigate | Research jobs with Quick, Standard, and Deep budgets |
| Reliable source discovery | Web search, RSS, sitemap, archive, data catalog, package, academic, and sports/data providers |
| A visible crawler process | Run timeline, provider calls, frontier scoring, documents, links, tables, assets, and failures |
| Evidence instead of loose summaries | Claims, evidence items, source profiles, relations, and a final Markdown report |
| Data analysis after crawling | Data Lab datasets, profiling, statistics, modeling, visualizations, and report artifacts |
| A single local startup path | `npm run start:all` for Docker infra, backend, workers, and frontend |

## Why It Feels Different

| Usual path | PolitiStream path |
|---|---|
| Search manually, copy links, lose context | Create a run and keep source discovery, frontier state, documents, and reports together |
| Read a final AI answer with no process | Inspect query plans, provider logs, run events, source profiles, and evidence links |
| Treat data sources as random URLs | Export provider and frontier candidates into Data Lab source assets |
| Put every feature on one crowded page | Navigate dedicated workspaces: Search Home, Agent Console, Research Jobs, Data Lab, RSS Monitoring, Saved Library, AI Work Queue |
| Mix local runtime state with hidden assumptions | Use explicit `.env`, `/api/research/status`, `/api/analytics/status`, and smoke tests |

## Capability Matrix

| Capability | What it does | Main files |
|---|---|---|
| Search-first home | Creates research jobs from a topic, seed URLs, budget, and constraints | `src/App.tsx` |
| RSS monitoring | Stores default and user-added feeds, refreshes them, and analyzes missing summaries | `src/server/services/rss.ts`, `src/server/db.ts` |
| GPT-compatible AI layer | Uses `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` for summaries, evidence, planning, and reports | `src/server/services/ai.ts`, `src/server/services/llm.ts` |
| Discovery provider registry | Normalizes candidates from web search, RSS, sitemap, archive, GitHub, npm, PyPI, CKAN, Socrata, ArcGIS, Kaggle, FRED, OpenAlex, Crossref, and sports/data sources | `src/server/research/discovery/registry.ts` |
| Priority frontier | Scores and queues URLs by relevance, authority, original-source probability, freshness, diversity, and link context | `src/server/research/frontier/queue.ts` |
| Worker lifecycle | Runs research through discovery, frontier, fetch, extract, analyze, and report stages with Redis/BullMQ | `src/server/research/workers/worker.ts` |
| Multi-content extraction | Extracts HTML, PDF text, structured tables, links, assets, and metadata | `src/server/research/extractors/*` |
| Source explorer | Shows documents, excerpts, diagnostics, assets, tables, links, failure reasons, and claim references | `src/components/research/SourceExplorerPanel.tsx` |
| Evidence graph | Stores claims, evidence, source profiles, credibility signals, and relations | `src/server/research/evidence/graph.ts` |
| Data Lab | Profiles datasets, materializes research data sources, runs analytics jobs, renders charts, and saves artifacts | `src/server/analytics/*`, `src/components/DataLab.tsx` |
| Agent console | Routes natural language tasks into Research, Analytics, and Visualization actions | `src/server/agent/routes.ts`, `src/components/AgentConsole.tsx` |
| Bilingual UI | Defaults to Simplified Chinese UI and supports one-click English switching | `src/i18n.ts` |

## Workflow

```text
Research topic / seed URLs
  |
  v
Query planner
  |
  v
Discovery provider registry
  |
  v
Priority frontier queue
  |
  v
Fetcher with robots, retry, rate limit, and browser fallback
  |
  v
Extractor router for HTML, PDF, links, tables, and raw assets
  |
  v
Evidence, claims, source profiles, and credibility signals
  |
  v
Simplified Chinese report + Source Explorer + Data Lab export
```

## Preview

| Workspace | What you can do |
|---|---|
| Search Home | Start a Quick, Standard, or Deep research run from one topic |
| Agent Console | Ask for a research, analytics, or visualization task in plain language |
| Research Jobs | Watch run timeline, query plan, frontier, source explorer, evidence table, graph, provider panel, and final report |
| Data Lab | Import rows, materialize research data-source candidates, run statistics, modeling, charts, and reports |
| RSS Monitoring | Add, disable, refresh, and inspect RSS feeds |
| Saved Library | Keep important news items |
| AI Work Queue | Process news items that still need AI summaries |

## Quick Start

```bash
npm install
cp .env.example .env
npm run start:all
```

Open the app:

```text
http://localhost:3000
```

The backend runs on:

```text
http://localhost:3001
```

`npm run start:all` will:

1. Load `.env`.
2. Create runtime data directories under `.data`.
3. Start local Postgres and Redis from `docker-compose.yml`.
4. Optionally start local Crawl4AI when `CRAWL4AI_URL` points to localhost.
5. Start the Express backend and Research workers.
6. Start the Vite frontend.
7. Wait for health checks.

If you already manage infrastructure yourself:

```bash
npm run start:all -- --skip-infra
```

If Docker Hub cannot pull Crawl4AI or you do not need it:

```bash
npm run start:all -- --skip-crawl4ai
```

## Minimum Configuration

RSS-only mode can run with very little configuration.

Full deep research needs:

```env
DATABASE_URL="postgres://politistream:politistream@localhost:15432/politistream"
REDIS_URL="redis://localhost:16379"
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY=""
AI_MODEL="gpt-5.4"
SERPAPI_API_KEY=""
TAVILY_API_KEY=""
NEWSAPI_KEY=""
```

Data Lab and provider enrichment can also use:

```env
GITHUB_TOKEN=""
FRED_API_KEY=""
KAGGLE_API_TOKEN=""
CRAWL4AI_URL=""
FIRECRAWL_API_KEY=""
BROWSERLESS_URL=""
ANALYTICS_WORKER_DIR="workers-analytics"
ANALYTICS_PYTHON_BIN=".venv/bin/python"
```

See `.env.example` for the full annotated environment template. Real secrets belong in `.env`, never in source code.

## Research Budgets

| Mode | URL budget | Depth | Domain budget | Best for |
|---|---:|---:|---:|---|
| Quick | 30 | 1 | 10 | Fast orientation and first-pass source discovery |
| Standard | 150 | 2 | 40 | Normal market, news, policy, or tool research |
| Deep | 500 | 3 | 100 | Broader source mapping and data-source exploration |

Discovery is bounded and observable. The run emits progress events, query fan-out can be capped with `RESEARCH_DISCOVERY_QUERY_LIMIT`, and provider concurrency can be tuned with `RESEARCH_DISCOVERY_PROVIDER_CONCURRENCY`.

## Typical Use Cases

### Trace a news event

Use Research Jobs to generate multiple query purposes, inspect mainstream and primary sources, compare source profiles, and read the final report with evidence links.

### Research a software or tool category

Use provider discovery, GitHub, npm, PyPI, technical documentation, benchmark-oriented queries, and community sources to compare tools and evidence.

### Build a data-source map

Run a topic, open Provider Panel, export data-source candidates to Data Lab, then materialize CSV, JSON, API, or table-like sources into datasets.

### Analyze crawled material

Export research documents into Data Lab to run story clustering, event timelines, source-quality analysis, descriptive statistics, regression, clustering, visualization, and report generation.

## Data Lab

Data Lab is the analytics lane for material collected by Research or imported by the user.

It supports:

- dataset creation from JSON rows;
- file import through extractor logic;
- research document export;
- research data-source registry export;
- data-source materialization and refresh;
- schema profiling and data quality hints;
- descriptive statistics and correlation;
- frequency tables and crosstabs;
- statistical tests;
- regression, logistic regression, Poisson regression;
- PCA, factor analysis, clustering, anomaly detection, time series;
- news clustering, text analysis, explainability, geospatial analysis;
- chart rendering and reproducible visualization specs;
- Markdown, HTML, DOCX, PDF, PPTX, JSON, PNG, SVG, and Plotly-style artifacts when the worker environment is available.

Python worker setup:

```bash
cd workers-analytics
uv sync --python 3.12
uv sync --extra ml --extra reports --python 3.12
```

Do not use `sudo pip` or mix system Python, Homebrew Python, and project worker environments.

## API Surface

Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend health check |
| `GET` | `/api/runtime/status` | Runtime status |
| `GET` | `/api/research/status` | Research storage, queue, AI, and provider status |
| `POST` | `/api/research/jobs` | Create a research job |
| `POST` | `/api/research/jobs/:id/run` | Compatibility entry to create and queue a run |
| `POST` | `/api/research/jobs/:id/runs` | Create and queue a run |
| `GET` | `/api/research/runs/:runId/events` | Run timeline events |
| `GET` | `/api/research/runs/:runId/frontier` | Frontier items and scores |
| `GET` | `/api/research/runs/:runId/documents` | Crawled documents and excerpts |
| `GET` | `/api/research/runs/:runId/search?q=` | Full-text search within run documents |
| `GET` | `/api/research/runs/:runId/evidence` | Claims and evidence |
| `GET` | `/api/research/runs/:runId/graph` | Evidence graph |
| `GET` | `/api/research/runs/:runId/providers` | Provider call records |
| `POST` | `/api/analytics/datasets/from-research-run/:runId/data-sources` | Export research data-source candidates to Data Lab |
| `POST` | `/api/analytics/datasets/:id/materialize-source` | Fetch one data source into a dataset |
| `POST` | `/api/analytics/datasets/:id/analyze` | Run a Data Lab analysis job |
| `POST` | `/api/analytics/visualizations/render` | Create a visualization artifact |
| `GET` | `/api/feeds` | List RSS sources |
| `POST` | `/api/feeds` | Add an RSS source |
| `POST` | `/api/refresh` | Refresh enabled RSS sources |
| `POST` | `/api/news/:id/analyze` | Fetch and re-analyze one news item |
| `POST` | `/api/agent/dispatch` | Dispatch a natural-language task |

## Repository Layout

```text
.
|-- README.md
|-- package.json
|-- server.ts
|-- vite.config.ts
|-- docker-compose.yml
|-- scripts/
|   |-- start-all.mjs
|   |-- check-postgres.ts
|   |-- research-e2e-smoke.mjs
|   `-- ui-smoke.mjs
|-- src/
|   |-- App.tsx
|   |-- i18n.ts
|   |-- components/
|   |   |-- AgentConsole.tsx
|   |   |-- DataLab.tsx
|   |   |-- ResearchPanel.tsx
|   |   |-- RSSSourceManager.tsx
|   |   |-- data-lab/
|   |   `-- research/
|   `-- server/
|       |-- db.ts
|       |-- runtime.ts
|       |-- agent/
|       |-- analytics/
|       |-- research/
|       `-- services/
|-- workers-analytics/
|   |-- pyproject.toml
|   `-- politistream_analytics/
|-- docs/
|-- plan/
|-- openspec/
|-- issues/
`-- .env.example
```

## Scripts

```bash
npm run start:all              # Full local startup
npm run dev                    # Start backend and frontend dev servers
npm run dev:backend            # Backend only
npm run dev:frontend           # Frontend only
npm run lint                   # TypeScript noEmit check
npm run build                  # Vite production build
npm run test                   # Runtime, research, analytics, worker, agent, i18n, and UI tests
npm run test:research          # Research unit/smoke tests
npm run test:analytics-worker  # Python worker smoke test
npm run test:ui                # Playwright UI smoke
npm run check:postgres         # Validate Postgres config and schema
npm run benchmark:research     # Offline research benchmark
```

## Outputs

PolitiStream can produce:

- RSS news records in SQLite;
- Markdown archives for analyzed news;
- research jobs, runs, events, candidates, frontier items, documents, assets, tables, links, source profiles, evidence, and reports in Postgres;
- raw research assets under `.data/research-assets`;
- Data Lab datasets, jobs, and artifacts;
- chart, report, and export files under `.data/analytics-artifacts`;
- UI-visible run diagnostics, provider health, and queue state.

## Validation

Recommended before committing:

```bash
npm run lint
npm run test:research
npm run build
```

Full validation:

```bash
npm run test
```

## Troubleshooting

| Symptom | Check first |
|---|---|
| Research cannot start | `/api/research/status`, `DATABASE_URL`, `REDIS_URL`, and at least one search provider key |
| Run looks stuck in discovery | Run Timeline, Provider Panel, `RESEARCH_DISCOVERY_QUERY_LIMIT`, `RESEARCH_DISCOVERY_PROVIDER_CONCURRENCY` |
| Provider returns 429 or TLS errors | Lower concurrency, reduce active queries, switch provider, or retry later |
| Crawl4AI blocks startup | Use `npm run start:all -- --skip-crawl4ai` |
| Data Lab worker features are missing | Check `workers-analytics/.venv` and `ANALYTICS_PYTHON_BIN` |
| Source Explorer has no documents | The run may not have reached fetch/extract, or frontier items may have failed |
| Evidence graph is sparse | The run needs extracted document text and a successful analyze/report stage |

## Boundaries

PolitiStream is built for legitimate research, source review, public-web collection, and data analysis.

It does not provide:

- paywall bypass;
- CAPTCHA bypass;
- credential stuffing;
- private-network probing;
- unauthorized scraping;
- hidden deployment guarantees;
- legal, medical, or financial advice.

The crawler is designed to respect robots.txt, rate limits, retries, and budget constraints. Data quality still depends on source availability, provider limits, extraction success, and user-defined research scope.

## Known Limits

- Deep research depends on Postgres, Redis/BullMQ, search providers, and external network reliability.
- Discovery can still take time in Deep mode because provider latency and rate limits are real.
- RSS batch refresh is intentionally conservative about full-text fetching to keep initial refresh fast.
- Single-news analysis still uses a table scan path that should be replaced by `getNewsById()` as data volume grows.
- `news.db` currently exists in the repository history; runtime database files should eventually move out of version control.
- The UI exposes many advanced capabilities, but serious verification still requires reading run events, source diagnostics, and evidence links.

## Reading Path

- `docs/deep-research-crawler-upgrade-plan.md`
- `docs/data-processing-analytics-visualization-platform-plan-2026-06-07.md`
- `docs/data-lab-spss-plus-ai-visualization-upgrade-plan-2026-06-07.md`
- `docs/data-processing-analytics-visualization-publication-plan-2026-06-07.md`
- `docs/strong-crawler-tooling-research-2026-06-07.md`
- `docs/frontend-backend-crawler-architecture.md`

## Star This If

Star this repo if you want a local research cockpit that keeps search, crawling, evidence, source quality, and analytics in one inspectable workflow instead of scattering them across tabs, spreadsheets, and one-off AI chats.

## License

This repository does not currently include a `LICENSE` file. Add one before publishing it as an open-source project.
