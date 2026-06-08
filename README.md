# PolitiStream

PolitiStream 是一个用 TypeScript 写的新闻抓取、RSS 监控和深度研究项目。目前的实现不是 Scrapy 这类独立爬虫框架，而是一个前后端分离的本地 Web 应用：

- 前端用 Vite + React 启动独立开发服务，默认端口 `3000`。
- 后端用 Express 启动独立 API 服务，默认端口 `3001`。
- 前端通过 Vite proxy 将 `/api/*` 转发到后端。
- RSS 抓取层用 `rss-parser` 批量读取默认源和用户新增源。
- 正文补全层按 Jina Reader、公开代理、Puppeteer、直连 Axios 的顺序尝试提取文章正文。
- AI 层统一走 GPT 中转站，对新闻做中文摘要、情感分值和实体提取。
- 新闻/RSS 存储层用 SQLite，本地数据库文件为 `news.db`。
- 深度研究存储层用 Postgres，长任务通过 Redis/BullMQ 入队，由后台 worker 执行。
- 前端用 React 展示搜索首页、研究任务、RSS 源管理、新闻流、收藏夹和 AI 待处理队列。
- 搜索首页支持 Quick / Standard / Deep 研究预算、seed URL 和时间/域名/语言/内容类型/关键词等高级约束，后端会把 topic 规划成多目的 query plan。

项目当前正从“RSS 新闻聚合 + 单篇深度抓取 + AI 分析 + 本地归档”的原型，升级为“深度网络调查与证据型研究系统”。

## 当前架构

```text
RSS feeds
  -> src/server/services/rss.ts
     -> rss-parser 拉取 feed item
     -> SQLite 去重写入 news 表，并维护 rss_sources 表
     -> processMissingSummaries 后台小批量补 AI 分析
     -> 单篇分析时按需抓全文
  -> src/server/services/ai.ts
     -> GPT 中转站生成中文摘要、情感分值、实体列表
  -> src/server/services/storage.ts
     -> 将已分析新闻归档为 Markdown
  -> src/server/db.ts
     -> better-sqlite3 持久化新闻和 RSS 源
  -> src/server/research/*
     -> Postgres research jobs / runs / frontier / documents / evidence / reports
     -> Redis/BullMQ 分阶段 research workers 执行深度研究 run
  -> server.ts
     -> Express API server
  -> vite.config.ts
     -> Vite frontend server + /api proxy
  -> src/
     -> React 仪表盘消费 API
```

## 目录说明

```text
.
├── server.ts                      # Express 后端 API 服务入口
├── vite.config.ts                 # Vite 前端配置，代理 /api 到后端
├── docs/
│   ├── deep-research-crawler-upgrade-plan.md
│   ├── data-processing-analytics-visualization-platform-plan-2026-06-07.md
│   ├── strong-crawler-tooling-research-2026-06-07.md
│   └── frontend-backend-crawler-architecture.md
├── src/
│   ├── App.tsx                    # 搜索首页、研究任务、新闻爬虫分区
│   ├── components/
│   │   ├── NewsFeed.tsx           # 新闻列表、刷新、分页、收藏、队列视图
│   │   ├── ResearchPanel.tsx      # Research run 时间线、报告、证据表和来源浏览器
│   │   ├── RSSSourceManager.tsx   # RSS 源添加、启停、刷新、状态
│   │   └── NewsCard.tsx           # 单条新闻卡片
│   ├── server/
│   │   ├── db.ts                  # SQLite 初始化、新闻/RSS 源 CRUD
│   │   ├── runtime.ts             # 后端运行时配置解析
│   │   ├── research/              # Research job、provider、crawler、report
│   │   └── services/
│   │       ├── rss.ts             # RSS 抓取、正文提取、AI 调度
│   │       ├── ai.ts              # GPT 中转站分析封装
│   │       └── storage.ts         # Markdown 归档
│   ├── types.ts                   # 前后端共享类型
│   ├── main.tsx                   # React 挂载入口
│   └── index.css                  # 样式入口
├── workers-analytics/             # Python 数据处理、统计分析和可视化 worker lane
├── archive-all.ts                 # 把已有已分析新闻批量归档到 archives/
├── test-*.ts                      # 正文抓取策略的实验脚本
├── app/applet/test-*.ts           # 另一份实验脚本副本
├── DESIGN.md                      # 设计草案和路线图
├── news.db                        # 本地 SQLite 数据库
├── package.json                   # npm 脚本和依赖
└── .env.example                   # 环境变量模板
```

## 抓取实现

核心抓取逻辑在 `src/server/services/rss.ts`。

### RSS 源

