## ADDED Requirements

### Requirement: Create research jobs
The system SHALL allow users to create a research job with a topic, optional seed URLs, crawl budget, and run interval.

#### Scenario: Create job with topic
- **WHEN** a user submits a valid research topic
- **THEN** the system creates a research job with active status, default budget values, and a next run time

#### Scenario: Create job with custom budget
- **WHEN** a user submits a research topic with max depth, URL limit, domain limit, and interval values
- **THEN** the system stores those budget values on the research job

### Requirement: Control research job lifecycle
The system SHALL support pausing, resuming, and manually running a research job.

#### Scenario: Pause job
- **WHEN** a user pauses an active research job
- **THEN** the system marks the job paused and prevents automatic enqueueing

#### Scenario: Resume job
- **WHEN** a user resumes a paused research job
- **THEN** the system marks the job active and schedules the next run

#### Scenario: Manual run
- **WHEN** a user manually triggers a research job run
- **THEN** the system enqueues the research job for discovery regardless of the next scheduled run time

### Requirement: Preserve legacy news behavior
The system SHALL keep existing RSS news APIs available while research jobs are introduced.

#### Scenario: News API remains available
- **WHEN** a client requests existing news endpoints
- **THEN** the system returns the existing RSS news responses without requiring Postgres or Redis research configuration
