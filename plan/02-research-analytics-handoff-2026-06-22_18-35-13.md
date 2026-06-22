---
mode: plan
change_id: add-research-analytics-handoff
cwd: /Users/hwaigc/太空垃圾站/politistream/politistream
task: Research 到 Data Lab 的分析机会评估与转场闭环
source_document: /Users/hwaigc/太空垃圾站/politistream/politistream/docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md
created_at: 2026-06-22T18:35:13+08:00
qualification_status: passed
---

# Plan: Research 到 Data Lab 的分析机会评估与转场闭环

## 背景与动机

当前 PolitiStream 已经具备深度 Research、数据源候选导出、Data Lab 数据物化和分析 worker 能力，但 Research 结束后到 Data Lab 之间缺少一个清晰的“是否值得做数据分析”的决策门。用户希望系统能区分“全国避孕套市场”这类需要结构化数据分析的课题，以及“好用的文档编辑工具”这类更适合研究报告和对比分析的课题，避免所有研究结果都被硬塞进 Data Lab。
<!-- 下游：proposal.md 的 motivation -->

## Goal

- 在 Research run 完成后生成可解释的 `Analysis Opportunity`，评估课题是否适合进入 Data Lab，并给出 `仅报告 / 轻量分析 / 完整分析 / 继续补抓数据` 四种用户可选动作。
- 让 Data Lab 接收 Research 的 topic、runId、reportId、候选字段、缺失字段、数据源清单和推荐分析深度，并自动打开正确页面和上下文面板。
- 对数据分析型课题生成候选变量、数据缺口、推荐数据源、推荐统计方法和图表建议；对非数据分析型课题默认保留研究报告，不创建 dataset、不触发 analytics worker。
<!-- 下游：proposal.md 的 scope -->

## Non-goals

- 不重写现有 Research crawler、provider registry、frontier queue 或 worker pipeline；本 change 只补 Research 完成后的分析机会评估和 Data Lab handoff。
- 不把所有课题强制转成结构化数据分析；工具对比、新闻查证、产品选型等默认可以停留在 Research 报告。
- 不绕过付费墙、验证码、robots 限制或站点访问规则。
- 不要求第一版一次性达到完整 SPSS 商业软件全量功能；只要求把已有 analytics 能力接入到课题驱动转场和可验证 UI。
<!-- 下游：proposal.md 的 scope -->

## 当前仓库事实

- OpenSpec 当前没有归档后的基础 specs，`openspec list --specs` 返回 no specs；但 `upgrade-research-crawler-platform` active change 已定义了 Research query planning、多 provider 搜索、候选去重等 web discovery 行为。`openspec/changes/upgrade-research-crawler-platform/specs/web-discovery/spec.md:3`
- `upgrade-research-crawler-platform` active change 已定义 crawl pipeline 的候选入队、公开页面抽取和失败原因记录行为。`openspec/changes/upgrade-research-crawler-platform/specs/crawl-pipeline/spec.md:3`
- `upgrade-research-crawler-platform` active change 已定义 Research 文档相关性评分、证据片段抽取和 AI 分析失败兜底。`openspec/changes/upgrade-research-crawler-platform/specs/research-analysis/spec.md:3`
- `upgrade-research-crawler-platform` active change 已定义从 evidence 生成 Markdown research report、读取最新报告和重新生成报告。`openspec/changes/upgrade-research-crawler-platform/specs/research-reporting/spec.md:3`
- Research 前端已经有 `onOpenDataLab` 回调，并已有“导出到 Data Lab”“打开 Data Lab”“生成 Data Lab 数据源清单”等文案。`src/components/ResearchPanel.tsx:75`
- Research 前端当前“生成 Data Lab 数据源清单”会直接调用 `/api/analytics/datasets/from-research-run/:runId/data-sources`，成功后直接 `onOpenDataLab` 到 Data Lab。`src/components/ResearchPanel.tsx:887`
- Research 前端 run 顶部已有 pause/resume/cancel/export 等控制按钮，但没有分析机会评估决策卡作为独立步骤。`src/components/ResearchPanel.tsx:1101`
- Data Lab 已有 `home / import / dataset / wizard / analysis / visuals / sources / activity / system` 多页面结构。`src/components/DataLab.tsx:381`
- Data Lab 当前可以根据 `focus.runId` 或 `focus.datasetId` 自动选中数据集，并在 research-data-source 时切到 `sources` 页面。`src/components/DataLab.tsx:522`
- Data Lab 分析向导已作为独立组件接入 `wizard` 页面。`src/components/DataLab.tsx:1205`
- Research AI 分析当前能对单篇文档做相关性评分、摘要和 evidence 抽取，并有 deterministic fallback；这可作为 `analysisOpportunityAgent` 的输入之一。`src/server/research/analysis.ts:44`
- Analytics API 已支持从 Research run 文档创建 dataset。`src/server/analytics/routes.ts:172`
- Analytics API 已支持从 Research run 的 candidates、frontier、providers 生成 `research-data-source` registry dataset，并保存 lineage。`src/server/analytics/routes.ts:192`
- Analytics API 已支持对 research-data-source registry 的单个或批量数据源做 materialize，生成 `materialized-data-source` dataset。`src/server/analytics/routes.ts:265`
- Analytics 类型已支持 `manual`、`research-run`、`research-data-source`、`materialized-data-source`、`crawler`、`upload`、`api` 等 dataset sourceKind。`src/server/analytics/types.ts:33`
- Analytics worker command 类型已覆盖 profile、stats、quality、frequency、crosstab、tests、regression、cluster、timeseries、text、geo、chart、report、export 等能力。`src/server/analytics/types.ts:87`
- Analytics capability registry 已把数据画像、统计分析、机器学习、可视化和可复现中文报告暴露为能力。`src/server/analytics/engine.ts:10`
- 可视化建议已有柱状图、饼图、箱线图、折线图、散点图、相关热力图、直方图和数据质量表。`src/server/analytics/engine.ts:96`
- Python analytics worker 已引入 numpy、pandas、scipy、statsmodels、torch、sklearn、matplotlib、plotly 等分析和可视化依赖入口。`workers-analytics/politistream_analytics/advanced.py:17`
- 源方案文档已经明确 `Analysis Opportunity` 对象字段、决策状态机、评分规则、handoff payload、API 契约和 Playwright 验收场景。`docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:71`
<!-- 下游：specs baseline，proposal.md 的 context -->

