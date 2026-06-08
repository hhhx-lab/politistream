import { normalizeResearchBudget } from "./budget";
import {
  ResearchConstraints,
  ResearchFreshness,
  PlannedQuery,
  QueryPurpose,
  ResearchPlan,
  ResearchTaskType,
  SourceType,
} from "./types";

export function normalizeResearchConstraints(input: Partial<ResearchConstraints> = {}): ResearchConstraints {
  return {
    timeRange: input.timeRange
      ? {
          from: cleanText(input.timeRange.from),
          to: cleanText(input.timeRange.to),
          freshness: input.timeRange.freshness,
        }
      : undefined,
    contentTypes: normalizeList(input.contentTypes),
    sourceScope: input.sourceScope
      ? {
          domains: normalizeList(input.sourceScope.domains),
          excludeDomains: normalizeList(input.sourceScope.excludeDomains),
          sourceTypes: normalizeSourceTypes(input.sourceScope.sourceTypes),
        }
      : undefined,
    languages: normalizeList(input.languages),
    includeKeywords: normalizeList(input.includeKeywords),
    excludeKeywords: normalizeList(input.excludeKeywords),
  };
}

export function planResearch(topic: string, seedUrls: string[] = [], constraints: Partial<ResearchConstraints> = {}): ResearchPlan {
  const normalizedTopic = topic.trim().replace(/\s+/g, " ");
  const normalizedConstraints = normalizeResearchConstraints(constraints);
  const taskType = classifyTask(normalizedTopic);
  const requiredSourceTypes = mergeSourceTypes(requiredSourcesForTask(taskType), normalizedConstraints.sourceScope?.sourceTypes);
  const queries = buildQueries(normalizedTopic, seedUrls, taskType, normalizedConstraints);

  return {
    taskType,
    topic,
    normalizedTopic,
    claim: taskType === "verification" ? normalizedTopic : undefined,
    subQuestions: subQuestionsForTask(taskType),
    languages: normalizedConstraints.languages?.length ? normalizedConstraints.languages : inferLanguages(normalizedTopic),
    freshness: inferFreshness(normalizedTopic, taskType, normalizedConstraints),
    requiredSourceTypes,
    queries,
    budget: normalizeResearchBudget(budgetForTask(taskType)),
    stopConditions: stopConditionsForTask(taskType),
    constraints: normalizedConstraints,
  };
}

export function planQueries(topic: string, seedUrls: string[] = [], constraints: Partial<ResearchConstraints> = {}): string[] {
  return planResearch(topic, seedUrls, constraints).queries.map((query) => query.text).slice(0, 20);
}

function classifyTask(topic: string): ResearchTaskType {
  const lower = topic.toLowerCase();

  if (matches(lower, ["查证", "真假", "是否真实", "原始出处", "溯源", "辟谣", "fact check", "verify", "verified", "source of"])) {
    return "verification";
  }

  if (matches(lower, ["工具", "tool", "转换", "converter", "对比", "推荐", "好用", "best", "alternative", "alternatives", "竞品", "pricing"])) {
    return "tool-evaluation";
  }

  if (matches(lower, ["政策", "法规", "监管", "法案", "regulation", "policy", "compliance"])) {
    return "policy";
  }

  if (matches(lower, ["api", "sdk", "框架", "library", "库", "技术", "architecture", "benchmark"])) {
    return "technical";
  }

  if (matches(lower, ["比赛", "赛事", "球员", "球队", "赛程", "排名", "f1", "formula 1", "nba", "football", "soccer", "sports", "leaderboard"])) {
    return "sports-analysis";
  }

  if (matches(lower, ["数据", "dataset", "data source", "数据源", "指标", "统计", "csv", "excel", "parquet", "kaggle", "open data", "可视化", "图表", "画图", "spss"])) {
    return "data-research";
  }

  if (matches(lower, ["竞品", "competitor", "market map", "市场"])) {
    return "competitive";
  }

  return "survey";
}

function requiredSourcesForTask(taskType: ResearchTaskType): SourceType[] {
  switch (taskType) {
    case "verification":
      return ["official", "mainstream-news", "regulatory", "company"];
    case "tool-evaluation":
      return ["official", "github", "package-registry", "technical-doc", "community", "benchmark", "company"];
    case "policy":
      return ["official", "regulatory", "mainstream-news", "academic", "community"];
    case "technical":
      return ["official", "technical-doc", "github", "package-registry", "community", "benchmark"];
    case "competitive":
      return ["official", "company", "mainstream-news", "community", "benchmark"];
    case "data-research":
      return ["official", "dataset", "data-catalog", "structured-api", "academic", "benchmark"];
    case "sports-analysis":
      return ["official", "sports-data", "structured-api", "mainstream-news", "dataset"];
    case "monitoring":
      return ["official", "mainstream-news", "rss" as SourceType];
    default:
      return ["official", "mainstream-news", "technical-doc", "community"];
  }
}

