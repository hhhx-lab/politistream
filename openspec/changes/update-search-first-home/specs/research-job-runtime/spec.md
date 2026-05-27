## ADDED Requirements

### Requirement: Executable research run

The research run endpoint SHALL perform a bounded research run for an existing job instead of returning a placeholder response.

#### Scenario: Run processes configured providers

- **WHEN** a research job is run and at least one search provider is configured
- **THEN** the system plans queries for the job topic
- **AND** calls configured search providers
- **AND** stores normalized search candidates for the job

#### Scenario: Run handles missing providers

- **WHEN** a research job is run and no search provider is configured
- **THEN** the system records a failed or degraded run result that identifies missing provider configuration
- **AND** the job remains available for retry

### Requirement: Run crawls and stores evidence

The research run SHALL crawl a bounded set of public candidate pages, store crawl documents, and derive evidence from fetched content.

#### Scenario: Crawlable candidates create documents and evidence

- **WHEN** search providers return crawlable candidates within the job budget
- **THEN** the system crawls public pages for those candidates
- **AND** stores crawl document records
- **AND** creates evidence items from fetched content that can support a report

#### Scenario: Blocked or failed pages do not abort run

- **WHEN** one candidate page is blocked or fails to fetch
- **THEN** the failed crawl is recorded
- **AND** the run continues processing other accepted candidates

### Requirement: Run generates observable report state

The research run SHALL generate and persist a report state for the job, including ready, not-ready, or failed outcomes.

#### Scenario: Evidence creates ready report

- **WHEN** a research run produces evidence items
- **THEN** the system generates a ready markdown report
- **AND** persists it as the latest report for the job
- **AND** updates the job to a completed terminal state

#### Scenario: No evidence creates not-ready or failed report

- **WHEN** a research run completes without usable evidence
- **THEN** the system persists a not-ready or failed report state with an explanatory message
- **AND** the UI can display that state for the job

### Requirement: Research run budget and status

The research run SHALL respect the job budget and expose status transitions that the frontend can observe.

#### Scenario: Run respects URL budget

- **WHEN** a research job has a maximum URL budget
- **THEN** the run does not crawl more URLs than the budget allows

#### Scenario: Run status transitions are persisted

- **WHEN** a research run starts, completes, or fails
- **THEN** the job status is updated to running, completed, or failed accordingly
