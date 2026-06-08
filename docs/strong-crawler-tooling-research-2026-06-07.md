# PolitiStream 强力爬虫技术调研与 web-reader-router 互补方案

更新时间：2026-06-07

## 1. 结论先行

你说的“特别强力黑客用的爬虫能力”，工程上真正有价值的部分不是绕过登录、付费墙、验证码或反爬，而是：

1. 更强 discovery：搜索、RSS、sitemap、Common Crawl、Wayback、GDELT、GitHub、npm/PyPI、CKAN/Socrata/ArcGIS/Data.gov、官方 API、公开数据集一起做候选发现。
2. 更强 frontier：URL 优先级、域名预算、深度预算、来源多样性、失败重试、历史复用。
3. 更强 fetch：HTTP、Playwright/Puppeteer 浏览器池、远程浏览器服务、robots、限速、缓存、错误归类。
4. 更强 extractor：HTML 正文、新闻正文、PDF、表格、文档、多媒体元数据、CSV/JSONL/Parquet/GeoJSON/SDMX/XBRL、结构化 JSON、LLM-ready Markdown。
5. 更强 evidence + data quality：来源可信度、claim/evidence relation、冲突证据、时间线、原始出处、数据字典、schema、缺失值、单位、口径和版本。
6. 更强 observability：provider health、frontier view、失败原因、成本、覆盖率、benchmark。

合规边界：强力 = 更完整地读取公开或用户授权内容；强力不等于绕过认证、付费、验证码、访问控制、封禁、robots 或网站条款。这个边界也和本地 `web-reader-router` skill 的合规参考一致。

## 2. 和 web-reader-router Skill 的互补方式

已读取本地 skill：

- `/Users/hwaigc/.codex/skills/web-reader-router/SKILL.md`
- `references/ROUTER.md`
- `references/05_NEWS_AND_RESEARCH_CRAWLER_SKILL.md`
- `references/08_SITE_TO_KNOWLEDGEBASE_CRAWL_SKILL.md`
- `references/11_COMPLIANCE_BOUNDARIES_STRONG_CRAWLER_SKILL.md`

这个 skill 对 PolitiStream 最有价值的是“路由器”思想：先判断页面类型、访问边界和抽取难度，再选择最小必要读取方式。建议把它抽象成 Research pipeline 的 `access_diagnosis` 阶段。

推荐新增一层：

```text
URL candidate
  -> access diagnosis
     -> public_static_html
     -> public_js_render_required
     -> public_pdf_or_file
     -> public_dataset_file
     -> public_data_catalog_entry
     -> public_structured_api
     -> sitemap_or_index
     -> requires_api_key_or_terms_acceptance
     -> license_restricted_dataset
     -> login_or_auth_wall
     -> paywall_or_registration_wall
     -> captcha_or_human_verification
     -> bot_or_cloudflare_challenge
     -> network_or_tls_failure
  -> compliant action router
```

对应动作：

| 诊断结果 | PolitiStream 动作 |
|---|---|
| `public_static_html` | HTTP fetch + Readability/trafilatura |
| `public_js_render_required` | Playwright/Crawlee/Crawl4AI/browser pool |
| `public_pdf_or_file` | pdf-parse + Unstructured |
| `public_dataset_file` | data asset fetch + schema inference + quality profile |
| `public_data_catalog_entry` | CKAN/Socrata/ArcGIS/Data.gov catalog adapter + resource expansion |
| `public_structured_api` | 官方 API provider + pagination/rate limit + typed normalization |
| `sitemap_or_index` | sitemap parser + frontier expansion |
| `requires_api_key_or_terms_acceptance` | 不绕过；提示配置合法 API key、接受平台条款或上传授权数据 |
| `license_restricted_dataset` | 不直接下载受限内容；记录 license，要求用户确认授权或换公开替代源 |
| `login_or_auth_wall` | 不绕过；提示用户使用官方 API/导出/上传授权内容 |
| `paywall_or_registration_wall` | 不绕过；只处理合法提供的内容或公开替代来源 |
| `captcha_or_human_verification` | 不破解；人工验证后导出授权内容 |
| `bot_or_cloudflare_challenge` | 不做规避策略；降级到官方 API、RSS、sitemap、GDELT、Common Crawl、Wayback |
| `network_or_tls_failure` | 记录失败、有限重试、备用公开来源 |

## 3. 我已知的强力爬虫技术地图

### 3.1 核心 crawler framework

| 技术 | 强项 | 适合 PolitiStream 吗 |
|---|---|---|
| Crawlee | Node/TypeScript 生态，队列、浏览器、HTTP、存储一体，适合当前项目技术栈 | 强烈推荐优先接入 |
| Scrapy | Python 成熟爬虫框架，spider、pipeline、middleware、deployment 生态成熟 | 适合作为 Python worker lane |
| Apache Nutch | Hadoop/Solr/Tika 生态，适合大规模批量全网/站群抓取 | 适合未来超大规模，不适合当前第一优先级 |
| Apache StormCrawler | 低延迟、流式、分布式 crawler，基于 Apache Storm | 适合持续监控大量 URL 流 |
| Heritrix | Internet Archive 的归档级 crawler | 适合归档型抓取和 WARC 保存 |

