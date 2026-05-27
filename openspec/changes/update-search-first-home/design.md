## Context

The current app shell defaults to `workspace = 'news'`, renders the news split pane first, and treats `ResearchPanel` as a secondary sidebar workspace. RSS sources are exported as a static `FEEDS` array and `/api/feeds` simply returns that array. The SQLite database currently stores news items only, while the research subsystem already has PostgreSQL-backed jobs, search candidates, crawl documents, evidence, reports, provider adapters, a query planner, a crawler, and report generation. The missing pieces are an app-level search-first experience, persisted RSS source management, and an executable research run endpoint.

Constraints from the plan:

- Preserve existing news APIs and UI behaviours.
- Keep the current default feeds available after RSS source persistence is added.
- Persist user-added RSS sources in the news crawler storage path so they survive dev server restarts.
- Handle missing provider keys and external failures as visible degraded states.
- Avoid paywall/login bypass and invasive crawling.

## Goals / Non-Goals

**Goals:**

- Make the root application view a search-first research home.
- Convert search submit into a create-and-run research job flow.
- Keep news monitoring as a first-class partition rather than removing it.
- Add persisted RSS source management with per-source refresh state.
- Make `/api/research/jobs/:id/run` perform a bounded, observable research run using existing research modules.

**Non-Goals:**

- No authentication, multi-user access, billing, or team workflow.
- No replacement of the existing provider adapter set.
- No destructive migration of historical `news` rows.
- No browser automation for authenticated or protected pages.

## Decisions

### 1. Search home owns the primary route-like state

Use the existing React shell as a lightweight route controller with explicit workspace values such as `home`, `research`, and `news`. The root/default state SHALL be the search home. Search submission creates the job, invokes `/api/research/jobs/:id/run`, then selects the job in the research result view.

Alternative considered: keep the current sidebar-only `ResearchPanel` and enlarge its input. That would leave the product information architecture news-first, which conflicts with the requirement.

### 2. RSS source state lives beside the news crawler in SQLite

Add an RSS source table to `src/server/db.ts` because the existing news crawler already uses SQLite and should remain usable without the PostgreSQL research database. The table stores source identity, URL uniqueness, enabled state, timestamps, and the latest refresh error. Current `FEEDS` become default seed sources.

Alternative considered: store RSS sources in the research PostgreSQL database. That would couple news monitoring to research infrastructure and make the crawler fail harder when research database configuration is missing.

### 3. Feed refresh accepts explicit source lists

Refactor `fetchAndProcessFeeds()` so the core worker accepts source records and returns structured per-source refresh results. Keep `/api/refresh` as all-enabled-source refresh, and add endpoints for source list/create/update/delete-or-disable and single-source refresh. Single source failure SHALL update that source status without aborting other sources.

Alternative considered: only append user sources to the static `FEEDS` array at runtime. That would not persist changes and would make status tracking brittle.

### 4. Research run is synchronous bounded work for this change

Implement `/api/research/jobs/:id/run` as a bounded run in the request lifecycle for now: load job, plan queries, call configured providers, upsert candidates, crawl a budgeted subset, create simple evidence from fetched documents, generate a report, and update job status. This fits the current app because BullMQ/Redis dependencies exist but the queue runner is not yet wired.

Alternative considered: build the full background queue first. That is a larger operational change and would make this UI-centered change harder to deliver safely. The design can later move the same run function behind a queue without changing the API contract.

### 5. Degraded states are first-class API results

When provider keys are missing, providers fail, or no crawlable evidence is found, the run endpoint SHALL persist a report/status that the frontend can display. Missing configuration is not a frontend crash and not an invisible no-op.

Alternative considered: return HTTP 500 for any incomplete run. That would make expected configuration gaps look like product failures and would block users from saving/retrying research jobs.

## Risks / Trade-offs

- [Risk] The run endpoint may take longer than a typical UI request when providers and pages are slow. → Mitigation: use existing budgets, provider timeouts, crawl limits, and return structured partial results.
- [Risk] Default RSS feeds may duplicate persisted seed records. → Mitigation: enforce URL uniqueness and seed idempotently.
- [Risk] RSS source deletion could surprise users if historical news rows still reference the source name. → Mitigation: prefer disable/soft delete in the API contract; historical news rows remain intact.
- [Risk] Provider keys or PostgreSQL may be missing in local development. → Mitigation: preserve job creation where possible, expose config status, and show degraded/retry states.
- [Risk] Frontend scope is broad. → Mitigation: split UI into focused components: search home, research workspace, RSS source manager, and existing news feed.

## Migration Plan

- Add SQLite RSS source schema in `initDb()` without modifying existing `news` rows.
- Seed current static `FEEDS` into RSS sources idempotently on startup or source-list read.
- Keep `FEEDS` exported or internally available as default seed data until all call sites use persisted sources.
- Preserve `/api/feeds` as a list endpoint, returning the richer source model while keeping `name` and `url` fields for compatibility.
- Roll back by routing all-source refresh to the static seed feeds if dynamic source reads fail; do not drop the RSS source table.

## Open Questions

- Whether the UI should expose hard delete immediately or start with disable-only source management. The safer first implementation is disable-only plus optional delete if needed.
- Whether research runs should later move to BullMQ. This change keeps the API contract compatible with that future move.
