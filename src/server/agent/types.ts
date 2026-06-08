import { ResearchBudget } from "../research/types";

export type AgentIntent = "research-crawl" | "data-analysis" | "visualization" | "mixed" | "unknown";

export interface AgentDispatchInput {
  message: string;
  execute?: boolean;
  seedUrls?: string[];
  budget?: Partial<ResearchBudget>;
  dataRows?: Array<Record<string, unknown>>;
}

export interface AgentTaskPlan {
  id: string;
  intent: AgentIntent;
  title: string;
  description: string;
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
}

export interface AgentDispatchPlan {
  intent: AgentIntent;
  answer: string;
  tasks: AgentTaskPlan[];
  warnings: string[];
}