### 3.2 JS 渲染与浏览器自动化

| 技术 | 强项 | 注意 |
|---|---|---|
| Playwright | Chromium/Firefox/WebKit 自动化，适合 JS 页面、截图、交互前置动作 | 用于公开或授权页面，不用于绕过验证 |
| Puppeteer | Chrome/Chromium 生态成熟，项目已有依赖 | 可继续保留 |
| Browserless | 托管/自托管远程浏览器池，适合减少本地机器压力 | 适合作为可选 browser provider |
| scrapy-playwright | Scrapy 中接 Playwright，保留 Scrapy 调度能力 | 适合 Python spider 需要 JS 渲染时 |

### 3.3 LLM-ready 抽取与 RAG crawler

| 技术 | 强项 | 适合 |
|---|---|---|
| Crawl4AI | LLM-ready Markdown、deep crawl、browser pool、chunking、结构化抽取 | 强烈推荐作为可选 extractor/provider |
| Firecrawl | Search/Scrape/Crawl/Map/Batch，直接产出 Markdown/JSON/截图，适合 AI agent | 适合 hosted fallback 或 MCP/provider |
| trafilatura | Python 文本与 metadata 抽取，新闻/网页正文效果好 | 适合 HTML/news extractor fallback |
| Unstructured | PDF、HTML、DOCX、PPTX、XLSX、CSV、图片等文档切分 | 强烈推荐补强 PDF/表格/文档 |
| newspaper4k | 新闻正文、标题、作者、metadata 抽取 | 适合新闻 extractor fallback |

### 3.4 新闻、历史与公开数据 provider

| 数据源 | 强项 | 用法 |
|---|---|---|
| GDELT DOC 2.0 | 跨语言全球新闻搜索，适合新闻溯源、舆情、时间线 | 增加 `gdelt` discovery provider |
| NewsAPI | 新闻文章搜索、来源、语言、时间过滤 | 增加 `newsapi` discovery provider |
| Common Crawl | 公开 web-scale WARC/WET/WAT 数据，适合历史网页和大规模公开语料 | 增加 archive provider，不直接实时抓 |
| Wayback CDX | 查询 URL 历史快照，适合新闻溯源、页面消失、改版前后比较 | 增加 `wayback` provider |
| GitHub/npm/PyPI 官方 API | 平台数据、开源项目、包元数据 | 已有方向，应继续增强 |

### 3.5 学术、金融、政府和平台数据源

这些不是传统意义上的“爬虫框架”，但对深度调研更有价值：它们直接提供高质量结构化数据，可以减少网页噪声和反复抓取。

| 数据源 / API | 强项 | 推荐用途 |
|---|---|---|
| OpenAlex | 开放学术知识图谱，覆盖论文、作者、机构、主题、来源 | 调研技术、论文、工具评测时补充学术证据 |
| Crossref REST API | DOI、期刊、出版物 metadata、引用和许可信息 | 查证论文、白皮书、报告出处 |
| Data.gov / CKAN API | 数据目录、dataset metadata、resource 文件列表 | 政府和机构开放数据发现 |
| Socrata SODA API | 城市/政府开放数据表，支持查询和分页 | 城市治理、公共安全、交通、财政数据 |
| ArcGIS Hub / REST API | 地理空间数据、地图 layer、GeoJSON/FeatureServer | 地图、环境、城市、灾害和空间分析 |
| World Bank API | 国家/地区指标和时间序列 | 宏观、发展、人口、经济指标 |
| FRED API | 美国经济和金融时间序列 | 宏观经济、利率、就业、通胀 |
| IMF / OECD / Eurostat API | 国际组织统计，常见 SDMX 结构 | 跨国对比和政策研究 |
| SEC EDGAR API | 美国上市公司公告、10-K/10-Q、XBRL 财报数据 | 公司、产业、监管和财务事实核验 |
| Kaggle API | 比赛数据、公开数据集、notebook、metadata | 数据竞赛、benchmark、baseline 研究 |
| OpenML / UCI ML Repository | 机器学习数据集、任务、评测结果 | ML benchmark 和比赛数据补充 |
| GitHub REST / GraphQL API | repo、stars、release、license、issue 活跃度 | 调研开源项目真实活跃度和维护状态 |
| npm / PyPI registry API | 包版本、依赖、license、发布时间 | 调研开发者工具、库生态和供应链风险 |
| Hugging Face Hub API | 模型、数据集、下载量、license、cards | 调研 AI 模型、数据集和开源趋势 |
| Wikidata / Wikipedia API | 实体 ID、别名、关系、时间线、引用 | 实体消歧、背景知识、交叉验证 |

