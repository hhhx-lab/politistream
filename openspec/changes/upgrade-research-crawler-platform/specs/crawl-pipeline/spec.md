## ADDED Requirements

### Requirement: Enqueue crawl candidates
The system SHALL enqueue normalized search candidates and discovered links for crawl work subject to research job budgets.

#### Scenario: Candidate within budget
- **WHEN** a search candidate belongs to an active research job and the run budget is not exhausted
- **THEN** the system enqueues the candidate for crawling

#### Scenario: Candidate exceeds budget
- **WHEN** a candidate would exceed depth, URL, or domain budget
- **THEN** the system does not enqueue the candidate and records a skipped status

### Requirement: Extract public page content
The system SHALL fetch public pages and extract readable text content using the configured extraction chain.

#### Scenario: Public page extraction succeeds
- **WHEN** a crawled URL returns readable public HTML
- **THEN** the system stores the extracted title, text content, final URL, content hash, and fetched status

#### Scenario: Page blocked or unavailable
- **WHEN** a crawled URL cannot be fetched due to access, timeout, or extraction failure
- **THEN** the system stores a failed or blocked crawl status with an error reason

### Requirement: Expand links across the web
The system SHALL extract links from crawled pages and enqueue relevant links for deeper crawling within job budgets.

#### Scenario: Cross-domain link within budget
- **WHEN** a crawled page contains a cross-domain link and the job budget allows another crawl
- **THEN** the system normalizes the link and considers it for enqueueing
