import axios from "axios";
import { canonicalizeUrl } from "../url";
import { ExtractedDocument } from "../types";

export async function extractNpmDocument(url: string): Promise<ExtractedDocument> {
  const packageName = parseNpmPackageName(url);
  if (!packageName) throw new Error("invalid_npm_package_url");

  const response = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
    timeout: 15000,
  });
  const data = response.data ?? {};
  const latestVersion = data["dist-tags"]?.latest;
  const latest = latestVersion ? data.versions?.[latestVersion] : undefined;
  const contentText = [
    data.name,
    data.description,
    `Latest version: ${latestVersion ?? "unknown"}`,
    `License: ${latest?.license ?? data.license ?? "unknown"}`,
    `Homepage: ${latest?.homepage ?? data.homepage ?? ""}`,
    `Repository: ${normalizeRepositoryUrl(latest?.repository ?? data.repository)}`,
    `Keywords: ${(latest?.keywords ?? data.keywords ?? []).join(", ")}`,
    "",
    latest?.readme ?? data.readme ?? "",
  ].filter(Boolean).join("\n");

  return {
    url,
    canonicalUrl: canonicalizeUrl(`https://www.npmjs.com/package/${packageName}`) ?? url,
    title: data.name ?? packageName,
    contentText,
    links: [
      { url: `https://www.npmjs.com/package/${packageName}`, text: "npm" },
      latest?.homepage && { url: latest.homepage, text: "Homepage" },
      normalizeRepositoryUrl(latest?.repository ?? data.repository) && {
        url: normalizeRepositoryUrl(latest?.repository ?? data.repository),
        text: "Repository",
      },
    ].filter(Boolean) as Array<{ url: string; text: string }>,
    tables: [],
    metadata: {
      latestVersion,
      license: latest?.license ?? data.license,
      modified: data.time?.modified,
      created: data.time?.created,
      versions: data.versions ? Object.keys(data.versions).length : 0,
    },
    extractor: "npm",
  };
}

export async function extractPyPiDocument(url: string): Promise<ExtractedDocument> {
  const packageName = parsePyPiPackageName(url);
  if (!packageName) throw new Error("invalid_pypi_package_url");

  const response = await axios.get(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`, {
    timeout: 15000,
  });
  const info = response.data?.info ?? {};
  const releases = response.data?.releases ?? {};
  const contentText = [
    info.name,
    info.summary,
    `Latest version: ${info.version ?? "unknown"}`,
    `License: ${info.license || "unknown"}`,
    `Project URL: ${info.project_url ?? ""}`,
    `Requires Python: ${info.requires_python ?? ""}`,
    `Keywords: ${info.keywords ?? ""}`,
    "",
    info.description ?? "",
  ].filter(Boolean).join("\n");

  return {
    url,
    canonicalUrl: canonicalizeUrl(info.project_url ?? `https://pypi.org/project/${packageName}/`) ?? url,
    title: info.name ?? packageName,
    contentText,
    links: Object.entries(info.project_urls ?? {}).map(([text, link]) => ({ text, url: String(link) })),
    tables: [],
    metadata: {
      version: info.version,
      license: info.license,
      requiresPython: info.requires_python,
      releases: Object.keys(releases).length,
      classifiers: info.classifiers ?? [],
    },
    extractor: "pypi",
  };
}

function parseNpmPackageName(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "registry.npmjs.org") {
      return decodeURIComponent(url.pathname.slice(1));
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "package") return "";
    return parts[1]?.startsWith("@") ? `${parts[1]}/${parts[2] ?? ""}` : parts[1];
  } catch {
    return "";
  }
}

function parsePyPiPackageName(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "project") return parts[1];
    if (parts[0] === "pypi") return parts[1];
    return "";
  } catch {
    return "";
  }
}

function normalizeRepositoryUrl(repository: unknown) {
  if (!repository) return "";
  if (typeof repository === "string") return repository.replace(/^git\+/, "").replace(/\.git$/, "");
  if (typeof repository === "object" && "url" in repository) {
    return String((repository as { url?: string }).url ?? "").replace(/^git\+/, "").replace(/\.git$/, "");
  }
  return "";
}
