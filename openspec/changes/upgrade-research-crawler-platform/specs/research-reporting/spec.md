## ADDED Requirements

### Requirement: Generate Markdown reports
The system SHALL generate a Markdown research report from stored evidence items for a research job.

#### Scenario: Report generated from evidence
- **WHEN** a research job has analyzed evidence items
- **THEN** the system generates a Markdown report containing summary, evidence sections, source links, and generation time

### Requirement: Retrieve latest report
The system SHALL expose the latest report for a research job through an API.

#### Scenario: Get latest report
- **WHEN** a client requests the report for a research job with a generated report
- **THEN** the system returns the latest Markdown report and metadata

#### Scenario: Report not ready
- **WHEN** a client requests a report before one has been generated
- **THEN** the system returns a clear not-ready response

### Requirement: Regenerate reports
The system SHALL allow reports to be regenerated from stored evidence without recrawling pages.

#### Scenario: Manual report regeneration
- **WHEN** a user triggers report regeneration for a job with stored evidence
- **THEN** the system creates a new report version using existing evidence items
