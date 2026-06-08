import { normalizeResearchBudget } from "../research/budget";
import { AnalyticsJobKind } from "../analytics/types";
import { AgentDispatchInput, AgentDispatchPlan, AgentIntent } from "./types";

export function planAgentDispatch(input: AgentDispatchInput): AgentDispatchPlan {
  const message = String(input.message ?? "").trim();
  const signals = inferIntentSignals(message);
  const intent = signals.intent;
  const warnings: string[] = [];
  if (!message) warnings.push("请输入要研究、爬取、分析或可视化的需求。");
  const hasRows = Array.isArray(input.dataRows) && input.dataRows.length > 0;

  const tasks = [];
  if (signals.wantsCrawl) {
    tasks.push({
      id: "create-research-run",
      intent: "research-crawl" as const,
      title: "创建深度研究爬虫任务",
      description: "按主题、范围、时间和种子 URL 创建 Research job，并交给后台 worker 调度 discovery/frontier/fetch/extract/analyze/report。",
      method: "POST" as const,
      endpoint: "/api/research/jobs",
      body: {
        topic: message,
        seedUrls: input.seedUrls ?? extractUrls(message),
        budget: normalizeResearchBudget(input.budget),
      },
    });
  }

  if (signals.wantsData) {
    const analysisKinds = plannedAnalysisKinds(message);
    tasks.push({
      id: "create-agent-dataset",
      intent: "data-analysis" as const,
      title: "创建 Data Lab 数据资产",
      description: hasRows
        ? "把用户提供的数据行保存为可追踪的数据资产，供 Python worker、统计分析和图表渲染复用。"
        : "若用户稍后提供数据或 Research run 导出数据，则先进入 Data Lab 数据资产流程。",
      method: "POST" as const,
      endpoint: "/api/analytics/datasets",
      body: {
        name: `Agent dataset: ${message.slice(0, 80)}`,
        rows: input.dataRows ?? [],
        sourceKind: "manual",
        metadata: { createdBy: "agent", sourceRequest: message },
      },
    });
    tasks.push(...analysisKinds.map((kind) => analysisTaskForKind(kind)));
  }

  if (signals.wantsViz) {
    tasks.push({
      id: "render-visualization-artifact",
      intent: "visualization" as const,
      title: "生成可复现图表资产",
      description: "根据数据画像选择图表建议，渲染 VisualizationSpec，并保存图表规格、导出格式、数据 lineage 和可复现代码。",
      method: "POST" as const,
      endpoint: "/api/analytics/visualizations/render",
      body: {
        datasetId: ":datasetId",
        title: message,
      },
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      id: "show-capabilities",
      intent: "unknown" as const,
      title: "展示系统能力",
      description: "展示当前可用的爬虫、数据处理、统计分析和可视化能力入口。",
      method: "GET" as const,
      endpoint: "/api/agent/capabilities",
    });
  }

  return {
    intent,
    answer: answerForIntent(intent),
    tasks,
    warnings,
  };
}

function plannedAnalysisKinds(message: string): AnalyticsJobKind[] {
  const lower = message.toLowerCase();
  const kinds: AnalyticsJobKind[] = [];
  const add = (kind: AnalyticsJobKind) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };

  if (/画像|profile|schema/.test(lower)) add("profile");
  if (/质量|缺失|校验|quality|missing/.test(lower)) add("quality-report");
  if (/清洗|lineage|口径|单位|clean|recipe/.test(lower)) add("data-cleaning");
  if (/转换|聚合|分组|透视|滚动|合并|join|groupby|group.?by|pivot|rolling|transform/.test(lower)) add("data-transformation");
  if (/频数|频率|frequency|freq/.test(lower)) add("frequency-tables");
  if (/统计|描述|相关|均值|中位数|方差|spss|statistics|stats|correlation|mean|median/.test(lower)) add("descriptive-statistics");
  if (/交叉表|列联|透视|crosstab|cross.?tab|pivot/.test(lower)) add("crosstab");
  if (/统计检验|显著|t.?检验|卡方|chi|anova|非参数|kruskal|test/.test(lower)) add("statistical-tests");
  if (/回归|拟合|预测关系|regression|linear/.test(lower)) add("linear-regression");
  if (/逻辑回归|logistic/.test(lower)) add("logistic-regression");
  if (/泊松|poisson/.test(lower)) add("poisson-regression");
  if (/pca|因子|factor|降维|dimension/.test(lower)) add("dimensionality-reduction");
  if (/分类|聚类|分群|cluster|classification|segment/.test(lower)) add("cluster-analysis");
  if (/异常|离群|outlier|anomaly/.test(lower)) add("anomaly-detection");
  if (/时间序列|滚动|趋势|timeline|time.?series|rolling/.test(lower)) add("time-series-analysis");
  if (/新闻整理|新闻聚类|story|来源分层|冲突|实体|news/.test(lower)) add("news-organization");
  if (/文本|主题|embedding|语义|topic|text/.test(lower)) add("text-analysis");
  if (/解释|shap|特征重要|explain|importance/.test(lower)) add("model-explanation");
  if (/深度学习|pytorch|torch|transformers|sentence.?transformers|神经网络|deep.?learning|deepml/.test(lower)) add("deep-learning-analysis");
  if (/地理|地图|geo|lat|lon|经纬/.test(lower)) add("geospatial-analysis");
  if (/论文图|出版|高分辨率|svg|pdf图|publication/.test(lower)) add("publication-chart");
  if (/报告|解释|总结|论文|report|summary|paper/.test(lower)) add("report-draft");
  if (/导出|docx|pdf|pptx|word|export/.test(lower)) add("export-report");

  if (kinds.length === 0) {
    add("quality-report");
    add("descriptive-statistics");
  }
  return kinds;
}