工程建议：把这些接成 `structuredDiscoveryProvider`，输出同一个 `DiscoveredCandidate`，但给 `source_type=structured_api`，并在可信度评分里高于普通网页转载。

### 3.6 数据源抓取能力层

新闻抓取只能回答“谁说了什么、什么时候说、原始出处在哪里”。如果要服务比赛、竞赛、商业调研、量化分析、政策研究、产品选型和事实核验，还需要把“数据源抓取”作为和新闻并列的一等能力。

#### 3.6.1 数据源类别地图

| 类别 | 代表来源 | 适合抓什么 | 接入方式 |
|---|---|---|---|
| 开放数据目录 | Data.gov、CKAN 实例、Socrata portals、ArcGIS Hub | 政府数据、城市数据、公共服务、地理空间、CSV/JSON/GeoJSON | catalog search -> resource list -> asset ingest |
| 机器学习/比赛数据 | Kaggle、Hugging Face Datasets、OpenML、UCI ML Repository | 竞赛数据、训练集、benchmark、baseline、数据字典 | 官方 API/CLI、dataset card、文件清单 |
| 官方统计和经济数据 | World Bank、IMF、OECD、FRED、Eurostat、UN Data | 指标、国家/地区、时间序列、宏观经济、人口、贸易 | structured API + pagination + unit metadata |
| 公司/金融/监管数据 | SEC EDGAR、Companies House、OpenCorporates、交易所公告 | 财报、公告、注册信息、监管披露、XBRL | 官方 API、RSS、文件下载、XBRL parser |
| 科研和引用数据 | OpenAlex、Crossref、Semantic Scholar、arXiv | 论文、作者、机构、引用、主题趋势 | API provider + DOI/entity normalization |
| 平台生态数据 | GitHub、npm、PyPI、Docker Hub、Crates.io、Maven Central | repo、包、版本、license、下载、依赖、活跃度 | 官方 API/registry API |
| 体育/赛事数据 | OpenF1、football-data.org、balldontlie、StatsBomb Open Data、OpenLigaDB | 比赛、球队、球员、赛程、结果、事件流、排行榜 | API provider + time/window sync |
| 地理/天气/环境数据 | NOAA、NASA、USGS、Open-Meteo、Copernicus、OpenAQ | 天气、灾害、遥感、空气质量、地震、水文 | API + GeoJSON/NetCDF/CSV ingest |
| 电商/产品/市场数据 | 官方 price feed、公开商城页、应用商店、Product Hunt | 价格、评分、版本、评论摘要、产品发布 | 优先官方 API/RSS；网页仅抓公开允许内容 |

#### 3.6.2 数据源 pipeline

```text
Research topic
  -> data need decomposition
     -> variables / metrics / entities / geography / time range / freshness
  -> dataset discovery
     -> catalog API / search provider / official API / platform registry
  -> dataset candidate scoring
     -> relevance / authority / license / freshness / coverage / file format / schema richness
  -> authorized access check
     -> public / requires API key / license restricted / upload required
  -> asset ingest
     -> CSV / JSON / JSONL / Parquet / Excel / GeoJSON / SDMX / XBRL / NetCDF
  -> schema inference + profiling
     -> fields / types / units / missingness / cardinality / ranges / duplicates
  -> quality validation
     -> data dictionary / source lineage / update cadence / anomaly notes
  -> normalized storage
     -> Postgres metadata + object assets + DuckDB/Arrow preview
  -> evidence graph
     -> dataset supports claim / contradicts claim / provides metric
```

数据抓取的关键不是“把文件下下来”，而是要知道它能不能回答问题：字段是什么、单位是什么、时间范围到哪里、缺失值多不多、许可证能不能用、是否来自官方源、是否有更新版本。

#### 3.6.3 比赛/竞赛数据能力

这里的“比赛”可以包括 Kaggle/数据竞赛，也可以包括体育赛事、排行榜、benchmark 评测。建议把它抽象成 `competitionDataProvider`：

| 场景 | 需要抓取的对象 | 关键字段 |
|---|---|---|
| Kaggle/数据竞赛 | competition overview、data files、rules、evaluation metric、sample submission、notebooks/discussions | metric、files、license、deadline、leaderboard、baseline signal |
| ML benchmark | dataset、paper、leaderboard、model card、evaluation script | task、metric、split、score、model、license |
| 体育赛事 | schedule、teams、players、matches、events、ratings 若有合法来源 | season、match id、team/player id、score、event timestamp |
| 产品/工具榜单 | GitHub stars、npm downloads、release cadence、reviews、benchmarks | popularity、maintenance、license、benchmark source |
| 政策/金融比赛式调研 | 官方统计、监管公告、新闻时间线、市场数据 | time series、source tier、timestamp、revision |

合规策略：

- Kaggle 等平台优先用官方 API/CLI，遵守 competition rules，不抓取需要登录且未授权的数据。
- 体育和平台数据优先使用公开 API 或开源数据集；遇到付费/受限 API 时只记录需求和替代源。
- 比赛数据要保存 `license`、`terms_url`、`downloaded_at`、`version`、`source_url`，避免后续报告引用不清。

