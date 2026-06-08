import assert from "assert";
import { planAgentDispatch } from "./dispatcher";

function testResearchIntent() {
  const plan = planAgentDispatch({ message: "调研 AI 文档转换工具，抓官网和 GitHub" });
  assert.equal(plan.intent, "research-crawl");
  assert.ok(plan.tasks.find((task) => task.endpoint === "/api/research/jobs"));
}

function testMixedIntent() {
  const plan = planAgentDispatch({ message: "抓取 NBA 比赛数据，做统计分析并画趋势图" });
  assert.equal(plan.intent, "mixed");
  assert.ok(plan.tasks.find((task) => task.intent === "research-crawl"));
  assert.ok(plan.tasks.find((task) => task.id === "create-agent-dataset"));
  assert.ok(plan.tasks.find((task) => task.id === "run-python-statistics"));
  assert.ok(plan.tasks.find((task) => task.id === "render-visualization-artifact"));
}

function testDataRowsPlanCreatesWorkerPipeline() {
  const plan = planAgentDispatch({
    message: "把这些数据做质量检查、统计、回归、聚类、报告并画图",
    dataRows: [
      { source: "Reuters", count: 12 },
      { source: "AP", count: 8 },
    ],
  });

  assert.equal(plan.intent, "mixed");
  assert.deepEqual(plan.tasks.map((task) => task.id), [
    "create-agent-dataset",
    "run-python-quality",
    "run-python-statistics",
    "run-python-regression",
    "run-python-cluster",
    "run-python-report",
    "render-visualization-artifact",
  ]);
}

function testCrosstabIntent() {
  const plan = planAgentDispatch({
    message: "对这些新闻来源和类别做交叉表",
    dataRows: [
      { source: "Reuters", category: "policy", count: 12 },
      { source: "AP", category: "market", count: 8 },
    ],
  });

  assert.equal(plan.intent, "data-analysis");
  assert.ok(plan.tasks.find((task) => task.id === "run-python-crosstab"));
}

function testTransformationIntent() {
  const plan = planAgentDispatch({
    message: "对比赛数据做 groupby 聚合、pivot 透视、rolling 滚动统计，并识别 join key",
    dataRows: [
      { team: "A", season: "2026", score: 12, date: "2026-01-01" },
      { team: "B", season: "2026", score: 8, date: "2026-01-02" },
    ],
  });

  assert.equal(plan.intent, "data-analysis");
  assert.ok(plan.tasks.find((task) => task.id === "run-python-transform"));
}

function testAdvancedAnalyticsIntent() {
  const plan = planAgentDispatch({
    message: "请做 SPSS 级统计检验、卡方、ANOVA、逻辑回归、PCA、异常检测、时间序列、新闻聚类、文本主题、地理图、论文图和 PDF DOCX 报告",
    dataRows: [
      { title: "A", group: "x", y: 1, date: "2026-01-01", lat: 31, lon: 121 },
      { title: "B", group: "y", y: 2, date: "2026-01-02", lat: 32, lon: 122 },
    ],
  });

  const ids = plan.tasks.map((task) => task.id);
  assert.ok(ids.includes("run-python-statistical-tests"));
  assert.ok(ids.includes("run-python-logistic-regression"));
  assert.ok(ids.includes("run-python-dimensionality"));
  assert.ok(ids.includes("run-python-anomaly"));
  assert.ok(ids.includes("run-python-timeseries"));
  assert.ok(ids.includes("run-python-news-organization"));
  assert.ok(ids.includes("run-python-text-analysis"));
  assert.ok(ids.includes("run-python-geo"));
  assert.ok(ids.includes("run-python-publication-chart"));
  assert.ok(ids.includes("run-python-export-report"));
}

function testDeepLearningIntent() {
  const plan = planAgentDispatch({
    message: "对文本做 PyTorch 深度学习、embedding 和 transformers 分类",
    dataRows: [
      { text: "policy update", label: "yes", x: 1 },
      { text: "market reaction", label: "no", x: 2 },
    ],
  });

  const ids = plan.tasks.map((task) => task.id);
  assert.ok(ids.includes("run-python-text-analysis"));
  assert.ok(ids.includes("run-python-deep-learning"));
}

function testPlanOnlyForUnknown() {
  const plan = planAgentDispatch({ message: "你好" });
  assert.equal(plan.intent, "unknown");
  assert.equal(plan.tasks[0].endpoint, "/api/agent/capabilities");
}

testResearchIntent();
testMixedIntent();
testDataRowsPlanCreatesWorkerPipeline();
testCrosstabIntent();
testTransformationIntent();
testAdvancedAnalyticsIntent();
testDeepLearningIntent();
testPlanOnlyForUnknown();

console.log("agent tests passed");
