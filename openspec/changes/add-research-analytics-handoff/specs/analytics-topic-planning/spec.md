## ADDED Requirements

### Requirement: Generate topic-driven analysis plan
The system SHALL generate an analysis plan from a Research opportunity and a Data Lab dataset profile.

#### Scenario: Plan includes questions and variables
- **WHEN** Data Lab generates a plan from an analysis opportunity and dataset profile
- **THEN** the plan includes analysis questions, candidate variables, variable roles, field coverage, recommended methods, recommended charts, risks, and next actions

#### Scenario: Plan explains missing fields
- **WHEN** required fields are absent from the current dataset or source registry
- **THEN** the plan lists missing fields and recommends data sources or follow-up crawl queries before running unsupported analyses

### Requirement: Distinguish report, lightweight, and full analysis modes
The system SHALL tailor analytics planning and executable actions to the selected handoff mode.

#### Scenario: Report-only mode
- **WHEN** the handoff decision is report-only
- **THEN** Data Lab does not generate executable worker tasks and the Research report remains the primary artifact

#### Scenario: Lightweight mode
- **WHEN** the handoff decision is lightweight analysis
- **THEN** the generated plan allows profiling, descriptive statistics, frequency summaries, crosstabs, and basic charts but excludes regression, clustering, deep learning, and other heavy methods by default

#### Scenario: Full mode
- **WHEN** the handoff decision is full analysis
- **THEN** the generated plan may include profile, quality checks, descriptive statistics, frequency tables, crosstabs, tests, regression, clustering, time series, geospatial analysis, charts, and report/export tasks when fields are suitable

### Requirement: Use deterministic analytics for computed results
The system SHALL execute computed statistics, profiles, charts, and models through deterministic TypeScript or Python analytics code rather than relying on LLM-generated numbers.

#### Scenario: LLM assists planning only
- **WHEN** the planner uses an LLM to expand topic variables or explain recommendations
- **THEN** any numeric statistics, model results, chart data, and artifact outputs still come from analytics dataset rows and worker execution

#### Scenario: Worker unavailable
- **WHEN** the selected analysis mode requires a worker that is unavailable
- **THEN** the plan records a warning, preserves the handoff context, and provides manual next actions without fabricating artifacts

### Requirement: Preserve analysis reproducibility
The system SHALL store analysis plan, worker request, generated artifact metadata, and lineage so outputs can be traced back to source data and parameters.

#### Scenario: Artifact records generation context
- **WHEN** an analytics artifact is generated from a handoff plan
- **THEN** the artifact metadata includes dataset id, source lineage, relevant field mapping, analysis kind, generated parameters, and reproducible code or specification when available
