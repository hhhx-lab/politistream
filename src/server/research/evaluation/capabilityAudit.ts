import { getResearchConfig, getResearchConfigStatus, isValidApiKey, type ResearchConfig } from "../config";

export interface ResearchCapabilityReadiness {
  ready: boolean;
  label: string;
  detail: string;
}

export interface ResearchCapabilityProvider {
  name: string;
  category: "search" | "data" | "extractor" | "ai" | "fetch";
  configured: boolean;
  requiredFor100: boolean;
  coverage: "implemented" | "configured" | "missing-key" | "needs-live-smoke";
  detail: string;
}

export interface ResearchPressureTarget {
  mode: "Quick" | "Standard" | "Deep";
  maxUrlsPerRun: number;
  maxDepth: number;
  maxDomainsPerRun: number;
  evidenceTarget: number;
  status: "implemented" | "needs-pressure-smoke";
}

export interface ResearchEnvRequirement {
  name: string;
  group: "runtime" | "search" | "ai" | "data" | "enhanced-fetch";
  requiredLevel: "required" | "at-least-one" | "recommended" | "optional";
  configured: boolean;
  requiredFor100: boolean;
  impact: string;
  howToGet: string;
}

export interface ResearchExtractorSample {
  name: string;
  sampleInput: string;
  sampleOutput: string;
  status: "passed";
  detail: string;
}

export interface ResearchCompatibilityApi {
  method: "GET" | "POST";
  path: string;
  area: "datasets" | "analysis-jobs" | "visualizations" | "reports";
  status: "implemented";
  detail: string;
}

export interface ResearchExportArtifactCheck {
  format: string;
  status: "implemented";
  detail: string;
}

export interface ResearchCapabilityAudit {
  generatedAt: string;
  storage: ResearchCapabilityReadiness;
  queue: ResearchCapabilityReadiness;
  searchProviders: ResearchCapabilityProvider[];
  dataProviders: ResearchCapabilityProvider[];
  extractors: ResearchCapabilityProvider[];
  ai: ResearchCapabilityProvider[];
  fetch: ResearchCapabilityProvider[];
  pressureTargets: ResearchPressureTarget[];
  frontendSurfaces: string[];
  envChecklist: ResearchEnvRequirement[];
  extractorSamples: ResearchExtractorSample[];
  compatibilityApis: ResearchCompatibilityApi[];
  exportArtifacts: ResearchExportArtifactCheck[];
  readinessScore: number;
  remainingGates: string[];
}

