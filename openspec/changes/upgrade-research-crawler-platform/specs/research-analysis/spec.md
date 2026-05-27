## ADDED Requirements

### Requirement: Score document relevance
The system SHALL analyze crawled documents against the research job topic and store a relevance score.

#### Scenario: Relevant document
- **WHEN** a crawled document is analyzed and matches the research topic
- **THEN** the system stores a relevance score and marks the document relevant to the job

#### Scenario: Irrelevant document
- **WHEN** a crawled document is analyzed and does not match the research topic
- **THEN** the system stores the score and does not create evidence from that document

### Requirement: Extract evidence items
The system SHALL extract evidence snippets from relevant documents and link each evidence item to its source URL.

#### Scenario: Evidence extracted
- **WHEN** AI analysis identifies a source-backed claim relevant to the job
- **THEN** the system stores an evidence item with snippet, explanation, source document, and job link

### Requirement: Handle AI analysis failure
The system SHALL preserve crawled documents when AI analysis fails and mark analysis state as failed or pending.

#### Scenario: AI response cannot be parsed
- **WHEN** Gemini returns malformed or empty JSON during analysis
- **THEN** the system stores the failure state and leaves the document available for retry
