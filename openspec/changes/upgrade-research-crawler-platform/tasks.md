## 1. Infrastructure

- [ ] 1.1 Add Postgres, Redis/BullMQ, and search provider configuration scaffolding
- [ ] 1.2 Add research domain types, URL canonicalization, and budget utilities

## 2. Research Storage

- [ ] 2.1 Add Postgres research schema initialization and repository methods
- [ ] 2.2 Add graceful configuration errors so legacy RSS endpoints work without research infrastructure

## 3. Discovery And Crawling

- [ ] 3.1 Implement query planning, provider abstraction, and Brave/SerpApi/Tavily candidate normalization
- [ ] 3.2 Implement public page extraction, content hashing, link extraction, and budgeted link expansion

## 4. Analysis And Reporting

- [ ] 4.1 Implement relevance analysis and evidence extraction for crawled documents
- [ ] 4.2 Implement Markdown report generation and report retrieval

## 5. API And UI

- [ ] 5.1 Add research job APIs for create/list/detail/update/run/documents/report
- [ ] 5.2 Add frontend research job, evidence, and report views without removing the existing news stream

## 6. Verification

- [ ] 6.1 Add focused tests for URL utilities, provider normalization, budget limits, and report generation
- [ ] 6.2 Run typecheck/build validation and document limited validation steps when Postgres or Redis are unavailable