#### 3.6.4 数据文件与表格 extractor

| 文件/格式 | 推荐工具 | 输出 |
|---|---|---|
| CSV/TSV | DuckDB、PapaParse、Polars | schema、preview、统计摘要、异常值 |
| JSON/JSONL | jq/Node parser、DuckDB JSON、Polars | path schema、records、嵌套字段 |
| Parquet/Arrow | DuckDB、Apache Arrow | schema、row groups、preview |
| Excel | xlsx/SheetJS、Python openpyxl | sheets、tables、cell ranges、merged cell notes |
| GeoJSON/Shapefile | GDAL/ogr2ogr、geopandas | geometry type、bounds、CRS、feature count |
| SDMX | pandasdmx / official API parser | time series、dimensions、units |
| XBRL | sec-api/xbrl parser、arelle | company facts、period、taxonomy |
| NetCDF/HDF5 | xarray、netCDF4 | dimensions、variables、coordinates |

第一版不需要一次性支持所有格式，但需要在架构上允许 extractor router 根据 `content_type`、URL pattern、catalog metadata 和文件扩展名分发。

### 3.7 数据源质量评分

建议新增 `dataset_quality_score`，和网页 `credibility_score` 并列：

| 维度 | 权重建议 | 说明 |
|---|---:|---|
| 来源权威性 | 25% | 官方/原始源 > 学术/公共机构 > 聚合转载 |
| 主题相关度 | 20% | 字段和指标是否直接回答研究问题 |
| 覆盖完整度 | 15% | 时间、地域、实体范围是否足够 |
| 新鲜度和更新频率 | 10% | 是否近期更新，是否有稳定 cadence |
| Schema 清晰度 | 10% | 字段名、单位、数据字典、类型是否明确 |
| 许可证/可用性 | 10% | 是否允许下载、引用、再分发或研究使用 |
| 数据质量 | 10% | 缺失值、重复、异常、口径冲突 |

报告生成时，AI 不能只说“根据数据”。它必须引用 dataset name、source URL、版本/更新时间、字段名和计算口径。

### 3.8 真正“强力”的底层工程模式

这些能力比“多开几个浏览器”更关键，决定系统能不能长期、稳定、可解释地深挖：

| 模式 | 作用 | PolitiStream 落点 |
|---|---|---|
| Canonical URL + content fingerprint | 去掉 URL 参数噪声、重复转载、镜像页 | `canonicalUrl()` + SimHash/MinHash |
| Priority frontier + budget guard | 按价值抓，不让低质量站点吃光预算 | 已有 frontier score 继续增强 |
| Domain politeness + robots + retry taxonomy | 避免过载目标站点，错误可解释 | `accessDiagnosis` + per-domain rate limit |
| Differential crawling | 只抓变化内容，适合新闻监控和站点追踪 | ETag/Last-Modified/content hash |
| WARC / raw asset archive | 保留原始证据，方便复核和重跑 extractor | `document_assets` 增加 WARC/HTML/PDF 保存 |
| Link context scoring | 不只看 URL，也看它从哪里被发现、锚文本是什么 | `discovered_from` + anchor/context |
| Source diversity cap | 避免同一域名、同一观点淹没报告 | frontier domain quota + report source mix |
| Extraction quality score | 判断正文是否太短、乱码、广告多、缺表格 | `extraction_quality` 字段 |
| Evidence graph first | 先建证据图，再写报告，减少 AI 幻觉 | `claims -> evidence -> sources` |
| Replayable run | 同一 run 的查询、候选、抓取、抽取、分析都可重放 | `run_events` + raw assets + provider logs |
| Dataset lineage | 记录数据集来源、版本、下载时间、转换步骤 | `dataset_lineage` + `dataset_snapshots` |
| Schema drift detection | 监控数据字段变化，避免旧解析器静默出错 | `dataset_schemas` versioning |
| Data quality profile | 每个数据资产生成缺失值、重复、类型、范围报告 | `dataset_quality_reports` |

### 3.9 “黑客级”工具里可以吸收、但要合规化的部分

很多强爬工具会宣传 proxy、fingerprint、CAPTCHA solving、stealth 等能力。PolitiStream 不应实现绕过能力，但可以吸收其中合法的工程价值：

- 浏览器池：用 Browserless 或自托管 Playwright pool 承担 JS 渲染压力。
- 会话隔离：每个 run / domain 使用独立 browser context，避免状态污染。
- 失败归类：把 `captcha_or_human_verification`、`bot_or_cloudflare_challenge` 记录为失败原因，然后切换到公开替代来源。
- 成本控制：对 browser fetch 设置更小预算，只给高优先级 URL 使用。
- 人工授权导入：用户有权限的网页，通过 SingleFile、打印 PDF、HTML 导出或截图上传，再由系统处理。
- 官方 API 优先：平台型内容尽量走 GitHub/npm/PyPI/OpenAlex/SEC/GDELT 等官方或公开 API。