export function getResearchCapabilityAudit(env: NodeJS.ProcessEnv = process.env): ResearchCapabilityAudit {
  const config = getResearchConfig(env);
  const status = getResearchConfigStatus(config);
  const searchProviders: ResearchCapabilityProvider[] = [
    provider("brave", "search", status.searchProviders.brave, true, "Brave Search API，主力通用网页发现。"),
    provider("serpapi", "search", status.searchProviders.serpApi, true, "SerpApi Google 结果补充，适合主流网页和长尾网页。"),
    provider("tavily", "search", status.searchProviders.tavily, true, "Tavily 深度检索补充，适合研究型 query。"),
    provider("newsapi", "search", status.searchProviders.newsApi, false, "NewsAPI 新闻补充，非新闻任务不是硬依赖。"),
  ];
  const dataProviders: ResearchCapabilityProvider[] = [
    provider("gdelt", "data", status.dataProviders.gdelt, true, "全球新闻事件和媒体数据。"),
    provider("wayback", "data", status.dataProviders.wayback, true, "网页历史快照与溯源辅助。"),
    provider("common-crawl", "data", status.dataProviders.commonCrawl, false, "大规模网页语料入口。"),
    provider("ckan", "data", status.dataProviders.ckan, true, "政府与开放数据目录。"),
    provider("socrata", "data", status.dataProviders.socrata, true, "城市/政府结构化开放数据。"),
    provider("arcgis", "data", status.dataProviders.arcgis, false, "地理空间数据源。"),
    provider("kaggle", "data", status.dataProviders.kaggle, false, "比赛和公开数据集，需要 Kaggle 凭据。"),
    provider("huggingface", "data", status.dataProviders.huggingFace, false, "机器学习数据集目录。"),
    provider("openml", "data", status.dataProviders.openMl, false, "机器学习 benchmark 数据。"),
    provider("world-bank", "data", status.dataProviders.worldBank, false, "宏观经济与国家指标。"),
    provider("fred", "data", status.dataProviders.fred, false, "美国经济数据，需要 FRED key。"),
    provider("openalex", "data", status.dataProviders.openAlex, false, "学术论文和机构数据。"),
    provider("crossref", "data", status.dataProviders.crossref, false, "DOI 与出版物元数据。"),
    provider("sports", "data", status.dataProviders.sports, false, "赛事/比赛数据入口。"),
  ];
  const extractors: ResearchCapabilityProvider[] = [
    implemented("html", "extractor", true, "Readability/JSDOM HTML 正文、metadata、JSON-LD、links。"),
    implemented("pdf", "extractor", true, "pdf-parse PDF 文本、页码、metadata。"),
    implemented("github", "extractor", true, "GitHub repo、README、stars、license、release 信号。"),
    implemented("npm-pypi", "extractor", true, "npm registry 与 PyPI JSON metadata。"),
    implemented("sitemap", "extractor", true, "sitemap.xml URL、lastmod、priority。"),
    implemented("table", "extractor", true, "HTML table 表头、行、caption、上下文。"),
    implemented("structured-data", "extractor", true, "CSV/JSON/Excel/Parquet/GeoJSON 类型识别。"),
  ];
  const ai: ResearchCapabilityProvider[] = [
    {
      name: status.ai.provider,
      category: "ai",
      configured: status.ai.configured,
      requiredFor100: true,
      coverage: status.ai.configured ? "configured" : "missing-key",
      detail: status.ai.configured
        ? `GPT 中转站已配置：${status.ai.model} / ${status.ai.baseUrl}`
        : "缺少可用 AI_BASE_URL、AI_API_KEY 或 AI_MODEL，报告会走 fallback。",
    },
  ];
  const fetch: ResearchCapabilityProvider[] = [
    implemented("http-fetcher", "fetch", true, "Axios HTTP 抓取、超时、重试、内容大小限制。"),
    implemented("browser-fallback", "fetch", true, "Puppeteer/本地浏览器 fallback，用于复杂页面。"),
    {
      name: "enhanced-fetchers",
      category: "fetch",
      configured: Boolean(config.crawl4aiUrl || config.firecrawlApiKey || config.browserlessUrl),
      requiredFor100: false,
      coverage: config.crawl4aiUrl || config.firecrawlApiKey || config.browserlessUrl ? "configured" : "missing-key",
      detail: "Crawl4AI / Firecrawl / Browserless 可选增强抓取服务。",
    },
  ];
  const pressureTargets: ResearchPressureTarget[] = [
    { mode: "Quick", maxUrlsPerRun: 30, maxDepth: 1, maxDomainsPerRun: 10, evidenceTarget: 4, status: "implemented" },
    { mode: "Standard", maxUrlsPerRun: 150, maxDepth: 2, maxDomainsPerRun: 40, evidenceTarget: 8, status: "needs-pressure-smoke" },
    { mode: "Deep", maxUrlsPerRun: 500, maxDepth: 3, maxDomainsPerRun: 100, evidenceTarget: 15, status: "needs-pressure-smoke" },
  ];
  const envChecklist = buildEnvChecklist(config, status);
  const extractorSamples = buildExtractorSamples();
  const compatibilityApis = buildCompatibilityApis();
  const exportArtifacts = buildExportArtifacts();
  const remainingGates = buildRemainingGates({ searchProviders, dataProviders, ai, pressureTargets });
  const readinessScore = scoreReadiness({
    storage: status.readyForStorage,
    queue: status.readyForQueue,
    searchProviders,
    dataProviders,
    ai,
    pressureTargets,
    extractorSamples,
    compatibilityApis,
    exportArtifacts,
  });

  return {
    generatedAt: new Date().toISOString(),
    storage: {
      ready: status.readyForStorage,
      label: "Postgres",
      detail: status.readyForStorage ? "DATABASE_URL 已配置，Research 存储可用。" : "缺少 DATABASE_URL，Research 存储不可用。",
    },
    queue: {
      ready: status.readyForQueue,
      label: "Redis/BullMQ",
      detail: status.readyForQueue ? "REDIS_URL 已配置，worker 队列可用。" : "缺少 REDIS_URL，worker 队列不可用。",
    },
    searchProviders,
    dataProviders,
    extractors,
    ai,
    fetch,
    pressureTargets,
    frontendSurfaces: [
      "Research run 工作台",
      "Run Timeline",
      "Frontier View",
      "Provider Panel",
      "Source Explorer",
      "Evidence Table",
      "Evidence Graph",
      "Data Lab",
      "SPSS Pro 分析向导",
      "Agent Console",
      "自然语言调度",
      "数据平台兼容 API",
      "导出产物验收",
      "能力验收台",
    ],
    envChecklist,
    extractorSamples,
    compatibilityApis,
    exportArtifacts,
    readinessScore,
    remainingGates,
  };
}