系统内置默认 RSS 源，并会幂等 seed 到 SQLite 的 `rss_sources` 表。用户也可以在前端 RSS Monitoring 分区手动新增、启用/停用和刷新单个 RSS 源。

默认源分三类：

- 政策原始源：Federal Reserve、SEC。
- 新闻和市场信息源：CNBC、The Hill、Forbes、VentureBeat、Politico、MarketWatch、Yahoo Finance、Washington Post、NYT、BBC、Guardian、Al Jazeera、TechCrunch、The Verge、Wired、Ars Technica、Engadget。
- 背景分析源：CBS Politics、NPR Politics/World/Business/Tech。

RSS 抓取使用 `rss-parser`，带了浏览器风格 `User-Agent` 和 RSS/XML `Accept` 头。`/api/feeds` 返回的是持久化源列表，而不是单纯的硬编码数组。

### 批处理方式

`fetchAndProcessFeeds()` 会按批次抓取所有启用 RSS 源：

- `BATCH_SIZE = 5`，每批并发处理 5 个 feed。
- 每条 RSS item 需要至少包含 `title` 和 `link`。
- 初始内容优先取 `item.contentSnippet` 或 `item.content`。
- 发布时间优先使用 `isoDate`，其次解析 `pubDate`，兜底为当前时间。
- 写入数据库时依赖 `link` 的唯一约束去重。
- 每轮抓取完成后，会后台调用 `processMissingSummaries(5)`，补 5 条缺摘要新闻的 AI 分析。
- 单个源刷新失败会记录在该源的 `last_error`，不会阻断其他源。

默认情况下，开发服务启动不会自动全量刷新 RSS。需要自动刷新时设置：

```env
RSS_REFRESH_ON_STARTUP=true
```

当前代码里，RSS 批量抓取阶段的全文补全逻辑仍偏保守；全文抓取主要发生在“单篇 AI 分析”或“补 AI 队列”时。

### 正文补全策略

当新闻正文太短时，`fetchFullContent()` 按以下顺序尝试获取全文：

1. Jina Reader：`https://r.jina.ai/{url}`，返回适合 LLM 读取的 Markdown/text。
2. AllOrigins：通过公开代理拉原始页面，再用 Readability 抽正文。
3. CodeTabs：另一层公开代理，逻辑同上。
4. Puppeteer：启动无头浏览器，等待页面网络空闲后读取 HTML。
5. 直连 Axios：使用伪装浏览器请求头，配合 JSDOM + Mozilla Readability 提取正文。

直连请求里额外配置了 HTTP/HTTPS keep-alive agent，并提高了 header size，用来绕开部分站点的大响应头问题。遇到 401、403、451、Header overflow 等情况时会记录日志，并允许 AI 退回到标题、片段和 URL 上下文。

## AI 分析实现

AI 逻辑在 `src/server/services/ai.ts`。

AI 只读取三项配置：`AI_BASE_URL`、`AI_API_KEY` 和 `AI_MODEL`。`AI_BASE_URL` 填 GPT 中转站的 OpenAI-compatible base URL，推荐以 `/v1` 结尾；后端会调用 chat completions 接口并要求模型只返回 JSON。没有 `AI_API_KEY` 时，系统会返回一段“AI disabled”的摘要，其他流程仍可运行。

`analyzeContent(title, snippet, url?)` 默认使用 `.env` 中的 `AI_MODEL`，缺省为 `gpt-5.4`。

输出结构为：

```json
{
  "summary": "中文深度摘要和洞察",
  "sentiment": 0,
  "entities": ["实体1", "实体2"]
}
```

分析要求写在 prompt 里：

- 用简体中文输出。
- 先给 80-120 字左右的核心事实摘要。
- 再给 3-4 个深度洞察点。
- 情感分值范围为 -1.0 到 1.0。
- 提取政治人物、政党、政府机构、国际组织等关键实体。

传入 URL 时会把 URL 一并交给模型，并要求只返回合法 JSON。返回值如果混入 Markdown 代码块或其他文本，代码会尝试提取 JSON 再解析。

## 数据存储

数据库逻辑在 `src/server/db.ts`，使用 `better-sqlite3`。数据库文件固定为项目根目录的 `news.db`，并启用 WAL：

```sql
PRAGMA journal_mode = WAL;
```

核心新闻表：

```sql
CREATE TABLE news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  link TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  pubDate TEXT,
  contentSnippet TEXT,
  summary TEXT,
  sentiment REAL,
  entities TEXT,
  processed INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pubDate ON news(pubDate DESC);
```

RSS 源表：

