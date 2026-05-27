---
mode: plan
change_id: update-search-first-home
cwd: /Users/hwaigc/太空垃圾站/politistream/politistream
task: 搜索优先的深度研究首页与可管理 RSS 新闻爬虫分区
source_document: N/A
created_at: 2026-05-27T23:09:43+08:00
qualification_status: passed
---

# Plan: 搜索优先的深度研究首页与可管理 RSS 新闻爬虫分区

## 背景与动机

当前产品更像一个新闻监控台：应用启动后默认展示新闻流，Research 只是侧栏里的次级工作区。用户希望把“输入调研主题并自动深度研究”变成主入口，同时把现有新闻爬虫整理成独立分区，并允许手动扩展 RSS 监控源，让系统从固定信息源采集升级为可配置的信息监控与研究入口。
<!-- 下游：proposal.md 的 motivation -->

## Goal

- 打开应用后，主视图以全局搜索栏为核心入口；用户输入调研主题并提交后，系统创建深度研究任务、触发研究运行，并进入研究状态 / 结果页面。
- 现有新闻监控能力作为“新闻爬虫 / RSS 监控”分区存在，用户从导航进入后仍能使用当前新闻列表、详情、收藏、AI 待处理队列和刷新能力。
- 用户可以手动新增 RSS 源，新增后能立即刷新该源，并在之后的新闻监控刷新中持续纳入采集范围。
- RSS 源需要有可观测状态，至少能展示启用状态、最近刷新时间、最近刷新结果或错误，避免新增后用户不知道是否生效。
- 深度研究入口需要复用已有 research job / provider / crawler / report 底座；当搜索 provider 或后端运行依赖缺失时，前端应展示可理解的降级状态，而不是静默失败。
<!-- 下游：proposal.md 的 scope -->

## Non-goals

- 不移除现有新闻详情、收藏、AI 分析、AI Work Queue 等功能。
- 不新增登录、多用户权限、团队协作或计费体系。
- 不实现付费墙绕过、登录态爬取、验证码绕过或违反目标网站规则的采集方式。
- 不重写全部研究 provider 策略；本次以接通现有 Brave / SerpApi / Tavily provider、query planner、crawler、report 能力为主。
- 不要求一次性迁移历史新闻数据；历史 `news` 表数据应继续可读。
<!-- 下游：proposal.md 的 scope -->

## 当前仓库事实

- `src/App.tsx:12` 将 `workspace` 初始值设为 `news`，因此当前默认进入新闻监控视图，而不是搜索 / 研究主页。
- `src/App.tsx:112` 到 `src/App.tsx:145` 的侧栏导航把 Live Monitoring、Saved Library、AI Work Queue、Governance、Research 放在同一组导航里，Research 目前只是一个侧栏工作区。
- `src/App.tsx:168` 到 `src/App.tsx:181` 根据 `workspace === 'research'` 决定显示 `ResearchPanel` 或新闻流，说明新闻和研究已经有基本视图区隔，但还没有搜索优先首页。
- `src/components/ResearchPanel.tsx:24` 到 `src/components/ResearchPanel.tsx:40` 目前只能通过面板里的 `Create Job` 创建研究任务，创建后没有自动调用 run 接口。
- `src/components/ResearchPanel.tsx:57` 到 `src/components/ResearchPanel.tsx:125` 的 UI 是“左侧任务列表 + 右侧报告”的工作台形态，不是主搜索入口形态。
- `server.ts:36` 到 `server.ts:37` 已挂载 `/api/research/status` 和 `/api/research` 路由，说明研究接口已有入口。
- `src/server/research/routes.ts:18` 到 `src/server/research/routes.ts:30` 已支持创建 research job，`src/server/research/routes.ts:82` 到 `src/server/research/routes.ts:90` 已支持读取最新 report。
- `src/server/research/routes.ts:67` 到 `src/server/research/routes.ts:72` 的 `/jobs/:id/run` 目前只把任务标记为 `running` 并返回 `"Research queue runner is not wired yet."`，深度研究运行闭环尚未接通。
- `src/server/research/searchProviders.ts:25` 到 `src/server/research/searchProviders.ts:79` 已存在 Brave、SerpApi、Tavily provider 适配器，`src/server/research/searchProviders.ts:81` 到 `src/server/research/searchProviders.ts:110` 会处理 provider 缺失 key 或调用失败的结果。
- `src/server/research/queryPlanner.ts:1` 到 `src/server/research/queryPlanner.ts:23` 已有主题到多查询的 query planner。
- `server.ts:39` 到 `server.ts:40` 的 `/api/feeds` 直接返回 `FEEDS`，没有动态 RSS 源管理接口。
- `src/server/services/rss.ts:42` 到 `src/server/services/rss.ts:83` 将 RSS 源硬编码为 `FEEDS` 常量。
- `src/server/services/rss.ts:207` 到 `src/server/services/rss.ts:280` 的 `fetchAndProcessFeeds()` 固定遍历 `FEEDS` 采集新闻，当前无法纳入用户新增源。
- `src/server/db.ts:37` 到 `src/server/db.ts:56` 当前 SQLite 初始化只创建 `news` 表和 `idx_pubDate` 索引，没有 RSS 源持久化表。
- `src/components/NewsFeed.tsx:92` 到 `src/components/NewsFeed.tsx:100` 的刷新按钮会调用 `/api/refresh` 或 `/api/refresh-ai`，但没有按 RSS 源刷新或管理源状态的能力。
- `src/components/NewsFeed.tsx:137` 到 `src/components/NewsFeed.tsx:145` 在 `all` 模式下每 60 秒轮询新闻列表，但不会刷新 RSS 源配置。
- `package.json:6` 到 `package.json:12` 定义了 `npm run build`、`npm run lint` 和 `npm run test:research`，可作为本次改动的基础验证命令。
- `openspec/config.yaml:1` 使用 `schema: spec-driven`；`openspec/config.yaml:3` 到 `openspec/config.yaml:20` 目前没有额外 context 或 artifact rules。
- `openspec/specs/` 当前无基础 specs，相关行为基线需要从上述代码事实建立。
<!-- 下游：specs baseline，proposal.md 的 context -->

