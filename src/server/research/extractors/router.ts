import { ExtractorKind } from "../types";

export function routeExtractorForUrl(url: string, contentType = ""): ExtractorKind {
  const lowerUrl = url.toLowerCase();
  const lowerType = contentType.toLowerCase();

  if (lowerType.includes("pdf") || lowerUrl.endsWith(".pdf")) return "pdf";
  if (lowerType.includes("text/csv") || lowerUrl.endsWith(".csv") || lowerUrl.endsWith(".tsv")) return "csv";
  if (lowerUrl.endsWith(".geojson") || lowerType.includes("geo+json")) return "geojson";
  if (lowerType.includes("json") || lowerUrl.endsWith(".json")) return "json";
  if (lowerUrl.endsWith(".jsonl") || lowerUrl.endsWith(".ndjson")) return "jsonl";
  if (lowerUrl.endsWith(".parquet")) return "parquet";
  if (lowerUrl.endsWith(".xlsx") || lowerUrl.endsWith(".xls")) return "excel";
  if (lowerUrl.endsWith(".docx")) return "docx";
  if (lowerUrl.endsWith(".pptx")) return "pptx";
  if (lowerUrl.endsWith(".txt")) return "txt";
  if (lowerUrl.endsWith(".md") || lowerUrl.endsWith(".markdown")) return "md";
  if (lowerUrl.includes("sdmx") || lowerUrl.endsWith(".sdmx")) return "sdmx";
  if (lowerUrl.endsWith(".xbrl") || lowerUrl.endsWith(".xml") && lowerUrl.includes("xbrl")) return "xbrl";
  if (lowerUrl.endsWith(".nc") || lowerUrl.endsWith(".netcdf")) return "netcdf";
  if (lowerUrl.includes("github.com/")) return "github";
  if (lowerUrl.includes("npmjs.com/package/") || lowerUrl.includes("registry.npmjs.org/")) return "npm";
  if (lowerUrl.includes("pypi.org/project/") || lowerUrl.includes("pypi.org/pypi/")) return "pypi";
  if (lowerUrl.endsWith("sitemap.xml") || lowerUrl.includes("/sitemap")) return "sitemap";
  if (lowerType.includes("xml")) return "sitemap";
  return "html";
}