## 改动边界

- Research 后端：新增 `Analysis Opportunity` 评估服务、存储对象、读取/刷新 API，以及 `analysis-handoff` 决策 API。
- Research 前端：在 run 完成后的报告页或 Source Explorer 上方新增 `AnalysisDecisionPanel` 与 `AnalysisOpportunityDrawer`，展示可分析性评分、候选数据特征、缺失字段、数据源依据和四种用户动作。
- Data Lab 后端：接收 Research handoff，上下文写入 topic/dataset/plan metadata；根据轻量/完整模式限制后续 worker 链路。
- Data Lab 前端：根据 handoff 自动进入 `sources` 或 `wizard`，右侧上下文面板展示 candidate_features、available_fields、missing_fields、recommended_actions。
- Analytics planner：基于 Research report/evidence/source registry/dataset profile 生成候选变量、数据缺口、推荐方法、推荐图表和风险说明。
- OpenSpec specs 领域：新增或修改 `research-analytics-handoff`、`analytics-topic-planning`、`data-lab-workflow-ui`，并与现有 `research-analysis`、`research-reporting`、`crawl-pipeline` 行为保持兼容。
<!-- 下游：proposal.md scope，design.md scope，spec deltas 范围 -->

## 约束

- Research run、RSS 新闻链路和现有 `/api/analytics/datasets/from-research-run/:runId/data-sources` 兼容 API 必须继续可用。
- `Analysis Opportunity` 的生成只能评估和解释，不得隐式创建 dataset 或触发 worker；只有用户选择 `light_analysis` 或 `full_analysis` 才进入 Data Lab。
- `report_only` 决策不得创建 Data Lab dataset，不得触发 analytics worker。
- `light_analysis` 只允许 profile、stats、基础 chart，不自动运行回归、聚类、深度学习或重型 worker。
- AI 可用于课题语义扩展、变量建议、解释和报告，但统计计算、画像、图表和模型必须由确定性 TypeScript/Python worker 产出。
- UI 支持中英文切换；抓取内容保持原语言；AI 摘要、统计解释和报告默认简体中文。
- 所有外部 key、模型名、服务地址仍通过 `.env` 管理，不在代码中硬编码。
- 公开数据源抓取必须遵守现有访问限制，不绕过验证码、付费墙或禁止抓取规则。
<!-- 下游：design.md 的 constraints -->

## 验收标准

