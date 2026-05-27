export function planQueries(topic: string, seedUrls: string[] = []): string[] {
  const normalizedTopic = topic.trim();
  const queries = new Set<string>();

  if (normalizedTopic) {
    queries.add(normalizedTopic);
    queries.add(`${normalizedTopic} latest`);
    queries.add(`${normalizedTopic} official statement OR report`);
  }

  for (const seedUrl of seedUrls) {
    try {
      const hostname = new URL(seedUrl).hostname.replace(/^www\./, "");
      if (normalizedTopic) {
        queries.add(`site:${hostname} ${normalizedTopic}`);
      }
    } catch {
      // Ignore invalid seed URLs; validation happens at job creation/API boundaries.
    }
  }

  return [...queries].slice(0, 8);
}
