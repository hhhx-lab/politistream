## ADDED Requirements

### Requirement: Plan search queries
The system SHALL generate search queries from a research job topic and seed context.

#### Scenario: Generate queries for topic
- **WHEN** a research job enters the search stage
- **THEN** the system produces one or more search queries linked to the job

### Requirement: Search multiple providers
The system SHALL search Brave, SerpApi, and Tavily when their API keys are configured.

#### Scenario: All providers configured
- **WHEN** all provider API keys are available
- **THEN** the system searches Brave, SerpApi, and Tavily and normalizes their results as search candidates

#### Scenario: Provider missing key
- **WHEN** one provider API key is missing
- **THEN** the system marks that provider disabled for the run and continues with configured providers

### Requirement: Normalize and deduplicate candidates
The system SHALL normalize discovered URLs and avoid duplicate search candidates for the same canonical URL.

#### Scenario: Duplicate URL discovered
- **WHEN** multiple providers return the same canonical URL
- **THEN** the system stores one candidate and records the contributing providers
