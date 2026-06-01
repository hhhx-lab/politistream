# Research Crawler Six-Point Engineering Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PolitiStream 的 Research 爬虫升级为可持续深挖、可恢复、可审计、可评测的深度研究爬虫平台。

**Architecture:** 不推倒重写当前 React + Vite + Express + TypeScript 主栈。升级重点放在六个工程边界：任务编排与 worker 化、专业抓取层、内容存储与检索、provider/frontier/extractor 插件化、证据图谱与可信度评分、可观测 UI 与质量评测。RSS 新闻监控保持独立链路，Research 依赖缺失时只降级 Research 功能。

**Tech Stack:** TypeScript、React、Vite、Express、Postgres、Redis/BullMQ、Axios、Puppeteer、JSDOM、Readability、pdf-parse、Cheerio、Gemini、Brave Search、SerpApi、Tavily、GitHub REST API、npm Registry API、PyPI JSON API。

---

## 0. Current Baseline

当前仓库已有基础能力，升级应基于现状继续演进：

- 前端入口：`src/App.tsx`、`src/components/ResearchPanel.tsx` 已有搜索优先与 Research 面板。
- Research API：`src/server/research/routes.ts` 已有 jobs、runs、events、frontier、documents、evidence、providers、sources API。
- Research 执行：`src/server/research/run.ts` 已有 discovery、frontier、fetch、extract、analyze、report 阶段函数。
- 队列基础：`src/server/research/workers/` 已开始拆分 stage worker 与 BullMQ queues。
- 抽取基础：`src/server/research/extractors/` 已覆盖 HTML、PDF、GitHub、npm/PyPI、sitemap、table 的第一版骨架。
- 证据基础：`src/server/research/evidence/graph.ts` 已有 claim/source profile/credibility 的初版逻辑。
- 配置基础：`.env.example` 已有 Research provider、Postgres、Redis 等配置说明。

当前主要缺口：

- fetch 层仍偏同步与单机简单请求，缺少 robots、域名限速、浏览器 fallback、原文资产留存和可重试策略闭环。
- frontier 仍是数据库记录加阶段处理，尚未形成真正可扩容的 priority queue 运行模型。
- provider registry 还不能表达 capability、cost、health、任务类型匹配和 provider 降级。
- evidence graph 还偏列表聚合，缺少 claim relation、冲突关系、来源可信度解释和图查询 API。
- UI 对 source explorer、frontier 状态、provider 健康、证据关系和质量评分的表达还不够完整。
- 缺少固定 benchmark，无法工程化评估“深度调研能力是否真的变强”。

## 1. Target Architecture

```mermaid
flowchart TD
  A["Search-first UI"] --> B["Express Research API"]
  B --> C["Research Run Orchestrator"]
  C --> D["BullMQ Stage Queues"]
  D --> D1["Discovery Worker"]
  D --> D2["Frontier Worker"]
  D --> D3["Fetch Worker"]
  D --> D4["Extract Worker"]
  D --> D5["Analyze Worker"]
  D --> D6["Report Worker"]
  D1 --> E["Provider Registry"]
  E --> E1["Web Search"]
  E --> E2["RSS"]
  E --> E3["Sitemap"]
  E --> E4["GitHub"]
  E --> E5["npm / PyPI"]
  E --> E6["Official Sources"]
  D2 --> F["Priority Frontier"]
  D3 --> G["Professional Fetch Layer"]
  G --> G1["HTTP Fetcher"]
  G --> G2["Browser Fetcher"]
  G --> G3["Robots + Rate Limit"]
  D4 --> H["Extractor Router"]
  H --> H1["HTML / PDF / GitHub / Package / Sitemap / Table"]
  H --> I["Document Store + Raw Asset Store + Search Index"]
  D5 --> J["Evidence Graph + Credibility Scoring"]
  D6 --> K["Chinese Report Generator"]
  I --> L["Source Explorer UI"]
  J --> L
  K --> L
```

## 2. Six Engineering Upgrade Tracks

### Track A: 任务编排与 Worker 化

目标：API 不再承担长任务，Research run 通过 BullMQ stage queue 执行，每个阶段可暂停、恢复、重试、取消和观测。

涉及文件：