## 4. GitHub / 网络调研结果

### Crawlee

- GitHub：`https://github.com/apify/crawlee`
- 定位：JavaScript/TypeScript 的 web scraping 和 browser automation library。
- 看到的能力：支持 Puppeteer、Playwright、Cheerio、JSDOM、raw HTTP；适合构建可靠 crawler，能下载 HTML/PDF/图片等资源。
- 对 PolitiStream 的价值：与现有 TypeScript/Express/BullMQ 技术栈相性最好，可以逐步替换当前自研 `crawler.ts` 中的 HTTP/browser 调度细节。

建议接入方式：

```text
src/server/research/fetchers/crawleeFetcher.ts
src/server/research/frontier/crawleeQueueAdapter.ts
```

先只把 Crawlee 当作 fetch/extract provider，不要一上来迁移整个 run lifecycle。

### Scrapy + Scrapyd + scrapy-playwright

- Scrapy GitHub：`https://github.com/scrapy/scrapy`
- Scrapy Docs：`https://docs.scrapy.org/`
- Scrapy deploy：`https://www.scrapy.org/deploy`
- scrapy-playwright：`https://github.com/scrapy-plugins/scrapy-playwright`

看到的能力：

- Scrapy 是成熟 Python 爬虫框架，适合 spider、pipeline、middleware 和结构化数据抽取。
- Scrapyd / Scrapy Cloud 支持部署、调度、监控 spider。
- scrapy-playwright 可让 Scrapy workflow 处理需要 JavaScript 的页面。

对 PolitiStream 的价值：

- 如果后续要做大量“某平台固定结构”的专项 spider，Scrapy 比 TypeScript 手写更成熟。
- 建议作为独立 Python worker lane，而不是混进当前 Node server。

建议接入方式：

```text
workers-python/
  scrapy_spiders/
  pyproject.toml
  outputs -> Postgres discovery_results / crawl_documents
```

### Apache Nutch

- 官方：`https://nutch.apache.org/`

看到的能力：

- 官方定位是 highly extensible、highly scalable、production-ready Web crawler。
- 依赖 Hadoop 数据结构，适合大数据量批处理。
- 插件化支持 parsing、HTML filtering、indexing、scoring；可接 Solr/Elasticsearch，解析可用 Apache Tika。

对 PolitiStream 的价值：

- 如果目标是“抓很多站、很多域、长期批量构建公开网页索引”，Nutch 很强。
- 但它是 Java/Hadoop 生态，运维复杂度高，不适合当前立刻接入。

建议：列为 Phase 3 “web-scale archive crawler”，不是当前 MVP。

### Apache StormCrawler

- 官方：`https://stormcrawler.apache.org/`
- GitHub：`https://github.com/apache/stormcrawler`

看到的能力：

- 基于 Apache Storm 的分布式 crawler SDK。
- 官方强调 scalable、resilient、low latency、easy to extend、polite yet efficient。
- 适合 URL 流式输入、大量持续监测和低延迟递归抓取。

对 PolitiStream 的价值：

- 如果要做“新闻监控 + 大量站点实时变化监测”，StormCrawler 比 Nutch 更适合流式。
- 但同样是 JVM/Storm 生态，建议未来作为独立服务。

### Heritrix

- GitHub：`https://github.com/internetarchive/heritrix3`

看到的能力：

- Internet Archive 的 open-source、extensible、web-scale、archival-quality crawler。

对 PolitiStream 的价值：

- 如果你需要“像互联网档案馆一样保存一批站点的历史版本”，Heritrix 的 WARC/归档思路值得借鉴。
- 对实时研究体验不如 Crawlee/Crawl4AI 直接。

### Crawl4AI

- GitHub：`https://github.com/unclecode/crawl4ai`

看到的能力：

- 官方 README 定位为 LLM-friendly web crawler & scraper。
- 强项包括 LLM-ready Markdown、BM25 过滤、结构化抽取、CSS/XPath schema、browser integration、deep crawl、缓存、截图、media、Docker/API server。
- README 也出现了 session、browser profile、proxy 等高级能力。对本项目应只采用公开/授权内容读取和质量增强部分，不采用规避访问控制的用途。

对 PolitiStream 的价值：

- 非常适合补强“AI 摘要和报告前的正文质量”。
- 推荐做成 extractor fallback：当前 HTML/PDF 抽取失败或质量低时，把 URL 丢给 Crawl4AI，拿 Markdown、metadata、links、screenshots。

### Firecrawl

- GitHub：`https://github.com/firecrawl/firecrawl`
- Docs：`https://docs.firecrawl.dev`

看到的能力：

- API to search, scrape, and interact with the web at scale。
- 支持 Search、Scrape、Interact、Crawl、Map、Batch Scrape、Agent。
- 输出 Markdown、HTML、screenshots、structured JSON。
- README 说明默认尊重 robots.txt，并提醒用户遵守网站政策。