```sql
CREATE TABLE rss_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  last_fetched_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

几个关键点：

- `link` 唯一，用于 RSS 去重。
- `entities` 以 JSON 字符串保存，前端读取后再解析为数组。
- `processed` 表示是否完成 AI 分析。
- `is_favorite` 表示是否收藏。
- `rss_sources.url` 唯一，用于避免重复源。
- 如果 `news.db` 打不开，当前实现会删除旧库并重建。

深度研究数据使用 Postgres，配置见 `DATABASE_URL`，包含 research jobs、research runs、discovery results、frontier items、crawl documents、source profiles、evidence claims、evidence items 和 research reports。Research run 通过 Redis/BullMQ 入队执行，配置见 `REDIS_URL`。

## API

API 入口在 `server.ts`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/runtime/status` | 后端运行时配置状态 |
| `GET` | `/api/research/status` | Research DB、Redis、搜索 provider 配置状态 |
| `GET` | `/api/feeds` | 返回 RSS 源列表 |
| `POST` | `/api/feeds` | 新增 RSS 源 |
| `PATCH` | `/api/feeds/:id` | 启用/停用 RSS 源 |
| `POST` | `/api/feeds/:id/refresh` | 刷新单个 RSS 源 |
| `GET` | `/api/news?limit=100&offset=0` | 分页返回新闻，按 `pubDate` 倒序 |
| `GET` | `/api/news/pending?limit=50` | 返回缺少摘要的新闻 |
| `GET` | `/api/favorites` | 返回收藏新闻 |
| `POST` | `/api/refresh` | 手动触发 RSS 抓取 |
| `POST` | `/api/refresh-ai?batchSize=20` | 批量处理缺摘要新闻 |
| `POST` | `/api/news/:id/analyze` | 单条新闻抓全文并重新 AI 分析 |
| `POST` | `/api/news/:id/favorite` | 更新收藏状态，body 为 `{ "isFavorite": true }` |
| `POST` | `/api/research/jobs` | 创建 research job |
| `GET` | `/api/research/jobs` | 列出 research jobs |
| `POST` | `/api/research/jobs/:id/run` | 兼容入口：创建 run 并入队 |
| `POST` | `/api/research/jobs/:id/runs` | 创建 research run 并入队 |
| `GET` | `/api/research/jobs/:id/runs` | 列出某个 job 的 runs |
| `GET` | `/api/research/runs/:runId` | 查看 run、job 和报告 |
| `GET` | `/api/research/runs/:runId/plan` | 查看结构化 Research Plan 和 planned queries |
| `POST` | `/api/research/runs/:runId/queries` | 对正在研究的 run 追加新的查询方向，并触发 manual discovery |
| `POST` | `/api/research/runs/:runId/pause` | 暂停 run |
| `POST` | `/api/research/runs/:runId/resume` | 恢复 run 并重新入队 |
| `POST` | `/api/research/runs/:runId/cancel` | 取消 run |
| `GET` | `/api/research/runs/:runId/events` | Run timeline 事件 |
| `GET` | `/api/research/runs/:runId/frontier` | Frontier URL 状态 |
| `POST` | `/api/research/runs/:runId/retry-failed` | 将 failed/skipped frontier 项重置为 queued，并触发 retry fetch |
| `GET` | `/api/research/queues` | BullMQ discovery/frontier/fetch/extract/analyze/report 六段队列状态 |
| `GET` | `/api/research/providers/health` | Discovery provider 全局健康聚合 |
| `GET` | `/api/research/runs/:runId/documents` | Run 内抓取文档、状态、正文摘录和失败原因 |
| `GET` | `/api/research/runs/:runId/assets` | Run 内原始 HTML/PDF/text 资产 metadata |
| `GET` | `/api/research/runs/:runId/tables` | Run 内 HTML/PDF/结构化 extractor 抽取出的表格 |
| `GET` | `/api/research/runs/:runId/links` | Run 内每篇文档抽取出的外链、链接文本、上下文和是否已入队 |
| `GET` | `/api/research/runs/:runId/search?q=` | Run 内文档全文检索 |
| `GET` | `/api/research/runs/:runId/evidence` | Evidence claims 和 evidence items |
| `GET` | `/api/research/runs/:runId/claims` | Run 内 claim 图谱索引和状态汇总 |
| `GET` | `/api/research/runs/:runId/graph` | Evidence graph：claims、evidence、relations、sources、summary |
| `GET` | `/api/research/runs/:runId/sources` | Source profiles 和可信度信号 |
| `GET` | `/api/research/runs/:runId/providers` | Discovery provider 调用记录 |
| `GET` | `/api/research/jobs/:id/documents` | 查看 research 文档 |
| `GET` | `/api/research/jobs/:id/report` | 查看最新 research 报告 |
| `GET` | `/api/agent/capabilities` | 查看 Agent 可分派的爬虫、数据处理和可视化能力 |
| `POST` | `/api/agent/dispatch` | 任务分配 Agent：把自然语言需求路由到 Research/Analytics/Visualization |
| `GET` | `/api/analytics/status` | 数据处理与可视化能力状态 |
| `GET` | `/api/analytics/capabilities` | 分析、统计、机器学习、可视化和报告能力目录 |
| `POST` | `/api/analytics/profile` | 对 JSON rows 生成轻量 schema profile、质量提示和图表建议 |
| `GET` | `/api/analytics/datasets` | 列出已保存的数据资产 |
| `POST` | `/api/analytics/datasets` | 将 JSON rows 保存为 Data Lab 数据集并生成 profile |
| `POST` | `/api/analytics/datasets/from-research-run/:runId` | 把 Research run 文档导出成 Data Lab 数据集 |
| `POST` | `/api/analytics/datasets/from-research-run/:runId/data-sources` | 把 Research run 的 data-catalog / structured-api / competition-data / sports-data provider、frontier 和候选 URL 导入为 Data Lab 数据源资产清单 |
| `POST` | `/api/analytics/datasets/:id/materialize-source` | 从数据源资产清单中抓取一行 URL，解析 CSV / JSON / API 快照并保存为可分析数据集 |
| `POST` | `/api/analytics/datasets/:id/materialize-sources` | 从数据源资产清单批量抓取前 N 个或指定行 URL，逐行返回成功/失败并把成功项保存为独立数据集 |
| `POST` | `/api/analytics/datasets/:id/refresh-materialized-source` | 基于已导入快照的原始 sourceRow/sourceUrl 重新抓取，创建带版本 lineage 的新数据集 |
| `GET` | `/api/analytics/datasets/:id` | 查看数据集及最近 profile |
| `POST` | `/api/analytics/datasets/:id/profile` | 重新生成数据集 profile 和图表建议 |
| `POST` | `/api/analytics/datasets/:id/analyze` | 调用 Python Analytics Worker 运行 profile、描述统计、质量检查、频数表、交叉表、统计检验、回归族、PCA/因子、聚类、异常检测、时间序列、数据清洗、新闻整理、文本主题、模型解释、地理分析、论文图、报告草稿或正式报告导出，并保存 job/artifact |
| `POST` | `/api/news-analysis/runs/:runId/cluster` | 将 Research run 文档导入 Data Lab 新闻整理 worker，生成同题聚类和重复内容统计 |
| `POST` | `/api/news-analysis/runs/:runId/timeline` | 将 Research run 文档整理为事件时间线，并保存 Analytics job/artifact |
| `POST` | `/api/news-analysis/runs/:runId/source-quality` | 汇总 Research run 来源分层、官方概率、主流概率和文档覆盖 |
| `GET` | `/api/analytics/jobs` | 查看最近 Analytics jobs |
| `GET` | `/api/analytics/jobs/:id` | 查看单个 Analytics job 状态和结果 |
| `GET` | `/api/analytics/artifacts` | 查看最近 profile/statistics/visualization artifacts |
| `POST` | `/api/analytics/statistics/descriptive` | 生成数值列描述统计和 Pearson 相关矩阵 |
| `POST` | `/api/analytics/visualizations/suggest` | 根据 rows 或 profile 推荐图表规格 |
| `POST` | `/api/analytics/visualizations/render` | 根据数据集或 rows 生成可复现 Visualization artifact |
| `GET/POST` | `/api/datasets` | Data Lab 计划短路径：数据集列表、创建、详情、profile、validate、clean、query |
| `GET/POST` | `/api/analysis/jobs` | Data Lab 计划短路径：分析任务创建、列表、详情、重跑、取消 |
| `GET/POST` | `/api/visualizations` | Data Lab 计划短路径：可视化 artifact 创建、查看、渲染、导出 |
| `GET/POST` | `/api/reports` | Data Lab 计划短路径：报告 artifact 创建、查看、渲染、导出 |