- `src/server/research/workers/stageTypes.ts`
- `src/server/research/workers/stageRunner.ts`
- `src/server/research/workers/queues.ts`
- `src/server/research/workers/worker.ts`
- `src/server/research/workers/*Worker.ts`
- `src/server/research/run.ts`
- `src/server/research/routes.ts`
- `src/server/research/store.ts`
- `src/server/research/platform.test.ts`

执行任务：

- [ ] 固化 stage 状态机：`discovery -> frontier -> fetch -> extract -> analyze -> report -> completed`。
- [ ] 每个 stage queue 使用独立 BullMQ queue name：`research.discovery`、`research.frontier`、`research.fetch`、`research.extract`、`research.analyze`、`research.report`。
- [ ] `POST /api/research/jobs/:id/runs` 只创建 run 并入队，不等待完整研究完成。
- [ ] `POST /api/research/jobs/:id/run` 保留兼容，内部调用新 runs API 逻辑。
- [ ] `pause/resume/cancel` 必须写入 `run_events`，worker 每个批次处理前检查 run 状态。
- [ ] stage 失败时写入 `run_events`、更新 `research_runs.status=failed`，并保留失败 stage 与错误原因。
- [ ] worker 启动时输出 queue health，API 提供 `/api/research/queues`。

验收标准：

- `npm run test:research` 覆盖 run 创建、入队、暂停、恢复、取消。
- `npx tsx src/server/research/platform.test.ts` 覆盖 stage order、queue name、stage runner failure normalization。
- Redis 未配置时，Research run 返回清晰 503；RSS 新闻 API 仍可用。

建议提交：

```bash
git add src/server/research/workers src/server/research/run.ts src/server/research/routes.ts src/server/research/store.ts src/server/research/platform.test.ts
git commit -m "升级研究任务为分阶段队列执行"
```

### Track B: 专业抓取层

目标：把 `crawler.ts` 从“直接 axios 抓网页”升级为具备策略、礼貌抓取、浏览器 fallback、失败分类和原文保存的 fetch layer。

涉及文件：

- `src/server/research/crawler.ts`
- `src/server/research/fetchers/fetchPolicy.ts`
- `src/server/research/fetchers/httpFetcher.ts`
- `src/server/research/fetchers/browserPool.ts`
- `src/server/research/fetchers/browserFetcher.ts`
- `src/server/research/config.ts`
- `.env.example`
- `src/server/research/platform.test.ts`

核心接口：

```ts
export type FetcherKind = "http" | "browser";

export interface FetchContentResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  body: Buffer;
  fetchedAt: string;
  fetcher: FetcherKind;
  durationMs: number;
}
```

执行任务：

- [ ] `fetchPolicy.ts` 实现 robots.txt 解析、域名级最小间隔、retry 判断、blocked status 分类。
- [ ] `httpFetcher.ts` 统一 Axios 配置：User-Agent、Accept、timeout、redirect、content length、arraybuffer。
- [ ] `browserPool.ts` 管理 Puppeteer browser/page 生命周期，支持最大并发和 idle close。
- [ ] `browserFetcher.ts` 只在 HTML 页面疑似 SPA、静态抓取正文为空、或配置强制时启用。
- [ ] `crawler.ts` 调用 fetch layer，再交给 extractor router；不再直接承担网络策略。
- [ ] `.env.example` 增加并用中文注释：
  - `RESEARCH_FETCH_MAX_ATTEMPTS`
  - `RESEARCH_DOMAIN_MIN_DELAY_MS`
  - `RESEARCH_RESPECT_ROBOTS_TXT`
  - `RESEARCH_BROWSER_FETCH_ENABLED`
  - `RESEARCH_BROWSER_MAX_PAGES`
  - `RESEARCH_FETCH_TIMEOUT_MS`
  - `RESEARCH_MAX_CONTENT_BYTES`
- [ ] 抓取失败必须归类为 `failed`、`blocked`、`skipped`，并写入 `frontier_items.last_error`。

验收标准：

- 对 `401/403/451` 返回 `blocked`。
- 对 `429/5xx/timeout` 标记可重试。
- robots 禁止的 URL 不抓取，frontier 写 `skipped` 与原因。
- 同一 domain 连续抓取间隔不小于配置值。
- 静态 HTML 空正文时可启用 browser fallback。

建议提交：

```bash
git add src/server/research/fetchers src/server/research/crawler.ts src/server/research/config.ts .env.example src/server/research/platform.test.ts
git commit -m "升级研究爬虫抓取策略"
```

### Track C: 内容存储、资产留存与检索

