## ADDED Requirements

### Requirement: Search-first application home

The application SHALL open to a primary research search home instead of the news monitoring split pane.

#### Scenario: Root view shows primary search

- **WHEN** a user opens the app root
- **THEN** the first visible workspace contains a prominent research topic search input and submit control
- **AND** the news feed is not the default split-pane workspace

#### Scenario: News crawler remains reachable

- **WHEN** a user chooses the news crawler or RSS monitoring partition
- **THEN** the existing news list workspace is displayed
- **AND** existing all-news, favorites, AI work queue, detail, and refresh behaviours remain available

### Requirement: Search submission starts research

The application SHALL convert a submitted research topic into a research job, trigger a run for that job, and navigate to an observable research status or result view.

#### Scenario: Valid search creates and runs a job

- **WHEN** a user submits a non-empty research topic from the primary search input
- **THEN** the frontend creates a research job through the research jobs API
- **AND** triggers the run endpoint for the created job
- **AND** displays the job in the research status or results workspace

#### Scenario: Empty search is rejected locally

- **WHEN** a user attempts to submit an empty or whitespace-only research topic
- **THEN** no research job is created
- **AND** the UI keeps the user on the search home with a clear validation state

### Requirement: Research status feedback

The research experience SHALL show clear states for running work, missing provider configuration, failed work, report-not-ready, and ready report output.

#### Scenario: Missing provider configuration is visible

- **WHEN** a research run cannot call any configured search provider because provider keys are missing
- **THEN** the UI displays a degraded state that explains the missing provider configuration
- **AND** the research job remains available for retry after configuration is fixed

#### Scenario: Report readiness is visible

- **WHEN** a user opens a research job whose report is not ready
- **THEN** the UI displays a not-ready state instead of an empty or broken report surface

#### Scenario: Ready report is displayed

- **WHEN** a research job has a ready report
- **THEN** the UI displays the generated markdown report for that job

### Requirement: Responsive research and crawler navigation

The application SHALL keep the primary search, research status, RSS source management, and news monitoring controls usable across desktop and narrow viewports.

#### Scenario: Narrow viewport preserves core controls

- **WHEN** the app is viewed on a narrow viewport
- **THEN** the search input, submit control, navigation controls, and active workspace content remain readable and do not overlap
