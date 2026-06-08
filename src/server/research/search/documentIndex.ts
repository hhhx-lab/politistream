const CJK_TOKEN_MIN_LENGTH = 2;
const MAX_SEARCH_TOKENS = 12;

export function tokenizeDocumentSearchQuery(query: string): string[] {
  const normalized = query
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return [];

  const tokens = new Set<string>();
  for (const token of normalized.split(" ")) {
    const cleaned = token.trim();
    if (!cleaned) continue;
    tokens.add(cleaned);

    if (/[\u4e00-\u9fff]/.test(cleaned)) {
      for (let size = CJK_TOKEN_MIN_LENGTH; size <= Math.min(4, cleaned.length); size += 1) {
        for (let index = 0; index <= cleaned.length - size; index += 1) {
          tokens.add(cleaned.slice(index, index + size));
        }
      }
    }
  }

  return [...tokens].slice(0, MAX_SEARCH_TOKENS);
}

export function normalizeDocumentSearchQuery(query: string) {
  return tokenizeDocumentSearchQuery(query).join(" & ");
}
