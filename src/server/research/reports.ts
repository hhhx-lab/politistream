import { EvidenceItem, ResearchJob, ResearchReport } from "./types";

export function generateMarkdownReport(job: ResearchJob, evidence: EvidenceItem[]): ResearchReport {
  if (evidence.length === 0) {
    return {
      jobId: job.id,
      status: "not_ready",
      markdown: "",
    };
  }

  const generatedAt = new Date().toISOString();
  const lines = [
    `# ${job.topic}`,
    "",
    "## 调研摘要",
    "",
    `本报告基于 ${evidence.length} 条已分析证据生成。`,
    "",
    "## 证据列表",
    "",
    ...evidence.flatMap((item, index) => [
      `### ${index + 1}. ${item.explanation}`,
      "",
      `- 相关性分数: ${item.relevanceScore.toFixed(2)}`,
      `- 来源: ${item.sourceUrl}`,
      `- 实体: ${item.entities.length > 0 ? item.entities.join(", ") : "无"}`,
      "",
      "> " + item.snippet.replace(/\n/g, " "),
      "",
    ]),
    "## 元数据",
    "",
    `- 任务 ID: ${job.id}`,
    `- 生成时间: ${generatedAt}`,
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
