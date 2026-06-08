export function normalizeProviderTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();

  const raw = String(value).trim();
  if (!raw || isRelativeTimestamp(raw)) return undefined;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isRelativeTimestamp(value: string) {
  return /\b(ago|前|yesterday|today|tomorrow|just now|刚刚)\b/i.test(value);
}
