import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const appPort = Number(process.env.UI_SMOKE_FRONTEND_PORT || 3300);
const apiPort = Number(process.env.UI_SMOKE_BACKEND_PORT || 3301);
const appUrl = process.env.UI_SMOKE_URL || `http://localhost:${appPort}`;
const apiUrl = process.env.UI_SMOKE_API_URL || `http://localhost:${apiPort}`;
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDir = path.resolve(process.cwd(), "tmp", "ui-smoke");

mkdirSync(outputDir, { recursive: true });

const backendProcess = await ensureBackend();
const frontendProcess = await ensureFrontend();
const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
});

try {
  await checkEnglishToggle();
  await checkAgentConsole();
  await checkNewsCrawlerRssSources({ width: 1440, height: 1100, name: "desktop" });
  await checkNewsCrawlerRssSources({ width: 390, height: 900, name: "mobile" });
  await checkDataLab({ width: 1440, height: 1100, name: "desktop" });
  await checkDataLab({ width: 390, height: 900, name: "mobile" });
  await checkDataLabChartPreview();
  await checkResearchPanelResponsive({ width: 1440, height: 1100, name: "desktop" });
  await checkResearchPanelResponsive({ width: 390, height: 900, name: "mobile" });
  console.log("ui smoke passed");
} finally {
  await browser.close();
  if (frontendProcess) {
    frontendProcess.kill("SIGTERM");
  }
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
  }
}

async function ensureBackend() {
  const child = spawn("npm", ["run", "dev:backend"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BACKEND_PORT: String(apiPort),
      DATABASE_URL: "",
      REDIS_URL: "",
      ANALYTICS_ALLOW_LOCAL_FALLBACK: "true",
      ANALYTICS_USE_DOC_TOOLS: "false",
    },
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[ui-smoke backend] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[ui-smoke backend] ${chunk}`));
  await waitForUrl(`${apiUrl}/api/health`, 30000, "backend");
  return child;
}

async function ensureFrontend() {
  const child = spawn("npm", ["run", "dev:frontend"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FRONTEND_PORT: String(appPort),
      VITE_API_PROXY_TARGET: apiUrl,
      DISABLE_HMR: "true",
    },
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[ui-smoke frontend] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[ui-smoke frontend] ${chunk}`));
  await waitForUrl(appUrl, 30000, "frontend");
  return child;
}

