# Deep Research Platform Architecture Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 PolitiStream 深度研究爬虫从“单执行器后台 run”升级为可恢复、可审计、可扩展、可长期积累研究记忆的 Research Crawling Platform。

**Architecture:** 保留 React + Vite + Express + Postgres + Redis/BullMQ 的主技术栈，不推倒重写。升级重点放在六个工程边界：分阶段 worker、专业抓取层、内容分层存储、provider 插件系统、Postgres evidence graph、跨 run 研究记忆。每个阶段都保持 RSS 新闻链路独立可用，Research 缺依赖时只影响 Research API。

**Tech Stack:** TypeScript、Express、React、Postgres、Redis/BullMQ、Puppeteer、Axios、JSDOM、Readability、pdf-parse、Gemini、Brave/SerpApi/Tavily/GitHub/npm/PyPI providers。

---

## File Structure

### Existing Files To Modify

- `src/server/research/types.ts`：新增 stage job payload、fetch policy、asset reference、provider capability、memory profile、graph relation 类型。
- `src/server/research/store.ts`：新增/迁移 Postgres 表、查询函数、run stage 状态更新函数。
- `src/server/research/run.ts`：从“完整执行 run”改为“轻量 orchestration + stage enqueue”，保留兼容入口。
- `src/server/research/routes.ts`：新增 stage health、asset、search、memory、graph API。
- `src/server/research/workers/queues.ts`：队列名称、BullMQ queue factory、job options、queue status。
- `src/server/research/workers/worker.ts`：拆成多个 worker 启动器。
- `src/server/research/crawler.ts`：逐步瘦身，只保留兼容 wrapper，真实抓取迁移到 `fetchers/`。
- `src/server/research/discovery/registry.ts`：升级为 provider plugin registry。
- `src/server/research/evidence/graph.ts`：从 claim 构造升级为 evidence graph 聚合。
- `src/components/ResearchPanel.tsx`：新增 worker health、source cache、graph、memory、asset/source preview。
- `.env.example`：新增抓取、资产、限速、索引相关配置。
- `README.md`、`docs/frontend-backend-crawler-architecture.md`：同步架构和运行方式。

### New Files To Create

- `src/server/research/workers/stageTypes.ts`：定义 `ResearchStageName`、每个 stage 的 BullMQ payload 和状态转换。
- `src/server/research/workers/stageRunner.ts`：通用 stage 执行器，统一记录 event、失败、耗时、重试。
- `src/server/research/workers/discoveryWorker.ts`：执行 provider discovery，写 `discovery_results` 和 `search_candidates`。
- `src/server/research/workers/frontierWorker.ts`：构建和刷新 priority frontier。
- `src/server/research/workers/fetchWorker.ts`：根据 frontier 抓取 URL，写 document 和 raw assets。
- `src/server/research/workers/extractWorker.ts`：执行 extractor router，写正文、链接、表格、资产引用。
- `src/server/research/workers/analyzeWorker.ts`：执行相关性、claim/evidence 抽取、source profile。
- `src/server/research/workers/reportWorker.ts`：基于 evidence graph 生成中文报告。
- `src/server/research/fetchers/fetchPolicy.ts`：robots、rate limit、retry、domain policy。
- `src/server/research/fetchers/httpFetcher.ts`：Axios 静态抓取。
- `src/server/research/fetchers/browserPool.ts`：Puppeteer browser/page pool。
- `src/server/research/fetchers/browserFetcher.ts`：动态网页抓取。
- `src/server/research/assets/rawAssetStore.ts`：HTML/PDF/text 原文分层存储。
- `src/server/research/search/documentIndex.ts`：Postgres full-text index 和文档检索。
- `src/server/research/discovery/providerTypes.ts`：provider plugin v2 类型、capability、cost、health。
- `src/server/research/discovery/providerRegistry.ts`：provider 注册、启停、排序、健康检查。
- `src/server/research/memory/researchMemory.ts`：跨 run topic/source/document/evidence 复用。
- `src/server/research/evaluation/benchmarkRunner.ts`：研究质量 benchmark。
- `src/server/research/evaluation/fixtures.ts`：固定 benchmark topic、期望来源类型、质量门。
- `src/server/research/platform.test.ts`：新架构测试入口，避免继续堆大 `research.test.ts`。

---

## Milestone 1: Worker Stage 拆分

目标：把当前单个 `executeResearchRun(runId)` 拆成 6 个可独立重试、观察、扩容的 stage worker。

### Task 1: Define Stage Contracts

**Files:**
- Create: `src/server/research/workers/stageTypes.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Write failing stage contract test**

```ts
import assert from "assert";
import { RESEARCH_STAGES, nextStageFor } from "./workers/stageTypes";

