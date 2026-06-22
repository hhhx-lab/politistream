## ADDED Requirements

### Requirement: Show Research decision card
The system SHALL show a Research decision card when a Research run completes and a report or evidence set is available.

#### Scenario: Decision card visible
- **WHEN** a Research run reaches a terminal state with report or evidence data
- **THEN** the UI shows a decision card with topic type, score, candidate features, available data assets, recommended action, and a way to open evidence details

#### Scenario: Decision card describes non-data topics
- **WHEN** the topic is primarily a tool-comparison, product-selection, or narrative investigation topic
- **THEN** the decision card recommends report-only or lightweight analysis instead of forcing full Data Lab analysis

### Requirement: Expose handoff actions in the UI
The system SHALL expose explicit UI actions for report-only, lightweight analysis, full analysis, continue crawling, and view evidence.

#### Scenario: User chooses report-only
- **WHEN** the user clicks the report-only action
- **THEN** the UI confirms the decision and stays on the Research report without creating a Data Lab dataset

#### Scenario: User chooses lightweight analysis
- **WHEN** the user clicks the lightweight analysis action
- **THEN** the UI navigates to the Data Lab sources or lightweight analysis context and shows that only profile, stats, and basic charts are allowed by default

#### Scenario: User chooses full analysis
- **WHEN** the user clicks the full analysis action
- **THEN** the UI navigates to the Data Lab analysis wizard and preloads topic, run id, report id, candidate features, missing fields, and source registry context

#### Scenario: User chooses continue crawling
- **WHEN** the user clicks the continue crawling action
- **THEN** the UI returns to Research planning and shows the follow-up crawl directions or missing fields that motivated the recommendation

### Requirement: Show context-rich Data Lab landing state
The system SHALL open Data Lab with the handoff context already selected when a Research decision routes the user there.

#### Scenario: Data Lab opens from Research handoff
- **WHEN** the user enters Data Lab from a Research handoff
- **THEN** the UI opens the correct page (`sources` or `wizard`) and shows the run id, topic, recommended mode, candidate features, missing fields, and source registry in the context panel

#### Scenario: Light mode restricts heavy actions
- **WHEN** the loaded handoff mode is lightweight analysis
- **THEN** the UI disables or de-emphasizes heavy analysis actions such as regression, clustering, deep learning, and full export flows until the user explicitly upgrades the mode

### Requirement: Keep button states observable
The system SHALL make all new decision and handoff buttons show disabled, loading, success, and error states.

#### Scenario: Handoff request in progress
- **WHEN** the user clicks a handoff action and the request is still running
- **THEN** the button shows a loading state and prevents duplicate submission

#### Scenario: Handoff request fails
- **WHEN** the handoff or opportunity request fails
- **THEN** the UI shows whether the failure was caused by evaluation failure, missing data, materialization failure, worker unavailability, or network error
