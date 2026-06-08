import { canonicalizeUrl } from "../url";
import { ExtractedDocument, ExtractedTable } from "../types";

export async function extractPdfDocument(buffer: Buffer, url: string): Promise<ExtractedDocument> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const [textResult, infoResult] = await Promise.all([
    parser.getText(),
    parser.getInfo().catch(() => undefined),
  ]);
  await parser.destroy();
  const info = infoResult?.info as Record<string, unknown> | undefined;

  const contentText = (textResult.text ?? "").trim();
  const tables = extractPdfTextTables(contentText);

  return {
    url,
    canonicalUrl: canonicalizeUrl(url) ?? url,
    title: typeof info?.Title === "string" ? info.Title : undefined,
    contentText,
    links: [],
    tables,
    metadata: {
      ...info,
      pages: infoResult?.total,
      tableCount: tables.length,
      tableExtraction: "text-layout-heuristic",
    },
    extractor: "pdf",
  };
}

export function extractPdfTextTables(text: string): ExtractedTable[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tables: ExtractedTable[] = [];
  let block: string[][] = [];

  const flush = () => {
    if (block.length < 2) {
      block = [];
      return;
    }
    const width = Math.max(...block.map((row) => row.length));
    const normalized = block
      .filter((row) => row.length >= 2)
      .map((row) => row.concat(Array(Math.max(0, width - row.length)).fill("")));
    if (normalized.length >= 2) {
      tables.push({
        caption: `PDF table candidate ${tables.length + 1}`,
        headers: normalized[0].map((cell) => cell.slice(0, 120)),
        rows: normalized.slice(1, 101).map((row) => row.map((cell) => cell.slice(0, 240))),
      });
    }
    block = [];
  };

  for (const line of lines) {
    const cells = splitTableLine(line);
    if (cells.length >= 2) {
      block.push(cells);
      continue;
    }
    flush();
  }
  flush();

  return tables.slice(0, 20);
}

function splitTableLine(line: string) {
  const normalized = line.replace(/\u00a0/g, " ").trim();
  const delimiter = normalized.includes("\t")
    ? /\t+/
    : normalized.includes("|")
      ? /\s*\|\s*/
      : normalized.includes(",") && normalized.split(",").length >= 3
        ? /\s*,\s*/
        : /\s{2,}/;
  return normalized
    .split(delimiter)
    .map((cell) => cell.trim())
    .filter(Boolean);
}