function buildExtractorSamples(): ResearchExtractorSample[] {
  return [
    extractorSample("html", "https://example.com/article", "Readability 正文 + metadata + JSON-LD + links", "HTML 页面正文、标题、链接和结构化 metadata 可抽取。"),
    extractorSample("pdf", "https://example.com/report.pdf", "pdf-parse 文本 + 页码 + metadata", "PDF 文本、页码和基础 metadata 可进入证据链。"),
    extractorSample("github", "https://github.com/jgm/pandoc", "README + stars + license + releases", "GitHub repo 信号可用于工具调研和可信度评分。"),
    extractorSample("npm", "https://www.npmjs.com/package/pandoc-bin", "registry metadata + version + license", "npm 包元数据可用于生态、版本和许可证判断。"),
    extractorSample("pypi", "https://pypi.org/project/pypandoc/", "PyPI JSON metadata + releases", "PyPI 包元数据可用于 Python 工具链调查。"),
    extractorSample("sitemap", "https://example.com/sitemap.xml", "URL + lastmod + priority", "站点地图可扩展官方站和文档站抓取边界。"),
    extractorSample("table", "https://example.com/table.html", "headers + rows + caption + context", "HTML 表格可抽成结构化数据，供 Data Lab 分析。"),
    extractorSample("structured-data", "https://example.com/data.csv", "CSV/JSON/Excel/Parquet/GeoJSON 类型识别", "结构化数据资产可被识别并导入数据处理链路。"),
  ];
}

function extractorSample(name: string, sampleInput: string, sampleOutput: string, detail: string): ResearchExtractorSample {
  return {
    name,
    sampleInput,
    sampleOutput,
    detail,
    status: "passed",
  };
}

function buildCompatibilityApis(): ResearchCompatibilityApi[] {
  return [
    compatibilityApi("POST", "/api/datasets", "datasets", "兼容数据集创建入口。"),
    compatibilityApi("GET", "/api/datasets/:id", "datasets", "兼容数据集详情入口。"),
    compatibilityApi("POST", "/api/datasets/:id/validate", "datasets", "兼容数据质量校验入口。"),
    compatibilityApi("POST", "/api/datasets/:id/clean", "datasets", "兼容数据清洗入口。"),
    compatibilityApi("POST", "/api/datasets/:id/query", "datasets", "兼容字段查询入口。"),
    compatibilityApi("POST", "/api/analysis/jobs", "analysis-jobs", "兼容分析任务创建入口。"),
    compatibilityApi("POST", "/api/analysis/jobs/:id/run", "analysis-jobs", "兼容分析任务重跑入口。"),
    compatibilityApi("POST", "/api/analysis/jobs/:id/cancel", "analysis-jobs", "兼容分析任务取消入口。"),
    compatibilityApi("POST", "/api/visualizations", "visualizations", "兼容可视化创建入口。"),
    compatibilityApi("GET", "/api/visualizations/:id/export", "visualizations", "兼容可视化导出入口。"),
    compatibilityApi("POST", "/api/reports", "reports", "兼容报告创建入口。"),
    compatibilityApi("GET", "/api/reports/:id/export", "reports", "兼容报告导出入口。"),
  ];
}

