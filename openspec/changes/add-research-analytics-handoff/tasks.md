## 1. Research Opportunity Backend

- [x] 1.1 Add shared AnalysisOpportunity and AnalysisHandoff types with decision modes, score breakdown, field coverage, source recommendations, warnings, and lineage metadata.
- [x] 1.2 Add persistence helpers for creating, reading, updating, and lazy-loading analysis opportunities and handoffs by research run id.
- [x] 1.3 Implement deterministic opportunity scoring from Research documents, extracted tables, assets, candidates, frontier items, providers, source profiles, reports, and topic terms.
- [x] 1.4 Add optional LLM-assisted topic expansion for task type, candidate features, missing fields, recommended data sources, and explanation with deterministic fallback.
- [x] 1.5 Add `POST /api/research/runs/:runId/analysis-opportunity` and `GET /api/research/runs/:runId/analysis-opportunity` routes that never create datasets or analytics jobs.

## 2. Research Handoff Backend

- [x] 2.1 Implement `POST /api/research/runs/:runId/analysis-handoff` with `report_only`, `light_analysis`, `full_analysis`, and `continue_crawl` decisions.
- [x] 2.2 Ensure `report_only` records the decision without creating analytics datasets or worker jobs.
- [x] 2.3 Ensure `light_analysis` creates or reuses a Research data-source registry or lightweight dataset and records allowed operations as profile, stats, and basic charts.
- [x] 2.4 Ensure `full_analysis` creates or reuses source registry context and creates topic/plan metadata for Data Lab wizard entry.
- [x] 2.5 Ensure `continue_crawl` creates follow-up planned queries from missing fields and recommended data sources without losing existing run lineage.

## 3. Analytics Planning and Data Lab Backend

- [x] 3.1 Add an analytics planner service that consumes AnalysisOpportunity, dataset profile, and source registry rows to produce questions, variable roles, recommended methods, recommended charts, field coverage, and risks.
- [x] 3.2 Add Data Lab API support for loading handoff context and generating an analysis plan from a handoff or topic.
- [ ] 3.3 Enforce lightweight-mode restrictions so profile, stats, and basic charts are allowed while regression, clustering, deep learning, and heavy exports are disabled until upgraded.
- [ ] 3.4 Preserve handoff lineage on created datasets, analysis plans, jobs, and artifacts.

## 4. Research and Data Lab UI

- [ ] 4.1 Add `AnalysisDecisionPanel` to the Research run results surface with topic type, score, candidate features, data assets, recommendation, and actions.
- [ ] 4.2 Add `AnalysisOpportunityDrawer` to show score breakdown, evidence URLs, available fields, missing fields, source recommendations, and warnings.
- [ ] 4.3 Wire Research UI actions for report-only, lightweight analysis, full analysis, continue crawling, loading, success, and error states.
- [ ] 4.4 Update Data Lab focus/context handling so handoff routes open `sources` or `wizard` with topic, run id, report id, recommended mode, candidate features, missing fields, and source registry context.
- [ ] 4.5 Update Data Lab wizard/context UI to show field coverage, recommended methods, recommended charts, risks, and lightweight-mode restrictions.

## 5. Verification

- [ ] 5.1 Add Research backend tests for market-topic full-analysis recommendation, tool-comparison report/light recommendation, no-side-effect opportunity generation, and all handoff decisions.
- [ ] 5.2 Add Analytics backend tests for handoff metadata, lightweight restrictions, source registry reuse, plan generation, and lineage preservation.
- [ ] 5.3 Add frontend or component-level tests/smoke assertions that Research shows the decision panel and Data Lab opens with handoff context.
- [ ] 5.4 Run `npm run test:research`, `npm run test:analytics`, `npm run build`, and Playwright/manual scenarios for market research, tool comparison, report-only, light analysis, full analysis, and continue-crawl flows.
