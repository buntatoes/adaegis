export interface Settings {
  enabled: boolean;
  cosmetic: boolean;
  youtubeExperimental: boolean;
  allowlist: string[];
}

export const DEFAULTS: Settings = {
  enabled: true, cosmetic: true, youtubeExperimental: false, allowlist: []
};

export function hostname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase() : null;
  } catch { return null; }
}

export function normalize(raw: Record<string, unknown>): Settings {
  const allowlist = Array.isArray(raw.allowlist)
    ? [...new Set(raw.allowlist.filter((host): host is string =>
      typeof host === "string" && hostname("https://" + host) === host &&
      !/[/:?#@*]/.test(host)))].sort().slice(0, 200)
    : [];
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    cosmetic: typeof raw.cosmetic === "boolean" ? raw.cosmetic : true,
    youtubeExperimental: raw.youtubeExperimental === true,
    allowlist
  };
}

export function exceptionRules(hosts: string[]): chrome.declarativeNetRequest.Rule[] {
  return hosts.map((host, index) => ({
    id: 10000 + index,
    priority: 100,
    action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW_ALL_REQUESTS },
    condition: {
      // Exact hostname (including www), optional port. No suffix/substring matches.
      regexFilter: "^https?://" + host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(:[0-9]+)?/",
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
    }
  }));
}
