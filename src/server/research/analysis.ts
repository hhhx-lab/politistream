import { GoogleGenAI, Type } from "@google/genai";
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

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.length > 10
  ? new GoogleGenAI({ apiKey })
  : null;

export async function analyzeResearchDocument(
  topic: string,
  document: CrawlDocument,
): Promise<ResearchAnalysisResult> {
  if (!ai) {
    return {
      relevanceScore: 0,
      relevant: false,
      summary: "AI analysis is disabled because GEMINI_API_KEY is missing or invalid.",
      evidence: [],
    };
  }

  const content = (document.contentText ?? "").slice(0, 20000);
  const prompt = `你是研究型网络调查助手。请判断网页内容是否与调研主题相关，并抽取可追溯证据。

调研主题: ${topic}
来源 URL: ${document.finalUrl || document.url}
标题: ${document.title || ""}
正文:
${content}

请只返回 JSON。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty research analysis response");

    const parsed = JSON.parse(text) as ResearchAnalysisResult;
    return normalizeResearchAnalysis(parsed);
  } catch (error) {
    return {
      relevanceScore: 0,
      relevant: false,
      summary: `Research analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence: [],
    };
  }
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