目标：所有抓取内容可追溯、可搜索、可复用。正文进 Postgres，原始 HTML/PDF/text 进入本地资产目录，后续可替换为对象存储。

涉及文件：

- `src/server/research/assets/rawAssetStore.ts`
- `src/server/research/search/documentIndex.ts`
- `src/server/research/store.ts`
- `src/server/research/routes.ts`
- `src/server/research/types.ts`
- `.env.example`
- `src/server/research/platform.test.ts`

新增/完善数据表：

- `document_assets`
- `document_links`
- `extracted_tables`
- `crawl_documents.search_vector`

核心接口：

```ts
export interface RawAssetReference {
  documentId: string;
  runId: string;
  url: string;
  assetKind: "html" | "pdf" | "text" | "json";
  path: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}
```

执行任务：

- [ ] `rawAssetStore.ts` 按 `runId/domain/hash` 生成稳定文件路径。
- [ ] 保存原始响应前计算 sha256，避免重复写入同一资产。
- [ ] `store.ts` 增加 `upsertDocumentAsset`、`listDocumentAssetsForRun`。
- [ ] `documentIndex.ts` 使用 Postgres full-text search 建立 `title + contentText` 检索。
- [ ] 新增 `GET /api/research/runs/:runId/search?q=...`。
- [ ] 新增 `GET /api/research/runs/:runId/assets`。
- [ ] `.env.example` 增加并注释：
  - `RESEARCH_ASSET_DIR`
  - `RESEARCH_STORE_RAW_HTML`
  - `RESEARCH_STORE_RAW_PDF`
  - `RESEARCH_STORE_RAW_TEXT`
- [ ] 前端 source explorer 支持展示资产是否已保存、内容哈希、抓取时间。

验收标准：

- 同一个 URL 多次抓取不会重复写相同 sha256 资产。
- 搜索 run 内关键词能返回对应文档、标题、URL、摘录。
- 删除 `.data/research-assets` 后系统能重新创建目录。
- 资产目录不进入 git。

建议提交：

```bash
git add src/server/research/assets src/server/research/search src/server/research/store.ts src/server/research/routes.ts src/server/research/types.ts .env.example
git commit -m "增加研究内容资产存储与全文检索"
```

### Track D: Provider Registry、Priority Frontier 与多 Extractor

目标：把搜索入口、候选归一化、frontier 排序和内容抽取都插件化，使系统能覆盖网页、RSS、sitemap、GitHub、npm/PyPI、PDF、表格与官方来源。

涉及文件：

- `src/server/research/discovery/providerTypes.ts`
- `src/server/research/discovery/providerRegistry.ts`
- `src/server/research/discovery/registry.ts`
- `src/server/research/frontier/queue.ts`
- `src/server/research/frontier/scoring.ts`
- `src/server/research/extractors/router.ts`
- `src/server/research/extractors/*.ts`
- `src/server/research/searchProviders.ts`
- `src/server/research/platform.test.ts`

Provider capability：

```ts
export interface DiscoveryProviderCapability {
  name: string;
  providerType: "web-search" | "rss" | "sitemap" | "github" | "package-registry" | "official" | "community";
  sourceTypes: SourceType[];
  queryPurposes: QueryPurpose[];
  requiresApiKey: boolean;
  costUnit: number;
  enabled: boolean;
}
```

Priority score 固定权重：

- 主题相关度：25%
- 来源权威性：25%
- 原始来源概率：20%
- 新鲜度：10%
- 来源多样性：10%
- 链接上下文质量：10%

执行任务：

- [ ] `providerTypes.ts` 定义 provider 输入、输出、capability、health、error contract。
- [ ] `providerRegistry.ts` 支持注册、启停、按 query purpose 排序 provider。
- [ ] Brave、SerpApi、Tavily 接入 provider v2。
- [ ] RSS provider 读取 SQLite `rss_sources` 中启用源，但不迁移 RSS 数据。
- [ ] Sitemap provider 对 seed URL domain 和 official domain 发现 sitemap。
- [ ] GitHub provider 抓 README、stars、license、release、issue 活跃度。
- [ ] npm/PyPI provider 抓版本、license、依赖、下载或活跃信号。
- [ ] Official provider 识别官网、政府、监管、公司页面。
- [ ] `frontier/scoring.ts` 按固定公式输出 `priorityScore` 和 `reason`。
- [ ] `frontier/queue.ts` 支持 Quick/Standard/Deep budget：
  - Quick：30 URL、depth 1、10 domains
  - Standard：150 URL、depth 2、40 domains
  - Deep：500 URL、depth 3、100 domains
