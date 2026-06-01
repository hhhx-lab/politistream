import { ExtractorKind } from "../types";

export function routeExtractorForUrl(url: string, contentType = ""): ExtractorKind {
  const lowerUrl = url.toLowerCase();
  const lowerType = contentType.toLowerCase();

  if (lowerType.includes("pdf") || lowerUrl.endsWith(".pdf")) return "pdf";
  if (lowerUrl.includes("github.com/")) return "github";
  if (lowerUrl.includes("npmjs.com/package/") || lowerUrl.includes("registry.npmjs.org/")) return "npm";
  if (lowerUrl.includes("pypi.org/project/") || lowerUrl.includes("pypi.org/pypi/")) return "pypi";
  if (lowerUrl.endsWith("sitemap.xml") || lowerUrl.includes("/sitemap")) return "sitemap";
  if (lowerType.includes("xml")) return "sitemap";
  return "html";
}
