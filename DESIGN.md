# PolitiStream: Technical Roadmap & Product Design

## 1. Executive Summary
PolitiStream is a high-performance, real-time news aggregation platform focused on US political dynamics. It leverages distributed crawling, AI-driven content governance, and a minimalist UI to provide decision-makers with a noise-free, verifiable information stream.

## 2. Technical Architecture

### 2.1. Core Stack
- **Frontend**: React 19, Tailwind CSS v4, Motion (Framer Motion).
- **Backend**: Node.js (Express), SQLite (better-sqlite3) for high-performance local storage.
- **AI Engine**: Google Gemini 2.5 Flash for real-time NLP (summarization, sentiment analysis, entity extraction).
- **Data Pipeline**: Custom RSS/Webhook ingestion engine.

### 2.2. Data Flow Topology
1.  **Ingestion Layer**:
    -   **Source**: Authoritative RSS feeds (AP, Reuters, CNN, Politico).
    -   **Mechanism**: Polling (every 60s) + Webhook (where available).
    -   **Raw Storage**: In-memory buffer for immediate processing.
2.  **Processing Layer (The "Governance Engine")**:
    -   **Deduplication**: SimHash algorithm to identify near-duplicate content across sources.
    -   **Sanitization**: DOMPurify to strip ads, tracking pixels, and non-content HTML.
    -   **AI Analysis**:
        -   *Summarization*: 3-bullet executive summary.
        -   *Sentiment*: -1.0 (Negative) to +1.0 (Positive) score.
        -   *Entities*: Extraction of key political figures and organizations.
3.  **Storage Layer**:
    -   **Database**: SQLite with WAL mode for concurrent reads/writes.
    -   **Schema**: Optimized for time-series queries (indexing on `published_at`).
4.  **Distribution Layer**:
    -   **API**: RESTful endpoints with ETag support for efficient caching.
    -   **Real-time**: Polling/WebSocket (simulated via frequent SWR revalidation in MVP).

### 2.3. Latency Budget (Target: < 300s End-to-End)
-   **Source Publish**: T+0
-   **Ingestion**: T+60s (Max polling interval)
-   **AI Processing**: T+5s (Gemini Flash is extremely fast)
-   **DB Write**: T+10ms
-   **Client Fetch**: T+100ms
-   **Total**: ~65-70s (Well within the 300s limit).

## 3. Product Design

### 3.1. UI/UX Philosophy: "Information Breathing Room"
-   **Visual Style**: "Technical Dashboard" (Recipe 1). High contrast, monospace data points, serif headers for readability.
-   **Layout**:
    -   **Left Rail**: Filters (Sentiment, Source, Entities).
    -   **Center Stage**: The "Stream" - a dense but readable list of events.
    -   **Right Rail**: Context - AI summary of the selected item, source lineage.
-   **Interaction**: Keyboard-first navigation (j/k to move, enter to view).

### 3.2. Trust & Verification
-   **Source Tracing**: Every item displays the domain of origin prominently.
-   **Original Link**: One-click access to the raw source.
-   **AI Transparency**: Clearly labeling AI-generated summaries vs. raw text.

## 4. API Contract (Core Entity)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NewsItem",
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "title": { "type": "string" },
    "summary": { "type": "array", "items": { "type": "string" } },
    "original_url": { "type": "string", "format": "uri" },
    "source": { "type": "string" },
    "published_at": { "type": "string", "format": "date-time" },
    "sentiment_score": { "type": "number", "minimum": -1, "maximum": 1 },
    "entities": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["id", "title", "original_url", "source", "published_at"]
}
```

## 5. Implementation Plan (MVP)
1.  **Setup**: Express + Vite + SQLite.
2.  **Ingest**: Build RSS fetcher for AP and Reuters.
3.  **Process**: Integrate Gemini for content analysis.
4.  **UI**: Build the dashboard using the "Technical Grid" design system.
