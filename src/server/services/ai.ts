import { generateStructuredJson } from "./llm";

export interface AnalysisResult {
  summary: string;
  sentiment: number;
  entities: string[];
}

const ANALYSIS_SCHEMA_OPENAI = {
  type: "object",
  properties: {
    summary: { type: "string" },
    sentiment: { type: "number" },
    entities: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "sentiment", "entities"],
  additionalProperties: false,
};

export async function analyzeContent(title: string, snippet: string, url?: string): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(title, snippet, url);

  try {
    const result = await generateStructuredJson<AnalysisResult>({
      instructions: "你是一位享誉全球的资深政治评论员与数据分析专家。请对以下新闻内容进行深度分析与提炼。",
      prompt,
      schemaName: "news_analysis",
      schemas: {
        openai: ANALYSIS_SCHEMA_OPENAI,
      },
      url,
    });

    if (!result) {
      return {
        summary: "AI 分析已禁用，因为当前没有可用的 GPT 中转站配置。请在 .env 中填写 AI_BASE_URL、AI_API_KEY 和 AI_MODEL。",
        sentiment: 0,
        entities: [],
      };
    }

    return normalizeAnalysisResult(result.data);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("AI Analysis Error:", errorMsg);
    return {
      summary: `AI 分析失败：${errorMsg}\n\n常见原因是文章位于严格付费墙之后、阻止 AI 爬虫访问，或触发了安全过滤。`,
      sentiment: 0,
      entities: [],
    };
  }
}

function buildAnalysisPrompt(title: string, snippet: string, url?: string) {
  let prompt = `请对以下新闻内容进行深度分析与提炼。

你的任务：
1. 深度摘要 (Structured Summary):
   - 第一部分：用一段约 80-120 字的文字，精准概括该事件的核心事实及其在全球或区域政治版图中的位置。
   - 第二部分：提供 3-4 个深度洞察点（Bullet Points），分析该事件的潜在影响、多方博弈细节或未来发展趋势。
2. 情感量化 (Sentiment): 判定该新闻的政治情感倾向，分值范围：-1.0（极端负面/对抗）到 1.0（极端正面/合作）。
3. 关键实体提取 (Entities): 识别并提取新闻中涉及的所有关键政治人物、政党、政府机构及国际组织。

语言要求: 必须全部使用简体中文输出。

待分析内容：
标题: ${title}
正文片段: ${snippet}`;

  if (url) {
    prompt += `\n\n参考来源 URL: ${url}\n如果上述片段信息不足，请优先阅读并理解该 URL 中的完整内容。`;
  }

  prompt += `\n\n请仅返回合法 JSON 对象，结构必须严格如下：
{
  "summary": "此处为深度摘要内容...",
  "sentiment": 0.5,
  "entities": ["实体1", "实体2"]
}`;

  return prompt;
}

function normalizeAnalysisResult(input: AnalysisResult): AnalysisResult {
  return {
    summary: sanitizeSummary(input.summary),
    sentiment: clampSentiment(input.sentiment),
    entities: normalizeEntities(input.entities),
  };
}

function sanitizeSummary(summary: unknown) {
  if (typeof summary !== "string" || summary.trim() === "") {
    return "AI 暂时无法为此文章生成有效摘要，可能受限于网页加密或内容长度。";
  }
  return summary.trim();
}

function clampSentiment(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1, Math.min(1, numeric));
}

function normalizeEntities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entity) => String(entity).trim())
    .filter(Boolean);
}
