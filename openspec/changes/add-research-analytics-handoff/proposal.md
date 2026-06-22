## Why

PolitiStream can already run deep Research jobs, export Research data-source registries, materialize sources in Data Lab, and execute analytics workers. The missing product contract is the decision layer between a completed Research report and Data Lab: the app currently cannot explain whether a topic should remain a research/comparison report, enter lightweight profiling, enter full statistical analysis, or continue crawling for missing data.

This change adds that decision gate so topics such as "全国避孕套市场" can become data-backed analysis workflows, while topics such as "好用的文档编辑工具" do not get forced into inappropriate heavy statistics.

## What Changes

- Add an `Analysis Opportunity` evaluation for completed Research runs that returns score, score breakdown, topic type, candidate features, available fields, missing fields, recommended data sources, recommended actions, and a decision reason.
- Add Research handoff decisions: `report_only`, `light_analysis`, `full_analysis`, and `continue_crawl`.
- Add APIs to create/read an analysis opportunity and to persist a user's handoff decision.
- Add a Research UI decision card and evidence drawer so users can inspect why the system recommends report-only, lightweight analysis, full analysis, or more crawling.
- Add Data Lab handoff handling so the app opens `sources` or `wizard` with the Research topic, run id, report id, candidate fields, missing fields, source registry, and recommended analysis depth.
- Add topic-driven analytics planning that turns Research outputs and dataset profiles into analysis questions, variable roles, recommended methods, recommended charts, field coverage, and risks.
- Preserve existing Research run, RSS news, data-source export, and materialization APIs.

## Capabilities

### New Capabilities

- `research-analytics-handoff`: Completed Research runs can be evaluated for Data Lab readiness and handed off through explicit user decisions.
- `analytics-topic-planning`: Data Lab can generate topic-driven analysis plans from Research opportunity context and dataset profiles.
- `data-lab-workflow-ui`: Research and Data Lab UI surfaces expose the decision gate, handoff context, workflow state, and actionable next steps.

### Modified Capabilities

- None. `openspec/specs/` currently contains no baseline capabilities; this change introduces new capability contracts from the current code baseline and remains compatible with active Research crawler changes.

## Impact

- Backend Research: `src/server/research/routes.ts`, `src/server/research/analysis.ts`, `src/server/research/store.ts`, and related tests gain analysis-opportunity and handoff APIs.
- Backend Analytics: `src/server/analytics/routes.ts`, `src/server/analytics/types.ts`, `src/server/analytics/store.ts`, `src/server/analytics/engine.ts`, and worker integration gain topic/handoff metadata and mode-limited execution.
- Frontend Research: `src/components/ResearchPanel.tsx` and new research subcomponents gain `AnalysisDecisionPanel` and `AnalysisOpportunityDrawer`.
- Frontend Data Lab: `src/components/DataLab.tsx`, `src/components/data-lab/DataLabAnalysisWizard.tsx`, and future split components consume handoff context and display recommended steps.
- API additions: `POST /api/research/runs/:runId/analysis-opportunity`, `GET /api/research/runs/:runId/analysis-opportunity`, and `POST /api/research/runs/:runId/analysis-handoff`.
- Validation: OpenSpec strict validation, `npm run test:research`, `npm run test:analytics`, `npm run build`, and Playwright/manual flows for market-research and tool-comparison topics.
- Migration: new opportunity/handoff persistence can be lazy-created for old runs; rollback hides the new decision UI and keeps the existing direct Data Lab export route.