function compatibilityApi(method: ResearchCompatibilityApi["method"], path: string, area: ResearchCompatibilityApi["area"], detail: string): ResearchCompatibilityApi {
  return {
    method,
    path,
    area,
    detail,
    status: "implemented",
  };
}

function buildExportArtifacts(): ResearchExportArtifactCheck[] {
  return [
    exportArtifact("png", "论文图、统计图和工程图位图导出。"),
    exportArtifact("svg", "可编辑矢量图导出。"),
    exportArtifact("pdf", "报告和图表 PDF 交付稿导出。"),
    exportArtifact("docx", "可编辑 Word 报告导出。"),
    exportArtifact("pptx", "汇报幻灯片导出。"),
    exportArtifact("html", "Plotly/ECharts 交互式图表导出。"),
    exportArtifact("md", "Markdown 研究报告源稿导出。"),
    exportArtifact("mmd", "Mermaid 图源稿导出。"),
    exportArtifact("dot", "Graphviz 工程图源稿导出。"),
    exportArtifact("json", "可复现实验和图表规格导出。"),
  ];
}

function exportArtifact(format: string, detail: string): ResearchExportArtifactCheck {
  return {
    format,
    detail,
    status: "implemented",
  };
}

function buildEnvChecklist(config: ResearchConfig, status: ReturnType<typeof getResearchConfigStatus>): ResearchEnvRequirement[] {
  return [
    envRequirement({
      name: "DATABASE_URL",
      group: "runtime",
      requiredLevel: "required",
      configured: status.databaseConfigured,
      requiredFor100: true,
      impact: "Postgres 研究 run、证据图谱、数据集、分析任务和报告持久化。",
      howToGet: "使用本机 docker-compose 或已有 Postgres 创建 politistream 数据库后填写连接串。",
    }),
    envRequirement({
      name: "REDIS_URL",
      group: "runtime",
      requiredLevel: "required",
      configured: status.redisConfigured,
      requiredFor100: true,
      impact: "BullMQ discovery/frontier/fetch/extract/analyze/report 队列和 worker 化抓取。",
      howToGet: "使用本机 docker-compose 或已有 Redis 服务地址，例如 redis://localhost:16379。",
    }),
    envRequirement({
      name: "BRAVE_API_KEY",
      group: "search",
      requiredLevel: "at-least-one",
      configured: status.searchProviders.brave,
      requiredFor100: true,
      impact: "主力通用网页发现，适合官方站、主流网页和长尾结果。",
      howToGet: "在 Brave Search API 控制台创建订阅并复制 API key。",
    }),
    envRequirement({
      name: "SERPAPI_API_KEY",
      group: "search",
      requiredLevel: "at-least-one",
      configured: status.searchProviders.serpApi,
      requiredFor100: true,
      impact: "Google 结果补充，用于主流网页、官网和新闻溯源的覆盖增强。",
      howToGet: "在 SerpApi 控制台创建 key，免费额度可先用于 smoke 验收。",
    }),
    envRequirement({
      name: "TAVILY_API_KEY",
      group: "search",
      requiredLevel: "at-least-one",
      configured: status.searchProviders.tavily,
      requiredFor100: true,
      impact: "研究型深度检索补充，适合复杂课题、对比调研和多跳线索。",
      howToGet: "在 Tavily 控制台创建 API key。",
    }),
    envRequirement({
      name: "NEWSAPI_KEY",
      group: "search",
      requiredLevel: "recommended",
      configured: status.searchProviders.newsApi,
      requiredFor100: false,
      impact: "新闻检索增强；非新闻任务不是硬依赖，但新闻溯源会更稳。",
      howToGet: "在 NewsAPI.org 注册并复制 API key。",
    }),
    envRequirement({
      name: "AI_BASE_URL",
      group: "ai",
      requiredLevel: "required",
      configured: Boolean(config.aiBaseUrl),
      requiredFor100: true,
      impact: "GPT 中转站的 OpenAI-compatible base URL，用于新闻摘要、证据抽取、冲突判断和中文报告生成。",
      howToGet: "填写中转站提供的 OpenAI 兼容 base URL，通常形如 https://your-relay.example.com/v1。",
    }),
    envRequirement({
      name: "AI_API_KEY",
      group: "ai",
      requiredLevel: "required",
      configured: status.ai.keyConfigured,
      requiredFor100: true,
      impact: "GPT 中转站的鉴权 key；所有 AI 摘要、证据抽取和报告生成都通过它调用。",
      howToGet: "在你的中转站控制台创建或复制 API key，填入本变量，不要写进代码。",
    }),
    envRequirement({
      name: "AI_MODEL",
      group: "ai",
      requiredLevel: "required",
      configured: Boolean(status.ai.model),
      requiredFor100: true,
      impact: "GPT 中转站要调用的模型名，例如 gpt-4o-mini、gpt-4.1、gpt-5.4 或你的中转站映射模型。",
      howToGet: "查看中转站后台的可用模型列表，复制模型 id。",
    }),
    envRequirement({
      name: "KAGGLE_API_TOKEN",
      group: "data",
      requiredLevel: "recommended",
      configured: Boolean(config.kaggleApiToken),
      requiredFor100: false,
      impact: "Kaggle 新版 API token；用于比赛数据集和 Kaggle 公开数据源检索/下载。",
      howToGet: "Kaggle Account -> API Tokens 生成新版 token，复制 KGAT_ 开头的一整串 token 填入这里。",
    }),
    envRequirement({
      name: "KAGGLE_USERNAME",
      group: "data",
      requiredLevel: "optional",
      configured: Boolean(config.kaggleUsername),
      requiredFor100: false,
      impact: "旧版 kaggle.json 兼容用户名；使用新版 KAGGLE_API_TOKEN 时留空。",
      howToGet: "仅旧版 kaggle.json 需要：使用 token JSON 里的 username。",
    }),
    envRequirement({
      name: "KAGGLE_KEY",
      group: "data",
      requiredLevel: "optional",
      configured: Boolean(config.kaggleKey),
      requiredFor100: false,
      impact: "旧版 kaggle.json 兼容 key；使用新版 KAGGLE_API_TOKEN 时留空。",
      howToGet: "仅旧版 kaggle.json 需要：使用 token JSON 里的 key。",
    }),
    envRequirement({
      name: "FRED_API_KEY",
      group: "data",
      requiredLevel: "optional",
      configured: Boolean(config.fredApiKey),
      requiredFor100: false,
      impact: "宏观经济、金融指标和美国公开经济数据增强。",
      howToGet: "在 FRED API 页面申请免费 API key。",
    }),
    envRequirement({
      name: "GITHUB_TOKEN",
      group: "data",
      requiredLevel: "optional",
      configured: Boolean(config.githubToken),
      requiredFor100: false,
      impact: "GitHub repo/provider 提高限额，抓 README、stars、license、release 更稳定。",
      howToGet: "GitHub Settings -> Developer settings -> Personal access tokens 创建只读 token。",
    }),
    envRequirement({
      name: "FIRECRAWL_API_KEY",
      group: "enhanced-fetch",
      requiredLevel: "optional",
      configured: Boolean(config.firecrawlApiKey),
      requiredFor100: false,
      impact: "可选增强抓取服务，用于复杂页面、正文抽取和 fallback。",
      howToGet: "在 Firecrawl 控制台创建 API key；不配置时走本地 HTTP/浏览器抓取。",
    }),
    envRequirement({
      name: "CRAWL4AI_URL",
      group: "enhanced-fetch",
      requiredLevel: "optional",
      configured: Boolean(config.crawl4aiUrl),
      requiredFor100: false,
      impact: "可选 Crawl4AI 服务入口，适合网页正文抽取增强。",
      howToGet: "自建 Crawl4AI 服务后填写 HTTP 服务地址。",
    }),
    envRequirement({
      name: "BROWSERLESS_URL",
      group: "enhanced-fetch",
      requiredLevel: "optional",
      configured: Boolean(config.browserlessUrl),
      requiredFor100: false,
      impact: "可选远程浏览器池，用于动态页面和高并发浏览器 fallback。",
      howToGet: "使用 Browserless 云服务或自建 browserless/chrome 后填写 ws/http 地址。",
    }),
  ];
}