对 PolitiStream 的价值：

- 适合作为 hosted web context provider：当本地抓取失败，但页面是公开且允许抓取时，用它补齐 Markdown/JSON。
- 缺点是成本和 AGPL/云服务依赖，要作为可选 provider。

### Browserless

- Docs：`https://docs.browserless.io/`

看到的能力：

- Managed headless browsers for automation。
- 支持自托管 Docker、实时监控、AI integrations、Playwright/Puppeteer 生态。

对 PolitiStream 的价值：

- 适合把浏览器池从本地进程挪到独立服务，避免 Deep run 把 Node 后端拖死。
- 建议作为 `RESEARCH_BROWSER_PROVIDER=local|browserless`。

### Playwright

- Docs：`https://playwright.dev/docs/browsers`

看到的能力：

- Playwright 可安装并管理 Chromium、Firefox、WebKit 浏览器二进制。
- 它更适合确定性的 JS 渲染、截图、表单前置操作、动态页面读取。

对 PolitiStream 的价值：

- 当前项目已有 Puppeteer；如果要更稳定跨浏览器和更成熟测试/抓取复用，可逐步切 Playwright。

### trafilatura

- Docs：`https://trafilatura.readthedocs.io/en/stable/index.html`
- GitHub：`https://github.com/adbar/trafilatura`

看到的能力：

- Python package + command-line tool，用于网页 text/metadata 抽取。

对 PolitiStream 的价值：

- 做新闻正文 extraction fallback 很合适。
- 可作为 Python extractor microservice 或 CLI provider。

### Unstructured

- Docs：`https://docs.unstructured.io/open-source/core-functionality/partitioning`

看到的能力：

- `partition` 可按文件类型路由，支持 DOCX、PPTX、XLSX、CSV、HTML、XML、PDF、图片、TXT 等。
- PDF 有 fast / hi_res / OCR 等策略，适合表格和复杂 PDF。

对 PolitiStream 的价值：

- 应补到多内容 extractor：PDF、DOCX、PPTX、XLSX、图片 OCR、表格抽取。

### GDELT / NewsAPI / Common Crawl / Wayback

- GDELT DOC 2.0：`https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/`
- NewsAPI：`https://newsapi.org/docs`
- Common Crawl：`https://commoncrawl.org/`
- Wayback CDX summary：`https://internetarchive.github.io/cdx-summary/`

对 PolitiStream 的价值：

- GDELT：新闻溯源、全球多语言新闻、时间线。
- NewsAPI：标准新闻搜索 provider。
- Common Crawl：不实时抓网页时，也能查历史公开网页大库。
- Wayback CDX：查某 URL 的历史快照，适合“新闻是否被改过、最早何时出现、页面消失了怎么办”。

### Data.gov / CKAN / Socrata / ArcGIS Hub

- Data.gov 使用 CKAN 风格的数据目录 API，典型能力是搜索 dataset、读取 package metadata、展开 resource 文件。
- CKAN 是很多政府/机构开放数据门户的底层系统，适合做通用 `ckanCatalogProvider`。
- Socrata SODA API 适合城市和公共部门开放数据，支持对表格数据做字段选择、过滤、分页和排序。
- ArcGIS REST / Hub 适合地理空间数据、地图 layer、FeatureServer、GeoJSON 和 shapefile 资源。

对 PolitiStream 的价值：

- 能把“研究网页”升级为“研究网页 + 数据集”。
- 对比赛、调研、城市/政策/地理/环境类题目尤其关键。
- 建议输出统一的 `DatasetCandidate`：包含 title、description、publisher、license、resources、formats、spatial、temporal、updated_at。

### Kaggle / Hugging Face Datasets / OpenML / UCI

- Kaggle API 覆盖 datasets 和 competitions，适合数据竞赛、训练数据、baseline notebook、submission format。
- Hugging Face Datasets 有 dataset card、files、license、splits、viewer metadata，适合 AI/ML 方向数据发现。
- OpenML 提供 datasets、tasks、runs、evaluations，适合 benchmark 和机器学习任务复现。
- UCI ML Repository 适合作为经典数据集补充来源。

对 PolitiStream 的价值：

- 当用户说“比赛需要数据源”时，系统应先拆出 metric、变量、时间范围、数据许可和可提交格式。
- 对数据竞赛类任务，要抓 `rules/evaluation/data/sample submission`，不是只抓数据文件。
- 对 ML benchmark，要把 dataset、paper、leaderboard、model card 和 evaluation script 串起来。

### World Bank / FRED / IMF / OECD / Eurostat

- World Bank API 适合国家/地区维度指标和时间序列。
- FRED API 适合美国经济金融时间序列。
- IMF、OECD、Eurostat 常见 SDMX 风格结构，适合跨国指标对比。

对 PolitiStream 的价值：

