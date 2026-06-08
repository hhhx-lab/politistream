import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { performance } from "perf_hooks";
import { promisify } from "util";
import { ExtractedDocument, ExtractorKind, ExtractedLink, ExtractedTable } from "../types";
import { canonicalizeUrl } from "../url";

const execFileAsync = promisify(execFile);

export interface StructuredInspectorInput {
  url: string;
  contentType: string;
  kind: ExtractorKind;
  buffer: Buffer;
  title?: string;
  maxRows?: number;
  env?: NodeJS.ProcessEnv;
}

export async function inspectStructuredBuffer(input: StructuredInspectorInput): Promise<ExtractedDocument> {
  const workDir = await mkdtemp(path.join(tmpdir(), "politistream-structured-"));
  const sourcePath = path.join(workDir, `source.${extensionForKind(input.kind)}`);
  const inputPath = path.join(workDir, "input.json");
  const outputPath = path.join(workDir, "output.json");
  const startedAt = performance.now();

  try {
    await writeFile(sourcePath, input.buffer);
    await writeFile(
      inputPath,
      JSON.stringify({
        sourcePath,
        url: input.url,
        contentType: input.contentType,
        kind: input.kind,
        title: input.title,
        maxRows: input.maxRows ?? 50,
      }, null, 2),
      "utf-8",
    );

    await execFileAsync(
      input.env?.ANALYTICS_PYTHON_BIN || process.env.ANALYTICS_PYTHON_BIN || "python3",
      [
        "-m",
        "politistream_analytics.worker",
        "inspect-file",
        "--input",
        inputPath,
        "--output",
        outputPath,
      ],
      {
        cwd: input.env?.ANALYTICS_WORKER_DIR || process.env.ANALYTICS_WORKER_DIR || path.resolve(process.cwd(), "workers-analytics"),
        timeout: Number(input.env?.ANALYTICS_WORKER_TIMEOUT_MS || process.env.ANALYTICS_WORKER_TIMEOUT_MS || 120000),
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PYTHONPATH: input.env?.ANALYTICS_WORKER_DIR || process.env.ANALYTICS_WORKER_DIR || path.resolve(process.cwd(), "workers-analytics"),
          ...(input.env ?? {}),
        },
      },
    );

    const result = JSON.parse(await readFile(outputPath, "utf-8")) as {
      title?: string;
      contentText?: string;
      contentMarkdown?: string;
      links?: Array<ExtractedLink | { url: string; text?: string; context?: string }>;
      tables?: ExtractedTable[];
      metadata?: Record<string, unknown>;
      extractor?: ExtractorKind;
    };

    return {
      url: input.url,
      canonicalUrl: canonicalizeUrl(input.url) ?? input.url,
      title: result.title || input.title,
      contentText: result.contentText ?? "",
      contentMarkdown: result.contentMarkdown,
      links: normalizeLinks(result.links),
      tables: Array.isArray(result.tables) ? result.tables : [],
      metadata: result.metadata ?? {},
      extractor: result.extractor ?? input.kind,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function normalizeLinks(links: StructuredInspectorInputResult["links"] | undefined): ExtractedLink[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      url: String(link.url ?? "").trim(),
      text: String(link.text ?? "").trim(),
      context: typeof link.context === "string" ? link.context : undefined,
    }))
    .filter((link) => Boolean(link.url));
}

type StructuredInspectorInputResult = {
  links?: Array<ExtractedLink | { url: string; text?: string; context?: string }>;
};

function extensionForKind(kind: ExtractorKind) {
  switch (kind) {
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "jsonl":
      return "jsonl";
    case "parquet":
      return "parquet";
    case "excel":
      return "xlsx";
    case "geojson":
      return "geojson";
    case "docx":
      return "docx";
    case "pptx":
      return "pptx";
    case "pdf":
      return "pdf";
    case "txt":
      return "txt";
    case "md":
      return "md";
    case "sdmx":
    case "xbrl":
    case "netcdf":
      return "xml";
    case "html":
    case "github":
    case "npm":
    case "pypi":
    case "sitemap":
    case "table":
    default:
      return "html";
  }
}
