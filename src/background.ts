import {
  normalize, hostname, validHost, exceptionRules, matchesPattern,   pauseBadge,
  ALL_SITES, YOUTUBE_SITES, MUSIC_SITES, PAUSE_MINUTES, RESUME_ALARM, BADGE_ALARM,
  isYoutubeHost, isMusicHost, type Settings
} from "./settings.js";

// Content scripts cannot read/write the global allowlist or settings directly.
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
void storageReady.catch(() => console.error("[AdAegis] Settings access could not be restricted."));
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
async function read(): Promise<Settings> {
  await storageReady;
  return normalize(await chrome.storage.local.get([
    "enabled", "cosmetic", "youtubeExperimental", "youtubeMusicExperimental", "allowlist", "pauseUntil"
  ]));
}
async function access(): Promise<{ cosmetic: boolean; youtube: boolean; music: boolean }> {
  const [cosmetic, youtube, music] = await Promise.all([
    chrome.permissions.contains({ origins: ALL_SITES }),
    chrome.permissions.contains({ origins: YOUTUBE_SITES }),
    chrome.permissions.contains({ origins: MUSIC_SITES })
  ]);
  return { cosmetic, youtube, music };
}
function experimentMatches(settings: Settings, granted: { youtube: boolean; music: boolean }): string[] {
  return [
    ...(settings.enabled && settings.youtubeExperimental && granted.youtube ? YOUTUBE_SITES : []),
    ...(settings.enabled && settings.youtubeMusicExperimental && granted.music ? MUSIC_SITES : [])
  ];
}
async function registerScripts(settings: Settings, previous?: Settings): Promise<void> {
  const granted = await access();
  const current = await chrome.scripting.getRegisteredContentScripts();
  const desired: chrome.scripting.RegisteredContentScript[] = [];
  const cosmetics = settings.enabled && settings.cosmetic && granted.cosmetic;
  const youtubeMatches = experimentMatches(settings, granted);
  if (cosmetics) desired.push({
    id: "page-cleanup", matches: ALL_SITES, js: ["dist/content.js"],
    excludeMatches: settings.allowlist.map(host => "*://" + host + "/*"),
    runAt: "document_start", world: "ISOLATED", allFrames: false,
    persistAcrossSessions: true
  });
  if (youtubeMatches.length) {
    // Isolated content.js carries YouTube start/stop into page context.
    if (!cosmetics) desired.push({
      id: "youtube-control", matches: youtubeMatches, js: ["dist/content.js"],
      excludeMatches: settings.allowlist.map(host => "https://" + host + "/*"),
      runAt: "document_start", world: "ISOLATED", allFrames: false,
      persistAcrossSessions: true
    });
    desired.push({
      id: "youtube-experiment", matches: youtubeMatches, js: ["dist/youtube.js"],
      excludeMatches: settings.allowlist.map(host => "https://" + host + "/*"),
      runAt: "document_start", world: "MAIN", allFrames: false,
      persistAcrossSessions: true
    });
  }
  const owned = ["page-cleanup", "youtube-control", "youtube-experiment"];
  const present = new Set(current.map(script => script.id));
  const obsolete = current.filter(script => owned.includes(script.id) && !desired.some(next => next.id === script.id));
  if (obsolete.length) {
    await chrome.scripting.unregisterContentScripts({ ids: obsolete.map(script => script.id) });
    for (const script of obsolete) present.delete(script.id);
  }
  const added: chrome.scripting.RegisteredContentScript[] = [];
  for (const script of desired) {
    if (present.has(script.id)) await chrome.scripting.updateContentScripts([script]);
    else {
      await chrome.scripting.registerContentScripts([script]);
      added.push(script);
    }
  }
  const allowlistChanged = !!previous && previous.allowlist.join("\0") !== settings.allowlist.join("\0");
  const matchesChanged = !!previous &&
    experimentMatches(previous, granted).join("\0") !== youtubeMatches.join("\0");
  const toInject = allowlistChanged ? desired : [...added];
  if (!allowlistChanged && matchesChanged) {
    for (const script of desired) {
      if ((script.id === "youtube-experiment" || script.id === "youtube-control") &&
          !toInject.some(item => item.id === script.id)) toInject.push(script);
    }
  }
  await injectOpenTabs(toInject, settings.allowlist);
}
function scriptApplies(url: string, script: chrome.scripting.RegisteredContentScript, allowlist: string[]): boolean {
  const host = hostname(url);
  if (!host || allowlist.includes(host)) return false;
  const matches = script.matches ?? [];
  const exclude = script.excludeMatches ?? [];
  return matches.some(pattern => matchesPattern(url, pattern)) &&
    !exclude.some(pattern => matchesPattern(url, pattern));
}
async function injectOpenTabs(scripts: chrome.scripting.RegisteredContentScript[], allowlist: string[]): Promise<void> {
  if (!scripts.length) return;
  // MAIN-world YouTube hooks first so they can hear the isolated start signal.
  const ordered = [...scripts].sort((a, b) => Number(b.world === "MAIN") - Number(a.world === "MAIN"));
  let tabs: chrome.tabs.Tab[] = [];
  try { tabs = await chrome.tabs.query({}); } catch { return; }
  await Promise.all(tabs.map(async tab => {
    if (tab.id === undefined || tab.id < 0 || tab.discarded || !tab.url) return;
    if ((tab as { frozen?: boolean }).frozen) return;
    for (const script of ordered) {
      if (!script.js?.length || !scriptApplies(tab.url, script, allowlist)) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: script.js,
          world: script.world ?? "ISOLATED",
          injectImmediately: true
        });
      } catch { /* Restricted pages, discarded tabs, or missing host access. */ }
    }
  }));
}
async function notifyPages(): Promise<void> {
  // No settings or hostnames are broadcast. Each page requests its own effective policy.
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab => tab.id !== undefined).map(tab =>
    chrome.tabs.sendMessage(tab.id!, { type: "refresh-policy" }, { frameId: 0 }).catch(() => undefined)));
}
async function syncAlarm(settings: Settings): Promise<void> {
  await chrome.alarms.clear(RESUME_ALARM);
  await chrome.alarms.clear(BADGE_ALARM);
  if (!settings.enabled && settings.pauseUntil > Date.now()) {
    await chrome.alarms.create(RESUME_ALARM, { when: settings.pauseUntil });
    await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
  }
}
async function apply(settings: Settings, previous?: Settings): Promise<void> {
  const dnr = chrome.declarativeNetRequest;
  const current = await dnr.getDynamicRules();
  await dnr.updateDynamicRules({
    removeRuleIds: current.filter(rule => rule.id >= 10000 && rule.id < 10200).map(rule => rule.id),
    addRules: exceptionRules(settings.allowlist)
  });
  await dnr.updateEnabledRulesets({
    enableRulesetIds: settings.enabled ? ["core"] : [],
    disableRulesetIds: settings.enabled ? [] : ["core"]
  });
  await registerScripts(settings, previous);
  await dnr.setExtensionActionOptions({ displayActionCountAsBadgeText: settings.enabled });
  await chrome.action.setBadgeText({ text: pauseBadge(settings) });
  await chrome.action.setBadgeBackgroundColor({ color: settings.enabled ? "#126c54" : "#b42318" });
  await syncAlarm(settings);
}
async function change(update: (previous: Settings) => Settings): Promise<Settings> {
  const previous = await read();
  const next = update(previous);
  try {
    await apply(next, previous);
    await chrome.storage.local.set(next);
  } catch (error) {
    await apply(previous).catch(() => console.error("[AdAegis] Reload required after a settings error."));
    throw error;
  }
  // Do not wait here: a content-script refresh calls back into this serialized queue.
  void notifyPages().catch(() => undefined);
  return next;
}
function allowlistChange(previous: Settings, host: string, allowed: boolean): Settings {
  const hosts = new Set(previous.allowlist);
  if (allowed) hosts.add(host); else hosts.delete(host);
  if (hosts.size > 200) throw new Error("Maximum 200 site exceptions.");
  return { ...previous, allowlist: [...hosts].sort() };
}
const initialize = () => serialize(async () => {
  const granted = await access();
  await change(previous => {
    const expired = !previous.enabled && previous.pauseUntil > 0 && previous.pauseUntil <= Date.now();
    return {
      ...previous,
      enabled: expired ? true : previous.enabled,
      pauseUntil: previous.enabled || expired ? 0 : previous.pauseUntil,
      cosmetic: previous.cosmetic && granted.cosmetic,
      youtubeExperimental: previous.youtubeExperimental && granted.youtube,
      youtubeMusicExperimental: previous.youtubeMusicExperimental && granted.music
    };
  });
});
chrome.runtime.onInstalled.addListener(() => { void initialize().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { void initialize().catch(console.error); });
chrome.permissions.onRemoved.addListener(() => { void initialize().catch(console.error); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === BADGE_ALARM) {
    void serialize(async () => {
      const settings = await read();
      await chrome.action.setBadgeText({ text: pauseBadge(settings) });
    }).catch(console.error);
    return;
  }
  if (alarm.name !== RESUME_ALARM) return;
  void serialize(async () => {
    const settings = await read();
    if (settings.enabled || settings.pauseUntil === 0) return;
    await change(previous => ({ ...previous, enabled: true, pauseUntil: 0 }));
  }).catch(console.error);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object" || Array.isArray(message)) return;
  const request = message as Record<string, unknown>;
  const isPopup = sender.url === chrome.runtime.getURL("popup.html") && !sender.tab;
  const pageHost = hostname(sender.url);
  if (!isPopup && (request.type !== "page-policy" || Object.keys(request).length !== 1 ||
      !sender.tab || !Number.isSafeInteger(sender.tab.id) || sender.frameId !== 0 ||
      !pageHost || (sender.origin && sender.origin !== new URL(sender.url!).origin))) return;
  const task = serialize(async () => {
    if (!isPopup) {
      const settings = await read();
      const granted = await access();
      const enabled = settings.enabled && !settings.allowlist.includes(pageHost!);
      const youtube = enabled && (
        (settings.youtubeExperimental && granted.youtube && isYoutubeHost(pageHost!)) ||
        (settings.youtubeMusicExperimental && granted.music && isMusicHost(pageHost!))
      );
      return { ok: true, cosmetic: enabled && settings.cosmetic && granted.cosmetic, youtube };
    }
    const exact = (...keys: string[]) => {
      if (Object.keys(request).length !== keys.length || !keys.every(key => Object.hasOwn(request, key))) {
        throw new Error("Invalid request.");
      }
    };
    let settings: Settings;
    if (request.type === "get-state") {
      exact("type");
      settings = await read();
    } else if (request.type === "set-option") {
      exact("type", "key", "value");
      const key = request.key;
      const value = request.value;
      if ((key !== "enabled" && key !== "cosmetic" && key !== "youtubeExperimental" &&
          key !== "youtubeMusicExperimental") || typeof value !== "boolean") {
        throw new Error("Invalid setting.");
      }
      const granted = await access();
      if (value && ((key === "cosmetic" && !granted.cosmetic) ||
          (key === "youtubeExperimental" && !granted.youtube) ||
          (key === "youtubeMusicExperimental" && !granted.music))) {
        throw new Error("Grant site access using the popup first.");
      }
      settings = await change(previous => ({
        ...previous, [key]: value,
        pauseUntil: key === "enabled" ? 0 : previous.pauseUntil
      }));
    } else if (request.type === "set-pause") {
      exact("type", "minutes");
      if (request.minutes !== PAUSE_MINUTES[0] && request.minutes !== PAUSE_MINUTES[1]) {
        throw new Error("Invalid pause.");
      }
      const pauseUntil = Date.now() + (request.minutes as number) * 60 * 1000;
      settings = await change(previous => ({ ...previous, enabled: false, pauseUntil }));
    } else if (request.type === "set-site") {
      exact("type", "tabId", "allowed");
      if (typeof request.allowed !== "boolean" || !Number.isSafeInteger(request.tabId) ||
          (request.tabId as number) < 0) throw new Error("Invalid site request.");
      const tab = await chrome.tabs.get(request.tabId as number);
      const host = hostname(tab.url);
      if (!tab.active || !validHost(host)) throw new Error("Open this site's tab before changing its exception.");
      settings = await change(previous => allowlistChange(previous, host, request.allowed as boolean));
    } else if (request.type === "set-host") {
      exact("type", "host", "allowed");
      if (typeof request.allowed !== "boolean" || !validHost(request.host)) throw new Error("Invalid hostname.");
      settings = await change(previous => allowlistChange(previous, request.host as string, request.allowed as boolean));
    } else { throw new Error("Unknown request."); }
    return { ok: true, settings, access: await access() };
  });
  task.then(reply, () => reply({ ok: false, error: "Could not apply this request. Check site access or reload AdAegis." }));
  return true;
});
