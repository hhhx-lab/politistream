import { GoogleGenAI } from "@google/genai";
import { getResearchConfig, isValidApiKey, resolveAiProvider, type ResearchConfig } from "../research/config";

export type StructuredAiProvider = "openai" | "gemini";

export interface StructuredJsonSchemas {
  openai: Record<string, unknown>;
  gemini: unknown;
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
  const providerOrder = resolveProviderOrder(config);
  let attempted = false;
  let lastError: Error | null = null;

  for (const provider of providerOrder) {
    try {
      if (provider === "openai") {
        if (!isValidApiKey(config.openaiApiKey, "MY_OPENAI_API_KEY")) continue;
        attempted = true;
        return await generateOpenAiStructuredJson<T>(input, config);
      }

      if (provider === "gemini") {
        if (!isValidApiKey(config.geminiApiKey, "MY_GEMINI_API_KEY")) continue;
        attempted = true;
        return await generateGeminiStructuredJson<T>(input, config);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      console.warn(`[llm] ${provider} structured generation failed: ${message}`);
    }
  }

  if (attempted && lastError) {
    throw lastError;
  }

  return null;
}

export function resolveProviderOrder(config = getResearchConfig()): StructuredAiProvider[] {
  const preferred = resolveAiProvider(config);
  if (preferred === "gemini") return ["gemini", "openai"];
  return ["openai", "gemini"];
}

async function generateOpenAiStructuredJson<T>(
  input: StructuredGenerationInput<T>,
  config: ResearchConfig,
): Promise<StructuredGenerationResult<T>> {
  const model = input.model ?? config.aiModel;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: input.url ? `${input.prompt}\n\n参考来源 URL: ${input.url}` : input.prompt,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schemas.openai,
        },
      },
    }),
  });

  const payload = await response.json() as Record<string, any>;
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error?.code || `OpenAI request failed with HTTP ${response.status}`);
  }

  const text = extractOpenAiText(payload);
  if (!text) {
    throw new Error("OpenAI response did not include structured text.");
  }

  return {
    provider: "openai",
    model,
    data: JSON.parse(cleanJsonText(text)) as T,
  };
}

async function generateGeminiStructuredJson<T>(
  input: StructuredGenerationInput<T>,
  config: ResearchConfig,
): Promise<StructuredGenerationResult<T>> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey as string });
  const prompt = input.url
    ? `${input.instructions}\n\n${input.prompt}\n\n参考来源 URL: ${input.url}`
    : `${input.instructions}\n\n${input.prompt}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: input.schemas.gemini as any,
      ...(input.url ? { tools: [{ urlContext: {} }] } : {}),
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini response did not include text.");
  }

  return {
    provider: "gemini",
    model: "gemini-2.0-flash",
    data: JSON.parse(cleanJsonText(text)) as T,
  };
}

function extractOpenAiText(payload: Record<string, any>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputs = Array.isArray(payload.output) ? payload.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (block?.type === "output_text" && typeof block.text === "string" && block.text.trim()) {
        return block.text;
      }
    }
  }

  return "";
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
