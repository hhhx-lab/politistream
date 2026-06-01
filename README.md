# PolitiStream

PolitiStream 是一个用 TypeScript 写的新闻抓取、RSS 监控和深度研究项目。目前的实现不是 Scrapy 这类独立爬虫框架，而是一个前后端分离的本地 Web 应用：

- 前端用 Vite + React 启动独立开发服务，默认端口 `3000`。
- 后端用 Express 启动独立 API 服务，默认端口 `3001`。
- 前端通过 Vite proxy 将 `/api/*` 转发到后端。
- RSS 抓取层用 `rss-parser` 批量读取默认源和用户新增源。
- 正文补全层按 Jina Reader、公开代理、Puppeteer、直连 Axios 的顺序尝试提取文章正文。
- AI 层用 Gemini 对新闻做中文摘要、情感分值和实体提取。
- 新闻/RSS 存储层用 SQLite，本地数据库文件为 `news.db`。
- 深度研究存储层用 Postgres，长任务通过 Redis/BullMQ 入队，由后台 worker 执行。
- 前端用 React 展示搜索首页、研究任务、RSS 源管理、新闻流、收藏夹和 AI 待处理队列。
- 搜索首页支持 Quick / Standard / Deep 研究预算和 seed URL，后端会把 topic 规划成多目的 query plan。

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
     -> Gemini 生成中文摘要、情感分值、实体列表
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
│   │       ├── ai.ts              # Gemini 分析封装
│   │       └── storage.ts         # Markdown 归档
│   ├── types.ts                   # 前后端共享类型
│   ├── main.tsx                   # React 挂载入口
│   └── index.css                  # 样式入口
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

环境变量 `GEMINI_API_KEY` 有效时才会启用 Gemini；缺失或仍是占位值时，系统会返回一段“AI disabled”的摘要，其他流程仍可运行。

`analyzeContent(title, snippet, url?)` 当前使用模型：

```text
gemini-2.0-flash
```

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

传入 URL 时会启用 Gemini 的 `urlContext` 工具，并要求模型只返回合法 JSON。返回值如果混入 Markdown 代码块或其他文本，代码会尝试用正则提取第一个 JSON 对象再解析。

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
| `POST` | `/api/research/runs/:runId/pause` | 暂停 run |
| `POST` | `/api/research/runs/:runId/resume` | 恢复 run 并重新入队 |
| `POST` | `/api/research/runs/:runId/cancel` | 取消 run |
| `GET` | `/api/research/runs/:runId/events` | Run timeline 事件 |
| `GET` | `/api/research/runs/:runId/frontier` | Frontier URL 状态 |
| `GET` | `/api/research/providers/health` | Discovery provider 全局健康聚合 |
| `GET` | `/api/research/runs/:runId/assets` | Run 内原始 HTML/PDF/text 资产 metadata |
| `GET` | `/api/research/runs/:runId/search?q=` | Run 内文档全文检索 |
| `GET` | `/api/research/runs/:runId/evidence` | Evidence claims 和 evidence items |
| `GET` | `/api/research/runs/:runId/graph` | Evidence graph：claims、evidence、relations、sources、summary |
| `GET` | `/api/research/runs/:runId/sources` | Source profiles 和可信度信号 |
| `GET` | `/api/research/runs/:runId/providers` | Discovery provider 调用记录 |
| `GET` | `/api/research/jobs/:id/documents` | 查看 research 文档 |
| `GET` | `/api/research/jobs/:id/report` | 查看最新 research 报告 |

## 前端实现

前端在 `src/` 下，使用 React 19、Tailwind CSS v4、Motion 和 Lucide React。

当前界面包括：

- Search Home：搜索优先入口，展示后端 API、Research DB、Search Providers、RSS Startup 状态，支持 Quick / Standard / Deep 预算和可选 seed URL。
- Research Jobs：run-centric 工作台，包含 run 时间线、Frontier View、Source Explorer、Evidence Table、Provider Panel、报告和文档。
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
npm run dev
```

然后打开：

```text
http://localhost:3000
```

`.env` 本地开发推荐配置：

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
RESEARCH_FETCH_MAX_ATTEMPTS=3
RESEARCH_DOMAIN_MIN_DELAY_MS=1500
RESEARCH_RESPECT_ROBOTS_TXT=true
RESEARCH_BROWSER_FETCH_ENABLED=true
RESEARCH_ASSET_DIR=".data/research-assets"
RESEARCH_MEMORY_ENABLED=true
RESEARCH_MEMORY_MAX_AGE_HOURS=24

BRAVE_API_KEY=""
SERPAPI_API_KEY=""
TAVILY_API_KEY=""
GITHUB_TOKEN=""
```

只看 RSS 新闻时可以不配置 Postgres/Redis/Gemini/Search Provider。完整深度研究至少需要 `DATABASE_URL`、`REDIS_URL` 和一个搜索 provider key。没有 Gemini 时，Research planner 会使用规则策略生成结构化 query plan；没有搜索 provider key 时，UI 会显示 provider 缺失状态。`GITHUB_TOKEN` 可选，用于提高 GitHub discovery/extractor 的 API 限额。

## 常用脚本

```bash
npm run dev           # 一键启动前后端
npm run dev:frontend  # 只启动 Vite 前端，默认 3000
npm run dev:backend   # 只启动 Express 后端，默认 3001
npm run build         # Vite 前端构建
npm run preview       # 预览 Vite 构建产物
npm run lint          # TypeScript noEmit 检查
npm run test          # runtime + research 基础测试
npm run test:research-platform  # Research 平台架构测试
npm run benchmark:research      # 离线研究能力 benchmark
npm run clean         # 删除 dist
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
- Research 抓取层已支持 robots.txt、域名限速、重试分类、HTTP fetcher、Puppeteer browser fallback、原始资产保存和 run 内全文检索。
- Evidence graph 已记录 claim/evidence relation，报告默认包含研究摘要、关键结论、证据表、来源质量、冲突信息、时间线、尚不确定的问题、下一步建议搜索和完整来源列表。
- `fetchAndProcessFeeds()` 中 RSS 批量抓取阶段的全文抓取被注释掉，主要为了加快初始加载。
- `processItemAI()` 归档时没有完整保留原始 `source` 和 `pubDate`，目前用空字符串和当前时间兜底。
- `getNews().find(...)` 被用于单篇分析查找，数据量变大后应改成按 ID 查询。
- README 里的部分愿景能力，例如 SimHash 去重、Webhook、ETag、WebSocket，目前还没有落地到代码中。
- 本地数据库文件 `news.db` 已在仓库中出现，后续如果不希望提交运行数据，应把 `*.db`, `*.db-shm`, `*.db-wal` 加入 `.gitignore` 并从版本控制中移除。

## 架构文档

- [深度研究爬虫升级计划](docs/deep-research-crawler-upgrade-plan.md)
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
