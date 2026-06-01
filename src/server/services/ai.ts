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
      summary: "AI 分析已禁用，因为 GEMINI_API_KEY 缺失或无效。请检查环境变量配置。",
      sentiment: 0, 
      entities: [] 
    };
  }

  try {
    let prompt = `你是一位享誉全球的资深政治评论员与数据分析专家。
    请对以下新闻内容进行深度分析与提炼。

    你的任务：
    1. **深度摘要 (Structured Summary)**: 
       - 第一部分：用一段约 80-120 字的文字，精准概括该事件的核心事实及其在全球或区域政治版图中的位置。
       - 第二部分：提供 3-4 个深度洞察点（Bullet Points），分析该事件的潜在影响、多方博弈细节或未来发展趋势。
    2. **情感量化 (Sentiment)**: 判定该新闻的政治情感倾向，分值范围：-1.0（极端负面/对抗）到 1.0（极端正面/合作）。
    3. **关键实体提取 (Entities)**: 识别并提取新闻中涉及的所有关键政治人物、政党、政府机构及国际组织。

    **语言要求**: 必须全部使用 **简体中文** 输出。
    
    待分析内容：
    标题: ${title}
    正文片段: ${snippet}`;

    if (url) {
      prompt += `\n\n参考来源 URL: ${url}\n如果上述片段信息不足，请优先阅读并理解该 URL 中的完整内容。`;
    }

    const config: any = {};

    if (url) {
      config.tools = [{ urlContext: {} }];
      prompt += `\n\n**重要指令**: 你必须仅返回合法的 JSON 对象。严禁包含 markdown 代码块标记或任何多余文字。JSON 结构必须严格如下：
      {
        "summary": "此处为深度摘要内容...",
        "sentiment": 0.5,
        "entities": ["实体1", "实体2"]
      }
      如果无法直接访问 URL，请根据标题和片段进行逻辑推断生成摘要。切勿返回空值。`;
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
      model: "gemini-2.0-flash",
      contents: prompt,
      config
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from AI");
    
    // Try to extract JSON if it's wrapped in markdown or has extra text
    let cleanText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleanText = jsonMatch[0];
    }
    
    try {
        const parsed = JSON.parse(cleanText) as AnalysisResult;
        if (!parsed.summary || parsed.summary.trim() === "") {
            parsed.summary = "AI 暂时无法为此文章生成有效摘要，可能受限于网页加密或内容长度。";
        }
        if (!parsed.entities || !Array.isArray(parsed.entities)) {
            parsed.entities = [];
        }
        if (typeof parsed.sentiment !== 'number') {
            parsed.sentiment = 0;
        }
        return parsed;
    } catch (parseError) {
        console.error("Failed to parse JSON from AI. Raw response:", responseText);
        throw parseError;
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("AI Analysis Error:", errorMsg);
    return {
        summary: `AI 分析失败：${errorMsg}\n\n常见原因是文章位于严格付费墙之后、阻止 AI 爬虫访问，或触发了安全过滤。`,
        sentiment: 0,
        entities: []
    };
  }
}
