## Context

PolitiStream is currently a TypeScript monolith that combines Express APIs, Vite development middleware, React UI, RSS ingestion, Gemini analysis, and a local SQLite database. The ingestion flow is source-list driven: `src/server/services/rss.ts` pulls predefined RSS feeds, stores news rows in `news.db`, and optionally analyzes missing summaries.

The target product is a general research crawler platform. A user provides a topic or seed site, and the system continuously discovers URLs, crawls public pages, scores relevance, extracts evidence, and generates a Markdown report. This requires durable job state, asynchronous execution, provider abstraction, and a new UI surface while keeping the existing RSS news flow usable.

## Goals / Non-Goals

**Goals:**

- Introduce research jobs with lifecycle state, crawl budgets, schedules, and generated reports.
- Add active web discovery through Brave Search API, SerpApi, and Tavily.
- Add queue-backed `search`, `crawl`, `analyze`, and `report` pipelines.
- Store research jobs, candidates, documents, evidence, and reports in Postgres.
- Keep the existing RSS endpoints and news UI working during the first version.

**Non-Goals:**

- Do not build a distributed crawler cluster in the first version.
- Do not remove the existing RSS news feature.
- Do not implement login bypass, paywall cracking, CAPTCHA evasion, or ban evasion.
- Do not require DOCX/PDF export in the first version.

## Decisions

### Use Postgres for research data and keep SQLite compatibility for current news

Research crawler state needs relational joins, durable status transitions, and report/evidence history. Postgres becomes the storage layer for new research capabilities. The existing SQLite-backed news flow remains available during the first version so the migration does not block the current product.

Alternative considered: migrate all existing news data immediately. This was rejected because it increases migration risk before the research pipeline is proven.

### Use Redis/BullMQ for background pipelines

Search, crawl, analyze, and report steps are long-running and retryable. BullMQ on Redis provides named queues, retries, delayed jobs, and concurrency controls while fitting the current Node/TypeScript stack.

Alternative considered: run all jobs inside Express request handlers. This was rejected because full-web expansion and AI analysis can exceed request lifetimes and would make failures hard to resume.

### Use provider abstraction for search discovery

Search providers return different shapes. The system will normalize Brave, SerpApi, and Tavily responses into a `SearchCandidate` shape before dedupe and enqueue. Missing API keys disable only the affected provider.

Alternative considered: build only one provider first. This was rejected because the plan explicitly requires high-strength discovery through a provider combination.

### Use budgeted whole-web expansion

The crawler may follow cross-domain links discovered from search results and crawled pages, but each job run is constrained by default budgets: `maxDepth=3`, `maxUrlsPerRun=300`, `maxDomainsPerRun=50`, and `runInterval=60min`.

Alternative considered: domain-only crawling. This was rejected because the requested product shape is full-web expansion, not just site crawling.

### Generate reports from stored evidence, not raw model memory

Reports are generated from `EvidenceItem` records linked to source documents. This keeps reports traceable to original URLs and allows regeneration when report prompts change.

Alternative considered: ask the model to summarize all crawled text directly. This was rejected because it weakens provenance and makes large jobs harder to audit.

## Risks / Trade-offs

- Search provider quota exhaustion -> Disable exhausted providers for the run, record provider errors, and continue with remaining providers.
- Crawl runaway from full-web expansion -> Enforce per-run depth, URL, domain, and interval budgets before enqueueing.
- Postgres/Redis missing in local development -> Research APIs return explicit configuration errors while legacy RSS APIs continue working.
- AI response parse failures -> Store documents and mark analysis/report state as failed or pending, so retry remains possible.
- Existing product regression -> Keep current RSS endpoints and UI behavior, and add regression checks around `/api/news`, `/api/feeds`, favorites, and manual refresh.

## Migration Plan

1. Add Postgres and Redis configuration with explicit environment variables.
2. Add research tables and queue scaffolding without removing SQLite.
3. Add research APIs and worker entrypoints behind new routes.
4. Add frontend research views while keeping the existing news stream visible.
5. Validate with mocked providers and a manual research job run.

Rollback strategy: disable research routes/workers by omitting `DATABASE_URL` or `REDIS_URL`; existing SQLite RSS endpoints remain available.

## Open Questions

None for the first implementation pass. Later versions can decide whether to migrate legacy news data into Postgres and whether to add DOCX/PDF export.
