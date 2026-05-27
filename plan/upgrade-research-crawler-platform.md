---
mode: plan
change_id: upgrade-research-crawler-platform
---

# PolitiStream 通用调研爬虫平台升级计划

## 背景与动机

PolitiStream 当前主要依赖固定 RSS 源做新闻聚合，适合监控已知来源，但无法满足“用户输入任意调研主题后，系统自动在网络上持续索引、调查、抓取、分析并沉淀证据”的目标。

用户希望把它升级为更强的通用调研爬虫平台：不仅能读取固定新闻源，还能主动搜索、深爬、扩展线索、判断相关性、形成证据库和可追溯报告。

## Goal

把当前固定 RSS 新闻聚合器升级为“全自动调研爬虫平台”：用户输入任意调研主题或种子站点后，系统自动搜索、扩散外链、抓取正文、判定相关性、提取证据，并持续生成可追溯报告。

## Non-goals

- 第一版不做分布式集群。
- 第一版不删除现有新闻流能力。
- 第一版不实现登录绕过、付费墙破解、验证码规避或封禁规避。
- 第一版不要求导出 DOCX/PDF，报告先以 Markdown 为主。

## 当前仓库事实

- 当前项目是 TypeScript 前后端一体应用。
- 后端入口为 `server.ts`，使用 Express，并在开发模式下挂载 Vite middleware。
- 当前抓取主逻辑在 `src/server/services/rss.ts`，使用 `rss-parser` 从固定 `FEEDS` 获取 RSS。
- 当前 AI 分析在 `src/server/services/ai.ts`，使用 Gemini 生成摘要、情感和实体。
- 当前存储在 `src/server/db.ts`，使用 `better-sqlite3` 和本地 `news.db`。
- 当前前端在 `src/` 下，React 展示新闻流、收藏夹和 AI 待处理队列。
- 当前 README 已描述现有实现和限制。

## 改动边界

### 后端

- 新增调研任务模型：用户创建 `research_job`，包含主题、种子 URL、自动扩展查询词、运行频率、抓取预算、状态和报告。
- 存储从 SQLite 升级为 Postgres。
- Redis/BullMQ 负责搜索、抓取、分析、报告后台队列。
- 保留现有 RSS 新闻流，作为 legacy/default job 或兼容入口。
- 新增搜索发现层，组合使用：
  - Brave Search API：主搜索索引。
  - SerpApi：Google/高级搜索/地区化补盲。
  - Tavily：AI 调研和内容快取。
- 新增四类后台任务：
  - `search`：根据主题生成查询词，并调用 Brave、SerpApi、Tavily 获取候选 URL。
  - `crawl`：抓公开网页正文，复用并强化 Jina、Readability、Puppeteer、Axios 抽取链路。
  - `analyze`：用 Gemini 判断主题相关性，生成中文摘要、实体、证据片段、情感/立场。
  - `report`：按任务聚合证据，生成 Markdown 调研报告。

### API

新增 API：

- `POST /api/research-jobs`：创建调研任务。
- `GET /api/research-jobs`：列出任务。
- `GET /api/research-jobs/:id`：查看任务状态、统计、最近结果。
- `PATCH /api/research-jobs/:id`：暂停、恢复或修改预算。
- `POST /api/research-jobs/:id/run`：手动触发一轮调研。
- `GET /api/research-jobs/:id/documents`：查看已抓网页和相关性评分。
- `GET /api/research-jobs/:id/report`：获取最新 Markdown 报告。

### 数据模型

新增核心数据类型：

- `ResearchJob`：主题、状态、查询词、预算、运行频率。
- `SearchCandidate`：搜索供应商返回的候选 URL、标题、摘要、来源。
- `CrawlDocument`：URL、最终 URL、正文、抓取状态、内容 hash、发现深度。
- `EvidenceItem`：证据片段、关联文档、相关性分数、AI 解释。
- `ResearchReport`：Markdown 报告、引用链接、生成时间。

### 前端

- 增加调研任务视图。
- 增加证据库视图。
- 增加报告视图。
- 保留现有新闻流，不在第一版删除。

## 约束

- 第一版目标是单机或轻量服务器长期运行。
- 存储使用 Postgres，队列使用 Redis/BullMQ。
- 搜索强度排序固定为 Brave 主索引、SerpApi 补盲、Tavily 快速内容辅助。
- 深爬策略采用“全网扩散 + 预算约束”。
- 默认预算：
  - `maxDepth=3`
  - `maxUrlsPerRun=300`
  - `maxDomainsPerRun=50`
  - `runInterval=60min`
- 第一版只处理公开可访问网页。
- 被阻断页面记录为 `blocked`，不静默失败。
- 缺少某个搜索 API key 时只降级该 provider，其余链路继续工作。

## 验收标准

- 用户可以创建一个调研任务，并输入主题、种子 URL 和预算配置。
- 系统可以根据调研主题自动生成查询词。
- 系统可以调用 Brave、SerpApi、Tavily 获取候选 URL，并标准化为统一候选记录。
- 系统可以把候选 URL 入队，去重后抓取正文。
- 系统可以从抓取网页中提取跨域外链，并在预算限制内继续扩散。
- 系统可以用 AI 判断文档与调研任务的相关性。
- 系统可以生成证据片段，并关联到原文 URL。
- 系统可以生成 Markdown 调研报告。
- 输入“美国 AI 芯片出口管制最新变化”，系统能自动生成查询词、抓取多来源页面、筛出相关证据并生成报告。
- 输入一个任意公开网站种子 URL，系统能从站内和外链继续扩散，但不超过预算。
- 暂停任务后不再自动入队；恢复后按 `nextRunAt` 继续运行。
- 缺少某个搜索 API key 时只降级该 provider，其余链路继续工作。
- 现有 RSS 新闻流不被破坏。

## 验证方式

- 单元测试：
  - URL canonicalization。
  - URL 去重。
  - 内容 hash。
  - 跨域外链提取。
  - 搜索 provider 返回值标准化。
  - 调研任务预算限制和深度限制。
  - Gemini JSON 解析失败时的 fallback。
- 集成测试：
  - mock Brave/SerpApi/Tavily 返回候选 URL，确认入队、去重、状态流转正确。
  - mock HTML 页面，确认正文抽取、外链扩散、相关性过滤、证据入库正确。
  - 创建任务后跑完整 `search -> crawl -> analyze -> report` 流程。
- 手动验收：
  - 创建“美国 AI 芯片出口管制最新变化”任务。
  - 手动触发一轮调研。
  - 检查候选 URL、抓取文档、证据片段和 Markdown 报告。

## 迁移/回滚/降级

- SQLite 现有数据保留，不在第一版强制删除。
- Postgres 新表作为调研平台的新存储底座。
- 现有 RSS 流可作为 legacy/default job 迁移，也可以先保持原接口不变。
- 如果 Postgres 或 Redis 未配置，调研任务 API 应返回明确配置错误，不影响现有 RSS 新闻 API。
- 如果搜索供应商 API key 缺失，对应 provider 标记为 disabled，其他 provider 继续运行。
- 如果 AI 分析失败，文档仍入库，证据和报告生成标记为 pending 或 failed。

## 参考

- `README.md`
- `DESIGN.md`
- `server.ts`
- `src/server/services/rss.ts`
- `src/server/services/ai.ts`
- `src/server/db.ts`
