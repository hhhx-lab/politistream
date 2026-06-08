# PolitiStream 数据处理、统计分析与可视化能力升级方案

更新时间：2026-06-07

## 1. 结论先行

PolitiStream 后续不能只做“强力爬取”。真正有价值的研究系统应当是：

```text
强力抓取
  -> 数据清洗 / 新闻整理 / 去重 / 分类 / 筛选
  -> 统计分析 / 建模 / 机器学习 / 深度学习
  -> 图表 / 工程图 / 论文图 / 交互式可视化
  -> 可复现报告 / 可导出资产 / 证据链
```

目标能力应高于传统 SPSS/PSPP/JASP/jamovi 这类 GUI 统计软件：既保留“点选式统计分析”的易用性，又有 Python/R/SQL 的可编程能力、PyTorch 的建模能力、Quarto/Jupyter 的可复现报告能力，以及 Matplotlib/Plotly/ECharts/Vega-Lite 的专业制图能力。

推荐技术路线：

1. 继续保留现有 React + Express + Postgres + Redis/BullMQ 架构。
2. 新增独立 Python analytics worker lane，不污染 Node 后端。
3. 以 DuckDB/Polars/Pandas 作为本地分析引擎，处理 CSV/JSON/Parquet/Excel/数据库快照。
4. 以 SciPy/statsmodels/scikit-learn/PyTorch 覆盖统计分析、传统机器学习和深度学习。
5. 以 Great Expectations/Pandera/YData Profiling/Evidently 做数据质量、数据漂移和自动 EDA。
6. 以 Matplotlib/Seaborn/Plotly/Altair/Vega-Lite/ECharts/Graphviz/Mermaid 做论文图、仪表盘图、关系图和工程图。
7. 以 Quarto/Jupyter 生成可复现研究报告，导出 HTML/PDF/DOCX/PPTX。
8. 以本地 Codex skills 补充文档、表格、幻灯片、AI 图像和视觉设计能力。

## 2. 能力目标

### 2.1 新闻内容处理能力

新闻原文不是直接丢给 AI 总结就完事，需要有系统化整理能力：

| 能力 | 说明 | 典型输出 |
|---|---|---|
| 去重与聚类 | 同一新闻多站转载、标题变体、摘要相似内容合并 | story cluster、canonical story |
| 来源分类 | 官方、主流媒体、行业媒体、博客、社交、论坛、数据源 | source type、source tier |
| 主题分类 | 政策、市场、科技、产业、公司、地缘、安全、体育等 | topic labels |
| 实体抽取 | 人物、机构、公司、地点、产品、法案、比赛、指标 | entity graph |
| 时间线整理 | 同一事件按发布时间、更新时间和引用关系排序 | event timeline |
| 相关性筛选 | 与用户课题的相关度、证据价值、原始来源概率 | relevance score |
| 情绪和立场 | 情绪倾向、支持/反对、风险信号 | sentiment / stance |
| 证据抽取 | claim、quote、paraphrase、supports/contradicts | evidence table |
| 冲突检测 | 不同来源对同一事实给出冲突说法 | conflict report |
| 摘要生成 | 默认简体中文，但保留原文语言内容 | Chinese summary |

新闻处理建议用两层模型：

- 规则和统计层：去重、时间排序、实体规范化、来源评分、关键词筛选。
- AI/NLP 层：主题归纳、claim 抽取、立场判断、摘要和报告生成。

### 2.2 结构化数据处理能力

爬到的数据源不能只保存文件，要变成可分析对象：

| 能力 | 说明 | 典型输出 |
|---|---|---|
| Schema 推断 | 字段名、类型、单位、主键候选、时间字段 | dataset schema |
| 数据剖析 | 行数、列数、缺失率、唯一值、分布、异常值 | profiling report |
| 清洗转换 | 类型转换、日期解析、单位换算、列名标准化 | clean table |
| 缺失值处理 | 删除、填补、标记、分组填补 | imputation note |
| 异常值检测 | IQR、z-score、MAD、IsolationForest | outlier report |
| 合并关联 | join、entity matching、fuzzy matching、时间窗口 join | joined dataset |
| 聚合透视 | groupby、pivot、rollup、moving average | aggregate table |
| 时间序列 | 趋势、季节性、同比/环比、滚动窗口、预测 | time series result |
| 地理空间 | GeoJSON、坐标、行政区映射、热力图 | map layer |
| 数据版本 | 原始快照、清洗版本、转换 lineage | dataset snapshot |