async function canReach(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs, label = "service") {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canReach(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not start within ${timeoutMs}ms: ${url}`);
}

async function checkEnglishToggle() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await forceLanguage(page, "zh");
    await installRssRouteMocks(page);
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "English" }).click();
    await page.getByText("One workbench for deep research", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Agent Console" }).first().click();
    await page.getByText("Natural language router", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Data Lab" }).first().click();
    await page.getByText("Research data factory", { exact: false }).first().waitFor({ timeout: 5000 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText,
    }));
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      throw new Error(`english toggle has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    }
    if (!metrics.text.includes("Close the loop for multi-source import")) {
      throw new Error("english UI did not render Data Lab hero copy");
    }
    await page.screenshot({
      path: path.join(outputDir, "english-toggle.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

async function checkAgentConsole() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await forceLanguage(page, "zh");
    await installRssRouteMocks(page);
    await page.route(`${appUrl}/api/agent/dispatch`, async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          plan: {
            answer: "已规划深度研究和数据可视化任务。",
            tasks: [
              {
                id: "research-crawl",
                intent: "research-crawl",
                title: "深度研究抓取",
                description: "搜索主流网页、官方来源、GitHub 和数据源。",
                method: "POST",
                endpoint: "/api/research/jobs/:id/runs",
                body: {},
              },
              {
                id: "render-visualization-artifact",
                intent: "visualization",
                title: "生成可视化资产",
                description: "把抓取到的数据转换成统计图和报告资产。",
                method: "POST",
                endpoint: "/api/analytics/datasets/:datasetId/visualizations/render",
                body: {},
              },
            ],
          },
          executed: false,
        }),
      });
    });
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Agent 调度/ }).first().click();
    await page.getByText("自然语言入口", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("textbox").first().fill("调研好用的文档转换工具，并生成数据可视化报告");
    await page.getByRole("button", { name: "只规划", exact: true }).click();
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page.getByText("深度研究抓取", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("生成可视化资产", { exact: false }).first().waitFor({ timeout: 10000 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText,
    }));
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      throw new Error(`agent console has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    }
    for (const text of ["Agent 调度台", "任务计划", "执行结果"]) {
      if (!metrics.text.includes(text)) {
        throw new Error(`agent console missing ${text}`);
      }
    }
    await page.screenshot({
      path: path.join(outputDir, "agent-console.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

async function checkNewsCrawlerRssSources({ width, height, name }) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await forceLanguage(page, "zh");
    await installRssRouteMocks(page);
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /RSS 监控/ }).first().click();
    await page.getByText("RSS 来源", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByPlaceholder("来源名称").fill(`Smoke ${name}`);
    await page.getByPlaceholder("https://example.com/feed.xml").fill(`https://example.com/${name}.xml`);
    await page.getByRole("button", { name: /添加来源/ }).click();
    await page.getByText("来源已添加", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "刷新来源" }).first().click();
    await page.getByText("新增 2 条内容", { exact: false }).first().waitFor({ timeout: 5000 });
    await waitForVisibleText(page, "Smoke RSS Source", 5000);
    await page.getByText("RSS smoke article", { exact: false }).first().waitFor({ timeout: 5000 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText,
    }));
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      throw new Error(`news crawler ${name} has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    }
    for (const text of ["RSS 来源", "实时新闻", "RSS smoke article"]) {
      if (!metrics.text.includes(text)) {
        throw new Error(`news crawler ${name} missing ${text}`);
      }
    }
    await page.screenshot({
      path: path.join(outputDir, `news-rss-${name}.png`),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

async function checkResearchPanelResponsive({ width, height, name }) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await forceLanguage(page, "zh");
    await installRssRouteMocks(page);
    await installResearchRouteMocks(page);
    await installDataLabOperationRouteMocks(page);
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /研究任务/ }).first().click();
    await page.getByText("文档转换工具深度研究 smoke", { exact: false }).first().waitFor({ timeout: 10000 });
    const main = page.locator("main");
    const openResearchTab = async (tab) => {
      await main.getByRole("button", { name: new RegExp(`^${escapeRegExp(tab)}`) }).first().click();
    };
    for (const tab of ["总览", "查询计划", "来源浏览", "Frontier", "证据", "报告", "诊断"]) {
      await main.getByRole("button", { name: new RegExp(`^${escapeRegExp(tab)}`) }).first().waitFor({ timeout: 10000 });
    }
    await page.getByText("Run 时间线", { exact: false }).first().waitFor({ timeout: 10000 });
    for (const text of ["当前流水线", "阶段进度", "事件流", "按时间展示真实 run_events"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} timeline missing ${text}`);
      });
    }
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      throw new Error(`research ${name} has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    }

    await openResearchTab("诊断");
    for (const text of ["运行监控", "队列健康", "Provider 健康", "research.fetch", "能力验收台", "最近验收证据", "Postgres", "Redis/BullMQ", "搜索 Provider", "数据 Provider", "sports", "能力目标 / Deep", "URL 预算", "Env 配置清单", "BRAVE_API_KEY", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "Extractor 逐类型样本", "structured-data", "增强抓取 smoke", "兼容 API 验收", "/api/datasets/:id/validate", "导出产物验收", "pptx", "Agent Console", "自然语言调度", "provider_live_smoke:passed", "data_source_live_smoke:passed"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} diagnostics missing ${text}`);
      });
    }
    await page.getByRole("button", { name: "运行 Provider smoke" }).click();
    await page.getByText("https://pandoc.org/", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "运行数据源 smoke" }).click();
    await page.getByText("https://catalog.data.gov/dataset/document-benchmark.csv", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "运行 Deep 压测" }).click();
    await page.getByText("能力目标 / Deep", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByText("URL 预算", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByText("500", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "运行新闻溯源样本" }).click();
    await page.getByText("新闻样本文档进入整理链路", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "运行数据处理样本" }).click();
    await page.getByText("Schema 和质量画像可生成", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "运行增强抓取 smoke" }).click();
    await page.getByText("browser-fallback", { exact: false }).first().waitFor({ timeout: 5000 });

    await openResearchTab("查询计划");
    for (const text of ["查询计划", "运行干预", "追加查询", "重试失败项"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} plan missing ${text}`);
      });
    }
    await page.getByPlaceholder("追加新的研究方向、子问题或检索式").fill("Pandoc 与 LibreOffice 的转换质量对比");
    await page.getByRole("button", { name: "追加查询" }).click();
    await page.getByText("新的查询方向已追加", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "重试失败项" }).click();
    await page.getByText("失败项已重新排队", { exact: false }).first().waitFor({ timeout: 5000 });

    await openResearchTab("来源浏览");
    for (const text of ["来源浏览器", "来源筛选", "错误聚合", "fetch_failed: 403 blocked smoke", "查看引用来源", "读取路径", "诊断结果", "fetcher:http", "发现外链", "格式文档", "已入队", "抽取表格", "工具对比", "文档检索"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} sources missing ${text}`);
      });
    }
    await page.getByRole("combobox", { name: "Claim 反查" }).selectOption("smoke-conflict-claim");
    await page.getByText("Blocked benchmark mirror", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("combobox", { name: "排序" }).selectOption("errors");
    await page.getByText("fetch_failed: 403 blocked smoke", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByPlaceholder(/搜索当前 run/).fill("Pandoc");
    await page.getByRole("button", { name: "检索文档" }).click();
    await page.getByText("检索命中：Pandoc 官方正文", { exact: false }).first().waitFor({ timeout: 5000 });

    await openResearchTab("报告");
    for (const text of ["新闻分析", "新闻聚类", "事件时间线", "来源质量", "研究摘要", "证据质量门通过"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} report missing ${text}`);
      });
    }
    await page.getByRole("button", { name: /新闻聚类/ }).click();
    await page.getByText("Pandoc 工具对比聚类", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: /事件时间线/ }).click();
    await page.getByText("Pandoc 官方资料纳入", { exact: false }).first().waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: /来源质量/ }).click();
    await page.getByText("pandoc.org", { exact: false }).first().waitFor({ timeout: 5000 });

    await openResearchTab("证据");
    for (const text of ["证据质量总览", "可信度分布", "旧版模板", "结论索引", "证据表", "证据图谱", "证据摘要", "结论节点", "证据节点", "来源节点", "支持关系", "Pandoc"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} evidence missing ${text}`);
      });
    }

    await openResearchTab("Frontier");
    for (const text of ["Frontier 视图", "评分解释", "主题相关", "来源权威", "原始来源", "新鲜度", "来源多样性", "上下文质量", "权重", "Provider 面板", "数据源覆盖", "生成 Data Lab 数据源清单", "data-catalog", "structured-api", "competition-data"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {
        throw new Error(`research ${name} frontier missing ${text}`);
      });
    }
    await page.getByRole("button", { name: /生成 Data Lab 数据源清单/ }).click();
    await page.getByText("数据源资产清单", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("已定位 Research 数据源上下文", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("Research smoke 数据源资产清单", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("smoke-run", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /回到 Research run/ }).click();
    await page.getByText("Run 时间线", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.screenshot({
      path: path.join(outputDir, `research-${name}.png`),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

async function installResearchRouteMocks(page) {
  const createdAt = "2026-06-08T00:00:00.000Z";
  const job = {
    id: "smoke-job",
    topic: "文档转换工具深度研究 smoke",
    seedUrls: ["https://pandoc.org"],
    status: "active",
    budget: {
      maxDepth: 2,
      maxUrlsPerRun: 150,
      maxDomainsPerRun: 40,
      runIntervalMinutes: 1440,
    },
    constraints: {
      contentTypes: ["html", "pdf", "dataset"],
      sourceScope: { sourceTypes: ["official", "github", "package-registry"] },
      languages: ["zh", "en"],
    },
    queryPlan: ["Pandoc official documentation", "document converter benchmark GitHub npm PyPI"],
    createdAt,
    updatedAt: createdAt,
  };
  const run = {
    id: "smoke-run",
    jobId: job.id,
    status: "completed",
    stage: "completed",
    budget: job.budget,
    startedAt: createdAt,
    finishedAt: "2026-06-08T00:05:00.000Z",
    createdAt,
    updatedAt: "2026-06-08T00:05:00.000Z",
  };
  const plan = {
    taskType: "tool-evaluation",
    topic: job.topic,
    normalizedTopic: "文档转换工具深度研究 smoke",
    subQuestions: ["候选工具有哪些", "官方能力和格式覆盖是什么", "社区与包管理器活跃度如何"],
    languages: ["zh", "en"],
    freshness: "mixed",
    requiredSourceTypes: ["official", "github", "package-registry", "benchmark"],
    queries: [
      {
        id: "query-1",
        text: "Pandoc official documentation supported formats",
        purpose: "official-source",
        sourceTypes: ["official", "technical-doc"],
        language: "en",
        priority: 95,
      },
      {
        id: "query-2",
        text: "文档转换工具 GitHub npm PyPI benchmark",
        purpose: "benchmark",
        sourceTypes: ["github", "package-registry", "benchmark"],
        language: "zh",
        priority: 88,
      },
    ],
    budget: job.budget,
    stopConditions: ["达到 Standard URL 预算", "主要来源类型均已覆盖"],
    constraints: job.constraints,
  };
  const documents = [
    {
      id: "smoke-doc",
      jobId: job.id,
      runId: run.id,
      url: "https://pandoc.org/",
      canonicalUrl: "https://pandoc.org/",
      finalUrl: "https://pandoc.org/",
      title: "Pandoc - a universal document converter",
      domain: "pandoc.org",
      contentText: "Pandoc supports Markdown, DOCX, PDF, HTML and many other formats. This original text stays in source language.",
      status: "fetched",
      fetchedAt: createdAt,
      memoryStatus: "fresh",
      metadata: {
        readerPath: "http",
        fetcher: "http",
        contentType: "text/html; charset=utf-8",
        statusCode: 200,
        durationMs: 128,
        fallbackUsed: false,
        extractor: "html",
        diagnostics: ["fetcher:http", "status:200", "content_extracted"],
      },
    },
    {
      id: "smoke-doc-failed",
      jobId: job.id,
      runId: run.id,
      url: "https://example.invalid/paywalled-report",
      canonicalUrl: "https://example.invalid/paywalled-report",
      finalUrl: "https://example.invalid/paywalled-report",
      title: "Blocked benchmark mirror",
      domain: "example.invalid",
      contentText: "",
      status: "failed",
      error: "fetch_failed: 403 blocked smoke",
      fetchedAt: createdAt,
      memoryStatus: "stale",
      metadata: {
        readerPath: "http",
        fetcher: "http",
        contentType: "text/html",
        statusCode: 403,
        durationMs: 82,
        fallbackUsed: true,
        extractor: "html",
        diagnostics: ["fetcher:http", "status:403", "browser_fallback_skipped"],
      },
    },
  ];
  const evidence = [
    {
      id: "smoke-evidence",
      jobId: job.id,
      runId: run.id,
      documentId: "smoke-doc",
      claimId: "smoke-claim",
      sourceUrl: "https://pandoc.org/",
      quote: "universal document converter",
      snippet: "Pandoc is a universal document converter with broad format support.",
      explanation: "官方页面说明其转换能力。",
      relevanceScore: 0.94,
      credibilityScore: 0.92,
      supportsClaim: true,
      contradictsClaim: false,
      entities: ["Pandoc"],
      createdAt,
    },
    {
      id: "smoke-conflict-evidence",
      jobId: job.id,
      runId: run.id,
      documentId: "smoke-doc-failed",
      claimId: "smoke-conflict-claim",
      sourceUrl: "https://example.invalid/paywalled-report",
      quote: "format support is limited",
      snippet: "A blocked mirror claims format support is limited, but the page could not be verified.",
      explanation: "失败来源提供了待复核反向线索。",
      relevanceScore: 0.48,
      credibilityScore: 0.12,
      supportsClaim: false,
      contradictsClaim: true,
      entities: ["Pandoc"],
      createdAt,
    },
  ];
  const claims = [
    {
      id: "smoke-claim",
      jobId: job.id,
      runId: run.id,
      claim: "Pandoc 是文档转换工具调研中的核心官方来源之一。",
      normalizedClaim: "pandoc official source",
      status: "supported",
      confidence: 0.9,
      supportingEvidenceIds: ["smoke-evidence"],
      conflictingEvidenceIds: [],
      primarySourceUrl: "https://pandoc.org/",
      createdAt,
    },
    {
      id: "smoke-conflict-claim",
      jobId: job.id,
      runId: run.id,
      claim: "存在一条低可信来源声称 Pandoc 格式支持有限。",
      normalizedClaim: "pandoc limited support conflict",
      status: "contradicted",
      confidence: 0.54,
      supportingEvidenceIds: [],
      conflictingEvidenceIds: ["smoke-conflict-evidence"],
      primarySourceUrl: "https://example.invalid/paywalled-report",
      createdAt,
    },
  ];
  const relations = [
    {
      id: "relation-1",
      claimId: "smoke-claim",
      evidenceId: "smoke-evidence",
      relation: "supports",
      confidence: 0.9,
      createdAt,
    },
    {
      id: "relation-2",
      claimId: "smoke-conflict-claim",
      evidenceId: "smoke-conflict-evidence",
      relation: "contradicts",
      confidence: 0.54,
      createdAt,
    },
  ];
  const links = [
    {
      id: "link-1",
      jobId: job.id,
      runId: run.id,
      documentId: "smoke-doc",
      url: "https://pandoc.org/MANUAL.html",
      text: "格式文档",
      context: "Pandoc 官方页面指向完整手册。",
      enqueued: true,
      createdAt,
    },
    {
      id: "link-2",
      jobId: job.id,
      runId: run.id,
      documentId: "smoke-doc",
      url: "https://github.com/jgm/pandoc",
      text: "GitHub repository",
      context: "源码仓库和 release 活跃度。",
      enqueued: false,
      createdAt,
    },
  ];
  const newsAnalysisResult = (endpoint) => ({
    endpoint,
    runId: run.id,
    documentCount: 2,
    duplicateCount: 1,
    clusters: [
      {
        id: "story-1",
        canonicalTitle: "Pandoc 工具对比聚类",
        documents: [
          {
            index: 0,
            title: "Pandoc - a universal document converter",
            url: "https://pandoc.org/",
            source: "pandoc.org",
            date: createdAt,
            sourceTier: "T1",
          },
          {
            index: 1,
            title: "jgm/pandoc GitHub repository",
            url: "https://github.com/jgm/pandoc",
            source: "github.com",
            date: createdAt,
            sourceTier: "T2",
          },
        ],
        sourceCount: 2,
        entityHints: ["Pandoc", "LibreOffice", "DOCX"],
      },
    ],
    timeline: [
      {
        date: "2026-06-08T00:00:00.000Z",
        title: "Pandoc 官方资料纳入",
        source: "pandoc.org",
        url: "https://pandoc.org/",
        clusterId: "story-1",
      },
    ],
    sourceProfiles: [
      {
        source: "pandoc.org",
        domain: "pandoc.org",
        documentCount: 1,
        tier: "T1",
        mainstreamLikelihood: 0.72,
        officialLikelihood: 0.95,
      },
      {
        source: "github.com",
        domain: "github.com",
        documentCount: 1,
        tier: "T2",
        mainstreamLikelihood: 0.65,
        officialLikelihood: 0.62,
      },
    ],
    dataset: {
      id: `dataset-${endpoint}`,
      name: `Research smoke ${endpoint}`,
      sourceKind: "research-run",
      rowCount: 2,
      columnCount: 6,
      sampleRows: [],
      metadata: {
        runId: run.id,
        analysisEndpoint: `/api/news-analysis/runs/:runId/${endpoint}`,
      },
      createdAt,
      updatedAt: createdAt,
    },
    job: {
      id: `job-${endpoint}`,
      datasetId: `dataset-${endpoint}`,
      kind: "news-organization",
      status: "completed",
      engine: "python-worker",
      startedAt: createdAt,
      finishedAt: createdAt,
      result: {},
      createdAt,
      updatedAt: createdAt,
    },
    artifact: {
      id: `artifact-${endpoint}`,
      datasetId: `dataset-${endpoint}`,
      jobId: `job-${endpoint}`,
      artifactType: "news-organization",
      title: `Research smoke ${endpoint}`,
      payload: {},
      createdAt,
    },
  });

  const routes = new Map([
    [`${appUrl}/api/research/jobs`, [job]],
    [`${appUrl}/api/research/queues`, {
      names: [
        "research.discovery",
        "research.frontier",
        "research.fetch",
        "research.extract",
        "research.analyze",
        "research.report",
      ],
      discovery: { waiting: 1, active: 0, delayed: 0, failed: 0, completed: 2 },
      frontier: { waiting: 0, active: 1, delayed: 0, failed: 0, completed: 1 },
      fetch: { waiting: 2, active: 1, delayed: 0, failed: 1, completed: 5 },
      extract: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 4 },
      analyze: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 3 },
      report: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 1 },
    }],
    [`${appUrl}/api/research/providers/health`, {
      providers: [
        {
          provider: "brave",
          calls: 3,
          errors: 0,
          candidateCount: 18,
          durationMs: 1260,
          averageDurationMs: 420,
        },
        {
          provider: "github",
          calls: 2,
          errors: 1,
          candidateCount: 5,
          durationMs: 1020,
          averageDurationMs: 510,
          lastError: "rate limit sample",
        },
      ],
    }],
    [`${appUrl}/api/research/capabilities`, {
      generatedAt: createdAt,
      storage: { ready: true, label: "Postgres", detail: "DATABASE_URL 已配置，Research 存储可用。" },
      queue: { ready: true, label: "Redis/BullMQ", detail: "REDIS_URL 已配置，worker 队列可用。" },
      searchProviders: [
        { name: "brave", category: "search", configured: true, requiredFor100: true, coverage: "needs-live-smoke", detail: "Brave Search API，主力通用网页发现。" },
        { name: "serpapi", category: "search", configured: false, requiredFor100: true, coverage: "missing-key", detail: "SerpApi Google 结果补充。" },
        { name: "tavily", category: "search", configured: true, requiredFor100: true, coverage: "needs-live-smoke", detail: "Tavily 深度检索补充。" },
      ],
      dataProviders: [
        { name: "gdelt", category: "data", configured: true, requiredFor100: true, coverage: "needs-live-smoke", detail: "全球新闻事件和媒体数据。" },
        { name: "ckan", category: "data", configured: true, requiredFor100: true, coverage: "needs-live-smoke", detail: "政府与开放数据目录。" },
        { name: "kaggle", category: "data", configured: true, requiredFor100: false, coverage: "needs-live-smoke", detail: "比赛和公开数据集。" },
        { name: "huggingface", category: "data", configured: true, requiredFor100: false, coverage: "needs-live-smoke", detail: "机器学习数据集目录。" },
        { name: "world-bank", category: "data", configured: true, requiredFor100: false, coverage: "needs-live-smoke", detail: "宏观经济与国家指标。" },
        { name: "openalex", category: "data", configured: true, requiredFor100: false, coverage: "needs-live-smoke", detail: "学术论文和机构数据。" },
        { name: "crossref", category: "data", configured: true, requiredFor100: false, coverage: "needs-live-smoke", detail: "DOI 与出版物元数据。" },
        { name: "sports", category: "data", configured: true, requiredFor100: false, coverage: "needs-live-smoke", detail: "赛事/比赛数据入口。" },
      ],
      extractors: [
        { name: "html", category: "extractor", configured: true, requiredFor100: true, coverage: "implemented", detail: "HTML 正文、metadata、links。" },
        { name: "pdf", category: "extractor", configured: true, requiredFor100: true, coverage: "implemented", detail: "PDF 文本和 metadata。" },
        { name: "table", category: "extractor", configured: true, requiredFor100: true, coverage: "implemented", detail: "表格抽取。" },
      ],
      ai: [
        { name: "openai", category: "ai", configured: true, requiredFor100: true, coverage: "configured", detail: "AI 摘要/证据抽取模型已配置。" },
      ],
      fetch: [
        { name: "http-fetcher", category: "fetch", configured: true, requiredFor100: true, coverage: "implemented", detail: "HTTP 抓取。" },
        { name: "browser-fallback", category: "fetch", configured: true, requiredFor100: true, coverage: "implemented", detail: "浏览器 fallback。" },
      ],
      pressureTargets: [
        { mode: "Quick", maxUrlsPerRun: 30, maxDepth: 1, maxDomainsPerRun: 10, evidenceTarget: 4, status: "implemented" },
        { mode: "Standard", maxUrlsPerRun: 150, maxDepth: 2, maxDomainsPerRun: 40, evidenceTarget: 8, status: "needs-pressure-smoke" },
        { mode: "Deep", maxUrlsPerRun: 500, maxDepth: 3, maxDomainsPerRun: 100, evidenceTarget: 15, status: "needs-pressure-smoke" },
      ],
      frontendSurfaces: ["Research run 工作台", "Source Explorer", "Evidence Graph", "Data Lab", "SPSS Pro 分析向导", "Agent Console", "自然语言调度", "数据平台兼容 API", "导出产物验收", "能力验收台"],
      extractorSamples: [
        { name: "html", sampleInput: "https://example.com/article", sampleOutput: "Readability 正文 + metadata + links", status: "passed", detail: "HTML 页面正文可抽取。" },
        { name: "pdf", sampleInput: "https://example.com/report.pdf", sampleOutput: "pdf-parse 文本 + metadata", status: "passed", detail: "PDF 文本可抽取。" },
        { name: "github", sampleInput: "https://github.com/jgm/pandoc", sampleOutput: "README + stars + license", status: "passed", detail: "GitHub repo 信号可抽取。" },
        { name: "npm", sampleInput: "https://www.npmjs.com/package/pandoc-bin", sampleOutput: "registry metadata", status: "passed", detail: "npm 元数据可抽取。" },
        { name: "pypi", sampleInput: "https://pypi.org/project/pypandoc/", sampleOutput: "PyPI JSON metadata", status: "passed", detail: "PyPI 元数据可抽取。" },
        { name: "sitemap", sampleInput: "https://example.com/sitemap.xml", sampleOutput: "URL + lastmod", status: "passed", detail: "站点地图可抽取。" },
        { name: "table", sampleInput: "https://example.com/table.html", sampleOutput: "headers + rows", status: "passed", detail: "表格可抽取。" },
        { name: "structured-data", sampleInput: "https://example.com/data.csv", sampleOutput: "CSV/JSON/Excel 类型识别", status: "passed", detail: "结构化数据可识别。" },
      ],
      compatibilityApis: [
        { method: "POST", path: "/api/datasets", area: "datasets", status: "implemented", detail: "兼容数据集创建入口。" },
        { method: "POST", path: "/api/datasets/:id/validate", area: "datasets", status: "implemented", detail: "兼容数据质量校验入口。" },
        { method: "POST", path: "/api/analysis/jobs", area: "analysis-jobs", status: "implemented", detail: "兼容分析任务入口。" },
        { method: "GET", path: "/api/visualizations/:id/export", area: "visualizations", status: "implemented", detail: "兼容可视化导出入口。" },
        { method: "GET", path: "/api/reports/:id/export", area: "reports", status: "implemented", detail: "兼容报告导出入口。" },
      ],
      exportArtifacts: ["png", "svg", "pdf", "docx", "pptx", "html", "md", "mmd", "dot", "json"].map((format) => ({
        format,
        status: "implemented",
        detail: `${format} export smoke`,
      })),
      envChecklist: [
        { name: "DATABASE_URL", group: "runtime", requiredLevel: "required", configured: true, requiredFor100: true, impact: "Postgres 研究 run、证据图谱、数据集、分析任务和报告持久化。", howToGet: "使用本机 docker-compose 或已有 Postgres 创建 politistream 数据库后填写连接串。" },
        { name: "REDIS_URL", group: "runtime", requiredLevel: "required", configured: true, requiredFor100: true, impact: "BullMQ 队列和 worker 化抓取。", howToGet: "使用本机 docker-compose 或已有 Redis 服务地址。" },
        { name: "BRAVE_API_KEY", group: "search", requiredLevel: "at-least-one", configured: true, requiredFor100: true, impact: "主力通用网页发现。", howToGet: "在 Brave Search API 控制台创建订阅并复制 API key。" },
        { name: "SERPAPI_API_KEY", group: "search", requiredLevel: "at-least-one", configured: false, requiredFor100: true, impact: "Google 结果补充。", howToGet: "在 SerpApi 控制台创建 key。" },
        { name: "TAVILY_API_KEY", group: "search", requiredLevel: "at-least-one", configured: true, requiredFor100: true, impact: "研究型深度检索补充。", howToGet: "在 Tavily 控制台创建 API key。" },
        { name: "AI_BASE_URL", group: "ai", requiredLevel: "required", configured: true, requiredFor100: true, impact: "GPT 中转站 OpenAI-compatible base URL。", howToGet: "在中转站控制台复制 base URL，通常以 /v1 结尾。" },
        { name: "AI_API_KEY", group: "ai", requiredLevel: "required", configured: true, requiredFor100: true, impact: "GPT 中转站鉴权 key，用于文档相关性、claim/evidence 抽取和中文报告生成。", howToGet: "在中转站控制台创建或复制 API key。" },
        { name: "AI_MODEL", group: "ai", requiredLevel: "required", configured: true, requiredFor100: true, impact: "GPT 中转站模型名。", howToGet: "在中转站模型列表中复制模型 id。" },
        { name: "KAGGLE_API_TOKEN", group: "data", requiredLevel: "recommended", configured: true, requiredFor100: false, impact: "比赛和公开数据集。", howToGet: "Kaggle Account 的 API Tokens 页面生成新版 KGAT_ token。" },
        { name: "FIRECRAWL_API_KEY", group: "enhanced-fetch", requiredLevel: "optional", configured: false, requiredFor100: false, impact: "复杂页面增强抓取。", howToGet: "在 Firecrawl 控制台创建 API key。" },
      ],
      readinessScore: 67,
      remainingGates: ["真实 provider 联网 smoke", "Standard/Deep 长任务压测", "真实新闻溯源样本验收", "真实数据处理样本验收"],
      lastSmoke: {
        id: "latest-smoke",
        generatedAt: createdAt,
        verdict: "limited",
        notes: ["provider_live_smoke:passed candidates=3", "data_source_live_smoke:passed candidates=4", "pressure_smoke:passed targets=2", "deep_target:500_urls depth=3 domains=100"],
        provider: {
          id: "provider-smoke",
          topic: "文档转换工具深度研究 smoke",
          query: "文档转换工具深度研究 smoke",
          generatedAt: createdAt,
          totalCandidates: 3,
          passed: true,
          providers: [],
        },
        pressure: {
          id: "pressure-smoke",
          topic: "文档转换工具深度研究 smoke",
          generatedAt: createdAt,
          passed: true,
          targets: [],
        },
        dataSource: {
          id: "data-source-smoke",
          topic: "文档转换工具深度研究 smoke",
          query: "public open dataset csv",
          generatedAt: createdAt,
          totalCandidates: 4,
          passed: true,
          providers: [],
        },
      },
    }],
    [`${appUrl}/api/research/runs/smoke-run`, {
      job,
      run,
      report: {
        jobId: job.id,
        runId: run.id,
        status: "ready",
        markdown: "## 研究摘要\nPandoc 官方来源、GitHub 和包管理器信息已纳入证据图。\n证据质量门通过：2/2 个结论已关联证据。\n\n## 关键结论\n- Pandoc 是核心候选工具。",
        generatedAt: "2026-06-08T00:05:00.000Z",
      },
    }],
    [`${appUrl}/api/research/runs/smoke-run/plan`, { plan, queries: plan.queries }],
    [`${appUrl}/api/research/runs/smoke-run/events`, {
      events: [
        { id: "event-1", jobId: job.id, runId: run.id, stage: "planning", level: "info", message: "规划查询完成", createdAt },
        { id: "event-2", jobId: job.id, runId: run.id, stage: "completed", level: "info", message: "报告生成完成", createdAt },
      ],
    }],
    [`${appUrl}/api/research/runs/smoke-run/frontier`, {
      frontier: [
        {
          id: "frontier-1",
          jobId: job.id,
          runId: run.id,
          url: "https://pandoc.org/",
          canonicalUrl: "https://pandoc.org/",
          depth: 0,
          sourceType: "official",
          priorityScore: 0.96,
          scoreBreakdown: {
            topicalRelevance: 0.94,
            sourceAuthority: 1,
            primarySourceLikelihood: 1,
            freshness: 0.85,
            sourceDiversity: 1,
            linkContextQuality: 1,
            weights: {
              topicalRelevance: 0.25,
              sourceAuthority: 0.25,
              primarySourceLikelihood: 0.2,
              freshness: 0.1,
              sourceDiversity: 0.1,
              linkContextQuality: 0.1,
            },
            finalScore: 0.96,
          },
          status: "fetched",
          attempts: 1,
          queryId: "query-1",
          reason: "official source",
          createdAt,
          updatedAt: createdAt,
        },
      ],
    }],
    [`${appUrl}/api/research/runs/smoke-run/documents`, { documents }],
    [`${appUrl}/api/research/runs/smoke-run/assets`, {
      assets: [
        {
          id: "asset-1",
          jobId: job.id,
          runId: run.id,
          documentId: "smoke-doc",
          url: "https://pandoc.org/",
          assetType: "html",
          metadata: {
            path: ".data/research-assets/smoke-run/smoke-doc.raw.html",
            contentType: "text/html; charset=utf-8",
            sizeBytes: 2048,
            sha256: "smoke-sha256",
          },
          createdAt,
        },
      ],
    }],
    [`${appUrl}/api/research/runs/smoke-run/tables`, {
      tables: [
        {
          id: "table-1",
          jobId: job.id,
          runId: run.id,
          documentId: "smoke-doc",
          tableIndex: 0,
          caption: "工具对比",
          headers: ["工具", "格式", "适用场景"],
          rows: [
            ["Pandoc", "Markdown / DOCX / PDF / HTML", "离线批量转换"],
            ["LibreOffice", "DOCX / PDF", "Office 文档转换"],
          ],
          createdAt,
        },
      ],
    }],
    [`${appUrl}/api/research/runs/smoke-run/links`, { links }],
    [`${appUrl}/api/research/runs/smoke-run/evidence`, { claims, evidence }],
    [`${appUrl}/api/research/runs/smoke-run/claims`, {
      claims,
      summary: {
        total: 1,
        supported: 1,
        contradicted: 1,
        uncertain: 0,
        unverified: 0,
      },
    }],
    [`${appUrl}/api/research/runs/smoke-run/graph`, {
      claims,
      evidence,
      relations,
      sources: [
        {
          id: "source-1",
          domain: "pandoc.org",
          sourceType: "official",
          authorityTier: "T1",
          officialLikelihood: 0.95,
          mainstreamLikelihood: 0.72,
          notes: ["official project site"],
          createdAt,
          updatedAt: createdAt,
        },
      ],
      summary: {
        supportedClaims: 1,
        contradictedClaims: 1,
        uncertainClaims: 0,
        unverifiedClaims: 0,
        supportingRelations: 1,
        conflictingRelations: 1,
      },
    }],
    [`${appUrl}/api/research/runs/smoke-run/sources`, {
      sources: [
        {
          id: "source-1",
          domain: "pandoc.org",
          sourceType: "official",
          authorityTier: "T1",
          officialLikelihood: 0.95,
          mainstreamLikelihood: 0.72,
          notes: ["official project site"],
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: "source-2",
          domain: "example.invalid",
          sourceType: "unknown",
          authorityTier: "T4",
          officialLikelihood: 0.05,
          mainstreamLikelihood: 0.02,
          notes: ["failed smoke source"],
          createdAt,
          updatedAt: createdAt,
        },
      ],
    }],
    [`${appUrl}/api/research/runs/smoke-run/providers`, {
      providers: [
        {
          id: "provider-1",
          jobId: job.id,
          runId: run.id,
          provider: "brave",
          providerType: "web-search",
          queryId: "query-1",
          candidateCount: 8,
          durationMs: 420,
          costUnits: 1,
          createdAt,
        },
        {
          id: "provider-2",
          jobId: job.id,
          runId: run.id,
          provider: "github",
          providerType: "github",
          queryId: "query-2",
          candidateCount: 3,
          durationMs: 510,
          costUnits: 0.2,
          createdAt,
        },
        {
          id: "provider-3",
          jobId: job.id,
          runId: run.id,
          provider: "ckan",
          providerType: "data-catalog",
          queryId: "query-2",
          candidateCount: 4,
          durationMs: 610,
          costUnits: 0,
          createdAt,
        },
        {
          id: "provider-4",
          jobId: job.id,
          runId: run.id,
          provider: "worldbank",
          providerType: "structured-api",
          queryId: "query-2",
          candidateCount: 2,
          durationMs: 480,
          costUnits: 0,
          createdAt,
        },
        {
          id: "provider-5",
          jobId: job.id,
          runId: run.id,
          provider: "kaggle",
          providerType: "competition-data",
          queryId: "query-2",
          candidateCount: 1,
          durationMs: 120,
          costUnits: 0,
          createdAt,
        },
      ],
    }],
  ]);

  for (const [url, body] of routes) {
    await page.route(url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
  }

  await page.route(`${appUrl}/api/research/jobs/smoke-job/runs`, async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ queued: true, job, run }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ runs: [run] }),
    });
  });

  await page.route(`${appUrl}/api/research/capabilities/provider-smoke`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "provider-smoke",
        topic: "文档转换工具深度研究 smoke",
        query: "文档转换工具深度研究 smoke",
        generatedAt: createdAt,
        totalCandidates: 3,
        passed: true,
        providers: [
          {
            provider: "brave",
            status: "passed",
            enabled: true,
            candidateCount: 3,
            durationMs: 320,
            sampleUrls: ["https://pandoc.org/", "https://github.com/jgm/pandoc"],
          },
          {
            provider: "serpapi",
            status: "skipped",
            enabled: false,
            candidateCount: 0,
            durationMs: 1,
            sampleUrls: [],
            error: "provider_api_key_missing",
          },
        ],
      }),
    });
  });

  await page.route(`${appUrl}/api/research/capabilities/data-source-smoke`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "data-source-smoke",
        topic: "文档转换工具深度研究 smoke",
        query: "public open dataset csv",
        generatedAt: createdAt,
        totalCandidates: 4,
        passed: true,
        providers: [
          {
            provider: "ckan",
            providerType: "data-catalog",
            status: "passed",
            candidateCount: 4,
            durationMs: 420,
            sampleUrls: ["https://catalog.data.gov/dataset/document-benchmark.csv"],
          },
          {
            provider: "openalex",
            providerType: "structured-api",
            status: "failed",
            candidateCount: 0,
            durationMs: 310,
            sampleUrls: [],
          },
        ],
        latest: {
          id: "latest-smoke-after-data-source",
          generatedAt: createdAt,
          verdict: "limited",
          notes: ["provider_live_smoke:passed candidates=3", "data_source_live_smoke:passed candidates=4", "data_source_passed:ckan", "pressure_smoke:passed targets=2"],
          provider: {
            id: "provider-smoke",
            topic: "文档转换工具深度研究 smoke",
            query: "文档转换工具深度研究 smoke",
            generatedAt: createdAt,
            totalCandidates: 3,
            passed: true,
            providers: [],
          },
          dataSource: {
            id: "data-source-smoke",
            topic: "文档转换工具深度研究 smoke",
            query: "public open dataset csv",
            generatedAt: createdAt,
            totalCandidates: 4,
            passed: true,
            providers: [
              {
                provider: "ckan",
                providerType: "data-catalog",
                status: "passed",
                candidateCount: 4,
                durationMs: 420,
                sampleUrls: ["https://catalog.data.gov/dataset/document-benchmark.csv"],
              },
            ],
          },
          pressure: {
            id: "pressure-smoke",
            topic: "文档转换工具深度研究 smoke",
            generatedAt: createdAt,
            passed: true,
            targets: [],
          },
        },
      }),
    });
  });

  await page.route(`${appUrl}/api/research/capabilities/pressure-smoke`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "pressure-smoke",
        topic: "文档转换工具深度研究 smoke",
        generatedAt: createdAt,
        passed: true,
        targets: [
          {
            mode: "Standard",
            maxUrlsPerRun: 150,
            maxDepth: 2,
            maxDomainsPerRun: 40,
            plannedQueries: 11,
            plannedSourceTypes: ["official", "github", "package-registry"],
            estimatedFrontierCapacity: 440,
            evidenceTarget: 8,
            status: "passed",
          },
          {
            mode: "Deep",
            maxUrlsPerRun: 500,
            maxDepth: 3,
            maxDomainsPerRun: 100,
            plannedQueries: 11,
            plannedSourceTypes: ["official", "github", "package-registry"],
            estimatedFrontierCapacity: 1100,
            evidenceTarget: 15,
            status: "passed",
          },
        ],
      }),
    });
  });

  await page.route(`${appUrl}/api/research/capabilities/sample-acceptance`, async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    const kind = body.kind === "data-processing" ? "data-processing" : "news-trace";
    const checks = kind === "data-processing"
      ? [
          { id: "profile", label: "Schema 和质量画像可生成", status: "passed", detail: "profile columns" },
          { id: "statistics", label: "描述统计和相关矩阵可生成", status: "passed", detail: "stats + correlations" },
          { id: "models", label: "回归、Logistic、Poisson 可运行", status: "passed", detail: "3 model families" },
          { id: "report-export", label: "Markdown/DOCX/PDF/PPTX 等报告导出链路可生成", status: "passed", detail: "report + export files" },
        ]
      : [
          { id: "news-documents", label: "新闻样本文档进入整理链路", status: "passed", detail: "5 documents", metric: 5 },
          { id: "news-clusters", label: "同题新闻可聚类", status: "passed", detail: "2 clusters", metric: 2 },
          { id: "news-timeline", label: "可生成事件时间线", status: "passed", detail: "5 timeline items", metric: 5 },
          { id: "news-source-quality", label: "可评估来源质量", status: "passed", detail: "4 source profiles", metric: 4 },
        ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: `${kind}-sample-acceptance`,
        kind,
        label: kind === "data-processing" ? "真实数据处理样本验收" : "真实新闻溯源样本验收",
        generatedAt: createdAt,
        durationMs: 480,
        status: "passed",
        checks,
        commands: kind === "data-processing" ? ["profile", "stats", "regression", "chart", "report", "export"] : ["news"],
      }),
    });
  });

  await page.route(`${appUrl}/api/research/capabilities/enhanced-fetch-smoke`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "enhanced-fetch-smoke",
        generatedAt: createdAt,
        passed: true,
        rows: [
          { provider: "http-fetcher", configured: true, status: "passed", sampleInput: "https://example.com/index.html", sampleOutput: "status + content-type + bytes", detail: "HTTP fetcher wired." },
          { provider: "browser-fallback", configured: true, status: "passed", sampleInput: "动态 HTML 页面", sampleOutput: "浏览器渲染后 HTML", detail: "Browser fallback enabled." },
          { provider: "firecrawl", configured: false, status: "skipped", sampleInput: "Firecrawl scrape API", sampleOutput: "markdown/html 正文", detail: "optional" },
          { provider: "crawl4ai", configured: false, status: "skipped", sampleInput: "Crawl4AI /crawl endpoint", sampleOutput: "markdown/html/links", detail: "optional" },
          { provider: "browserless", configured: false, status: "skipped", sampleInput: "Browserless remote browser", sampleOutput: "远程浏览器渲染", detail: "optional" },
        ],
      }),
    });
  });

  await page.route(`${appUrl}/api/research/runs/smoke-run/queries`, async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        queued: true,
        run: { ...run, status: "queued", stage: "discovery" },
        query: {
          id: "manual-smoke-query",
          text: "Pandoc 与 LibreOffice 的转换质量对比",
          purpose: "overview",
          sourceTypes: ["unknown"],
          language: "mixed",
          priority: 78,
        },
      }),
    });
  });

  await page.route(`${appUrl}/api/research/runs/smoke-run/retry-failed`, async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        queued: true,
        resetCount: 1,
        run: { ...run, status: "queued", stage: "fetching" },
        frontier: [
          {
            id: "frontier-failed",
            jobId: job.id,
            runId: run.id,
            url: "https://pandoc.org/failed",
            canonicalUrl: "https://pandoc.org/failed",
            depth: 1,
            sourceType: "technical-doc",
            priorityScore: 0.72,
            status: "queued",
            attempts: 2,
            queryId: "query-1",
            reason: "manual_retry",
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }),
    });
  });

  await page.route(`${appUrl}/api/analytics/datasets/from-research-run/smoke-run/data-sources`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        dataset: {
          id: "dataset-data-sources",
          name: "文档转换工具深度研究 smoke / data sources",
          sourceKind: "research-data-source",
          sourceRef: run.id,
          rowCount: 3,
          columnCount: 18,
          sampleRows: [
            {
              title: "Data.gov document benchmark",
              url: "https://catalog.data.gov/dataset/document-benchmark.csv",
              provider: "ckan",
              provider_type: "data-catalog",
              source_type: "data-catalog",
              priority_score: 0.91,
              format_hint: "csv",
              access_mode: "download",
              license_hint: "open-data",
            },
          ],
          metadata: {
            runId: run.id,
            sourceDatasetType: "research-data-source-candidates",
          },
          createdAt,
          updatedAt: createdAt,
        },
        profile: {
          rowCount: 3,
          columnCount: 18,
          qualityScore: 0.94,
          warnings: [],
          columns: [],
        },
        suggestions: [],
        summary: {
          runId: run.id,
          dataSourceCount: 3,
          providerTypes: ["data-catalog", "structured-api", "competition-data"],
          sourceTypes: ["data-catalog", "structured-api", "dataset"],
        },
      }),
    });
  });

  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/research/runs/smoke-run/search\\?.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            documentId: "smoke-doc",
            title: "检索命中：Pandoc 官方正文",
            url: "https://pandoc.org/",
            rank: 0.91,
            snippet: "Pandoc supports Markdown, DOCX, PDF, HTML and many other formats.",
          },
        ],
      }),
    });
  });

  for (const endpoint of ["cluster", "timeline", "source-quality"]) {
    await page.route(`${appUrl}/api/news-analysis/runs/smoke-run/${endpoint}`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newsAnalysisResult(endpoint)),
      });
    });
  }
}

