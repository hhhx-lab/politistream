import { Request, Response } from "express";
import {
  getResearchConfig,
  getResearchConfigStatus,
  ResearchConfigurationError,
} from "./config";

export function sendResearchConfigStatus(_req: Request, res: Response) {
  res.json(getResearchConfigStatus(getResearchConfig()));
}

export function sendResearchError(res: Response, error: unknown) {
  if (error instanceof ResearchConfigurationError) {
    return res.status(error.statusCode).json({
      error: "research_configuration_error",
      message: error.message,
      status: getResearchConfigStatus(getResearchConfig()),
    });
  }

  console.error("Research API error:", error);
  return res.status(500).json({
    error: "research_internal_error",
    message: error instanceof Error ? error.message : "Unknown research API error",
  });
}
