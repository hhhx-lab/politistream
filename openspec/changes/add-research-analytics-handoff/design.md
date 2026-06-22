## Context

PolitiStream already has the main building blocks for topic research and downstream analytics:

- Research runs can create jobs, run discovery/crawl/analyze/report stages, expose documents, evidence, source profiles, tables, assets, reports, and manual query controls.
- Research UI can export a run or a data-source registry to Data Lab, but that export path is direct and does not explain whether data analysis is appropriate.
- Data Lab can import datasets, profile rows, materialize Research data sources, run analytics jobs, render visualizations, and show activity/artifacts.
- The current gap is not another crawler stage. It is a product and API contract that decides whether a completed Research topic needs report-only output, lightweight analysis, full Data Lab analysis, or additional crawling for missing data.

Constraints:

- Keep existing Research run, RSS news, `/api/analytics/datasets/from-research-run/:runId`, and `/api/analytics/datasets/from-research-run/:runId/data-sources` flows compatible.
- Do not create datasets or run analytics workers while merely generating an analysis opportunity.
- Use LLMs for semantic expansion and explanations, but keep scoring fallbacks and statistical work deterministic.
- Preserve source language for crawled content; generated summaries, chart explanations, and reports default to Simplified Chinese.

## Goals / Non-Goals

**Goals:**

- Add a persisted `AnalysisOpportunity` for a Research run/report that explains Data Lab readiness.
- Add explicit handoff decisions: `report_only`, `light_analysis`, `full_analysis`, and `continue_crawl`.
- Route users to the right Data Lab page with topic, run, report, field, source, and mode context.
- Generate topic-driven analysis plans from Research evidence/source registries plus dataset profiles.
- Make the decision process visible in the UI and verifiable in tests.

**Non-Goals:**

- Rebuild the Research crawler, provider registry, frontier queue, RSS flow, or existing Data Lab worker runtime.
- Force all Research topics into numeric datasets.
- Introduce paid-wall bypassing, captcha bypassing, or scraping beyond the existing public-source policy.
- Guarantee full SPSS commercial feature parity in this change.

## Decisions

### Decision 1: Introduce `AnalysisOpportunity` as the bridge object

`AnalysisOpportunity` is the stable contract between Research and Data Lab. It stores:

- topic, research run id, report id, task type
- score and score breakdown
- recommended analysis mode
- candidate features, required fields, available fields, missing fields
- recommended data sources, recommended actions, evidence summary
- user decision, handoff id, created dataset ids, and status

Rationale: A standalone bridge object lets Research explain recommendations before any Data Lab side effect happens. It also gives the UI an inspectable artifact and gives tests a deterministic API surface.

Alternative considered: Put all recommendation metadata inside the research report. Rejected because reports are content artifacts, while this decision needs mutable state, user decisions, dataset lineage, and repeatable API reads.

### Decision 2: Opportunity generation is read-only with deterministic fallback

`POST /api/research/runs/:runId/analysis-opportunity` evaluates a run and may persist the opportunity, but it MUST NOT create analytics datasets or enqueue workers. The evaluator combines:

- deterministic facts from run documents, extracted tables, assets, source profiles, candidates, frontier items, providers, and reports
- source type/format hints such as table, PDF, CSV, JSON, API, data catalog, financial data, sports data, and competition data
- field-like term detection for time, region, amount, count, channel, brand, people, and rate dimensions
- optional LLM expansion for task type, candidate variables, missing fields, and explanation

Rationale: Users should see whether analysis is worth doing before compute-heavy actions start. Deterministic fallback keeps the feature usable when LLM configuration is missing.

Alternative considered: Let the LLM decide mode directly. Rejected because prior product feedback shows uniform or opaque recommendations are not useful.

### Decision 3: Handoff decisions own side effects

`POST /api/research/runs/:runId/analysis-handoff` is the only endpoint that creates downstream side effects from an opportunity:

- `report_only`: saves the decision and marks the Research report/final state without creating datasets or workers.
- `light_analysis`: creates or reuses a Research data-source registry/lightweight dataset and allows only profile, stats, and basic chart operations.
- `full_analysis`: creates topic/handoff/analysis-plan context, creates or reuses a source registry, and routes to the Data Lab wizard.
- `continue_crawl`: creates follow-up planned queries from missing fields and routes Research back to discovery.

Rationale: One endpoint centralizes user intent, lineage, created assets, and rollback behavior.

Alternative considered: Reuse the existing Data Lab export button for all modes. Rejected because export alone cannot represent report-only or continue-crawl decisions.

### Decision 4: Data Lab consumes handoff context instead of guessing

Data Lab receives a focus payload and/or API-loaded handoff context containing topic, runId, reportId, candidate features, missing fields, source registry dataset id, recommended mode, and allowed action set. The UI uses that context to:

- open `sources` for registry/materialization work
- open `wizard` for full analysis planning
- display a right-side context panel with why this analysis was recommended
- disable heavy methods when the user selected lightweight analysis

Rationale: The user should arrive at the exact next step with the Research reasoning visible.

Alternative considered: Data Lab infers topic and fields from selected dataset only. Rejected because source registries and materialized datasets often lack the full Research topic/report context.

### Decision 5: Topic-driven planning stays separate from worker execution

The analytics planner produces questions, variable roles, methods, charts, field coverage, and risks. It does not execute statistical work. Execution remains in the analytics API/worker path and stores artifacts with lineage.

Rationale: This preserves reproducibility: planning can use LLM assistance, while statistical outputs come from deterministic worker code and saved parameters.

Alternative considered: LLM-generated charts and analysis directly from report text. Rejected because the user needs real Data Lab artifacts, datasets, and reproducible charts.

## Risks / Trade-offs

- Incorrectly recommending full analysis -> Mitigation: store score breakdown and evidence, allow `report_only`, and require explicit user decision before side effects.
- Sparse data sources for market topics -> Mitigation: return `continue_crawl` with missing fields and planned query suggestions instead of fabricating analysis.
- Existing unfinished Research crawler change may shift data shapes -> Mitigation: read from existing store/list APIs and preserve current export APIs as compatibility surfaces.
- Worker unavailable or environment incomplete -> Mitigation: create opportunity/handoff/source registry but mark execution as blocked with warnings and manual next actions.
- UI complexity increases -> Mitigation: put the decision card on Research and a context panel on Data Lab; avoid hiding actions in existing dense panels.

## Migration Plan

1. Add persistence for analysis opportunities and handoffs with lazy creation for existing runs.
2. Add read-only opportunity evaluation endpoint.
3. Add handoff endpoint and keep the current direct export route working.
4. Add Research decision UI behind completed-run/report availability.
5. Add Data Lab handoff focus/context handling.
6. Add analytics planner outputs without changing existing worker command semantics.

Rollback:

- Hide the new decision card and drawer.
- Keep existing direct export to Data Lab and data-source registry endpoints.
- Leave persisted opportunities/handhoffs unused until re-enabled.

## Open Questions

- Whether opportunity/handoff records should live in the Research schema, Analytics schema, or a shared schema. First implementation should keep them close to Research because they are keyed by run/report and only later create analytics assets.
- Whether `continue_crawl` should auto-enqueue discovery immediately or create planned queries requiring user confirmation. First implementation should support explicit confirmation unless the run is already in a manual retry flow.
