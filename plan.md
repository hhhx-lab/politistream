用户调研主题
  -> Research Job 调研任务
     -> Query Planner 拆查询词/实体/时间范围
     -> Source Discovery 找入口
        -> 搜索引擎/API
        -> RSS/站内 sitemap
        -> 可信站点白名单
        -> 已抓网页中的外链
     -> Crawl Queue 抓取队列
        -> 限速/去重/失败重试/robots 策略
     -> Extractor 正文抽取
        -> Jina/Readability/Puppeteer/站点适配器
     -> Relevance Ranker 相关性评分
     -> AI Analyzer 摘要/实体/立场/时间线/证据
     -> Knowledge Store
        -> 文章
        -> 来源
        -> 主题
        -> 证据
        -> 任务状态
     -> UI
        -> 调研任务面板
        -> 证据流
        -> 时间线
        -> 可信度/来源分布


最大强度方案：
Brave = 主搜索雷达
SerpApi = Google/高级搜索/地区化补盲
Tavily = AI 调研和内容快取
自建 crawler = 深爬、正文抽取、队列、去重、归档、持续监控

# PolitiStream 通用调研爬虫平台升级计划

## Summary
把当前固定 RSS 新闻聚合器升级为“全自动调研爬虫平台”：用户输入任意调研主题或种子站点后，系统自动搜索、扩散外链、抓取正文、判定相关性、提取证据，并持续生成可追溯报告。

第一版采用强度优先但可控的架构：Postgres 存储长期数据，Redis/BullMQ 管理搜索、抓取、分析、报告队列；搜索供应商组合使用 [Brave Search API](https://brave.com/search/api/) 主索引、[SerpApi](https://serpapi.com/search-api) 补 Google 入口、[Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/search) 做 AI 调研快车道。

## Key Changes
- 新增“调研任务”模型：用户创建 `research_job`，包含主题、种子 URL、自动扩展查询词、运行频率、抓取预算、状态和报告。
- 存储从 SQLite 升级为 Postgres；Redis 负责后台队列。现有 RSS 新闻流保留为 legacy/default job，避免一次性打断现有功能。
- 新增四类后台任务：
  - `search`: 根据主题生成查询词，并调用 Brave、SerpApi、Tavily 获取候选 URL。
  - `crawl`: 抓公开网页正文，复用并强化 Jina、Readability、Puppeteer、Axios 抽取链路。
  - `analyze`: 用 Gemini 判断主题相关性，生成中文摘要、实体、证据片段、情感/立场。
  - `report`: 按任务聚合证据，生成 Markdown 调研报告。
- 深爬策略采用“全网扩散 + 预算约束”：默认允许跨域外链扩展，但每轮限制 `maxDepth=3`、`maxUrlsPerRun=300`、`maxDomainsPerRun=50`、`runInterval=60min`，避免任务失控。
- 明确边界：第一版只处理公开可访问网页；不做登录绕过、付费墙破解、验证码规避或封禁规避。被阻断页面记录为 `blocked`，不静默失败。

## Public Interfaces
- 新增 API：
  - `POST /api/research-jobs`: 创建调研任务。
  - `GET /api/research-jobs`: 列出任务。
  - `GET /api/research-jobs/:id`: 查看任务状态、统计、最近结果。
  - `PATCH /api/research-jobs/:id`: 暂停/恢复/修改预算。
  - `POST /api/research-jobs/:id/run`: 手动触发一轮调研。
  - `GET /api/research-jobs/:id/documents`: 查看已抓网页和相关性评分。
  - `GET /api/research-jobs/:id/report`: 获取最新 Markdown 报告。
- 新增核心数据类型：
  - `ResearchJob`: 主题、状态、查询词、预算、运行频率。
  - `SearchCandidate`: 搜索供应商返回的候选 URL、标题、摘要、来源。
  - `CrawlDocument`: URL、最终 URL、正文、抓取状态、内容 hash、发现深度。
  - `EvidenceItem`: 证据片段、关联文档、相关性分数、AI 解释。
  - `ResearchReport`: Markdown 报告、引用链接、生成时间。
- 新增环境变量：
  - `DATABASE_URL`
  - `REDIS_URL`
  - `BRAVE_API_KEY`
  - `SERPAPI_API_KEY`
  - `TAVILY_API_KEY`
  - `GEMINI_API_KEY`

## Test Plan
- 单元测试：
  - URL canonicalization、去重、内容 hash、跨域外链提取。
  - 搜索 provider 返回值标准化。
  - 调研任务预算限制和深度限制。
  - Gemini JSON 解析失败时的 fallback。
- 集成测试：
  - mock Brave/SerpApi/Tavily 返回候选 URL，确认入队、去重、状态流转正确。
  - mock HTML 页面，确认正文抽取、外链扩散、相关性过滤、证据入库正确。
  - 创建任务后跑完整 `search -> crawl -> analyze -> report` 流程。
- 验收场景：
  - 输入“美国 AI 芯片出口管制最新变化”，系统能自动生成查询词、抓取多来源页面、筛出相关证据并生成报告。
  - 输入一个任意公开网站种子 URL，系统能从站内和外链继续扩散，但不超过预算。
  - 暂停任务后不再自动入队；恢复后按 `nextRunAt` 继续运行。
  - 缺少某个搜索 API key 时只降级该 provider，其余链路继续工作。

## Assumptions
- 第一版目标是单机或轻量服务器长期运行，不做分布式集群。
- 搜索强度排序固定为 Brave 主索引、SerpApi 补盲、Tavily 快速内容辅助。
- 报告优先做 Markdown，可后续复用本机文档工具链导出 DOCX/PDF。
- 前端先增加调研任务、证据库、报告三个视图；现有新闻流不删除。
