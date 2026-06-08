# PolitiStream 全计划实现审计

生成时间：2026-06-08 09:57:40
审计对象：深度研究爬虫、Research UI、强力数据源抓取、Data Lab / SPSS+ / 可视化升级方向
结论：这一版可以收尾。当前已经形成可运行、可演示、可继续迭代的平台主干，并通过自动化门禁；本轮补上了本地 Postgres/Redis Research E2E、Data Lab SPSS 风格分析向导、Research UI 组件拆分、Source Explorer 筛选/排序/错误聚合/Claim 反查，以及报告证据质量门。不能声明“全网无限强 100% 完成”，因为真实 provider 联网验证、Deep 预算长任务压测和更完整的高级统计 GUI 仍属于下一版验收项。

## 本轮已验证通过

命令：

```bash
npm run test:research
npm run lint
npm run test:ui
npm run build
npm run test
npm run test:research-platform
npm run benchmark:research
npm run test:full
```

`npm run test:full` 当前串联：

```bash
npm run test
npm run test:research-e2e
npm run benchmark:research
npm run lint
npm run build
```

覆盖结果：

- Runtime、Research、Research Platform、Analytics、Analytics Import、Analytics Worker、Agent、i18n、Playwright UI smoke 全部通过。
- Research E2E smoke 使用真实 `.env` Postgres、隔离 Redis DB、BullMQ worker 和本地 fixture URL，验证 job -> run -> frontier -> documents -> evidence -> events -> report 的闭环。
- Research benchmark 能输出文档转换工具、新闻溯源、政策研究三个 fixture 的 planner 覆盖结果。
- Playwright UI smoke 实际启动后端 `3301` 和前端 `3300`，检查中英文、Research、Data Lab、SPSS Pro 分析向导、Source Explorer、Frontier 评分解释等可见内容。
- Vite build 通过，仅保留 chunk size warning。

## 已有实现证据

### Research run 和 Worker 化

证据文件：

- `server.ts`
- `src/server/research/run.ts`
- `src/server/research/workers/worker.ts`
- `src/server/research/workers/queues.ts`
- `src/server/research/workers/*Worker.ts`
- `src/server/research/workers/stageRunner.ts`
- `src/server/research/platform.test.ts`

当前状态：

- 后端启动时会调用 `startResearchWorkers()`。
- Redis 配置可用时会启动 discovery、frontier、fetch、extract、analyze、report 六个 BullMQ worker。
- `POST /api/research/jobs/:id/runs` 和兼容入口 `POST /api/research/jobs/:id/run` 会创建 run 并入队。
- `pause/resume/cancel` API 已存在，worker stage 会检查 run 状态，停止后续 stage 链接。
- `/api/research/queues` 可返回队列健康。

待补强：

- 需要用真实 Redis 跑一次 job -> run -> 六段 worker 自动推进的端到端测试。
- 需要记录 worker 启动状态到 `/api/research/status` 或运行监控 UI，避免“Redis 配了但 worker 没起来”时不明显。

### Discovery Provider Registry

证据文件：

- `src/server/research/discovery/registry.ts`
- `src/server/research/discovery/providerRegistry.ts`
- `src/server/research/discovery/providerTypes.ts`
- `src/server/research/searchProviders.ts`
- `src/server/research/research.test.ts`
- `src/server/research/platform.test.ts`

当前状态：

- 已有统一 `DiscoveryProvider` 接口和候选归一化。
- 已接入 web search、RSS、sitemap、GitHub、npm/PyPI、official、data catalog、structured API、sports/data 等发现方向。
- Provider 调用结果会写入 `discovery_results`，Provider Panel 和 `/api/research/providers/health` 可以展示 calls、errors、candidateCount、durationMs。
- 单 provider 失败不会直接中断其他 provider，失败会写入 provider result。

待补强：

- 需要真实 Brave / SerpApi / Tavily / GitHub / npm / PyPI 联网 smoke，区分“接口存在”和“真实 provider 有效”。
- provider capability 排序已存在，但还需要把 cost、reliability、purpose 匹配更明确地展示到 UI。

### Frontier Queue 和评分解释

证据文件：

- `src/server/research/frontier/scoring.ts`
- `src/server/research/frontier/queue.ts`
- `src/server/research/store.ts`
- `src/components/ResearchPanel.tsx`
- `src/types.ts`
- `scripts/ui-smoke.mjs`
- `src/server/research/research.test.ts`
- `README.md`

