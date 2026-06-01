export interface DomainLimiterConfig {
  minDelayMs: number;
}

export function createDomainLimiter(config: DomainLimiterConfig) {
  const nextByDomain = new Map<string, number>();

  return {
    nextAllowedAt(domain: string, now = new Date()) {
      const current = now.getTime();
      const next = nextByDomain.get(domain) ?? current;
      const allowed = Math.max(current, next);
      nextByDomain.set(domain, allowed + config.minDelayMs);
      return new Date(allowed);
    },
  };
}

export function shouldRetryFetch(input: { status?: number; attempts: number; maxAttempts: number }) {
  if (input.attempts >= input.maxAttempts) return false;
  if (!input.status) return true;
  return [408, 425, 429, 500, 502, 503, 504].includes(input.status);
}

export function robotsAllowsPath(robotsText: string, path: string, userAgent = "PolitiStreamResearchBot") {
  const groups = parseRobotsGroups(robotsText);
  const direct = groups.get(userAgent.toLowerCase()) ?? groups.get("*") ?? [];
  const disallowed = direct
    .filter((rule) => rule.type === "disallow" && rule.value)
    .some((rule) => path.startsWith(rule.value));
  const allowed = direct
    .filter((rule) => rule.type === "allow" && rule.value)
    .some((rule) => path.startsWith(rule.value));
  return allowed || !disallowed;
}

function parseRobotsGroups(robotsText: string) {
  const groups = new Map<string, Array<{ type: "allow" | "disallow"; value: string }>>();
  let currentAgents: string[] = [];

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      currentAgents = [value.toLowerCase()];
      for (const agent of currentAgents) {
        if (!groups.has(agent)) groups.set(agent, []);
      }
      continue;
    }
    if ((key === "allow" || key === "disallow") && currentAgents.length > 0) {
      for (const agent of currentAgents) {
        groups.get(agent)?.push({ type: key, value });
      }
    }
  }

  return groups;
}
