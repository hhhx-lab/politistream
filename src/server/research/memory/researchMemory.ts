export function topicFingerprint(topic: string) {
  const normalized = topic.trim().replace(/\s+/g, " ");
  return /[\u4e00-\u9fff]/.test(normalized) ? normalized : normalized.toLowerCase();
}

export function shouldReuseDocument(input: {
  fetchedAt: string;
  now: string;
  maxAgeHours: number;
  contentHashMatches: boolean;
}) {
  if (!input.contentHashMatches) return false;
  const ageMs = new Date(input.now).getTime() - new Date(input.fetchedAt).getTime();
  return ageMs >= 0 && ageMs <= input.maxAgeHours * 60 * 60 * 1000;
}
