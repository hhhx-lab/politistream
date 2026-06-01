import { EvidenceItem, ResearchJob, ResearchReport } from "./types";

export interface ReportGraphSummary {
  supportedClaims: number;
  contradictedClaims: number;
  uncertainClaims: number;
  unverifiedClaims: number;
  supportingRelations: number;
  conflictingRelations: number;
}

export function generateMarkdownReport(
  job: ResearchJob,
  evidence: EvidenceItem[],
  graphSummary: ReportGraphSummary = emptyGraphSummary(),
): ResearchReport {
  if (evidence.length === 0) {
    return {
      jobId: job.id,
      status: "not_ready",
      markdown: "",
    };
  }

  const generatedAt = new Date().toISOString();
  const sourceUrls = [...new Set(evidence.map((item) => item.sourceUrl))];
  const conflicts = evidence.filter((item) => item.contradictsClaim);
  const lines = [
    `# ${job.topic}`,
    "",
    "## 研究摘要",
    "",
    `本报告基于 ${evidence.length} 条已分析证据、${sourceUrls.length} 个来源生成。`,
    `证据图谱包含 ${graphSummary.supportedClaims} 个已支持结论、${graphSummary.contradictedClaims} 个被反驳结论、${graphSummary.uncertainClaims} 个仍不确定结论。`,
    "",
    "## 关键结论",
    "",
    ...evidence.slice(0, 6).flatMap((item, index) => [
      `${index + 1}. ${item.explanation}`,
      `   - 置信线索: 相关性 ${item.relevanceScore.toFixed(2)}${item.credibilityScore !== undefined ? `，来源可信度 ${item.credibilityScore.toFixed(2)}` : ""}`,
    ]),
    "",
    "## 证据表",
    "",
    ...evidence.flatMap((item, index) => [
      `### ${index + 1}. ${item.explanation}`,
      "",
      `- 相关性分数: ${item.relevanceScore.toFixed(2)}`,
      `- 来源可信度: ${item.credibilityScore !== undefined ? item.credibilityScore.toFixed(2) : "未评分"}`,
      `- 来源: ${item.sourceUrl}`,
      `- 实体: ${item.entities.length > 0 ? item.entities.join(", ") : "无"}`,
      "",
      "> " + item.snippet.replace(/\n/g, " "),
      "",
    ]),
    "## 来源质量",
    "",
    ...sourceUrls.map((url, index) => `${index + 1}. ${url}`),
    "",
    "## 冲突信息",
    "",
    ...(conflicts.length > 0
      ? conflicts.map((item, index) => `${index + 1}. ${item.explanation} (${item.sourceUrl})`)
      : ["- 当前证据图谱未发现明确冲突证据。"]),
    "",
    "## 时间线",
    "",
    "- 当前版本优先记录抓取时间和来源发布时间；更细时间线将在后续 evidence graph 中继续增强。",
    "",
    "## 尚不确定的问题",
    "",
    "- 需要继续补充官方来源、反向证据或更高质量一手资料的问题，会在 Source Explorer 和后续查询建议中继续追踪。",
    "",
    "## 下一步建议搜索",
    "",
    "- 增加官方站点、监管机构、项目仓库、社区反馈和反向观点的定向 query。",
    "",
    "## 完整来源列表",
    "",
    ...sourceUrls.map((url) => `- ${url}`),
    "",
    "## 元数据",
    "",
    `- 任务 ID: ${job.id}`,
    `- 生成时间: ${generatedAt}`,
    `- 支持关系: ${graphSummary.supportingRelations}`,
    `- 冲突关系: ${graphSummary.conflictingRelations}`,
  ];

  return {
    jobId: job.id,
    status: "ready",
    markdown: lines.join("\n"),
    generatedAt,
  };
}

export function notReadyReport(jobId: string): ResearchReport {
  return {
    jobId,
    status: "not_ready",
    markdown: "",
  };
}

function emptyGraphSummary(): ReportGraphSummary {
  return {
    supportedClaims: 0,
    contradictedClaims: 0,
    uncertainClaims: 0,
    unverifiedClaims: 0,
    supportingRelations: 0,
    conflictingRelations: 0,
  };
}