- 这些源比新闻转载更适合作为事实和指标底座。
- 报告里应引用 indicator code、单位、国家/地区、时间范围和最后更新时间。
- 需要实现 time series normalizer，把不同 API 的时间序列转成统一结构。

### 体育/赛事和实时数据 API

- OpenF1 提供 Formula 1 会话、车手、位置、圈速等公开数据接口。
- football-data.org 提供足球比赛、球队、联赛、赛程结果等 API。
- balldontlie 提供 NBA 球员、球队、比赛和统计 API。
- StatsBomb Open Data 提供公开足球事件级数据，可用于战术和事件流分析。

对 PolitiStream 的价值：

- 体育赛事类研究需要 `season -> competition -> match -> team/player -> event/stat` 的实体链。
- 实时或近实时数据要保存 `observed_at` 和 `source_updated_at`，避免把旧快照当新事实。
- 如果来源是付费 API，只记录 provider requirement，不尝试绕过。

## 5. 推荐给 PolitiStream 的分阶段增强路线

### Phase 1：立刻可做，和当前 TypeScript 栈融合

1. 增加 `web_reader_probe` 诊断阶段。
2. 增加 Crawlee fetch provider。
3. 增加 Crawl4AI extractor provider。
4. 增加 GDELT、Wayback、Common Crawl discovery provider。
5. 增加 CKAN/Data.gov、Socrata、World Bank、FRED、Kaggle、Hugging Face Datasets discovery provider。
6. 增加 CSV/JSON/Parquet/Excel 基础 asset ingest + schema profile。
7. 增加 Firecrawl 可选 hosted provider。
8. Source Explorer 增加“诊断结果”和“读取路径”：HTTP / browser / Crawl4AI / Firecrawl / archive / dataset api / dataset file。

### Phase 2：Python extractor lane

新增独立 Python worker，不污染 Node server：

```text
workers-python/
  pyproject.toml
  extractors/
    trafilatura_extractor.py
    unstructured_extractor.py
    newspaper4k_extractor.py
  worker.py
```

通过 Postgres 或 Redis/BullMQ 接任务，输出回 `crawl_documents`、`document_assets`、`extracted_tables`。

推荐工具：

- trafilatura：网页正文和 metadata。
- Unstructured：PDF、Office、图片、表格。
- newspaper4k：新闻正文专项。
- DuckDB / Polars：CSV、Parquet、JSONL 快速预览、统计摘要和质量检查。
- pandasdmx / xarray：SDMX、NetCDF 等统计和科学数据格式。

### Phase 3：真正大规模/归档级

当你要抓百万级页面或长期站群监控：

- Nutch：批量 web-scale crawl + Solr/Elasticsearch。
- StormCrawler：低延迟持续监控。
- Heritrix：归档级 WARC 保存。
- Browserless：远程浏览器池。
- 独立数据湖/对象存储：保存 dataset snapshots、WARC、Parquet、raw assets。

这阶段建议拆成独立服务，而不是塞进 Express 后端。

## 6. 建议新增 provider / module 清单

```text
src/server/research/diagnosis/
  accessDiagnosis.ts
  webReaderProbeAdapter.ts

src/server/research/fetchers/
  crawleeFetcher.ts
  browserlessFetcher.ts
  firecrawlFetcher.ts

src/server/research/discovery/
  gdeltProvider.ts
  waybackProvider.ts
  commonCrawlProvider.ts
  newsApiProvider.ts
  ckanProvider.ts
  socrataProvider.ts
  arcgisProvider.ts
  kaggleProvider.ts
  huggingFaceDatasetProvider.ts
  openMlProvider.ts
  worldBankProvider.ts
  fredProvider.ts
  sportsDataProvider.ts

src/server/research/extractors/
  crawl4aiExtractor.ts
  trafilaturaExtractor.ts
  unstructuredExtractor.ts
  newspaperExtractor.ts

src/server/research/dataSources/
  datasetRegistry.ts
  datasetCandidateScorer.ts
  datasetAssetIngestor.ts
  datasetSchemaProfiler.ts
  datasetQualityScorer.ts
  datasetLineage.ts

src/server/research/dataFormats/
  csvExtractor.ts
  jsonExtractor.ts
  parquetExtractor.ts
  excelExtractor.ts
  geojsonExtractor.ts
  sdmxExtractor.ts
  xbrlExtractor.ts

workers-python/
  pyproject.toml
  worker.py
  extractors/
  data_extractors/
```

建议新增数据表：

```text
dataset_sources
dataset_candidates
dataset_assets
dataset_schemas
dataset_quality_reports
dataset_snapshots
dataset_lineage
dataset_observations
```

## 7. 优先级排序