### 2.3 SPSS Pro 以上的统计分析能力

SPSS 类工具强在 GUI 和常见统计流程，但 PolitiStream 应进一步覆盖自动化、可复现、多语言和 AI 辅助解释。

| 分析类别 | 需要支持的能力 | 推荐技术 |
|---|---|---|
| 描述统计 | 均值、中位数、方差、分位数、频数、交叉表 | Pandas/Polars/DuckDB |
| 假设检验 | t 检验、卡方、ANOVA、非参数检验 | SciPy/statsmodels |
| 回归分析 | 线性、逻辑、泊松、稳健回归、多层模型 | statsmodels/scikit-learn |
| 相关和降维 | Pearson/Spearman、PCA、因子分析 | SciPy/sklearn/factor_analyzer |
| 聚类 | KMeans、层次聚类、DBSCAN、文本聚类 | scikit-learn/HDBSCAN |
| 分类 | 朴素贝叶斯、SVM、随机森林、XGBoost/LightGBM | scikit-learn/boosting |
| 时间序列 | ARIMA、指数平滑、Prophet 类预测、异常检测 | statsmodels/sktime |
| 文本分析 | TF-IDF、embedding、topic modeling、情感/立场 | sklearn/transformers/LLM |
| 网络分析 | 来源引用网络、实体关系图、传播路径 | NetworkX/igraph |
| 深度学习 | 文本分类、图像/表格模型、embedding fine-tune | PyTorch |
| 可解释性 | 特征重要性、SHAP、误差分析 | SHAP/sklearn |

## 3. 调研结果与技术选型

### 3.1 Python 数据处理核心栈

| 技术 | 作用 | 适合 PolitiStream 的位置 |
|---|---|---|
| NumPy | 数值计算底座 | 矩阵、数组、基础数学 |
| Pandas | 单机 DataFrame 分析 | 常规数据清洗、统计、导出 |
| Polars | 高性能 DataFrame | 大表、懒执行、Parquet/Arrow |
| DuckDB | 嵌入式 OLAP SQL | 对 CSV/Parquet/JSON 直接 SQL 查询 |
| PyArrow | Arrow/Parquet 数据交换 | Python/R/JS/数据库之间传递数据 |
| SciPy | 科学计算、统计函数 | 假设检验、分布、优化 |
| statsmodels | 统计模型 | 回归、ANOVA、时间序列 |
| scikit-learn | 传统机器学习 | 分类、聚类、降维、模型选择 |
| PyTorch | 深度学习 | 文本/图像/表格模型、embedding pipeline |

工程建议：

- 第一版用 DuckDB + Pandas/Polars 覆盖 80% 表格分析。
- 统计建模用 SciPy + statsmodels，机器学习用 scikit-learn，深度学习和 embedding 用 PyTorch。
- Python 环境用 `uv` 或 conda 独立管理，避免混用系统 Python/Homebrew Python。

### 3.2 SPSS/JASP/jamovi/PSPP 相关调研

| 工具 | 特点 | PolitiStream 借鉴点 |
|---|---|---|
| SPSS | 经典 GUI 统计软件，适合社会科学和问卷统计 | 要做低门槛分析向导 |
| PSPP | 开源 SPSS 替代，支持常见统计和 SPSS 文件格式 | 可作为 `.sav` 兼容参考 |
| jamovi | 开源统计 GUI，基于 R，强调易用和可输出 R 代码 | 借鉴“点选分析 + 可复现代码” |
| JASP | 开源统计 GUI，支持经典和 Bayesian 分析 | 借鉴“结果表 + 图 + 解释”模式 |
| R / tidyverse | 统计生态强，论文和学术常用 | 未来可选 R worker lane |

PolitiStream 不建议直接嵌入这些桌面 GUI，而是学习它们的交互方式：

