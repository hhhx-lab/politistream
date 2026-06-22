import { generateStructuredJson } from "../services/llm";
import { CrawlDocument, EvidenceItem } from "./types";

export interface ResearchAnalysisResult {
  relevanceScore: number;
  relevant: boolean;
  summary: string;
  topicTermHits?: number;
  topicTermCount?: number;
  evidence: Array<{
    snippet: string;
    explanation: string;
    entities: string[];
  }>;
}

const RESEARCH_ANALYSIS_SCHEMA_OPENAI = {
  type: "object",
  properties: {
    relevanceScore: { type: "number" },
    relevant: { type: "boolean" },
    summary: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          snippet: { type: "string" },
          explanation: { type: "string" },
          entities: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["snippet", "explanation", "entities"],
        additionalProperties: false,
      },
    },
  },
  required: ["relevanceScore", "relevant", "summary", "evidence"],
  additionalProperties: false,
};

export async function analyzeResearchDocument(
  topic: string,
  document: CrawlDocument,
): Promise<ResearchAnalysisResult> {
  const content = (document.contentText ?? "").slice(0, 20000);
  const prompt = `请判断网页内容是否与调研主题相关，并抽取可追溯证据。

调研主题: ${topic}
来源 URL: ${document.finalUrl || document.url}
标题: ${document.title || ""}
正文:
${content}

请只返回 JSON。`;

  const result = await generateStructuredJson<ResearchAnalysisResult>({
    instructions: "你是研究型网络调查助手。",
    prompt,
    schemaName: "research_document_analysis",
    schemas: {
      openai: RESEARCH_ANALYSIS_SCHEMA_OPENAI,
    },
    url: document.finalUrl || document.url,
  }).catch((error) => {
    console.warn("[research] AI analysis failed, falling back to deterministic evidence:", error instanceof Error ? error.message : String(error));
    return null;
  });

  if (!result) {
    return fallbackResearchAnalysis(topic, document);
  }

  const normalized = normalizeResearchAnalysis(result.data);
  const fallback = fallbackResearchAnalysis(topic, document);
  if ((!normalized.relevant || normalized.evidence.length === 0) && fallback.relevant && fallback.evidence.length > 0) {
    return {
      ...fallback,
      summary: normalized.summary || fallback.summary,
      relevanceScore: Math.max(normalized.relevanceScore, fallback.relevanceScore),
    };
  }

  return normalized;
}

export function evidenceFromAnalysis(
  jobId: string,
  document: CrawlDocument,
  analysis: ResearchAnalysisResult,
): EvidenceItem[] {
  if (!document.id || !analysis.relevant) {
    return [];
  }

  return analysis.evidence.map((item) => ({
    jobId,
    documentId: document.id!,
    sourceUrl: document.finalUrl || document.url,
    snippet: item.snippet,
    explanation: item.explanation,
    relevanceScore: analysis.relevanceScore,
    entities: item.entities,
  }));
}

function normalizeResearchAnalysis(input: ResearchAnalysisResult): ResearchAnalysisResult {
  const relevanceScore = Number.isFinite(input.relevanceScore)
    ? Math.max(0, Math.min(1, input.relevanceScore))
    : 0;

  return {
    relevanceScore,
    relevant: Boolean(input.relevant) && relevanceScore > 0,
    summary: input.summary || "",
    evidence: Array.isArray(input.evidence)
      ? input.evidence.filter((item) => item.snippet && item.explanation).map((item) => ({
          snippet: item.snippet,
          explanation: item.explanation,
          entities: Array.isArray(item.entities) ? item.entities : [],
        }))
      : [],
  };
}

function fallbackResearchAnalysis(topic: string, document: CrawlDocument): ResearchAnalysisResult {
  const content = (document.contentText ?? "").replace(/\s+/g, " ").trim();
  const topicTerms = extractTopicTerms(topic);
  const lowerContent = content.toLowerCase();
  const hits = topicTerms.filter((term) => lowerContent.includes(term)).length;
  const hitRatio = topicTerms.length > 0 ? hits / topicTerms.length : 0;
  const titleHit = document.title ? topicTerms.some((term) => document.title!.toLowerCase().includes(term)) : false;
  const relevanceScore = Math.max(0, Math.min(1, hitRatio * 0.82 + (titleHit ? 0.12 : 0)));
  const relevant = content.length > 0 && (hits >= Math.min(2, topicTerms.length) || relevanceScore >= 0.34);
  const snippet = relevant ? selectEvidenceSnippet(content, topicTerms) : "";

  if (!relevant) {
    return { relevanceScore: 0, relevant: false, summary: "", topicTermHits: hits, topicTermCount: topicTerms.length, evidence: [] };
  }

  return {
    relevanceScore,
    relevant: true,
    summary: summarizeEvidenceSnippet(snippet),
    topicTermHits: hits,
    topicTermCount: topicTerms.length,
    evidence: snippet
      ? [{
          snippet,
          explanation: summarizeEvidenceSnippet(snippet),
          entities: topicTerms.filter((term) => snippet.toLowerCase().includes(term)).slice(0, 8),
        }]
      : [],
  };
}

function extractTopicTerms(topic: string) {
  const normalized = topic.toLowerCase();
  const latinTerms = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !STOP_TERMS.has(term));
  const cjkTerms = [...normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)]
    .flatMap((match) => segmentCjkTopic(match[0]));
  return [...new Set([...latinTerms, ...cjkTerms])]
    .filter((term) => term.length > 1 && !STOP_TERMS.has(term))
    .slice(0, 18);
}

function segmentCjkTopic(value: string) {
  const cleaned = value
    .replace(/研究一下|帮我|调查|研究|比如|主要|以及|他们|关系|等等|相关/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const dictionary = [
    "中国",
    "避孕套",
    "市场",
    "购买人群",
    "消费人群",
    "时间段",
    "地区",
    "出生率",
    "结婚率",
    "生育率",
    "电商",
    "销售",
    "品牌",
    "人群",
  ];
  const hits = dictionary.filter((term) => cleaned.includes(term));
  return hits.length > 0 ? hits : [cleaned];
}

function selectEvidenceSnippet(content: string, topicTerms: string[]) {
  const lower = content.toLowerCase();
  const index = topicTerms
    .map((term) => lower.indexOf(term))
    .filter((item) => item >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, index - 180);
  return content.slice(start, start + 760).trim();
}

function summarizeEvidenceSnippet(snippet: string) {
  const firstSentence = snippet
    .split(/(?<=[。！？.!?])\s+/u)
    .map((item) => item.trim())
    .find(Boolean);
  const summary = firstSentence || snippet.slice(0, 180);
  return `证据摘要：${summary.slice(0, 220)}`;
}

const STOP_TERMS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "about",
  "研究",
  "调查",
  "相关",
]);
