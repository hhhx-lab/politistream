# PolitiStream 前后端与爬虫技术架构

更新时间：2026-05-31

## 1. 架构定位

PolitiStream 是一个面向新闻监控和深度网络研究的本地 Web 应用。当前架构已经从“Express 内嵌 Vite 中间件”的前后端一体模式，调整为“前端 Vite dev server + 后端 Express API server”的分离模式。

默认开发拓扑：

```text
Browser
  |
  | http://localhost:3000
  v
Vite Frontend Dev Server
  |
  | /api/* proxy
  v
Express Backend API Server
  |
  +--> SQLite news.db / rss_sources
  +--> Postgres research storage
  +--> Redis / BullMQ research workers
  +--> Search providers
  +--> Gemini analysis
```

## 2. 前端

### 技术栈

- React 19
- Vite 6
- TypeScript
- Tailwind CSS via `@tailwindcss/vite`
- lucide-react icons
- motion/react animations

### 启动方式

```bash
npm run dev:frontend
```

默认端口：

```env
FRONTEND_PORT=3000
```

Vite 会把 `/api/*` 代理到后端：

```env
VITE_API_PROXY_TARGET="http://localhost:3001"
```

### 主要页面

- Search Home：搜索优先首页，展示 API、Research DB、Search Providers、RSS Startup 状态，并支持 Quick / Standard / Deep 预算和可选 seed URL。
- Research Jobs：run-centric 工作台，展示 run 时间线、Frontier View、Source Explorer、Evidence Table、Provider Panel、报告和文档。
- RSS Monitoring：新闻爬虫和 RSS 源管理。
- Saved Library：收藏新闻。
- AI Work Queue：待 AI 分析新闻。

## 3. 后端

### 技术栈

- Express
- TypeScript / tsx
- dotenv
- better-sqlite3
- pg
- rss-parser
- axios
- jsdom + Readability
- BullMQ / ioredis
- Gemini SDK

### 启动方式

```bash
npm run dev:backend
```

默认端口：

```env
BACKEND_PORT=3001
```

后端只负责 API，不再挂载 Vite 中间件。

### 核心 API

| API | 作用 |
|-----|------|
| `GET /api/health` | 后端健康检查 |
| `GET /api/runtime/status` | 后端运行时配置状态 |
| `GET /api/research/status` | Research 存储、队列、搜索 provider 配置状态 |
| `GET /api/feeds` | RSS 源列表 |
| `POST /api/feeds` | 新增 RSS 源 |
| `PATCH /api/feeds/:id` | 启用/停用 RSS 源 |
| `POST /api/feeds/:id/refresh` | 刷新单个 RSS 源 |
| `POST /api/refresh` | 刷新所有启用 RSS 源 |
| `GET /api/news` | 新闻列表 |
| `GET /api/favorites` | 收藏新闻 |
| `POST /api/research/jobs` | 创建研究任务 |
| `POST /api/research/jobs/:id/run` | 兼容入口：创建 run 并入队 |
| `POST /api/research/jobs/:id/runs` | 创建研究 run 并入队 |
| `GET /api/research/jobs/:id/runs` | 列出研究 run |
| `GET /api/research/runs/:runId` | 查看 run、job 和报告 |
| `POST /api/research/runs/:runId/pause` | 暂停 run |
| `POST /api/research/runs/:runId/resume` | 恢复 run 并重新入队 |
| `POST /api/research/runs/:runId/cancel` | 取消 run |
| `GET /api/research/runs/:runId/events` | Run timeline |
| `GET /api/research/runs/:runId/frontier` | Frontier 状态 |
| `GET /api/research/providers/health` | Discovery provider 健康聚合 |
| `GET /api/research/runs/:runId/assets` | 原始内容资产 metadata |
| `GET /api/research/runs/:runId/search?q=` | Run 内文档全文检索 |
| `GET /api/research/runs/:runId/evidence` | Claims 和 evidence |
| `GET /api/research/runs/:runId/graph` | Evidence graph |
| `GET /api/research/runs/:runId/sources` | 来源画像和可信度 |
| `GET /api/research/runs/:runId/providers` | Discovery provider 调用记录 |
| `GET /api/research/jobs/:id/documents` | 研究任务文档 |
| `GET /api/research/jobs/:id/report` | 最新研究报告 |

## 4. 数据存储

### SQLite

文件：

```text
news.db
```

用途：

- `news`：RSS 新闻条目。
- `rss_sources`：用户可管理 RSS 源。

SQLite 是新闻监控链路的本地存储，保证即使未配置 Postgres，RSS 新闻功能仍能运行。

### Postgres

环境变量：

```env
DATABASE_URL="postgres://postgres:postgres@localhost:5432/politistream"
```

用途：

- research jobs
- research runs
- discovery results
- frontier items
- search candidates
- crawl documents
- source profiles
- evidence claims
- evidence items
- research reports

Postgres 是深度研究链路的结构化存储。未配置时，新闻/RSS 不受影响，但 research job 会进入配置缺失状态。

### Redis / BullMQ

环境变量：

```env
REDIS_URL="redis://localhost:6379"
```

Redis 已用于 Research run 入队和后台执行。BullMQ 队列命名为 `research.discovery`、`research.frontier`、`research.fetch`、`research.extract`、`research.analyze`、`research.report`，每个 stage 都有独立 worker handler。API 创建 run 后立即返回 202，后台 worker 按 discovery、frontier、fetch、extract、analyze、report 推进，并把阶段事件写入 `run_events`。