1. 当一个 Research run 完成且有报告/证据/来源时，`POST /api/research/runs/:runId/analysis-opportunity` 返回 `score`、`score_breakdown`、`recommended_analysis_mode`、`candidate_features`、`required_fields`、`available_fields`、`missing_fields`、`recommended_data_sources`、`recommended_actions` 和 `decision_reason`。
2. 对“全国避孕套市场”类市场研究课题，分析机会评估应推荐 `full_analysis` 或 `continue_crawl`，并列出市场规模、地区、年份、渠道、厂商营收、销量、购买率、出生率/结婚率等候选数据特征或缺失字段。
3. 对“有哪些好用的文档编辑工具”类工具对比课题，分析机会评估默认推荐 `report_only` 或 `light_analysis`，不得默认推荐完整 Data Lab 分析。
4. Research UI 在 run 完成后显示 `AnalysisDecisionPanel`，用户能看到课题类型、可分析性评分、候选数据特征、已发现数据资产、推荐动作和“查看依据”抽屉。
5. 用户选择 `report_only` 后，后端只保存用户决策并标记 Research 报告 final，不创建 analytics dataset，不触发 analytics worker。
6. 用户选择 `light_analysis` 后，系统创建或复用 Research 数据源 registry/轻量 dataset，并只运行 profile、stats、基础 chart；UI 跳转到 Data Lab 的 `sources` 或轻量分析上下文。
7. 用户选择 `full_analysis` 后，系统创建 topic/handoff/analysis plan 上下文，Data Lab 自动打开 `wizard`，并展示 runId、topic、candidate_features、missing_fields 和 data source registry。
8. 用户选择 `continue_crawl` 后，Research planner 追加面向缺失字段的数据源查询方向，例如“厂商财报”“地区销量”“行业报告 PDF”，并重新进入 discovery 或提示用户确认。
9. Data Lab 的 `sources` 页面能展示 Research handoff 带来的数据源资产、provider、priority、format、license、materialize status 和失败原因；物化后进入 dataset/profile/analysis plan。
10. Data Lab 分析向导能基于 `Analysis Opportunity` 与 dataset profile 生成分析问题、变量角色、推荐方法、推荐图表、字段满足度和风险提示。
11. 所有 handoff、dataset、analysis plan、artifact 都保留 lineage，可以追溯到 research run、report、source URL、字段和生成参数。
12. 前端所有新增按钮都有 disabled/loading/success/error 状态；失败时区分评估失败、数据源不足、物化失败、worker 缺失和网络错误。
<!-- 下游：spec deltas 的 Scenarios，tasks.md 的 verification -->

## 验证方式

- 运行 `openspec validate add-research-analytics-handoff --strict --no-interactive` 校验下游 OpenSpec artifacts。
- 运行 `npm run test:research`，覆盖 `analysisOpportunityAgent`、decision thresholds、report-only/light/full/continue-crawl handoff 分支。
- 运行 `npm run test:analytics`，覆盖 handoff dataset metadata、profile/stats/chart 限制、materialized data source lineage。
- 运行 `npm run build`，验证 Research 与 Data Lab 前端类型和构建。
- 用 Playwright 验收：完成 Research run 后看到分析建议卡；“全国避孕套市场”推荐完整分析；“好用的文档编辑工具”不强制完整分析；点击完整分析后 Data Lab wizard 携带 topic/runId/candidate_features；点击仅报告不创建 dataset。
- 若缺少真实 provider key 或 Redis/Postgres，则走受限验收：使用 fixture run/dataset 验证 API、UI 和 worker 分支，并在测试输出中标注受限原因。
<!-- 下游：tasks.md 的验证步骤 -->

## 迁移 / 回滚 / 降级

- 迁移：新增 `analysis_opportunities` / `analysis_handoffs` 或等价存储结构；已有 research runs、reports、datasets 不需要强制回填，首次打开旧 run 时可懒生成 opportunity。
- 回滚：隐藏 `AnalysisDecisionPanel` 和 handoff 按钮，保留现有“导出到 Data Lab”和“生成 Data Lab 数据源清单”路径继续可用。
- 降级：如果 LLM 不可用，使用确定性规则根据 source type、数值字段、时间/地区字段、表格/PDF/API 数量生成低置信度 `Analysis Opportunity`。
- 降级：如果 Data Lab worker 不可用，`light_analysis` / `full_analysis` 只创建 handoff 和 source registry，不自动执行 worker，并在 UI 显示修复提示。
- 风险：错误推荐完整分析会浪费抓取和计算资源，因此必须保存评分依据并允许用户选择“仅报告”或“继续补抓数据”。
<!-- 下游：proposal.md 的 risks，spec deltas 的 REMOVED/MODIFIED -->

## 参考

- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:71`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:98`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:115`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:140`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:249`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:628`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:681`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:730`
- `docs/data-lab-topic-driven-analytics-upgrade-plan-2026-06-22.md:769`
- `src/components/ResearchPanel.tsx:75`
- `src/components/ResearchPanel.tsx:887`
- `src/components/ResearchPanel.tsx:1101`
- `src/components/DataLab.tsx:381`
- `src/components/DataLab.tsx:522`
- `src/components/DataLab.tsx:1205`
- `src/server/research/analysis.ts:44`
- `src/server/analytics/routes.ts:172`
- `src/server/analytics/routes.ts:192`
- `src/server/analytics/routes.ts:265`
- `src/server/analytics/types.ts:33`
- `src/server/analytics/types.ts:87`
- `src/server/analytics/engine.ts:10`
- `src/server/analytics/engine.ts:96`
- `workers-analytics/politistream_analytics/advanced.py:17`
- `openspec/changes/upgrade-research-crawler-platform/specs/web-discovery/spec.md:3`
- `openspec/changes/upgrade-research-crawler-platform/specs/crawl-pipeline/spec.md:3`
- `openspec/changes/upgrade-research-crawler-platform/specs/research-analysis/spec.md:3`
- `openspec/changes/upgrade-research-crawler-platform/specs/research-reporting/spec.md:3`