## 前端实现

前端在 `src/` 下，使用 React 19、Tailwind CSS v4、Motion 和 Lucide React。

当前界面包括：

- Agent Console：自然语言任务分配入口，能把用户需求路由到爬虫、Data Lab 数据资产、Python worker 质量/统计/回归/聚类/报告分析和 Visualization artifact。
- Search Home：搜索优先入口，展示后端 API、Research DB、Search Providers、RSS Startup 状态，支持 Quick / Standard / Deep 预算、可选 seed URL、时间/域名/语言/内容类型/关键词高级约束，并提供 Agent、Research、Data Lab、RSS 的手动入口。
- Research Jobs：run-centric 工作台，包含运行监控、BullMQ 六段队列健康、全局 Provider 健康、run 时间线、结构化 Query Plan、Run 内文档检索、Frontier View、Frontier 评分解释、Source Explorer、读取路径和诊断结果、发现外链、抽取表格预览、Evidence Table、Evidence Graph、Provider Panel、数据源覆盖、报告和文档；还支持对当前 run 一键运行新闻聚类、事件时间线、来源质量分析，把数据源 provider/frontier 候选导入 Data Lab 数据源资产清单，并从 Provider Panel 直接打开 Data Lab 的关联 run 上下文。
- Data Lab：数据处理与可视化入口，支持 JSON rows 画像、多格式文件导入、保存数据集、Research 数据源资产清单筛选、关联 run 定位与回跳 Research、来源质量评分、可导入性标记、批量数据源快照、快照刷新和版本历史、数据集操作台 validate/clean/query、Python worker profile/stats/quality/frequency/crosstab/tests/regression/logistic/poisson/PCA-factor/cluster/anomaly/timeseries/transform/cleaning/news/text/explain/geo/chart/report/export、最近 jobs/artifacts 的重跑/取消/导出操作、质量提示、字段 profile、描述统计、相关矩阵、图表建议、论文图 PNG/SVG/PDF 和报告 MD/HTML/DOCX/PDF/PPTX/JSON artifact。
- RSS Monitoring：RSS 源管理 + 新闻流。
- Saved Library：收藏新闻。
- AI Work Queue：待 AI 分析新闻。
- 新闻详情：原文链接、AI 摘要、情感分值、实体、复制内容、单篇 AI 分析按钮。