```text
选择数据集
  -> 选择变量
  -> 选择分析类型
  -> 自动运行 Python/R
  -> 输出统计表、图、解释、代码和可复现报告
```

### 3.3 数据质量与自动 EDA

| 技术 | 作用 | 推荐用法 |
|---|---|---|
| Great Expectations | 数据质量校验、Expectation Suite、验证报告 | 对抓取数据做质量门 |
| Pandera | DataFrame schema 和统计验证 | 对清洗后的表做类型/范围校验 |
| YData Profiling | 自动 EDA、数据概览、缺失和相关性 | 数据源入库后生成 profile |
| Evidently | 数据漂移、模型输入分布变化 | 监控长期数据源和模型效果 |

建议每个 dataset asset 入库后生成：

- `schema_profile`
- `quality_report`
- `missingness_report`
- `outlier_report`
- `validation_result`
- `lineage`

### 3.4 可视化与制图技术

| 场景 | 推荐技术 | 输出 |
|---|---|---|
| 论文静态图 | Matplotlib、Seaborn | PNG/SVG/PDF |
| 统计关系图 | Seaborn、Altair | regression、distribution、facet |
| 交互式图表 | Plotly、Altair/Vega-Lite | HTML/JSON |
| 前端仪表盘 | ECharts、Vega-Lite、Observable Plot | React 组件 |
| 大规模点/轨迹 | Datashader、HoloViews | rasterized large data plot |
| 地图 | GeoPandas、Folium、kepler.gl、ECharts map | choropleth、point map、flow map |
| 关系网络 | NetworkX、igraph、Graphviz、Cytoscape.js | entity/source/evidence graph |
| 流程和架构图 | Mermaid、Graphviz、diagrams.py | SVG/PNG/PDF |
| 工程图 | Matplotlib、Plotly 3D、PyVista、CADQuery、Schemdraw | 2D/3D engineering figure |
| 商业信息图 | Canva、Figma、AI imagegen、canvas-design skill | infographic |

建议建立统一 `VisualizationSpec`：

```json
{
  "kind": "chart | map | network | diagram | engineering | infographic",
  "engine": "matplotlib | seaborn | plotly | altair | echarts | mermaid | graphviz",
  "data_asset_id": "dataset_assets.id",
  "encoding": {},
  "style": {
    "theme": "paper | dashboard | presentation",
    "language": "zh-CN",
    "export_formats": ["png", "svg", "pdf", "html"]
  }
}
```

### 3.5 可复现报告和论文级输出

| 技术 | 作用 |
|---|---|
| Jupyter | 交互式分析和 notebook 执行 |
| Quarto | Markdown + Python/R/Julia/Observable，可导出 HTML/PDF/DOCX |
| nbconvert | notebook 转 HTML/PDF |
| Pandoc | Markdown/DOCX/PDF 转换 |
| LibreOffice | DOCX -> PDF 自动化 |
| PPTXGenJS / python-pptx | 自动生成 slide deck |

项目已有文档工具链，正式中文文档应继续走：

```text
Markdown 源稿
  -> DOCX 可编辑稿
  -> PDF 交付稿
```

如果报告内含 Mermaid、公式、论文图，应确保：

- Mermaid 先渲染为 PNG/SVG，再进入 DOCX/PDF。
- 数学公式用 Pandoc 转 Office Math，最终 DOCX/PDF 不残留 LaTeX 源码。
- 论文图优先导出 SVG/PDF，前端展示可用 PNG/HTML。

### 3.6 AI 辅助分析与制图

AI 可以增强分析体验，但不能替代统计和图表代码的可复现性。建议 AI 只做以下工作：

| AI 角色 | 可以做 | 不应该做 |
|---|---|---|
| Analysis planner | 根据研究问题生成分析计划、变量选择、统计方法建议 | 直接伪造结论 |
| Code generator | 生成 Pandas/Polars/SQL/Matplotlib/Plotly 代码 | 运行前不检查字段和数据 |
| Chart critic | 检查图表标题、坐标轴、单位、颜色、是否误导 | 随意改变数据 |
| Report writer | 根据已验证结果生成中文解释 | 无证据推断 |
| Infographic designer | 用 AI 图像/Canva 做封面、示意图、配图 | 把 AI 图当作事实数据图 |