function subQuestionsForTask(taskType: ResearchTaskType): string[] {
  switch (taskType) {
    case "verification":
      return [
        "核心说法是什么，是否可以拆成可查证的 claim",
        "最早可验证出处在哪里",
        "官方来源、主流媒体和原始文件是否互相支持",
        "是否存在更正、反证、误读或过期信息",
        "传播时间线和关键转述节点是什么",
      ];
    case "tool-evaluation":
      return [
        "候选工具有哪些，哪些是官方项目或主流方案",
        "每个工具支持哪些格式、CLI/API、批处理和自动化能力",
        "GitHub、包注册表和官方文档显示的成熟度如何",
        "价格、授权、隐私和本地化能力有什么差异",
        "社区反馈、benchmark 和常见问题指向哪些风险",
      ];
    case "policy":
      return [
        "官方政策文本和原始发布机构是什么",
        "关键条款、时间线和适用范围是什么",
        "主流解读和反对意见有哪些",
        "相关数据、机构报告和后续影响是什么",
      ];
    case "technical":
      return [
        "官方文档和核心实现说明是什么",
        "生态、版本、依赖、性能和限制是什么",
        "社区实践、故障案例和替代方案是什么",
      ];
    case "data-research":
      return [
        "这个课题需要哪些变量、指标、时间范围和地域范围",
        "有哪些官方数据目录、开放数据集、结构化 API 或比赛数据源",
        "数据源的许可证、更新时间、schema 和质量如何",
        "哪些数据可以直接用于统计分析、建模和可视化",
      ];
    case "sports-analysis":
      return [
        "需要覆盖哪些赛事、赛季、队伍、球员、比赛和事件数据",
        "有哪些公开 API、官方数据源或开源比赛数据集",
        "数据是否包含时间戳、统计口径、版本和授权说明",
        "可以生成哪些排行榜、趋势图、事件流或预测分析",
      ];
    default:
      return [
        "主题的核心概念和范围是什么",
        "主流来源如何描述这个主题",
        "官方来源、技术资料和社区反馈分别说明什么",
        "哪些问题仍缺少可靠证据",
      ];
  }
}

function buildQueries(topic: string, seedUrls: string[], taskType: ResearchTaskType, constraints: ResearchConstraints): PlannedQuery[] {
  const builder = createQueryBuilder(buildConstraintSuffix(constraints));

  addOverviewQueries(builder, topic);

  switch (taskType) {
    case "verification":
      addVerificationQueries(builder, topic);
      break;
    case "tool-evaluation":
      addToolEvaluationQueries(builder, topic);
      break;
    case "policy":
      addPolicyQueries(builder, topic);
      break;
    case "technical":
      addTechnicalQueries(builder, topic);
      break;
    case "competitive":
      addCompetitiveQueries(builder, topic);
      break;
    case "data-research":
      addDataResearchQueries(builder, topic);
      break;
    case "sports-analysis":
      addSportsAnalysisQueries(builder, topic);
      break;
    default:
      addSurveyQueries(builder, topic);
      break;
  }

  for (const seedUrl of seedUrls) {
    const hostname = safeHostname(seedUrl);
    if (hostname && topic) {
      builder.add(`site:${hostname} ${topic}`, "official-source", ["official"], 95);
    }
  }

  return builder.list().slice(0, 20);
}

function addOverviewQueries(builder: QueryBuilder, topic: string) {
  if (!topic) return;
  builder.add(topic, "overview", ["unknown"], 70);
  builder.add(`${topic} overview`, "overview", ["mainstream-news", "technical-doc"], 55);
  builder.add(`${topic} official`, "official-source", ["official"], 80);
}

function addVerificationQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} original source`, "primary-source", ["official", "company"], 100);
  builder.add(`${topic} official statement OR report`, "official-source", ["official", "regulatory", "company"], 96);
  builder.add(`${topic} Reuters OR AP OR BBC`, "news-coverage", ["mainstream-news"], 82);
  builder.add(`${topic} correction OR fact check OR false`, "contradiction", ["mainstream-news", "community"], 86);
  builder.add(`${topic} timeline first reported`, "timeline", ["mainstream-news", "official"], 90);
  builder.add(`${topic} PDF source document`, "primary-source", ["official", "regulatory"], 78);
}

function addToolEvaluationQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} official website documentation`, "official-source", ["official", "technical-doc"], 95);
  builder.add(`${topic} GitHub`, "technical-detail", ["github"], 90);
  builder.add(`site:github.com ${topic}`, "technical-detail", ["github"], 88);
  builder.add(`${topic} npm OR PyPI package`, "technical-detail", ["package-registry"], 86);
  builder.add(`${topic} benchmark comparison`, "benchmark", ["benchmark", "technical-doc"], 84);
  builder.add(`${topic} pricing license privacy`, "pricing", ["official", "company"], 78);
  builder.add(`${topic} Reddit Hacker News Stack Overflow`, "community-feedback", ["community"], 74);
  builder.add(`${topic} alternatives`, "overview", ["mainstream-news", "community"], 68);
}

function addPolicyQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} official policy text`, "official-source", ["official", "regulatory"], 96);
  builder.add(`${topic} regulation PDF`, "primary-source", ["regulatory"], 88);
  builder.add(`${topic} analysis report`, "overview", ["academic", "mainstream-news"], 76);
  builder.add(`${topic} criticism opposition`, "contradiction", ["mainstream-news", "community"], 70);
  builder.add(`${topic} timeline effective date`, "timeline", ["official", "regulatory"], 78);
}

function addTechnicalQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} official documentation`, "official-source", ["official", "technical-doc"], 92);
  builder.add(`${topic} GitHub examples`, "technical-detail", ["github", "technical-doc"], 84);
  builder.add(`${topic} benchmark performance`, "benchmark", ["benchmark", "technical-doc"], 78);
  builder.add(`${topic} issues limitations`, "community-feedback", ["community", "github"], 72);
  builder.add(`${topic} npm PyPI package`, "technical-detail", ["package-registry"], 68);
}

function addCompetitiveQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} official pricing`, "pricing", ["official", "company"], 90);
  builder.add(`${topic} competitors comparison`, "overview", ["mainstream-news", "benchmark"], 82);
  builder.add(`${topic} customer reviews`, "community-feedback", ["community"], 70);
  builder.add(`${topic} market report`, "overview", ["academic", "mainstream-news"], 68);
}

function addDataResearchQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} dataset`, "dataset-discovery", ["dataset", "data-catalog"], 96);
  builder.add(`${topic} data source API`, "statistical-source", ["structured-api", "official"], 92);
  builder.add(`${topic} site:data.gov`, "dataset-discovery", ["data-catalog", "official"], 88);
  builder.add(`${topic} CKAN Socrata ArcGIS open data`, "dataset-discovery", ["data-catalog", "geospatial"], 84);
  builder.add(`${topic} Kaggle dataset competition`, "competition-data", ["dataset", "benchmark"], 82);
  builder.add(`${topic} Hugging Face dataset OpenML UCI`, "dataset-discovery", ["dataset", "academic"], 78);
  builder.add(`${topic} World Bank FRED OECD IMF Eurostat`, "statistical-source", ["structured-api", "financial-data", "official"], 76);
  builder.add(`${topic} data visualization chart statistics`, "visualization", ["dataset", "benchmark"], 68);
}

function addSportsAnalysisQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} official stats API`, "sports-data", ["sports-data", "official", "structured-api"], 95);
  builder.add(`${topic} schedule results standings players dataset`, "sports-data", ["sports-data", "dataset"], 90);
  builder.add(`${topic} OpenF1 football-data balldontlie StatsBomb`, "sports-data", ["sports-data", "structured-api"], 84);
  builder.add(`${topic} Kaggle sports dataset`, "competition-data", ["dataset", "benchmark"], 78);
  builder.add(`${topic} latest news analysis`, "news-coverage", ["mainstream-news"], 64);
}

function addSurveyQueries(builder: QueryBuilder, topic: string) {
  builder.add(`${topic} latest`, "news-coverage", ["mainstream-news"], 66);
  builder.add(`${topic} report analysis`, "overview", ["academic", "mainstream-news"], 64);
  builder.add(`${topic} official report`, "official-source", ["official"], 72);
  builder.add(`${topic} discussion`, "community-feedback", ["community"], 52);
}

function inferLanguages(topic: string): string[] {
  return /[\u4e00-\u9fff]/.test(topic) ? ["zh", "en"] : ["en"];
}

function inferFreshness(topic: string, taskType: ResearchTaskType, constraints: ResearchConstraints): ResearchFreshness {
  if (constraints.timeRange?.freshness) return constraints.timeRange.freshness;
  if (constraints.timeRange?.from || constraints.timeRange?.to) return "historical";
  const lower = topic.toLowerCase();
  if (matches(lower, ["latest", "recent", "today", "最新", "最近", "近期"])) return "latest";
  if (taskType === "verification" || matches(lower, ["历史", "timeline", "first reported", "最早"])) return "historical";
  return "mixed";
}

function budgetForTask(taskType: ResearchTaskType) {
  if (taskType === "verification") {
    return { maxDepth: 3, maxUrlsPerRun: 120, maxDomainsPerRun: 35, runIntervalMinutes: 60 };
  }

  if (taskType === "tool-evaluation" || taskType === "technical") {
    return { maxDepth: 2, maxUrlsPerRun: 150, maxDomainsPerRun: 45, runIntervalMinutes: 60 };
  }

  if (taskType === "data-research" || taskType === "sports-analysis") {
    return { maxDepth: 3, maxUrlsPerRun: 220, maxDomainsPerRun: 70, runIntervalMinutes: 60 };
  }

  return { maxDepth: 2, maxUrlsPerRun: 100, maxDomainsPerRun: 35, runIntervalMinutes: 60 };
}

function stopConditionsForTask(taskType: ResearchTaskType): string[] {
  if (taskType === "verification") {
    return [
      "found-primary-source-or-official-denial",
      "covered-three-independent-mainstream-sources",
      "captured-conflicting-evidence-if-present",
    ];
  }

  if (taskType === "tool-evaluation") {
    return [
      "covered-official-docs-for-top-candidates",
      "covered-github-or-package-registry-signals",
      "captured-community-feedback-and-benchmark-evidence",
    ];
  }

  if (taskType === "data-research" || taskType === "sports-analysis") {
    return [
      "covered-official-data-catalogs-and-structured-apis",
      "captured-dataset-license-schema-and-update-signals",
      "found-enough-data-assets-for-profiling-and-visualization",
    ];
  }

  return [
    "covered-official-and-mainstream-sources",
    "captured-source-diversity",
    "no-new-high-priority-frontier-items",
  ];
}

function createQueryBuilder(constraintSuffix = "") {
  const rows: PlannedQuery[] = [];
  const seen = new Set<string>();

  return {
    add(text: string, purpose: QueryPurpose, sourceTypes: SourceType[], priority: number) {
      const normalized = [text.trim().replace(/\s+/g, " "), constraintSuffix].filter(Boolean).join(" ");
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) return;
      seen.add(key);
      rows.push({
        id: `q-${String(rows.length + 1).padStart(3, "0")}`,
        text: normalized,
        purpose,
        sourceTypes,
        language: /[\u4e00-\u9fff]/.test(normalized) ? "mixed" : "en",
        priority,
      });
    },
    list() {
      return rows.sort((left, right) => right.priority - left.priority);
    },
  };
}

type QueryBuilder = ReturnType<typeof createQueryBuilder>;

function buildConstraintSuffix(constraints: ResearchConstraints) {
  const parts: string[] = [];

  const from = cleanText(constraints.timeRange?.from);
  const to = cleanText(constraints.timeRange?.to);
  if (from) parts.push(`after:${from}`);
  if (to) parts.push(`before:${to}`);

  for (const contentType of constraints.contentTypes ?? []) {
    const normalized = String(contentType).trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === "dataset") {
      parts.push("dataset");
      continue;
    }
    parts.push(`filetype:${normalized}`);
  }

  for (const domain of constraints.sourceScope?.domains ?? []) {
    parts.push(`site:${normalizeDomain(domain)}`);
  }

  for (const domain of constraints.sourceScope?.excludeDomains ?? []) {
    parts.push(`-site:${normalizeDomain(domain)}`);
  }

  for (const keyword of constraints.includeKeywords ?? []) {
    const normalized = cleanText(keyword);
    if (normalized) parts.push(normalized);
  }

  for (const keyword of constraints.excludeKeywords ?? []) {
    const normalized = cleanText(keyword);
    if (normalized) parts.push(`-${normalized}`);
  }

  return parts.join(" ");
}

function mergeSourceTypes(base: SourceType[], extra?: SourceType[]) {
  return [...new Set([...(base ?? []), ...((extra ?? []) as SourceType[])])];
}

function normalizeList(values?: Array<string | undefined | null>) {
  const items = (values ?? [])
    .map((value) => cleanText(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(items)];
}

const SOURCE_TYPE_VALUES: SourceType[] = [
  "official",
  "mainstream-news",
  "technical-doc",
  "github",
  "package-registry",
  "academic",
  "regulatory",
  "community",
  "benchmark",
  "company",
  "rss",
  "sitemap",
  "dataset",
  "data-catalog",
  "structured-api",
  "archive",
  "sports-data",
  "geospatial",
  "financial-data",
  "unknown",
];

function normalizeSourceTypes(values?: Array<string | undefined | null>): SourceType[] {
  return normalizeList(values).filter((value): value is SourceType => SOURCE_TYPE_VALUES.includes(value as SourceType));
}

function cleanText(value?: string | null) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || "";
}

function normalizeDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return cleanText(value).replace(/^site:/, "");
  }
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matches(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}