- [ ] extractor router 按 content type、URL pattern、provider type 分发。
- [ ] 表格抽取写入 `extracted_tables`，链接抽取写入 `document_links`。

验收标准：

- 单个 provider 失败不阻塞其他 provider。
- 无搜索 API key 时 provider health 显示缺失，Research UI 给出降级说明。
- frontier 不超过 URL、depth、domain budget。
- GitHub/npm/PyPI/sitemap URL 能路由到对应 extractor。
- 抓取正文保持原语言，不做翻译。

建议提交：

```bash
git add src/server/research/discovery src/server/research/frontier src/server/research/extractors src/server/research/searchProviders.ts src/server/research/platform.test.ts
git commit -m "扩展研究发现源和优先级 frontier"
```

### Track E: Evidence Graph、Credibility Scoring 与中文报告

目标：报告不再只是文档摘要集合，而是由 claim、evidence、source profile、support/contradict relation 组成的证据图谱驱动。

涉及文件：

- `src/server/research/evidence/graph.ts`
- `src/server/research/analysis.ts`
- `src/server/research/reports.ts`
- `src/server/research/store.ts`
- `src/server/research/routes.ts`
- `src/server/research/types.ts`
- `src/server/services/ai.ts`
- `src/server/research/platform.test.ts`

新增/完善数据表：

- `evidence_claims`
- `evidence_items`
- `evidence_relations`
- `source_profiles`

核心关系：

```ts
export interface EvidenceRelation {
  runId: string;
  claimId: string;
  evidenceId: string;
  relation: "supports" | "contradicts" | "context" | "source_of";
  confidence: number;
  rationale: string;
}
```

报告固定章节：

1. 研究摘要
2. 关键结论
3. 证据表
4. 来源质量
5. 冲突信息
6. 时间线
7. 尚不确定的问题
8. 下一步建议搜索
9. 完整来源列表

执行任务：

- [ ] `source_profiles` 按 domain 记录 source type、authority tier、official likelihood、mainstream likelihood、notes。
- [ ] `credibilityScoreFor` 合并 authority tier、source type、official likelihood、freshness、evidence density。
- [ ] Gemini 只用于相关性判断、claim 抽取、evidence 抽取、冲突判断、报告表达。
- [ ] 所有 Gemini 输出必须通过 JSON parse 与字段校验，不合法则降级为规则抽取。
- [ ] `evidence_relations` 记录 supports/contradicts/context/source_of。
- [ ] `GET /api/research/runs/:runId/graph` 返回 claims、evidence、relations、sources。
- [ ] `reports.ts` 只基于 graph 输入生成报告，默认简体中文。
- [ ] 前端 Evidence Table 支持 claim、supporting evidence、conflicting evidence、confidence、source tier。

验收标准：

- 报告中的每条关键结论至少关联一条 evidence 或标注“不确定”。
- conflicting evidence 在报告中单独列出，不被摘要吞掉。
- AI 摘要和报告默认简体中文；爬取正文按原语言展示。
- 证据项能回跳到原始 URL 与 Source Explorer。

建议提交：

```bash
git add src/server/research/evidence src/server/research/analysis.ts src/server/research/reports.ts src/server/research/store.ts src/server/research/routes.ts src/server/research/types.ts src/server/services/ai.ts
git commit -m "增加研究证据图谱与可信度评分"
```

### Track F: Source Explorer UI、可观测性、评测与部署

目标：用户能看懂系统如何调研，工程上能判断质量、性能、成本和失败原因。

涉及文件：

- `src/components/ResearchPanel.tsx`
- `src/App.tsx`
- `src/types.ts`
- `src/i18n.ts`
- `src/i18n.test.ts`
- `src/server/research/evaluation/fixtures.ts`
- `src/server/research/evaluation/benchmarkRunner.ts`
- `package.json`
- `README.md`
- `docs/frontend-backend-crawler-architecture.md`
- `.env.example`

UI 模块：