AI 生成图像适合：

- 报告封面。
- 概念示意图。
- 研究主题视觉素材。
- 非数据驱动的信息图背景。

AI 不适合：

- 事实图表。
- 统计图。
- 地图边界。
- 工程尺寸图。
- 论文中需要可复核数据的图。

## 4. 建议架构

### 4.1 新增 Python analytics worker lane

```text
React UI
  -> Express API
     -> Postgres metadata
     -> Redis/BullMQ queues
     -> research workers
     -> analytics workers
          -> DuckDB / Pandas / Polars
          -> SciPy / statsmodels / scikit-learn / PyTorch
          -> Matplotlib / Plotly / Altair / Graphviz
          -> Quarto / Jupyter renderer
```

目录建议：

```text
workers-analytics/
  pyproject.toml
  README.md
  politistream_analytics/
    worker.py
    config.py
    io/
      assets.py
      duckdb_store.py
      postgres.py
    cleaning/
      normalize_columns.py
      missing_values.py
      outliers.py
      entity_matching.py
    profiling/
      schema_profile.py
      quality_report.py
      ydata_profile.py
    statistics/
      descriptives.py
      hypothesis_tests.py
      regression.py
      anova.py
      time_series.py
    ml/
      classification.py
      clustering.py
      topic_modeling.py
      pytorch_models.py
    news/
      dedupe.py
      topic_classifier.py
      story_clustering.py
      timeline.py
    visualization/
      chart_router.py
      matplotlib_renderer.py
      seaborn_renderer.py
      plotly_renderer.py
      altair_renderer.py
      graphviz_renderer.py
      mermaid_renderer.py
      echarts_spec.py
    reports/
      quarto_renderer.py
      notebook_runner.py
      export_bundle.py
```

Node/TS 侧新增：

```text
src/server/research/analytics/
  analyticsJobs.ts
  analyticsQueue.ts
  analyticsResults.ts
  visualizationSpecs.ts
  reportArtifacts.ts
```

### 4.2 新增数据表

```text
analysis_jobs
analysis_runs
analysis_artifacts
dataset_profiles
dataset_quality_reports
statistical_results
model_results
visualization_specs
visualization_artifacts
report_artifacts
news_clusters
news_topics
entity_graph_snapshots
```

### 4.3 API 建议

```text
POST /api/analytics/jobs
GET  /api/analytics/jobs
GET  /api/analytics/jobs/:id
POST /api/analytics/jobs/:id/run

POST /api/datasets/:id/profile
GET  /api/datasets/:id/profile
POST /api/datasets/:id/clean
POST /api/datasets/:id/analyze
POST /api/datasets/:id/visualize

GET  /api/visualizations/:id
GET  /api/visualizations/:id/export?format=png|svg|pdf|html

POST /api/reports/research/:runId/render
GET  /api/reports/:id
```

## 5. 前端体验设计

### 5.1 Data Lab

新增一个 `Data Lab` 页面：

- 左侧：数据集、新闻集合、research run、已生成分析。
- 中间：数据预览、schema、profile、分析结果、图表。
- 右侧：分析向导、变量选择、图表设置、导出面板。

### 5.2 SPSS 风格分析向导

```text
选择数据
  -> 选择字段
  -> 选择分析类型
  -> 参数设置
  -> 运行
  -> 输出表格 / 图 / 解释 / 可复现代码
```

分析向导应包含：

- 描述统计。
- 交叉表。
- 相关分析。
- t 检验。
- ANOVA。
- 回归。
- 聚类。
- 分类。
- 时间序列。
- 文本分类和主题聚类。

### 5.3 可视化工作台

图表类型：

- bar、line、scatter、area、histogram、box、violin、heatmap。
- correlation matrix、regression plot、facet grid。
- time series、event timeline、calendar heatmap。
- map、choropleth、flow map。
- network graph、Sankey、tree、treemap。
- engineering line drawing、3D surface、parameter plot。
- Mermaid/Graphviz 关系图。

