import { Type } from "@google/genai";
import { generateStructuredJson } from "../services/llm";
import { CrawlDocument, EvidenceItem } from "./types";

export interface ResearchAnalysisResult {
  relevanceScore: number;
  relevant: boolean;
  summary: string;
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

const RESEARCH_ANALYSIS_SCHEMA_GEMINI = {
  type: Type.OBJECT,
  properties: {
    relevanceScore: { type: Type.NUMBER },
    relevant: { type: Type.BOOLEAN },
    summary: { type: Type.STRING },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          snippet: { type: Type.STRING },
          explanation: { type: Type.STRING },
          entities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["snippet", "explanation", "entities"],
      },
    },
  },
  required: ["relevanceScore", "relevant", "summary", "evidence"],
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
      gemini: RESEARCH_ANALYSIS_SCHEMA_GEMINI,
    },
    url: document.finalUrl || document.url,
  }).catch((error) => {
    console.warn("[research] AI analysis failed, falling back to deterministic evidence:", error instanceof Error ? error.message : String(error));
    return null;
  });

  if (!result) {
    return fallbackResearchAnalysis(topic, document);
  }

  return normalizeResearchAnalysis(result.data);
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
  const topicTerms = topic
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1)
    .slice(0, 12);
  const lowerContent = content.toLowerCase();
  const hits = topicTerms.filter((term) => lowerContent.includes(term)).length;
  const relevanceScore = topicTerms.length > 0 ? Math.max(0.3, Math.min(1, hits / topicTerms.length)) : 0.3;
  const snippet = content.slice(0, 600);

  return {
    relevanceScore,
    relevant: Boolean(snippet),
    summary: "AI 分析不可用，已使用确定性规则从正文生成基础证据。",
    evidence: snippet
      ? [{
          snippet,
          explanation: `该来源包含与“${topic}”相关的可追溯正文内容。`,
          entities: [],
        }]
      : [],
  };
}
