import { getResearchConfig, isValidApiKey, resolveAiBaseUrl, resolveAiProvider, type ResearchConfig } from "../research/config";

export type StructuredAiProvider = "gpt-compatible";

export interface StructuredJsonSchemas {
  openai: Record<string, unknown>;
}

export interface StructuredGenerationInput<T = unknown> {
  instructions: string;
  prompt: string;
  schemaName: string;
  schemas: StructuredJsonSchemas;
  url?: string;
  model?: string;
  env?: NodeJS.ProcessEnv;
}

export interface StructuredGenerationResult<T = unknown> {
  provider: StructuredAiProvider;
  model: string;
  data: T;
}

export async function generateStructuredJson<T = unknown>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T> | null> {
  const config = getResearchConfig(input.env ?? process.env);
  const provider = resolveAiProvider(config);
  if (!provider || !isValidApiKey(config.aiApiKey, "MY_AI_API_KEY")) {
    return null;
  }

  try {
    return await generateGptCompatibleStructuredJson<T>(input, config, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("response_format")) {
      console.warn(`[llm] GPT-compatible provider rejected response_format, retrying without it: ${message}`);
      return await generateGptCompatibleStructuredJson<T>(input, config, false);
    }
    console.warn(`[llm] GPT-compatible structured generation failed: ${message}`);
    throw error;
  }
}

export function resolveProviderOrder(config = getResearchConfig()): StructuredAiProvider[] {
  return resolveAiProvider(config) ? ["gpt-compatible"] : [];
}

async function generateGptCompatibleStructuredJson<T>(
  input: StructuredGenerationInput<T>,
  config: ResearchConfig,
  includeResponseFormat: boolean,
): Promise<StructuredGenerationResult<T>> {
  const model = input.model ?? config.aiModel;
  const response = await fetch(buildChatCompletionsUrl(resolveAiBaseUrl(config)), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiApiKey}`,
    },
    body: JSON.stringify(stripUndefined({
      model,
      messages: [
        {
          role: "system",
          content: `${input.instructions}\n\n你必须只输出一个合法 JSON 对象，不要输出 Markdown、代码块或解释文字。JSON 结构必须满足以下 schema：\n${JSON.stringify(input.schemas.openai)}`,
        },
        {
          role: "user",
          content: input.url ? `${input.prompt}\n\n参考来源 URL: ${input.url}` : input.prompt,
        },
      ],
      response_format: includeResponseFormat ? { type: "json_object" } : undefined,
      temperature: 0.2,
    })),
  });

  const payload = await response.json() as Record<string, any>;
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error?.code || `GPT-compatible request failed with HTTP ${response.status}`);
  }

  const text = extractChatCompletionText(payload);
  if (!text) {
    throw new Error("GPT-compatible response did not include structured text.");
  }

  return {
    provider: "gpt-compatible",
    model,
    data: JSON.parse(cleanJsonText(text)) as T,
  };
}

function extractChatCompletionText(payload: Record<string, any>) {
  const message = payload.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (typeof block?.text === "string") return block.text;
        if (typeof block?.content === "string") return block.content;
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function buildChatCompletionsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/chat/completions")) {
    url.pathname = path;
  } else if (path.endsWith("/v1")) {
    url.pathname = `${path}/chat/completions`;
  } else if (!path) {
    url.pathname = "/v1/chat/completions";
  } else {
    url.pathname = `${path}/chat/completions`;
  }

  return url.toString();
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function cleanJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith("```")) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match?.[1]) return match[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
