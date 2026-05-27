## Why

PolitiStream currently opens as a news monitoring console, while deep research is a secondary sidebar workspace and RSS sources are hardcoded. The change makes topic search the primary entry point for automated research, and turns the news crawler into a configurable RSS monitoring area that users can extend themselves.

## What Changes

- Make the app root a search-first research home instead of defaulting to the news feed split pane.
- On search submit, create a research job, trigger its run endpoint, and navigate to an observable research status/results view.
- Move the current news feed experience behind a dedicated news crawler / RSS monitoring partition while preserving the existing news list, detail, favorites, AI work queue, and refresh behaviours.
- Add RSS source management so users can create, enable/disable, inspect status for, and refresh RSS sources manually.
- Replace the crawler's fixed feed traversal with a default-seeded, persisted source list that includes enabled user-added feeds.
- Wire the research job run path so it performs query planning, configured provider search, public page crawling, evidence/report persistence, and status updates when dependencies are available.
- Provide graceful degradation for missing search provider keys, failed provider calls, failed page crawls, and failed RSS source refreshes.

## Capabilities

### New Capabilities

- `search-first-research`: Covers the application shell, primary search entry, research job creation/run trigger, and research status/results experience.
- `rss-source-management`: Covers persisted RSS source CRUD-style management, per-source status, enable/disable, single-source refresh, and all-source refresh using enabled sources.
- `research-job-runtime`: Covers executable research runs from an existing research job through query planning, provider search, crawling, evidence/report creation, and observable terminal states.

### Modified Capabilities

- None. There are no existing specs under `openspec/specs/`, so this change introduces new capability contracts from the current code baseline.

## Impact

- Frontend: `src/App.tsx`, `src/components/ResearchPanel.tsx`, `src/components/NewsFeed.tsx`, and new or updated components for the search home, research status/results, and RSS source management.
- Shared types: `src/types` needs source, research status, document/report, and API response contracts that match the new UI and routes.
- API: `server.ts` feed endpoints, refresh endpoints, and research routes under `/api/research`.
- News storage: `src/server/db.ts` gains a persisted RSS sources table while keeping the existing `news` table compatible.
- RSS crawler: `src/server/services/rss.ts` reads enabled persisted sources, seeds the current default feeds, refreshes one source or all enabled sources, and records source status.
- Research runtime: `src/server/research/routes.ts` and research service modules use existing query planner, provider adapters, crawler, store, and report generation to make `/jobs/:id/run` do real work instead of returning the current placeholder.
- Validation: `npm run lint`, `npm run build`, `npm run test:research`, plus manual app flows for search, research run status, RSS source add/refresh, and existing news monitoring behaviours.