## 5. 爬虫技术栈

### RSS 爬虫

- `rss-parser` 解析 feed。
- `better-sqlite3` 保存新闻和 RSS 源状态。
- 支持默认源 seed、用户新增源、启停、单源刷新、全部刷新。
- `RSS_REFRESH_ON_STARTUP=false` 时，启动后不会自动抓取所有源。

### Web Research Crawler

- Discovery provider registry：seed/official、Brave/SerpApi/Tavily web search、RSS、sitemap、GitHub、npm、PyPI。
- Query planner：根据 topic 识别任务类型，生成结构化 ResearchPlan 和多目的 query；当前规则 planner 已覆盖工具评测、新闻查证、政策、技术、竞品和通用调研。
- Frontier：按主题相关度、来源权威性、原始来源概率、新鲜度、来源多样性和链接上下文质量计算 priority score，并受 URL/深度/域名预算约束。
- Fetch：HTTP fetcher + Puppeteer browser fallback 抓公开网页、PDF、sitemap 和 registry/API 内容；抓取前尊重 robots.txt，按域名限速，并对 429/5xx/超时做有限重试。
- Extraction：HTML 使用 JSDOM + Readability 抽正文、metadata、链接和表格；PDF 使用 `pdf-parse`；GitHub/npm/PyPI 使用公开 API 抽 README、stars、license、版本、依赖和活跃度信号。
- Analysis：Gemini 对文档做相关性和证据抽取，缺 key 时降级。
- Storage：Postgres 保存结构化 metadata、正文和全文检索向量；原始 HTML/PDF/text 保存到 `.data/research-assets` 或 `RESEARCH_ASSET_DIR` 指定目录。
- Evidence：按 domain 生成 source profile、authority tier、credibility score，并把证据聚合为 claim/evidence relation。
- Memory：同 topic 后续 run 会记录 topic/source memory，并可在 `RESEARCH_MEMORY_MAX_AGE_HOURS` 窗口内复用历史文档。
- Report：基于 evidence graph 生成默认简体中文 markdown；爬取到的原文内容保持原语言。

当前 ResearchPlan 包含：

- `taskType`：`survey`、`verification`、`tool-evaluation`、`policy`、`technical`、`competitive`、`monitoring`。
- `subQuestions`：面向任务类型的研究子问题。
- `queries`：带 `purpose`、`sourceTypes`、`language`、`priority` 的 planned queries。
- `budget`：Quick / Standard / Deep 或任务类型默认预算。
- `stopConditions`：后续 worker 化后可作为停止条件。

### 已落地的升级方向

- Discovery provider registry。
- Priority frontier queue。
- Redis/BullMQ worker 化 run 执行。
- 多内容类型 extractor：HTML、PDF、GitHub、npm/PyPI、sitemap、table。
- Evidence graph。
- Credibility scoring。
- Source explorer UI。

## 6. 环境变量

```env
APP_URL="http://localhost:3000"
FRONTEND_PORT=3000
BACKEND_PORT=3001
VITE_API_PROXY_TARGET="http://localhost:3001"
RSS_REFRESH_ON_STARTUP=false

GEMINI_API_KEY=""
DATABASE_URL="postgres://postgres:postgres@localhost:5432/politistream"
REDIS_URL="redis://localhost:6379"
RESEARCH_WORKER_CONCURRENCY=2

BRAVE_API_KEY=""
SERPAPI_API_KEY=""
TAVILY_API_KEY=""
GITHUB_TOKEN=""
RESEARCH_FETCH_MAX_ATTEMPTS=3
RESEARCH_DOMAIN_MIN_DELAY_MS=1500
RESEARCH_RESPECT_ROBOTS_TXT=true
RESEARCH_BROWSER_FETCH_ENABLED=true
RESEARCH_ASSET_DIR=".data/research-assets"
RESEARCH_MEMORY_ENABLED=true
RESEARCH_MEMORY_MAX_AGE_HOURS=24
```

最小模式：

- 只跑 RSS 新闻：无需 Postgres、Redis、Gemini、搜索 provider。
- 跑 AI 摘要：需要 `GEMINI_API_KEY`。
- 跑完整深度研究：需要 `DATABASE_URL`、`REDIS_URL` 和至少一个搜索 provider key。

## 7. 开发命令

```bash
npm run dev:backend   # 后端 API，默认 3001
npm run dev:frontend  # 前端 Vite，默认 3000
npm run dev           # 一键启动前后端
npm run lint
npm run test
npm run build
```

## 8. 质量门

基础测试必须覆盖：

- runtime 配置解析。
- research query/report/provider normalization。
- TypeScript 类型检查。
- Vite build。

当前基础命令：

```bash
npm run test
npm run test:research-platform
npm run lint
npm run build
npm run benchmark:research
```

## 9. 关键设计原则

- 前后端通过 HTTP API 边界通信，前端不直接接触密钥。
- RSS 新闻链路和 Research 深度研究链路解耦。
- 外部服务缺失时必须降级，而不是导致整个应用不可用。
- 长任务必须由独立 worker queue 执行，避免阻塞 API 请求。
- 报告必须基于可追溯 evidence，不让大模型凭空给结论。
