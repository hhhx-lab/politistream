## 1. RSS Source Management Backend

- [ ] 1.1 Add persisted RSS source schema and data access helpers in `src/server/db.ts`, including idempotent seeding from current default feeds. Requirements: `rss-source-management`.
- [ ] 1.2 Refactor `src/server/services/rss.ts` so feed refresh can run against persisted enabled sources, refresh one source, and record per-source success or failure. Requirements: `rss-source-management`.
- [ ] 1.3 Add RSS source management API routes in `server.ts` for list, create, enable/disable, and single-source refresh while preserving existing `/api/feeds` and `/api/refresh` compatibility. Requirements: `rss-source-management`.

## 2. Research Runtime Backend

- [ ] 2.1 Add a reusable research run service that plans queries, calls configured providers, stores candidates, crawls bounded public pages, derives evidence, generates reports, and updates job status. Requirements: `research-job-runtime`.
- [ ] 2.2 Wire `/api/research/jobs/:id/run`, documents, and report responses to the run service and stored research data with clear degraded states for missing provider configuration or empty evidence. Requirements: `research-job-runtime`, `search-first-research`.

## 3. Frontend Experience

- [ ] 3.1 Update shared frontend/server types for enriched RSS sources, source refresh results, research documents, research run responses, and degraded report states. Requirements: `search-first-research`, `rss-source-management`, `research-job-runtime`.
- [ ] 3.2 Rework `src/App.tsx` and research UI so the app opens on a search-first home, search submit creates/runs a job, and the user lands in an observable research status/results view. Requirements: `search-first-research`, `research-job-runtime`.
- [ ] 3.3 Add RSS source management UI within the news crawler partition, including add, enable/disable, refresh one source, status/error display, and preservation of existing news feed behaviours. Requirements: `rss-source-management`, `search-first-research`.

## 4. Verification

- [ ] 4.1 Add or update focused tests for RSS source validation/seeding and research run report outcomes. Requirements: `rss-source-management`, `research-job-runtime`.
- [ ] 4.2 Run `npm run lint`, `npm run test:research`, `npm run build`, and perform manual browser checks for the search-first home, research run degraded state, RSS source add/refresh, and existing news partition. Requirements: `search-first-research`, `rss-source-management`, `research-job-runtime`.