`NewsFeed` 根据 `viewMode` 选择不同接口：

- `all` -> `/api/news`
- `favorites` -> `/api/favorites`
- `warehouse` -> `/api/news/pending`

在 `all` 模式下，前端每 60 秒重新拉取第一页新闻。

## 运行方式

本项目是 Node/TypeScript 项目，依赖由 npm 管理。

```bash
npm install
cp .env.example .env
npm run start:all
```

然后打开：

```text
http://localhost:3000
```

`.env` 本地开发推荐配置如下；完整 67 个变量和逐项获取方式以 `.env.example` 为准。

```env
APP_URL="http://localhost:3000"
FRONTEND_PORT=3000
BACKEND_PORT=3001
VITE_API_PROXY_TARGET="http://localhost:3001"
API_URL=""
DISABLE_HMR=false
RSS_REFRESH_ON_STARTUP=false

AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY=""
AI_MODEL="gpt-5.4"
DATABASE_URL="postgres://politistream:politistream@localhost:15432/politistream"
REDIS_URL="redis://localhost:16379"
RESEARCH_WORKER_CONCURRENCY=2
RESEARCH_FETCH_MAX_ATTEMPTS=3
RESEARCH_DOMAIN_MIN_DELAY_MS=1500
RESEARCH_RESPECT_ROBOTS_TXT=true
RESEARCH_BROWSER_FETCH_ENABLED=true
RESEARCH_BROWSER_MAX_PAGES=2
RESEARCH_FETCH_TIMEOUT_MS=15000
RESEARCH_MAX_CONTENT_BYTES=5242880
RESEARCH_ASSET_DIR=".data/research-assets"
RESEARCH_STORE_RAW_HTML=true
RESEARCH_STORE_RAW_PDF=true
RESEARCH_STORE_RAW_TEXT=true
RESEARCH_MEMORY_ENABLED=true
RESEARCH_MEMORY_MAX_AGE_HOURS=24

ANALYTICS_PYTHON_BIN=".venv/bin/python"
ANALYTICS_WORKER_DIR="workers-analytics"
ANALYTICS_WORKER_TIMEOUT_MS=120000
ANALYTICS_IMPORT_MAX_ROWS=50000
ANALYTICS_MATERIALIZE_MAX_ROWS=50000
ANALYTICS_MATERIALIZE_BATCH_LIMIT=8
ANALYTICS_SOURCE_FETCH_TIMEOUT_MS=30000
ANALYTICS_SOURCE_MAX_BYTES=26214400
ANALYTICS_SOURCE_ALLOW_PRIVATE_NETWORKS=false
ANALYTICS_ALLOW_LOCAL_FALLBACK=false
ANALYTICS_STORE_FILE=".data/analytics-store.json"
ANALYTICS_ARTIFACT_DIR=".data/analytics-artifacts"
ANALYTICS_USE_DOC_TOOLS=true
ANALYTICS_CHART_EXPORT_FORMATS="png,svg,pdf,html,json"

BRAVE_API_KEY=""
SERPAPI_API_KEY=""
TAVILY_API_KEY=""
NEWSAPI_KEY=""
NEWS_API_KEY=""
GITHUB_TOKEN=""
FRED_API_KEY=""
KAGGLE_API_TOKEN=""
KAGGLE_USERNAME=""
KAGGLE_KEY=""
FIRECRAWL_API_KEY=""
CRAWL4AI_URL=""
RESEARCH_BROWSER_PROVIDER="local"
BROWSERLESS_URL=""
```

