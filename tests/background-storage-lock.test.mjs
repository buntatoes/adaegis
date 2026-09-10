import test from "node:test";
import assert from "node:assert/strict";
let listener;
let data = { enabled: true, cosmetic: false, youtubeExperimental: false, youtubeMusicExperimental: false, allowlist: [], pauseUntil: 0 };
let enabledRules = ["core"], dynamic = [], scripts = [];
const chrome = globalThis.chrome = {
  runtime: {
    id: "test-extension", getURL: path => "chrome-extension://test-extension/" + path,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener: f => { listener = f; } }
  },
  permissions: {
    contains: async () => false,
    onRemoved: { addListener() {} }
  },
  storage: { local: {
    setAccessLevel: async () => { throw Error("Access level rejected"); },
    get: async () => structuredClone(data),
    set: async next => { Object.assign(data, structuredClone(next)); }
  } },
  declarativeNetRequest: {
    RuleActionType: { ALLOW_ALL_REQUESTS: "allowAllRequests" },
    ResourceType: { MAIN_FRAME: "main_frame" },
    getDynamicRules: async () => dynamic,
    updateDynamicRules: async change => {
      dynamic = [...dynamic.filter(rule => !change.removeRuleIds.includes(rule.id)), ...change.addRules];
    },
    updateEnabledRulesets: async change => {
      enabledRules = [...new Set([...enabledRules.filter(id => !change.disableRulesetIds.includes(id)), ...change.enableRulesetIds])];
    },
    setExtensionActionOptions: async () => {}
  },
  scripting: {
    getRegisteredContentScripts: async () => scripts,
    registerContentScripts: async items => { scripts.push(...items); },
    updateContentScripts: async items => { scripts = scripts.map(s => items.find(i => i.id === s.id) ?? s); },
    unregisterContentScripts: async ({ ids }) => { scripts = scripts.filter(s => !ids.includes(s.id)); },
    executeScript: async () => {}
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  alarms: {
    create: async () => {},
    clear: async () => true,
    onAlarm: { addListener() {} }
  },
  tabs: { get: async () => ({ id: 1, active: true, url: "https://example.com/" }), query: async () => [], sendMessage: async () => {} }
};
await import("../dist/background.js");
const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") };
const send = message => new Promise(resolve => listener(message, sender, resolve));

test("settings still load when storage access cannot be restricted", async () => {
  const result = await send({ type: "get-state" });
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, true);
});