function testStageOrder() {
  assert.deepEqual(RESEARCH_STAGES, [
    "discovery",
    "frontier",
    "fetch",
    "extract",
    "analyze",
    "report",
  ]);
  assert.equal(nextStageFor("discovery"), "frontier");
  assert.equal(nextStageFor("report"), "completed");
}

testStageOrder();
console.log("platform tests passed");
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because `src/server/research/workers/stageTypes.ts` does not exist.

- [ ] **Step 3: Implement stage contracts**

```ts
export const RESEARCH_STAGES = [
  "discovery",
  "frontier",
  "fetch",
  "extract",
  "analyze",
  "report",
] as const;

export type ResearchStageName = typeof RESEARCH_STAGES[number];
export type ResearchStageTerminal = "completed" | "failed" | "cancelled";

export interface ResearchStageJobPayload {
  runId: string;
  jobId: string;
  stage: ResearchStageName;
  attemptReason: "initial" | "retry" | "resume" | "manual";
}

export function nextStageFor(stage: ResearchStageName): ResearchStageName | "completed" {
  const index = RESEARCH_STAGES.indexOf(stage);
  return RESEARCH_STAGES[index + 1] ?? "completed";
}
```

- [ ] **Step 4: Run test and full type check**

Run:

```bash
npx tsx src/server/research/platform.test.ts
npm run lint
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/research/workers/stageTypes.ts src/server/research/platform.test.ts
git commit -m "重构研究任务阶段契约"
```

### Task 2: Add Shared Stage Runner

**Files:**
- Create: `src/server/research/workers/stageRunner.ts`
- Modify: `src/server/research/store.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing test for stage runner result normalization**

Append to `src/server/research/platform.test.ts`:

```ts
import { normalizeStageError, stageEventMessage } from "./workers/stageRunner";

function testStageRunnerHelpers() {
  assert.equal(normalizeStageError(new Error("network timeout")), "network timeout");
  assert.equal(normalizeStageError("plain failure"), "plain failure");
  assert.equal(stageEventMessage("fetch", "started"), "fetch started");
  assert.equal(stageEventMessage("fetch", "completed"), "fetch completed");
}

testStageRunnerHelpers();
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because `stageRunner` helpers are missing.

- [ ] **Step 3: Implement runner helper and execution wrapper**

Create `src/server/research/workers/stageRunner.ts`:

```ts
import { addRunEvent, updateResearchRunStatus } from "../store";
import { ResearchStageJobPayload, ResearchStageName } from "./stageTypes";

export type StageHandler = (payload: ResearchStageJobPayload) => Promise<void>;

export async function runStage(payload: ResearchStageJobPayload, handler: StageHandler) {
  await updateResearchRunStatus(payload.runId, stageToRunStatus(payload.stage), stageToRunStatus(payload.stage));
  await addRunEvent({
    jobId: payload.jobId,
    runId: payload.runId,
    stage: payload.stage,
    level: "info",
    message: stageEventMessage(payload.stage, "started"),
  });

  try {
    await handler(payload);
    await addRunEvent({
      jobId: payload.jobId,
      runId: payload.runId,
      stage: payload.stage,
      level: "info",
      message: stageEventMessage(payload.stage, "completed"),
    });
  } catch (error) {
    await addRunEvent({
      jobId: payload.jobId,
      runId: payload.runId,
      stage: payload.stage,
      level: "error",
      message: normalizeStageError(error),
    });
    throw error;
  }
}

export function stageEventMessage(stage: ResearchStageName, state: "started" | "completed") {
  return `${stage} ${state}`;
}

export function normalizeStageError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stageToRunStatus(stage: ResearchStageName) {
  if (stage === "fetch") return "fetching";
  if (stage === "extract") return "extracting";
  if (stage === "analyze") return "analyzing";
  return stage;
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
npx tsx src/server/research/platform.test.ts
npm run lint
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/research/workers/stageRunner.ts src/server/research/platform.test.ts
git commit -m "新增研究阶段执行器"
```

### Task 3: Split BullMQ Queues And Workers

**Files:**
- Modify: `src/server/research/workers/queues.ts`
- Modify: `src/server/research/workers/worker.ts`
- Create: `src/server/research/workers/discoveryWorker.ts`
- Create: `src/server/research/workers/frontierWorker.ts`
- Create: `src/server/research/workers/fetchWorker.ts`
- Create: `src/server/research/workers/extractWorker.ts`
- Create: `src/server/research/workers/analyzeWorker.ts`
- Create: `src/server/research/workers/reportWorker.ts`
- Modify: `src/server/research/run.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing queue mapping test**

Append to `src/server/research/platform.test.ts`:

```ts
import { queueNameForStage } from "./workers/queues";