每张图应支持：

- 复制图片。
- 导出 PNG/SVG/PDF/HTML。
- 保存到报告。
- 查看生成代码。
- 查看数据来源和过滤条件。

## 6. 工作流设计

### 6.1 新闻集合分析

```text
Research run / RSS archive
  -> 选择新闻集合
  -> 去重聚类
  -> 主题分类
  -> 实体图谱
  -> 时间线
  -> 来源质量统计
  -> 情绪/立场分布
  -> 输出中文分析报告 + 图表
```

示例输出：

- “过去 7 天某主题主流来源报道趋势图”
- “官方源 vs 媒体源观点差异”
- “同一事件不同来源的时间线”
- “引用网络和原始来源定位”

### 6.2 数据集分析

```text
Dataset asset
  -> schema profile
  -> data quality validation
  -> cleaning recipe
  -> exploratory analysis
  -> statistical analysis / ML
  -> visualization
  -> report artifact
```

示例输出：

- 数据质量报告。
- 变量分布图。
- 相关矩阵。
- 回归结果表。
- 分类模型评估。
- 论文级图表。

### 6.3 AI 辅助制图

```text
用户描述：帮我画一个论文里能用的图，说明不同来源对同一事件的报道时间线
  -> AI 生成 chart plan
  -> 系统检查可用字段
  -> 生成可执行代码
  -> 渲染图表
  -> 自动检查标题、坐标轴、单位、图例、数据来源
  -> 导出 SVG/PDF
```

## 7. 本地 Codex Skills 互补

| Skill / 工具 | 用法 |
|---|---|
| `web-reader-router` | 判断网页/数据源访问边界、抽取完整性、授权替代路径 |
| `xlsx` / `spreadsheets` | 读取、清洗、生成 Excel/CSV 工作簿 |
| `doc` / `docx` / `documents` | 生成 Word 报告、检查 DOCX |
| `pdf` | 抽取 PDF、检查 PDF、导出 PDF |
| `pptx` / `presentations` | 生成研究汇报 PPT |
| `canvas-design` / `theme-factory` | 设计信息图、报告封面和视觉主题 |
| `imagegen` | 生成非事实型配图、封面、概念图 |
| `frontend-design` | 构建 Data Lab 和可视化工作台前端 |

注意：AI 画图和设计类 skill 只能用于视觉表达，不能替代由真实数据渲染出的统计图。

## 8. 环境与依赖建议

由于项目已有 Node/TypeScript 主体，Python 分析层必须独立环境：

```text
workers-analytics/
  pyproject.toml
  uv.lock
```

建议第一批 Python 依赖：

```text
numpy
pandas
polars
duckdb
pyarrow
scipy
statsmodels
scikit-learn
torch
matplotlib
seaborn
plotly
altair
networkx
graphviz
great-expectations
pandera
ydata-profiling
evidently
jupyter
quarto-cli 或系统 Quarto
openpyxl
python-pptx
```

可选增强：

```text
geopandas
folium
datashader
holoviews
shap
xgboost
lightgbm
hdbscan
umap-learn
sentence-transformers
transformers
torchvision
```

本机原则：

- 不使用 `sudo pip`。
- 不混用系统 Python/Homebrew Python 和项目 Python。
- 优先 `uv` 或 conda。
- 所有 key、模型名、导出目录、worker 并发都放 `.env`。

## 9. 分阶段实施计划

### Phase 1：基础分析与制图

目标：让爬取到的表格和新闻能被分析、分类、制图。

任务：

1. 新增 `workers-analytics/` Python 环境。
2. 新增 dataset profile：schema、缺失值、唯一值、分布、样本预览。
3. 新增新闻去重、主题分类、来源统计、时间线。
4. 新增基础统计：描述统计、交叉表、相关矩阵。
5. 新增 Matplotlib/Seaborn/Plotly 图表渲染。
6. 新增图表导出 PNG/SVG/HTML。
7. 前端新增 Data Lab 基础页面。

### Phase 2：SPSS 风格分析工作台

目标：让用户不用写代码也能做统计。

任务：