## 改动边界

- 前端应用结构：调整 `src/App.tsx` 的默认工作区、导航信息架构和主内容布局，让搜索 / 深度研究成为首页主入口，新闻爬虫成为独立分区入口。
- 深度研究 UI：重构或拆分 `src/components/ResearchPanel.tsx`，支持首页搜索提交、任务运行状态、候选文档、报告输出、错误 / 降级状态和历史研究任务回看。
- 新闻爬虫 UI：保留 `src/components/NewsFeed.tsx` 的新闻列表与刷新行为，并新增 RSS 源管理界面，包括新增、启用 / 停用、刷新、最近错误展示。
- RSS API：新增或扩展 `/api/feeds` 相关接口，支持列出动态源、创建源、更新启用状态、删除或停用源、刷新单个源；保留现有 `/api/refresh` 作为刷新全部启用源的入口。
- RSS 持久化：在现有新闻采集使用的 SQLite 侧新增 RSS source 持久化能力，字段至少包含 `id`、`name`、`url`、`enabled`、`last_fetched_at`、`last_error`、`created_at`、`updated_at`。
- RSS 采集服务：将 `src/server/services/rss.ts` 从固定 `FEEDS` 常量遍历改为“默认种子源 + 持久化启用源”的合并读取方式，并支持单源刷新结果回写。
- 深度研究运行：接通 `/api/research/jobs/:id/run` 的实际执行链路，至少完成 query planning、provider 搜索、候选结果入库 / 去重、公共页面抓取、证据整理、报告生成和状态更新；若部分依赖缺失则写入可解释失败 / 等待状态。
- 类型契约：更新 `src/types` 中与 RSS source、research job、report、document 状态相关的前后端共享类型。
- OpenSpec specs 领域建议：新增或修改 `search-first-research`、`rss-source-management`、`research-job-runtime` 三个能力领域的 spec deltas。
<!-- 下游：proposal.md scope，design.md scope，spec deltas 范围 -->

## 约束

- 必须保留现有 `/api/news`、`/api/favorites`、`/api/refresh`、`/api/refresh-ai` 的兼容行为，避免当前新闻监控页面失效。
- 默认硬编码 `FEEDS` 不能直接丢弃；首次启动或迁移时应作为默认种子源写入或合并展示，保证现有信息源仍可用。
- RSS 源新增必须校验 URL 格式和重复 URL；无效 RSS 或网络失败不能污染已启用源状态，应给出明确错误。
- 用户新增 RSS 源应持久化到项目当前新闻采集使用的 SQLite 层，避免仅存在前端内存或开发服务器重启后丢失。
- 深度研究依赖外部搜索 provider key；provider 缺失时应展示“可创建任务但无法完整运行”的状态，并保留后续补充配置后重试的路径。
- 前端大改需要保持桌面和移动基本可用，不应让主要按钮文字溢出或关键内容互相遮挡。
- 本 plan 只定义需求质量门，不包含业务代码实现；后续实现由 OpenSpec artifacts 和 issues CSV 拆解执行。
<!-- 下游：design.md 的 constraints -->

## 验收标准

