import { canonicalizeUrl } from "../url";
import { ExtractedDocument } from "../types";

export async function extractPdfDocument(buffer: Buffer, url: string): Promise<ExtractedDocument> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const [textResult, infoResult] = await Promise.all([
    parser.getText(),
    parser.getInfo().catch(() => undefined),
  ]);
  await parser.destroy();
  const info = infoResult?.info as Record<string, unknown> | undefined;

  return {
    url,
    canonicalUrl: canonicalizeUrl(url) ?? url,
    title: typeof info?.Title === "string" ? info.Title : undefined,
    contentText: (textResult.text ?? "").trim(),
    links: [],
    tables: [],
    metadata: {
      ...info,
      pages: infoResult?.total,
    },
    extractor: "pdf",
  };
}