1. 分析向导：变量选择、分析类型、参数配置。
2. 支持 t 检验、ANOVA、卡方、相关、回归。
3. 输出统计表、解释文本、可复现 Python 代码。
4. 加入 Great Expectations/Pandera 数据质量门。
5. 支持 Quarto/Jupyter 报告导出。

### Phase 3：机器学习和高级可视化

目标：让系统具备分类、聚类、预测和复杂图谱能力。

任务：

1. scikit-learn 分类/聚类/降维。
2. PyTorch 文本分类和 embedding pipeline。
3. SHAP/特征重要性。
4. NetworkX/Graphviz/Cytoscape evidence graph。
5. 地图、Sankey、热力图、交互式 dashboard。
6. 大数据可视化接 Datashader/HoloViews。

### Phase 4：论文和工程制图

目标：输出可以直接进论文、报告、PPT 的图。

任务：

1. 建立论文图主题模板：字体、字号、线宽、配色、图注。
2. Matplotlib/Seaborn 静态图导出 SVG/PDF。
3. Mermaid/Graphviz 工程图和架构图导出。
4. PyVista/Plotly 3D 工程图可选接入。
5. Canva/Figma/AI imagegen 生成封面和信息图。
6. 报告打包：Markdown/DOCX/PDF/PPTX。

## 10. 验收标准

1. 用户上传或爬取一个 CSV/Excel/JSON 数据源后，系统能生成 schema profile 和质量报告。
2. 用户选择一个新闻集合后，系统能输出去重后的 story clusters、主题分布、来源分布和时间线。
3. 用户能在 Data Lab 中通过 GUI 完成描述统计、相关分析和回归分析。
4. 系统能自动生成至少 10 类常见图表，并支持 PNG/SVG/HTML 导出。
5. 系统能生成论文级 Matplotlib/Seaborn 图，包含标题、坐标轴、单位、图例、来源说明。
6. 系统能生成交互式 Plotly/ECharts/Vega-Lite 图，并在前端展示。
7. 系统能导出包含数据、统计表、图和中文解释的 Quarto/Jupyter 报告。
8. 所有 AI 生成的分析结论都能追溯到数据资产、字段、过滤条件和代码。

## 11. 风险与边界

- AI 不能替代统计检验，必须保留代码、数据版本和运行结果。
- 数据图不能用 AI 图片伪造，事实图必须由真实数据渲染。
- 自动统计解释要标注方法、样本量、变量、假设和局限。
- 对敏感数据要做脱敏和最小化处理。
- Python worker 不能阻塞 Node API；重计算必须走队列。
- 大数据不要全量塞进前端，前端只拿聚合结果、抽样结果或 tile/raster。

## 12. 参考来源

- Quarto Python docs: https://quarto.org/docs/computations/python.html
- Jupyter: https://jupyter.org/
- NumPy: https://numpy.org/
- Pandas: https://pandas.pydata.org/
- Polars: https://pola.rs/
- DuckDB: https://duckdb.org/
- SciPy stats: https://docs.scipy.org/doc/scipy/reference/stats.html
- statsmodels: https://www.statsmodels.org/
- scikit-learn: https://scikit-learn.org/
- PyTorch: https://pytorch.org/
- Matplotlib: https://matplotlib.org/
- Seaborn: https://seaborn.pydata.org/
- Plotly Python: https://plotly.com/python/
- Vega-Lite: https://vega.github.io/vega-lite/docs/
- Vega-Altair: https://altair-viz.github.io/
- Apache ECharts: https://echarts.apache.org/
- Observable Plot: https://observablehq.com/plot/
- HoloViews large data / Datashader: https://holoviews.org/user_guide/Large_Data.html
- Graphviz: https://graphviz.org/documentation/
- Mermaid: https://mermaid.js.org/
- Great Expectations: https://docs.greatexpectations.io/
- Pandera: https://pandera.readthedocs.io/
- YData Profiling: https://docs.profiling.ydata.ai/
- Evidently: https://docs.evidentlyai.com/
- jamovi: https://www.jamovi.org/
- JASP: https://jasp-stats.org/
- PSPP: https://www.gnu.org/software/pspp/