只看 RSS 新闻时可以不配置 Postgres/Redis/AI/Search Provider。完整深度研究至少需要 `DATABASE_URL`、`REDIS_URL` 和一个搜索 provider key。Data Lab 默认也强制使用 Postgres 保存 datasets/jobs/artifacts；本仓库自带的 `docker-compose.yml` 会把 Postgres 暴露到 `15432`、Redis 暴露到 `16379`，避免误连其它项目占用的 `5432/6379`。`npm run check:postgres` 可以验证当前 `.env` 是否真的连到了项目专用 Postgres。`ANALYTICS_ALLOW_LOCAL_FALLBACK=true` 只用于临时离线开发或 CI smoke，正式研究和长期数据资产不要依赖本地 JSON store。没有可用 GPT 中转站 key 时，Research planner 仍会使用规则策略生成结构化 query plan；没有搜索 provider key 时，UI 会显示 provider 缺失状态。`GITHUB_TOKEN` 可选，用于提高 GitHub discovery/extractor 的 API 限额。

Agent、Research 与 Analytics 的默认模型配置由 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_MODEL` 控制，默认模型名为 `gpt-5.4`；可直接在 `.env` 中替换成你的 GPT 中转站地址、key 和模型名。FRED、Kaggle、Firecrawl、Crawl4AI、Browserless 都是可选增强；未配置时系统会保留入口并降级到本地或公开 provider。

Data Lab 的 Python worker 由 `ANALYTICS_PYTHON_BIN`、`ANALYTICS_WORKER_DIR` 和 `ANALYTICS_WORKER_TIMEOUT_MS` 控制。建议用 `uv` 或 conda 给 `workers-analytics/` 建独立环境，不要使用 `sudo pip` 或混用系统 Python/Homebrew Python。本地推荐 `ANALYTICS_WORKER_DIR="workers-analytics"` 搭配 `ANALYTICS_PYTHON_BIN=".venv/bin/python"`。`ANALYTICS_IMPORT_MAX_ROWS` 控制多格式导入最多解析多少行，默认 50,000；`ANALYTICS_MATERIALIZE_MAX_ROWS` 控制从研究数据源资产清单抓取 CSV/JSON/API 快照后最多落多少行；`ANALYTICS_MATERIALIZE_BATCH_LIMIT` 控制批量 materialize 单次最多处理多少个候选 URL；`ANALYTICS_SOURCE_FETCH_TIMEOUT_MS` 和 `ANALYTICS_SOURCE_MAX_BYTES` 控制远程数据源抓取超时与大小上限；`ANALYTICS_SOURCE_ALLOW_PRIVATE_NETWORKS=false` 会默认拦截 localhost/私网 URL，防止 Research 候选源被滥用成 SSRF/内网探测入口。Postgres 保存完整 rows 供 worker 分析，前端列表只返回 500 行预览以保持页面轻量。当前 worker 已接入 `/api/analytics/datasets/:id/analyze`，会把 profile/statistics/quality/frequency/crosstab/tests/regression/logistic/poisson/dimension/cluster/anomaly/timeseries/transform/cleaning/news/text/explain/deepml/geo/chart/report/export 结果保存为 analytics job 和 artifact；图表规格由 `/api/analytics/visualizations/render` 保存为 visualization artifact。

`npm run start:all` 是本地完整启动入口：它会读取 `.env`，创建 `.data` 运行目录，自动 `docker compose up -d postgres redis`，如果 `CRAWL4AI_URL` 指向本机还会启动 `unclecode/crawl4ai` 容器，随后启动 Express 后端、Research BullMQ workers 和 Vite 前端，并等待健康检查通过。只想连接已有 Postgres/Redis 时可运行 `npm run start:all -- --skip-infra`；只想跳过本机 Crawl4AI 容器时可运行 `npm run start:all -- --skip-crawl4ai`。完整 Data Lab Python 能力仍需先按下方 worker 命令建好 `workers-analytics/.venv`。

## 常用脚本

```bash
npm run start:all     # 全能力一键启动：Postgres、Redis、可选 Crawl4AI、后端、Research workers、前端
npm run dev           # 一键启动前后端
npm run dev:frontend  # 只启动 Vite 前端，默认 3000
npm run dev:backend   # 只启动 Express 后端，默认 3001
npm run build         # Vite 前端构建
npm run preview       # 预览 Vite 构建产物
npm run lint          # TypeScript noEmit 检查
npm run check:postgres # 验证 .env 的 DATABASE_URL，并初始化/检查 Research/Analytics schema 与 extracted_tables 表格抽取链路
npm run test          # runtime + research + analytics + worker + agent + i18n 测试
npm run test:analytics-import  # CSV/PDF 导入、transform、导出和下载 API 集成测试
npm run test:analytics-worker  # Python Analytics Worker 全能力 smoke
npm run test:ui        # Playwright Core + 本机 Chrome 校验中英文切换、Agent、RSS、Data Lab、Research 桌面/移动页面
npm run test:research-platform  # Research 平台架构测试
npm run benchmark:research      # 离线研究能力 benchmark
npm run clean         # 删除 dist
```

Python Analytics Worker 基础命令：

```bash
cd workers-analytics
uv sync --python 3.12
uv sync --extra ml --extra reports --python 3.12
.venv/bin/python -m politistream_analytics.worker profile --input sample-rows.json --output profile.json
.venv/bin/python -m politistream_analytics.worker stats --input sample-rows.json --output stats.json
.venv/bin/python -m politistream_analytics.worker quality --input sample-rows.json --output quality.json
.venv/bin/python -m politistream_analytics.worker frequency --input sample-rows.json --output frequency.json
.venv/bin/python -m politistream_analytics.worker crosstab --input sample-rows.json --output crosstab.json
.venv/bin/python -m politistream_analytics.worker tests --input sample-rows.json --output tests.json
.venv/bin/python -m politistream_analytics.worker regression --input sample-rows.json --output regression.json
.venv/bin/python -m politistream_analytics.worker logistic --input sample-rows.json --output logistic.json
.venv/bin/python -m politistream_analytics.worker poisson --input sample-rows.json --output poisson.json
.venv/bin/python -m politistream_analytics.worker dimension --input sample-rows.json --output dimension.json
.venv/bin/python -m politistream_analytics.worker cluster --input sample-rows.json --output cluster.json
.venv/bin/python -m politistream_analytics.worker anomaly --input sample-rows.json --output anomaly.json
.venv/bin/python -m politistream_analytics.worker timeseries --input sample-rows.json --output timeseries.json
.venv/bin/python -m politistream_analytics.worker cleaning --input sample-rows.json --output cleaning.json
.venv/bin/python -m politistream_analytics.worker news --input sample-rows.json --output news.json
.venv/bin/python -m politistream_analytics.worker text --input sample-rows.json --output text.json
.venv/bin/python -m politistream_analytics.worker explain --input sample-rows.json --output explain.json
.venv/bin/python -m politistream_analytics.worker deepml --input sample-rows.json --output deepml.json
.venv/bin/python -m politistream_analytics.worker geo --input sample-rows.json --output geo.json
.venv/bin/python -m politistream_analytics.worker chart --input sample-rows.json --output chart.json
.venv/bin/python -m politistream_analytics.worker report --input sample-rows.json --output report.json
.venv/bin/python -m politistream_analytics.worker export --input sample-rows.json --output export.json
```

第一条 `uv sync` 是最小环境；第二条是完整 Data Lab 环境，会安装 PyTorch、Transformers、sentence-transformers、SHAP 和 python-pptx。Worker CLI 已能生成 profile、描述统计、标准误、95% CI、数据质量报告、频数表、交叉表、Welch t 检验、卡方、ANOVA、Kruskal-Wallis、Spearman、效应量、线性回归、逻辑回归、泊松回归、PCA、因子分析、KMeans 聚类、异常检测、时间序列、清洗 lineage、DuckDB/Polars 加速摘要、新闻 story clustering、来源分层、文本主题、模型解释、PyTorch MLP 二分类基线、GeoJSON、论文图 PNG/SVG/PDF、Plotly HTML/JSON、Mermaid 工程图、Graphviz DOT 网络图、交互图 JSON spec、中文 Markdown 报告草稿，以及 MD/HTML/DOCX/PDF/PPTX/JSON 正式报告导出；`pyproject.toml` 已接入 DuckDB、Pandas、Polars、SciPy、statsmodels、scikit-learn、PyTorch、Transformers、sentence-transformers、SHAP、Matplotlib、Seaborn、Plotly 和 python-pptx。

Node 后端调用 worker 的路径：

```text
POST /api/analytics/datasets/:id/analyze
  -> analytics job
  -> python -m politistream_analytics.worker profile|stats|quality|frequency|crosstab|tests|regression|logistic|poisson|dimension|cluster|anomaly|timeseries|transform|cleaning|news|text|explain|deepml|geo|chart|report|export
  -> analytics artifact