function testQueueNameForStage() {
  assert.equal(queueNameForStage("discovery"), "research.discovery");
  assert.equal(queueNameForStage("frontier"), "research.frontier");
  assert.equal(queueNameForStage("fetch"), "research.fetch");
  assert.equal(queueNameForStage("extract"), "research.extract");
  assert.equal(queueNameForStage("analyze"), "research.analyze");
  assert.equal(queueNameForStage("report"), "research.report");
}

testQueueNameForStage();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because `queueNameForStage` is missing.

- [ ] **Step 3: Implement queue mapping and enqueue API**

Add to `src/server/research/workers/queues.ts`:

```ts
import { ResearchStageJobPayload, ResearchStageName } from "./stageTypes";

export function queueNameForStage(stage: ResearchStageName) {
  return RESEARCH_QUEUE_NAMES[stage];
}

export async function enqueueResearchStage(payload: ResearchStageJobPayload) {
  const queue = getResearchQueue(queueNameForStage(payload.stage));
  return queue.add(payload.stage, payload, {
    jobId: `${payload.runId}:${payload.stage}`,
  });
}
```

- [ ] **Step 4: Create stage worker files with explicit handlers**

Each worker file exports one `processXStage(payload)` function. First implementation may call existing logic moved out of `run.ts`, but each function must own only one stage.

Example `src/server/research/workers/frontierWorker.ts`:

```ts
import { ResearchStageJobPayload } from "./stageTypes";
import { runStage } from "./stageRunner";

export async function processFrontierStage(payload: ResearchStageJobPayload) {
  await runStage(payload, async () => {
    const { buildFrontierForRun } = await import("../run");
    await buildFrontierForRun(payload.runId);
  });
}
```

- [ ] **Step 5: Update worker bootstrap**

`src/server/research/workers/worker.ts` should start one BullMQ `Worker` per queue:

```ts
const handlers = {
  discovery: processDiscoveryStage,
  frontier: processFrontierStage,
  fetch: processFetchStage,
  extract: processExtractStage,
  analyze: processAnalyzeStage,
  report: processReportStage,
};
```

- [ ] **Step 6: Run verification**

Run:

```bash
npx tsx src/server/research/platform.test.ts
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/research/workers src/server/research/run.ts src/server/research/platform.test.ts
git commit -m "拆分研究任务后台阶段队列"
```

---

## Milestone 2: 专业抓取层

目标：让抓取层具备 robots、限速、重试、动态网页能力，并可解释为什么抓或不抓。

### Task 4: Fetch Policy With Robots, Rate Limit, Retry

**Files:**
- Create: `src/server/research/fetchers/fetchPolicy.ts`
- Modify: `src/server/research/types.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing policy test**

```ts
import { createDomainLimiter, shouldRetryFetch } from "./fetchers/fetchPolicy";

