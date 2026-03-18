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

export async function analyzeContent(title: string, snippet: string, url?: string): Promise<AnalysisResult> {
  if (!ai) {
    return { 
      summary: "AI Analysis is disabled because GEMINI_API_KEY is missing or invalid. Please check your environment variables.", 
      sentiment: 0, 
      entities: [] 
    };
  }

  try {
    let prompt = `You are a neutral, objective political analyst. 
    Analyze the following news item. 
    1. Provide a structured summary. Start with a concise paragraph describing the main event (approx 30 words). Then, provide 2-3 bullet points highlighting key implications or details.
    2. Determine the sentiment score from -1.0 (negative) to 1.0 (positive).
    3. Extract key political entities (people, organizations, countries).
    
    Title: ${title}
    Snippet: ${snippet}`;

    if (url) {
      prompt += `\n\nAdditional Context URL: ${url}\nPlease read the content from this URL to provide a complete analysis if the snippet is insufficient.`;
    }

    const config: any = {};

    if (url) {
      config.tools = [{ urlContext: {} }, { googleSearch: {} }];
      prompt += `\n\nIMPORTANT: You MUST return ONLY valid JSON. Do not include markdown formatting like \`\`\`json. The JSON must match this structure exactly:
      {
        "summary": "Concise paragraph describing main event, followed by 2-3 bullet points.",
        "sentiment": 0.5,
        "entities": ["Entity1", "Entity2"]
      }
      If you cannot access the URL directly, use Google Search to find information about the article title to write the summary.
      If you STILL cannot find any information, you MUST STILL return valid JSON with a generic summary based on the title, e.g., {"summary": "Based on the title, this article discusses...", "sentiment": 0, "entities": []}. NEVER return plain text.`;
    } else {
      config.responseMimeType = "application/json";
      config.responseSchema = {
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
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from Gemini");
    
    // Try to extract JSON if it's wrapped in markdown or has extra text
    let cleanText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleanText = jsonMatch[0];
    }
    
    try {
        const parsed = JSON.parse(cleanText) as AnalysisResult;
        if (!parsed.summary || parsed.summary.trim() === "") {
            parsed.summary = "AI could not generate a summary for this article. It may be behind a strict paywall or lack sufficient content.";
        }
        if (!parsed.entities || !Array.isArray(parsed.entities)) {
            parsed.entities = [];
        }
        if (typeof parsed.sentiment !== 'number') {
            parsed.sentiment = 0;
        }
        return parsed;
    } catch (parseError) {
        console.error("Failed to parse JSON from Gemini. Raw response:", responseText);
        throw parseError; // Re-throw to be caught by outer catch block
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Gemini Analysis Error:", errorMsg);
    return {
        summary: `AI Analysis failed: ${errorMsg}\n\nThis usually happens if the article is behind a strict paywall, blocks AI crawlers, or triggers safety filters.`,
        sentiment: 0,
        entities: []
    };
  }
}