function analysisTaskForKind(kind: AnalyticsJobKind) {
  const metadata: Record<AnalyticsJobKind, { id: string; title: string; description: string }> = {
    "profile": {
      id: "run-python-profile",
      title: "运行 Python worker 数据画像",
      description: "生成字段类型、缺失率、唯一值、范围和数据质量概览。",
    },
    "descriptive-statistics": {
      id: "run-python-statistics",
      title: "运行 Python worker 描述统计",
      description: "输出描述统计、相关矩阵和可保存 artifact。",
    },
    "quality-report": {
      id: "run-python-quality",
      title: "运行 Python worker 数据质量检查",
      description: "检查缺失值、重复行、混合类型和字段级质量分。",
    },
    "frequency-tables": {
      id: "run-python-frequency",
      title: "运行 Python worker 频数表",
      description: "对分类字段生成频数、百分比和分布表。",
    },
    "crosstab": {
      id: "run-python-crosstab",
      title: "运行 Python worker 交叉表",
      description: "对分类字段生成交叉表，支持新闻来源、类别、标签和状态分布分析。",
    },
    "statistical-tests": {
      id: "run-python-statistical-tests",
      title: "运行 SPSS 级统计检验",
      description: "运行 Welch t 检验、卡方检验、ANOVA、Kruskal-Wallis 和 Spearman 相关。",
    },
    "linear-regression": {
      id: "run-python-regression",
      title: "运行 Python worker 线性回归",
      description: "用数值字段拟合轻量线性回归模型，输出系数、R 方和残差摘要。",
    },
    "logistic-regression": {
      id: "run-python-logistic-regression",
      title: "运行逻辑回归",
      description: "识别二分类目标并输出逻辑回归系数、准确率和可解释摘要。",
    },
    "poisson-regression": {
      id: "run-python-poisson-regression",
      title: "运行泊松回归",
      description: "对计数型目标拟合 Poisson GLM，输出系数、AIC 和偏差。",
    },
    "dimensionality-reduction": {
      id: "run-python-dimensionality",
      title: "运行 PCA / 因子分析",
      description: "对数值字段做 PCA、因子分析、载荷解释和降维分数预览。",
    },
    "cluster-analysis": {
      id: "run-python-cluster",
      title: "运行 Python worker 聚类分析",
      description: "用数值字段进行轻量 KMeans 聚类，输出簇大小、中心点和样本分配。",
    },
    "anomaly-detection": {
      id: "run-python-anomaly",
      title: "运行异常检测",
      description: "用 z-score 和 IsolationForest 检测离群记录，输出原因、分数和样本值。",
    },
    "time-series-analysis": {
      id: "run-python-timeseries",
      title: "运行时间序列分析",
      description: "识别日期字段和数值字段，输出趋势、滚动均值和自相关。",
    },
    "data-transformation": {
      id: "run-python-transform",
      title: "运行数据转换",
      description: "执行 groupby、pivot、rolling 统计和 join key 识别，输出转换 lineage 和可复现 Pandas 代码。",
    },
    "data-cleaning": {
      id: "run-python-cleaning",
      title: "生成清洗方案和 lineage",
      description: "执行去重、缺失值填补、单位口径提示，并返回清洗后预览与转换链路。",
    },
    "news-organization": {
      id: "run-python-news-organization",
      title: "运行新闻整理与 story clustering",
      description: "对新闻标题、正文、来源和时间做去重、聚类、来源分层、实体和冲突信号整理。",
    },
    "text-analysis": {
      id: "run-python-text-analysis",
      title: "运行文本主题与 embedding 分析",
      description: "用 TF-IDF 生成关键词、主题簇和可升级到 PyTorch/Transformers 的语义分析结果。",
    },
    "model-explanation": {
      id: "run-python-model-explanation",
      title: "运行模型解释",
      description: "输出特征重要性、方向和 SHAP 可升级说明。",
    },
    "deep-learning-analysis": {
      id: "run-python-deep-learning",
      title: "运行 PyTorch / embedding 深度分析",
      description: "检查 PyTorch/Transformers 可用性，输出 TF-IDF embedding、文本聚类、监督基线和深度模型升级路径。",
    },
    "geospatial-analysis": {
      id: "run-python-geo",
      title: "运行地理数据分析",
      description: "识别经纬度字段，输出 bbox、点位 GeoJSON 和地图可视化输入。",
    },
    "publication-chart": {
      id: "run-python-publication-chart",
      title: "生成论文级图表",
      description: "调用 Matplotlib 生成 PNG、SVG、PDF 图表资产和可复现代码。",
    },
    "report-draft": {
      id: "run-python-report",
      title: "生成中文分析报告草稿",
      description: "基于数据画像、描述统计和质量检查生成简体中文 Markdown 报告草稿。",
    },
    "export-report": {
      id: "run-python-export-report",
      title: "导出正式报告",
      description: "生成 Markdown、HTML、DOCX、PDF 和 JSON 报告资产，优先使用本机 Codex 文档工具链。",
    },
    "visualization-render": {
      id: "render-visualization-artifact",
      title: "生成可复现图表资产",
      description: "根据数据画像选择图表建议，渲染 VisualizationSpec。",
    },
  };
  const item = metadata[kind];
  return {
    id: item.id,
    intent: "data-analysis" as const,
    title: item.title,
    description: item.description,
    method: "POST" as const,
    endpoint: "/api/analytics/datasets/:datasetId/analyze",
    body: { kind },
  };
}