POST /api/analytics/visualizations/render
  -> Visualization artifact
  -> spec + data lineage + reproducible Python snippet
```

批量归档已有 AI 摘要新闻：

```bash
npx tsx archive-all.ts
```

抓取策略实验脚本：

```bash
npx tsx test-jina.ts
npx tsx test-readability.ts
npx tsx test-puppeteer.ts
npx tsx test-url.ts
```

这些脚本主要用于验证 Jina、Readability、公开代理和 Puppeteer 对不同站点的正文提取效果。

## 归档机制

当单条新闻完成 AI 分析后，`archiveNewsToMarkdown()` 会在项目根目录创建 `archives/`，并按日期、情感标签和标题生成 Markdown 文件。

归档内容包括：

- 基本信息：来源、发布日期、链接、情感倾向、关键实体。
- AI 深度摘要与分析。
- 原文内容。
- 归档时间。

## 当前实现限制

- Research 深度研究依赖 Postgres、Redis/BullMQ 和搜索 provider；缺失时 UI 会显示降级状态。
- 当前 Research planner 已能识别工具评测和新闻查证任务，并生成 official、technical、benchmark、community、primary-source、timeline 等不同目的的 query。
- Redis/BullMQ 已用于 Research run 后台执行；当前 worker 会按 discovery -> frontier -> fetch -> extract -> analyze -> report 的独立队列推进。
- Frontier 评分解释已经落库到 `frontier_items.score_breakdown`，Frontier View 会展示每个 URL 的总分、六项分数和权重，便于调试“为什么优先抓这个源”。固定权重为：主题相关度 25%、来源权威性 25%、原始来源概率 20%、新鲜度 10%、来源多样性 10%、链接上下文质量 10%。
- Research 抓取层已支持 robots.txt、域名限速、重试分类、HTTP fetcher、Puppeteer browser fallback、原始资产保存和 run 内全文检索。
- Evidence graph 已记录 claim/evidence relation，报告默认包含研究摘要、关键结论、证据表、来源质量、冲突信息、时间线、尚不确定的问题、下一步建议搜索和完整来源列表。
- `fetchAndProcessFeeds()` 中 RSS 批量抓取阶段的全文抓取被注释掉，主要为了加快初始加载。
- `processItemAI()` 归档时没有完整保留原始 `source` 和 `pubDate`，目前用空字符串和当前时间兜底。
- `getNews().find(...)` 被用于单篇分析查找，数据量变大后应改成按 ID 查询。
- README 里的部分愿景能力，例如 SimHash 去重、Webhook、ETag、WebSocket，目前还没有落地到代码中。
- 本地数据库文件 `news.db` 已在仓库中出现，后续如果不希望提交运行数据，应把 `*.db`, `*.db-shm`, `*.db-wal` 加入 `.gitignore` 并从版本控制中移除。

## 架构文档

- [深度研究爬虫升级计划](docs/deep-research-crawler-upgrade-plan.md)
- [数据处理、统计分析与可视化能力升级方案](docs/data-processing-analytics-visualization-platform-plan-2026-06-07.md)
- [Data Lab、SPSS+ 与 AI 可视化增强方案](docs/data-lab-spss-plus-ai-visualization-upgrade-plan-2026-06-07.md)
- [数据处理、统计分析、可视化与论文发布能力完整方案](docs/data-processing-analytics-visualization-publication-plan-2026-06-07.md)
- [强力爬虫技术调研与 web-reader-router 互补方案](docs/strong-crawler-tooling-research-2026-06-07.md)
- [前后端与爬虫技术架构](docs/frontend-backend-crawler-architecture.md)

## 后续可扩展方向

- 把 RSS 源移到配置文件或数据库，支持按来源启停。
- 增加 `getNewsById()`，避免单篇分析全表扫描。
- 将正文抓取策略抽成独立模块，并记录每条新闻使用的抓取方式和失败原因。
- 增加抓取频率、批量大小、AI batch size 的环境变量配置。
- 为 API 增加基础测试，至少覆盖去重、分页、收藏、AI 队列。
- 在前端补充来源筛选、实体筛选、情感筛选和错误状态展示。

## 许可证

当前仓库未包含 `LICENSE` 文件。若需要开源发布，建议补充明确许可证。