1. 打开应用根页面时，首屏主视觉是一个可输入调研主题的搜索栏；默认不再直接进入新闻列表分栏。
2. 用户输入 `美国 AI 芯片出口管制` 并提交后，前端调用 research job 创建接口，随后触发该 job 的 run 接口，并导航到该 job 的研究状态 / 结果视图。
3. 深度研究视图能展示至少四类状态：创建中 / 运行中、搜索 provider 缺失或失败、报告未就绪、报告已生成；每种状态都有明确文案和可重试路径。
4. 当 provider key 可用且公共页面可访问时，run 接口会根据主题生成查询、调用配置好的搜索 provider、抓取候选页面、生成或更新 report，并将 job 状态推进到可观察的终态。
5. 当 provider key 缺失时，搜索提交不能导致前端崩溃；job 应保留，状态或消息应说明缺失的 provider 配置。
6. 用户点击“新闻爬虫 / RSS 监控”分区后，可以进入当前新闻监控页面，并继续使用全部新闻、收藏、AI Work Queue、新闻详情、手动刷新等已有能力。
7. RSS 源管理界面可以新增 `{ name, url }`；新增合法 RSS 源后，该源出现在源列表中，默认启用，并显示最近刷新状态。
8. 用户可以刷新单个新增 RSS 源；刷新成功后，该源的新文章会进入现有 `news` 列表，且 `source` 字段使用该 RSS 源名称。
9. 全局刷新 `/api/refresh` 会采集所有启用 RSS 源，包括默认种子源和用户新增源。
10. 提交重复 RSS URL 或非法 URL 时，API 返回可识别的 4xx 错误，前端展示错误，数据库不新增重复或非法源。
11. 用户停用某 RSS 源后，全局刷新不会继续采集该源；重新启用后可再次采集。
12. 现有硬编码默认源在升级后仍可见、可刷新，且历史 `news` 数据不丢失。
13. 前端在桌面宽屏和窄屏视口下，搜索栏、导航、研究状态、RSS 源管理、新闻列表之间不出现文字溢出或关键控件遮挡。
<!-- 下游：spec deltas 的 Scenarios，tasks.md 的 verification -->

## 验证方式

- 运行 `npm run lint`，确认 TypeScript 类型检查通过。
- 运行 `npm run build`，确认前端生产构建通过。
- 运行 `npm run test:research`，确认研究相关单元测试通过，并为新增 run / report 行为补充必要测试。
- 手工启动 `npm run dev`，打开 `http://localhost:3000`，验证根页面默认是搜索优先首页。
- 手工搜索 `美国 AI 芯片出口管制`，观察 job 创建、run 触发、状态展示、报告或降级消息。
- 手工进入“新闻爬虫 / RSS 监控”分区，验证原新闻列表、收藏、AI Work Queue、详情页和刷新能力仍可用。
- 手工新增一个有效 RSS 源并刷新该源，确认源列表状态更新，新闻列表出现该源文章。
- 手工新增重复 URL、非法 URL、不可解析 RSS URL，确认错误展示清晰且不会创建脏数据。
- 手工停用一个 RSS 源后执行全局刷新，确认该源不再参与采集；重新启用后可再次刷新。
<!-- 下游：tasks.md 的验证步骤 -->

## 迁移 / 回滚 / 降级

- 迁移：新增 RSS sources 表时，将当前 `FEEDS` 作为默认种子源写入或在读取层合并，避免升级后默认监控源消失。
- 迁移：历史 `news` 表不做破坏性修改；如需要新增 source metadata，只能采用向后兼容字段或独立表。
- 回滚：若动态 RSS 源管理出现严重问题，可临时恢复 `fetchAndProcessFeeds()` 读取静态 `FEEDS` 的路径，同时保留用户新增源数据表以便后续修复。
- 降级：深度研究 provider key 缺失或外部搜索服务失败时，保留 research job，标记可重试 / 配置缺失，并允许用户继续使用 RSS 新闻爬虫。
- 降级：单个 RSS 源刷新失败不应阻断其他源刷新；失败源记录 `last_error`，全局刷新继续处理剩余启用源。
<!-- 下游：proposal.md 的 risks，spec deltas 的 REMOVED/MODIFIED -->

## 参考

- `src/App.tsx:12`
- `src/App.tsx:112`
- `src/App.tsx:168`
- `src/components/ResearchPanel.tsx:24`
- `src/components/ResearchPanel.tsx:57`
- `src/components/NewsFeed.tsx:92`
- `src/components/NewsFeed.tsx:137`
- `server.ts:36`
- `server.ts:39`
- `server.ts:106`
- `src/server/services/rss.ts:42`
- `src/server/services/rss.ts:207`
- `src/server/db.ts:37`
- `src/server/research/routes.ts:18`
- `src/server/research/routes.ts:67`
- `src/server/research/routes.ts:82`
- `src/server/research/searchProviders.ts:25`
- `src/server/research/searchProviders.ts:81`
- `src/server/research/queryPlanner.ts:1`
- `package.json:6`
- `openspec/config.yaml:1`
- `plan/upgrade-research-crawler-platform.md`