- Run Timeline：planning、discovery、frontier、fetching、extracting、analyzing、reporting。
- Frontier View：queued、fetching、fetched、failed、skipped。
- Source Explorer：URL、状态、正文摘录、来源评分、引用 claim、失败原因、raw asset。
- Evidence Table：claim、supporting evidence、conflicting evidence、confidence、source tier。
- Provider Panel：provider 调用次数、候选数、错误、耗时、成本单位、健康状态。
- Language Toggle：中英文 UI 一键切换；报告默认中文；原文不翻译。

Benchmark fixtures：

- 文档转换工具调研：要求覆盖官网、GitHub、npm/PyPI、文档页、社区反馈。
- 新闻查证溯源：要求覆盖最早出处、官方回应、主流媒体、反向证据。
- 政策研究：要求覆盖官方文本、监管机构、主流解读、冲突观点。
- 技术选型：要求覆盖官方文档、release、issue、benchmark、替代方案。

执行任务：

- [ ] `src/types.ts` 对齐后端新增 API response 类型。
- [ ] `ResearchPanel.tsx` 拆分为更小组件，避免单文件继续膨胀：
  - `ResearchRunList.tsx`
  - `ResearchTimeline.tsx`
  - `FrontierView.tsx`
  - `SourceExplorer.tsx`
  - `EvidenceTable.tsx`
  - `ProviderPanel.tsx`
- [ ] `src/i18n.ts` 增加所有新 UI 文案的中英文 key。
- [ ] `i18n.test.ts` 校验中英文 key 完整。
- [ ] `benchmarkRunner.ts` 固定输出 JSON：coverage、sourceDiversity、evidenceDensity、conflictCoverage、reportCompleteness。
- [ ] `package.json` 增加：
  - `test:research-platform`
  - `benchmark:research`
- [ ] README 增加 Research 平台运行方式、Redis/Postgres 要求、worker 启动方式、benchmark 命令。
- [ ] `.env.example` 保持中文注释，每个环境变量说明“是什么、怎么获得、是否必需”。

验收标准：

- 前端默认简体中文，切换英文后所有 UI 文案都有英文显示。
- Source Explorer 可打开文档详情、查看引用 claim、跳转原始 URL。
- Provider Panel 能显示 provider 缺 key、失败、耗时、候选数。
- benchmark 至少能在 mock/provider-disabled 模式下跑通，输出可读 JSON。
- `npm run test`、`npm run test:research-platform`、`npm run lint`、`npm run build` 全部通过。

建议提交：

```bash
git add src/components src/App.tsx src/types.ts src/i18n.ts src/i18n.test.ts src/server/research/evaluation package.json README.md docs/frontend-backend-crawler-architecture.md .env.example
git commit -m "完善研究来源浏览与质量评测"
```

## 3. Recommended Delivery Order

按下面顺序交付，避免一次性改动过大：

1. Track A：先完成 worker stage 生命周期，让长任务不阻塞 API。
2. Track B：再完成专业 fetch layer，让抓取质量和失败处理可靠。
3. Track C：保存原文资产与全文检索，让后续调试和复用有基础。
4. Track D：扩展 provider/frontier/extractor，让“深度和广度”真正变强。
5. Track E：完善 evidence graph 和可信度评分，让报告可靠可溯源。
6. Track F：补齐 UI、benchmark、文档和运行验收，让产品可用、工程可测。

每个 Track 完成后都运行：

```bash
npm run test
npm run lint
```

Track F 完成后运行完整验收：

```bash
npm run test
npm run test:research-platform
npm run lint
npm run build
npm run benchmark:research
```

## 4. Database Migration Plan

当前项目在 `src/server/research/store.ts` 中初始化 Research schema。短期继续沿用该方式，避免引入新的 migration framework；当 schema 稳定后再迁移到正式 migration 工具。

执行要求：

- [ ] 所有 `CREATE TABLE` 使用 `IF NOT EXISTS`。
- [ ] 所有新增列使用 idempotent helper，例如先查询 `information_schema.columns`，不存在再 `ALTER TABLE ADD COLUMN`。
- [ ] 所有索引使用 `CREATE INDEX IF NOT EXISTS`。
- [ ] 不删除已有表和列，兼容历史 `research_jobs`、`search_candidates`、`crawl_documents`、`evidence_items`、`research_reports`。
- [ ] schema 变更后用一个空 Postgres 数据库跑 `npm run test:research`。
- [ ] 用已有开发库启动后端，确认旧 job/report 仍能读取。

## 5. Environment Variables

`.env.example` 必须包含并用简体中文注释以下变量：

