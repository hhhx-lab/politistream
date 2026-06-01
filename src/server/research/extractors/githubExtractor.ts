import axios from "axios";
import { getResearchConfig } from "../config";
import { canonicalizeUrl } from "../url";
import { ExtractedDocument } from "../types";

export async function extractGitHubDocument(url: string): Promise<ExtractedDocument> {
  const repo = parseGitHubRepo(url);
  if (!repo) throw new Error("invalid_github_repository_url");

  const config = getResearchConfig();
  const headers = config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : undefined;
  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
  const [repoResponse, readmeResponse] = await Promise.all([
    axios.get(apiUrl, { headers, timeout: 15000 }),
    axios.get(`${apiUrl}/readme`, {
      headers: { ...headers, Accept: "application/vnd.github.raw" },
      timeout: 15000,
    }).catch(() => undefined),
  ]);

  const data = repoResponse.data ?? {};
  const readme = typeof readmeResponse?.data === "string" ? readmeResponse.data : "";
  const contentText = [
    data.full_name,
    data.description,
    `Stars: ${data.stargazers_count ?? 0}`,
    `Forks: ${data.forks_count ?? 0}`,
    `Open issues: ${data.open_issues_count ?? 0}`,
    `License: ${data.license?.spdx_id ?? "unknown"}`,
    `Updated at: ${data.updated_at ?? "unknown"}`,
    "",
    readme,
  ].filter(Boolean).join("\n");

  return {
    url,
    canonicalUrl: canonicalizeUrl(data.html_url ?? url) ?? url,
    title: data.full_name,
    contentText,
    links: [
      data.html_url && { url: data.html_url, text: "Repository" },
      data.homepage && { url: data.homepage, text: "Homepage" },
      data.html_url && { url: `${data.html_url}/releases`, text: "Releases" },
      data.html_url && { url: `${data.html_url}/issues`, text: "Issues" },
    ].filter(Boolean) as Array<{ url: string; text: string }>,
    tables: [],
    metadata: {
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      license: data.license?.spdx_id,
      language: data.language,
      pushedAt: data.pushed_at,
      updatedAt: data.updated_at,
    },
    extractor: "github",
  };
}

function parseGitHubRepo(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, name] = url.pathname.split("/").filter(Boolean);
    if (!owner || !name) return null;
    return { owner, name };
  } catch {
    return null;
  }
}
