// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Buntos

export interface Settings {
  enabled: boolean;
  cosmetic: boolean;
  youtubeExperimental: boolean;
  youtubeMusicExperimental: boolean;
  allowlist: string[];
  pauseUntil: number;
}

export const DEFAULTS: Settings = {
  enabled: true, cosmetic: false, youtubeExperimental: false,
  youtubeMusicExperimental: false, allowlist: [], pauseUntil: 0
};
export const ALL_SITES = ["http://*/*", "https://*/*"];
export const YOUTUBE_SITES = ["https://www.youtube.com/*", "https://m.youtube.com/*", "https://youtube.com/*"];
export const MUSIC_SITES = ["https://music.youtube.com/*"];
export const PAUSE_MINUTES = [10, 60] as const;
export const RESUME_ALARM = "adaegis-resume";
export const BADGE_ALARM = "adaegis-pause-badge";

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

export function parseHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 300) return null;
  const candidate = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed
    : trimmed.startsWith("//") ? "https:" + trimmed
      : "https://" + trimmed;
  const host = hostname(candidate);
  return host && validHost(host) ? host : null;
}

export function isYoutubeHost(host: string): boolean {
  return host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com";
}

export function isMusicHost(host: string): boolean {
  return host === "music.youtube.com";
}

// Only the match patterns this extension actually registers: scheme://host/*
export function matchesPattern(url: string, pattern: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(parsed.protocol)) return false;
  const parts = /^(\*|https?):\/\/(\*|[a-z0-9.-]+)(\/\*)$/i.exec(pattern);
  if (!parts) return false;
  if (parts[1] !== "*" && parsed.protocol !== parts[1].toLowerCase() + ":") return false;
  if (parts[2] !== "*" && parsed.hostname !== parts[2].toLowerCase()) return false;
  return true;
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
    youtubeMusicExperimental: raw.youtubeMusicExperimental === true,
    allowlist,
    pauseUntil: Number.isSafeInteger(raw.pauseUntil) && (raw.pauseUntil as number) > 0 ?
      raw.pauseUntil as number : 0
  };
}

export function pauseBadge(settings: Settings, now = Date.now()): string {
  if (settings.enabled) return "";
  if (settings.pauseUntil > now) {
    const minutes = Math.max(1, Math.round((settings.pauseUntil - now) / 60000));
    return minutes >= 60 ? Math.round(minutes / 60) + "h" : minutes + "m";
  }
  return "OFF";
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
