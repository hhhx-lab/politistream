import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type RawAssetExtension = "html" | "txt" | "pdf" | "json";

export interface AssetPathInput {
  rootDir: string;
  runId: string;
  documentId: string;
  extension: RawAssetExtension;
}

export interface WriteRawAssetInput extends AssetPathInput {
  content: string | Buffer;
}

export interface WrittenRawAsset {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export function assetPathFor(input: AssetPathInput) {
  return path.join(input.rootDir, input.runId, `${input.documentId}.${input.extension}`);
}

export async function writeRawAsset(input: WriteRawAssetInput): Promise<WrittenRawAsset> {
  const filePath = assetPathFor(input);
  const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);

  return {
    path: filePath,
    sha256: sha256ForContent(content),
    sizeBytes: content.byteLength,
  };
}

export async function readRawAsset(filePath: string) {
  return readFile(filePath);
}

export function sha256ForContent(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}
