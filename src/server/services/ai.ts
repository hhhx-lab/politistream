import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
// Initialize with apiKey if available and valid (not the placeholder)
const isValidKey = apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.length > 10;
const ai = isValidKey ? new GoogleGenAI({ apiKey }) : null;

if (!isValidKey) {
    console.warn("Invalid or missing GEMINI_API_KEY. AI features will be disabled.");
}

export interface AnalysisResult {
  summary: string;
  sentiment: number;
  entities: string[];
}

export async function analyzeContent(title: string, snippet: string): Promise<AnalysisResult> {
  if (!ai) {
    return { summary: "", sentiment: 0, entities: [] };
  }

  try {
    const prompt = `You are a neutral, objective political analyst. 
    Analyze the following news item. 
    1. Provide a structured summary. Start with a concise paragraph describing the main event (approx 30 words). Then, provide 2-3 bullet points highlighting key implications or details.
    2. Determine the sentiment score from -1.0 (negative) to 1.0 (positive).
    3. Extract key political entities (people, organizations, countries).
    
    Title: ${title}
    Snippet: ${snippet}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sentiment: { type: Type.NUMBER },
            entities: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "sentiment", "entities"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from Gemini");
    
    // Clean up markdown code blocks if present
    const cleanText = responseText.replace(/```json\n?|\n?```/g, "").trim();
    
    return JSON.parse(cleanText) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Return empty summary so UI falls back to raw content
    return {
        summary: "",
        sentiment: 0,
        entities: []
    };
  }
}
