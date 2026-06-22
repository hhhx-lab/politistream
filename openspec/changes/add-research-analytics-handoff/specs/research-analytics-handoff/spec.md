## ADDED Requirements

### Requirement: Evaluate Research run analysis opportunity
The system SHALL evaluate a completed Research run for Data Lab readiness without creating analytics datasets or enqueueing analytics workers.

#### Scenario: Market topic produces analyzable opportunity
- **WHEN** a completed Research run for a market/data-heavy topic is evaluated
- **THEN** the system returns an analysis opportunity with score, score breakdown, recommended analysis mode, candidate features, required fields, available fields, missing fields, recommended data sources, recommended actions, and decision reason

#### Scenario: Tool comparison avoids forced full analysis
- **WHEN** a completed Research run for a tool-comparison or product-selection topic is evaluated
- **THEN** the system recommends report-only or lightweight analysis unless structured data sources and numeric fields justify full analysis

#### Scenario: Opportunity generation has no analytics side effects
- **WHEN** a client creates or refreshes an analysis opportunity
- **THEN** the system does not create an analytics dataset, analytics plan, analytics job, or analytics artifact

### Requirement: Persist analysis opportunity
The system SHALL persist the latest analysis opportunity for a Research run so clients can retrieve the same recommendation and explanation.

#### Scenario: Retrieve existing opportunity
- **WHEN** a client requests the analysis opportunity for a run that has already been evaluated
- **THEN** the system returns the persisted opportunity with its score, recommendation, evidence summary, field coverage, and status

#### Scenario: Existing run without opportunity
- **WHEN** a client requests the analysis opportunity for an old run without a persisted opportunity
- **THEN** the system either lazily generates the opportunity or returns a clear not-ready response with a next action to generate it

### Requirement: Handoff decision controls side effects
The system SHALL require an explicit handoff decision before creating Data Lab side effects from a Research run.

#### Scenario: Report-only decision
- **WHEN** the user selects `report_only`
- **THEN** the system records the decision and does not create analytics datasets or analytics worker jobs

#### Scenario: Lightweight analysis decision
- **WHEN** the user selects `light_analysis`
- **THEN** the system creates or reuses the required Research source registry or lightweight dataset and limits downstream analysis to profile, stats, and basic charts

#### Scenario: Full analysis decision
- **WHEN** the user selects `full_analysis`
- **THEN** the system creates or reuses Research source registry context, creates analysis topic or plan context, and returns a Data Lab target page for the analysis wizard

#### Scenario: Continue crawling decision
- **WHEN** the user selects `continue_crawl`
- **THEN** the system creates follow-up planned queries from missing fields or recommended data sources and returns Research discovery as the next action

### Requirement: Preserve handoff lineage
The system SHALL preserve lineage from Research run to opportunity, handoff, datasets, analysis plans, and artifacts.

#### Scenario: Created dataset links to Research context
- **WHEN** a handoff creates or reuses a Data Lab dataset
- **THEN** the dataset metadata includes the Research run id, opportunity id or handoff id, source registry or source URL, and recommended analysis mode

#### Scenario: Handoff reports created assets
- **WHEN** a handoff completes
- **THEN** the response includes the handoff id, decision, target page, topic id if created, dataset ids if created, plan id if created, next actions, and warnings
