## Why

PolitiStream currently depends on a fixed RSS feed list, which is useful for known-source monitoring but cannot satisfy user-driven research where a topic or seed site should trigger continuous web discovery, crawling, analysis, evidence collection, and report generation.

This change upgrades the project from a local RSS news prototype into a general research crawler platform while preserving the existing news stream as a compatibility surface.

## What Changes

- Add user-created research jobs with topic, seed URLs, query expansion, crawl budget, schedule, status, and report state.
- Add active discovery through Brave Search API, SerpApi, and Tavily, with provider-level degradation when one API key is unavailable.
- Add Redis/BullMQ-backed background pipelines for `search`, `crawl`, `analyze`, and `report` work.
- Add Postgres as the durable storage layer for research jobs, search candidates, crawled documents, evidence items, and generated reports.
- Add bounded whole-web expansion from search results and extracted links, constrained by default depth, URL, domain, and interval budgets.
- Add AI relevance analysis, evidence extraction, and Markdown report generation for each research job.
- Add research-job APIs and frontend views for job management, evidence browsing, and report viewing.
- Preserve the current RSS news flow; it may run as a legacy/default job or remain behind the existing endpoints during the first version.

## Capabilities

### New Capabilities

- `research-jobs`: User-created research jobs, lifecycle controls, budgets, schedules, and job status.
- `web-discovery`: Query planning, search provider orchestration, candidate URL normalization, and provider degradation.
- `crawl-pipeline`: Queue-backed crawling, URL/content deduplication, page extraction, link expansion, and crawl status tracking.
- `research-analysis`: AI relevance scoring, evidence extraction, entity extraction, and analysis failure handling.
- `research-reporting`: Markdown report generation and retrieval from analyzed evidence.

### Modified Capabilities

- None. There are no existing OpenSpec capabilities in this repository.

## Impact

- Affected backend entry points: `server.ts`, `src/server/services/rss.ts`, `src/server/services/ai.ts`, `src/server/db.ts`.
- Affected frontend areas: `src/App.tsx`, `src/components/*`, and new research job/evidence/report views.
- New APIs: `/api/research-jobs`, `/api/research-jobs/:id`, `/api/research-jobs/:id/run`, `/api/research-jobs/:id/documents`, and `/api/research-jobs/:id/report`.
- New dependencies and infrastructure: Postgres, Redis, BullMQ, and search provider clients for Brave, SerpApi, and Tavily.
- New environment variables: `DATABASE_URL`, `REDIS_URL`, `BRAVE_API_KEY`, `SERPAPI_API_KEY`, `TAVILY_API_KEY`, and existing `GEMINI_API_KEY`.
- Migration risk: existing SQLite `news.db` data is retained and not force-deleted in the first version; research data uses new Postgres tables.