| 优先级 | 能力 | 理由 |
|---|---|---|
| P0 | access diagnosis + web-reader-router 规则 | 先知道页面为什么读不到，避免盲爬 |
| P0 | GDELT provider | 新闻溯源能力立刻增强 |
| P0 | Wayback provider | 查证新闻、页面改动、消失页面很关键 |
| P0 | dataset registry + DatasetCandidate | 把新闻、网页、数据集统一纳入 Research run |
| P0 | CKAN/Data.gov + Socrata provider | 开放数据目录覆盖面广，适合比赛和调研题目 |
| P0 | CSV/JSON/Excel schema profile | 大多数数据源第一步都落到表格和文件 |
| P1 | Crawlee provider | 最贴合当前 TS 技术栈 |
| P1 | Crawl4AI extractor | LLM-ready Markdown 对报告质量帮助大 |
| P1 | Unstructured Python worker | PDF/表格/Office 文档能力质变 |
| P1 | World Bank/FRED/OpenAlex provider | 高权威结构化指标和学术证据 |
| P1 | Kaggle/Hugging Face/OpenML provider | 数据竞赛、AI/ML、benchmark 调研刚需 |
| P1 | dataset quality score + lineage | 防止报告引用脏数据、错单位、错版本 |
| P2 | Firecrawl provider | 快速补强 hosted web context，但有成本 |
| P2 | Browserless | Deep run 浏览器池稳定性 |
| P2 | Parquet/GeoJSON/SDMX/XBRL extractor | 面向金融、地理、统计和大数据格式 |
| P2 | sports/competition provider | 支持赛事、排行榜、实时数据研究 |
| P3 | Nutch/StormCrawler/Heritrix | 超大规模或归档级时再上 |

## 8. 不建议做的“黑客式强爬”

以下不建议、也不应作为 PolitiStream 能力：

- 绕过登录、SSO、认证、授权。
- 绕过付费墙、订阅限制。
- 破解 CAPTCHA、滑块、人机验证。
- 代理池规避封禁、指纹伪装规避网站策略。
- 抓取个人隐私、Cookie、Token、后台数据、无权限商业数据。
- 违反 robots.txt 或网站条款的抓取。

替代方式：

- 官方 API。
- 用户授权导出。
- RSS / sitemap。
- GDELT / Common Crawl / Wayback。
- 用户上传 PDF/HTML/截图后处理。
- 合法公开来源交叉验证。

## 9. 参考来源

- Crawlee GitHub: https://github.com/apify/crawlee
- Scrapy GitHub: https://github.com/scrapy/scrapy
- Scrapy Docs: https://docs.scrapy.org/
- Scrapy Deploy: https://www.scrapy.org/deploy
- scrapy-playwright: https://github.com/scrapy-plugins/scrapy-playwright
- Apache Nutch: https://nutch.apache.org/
- Apache StormCrawler: https://stormcrawler.apache.org/
- Heritrix: https://github.com/internetarchive/heritrix3
- Crawl4AI GitHub: https://github.com/unclecode/crawl4ai
- Firecrawl GitHub: https://github.com/firecrawl/firecrawl
- Browserless Docs: https://docs.browserless.io/
- Playwright Browsers Docs: https://playwright.dev/docs/browsers
- trafilatura Docs: https://trafilatura.readthedocs.io/en/stable/index.html
- trafilatura GitHub: https://github.com/adbar/trafilatura
- Unstructured partitioning: https://docs.unstructured.io/open-source/core-functionality/partitioning
- GDELT DOC 2.0: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- NewsAPI Docs: https://newsapi.org/docs
- Common Crawl: https://commoncrawl.org/
- Wayback CDX summary: https://internetarchive.github.io/cdx-summary/
- OpenAlex Developers: https://developers.openalex.org/
- Crossref REST API: https://api.crossref.org/swagger-ui/index.html
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- GitHub REST API: https://docs.github.com/en/rest
- Hugging Face Hub API: https://huggingface.co/docs/hub/api
- Wikidata API: https://www.wikidata.org/w/api.php
- CKAN API: https://docs.ckan.org/en/latest/api/
- Socrata Open Data API: https://dev.socrata.com/
- ArcGIS REST APIs: https://developers.arcgis.com/rest/
- Data.gov: https://data.gov/
- Kaggle API: https://github.com/Kaggle/kaggle-api
- Hugging Face Dataset Viewer API: https://huggingface.co/docs/dataset-viewer/en/index
- OpenML API: https://docs.openml.org/API/
- UCI Machine Learning Repository: https://archive.ics.uci.edu/
- World Bank Developer Information: https://datahelpdesk.worldbank.org/knowledgebase/topics/125589-developer-information
- FRED API: https://fred.stlouisfed.org/docs/api/fred/
- OpenF1 API: https://openf1.org/
- football-data.org API: https://www.football-data.org/documentation/quickstart
- balldontlie API: https://docs.balldontlie.io/
- StatsBomb Open Data: https://github.com/statsbomb/open-data
- DuckDB CSV: https://duckdb.org/docs/stable/data/csv/overview
- DuckDB Parquet: https://duckdb.org/docs/stable/data/parquet/overview
- W3C DCAT 3: https://www.w3.org/TR/vocab-dcat-3/
- Data Package specification: https://datapackage.org/
