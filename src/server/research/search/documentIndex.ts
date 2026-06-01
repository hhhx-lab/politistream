export function normalizeDocumentSearchQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]+/gu, ""))
    .filter(Boolean)
    .join(" & ");
}