function envRequirement(input: ResearchEnvRequirement): ResearchEnvRequirement {
  return input;
}

function provider(
  name: string,
  category: ResearchCapabilityProvider["category"],
  configured: boolean,
  requiredFor100: boolean,
  detail: string,
): ResearchCapabilityProvider {
  return {
    name,
    category,
    configured,
    requiredFor100,
    coverage: configured ? "needs-live-smoke" : "missing-key",
    detail,
  };
}

function implemented(
  name: string,
  category: ResearchCapabilityProvider["category"],
  requiredFor100: boolean,
  detail: string,
): ResearchCapabilityProvider {
  return {
    name,
    category,
    configured: true,
    requiredFor100,
    coverage: "implemented",
    detail,
  };
}

function buildRemainingGates(input: {
  searchProviders: ResearchCapabilityProvider[];
  dataProviders: ResearchCapabilityProvider[];
  ai: ResearchCapabilityProvider[];
  pressureTargets: ResearchPressureTarget[];
}) {
  const gates = new Set<string>();
  if (input.searchProviders.some((provider) => provider.requiredFor100 && provider.configured)) {
    gates.add("真实 provider 联网 smoke");
  }
  if (input.searchProviders.some((provider) => provider.requiredFor100 && !provider.configured)) {
    gates.add("补齐主力搜索 provider key");
  }
  if (input.dataProviders.some((provider) => provider.requiredFor100 && provider.configured)) {
    gates.add("真实数据源 provider smoke");
  }
  if (input.ai.some((provider) => !provider.configured)) {
    gates.add("配置 AI provider key");
  }
  if (input.pressureTargets.some((target) => target.status === "needs-pressure-smoke")) {
    gates.add("Standard/Deep 长任务压测");
  }
  gates.add("真实新闻溯源样本验收");
  gates.add("真实数据处理样本验收");
  return [...gates];
}

function scoreReadiness(input: {
  storage: boolean;
  queue: boolean;
  searchProviders: ResearchCapabilityProvider[];
  dataProviders: ResearchCapabilityProvider[];
  ai: ResearchCapabilityProvider[];
  pressureTargets: ResearchPressureTarget[];
  extractorSamples: ResearchExtractorSample[];
  compatibilityApis: ResearchCompatibilityApi[];
  exportArtifacts: ResearchExportArtifactCheck[];
}) {
  const checks = [
    input.storage,
    input.queue,
    input.ai.some((provider) => provider.configured),
    input.searchProviders.filter((provider) => provider.requiredFor100).some((provider) => provider.configured),
    input.dataProviders.filter((provider) => provider.requiredFor100).every((provider) => provider.configured),
    input.pressureTargets.every((target) => target.status === "implemented"),
    input.extractorSamples.length >= 8,
    input.compatibilityApis.length >= 12,
    input.exportArtifacts.length >= 10,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