```dotenv
# 后端监听端口。必需。开发默认 3001。
BACKEND_PORT=3001

# 前端访问地址。必需。开发默认 http://localhost:5173。
APP_URL=http://localhost:5173

# Research Postgres 连接串。Research 持久化必需；RSS 新闻 SQLite 不依赖它。
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/politistream

# Redis 连接串。Research worker 队列必需；未配置时 Research run 不会启动，RSS 仍可用。
REDIS_URL=redis://localhost:6379

# Gemini API Key。AI 摘要、证据抽取和报告生成需要；从 Google AI Studio 获取。
GEMINI_API_KEY=

# Brave Search API Key。可选但推荐；从 Brave Search API 控制台获取。
BRAVE_API_KEY=

# SerpApi API Key。可选；从 SerpApi 控制台获取。
SERPAPI_API_KEY=

# Tavily API Key。可选；从 Tavily 控制台获取。
TAVILY_API_KEY=

# GitHub Token。可选；公开 repo 可无 token，配置后提高限额。
GITHUB_TOKEN=

# 是否尊重 robots.txt。生产建议 true。
RESEARCH_RESPECT_ROBOTS_TXT=true

# 同一域名连续抓取的最小间隔，毫秒。
RESEARCH_DOMAIN_MIN_DELAY_MS=1500

# 单个 URL 最大抓取尝试次数。
RESEARCH_FETCH_MAX_ATTEMPTS=3

# 是否启用浏览器抓取 fallback。
RESEARCH_BROWSER_FETCH_ENABLED=true

# 浏览器抓取最大并发页面数。
RESEARCH_BROWSER_MAX_PAGES=2

# 抓取超时时间，毫秒。
RESEARCH_FETCH_TIMEOUT_MS=15000

# 单个响应最大字节数。
RESEARCH_MAX_CONTENT_BYTES=5242880

# 原始抓取资产保存目录。
RESEARCH_ASSET_DIR=.data/research-assets

# 是否保存原始 HTML。
RESEARCH_STORE_RAW_HTML=true

# 是否保存原始 PDF。
RESEARCH_STORE_RAW_PDF=true

# 是否保存抽取后的纯文本。
RESEARCH_STORE_RAW_TEXT=true
```

## 6. Quality Gates

每个 PR 或本地阶段提交必须满足：

- TypeScript：`npm run lint`
- 单元测试：`npm run test`
- Research 平台测试：`npm run test:research-platform`
- 前端构建：`npm run build`
- 关键手工场景：
  - 新建 Research job，选择 Quick，能创建 run 并进入队列。
  - Redis 未启动时，Research run 返回明确错误，RSS 页面不受影响。
  - 缺少搜索 provider key 时，Provider Panel 显示缺失而不是白屏。
  - 一个 URL 抓取失败时，frontier 记录失败原因，其他 URL 继续。
  - Source Explorer 能展示文档正文摘录、来源评分、claim 引用和原始 URL。
  - UI 可中英文切换，AI 报告默认简体中文，抓取内容保持原语言。

## 7. Performance Targets

第一版目标不是无限爬，而是预算内稳定深挖：

- Quick：30 URL 内，正常网络下 2 到 5 分钟完成。
- Standard：150 URL 内，正常网络下 10 到 25 分钟完成。
- Deep：500 URL 内，可后台持续运行，允许失败 URL，但 run 不应整体崩溃。
- 单 provider 失败不影响其他 provider。
- 单 domain 限速默认 1.5 秒以上。
- 报告生成不允许引用没有 URL 的证据。

## 8. Risk Controls

- 不绕过登录、验证码、付费墙、访问限制。
- 默认尊重 robots.txt。
- 不抓取私人数据。
- 不把大模型生成内容当事实来源。
- 不把 API key 写死在代码或 README 示例中。
- 不提交 `.env`、`.data/`、抓取原文资产、临时调试文件。
- 浏览器抓取默认受并发限制，避免把开发机拖死。
- 所有外部 provider 失败都要有降级路径和 UI 说明。

## 9. Execution Handoff

建议按 Track A 到 Track F 逐段执行。每个 Track 都应该形成一个独立本地提交，提交信息使用简体中文。

开始执行前先确认：

```bash
npm install
npm run test
npm run lint
```

如果当前工作区已有大量未提交改动，先用 `git status --short` 记录现状，执行时只提交本 Track 相关文件，不回滚用户已有改动。