async function installRssRouteMocks(page) {
  const source = {
    id: 9001,
    name: "Smoke RSS Source",
    url: "https://example.com/smoke.xml",
    enabled: 1,
    is_default: 0,
    last_fetched_at: null,
    last_error: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  };
  const news = [
    {
      id: 9101,
      title: "RSS smoke article",
      link: "https://example.com/rss-smoke",
      source: "Smoke RSS Source",
      pubDate: "2026-06-08T00:00:00.000Z",
      contentSnippet: "Mocked RSS item used by Playwright smoke.",
      summary: "",
      sentiment: 0,
      entities: "[]",
      processed: 0,
      is_favorite: 0,
    },
  ];

  await page.route(`${appUrl}/api/feeds`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([source]),
      });
    }
    if (request.method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(source),
      });
    }
    return route.fallback();
  });
  await page.route(`${appUrl}/api/feeds/9001/refresh`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: { ...source, last_fetched_at: "2026-06-08T00:01:00.000Z" },
        success: true,
        newItems: 2,
        fetchedAt: "2026-06-08T00:01:00.000Z",
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/news\\?.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(news),
    });
  });
  await page.route(`${appUrl}/api/favorites`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/news/pending.*`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function waitForVisibleText(page, text, timeout = 5000) {
  await page.waitForFunction(
    (targetText) => {
      return Array.from(document.querySelectorAll("body *")).some((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 0 &&
          rect.height > 0 &&
          element.textContent?.includes(targetText)
        );
      });
    },
    text,
    { timeout },
  );
}

async function forceLanguage(page, language) {
  await page.addInitScript((nextLanguage) => {
    window.localStorage.setItem("politistream-language", nextLanguage);
  }, language);
}

async function ensureResearchJob() {
  const jobsResponse = await fetch(`${apiUrl}/api/research/jobs`);
  if (jobsResponse.ok) {
    const jobs = await jobsResponse.json();
    if (Array.isArray(jobs) && jobs.length > 0) return;
  }

  const created = await fetch(`${apiUrl}/api/research/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "UI smoke research source explorer",
      seedUrls: ["https://example.com"],
      budget: { maxDepth: 1, maxUrlsPerRun: 5, maxDomainsPerRun: 3 },
    }),
  });
  if (!created.ok) {
    const body = await created.text();
    throw new Error(`failed to create research smoke job: HTTP ${created.status} ${body}`);
  }
}