当前状态：

- Frontier score 固定权重已实现：
  - 主题相关度 25%
  - 来源权威性 25%
  - 原始来源概率 20%
  - 新鲜度 10%
  - 来源多样性 10%
  - 链接上下文质量 10%
- `frontier_items.score_breakdown` 已落库，包含旧库迁移 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`。
- Frontier View 已显示总分、六项评分、权重和进度条。
- Playwright UI smoke 会断言“评分解释、主题相关、来源权威、原始来源、新鲜度、来源多样性、上下文质量、权重”可见。

待补强：

- 评分公式还偏启发式，需要在真实 benchmark 上校准。
- 需要把“为什么跳过 / 为什么失败 / 为什么降低优先级”也纳入解释层。

### 多内容 Extractor 和抓取层

证据文件：

- `src/server/research/crawler.ts`
- `src/server/research/fetchers/*`
- `src/server/research/extractors/*`
- `src/server/research/assets/rawAssetStore.ts`
- `src/server/research/search/documentIndex.ts`
- `src/server/research/platform.test.ts`
- `src/server/research/research.test.ts`

当前状态：

- 抓取层已有 robots、域名限速、重试判断、HTTP fetcher、browser fallback、增强 fetch provider 尝试、原始资产保存。
- Extractor router 已覆盖 HTML、PDF、GitHub、npm、PyPI、sitemap、table，以及 CSV/JSON/Parquet/Excel/GeoJSON 等数据源类型路由。
- `document_assets`、`document_links`、`extracted_tables`、`crawl_documents.search_vector` 已纳入 schema 和 API。
- Source Explorer 已展示读取路径、诊断结果、发现外链、抽取表格、原始资产等。

待补强：

- 需要对 PDF/GitHub/npm/PyPI/sitemap/table 做真实 URL 集成测试，不只靠静态和 mock。
- 浏览器 fallback 需要长时间资源释放验证，避免 Puppeteer 页面泄漏。
- Deep 模式 300 到 500 URL 的吞吐、失败率、内存占用还没有真实压测证据。

### Evidence Graph、Credibility 和报告

证据文件：

- `src/server/research/evidence/graph.ts`
- `src/server/research/analysis.ts`
- `src/server/research/reports.ts`
- `src/server/research/run.ts`
- `src/server/research/store.ts`
- `src/server/research/routes.ts`
- `src/components/ResearchPanel.tsx`
- `scripts/ui-smoke.mjs`
- `src/server/research/platform.test.ts`
- `src/server/research/research.test.ts`

当前状态：

- `evidence_claims`、`evidence_items`、`evidence_relations`、`source_profiles` 已有 schema/API。
- 可信度评分和 source profile 初版已接入。
- Evidence Table、Evidence Graph、Claims Panel 已在 Research UI 展示。
- 报告阶段会运行证据质量门，检查 claim 与 supporting/conflicting evidence 的关联情况，并把 `证据质量门: passed/failed` 写入 Markdown metadata。
- `run_events` 会记录证据质量门结果，UI smoke 已覆盖“证据质量门通过”展示。
- 报告默认简体中文，爬取正文按原语言展示。

待补强：

- 当前 claim/evidence 抽取仍有规则 fallback；AI JSON schema 校验和失败降级需要更完整的单测。
- 新闻溯源的 earliest source candidates / 时间线需要真实新闻场景验证。
- 证据质量门已经具备基础结构化断言；下一版需要把“不确定结论”的产品表达、人工复核入口和真实新闻场景验证补强。

### Source Explorer UI 和中英文

证据文件：

- `src/App.tsx`
- `src/components/ResearchPanel.tsx`
- `src/components/research/RunWorkflowPanels.tsx`
- `src/components/research/EvidencePanels.tsx`
- `src/components/research/SourceExplorerPanel.tsx`
- `src/components/research/FrontierProviderPanels.tsx`
- `src/components/research/shared.tsx`
- `src/components/DataLab.tsx`
- `src/i18n.ts`
- `src/i18n.test.ts`
- `scripts/ui-smoke.mjs`

当前状态：

- UI 默认简体中文，支持中英文切换。
- Research 页面已包含运行监控、队列健康、Provider 健康、Run 时间线、运行干预、查询计划、文档检索、新闻分析、证据表、证据图谱、来源浏览器、Frontier 视图、Provider 面板、数据源覆盖。
- Source Explorer 已包含来源搜索、状态筛选、tier 筛选、权威/证据/失败排序、错误聚合、Claim 反查、来源详情、读取路径、诊断结果、发现外链、抽取表格、原始资产和引用来源跳转。
- Research 和 Data Lab 已支持双向跳转。
- `ResearchPanel.tsx` 已从单文件大组件拆出 RunWorkflow、Evidence、Source Explorer、Frontier/Provider/Runtime Monitor 和共享工具组件，主文件从约 2104 行降到约 883 行。
- Playwright smoke 覆盖桌面与移动宽度的横向溢出检查，并断言 Source Explorer 的筛选、排序、错误聚合、Claim 反查和证据质量门展示。

待补强：

- UI 目前是 dense workbench 风格，已经把现有核心 Research / Data Lab 功能接入；下一版可继续做视觉分层、虚拟列表、图谱交互增强和更细的 source 对比视图。

### Data Lab、SPSS+、数据处理与可视化

证据文件：

- `src/server/analytics/*`
- `workers-analytics/politistream_analytics/*`
- `src/components/DataLab.tsx`
- `src/components/data-lab/DataLabAnalysisWizard.tsx`
- `scripts/analytics-worker-smoke.mjs`
- `src/server/analytics/analytics.test.ts`
- `src/server/analytics/import.integration.test.ts`
- `scripts/ui-smoke.mjs`

当前状态：

- Data Lab 已有 dataset/profile/import/materialize/analyze/jobs/artifacts/visualization/report 等 API。
- Python worker smoke 覆盖 profile、stats、quality、frequency、crosstab、tests、regression、logistic、poisson、dimension、cluster、anomaly、timeseries、transform、cleaning、news、text、explain、deepml、geo、chart、report、export。
- 前端可显示数据集、profile、统计结果、图表建议、Research 数据源资产清单、materialize、refresh、job/artifact 操作。
- 本轮新增 `SPSS Pro 分析向导`，按探索画像、组间比较/问卷统计、预测建模/回归、聚类/降维/异常、时间序列/趋势、新闻文本整理、论文制图/报告交付组织变量、方法链、图表方案和报告导出。
- UI smoke 已断言分析向导、方法链、图表方案、报告与导出、七类模板、数据源 lineage、Data Lab 操作和图表预览均可见/可用。

待补强：

- 当前已具备 SPSS 风格分析向导和一键方法链，但还不是完整桌面统计软件体验；后续可继续补变量角色校验、参数面板、对话框式假设检验和结果树。
- 论文图模板、工程图、交互图虽然有 worker 输出，但还需要更精细的前端配置面板。
- `.sav`、更完整的 Bayesian/R worker、复杂 3D 工程图仍属于后续项。

## 不能声明 100% 的原因

1. 自动化门禁通过，且已有本地 Postgres/Redis Research E2E；但真实网络 provider 和真实长任务质量仍需要端到端证据。
2. Deep 模式 500 URL 的性能目标尚未压测。
3. Research benchmark 当前评估 planner 覆盖，不等于真实抓取质量、证据密度和报告可信度全量评估。
4. 部分计划要求是产品体验级要求，比如更完整的 SPSS 参数面板、变量角色校验、结果树、真实长任务质量指标，目前是可用初版，不是最终桌面统计软件。
5. 工作区包含大量未提交和未跟踪文件，提交前需要严格清理 staging 范围，不能把 `news.db*`、`.venv`、`__pycache__`、临时产物提交进去。

## 下一步建议执行顺序

1. 真实 provider smoke：按 provider 分组跑小预算 Quick，记录候选数、错误、延迟和 UI 展示。
2. Deep/Standard 压测：用 mock provider 或受控 URL 集合验证 150/500 URL 下的预算、限速、失败隔离和内存。
3. Evidence 真实场景验证：用新闻溯源和工具调研真实样本检查 claim/evidence/conflict/timeline 的质量。
4. Source Explorer 增强：补虚拟列表、大批量来源对比、图谱联动和来源级审阅批注。
5. Data Lab GUI 增强：补变量角色校验、参数面板、结果树、论文图模板和更完整的 `.sav`/Bayesian/R worker。