async function testDomainLimiter() {
  const limiter = createDomainLimiter({ minDelayMs: 1000 });
  const first = limiter.nextAllowedAt("example.com", new Date("2026-06-01T00:00:00Z"));
  const second = limiter.nextAllowedAt("example.com", new Date("2026-06-01T00:00:00Z"));
  assert.equal(first.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(second.toISOString(), "2026-06-01T00:00:01.000Z");
  assert.equal(shouldRetryFetch({ status: 429, attempts: 1, maxAttempts: 3 }), true);
  assert.equal(shouldRetryFetch({ status: 404, attempts: 1, maxAttempts: 3 }), false);
}

await testDomainLimiter();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because fetch policy does not exist.

- [ ] **Step 3: Implement fetch policy**

```ts
export interface DomainLimiterConfig {
  minDelayMs: number;
}

export function createDomainLimiter(config: DomainLimiterConfig) {
  const nextByDomain = new Map<string, number>();

  return {
    nextAllowedAt(domain: string, now = new Date()) {
      const current = now.getTime();
      const next = nextByDomain.get(domain) ?? current;
      const allowed = Math.max(current, next);
      nextByDomain.set(domain, allowed + config.minDelayMs);
      return new Date(allowed);
    },
  };
}

export function shouldRetryFetch(input: { status?: number; attempts: number; maxAttempts: number }) {
  if (input.attempts >= input.maxAttempts) return false;
  if (!input.status) return true;
  return [408, 425, 429, 500, 502, 503, 504].includes(input.status);
}
```

- [ ] **Step 4: Add env config**

Add to `.env.example`:

```env
RESEARCH_FETCH_MAX_ATTEMPTS=3
RESEARCH_DOMAIN_MIN_DELAY_MS=1500
RESEARCH_RESPECT_ROBOTS_TXT=true
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example src/server/research/fetchers/fetchPolicy.ts src/server/research/platform.test.ts
git commit -m "新增研究抓取策略控制"
```

### Task 5: HTTP Fetcher And Browser Fetcher

**Files:**
- Create: `src/server/research/fetchers/httpFetcher.ts`
- Create: `src/server/research/fetchers/browserPool.ts`
- Create: `src/server/research/fetchers/browserFetcher.ts`
- Modify: `src/server/research/crawler.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing fetcher routing test**

```ts
import { chooseFetcherKind } from "./fetchers/httpFetcher";

function testFetcherKind() {
  assert.equal(chooseFetcherKind({ contentType: "text/html", url: "https://example.com" }), "http");
  assert.equal(chooseFetcherKind({ contentType: "", url: "https://example.com/app?spa=true" }), "browser");
  assert.equal(chooseFetcherKind({ contentType: "application/pdf", url: "https://example.com/a.pdf" }), "http");
}

testFetcherKind();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because fetcher modules do not exist.

- [ ] **Step 3: Implement `chooseFetcherKind`**

```ts
export type FetcherKind = "http" | "browser";

export function chooseFetcherKind(input: { contentType?: string; url: string }): FetcherKind {
  const url = input.url.toLowerCase();
  const contentType = (input.contentType ?? "").toLowerCase();
  if (contentType.includes("pdf") || url.endsWith(".pdf")) return "http";
  if (url.includes("spa=true") || url.includes("#/")) return "browser";
  return "http";
}
```

- [ ] **Step 4: Implement browser pool using existing Puppeteer dependency**

```ts
import puppeteer, { Browser, Page } from "puppeteer";

let browser: Browser | null = null;

export async function getBrowserPage(): Promise<Page> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
    });
  }
  return browser.newPage();
}

export async function closeBrowserPool() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
```

- [ ] **Step 5: Keep `crawler.ts` as compatibility wrapper**

Update `crawlPublicPage` so it delegates to HTTP fetcher first, then browser fetcher only when policy requires it or HTTP returns empty HTML for an HTML page.

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/research/fetchers src/server/research/crawler.ts src/server/research/platform.test.ts
git commit -m "新增研究抓取层和浏览器池"
```

---

## Milestone 3: 内容分层存储与检索

目标：Postgres 保存结构化元数据和索引，原始 HTML/PDF/text 保存到资产层，避免数据库无限膨胀。

### Task 6: Raw Asset Store

**Files:**
- Create: `src/server/research/assets/rawAssetStore.ts`
- Modify: `src/server/research/store.ts`
- Modify: `.env.example`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing asset path test**

```ts
import { assetPathFor } from "./assets/rawAssetStore";

function testAssetPathFor() {
  const path = assetPathFor({
    rootDir: ".data/research-assets",
    runId: "run-1",
    documentId: "doc-1",
    extension: "html",
  });
  assert.equal(path, ".data/research-assets/run-1/doc-1.html");
}

testAssetPathFor();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because raw asset store does not exist.

- [ ] **Step 3: Implement deterministic asset path and write/read**

```ts
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export interface AssetPathInput {
  rootDir: string;
  runId: string;
  documentId: string;
  extension: "html" | "txt" | "pdf" | "json";
}

export function assetPathFor(input: AssetPathInput) {
  return path.join(input.rootDir, input.runId, `${input.documentId}.${input.extension}`);
}

export async function writeRawAsset(input: AssetPathInput & { content: string | Buffer }) {
  const filePath = assetPathFor(input);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.content);
  return filePath;
}

export async function readRawAsset(filePath: string) {
  return readFile(filePath);
}
```

- [ ] **Step 4: Add env config**

```env
RESEARCH_ASSET_DIR=".data/research-assets"
RESEARCH_STORE_RAW_HTML=true
RESEARCH_STORE_RAW_PDF=true
```

- [ ] **Step 5: Update store schema**

Ensure `document_assets` stores:

```sql
asset_type TEXT NOT NULL,
url TEXT NOT NULL,
metadata JSONB NOT NULL DEFAULT '{}'
```

Metadata must include `path`, `contentType`, `sizeBytes`, `sha256`.

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example src/server/research/assets src/server/research/store.ts src/server/research/platform.test.ts
git commit -m "新增研究原始内容资产存储"
```

### Task 7: Postgres Full-Text Document Index

**Files:**
- Create: `src/server/research/search/documentIndex.ts`
- Modify: `src/server/research/store.ts`
- Modify: `src/server/research/routes.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing search query normalization test**

```ts
import { normalizeDocumentSearchQuery } from "./search/documentIndex";

function testDocumentSearchQueryNormalization() {
  assert.equal(normalizeDocumentSearchQuery("  PDF 转 DOCX   工具 "), "PDF & 转 & DOCX & 工具");
}

testDocumentSearchQueryNormalization();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because search module is missing.

- [ ] **Step 3: Implement query normalization**

```ts
export function normalizeDocumentSearchQuery(query: string) {
  return query.trim().split(/\s+/).filter(Boolean).join(" & ");
}
```

- [ ] **Step 4: Add Postgres index**

In `initResearchSchema()`:

```sql
ALTER TABLE crawl_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_crawl_documents_search_vector ON crawl_documents USING GIN(search_vector);
```

When upserting fetched documents:

```sql
search_vector = to_tsvector('simple', COALESCE(EXCLUDED.title, '') || ' ' || COALESCE(EXCLUDED.content_text, ''))
```

- [ ] **Step 5: Add API**

Add:

```text
GET /api/research/runs/:runId/search?q=<query>
```

Response:

```json
{
  "results": [
    {
      "documentId": "doc-id",
      "title": "source title",
      "url": "https://example.com",
      "rank": 0.75,
      "snippet": "matched text"
    }
  ]
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/research/search src/server/research/store.ts src/server/research/routes.ts src/server/research/platform.test.ts
git commit -m "新增研究文档全文检索"
```

---

## Milestone 4: Provider 插件系统

目标：Discovery provider 不再只是函数数组，而是可配置、可观测、可排序的插件系统。

### Task 8: Provider Plugin V2

**Files:**
- Create: `src/server/research/discovery/providerTypes.ts`
- Create: `src/server/research/discovery/providerRegistry.ts`
- Modify: `src/server/research/discovery/registry.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing provider capability test**

```ts
import { normalizeProviderCapability } from "./discovery/providerTypes";

function testProviderCapability() {
  const capability = normalizeProviderCapability({
    name: "github",
    sourceTypes: ["github"],
    costUnit: 0.2,
    reliability: 0.9,
  });
  assert.equal(capability.name, "github");
  assert.equal(capability.costUnit, 0.2);
  assert.equal(capability.reliability, 0.9);
}

testProviderCapability();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because provider v2 types do not exist.

- [ ] **Step 3: Implement provider capability type**

```ts
import { SourceType } from "../types";

export interface ProviderCapability {
  name: string;
  sourceTypes: SourceType[];
  costUnit: number;
  reliability: number;
}

export function normalizeProviderCapability(input: ProviderCapability): ProviderCapability {
  return {
    name: input.name,
    sourceTypes: input.sourceTypes,
    costUnit: clamp(input.costUnit),
    reliability: clamp(input.reliability),
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
```

- [ ] **Step 4: Implement registry scoring**

`providerRegistry.ts` exports:

```ts
export function sortProvidersForQuery(providers: ProviderCapability[], wantedTypes: SourceType[]) {
  return [...providers].sort((left, right) => {
    const leftMatch = left.sourceTypes.some((type) => wantedTypes.includes(type)) ? 1 : 0;
    const rightMatch = right.sourceTypes.some((type) => wantedTypes.includes(type)) ? 1 : 0;
    return (rightMatch + right.reliability - right.costUnit) - (leftMatch + left.reliability - left.costUnit);
  });
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/research/discovery/providerTypes.ts src/server/research/discovery/providerRegistry.ts src/server/research/discovery/registry.ts src/server/research/platform.test.ts
git commit -m "升级研究发现 provider 插件契约"
```

### Task 9: Provider Health, Cost, And Quality Metrics

**Files:**
- Modify: `src/server/research/store.ts`
- Modify: `src/server/research/routes.ts`
- Modify: `src/components/ResearchPanel.tsx`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add provider health aggregation test**

```ts
import { aggregateProviderHealth } from "./discovery/providerRegistry";

function testProviderHealthAggregation() {
  const health = aggregateProviderHealth([
    { provider: "brave", candidateCount: 10, error: undefined, durationMs: 1000 },
    { provider: "brave", candidateCount: 0, error: "429", durationMs: 2000 },
  ]);
  assert.equal(health[0].provider, "brave");
  assert.equal(health[0].calls, 2);
  assert.equal(health[0].errors, 1);
  assert.equal(health[0].candidateCount, 10);
}

testProviderHealthAggregation();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because aggregator is missing.

- [ ] **Step 3: Implement aggregator**

```ts
export function aggregateProviderHealth(rows: Array<{
  provider: string;
  candidateCount: number;
  error?: string;
  durationMs: number;
}>) {
  const map = new Map<string, { provider: string; calls: number; errors: number; candidateCount: number; durationMs: number }>();
  for (const row of rows) {
    const current = map.get(row.provider) ?? { provider: row.provider, calls: 0, errors: 0, candidateCount: 0, durationMs: 0 };
    current.calls += 1;
    current.errors += row.error ? 1 : 0;
    current.candidateCount += row.candidateCount;
    current.durationMs += row.durationMs;
    map.set(row.provider, current);
  }
  return [...map.values()];
}
```

- [ ] **Step 4: Surface metrics in API and UI**

Add:

```text
GET /api/research/providers/health
```

Research UI Provider Panel shows calls, candidates, errors, average latency, and last error.

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/research/discovery/providerRegistry.ts src/server/research/routes.ts src/components/ResearchPanel.tsx src/server/research/platform.test.ts
git commit -m "新增研究 provider 健康指标"
```

---

## Milestone 5: Postgres Evidence Graph

目标：先用 Postgres 把 claim、evidence、document、source、run 的关系建实；只有当查询复杂度证明需要时再迁移图数据库。

### Task 10: Evidence Graph Relations

**Files:**
- Modify: `src/server/research/types.ts`
- Modify: `src/server/research/store.ts`
- Modify: `src/server/research/evidence/graph.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing relation test**

```ts
import { buildEvidenceRelation } from "./evidence/graph";

function testEvidenceRelation() {
  const relation = buildEvidenceRelation({
    claimId: "claim-1",
    evidenceId: "ev-1",
    relation: "supports",
    confidence: 0.8,
  });
  assert.equal(relation.relation, "supports");
  assert.equal(relation.confidence, 0.8);
}

testEvidenceRelation();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because relation builder is missing.

- [ ] **Step 3: Add relation type**

```ts
export type EvidenceRelationKind = "supports" | "contradicts" | "mentions" | "derived_from";

export interface EvidenceRelation {
  id?: string;
  claimId: string;
  evidenceId: string;
  relation: EvidenceRelationKind;
  confidence: number;
  createdAt?: string;
}
```

- [ ] **Step 4: Add Postgres table**

```sql
CREATE TABLE IF NOT EXISTS evidence_relations (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES evidence_claims(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(claim_id, evidence_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_evidence_relations_claim ON evidence_relations(claim_id);
```

- [ ] **Step 5: Implement builder**

```ts
export function buildEvidenceRelation(input: {
  claimId: string;
  evidenceId: string;
  relation: EvidenceRelationKind;
  confidence: number;
}): EvidenceRelation {
  return {
    claimId: input.claimId,
    evidenceId: input.evidenceId,
    relation: input.relation,
    confidence: Math.max(0, Math.min(1, input.confidence)),
  };
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/research/types.ts src/server/research/store.ts src/server/research/evidence/graph.ts src/server/research/platform.test.ts
git commit -m "新增研究证据图关系表"
```

### Task 11: Graph Query API And Report Inputs

**Files:**
- Modify: `src/server/research/store.ts`
- Modify: `src/server/research/routes.ts`
- Modify: `src/server/research/reports.ts`
- Modify: `src/components/ResearchPanel.tsx`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add graph summary pure function test**

```ts
import { summarizeEvidenceGraph } from "./evidence/graph";

function testEvidenceGraphSummary() {
  const summary = summarizeEvidenceGraph({
    claims: [{ id: "c1", status: "supported" }, { id: "c2", status: "contradicted" }],
    relations: [{ relation: "supports" }, { relation: "contradicts" }],
  });
  assert.equal(summary.supportedClaims, 1);
  assert.equal(summary.contradictedClaims, 1);
  assert.equal(summary.supportingRelations, 1);
  assert.equal(summary.conflictingRelations, 1);
}

testEvidenceGraphSummary();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because graph summary is missing.

- [ ] **Step 3: Implement summary and API**

Add:

```text
GET /api/research/runs/:runId/graph
```

Response:

```json
{
  "claims": [],
  "evidence": [],
  "relations": [],
  "sources": [],
  "summary": {
    "supportedClaims": 0,
    "contradictedClaims": 0,
    "supportingRelations": 0,
    "conflictingRelations": 0
  }
}
```

- [ ] **Step 4: Update report generator input**

`generateMarkdownReport` should accept graph summary and include:

- 研究摘要
- 关键结论
- 证据表
- 来源质量
- 冲突信息
- 时间线
- 尚不确定的问题
- 下一步建议搜索
- 完整来源列表

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/research/store.ts src/server/research/routes.ts src/server/research/reports.ts src/components/ResearchPanel.tsx src/server/research/platform.test.ts
git commit -m "新增研究证据图查询和报告输入"
```

---

## Milestone 6: Research Memory Layer

目标：同一主题后续 run 能复用已发现来源、已抓正文、source credibility 和历史 evidence，不再每次从零开始。

### Task 12: Topic And Source Memory

**Files:**
- Create: `src/server/research/memory/researchMemory.ts`
- Modify: `src/server/research/store.ts`
- Modify: `src/server/research/types.ts`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing topic fingerprint test**

```ts
import { topicFingerprint } from "./memory/researchMemory";

function testTopicFingerprint() {
  assert.equal(topicFingerprint("  好用的 文档转换工具 "), "好用的 文档转换工具");
  assert.equal(topicFingerprint("OpenAI Responses API"), "openai responses api");
}

testTopicFingerprint();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because memory module is missing.

- [ ] **Step 3: Implement fingerprint**

```ts
export function topicFingerprint(topic: string) {
  const normalized = topic.trim().replace(/\s+/g, " ");
  return /[\u4e00-\u9fff]/.test(normalized) ? normalized : normalized.toLowerCase();
}
```

- [ ] **Step 4: Add memory tables**

```sql
CREATE TABLE IF NOT EXISTS research_topic_memory (
  id TEXT PRIMARY KEY,
  topic_fingerprint TEXT NOT NULL UNIQUE,
  latest_job_id TEXT,
  latest_run_id TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_memory (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  source_profile_id TEXT,
  successful_fetches INTEGER NOT NULL DEFAULT 0,
  failed_fetches INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test
npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/research/memory src/server/research/store.ts src/server/research/types.ts src/server/research/platform.test.ts
git commit -m "新增研究主题和来源记忆"
```

### Task 13: Incremental Run Reuse

**Files:**
- Modify: `src/server/research/run.ts`
- Modify: `src/server/research/frontier/queue.ts`
- Modify: `src/server/research/memory/researchMemory.ts`
- Modify: `src/server/research/routes.ts`
- Modify: `src/components/ResearchPanel.tsx`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add failing reuse decision test**

```ts
import { shouldReuseDocument } from "./memory/researchMemory";

function testShouldReuseDocument() {
  assert.equal(shouldReuseDocument({
    fetchedAt: "2026-06-01T00:00:00.000Z",
    now: "2026-06-01T12:00:00.000Z",
    maxAgeHours: 24,
    contentHashMatches: true,
  }), true);
  assert.equal(shouldReuseDocument({
    fetchedAt: "2026-05-20T00:00:00.000Z",
    now: "2026-06-01T12:00:00.000Z",
    maxAgeHours: 24,
    contentHashMatches: true,
  }), false);
}

testShouldReuseDocument();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because reuse decision is missing.

- [ ] **Step 3: Implement reuse decision**

```ts
export function shouldReuseDocument(input: {
  fetchedAt: string;
  now: string;
  maxAgeHours: number;
  contentHashMatches: boolean;
}) {
  if (!input.contentHashMatches) return false;
  const ageMs = new Date(input.now).getTime() - new Date(input.fetchedAt).getTime();
  return ageMs >= 0 && ageMs <= input.maxAgeHours * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Apply reuse to run lifecycle**

Before enqueueing a frontier item for fetch:

1. Check whether same canonical URL was fetched in a prior run.
2. Reuse document if `shouldReuseDocument` returns true.
3. Add run event `document_reused`.
4. Link reused document into current run by inserting a lightweight `crawl_documents` row or a `run_document_refs` row.

- [ ] **Step 5: Add UI indicator**

Source Explorer shows:

- `fresh` for newly fetched
- `reused` for memory hit
- `stale` for skipped stale source

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/research/run.ts src/server/research/frontier/queue.ts src/server/research/memory/researchMemory.ts src/server/research/routes.ts src/components/ResearchPanel.tsx src/server/research/platform.test.ts
git commit -m "支持研究 run 复用历史抓取记忆"
```

---

## Milestone 7: Quality Gates And Benchmarks

目标：证明升级后的爬虫真的更强，而不是只是模块更多。

### Task 14: Benchmark Runner

**Files:**
- Create: `src/server/research/evaluation/fixtures.ts`
- Create: `src/server/research/evaluation/benchmarkRunner.ts`
- Modify: `package.json`
- Test: `src/server/research/platform.test.ts`

- [ ] **Step 1: Add benchmark fixture test**

```ts
import { RESEARCH_BENCHMARK_FIXTURES } from "./evaluation/fixtures";

function testBenchmarkFixtures() {
  assert.ok(RESEARCH_BENCHMARK_FIXTURES.find((fixture) => fixture.id === "document-converter-tools"));
  assert.ok(RESEARCH_BENCHMARK_FIXTURES.find((fixture) => fixture.id === "news-origin-verification"));
}

testBenchmarkFixtures();
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx tsx src/server/research/platform.test.ts
```

Expected: FAIL because fixtures are missing.

- [ ] **Step 3: Add fixtures**

```ts
export const RESEARCH_BENCHMARK_FIXTURES = [
  {
    id: "document-converter-tools",
    topic: "好用的文档转换工具 Markdown DOCX PDF PPT 表格互转 本地可跑",
    requiredSourceTypes: ["official", "github", "package-registry", "community", "benchmark"],
    minimumEvidenceCount: 8,
  },
  {
    id: "news-origin-verification",
    topic: "查证某条关于 AI 芯片出口管制的新闻是否真实，并找到原始出处",
    requiredSourceTypes: ["official", "mainstream-news", "company"],
    minimumEvidenceCount: 5,
  },
] as const;
```

- [ ] **Step 4: Add script**

In `package.json`:

```json
{
  "scripts": {
    "test:research-platform": "tsx src/server/research/platform.test.ts",
    "benchmark:research": "tsx src/server/research/evaluation/benchmarkRunner.ts"
  }
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test
npm run test:research-platform
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/server/research/evaluation src/server/research/platform.test.ts
git commit -m "新增深度研究爬虫质量基准"
```

---

## Execution Order

1. Milestone 1：先拆 worker stage，保证长任务可恢复。
2. Milestone 2：再升级抓取层，提升覆盖面和稳定性。
3. Milestone 3：再做内容分层和全文检索，避免数据量拖垮 Postgres。
4. Milestone 4：再把 provider 做成插件，降低扩展成本。
5. Milestone 5：再增强 evidence graph，让报告更可信。
6. Milestone 6：最后加 memory layer，让研究可以积累。
7. Milestone 7：贯穿执行，但最终用 benchmark 判断效果。

## Acceptance Criteria

- `POST /api/research/jobs/:id/runs` 返回 202 后不阻塞 API，请求只负责创建 run 和入队。
- 每个 run 的 discovery、frontier、fetch、extract、analyze、report 都能独立记录 event、失败原因、耗时和重试状态。
- 单个 provider 失败不会阻断同一 query 的其他 provider。
- 单个 URL 抓取失败会写入 frontier failed/skipped reason。
- 抓取层遵守 per-domain delay，并能解释因为 budget、robots、content type 或 retry exhaustion 而跳过的 URL。
- HTML/PDF/GitHub/npm/PyPI/sitemap/table 都有 extractor 路由和测试覆盖。
- 原始 HTML/PDF/text 可落到 asset store；Postgres 只保存 metadata、索引、正文摘要和 evidence。
- Source Explorer 能显示来源层级、官方概率、主流概率、抓取状态、失败原因、原文摘录和被哪些 claim 引用。
- Evidence graph API 能返回 claims、evidence、relations、sources 和 summary。
- 同一 topic 的后续 run 能复用历史来源和文档，并在 run event 中可见。
- RSS 新闻链路在缺 Postgres、Redis、搜索 provider、Gemini 时仍可启动和使用。

## Verification Commands

```bash
npm run test
npm run test:research-platform
npm run lint
npm run build
```

Manual smoke:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

Check:

- 首页默认简体中文。
- Research job 可以创建 run。
- Run Timeline 显示 stage events。
- Source Explorer 可打开文档详情。
- RSS Monitoring 仍可添加、启停、刷新 RSS 源。

## Rollback Plan

- Worker split rollback：保留 `/api/research/jobs/:id/run` 兼容入口，必要时让入口调用旧 `executeResearchRun(runId)`。
- Fetch layer rollback：`crawler.ts` 保持 wrapper，环境变量 `RESEARCH_BROWSER_FETCH_ENABLED=false` 时只走 HTTP fetcher。
- Asset store rollback：Postgres 中保留 `content_text`，asset 写入失败只记录 event，不阻断文档正文保存。
- Provider registry rollback：保留现有 provider adapter，v2 registry 可以只包裹旧 provider。
- Evidence graph rollback：报告生成可继续从 `evidence_items` 读取，不依赖 `evidence_relations`。
- Memory rollback：关闭 `RESEARCH_MEMORY_ENABLED=false` 后每个 run 从新 frontier 开始。

## Self-Review

- Spec coverage：六点都映射到 milestone：worker 拆分、抓取层、存储分层、provider 插件、Postgres evidence graph、research memory。
- Placeholder scan：没有 `TBD`、`TODO` 或空任务；每个任务都有文件、测试、实现片段、验证命令、commit。
- Type consistency：`ResearchStageName`、`ResearchStageJobPayload`、`EvidenceRelation`、`ProviderCapability`、memory 函数名在任务中保持一致。
