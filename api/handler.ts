import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../serverless.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  const path = requestUrl.searchParams.get("path");

  if (path) {
    requestUrl.searchParams.delete("path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${path.replace(/^\/+/, "")}${query ? `?${query}` : ""}`;
  }

  return app(req as any, res as any);
}
