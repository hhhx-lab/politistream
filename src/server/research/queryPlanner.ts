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
  const planningAgent = buildResearchPlanningAgent(normalizedTopic, taskType);
  const queryTopic = planningAgent.topicCore || normalizedTopic;
  const queries = buildQueries(queryTopic, seedUrls, taskType, normalizedConstraints, planningAgent);

  return {
    taskType,
    topic,
    normalizedTopic,
    claim: taskType === "verification" ? normalizedTopic : undefined,
    subQuestions: planningAgent.subQuestions,
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

  if (matches(lower, ["市场", "消费人群", "购买", "销量", "销售", "出生率", "结婚率", "渗透率", "人群画像", "market", "consumer", "demographic", "sales", "birth rate", "fertility"])) {
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

interface ResearchPlanningAgentResult {
  topicCore: string;
  explicitDimensions: string[];
  inferredDimensions: string[];
  subQuestions: string[];
  queryExpansions: Array<{
    text: string;
    purpose: QueryPurpose;
    sourceTypes: SourceType[];
    priority: number;
  }>;
}

function buildResearchPlanningAgent(topic: string, taskType: ResearchTaskType): ResearchPlanningAgentResult {
  const topicCore = extractTopicCore(topic);
  const explicitDimensions = inferExplicitDimensions(topic);
  const inferredDimensions = inferInferredDimensions(topic, taskType, explicitDimensions);
  const subQuestions = dedupeStrings([
    ...topicSpecificSubQuestions(topicCore, taskType, explicitDimensions, inferredDimensions),
    ...subQuestionsForTask(taskType),
  ]).slice(0, 18);
  const queryExpansions = topicSpecificQueryExpansions(topic, topicCore, taskType, explicitDimensions, inferredDimensions);

  return {
    topicCore,
    explicitDimensions,
    inferredDimensions,
    subQuestions,
    queryExpansions,
  };
}

function extractTopicCore(topic: string) {
  const normalized = cleanText(topic)
    .replace(/^研究一下/, "")
    .replace(/^帮我(调查|研究|查找|查证)?/, "")
    .replace(/比如.+$/, "")
    .replace(/等等$/, "")
    .replace(/[，。；;:：]+$/g, "")
    .trim();
  return normalized || topic;
}

function inferExplicitDimensions(topic: string) {
  const dimensions: string[] = [];
  const rules: Array<[string, string[]]> = [
    ["消费人群", ["消费人群", "购买人群", "用户画像", "年龄", "性别", "收入", "职业"]],
    ["地区", ["地区", "地域", "城市", "省份", "区域"]],
    ["购买时间段", ["购买时间", "时间段", "时段", "季节", "节假日", "夜间", "月份"]],
    ["出生率", ["出生率", "生育率", "人口出生", "fertility", "birth rate"]],
    ["结婚率", ["结婚率", "婚姻", "婚育"]],
    ["价格", ["价格", "客单价", "定价", "pricing"]],
    ["渠道", ["渠道", "电商", "线下", "药店", "便利店", "平台"]],
    ["品牌/竞品", ["品牌", "竞品", "竞争", "份额"]],
    ["数据源", ["数据源", "dataset", "公开数据", "统计"]],
    ["趋势", ["趋势", "变化", "增长", "下降", "近年", "历史"]],
  ];

  for (const [dimension, needles] of rules) {
    if (matches(topic.toLowerCase(), needles)) dimensions.push(dimension);
  }
  return dedupeStrings(dimensions);
}

function inferInferredDimensions(topic: string, taskType: ResearchTaskType, explicitDimensions: string[]) {
  const dimensions = [
    "核心定义与研究边界",
    "主流来源与官方来源",
    "数据口径与可验证性",
    "时间线与趋势",
    "反证与不确定性",
  ];
  const lower = topic.toLowerCase();
  if (taskType === "competitive" || matches(lower, ["市场", "购买", "消费", "用户", "品牌", "竞品"])) {
    dimensions.push("市场规模与渗透率", "人群细分", "渠道与平台", "品牌竞争", "价格带");
  }
  if (taskType === "data-research" || explicitDimensions.includes("数据源")) {
    dimensions.push("可下载数据集", "结构化 API", "统计建模变量", "可视化输出");
  }
  if (explicitDimensions.includes("出生率") || explicitDimensions.includes("结婚率")) {
    dimensions.push("人口统计指标", "相关性与滞后关系", "地区面板数据");
  }
  if (matches(lower, ["新闻", "查证", "溯源", "真假"])) {
    dimensions.push("原始出处", "传播链路", "更正与辟谣");
  }
  return dedupeStrings(dimensions);
}

function topicSpecificSubQuestions(
  topicCore: string,
  taskType: ResearchTaskType,
  explicitDimensions: string[],
  inferredDimensions: string[],
) {
  const questions: string[] = [
    `${topicCore} 的核心概念、研究边界和排除范围是什么`,
    `${topicCore} 目前有哪些官方统计、行业报告、平台数据或学术研究可以引用`,
    `${topicCore} 的数据口径分别是什么，样本、时间范围、地域范围和统计单位是否一致`,
  ];

  const addIf = (dimension: string, rows: string[]) => {
    if (explicitDimensions.includes(dimension) || inferredDimensions.includes(dimension)) questions.push(...rows);
  };

  addIf("市场规模与渗透率", [
    `${topicCore} 的市场规模、销量、销售额、渗透率和近年趋势如何变化`,
    `${topicCore} 的增长或下降与政策、人口结构、消费观念、渠道变化分别有什么关系`,
  ]);
  addIf("消费人群", [
    `${topicCore} 的主要消费人群如何按年龄、性别、收入、婚恋状态和城市层级细分`,
    `${topicCore} 不同消费人群的购买动机、价格敏感度、品牌偏好和隐私需求有什么差异`,
  ]);
  addIf("地区", [
    `${topicCore} 在一线、新一线、低线城市和不同省份/区域的消费差异是什么`,
    `${topicCore} 的地区差异是否可以与人口、收入、教育、医疗资源或婚育指标交叉验证`,
  ]);
  addIf("购买时间段", [
    `${topicCore} 的购买时间段是否存在月份、节假日、工作日/周末、白天/夜间等规律`,
    `${topicCore} 的平台搜索热度、订单时间和线下渠道是否呈现不同时间模式`,
  ]);
  addIf("出生率", [
    `${topicCore} 与出生率、生育率、避孕率、结婚率之间可能有哪些相关性和滞后关系`,
    `${topicCore} 与出生率的关系需要控制哪些混杂变量，例如收入、城市化、婚姻登记和年龄结构`,
  ]);
  addIf("结婚率", [
    `${topicCore} 与结婚率、婚育年龄、同居行为和性健康教育之间有什么可验证关系`,
  ]);
  addIf("渠道与平台", [
    `${topicCore} 在线上电商、即时零售、药店、商超、便利店等渠道的表现有什么差异`,
    `${topicCore} 在淘宝/天猫、京东、美团/即时零售、抖音等平台可以找到哪些公开信号`,
  ]);
  addIf("品牌竞争", [
    `${topicCore} 的主要品牌、价格带、产品类型和市场份额如何分布`,
    `${topicCore} 的国产与国际品牌、普通产品与高端产品有什么差异`,
  ]);
  addIf("数据口径与可验证性", [
    `${topicCore} 哪些结论只有商业报告二手引用，哪些能回到官方、平台或原始数据`,
    `${topicCore} 相关数据是否存在样本偏差、平台偏差、广告软文或不可复现问题`,
  ]);
  addIf("可视化输出", [
    `${topicCore} 最适合用哪些统计图、地图、时间序列图、相关矩阵或分组对比图表达`,
  ]);

  if (taskType === "tool-evaluation") {
    questions.push(
      `${topicCore} 的候选工具如何按功能、格式、价格、部署方式和活跃度分层`,
      `${topicCore} 的真实用户反馈、issue、benchmark 和失败案例分别说明什么`,
    );
  }

  return dedupeStrings(questions);
}

function topicSpecificQueryExpansions(
  topic: string,
  topicCore: string,
  taskType: ResearchTaskType,
  explicitDimensions: string[],
  inferredDimensions: string[],
): ResearchPlanningAgentResult["queryExpansions"] {
  const rows: ResearchPlanningAgentResult["queryExpansions"] = [];
  const topicKeywords = topicKeywordPhrase(topicCore);
  const topicSubject = topicSubjectPhrase(topicCore);
  const add = (text: string, purpose: QueryPurpose, sourceTypes: SourceType[], priority: number) => {
    rows.push({ text, purpose, sourceTypes, priority });
  };

  for (const dimension of dedupeStrings([...explicitDimensions, ...inferredDimensions]).slice(0, 10)) {
    if (dimension === "消费人群" || dimension === "人群细分") {
      add(`${topicKeywords} 消费人群 年龄 性别 收入 用户画像`, "statistical-source", ["dataset", "academic", "mainstream-news"], 91);
    } else if (dimension === "地区") {
      add(`${topicKeywords} 地区 城市 省份 区域 差异`, "statistical-source", ["dataset", "official", "academic"], 90);
    } else if (dimension === "购买时间段") {
      add(`${topicSubject} 电商 销售 时间段 时段 月份`, "statistical-source", ["dataset", "company", "mainstream-news"], 90);
    } else if (dimension === "出生率" || dimension === "人口统计指标") {
      add(`${topicSubject} 出生率 相关性`, "statistical-source", ["official", "structured-api", "academic"], 92);
      add(`${topicSubject} 出生率 生育率 结婚率 年龄结构`, "statistical-source", ["official", "structured-api", "academic"], 87);
    } else if (dimension === "结婚率") {
      add(`${topicSubject} 结婚率 婚育 相关性`, "statistical-source", ["official", "structured-api", "academic"], 88);
    } else if (dimension === "渠道与平台" || dimension === "渠道") {
      add(`${topicSubject} 电商 平台 销售 渠道 药店 便利店`, "overview", ["company", "mainstream-news", "dataset"], 87);
    } else if (dimension === "品牌竞争" || dimension === "品牌/竞品") {
      add(`${topicSubject} 品牌 份额 价格带 竞品`, "overview", ["company", "mainstream-news", "benchmark"], 86);
    } else if (dimension === "数据口径与可验证性" || dimension === "数据源") {
      add(`${topicKeywords} 数据源 统计口径 原始数据 报告`, "dataset-discovery", ["dataset", "data-catalog", "official"], 89);
    } else if (dimension === "可视化输出") {
      add(`${topicKeywords} 可视化 统计图 时间序列 地图 相关性`, "visualization", ["dataset", "benchmark"], 70);
    }
  }

  if (taskType === "competitive") {
    add(`${topicSubject} market size report China`, "overview", ["mainstream-news", "academic", "company"], 84);
    add(`${topicKeywords} 行业报告 市场规模 消费者 调研`, "overview", ["mainstream-news", "academic", "company"], 85);
  }
  if (/[\u4e00-\u9fff]/.test(topic)) {
    add(`${topicSubject} 国家统计局 人口 出生率`, "statistical-source", ["official", "structured-api"], 83);
    add(`${topicKeywords} 艾媒 咨询 行业 报告 消费者`, "overview", ["mainstream-news", "company"], 76);
  }

  return rows;
}

function topicKeywordPhrase(topicCore: string) {
  const normalized = cleanText(topicCore);
  if (!normalized || /\s/.test(normalized) || !/[\u4e00-\u9fff]/.test(normalized)) return normalized;

  const scopeWords = ["中国", "全球", "美国", "欧洲", "日本", "韩国", "东南亚", "国内", "海外"];
  const categoryWords = ["市场", "行业", "工具", "平台", "数据源", "新闻", "比赛", "赛事", "政策", "报告"];
  const parts: string[] = [];
  let rest = normalized;

  for (const scope of scopeWords) {
    if (rest.startsWith(scope)) {
      parts.push(scope);
      rest = rest.slice(scope.length);
      break;
    }
  }

  let suffix = "";
  for (const category of categoryWords) {
    if (rest.endsWith(category) && rest.length > category.length) {
      suffix = category;
      rest = rest.slice(0, -category.length);
      break;
    }
  }

  if (rest) parts.push(rest);
  if (suffix) parts.push(suffix);
  return parts.length > 1 ? parts.join(" ") : normalized;
}

function topicSubjectPhrase(topicCore: string) {
  const parts = topicKeywordPhrase(topicCore).split(/\s+/).filter(Boolean);
  const scopeWords = new Set(["中国", "全球", "美国", "欧洲", "日本", "韩国", "东南亚", "国内", "海外"]);
  const categoryWords = new Set(["市场", "行业", "工具", "平台", "数据源", "新闻", "比赛", "赛事", "政策", "报告"]);
  const subjectParts = parts.filter((part) => !scopeWords.has(part) && !categoryWords.has(part));
  return subjectParts.join(" ") || parts.join(" ") || topicCore;
}

function buildQueries(
  topic: string,
  seedUrls: string[],
  taskType: ResearchTaskType,
  constraints: ResearchConstraints,
  planningAgent: ResearchPlanningAgentResult,
): PlannedQuery[] {
  const builder = createQueryBuilder(buildConstraintSuffix(constraints));

  addOverviewQueries(builder, topic);
  addPlanningAgentQueries(builder, planningAgent);

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

  return builder.list().slice(0, 32);
}

function addPlanningAgentQueries(builder: QueryBuilder, planningAgent: ResearchPlanningAgentResult) {
  for (const expansion of planningAgent.queryExpansions) {
    builder.add(expansion.text, expansion.purpose, expansion.sourceTypes, expansion.priority);
  }
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
  builder.add(`${topic} 行业报告 市场规模`, "overview", ["academic", "mainstream-news"], 90);
  builder.add(`${topic} 消费者 调研 人群画像`, "overview", ["mainstream-news", "benchmark"], 82);
  builder.add(`${topic} 渠道 电商 线下 销售`, "statistical-source", ["company", "dataset", "mainstream-news"], 78);
  builder.add(`${topic} 品牌 份额 竞争格局`, "overview", ["company", "mainstream-news", "benchmark"], 74);
  builder.add(`${topic} 社区讨论 用户反馈`, "community-feedback", ["community"], 64);
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

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    rows.push(normalized);
  }
  return rows;
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
