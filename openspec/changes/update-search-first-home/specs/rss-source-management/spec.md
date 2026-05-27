## ADDED Requirements

### Requirement: Persisted RSS sources

The system SHALL persist RSS sources with identity, name, URL, enabled state, timestamps, and latest refresh error while keeping the existing default feeds available.

#### Scenario: Default feeds are seeded

- **WHEN** RSS sources are initialized after the change
- **THEN** the existing default feed URLs are available as RSS sources
- **AND** seeding does not create duplicate sources for the same URL

#### Scenario: User-added source survives restart

- **WHEN** a user adds a valid RSS source and the server restarts
- **THEN** the RSS source remains listed with its name, URL, and enabled state

### Requirement: RSS source creation validation

The system SHALL validate RSS source creation requests and reject invalid or duplicate URLs without creating source records.

#### Scenario: Valid RSS source is added

- **WHEN** a user submits a source name and valid RSS URL
- **THEN** the API creates a new enabled RSS source
- **AND** the source appears in the RSS source list

#### Scenario: Duplicate source URL is rejected

- **WHEN** a user submits an RSS source URL that already exists
- **THEN** the API returns a 4xx validation error
- **AND** no duplicate source is created

#### Scenario: Invalid source URL is rejected

- **WHEN** a user submits an invalid URL
- **THEN** the API returns a 4xx validation error
- **AND** no RSS source is created

### Requirement: RSS source enablement

The system SHALL allow users to enable and disable RSS sources, and disabled sources MUST be excluded from all-source refreshes.

#### Scenario: Disabled source is skipped

- **WHEN** a user disables an RSS source and then triggers all-source refresh
- **THEN** the disabled source is not fetched
- **AND** other enabled sources can still be fetched

#### Scenario: Re-enabled source is fetched again

- **WHEN** a user re-enables a disabled RSS source and triggers refresh
- **THEN** the source is eligible for fetching again

### Requirement: RSS source refresh status

The system SHALL support refreshing one RSS source and all enabled RSS sources, recording last refresh success or failure per source.

#### Scenario: Single source refresh succeeds

- **WHEN** a user refreshes one valid enabled RSS source
- **THEN** the source is fetched
- **AND** new articles are inserted into the existing news list with the RSS source name
- **AND** the source latest refresh timestamp is updated

#### Scenario: Single source refresh fails

- **WHEN** a user refreshes one RSS source that cannot be fetched or parsed
- **THEN** the API returns a failed refresh result for that source
- **AND** the source latest error is updated
- **AND** existing news data remains intact

#### Scenario: All-source refresh isolates failures

- **WHEN** all-source refresh runs and one enabled RSS source fails
- **THEN** the refresh continues for remaining enabled sources
- **AND** the failed source records its latest error
