export interface Settings {
  enabled: boolean;
  cosmetic: boolean;
  youtubeExperimental: boolean;
  allowlist: string[];
}

export const DEFAULTS: Settings = {
  enabled: true, cosmetic: false, youtubeExperimental: false, allowlist: []
};
export const ALL_SITES = ["http://*/*", "https://*/*"];
export const YOUTUBE_SITES = ["https://www.youtube.com/*", "https://m.youtube.com/*", "https://youtube.com/*"];

export function validHost(value: unknown): value is string {
  return typeof value === "string" && value.length <= 253 &&
    value.split(".").every(label => label.length >= 1 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

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
      validHost(host) && hostname("https://" + host) === host))].sort().slice(0, 200)
    : [];
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    cosmetic: raw.cosmetic === true,
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