async function checkDataLab({ width, height, name }) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await forceLanguage(page, "zh");
    await installDataLabOperationRouteMocks(page);
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "数据实验室", exact: true }).click();
    await page.waitForTimeout(800);

    const nav = page.locator("header nav");
    for (const tab of ["首页", "导入数据", "数据集", "分析向导", "统计建模", "图表报告", "数据源资产", "任务产物", "系统接口"]) {
      await nav.getByRole("button", { name: new RegExp(`^${escapeRegExp(tab)}`) }).first().waitFor({ timeout: 10000 });
    }

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyHeight: document.documentElement.scrollHeight,
      text: document.body.innerText,
    }));
    const normalizedDataLabText = metrics.text.toLowerCase();
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      throw new Error(`${name} has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    }
    if (!normalizedDataLabText.includes("研究型数据工厂")) {
      throw new Error(`${name} missing Data Lab shell`);
    }

    await nav.getByRole("button", { name: /^分析向导/ }).first().click();
    await page.getByText("SPSS Pro 分析向导", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("推荐流程", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("方法链", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("图表方案", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("报告与导出", { exact: false }).first().waitFor({ timeout: 10000 });
    for (const template of ["快速探索画像", "组间比较 / 问卷统计", "预测建模 / 回归", "聚类 / 降维 / 异常", "时间序列 / 趋势", "新闻文本整理", "论文制图 / 报告交付"]) {
      await page.getByRole("button", { name: new RegExp(template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().waitFor({ timeout: 5000 });
    }

    await nav.getByRole("button", { name: /^统计建模/ }).first().click();
    for (const text of ["清洗、质量与转换", "SPSS Pro 级统计", "PyTorch / Embedding", "新闻、文本和地理数据", "MD / HTML / DOCX / PDF / PPTX"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    }

    await nav.getByRole("button", { name: /^数据集/ }).first().click();
    for (const text of ["数据集操作台", "运行质量校验", "执行清洗", "字段查询"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    }

    await nav.getByRole("button", { name: /^数据源资产/ }).first().click();
    for (const text of ["数据源资产清单", "数据源筛选", "Data.gov document benchmark", "open-data", "download", "来源质量", "可导入性", "ready", "Lineage JSON", "导入数据快照", "批量导入前 8 个", "默认拒绝 localhost"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    }
    await page.getByRole("button", { name: /批量导入前 8 个/ }).first().click();
    await page.getByText("批量快照完成", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("已导入", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /导入数据快照/ }).first().click();
    await page.getByText("数据源快照已导入", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("快照版本", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("版本历史", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /刷新数据源快照/ }).first().click();
    await page.getByText("数据源快照已刷新", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("materialized-smoke-dataset-v2", { exact: false }).first().waitFor({ timeout: 10000 });

    await nav.getByRole("button", { name: /^任务产物/ }).first().click();
    for (const text of ["任务操作", "重跑任务", "取消任务", "导出资产"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    }

    await nav.getByRole("button", { name: /^系统接口/ }).first().click();
    for (const text of ["API 接口面", "/api/datasets", "/api/analysis/jobs", "/api/visualizations", "/api/reports", "/api/news-analysis/runs/:runId/cluster", "/api/news-analysis/runs/:runId/timeline", "/api/news-analysis/runs/:runId/source-quality"]) {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
    }

    await page.screenshot({
      path: path.join(outputDir, `data-lab-${name}.png`),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

async function checkDataLabChartPreview() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await forceLanguage(page, "zh");
    await installDataLabOperationRouteMocks(page);
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "数据实验室", exact: true }).click();
    const nav = page.locator("header nav");
    await nav.getByRole("button", { name: /^导入数据/ }).first().click();
    await page.getByRole("button", { name: /保存\s*手动\s*数据/ }).click();
    await page.getByText("Reuters", { exact: false }).first().waitFor({ timeout: 10000 });
    await nav.getByRole("button", { name: /^数据集/ }).first().click();
    await page.getByRole("button", { name: /运行质量校验/ }).click();
    await page.getByText("qualityScore", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /执行清洗/ }).click();
    await page.getByText("清洗结果", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByLabel("查询字段").fill("source,count");
    await page.getByRole("button", { name: /字段查询/ }).click();
    await page.getByText("字段查询结果：Reuters", { exact: false }).first().waitFor({ timeout: 10000 });
    await nav.getByRole("button", { name: /^任务产物/ }).first().click();
    await page.getByRole("button", { name: /重跑任务/ }).first().click();
    await page.getByText("任务已重跑", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /取消任务/ }).first().click();
    await page.getByText("任务已取消", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByText("导出资产", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^json$/i }).first().click();
    await page.getByText("visualization-export-smoke", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^pdf$/i }).first().click();
    await page.getByText("report-export-smoke", { exact: false }).first().waitFor({ timeout: 10000 });
    await nav.getByRole("button", { name: /^图表报告/ }).first().click();
    await page.locator('button:not([disabled])').filter({ hasText: /来源.*count|source.*count/i }).first().click();
    await page.getByText("图表预览", { exact: false }).first().waitFor({ timeout: 10000 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText,
    }));
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      throw new Error(`chart preview has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    }
    if (!metrics.text.includes("图表预览")) {
      throw new Error("Data Lab chart preview did not render");
    }
    await page.screenshot({
      path: path.join(outputDir, "data-lab-chart-preview.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

async function installDataLabOperationRouteMocks(page) {
  const createdAt = "2026-06-08T00:00:00.000Z";
  const dataSourceDataset = {
    id: "smoke-data-source-dataset",
    name: "Research smoke 数据源资产清单",
    sourceKind: "research-data-source",
    sourceRef: "smoke-run",
    rowCount: 2,
    columnCount: 18,
    sampleRows: [
      {
        title: "Data.gov document benchmark",
        url: "https://catalog.data.gov/dataset/document-benchmark.csv",
        canonical_url: "https://catalog.data.gov/dataset/document-benchmark.csv",
        provider: "ckan",
        provider_type: "data-catalog",
        source_type: "data-catalog",
        query: "document benchmark dataset",
        access_mode: "download",
        format_hint: "csv",
        license_hint: "open-data",
        priority_score: 0.91,
        source_quality_score: 0.92,
        dataset_quality_tier: "A",
        materialize_readiness: "ready",
        quality_reason: "priority:91%; provider:data-catalog; access:download; format:csv; license:open-data; provider_errors:0",
        lineage_json: JSON.stringify({ runId: "smoke-run", frontierId: "frontier-ckan" }),
      },
      {
        title: "World Bank internet users API",
        url: "https://api.worldbank.org/v2/country/all/indicator/IT.NET.USER.ZS?format=json",
        canonical_url: "https://api.worldbank.org/v2/country/all/indicator/IT.NET.USER.ZS?format=json",
        provider: "worldbank",
        provider_type: "structured-api",
        source_type: "structured-api",
        query: "internet users api",
        access_mode: "api",
        format_hint: "json",
        license_hint: "unknown",
        priority_score: 0.87,
        source_quality_score: 0.86,
        dataset_quality_tier: "A",
        materialize_readiness: "ready",
        quality_reason: "priority:87%; provider:structured-api; access:api; format:json; license:unknown; provider_errors:0",
        lineage_json: JSON.stringify({ runId: "smoke-run", frontierId: "frontier-worldbank" }),
      },
    ],
    metadata: {
      runId: "smoke-run",
      sourceDatasetType: "research-data-source-candidates",
      summary: {
        runId: "smoke-run",
        dataSourceCount: 2,
        providerTypes: ["data-catalog", "structured-api"],
        sourceTypes: ["data-catalog", "structured-api"],
      },
    },
    createdAt,
    updatedAt: createdAt,
  };
  const smokeJob = {
    id: "analysis-smoke-job",
    datasetId: "smoke-dataset",
    kind: "data-cleaning",
    status: "succeeded",
    request: {},
    result: { summary: "Smoke analytics job" },
    createdAt,
    updatedAt: createdAt,
  };
  const smokeArtifacts = [
    {
      id: "visualization-smoke-artifact",
      jobId: smokeJob.id,
      datasetId: "smoke-dataset",
      artifactType: "visualization",
      title: "Smoke visualization artifact",
      metadata: { files: { json: "/tmp/smoke-visualization.json" } },
      createdAt,
    },
    {
      id: "report-smoke-artifact",
      jobId: smokeJob.id,
      datasetId: "smoke-dataset",
      artifactType: "report",
      title: "Smoke report artifact",
      metadata: { files: { pdf: "/tmp/smoke-report.pdf" } },
      createdAt,
    },
  ];
  let datasets = [dataSourceDataset];

  await page.route(`${appUrl}/api/analytics/jobs`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [smokeJob] }),
    });
  });
  await page.route(`${appUrl}/api/analytics/artifacts`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ artifacts: smokeArtifacts }),
    });
  });
  await page.route(`${appUrl}/api/analytics/datasets`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ datasets }),
    });
  });
  await page.route(`${appUrl}/api/analytics/datasets/smoke-data-source-dataset/materialize-source`, async (route) => {
    const materializedDataset = {
      id: "materialized-smoke-dataset",
      name: "Research smoke 数据源资产清单 / Data.gov document benchmark",
      sourceKind: "materialized-data-source",
      sourceRef: "https://catalog.data.gov/dataset/document-benchmark.csv",
      rowCount: 2,
      columnCount: 3,
      sampleRows: [
        { tool: "Pandoc", format: "DOCX/PDF", score: 9 },
        { tool: "LibreOffice", format: "DOCX/PDF", score: 8 },
      ],
      metadata: {
        materializedFromDatasetId: "smoke-data-source-dataset",
        materializedFromDatasetName: "Research smoke 数据源资产清单",
        materializedVersion: 1,
        sourceRow: dataSourceDataset.sampleRows[0],
        sourceUrl: "https://catalog.data.gov/dataset/document-benchmark.csv",
        kind: "csv",
      },
      createdAt,
      updatedAt: createdAt,
    };
    datasets = [materializedDataset, ...datasets.filter((item) => item.id !== materializedDataset.id)];
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        dataset: materializedDataset,
        profile: {
          rowCount: 2,
          columnCount: 3,
          qualityScore: 1,
          warnings: [],
          columns: [
            { name: "tool", inferredType: "string", missingCount: 0, uniqueCount: 2 },
            { name: "score", inferredType: "number", missingCount: 0, uniqueCount: 2, min: 8, max: 9, mean: 8.5 },
          ],
        },
        suggestions: [],
        fetched: {
          url: "https://catalog.data.gov/dataset/document-benchmark.csv",
          contentType: "text/csv",
          statusCode: 200,
          durationMs: 7,
          sizeBytes: 64,
        },
        extracted: {
          extractor: "csv",
          tableCount: 1,
          metadata: {},
        },
      }),
    });
  });
  await page.route(`${appUrl}/api/analytics/datasets/materialized-smoke-dataset/refresh-materialized-source`, async (route) => {
    const refreshedDataset = {
      id: "materialized-smoke-dataset-v2",
      name: "Research smoke 数据源资产清单 / Data.gov document benchmark / refresh v2",
      sourceKind: "materialized-data-source",
      sourceRef: "https://catalog.data.gov/dataset/document-benchmark.csv",
      rowCount: 2,
      columnCount: 3,
      sampleRows: [
        { tool: "Pandoc", format: "DOCX/PDF", score: 9.2 },
        { tool: "LibreOffice", format: "DOCX/PDF", score: 8.1 },
      ],
      metadata: {
        materializedFromDatasetId: "smoke-data-source-dataset",
        materializedFromDatasetName: "Research smoke 数据源资产清单",
        materializedVersion: 2,
        refreshOfDatasetId: "materialized-smoke-dataset",
        refreshRootDatasetId: "materialized-smoke-dataset",
        sourceRow: dataSourceDataset.sampleRows[0],
        sourceUrl: "https://catalog.data.gov/dataset/document-benchmark.csv",
        kind: "csv",
      },
      createdAt,
      updatedAt: createdAt,
    };
    datasets = [refreshedDataset, ...datasets.filter((item) => item.id !== refreshedDataset.id)];
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        dataset: refreshedDataset,
        profile: {
          rowCount: 2,
          columnCount: 3,
          qualityScore: 1,
          warnings: [],
          columns: [
            { name: "tool", inferredType: "string", missingCount: 0, uniqueCount: 2 },
            { name: "score", inferredType: "number", missingCount: 0, uniqueCount: 2, min: 8.1, max: 9.2, mean: 8.65 },
          ],
        },
        suggestions: [],
        fetched: {
          url: "https://catalog.data.gov/dataset/document-benchmark.csv",
          contentType: "text/csv",
          statusCode: 200,
          durationMs: 9,
          sizeBytes: 70,
        },
        extracted: { extractor: "csv", tableCount: 1, metadata: {} },
        refresh: {
          previousDatasetId: "materialized-smoke-dataset",
          refreshRootDatasetId: "materialized-smoke-dataset",
          version: 2,
        },
      }),
    });
  });
  await page.route(`${appUrl}/api/analytics/datasets/smoke-data-source-dataset/materialize-sources`, async (route) => {
    await route.fulfill({
      status: 207,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          requested: 2,
          succeeded: 1,
          failed: 1,
          maxRows: 50000,
        },
        results: [
          {
            ok: true,
            rowIndex: 0,
            sourceRow: dataSourceDataset.sampleRows[0],
            dataset: {
              id: "materialized-batch-smoke-dataset",
              name: "Research smoke 数据源资产清单 / Data.gov document benchmark",
              sourceKind: "materialized-data-source",
              sourceRef: "https://catalog.data.gov/dataset/document-benchmark.csv",
              rowCount: 2,
              columnCount: 3,
              sampleRows: [
                { tool: "Pandoc", format: "DOCX/PDF", score: 9 },
                { tool: "LibreOffice", format: "DOCX/PDF", score: 8 },
              ],
              metadata: {
                materializedFromDatasetId: "smoke-data-source-dataset",
                materializedBatch: true,
                sourceUrl: "https://catalog.data.gov/dataset/document-benchmark.csv",
                kind: "csv",
              },
              createdAt,
              updatedAt: createdAt,
            },
            fetched: {
              url: "https://catalog.data.gov/dataset/document-benchmark.csv",
              contentType: "text/csv",
              statusCode: 200,
              durationMs: 7,
              sizeBytes: 64,
            },
            extracted: { extractor: "csv", tableCount: 1, metadata: {} },
          },
          {
            ok: false,
            rowIndex: 1,
            sourceRow: dataSourceDataset.sampleRows[1],
            error: "unsupported_data_source_materialize_kind",
            statusCode: 415,
          },
        ],
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/analysis/jobs/.*/run`), async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        job: { ...smokeJob, id: "analysis-smoke-job-rerun", result: { summary: "任务已重跑 smoke" } },
        worker: { result: { summary: "任务已重跑 smoke", operations: { rerun: true } } },
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/analysis/jobs/.*/cancel`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: { ...smokeJob, status: "cancelled", error: "任务已取消 smoke" },
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/visualizations/.*/export`), async (route) => {
    const format = new URL(route.request().url()).searchParams.get("format") ?? "json";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "visualization-export-smoke",
        format,
        artifact: smokeArtifacts[0],
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/reports/.*/export`), async (route) => {
    const format = new URL(route.request().url()).searchParams.get("format") ?? "json";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "report-export-smoke",
        format,
        artifact: smokeArtifacts[1],
      }),
    });
  });

  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/datasets/.*/validate`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          rowCount: 2,
          columnCount: 4,
          qualityScore: 0.97,
          warnings: ["Smoke validation warning"],
          columns: [
            { name: "source", inferredType: "string", missingCount: 0, uniqueCount: 2 },
            { name: "count", inferredType: "number", missingCount: 0, uniqueCount: 2, min: 8, max: 12, mean: 10 },
          ],
        },
        suggestions: [
          {
            id: "smoke-bar",
            kind: "bar",
            title: "source count",
            description: "Smoke source count chart",
            x: "source",
            y: "count",
            engine: "echarts",
            exportFormats: ["json", "png", "svg"],
          },
        ],
        warnings: ["Smoke validation warning"],
        qualityScore: 0.97,
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/datasets/.*/clean`), async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: "clean-smoke-job",
          datasetId: "smoke-dataset",
          kind: "data-cleaning",
          status: "succeeded",
          engine: "python-worker",
          request: {},
          result: {},
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
        },
        worker: {
          result: {
            operations: {
              deduplicate: { removedRows: 0 },
              imputeMissing: { filledCells: 0 },
            },
            lineage: {
              source: "ui-smoke",
              steps: ["validate schema", "deduplicate", "normalize fields"],
            },
          },
        },
      }),
    });
  });
  await page.route(new RegExp(`${escapeRegExp(appUrl)}/api/datasets/.*/query`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        datasetId: "smoke-dataset",
        rowCount: 2,
        sourceRowCount: 2,
        rows: [
          { source: "字段查询结果：Reuters", count: 12 },
          { source: "AP", count: 8 },
        ],
      }),
    });
  });
}