function inferIntent(message: string): AgentIntent {
  return inferIntentSignals(message).intent;
}

function inferIntentSignals(message: string) {
  const lower = message.toLowerCase();
  const explicitCrawl = /爬|抓|搜索|调研|研究|监控|网页|crawl|scrape|research|search/.test(lower);
  const sourceResearch = /(新闻|source|来源).*(爬|抓|搜索|调研|研究|监控|crawl|scrape|research|search)/.test(lower);
  const wantsCrawl = explicitCrawl || sourceResearch;
  const wantsData = /数据|统计|清洗|分类|聚类|回归|质量|缺失|异常|交叉表|列联|透视|类别|spss|pytorch|numpy|pandas|dataset|csv|excel|analysis|analyze|model|quality|crosstab|pivot|regression|cluster/.test(lower);
  const wantsViz = /图|可视化|画|制图|论文图|工程图|chart|plot|visual|dashboard|map|graph/.test(lower);

  const count = [wantsCrawl, wantsData, wantsViz].filter(Boolean).length;
  const intent: AgentIntent = count > 1
    ? "mixed"
    : wantsCrawl
      ? "research-crawl"
      : wantsData
        ? "data-analysis"
        : wantsViz
          ? "visualization"
          : "unknown";
  return { intent, wantsCrawl, wantsData, wantsViz };
}

function answerForIntent(intent: AgentIntent) {
  switch (intent) {
    case "research-crawl":
      return "我会把这个需求分配给深度研究爬虫：先规划查询，再调用搜索/新闻/数据源 provider，之后进入 frontier、抓取、抽取、证据和报告流程。";
    case "data-analysis":
      return "我会把这个需求分配给数据处理能力：先做 schema 和质量画像，再进入统计分析、建模或报告生成。";
    case "visualization":
      return "我会把这个需求分配给可视化能力：先判断可用字段，再推荐论文图、统计图、工程图或交互式图表。";
    case "mixed":
      return "这是一个复合任务：我会同时规划爬虫、数据处理和可视化步骤，并让每个步骤调用对应系统能力。";
    default:
      return "我还不确定应该调用哪个能力，会先展示可用能力入口。";
  }
}

function extractUrls(value: string) {
  return value.match(/https?:\/\/[^\s，,]+/g) ?? [];
}
