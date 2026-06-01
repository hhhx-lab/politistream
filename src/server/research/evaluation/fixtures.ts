import { SourceType } from "../types";

export interface ResearchBenchmarkFixture {
  id: string;
  topic: string;
  requiredSourceTypes: SourceType[];
  minimumEvidenceCount: number;
}

export const RESEARCH_BENCHMARK_FIXTURES: ResearchBenchmarkFixture[] = [
  {
    id: "document-converter-tools",
    topic: "好用的文档转换工具 Markdown DOCX PDF PPT 表格互转 本地可跑",
    requiredSourceTypes: ["official", "github", "package-registry", "community", "benchmark"],
    minimumEvidenceCount: 8,
  },
  {
    id: "news-origin-verification",
    topic: "查证某条关于 AI 芯片出口管制的新闻是否真实，并找到原始出处",
    requiredSourceTypes: ["official", "mainstream-news", "company"],
    minimumEvidenceCount: 5,
  },
  {
    id: "policy-research",
    topic: "调研一项监管政策的官方文本、主流解读、反对意见和后续影响",
    requiredSourceTypes: ["official", "regulatory", "mainstream-news", "academic"],
    minimumEvidenceCount: 6,
  },
] as const;
