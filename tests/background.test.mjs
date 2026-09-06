import test from "node:test";
import assert from "node:assert/strict";

let installed, startup, listener;
let data = { enabled: false };
let enabledRules = ["core"];
let dynamic = [];
let scripts = [];
let rejectRulesOnce = false;
let rejectStorageOnce = false;
const chrome = globalThis.chrome = {
  runtime: {
    id: "test-extension",
    getURL: path => "chrome-extension://test-extension/" + path,
    onInstalled: { addListener: f => { installed = f; } },
    onStartup: { addListener: f => { startup = f; } },
    onMessage: { addListener: f => { listener = f; } }
  },
  storage: { local: {
    get: async () => structuredClone(data),
    set: async next => {
      if (rejectStorageOnce) { rejectStorageOnce = false; throw Error("Storage failure"); }
      Object.assign(data, structuredClone(next));
    }
  } },
  declarativeNetRequest: {
    RuleActionType: { ALLOW_ALL_REQUESTS: "allowAllRequests" },
    ResourceType: { MAIN_FRAME: "main_frame" },
    getDynamicRules: async () => dynamic,
    updateDynamicRules: async change => {
      dynamic = [...dynamic.filter(rule => !change.removeRuleIds.includes(rule.id)), ...change.addRules];
    },
    updateEnabledRulesets: async change => {
      if (rejectRulesOnce) { rejectRulesOnce = false; throw Error("DNR rejected update"); }
      enabledRules = [...new Set([...enabledRules.filter(id => !change.disableRulesetIds.includes(id)), ...change.enableRulesetIds])];
    },
    setExtensionActionOptions: async () => {}
  },
  scripting: {
    ExecutionWorld: { MAIN: "MAIN" },
    getRegisteredContentScripts: async () => scripts,
    registerContentScripts: async items => { scripts = items; },
    updateContentScripts: async items => { scripts = items; },
    unregisterContentScripts: async () => { scripts = []; }
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  tabs: { get: async id => ({ id, url: "https://www.youtube.com/watch?v=test" }) }
};
await import("../dist/background.js");
const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") };
const send = message => new Promise(resolve => listener(message, sender, resolve));
const drain = () => send({ type: "get-state" });

test("installation preserves old paused state and disables actual core rules", async () => {
  installed();
  await drain();
  assert.deepEqual(enabledRules, []);
  assert.equal(data.youtubeExperimental, false);
});
test("enable and pause update DNR rather than just UI", async () => {
  assert.equal((await send({ type: "set-option", key: "enabled", value: true })).ok, true);
  assert.deepEqual(enabledRules, ["core"]);
  await send({ type: "set-option", key: "enabled", value: false });
  assert.deepEqual(enabledRules, []);
});
test("experiment uses MAIN world only when both switches are on", async () => {
  await send({ type: "set-option", key: "youtubeExperimental", value: true });
  assert.equal(scripts.length, 0);
  await send({ type: "set-option", key: "enabled", value: true });
  assert.equal(scripts[0].world, "MAIN");
  assert.equal(scripts[0].runAt, "document_start");
  assert.ok(scripts[0].matches.every(pattern => pattern.includes("youtube.com")));
});
test("site exceptions apply to DNR and exclude the startup experiment", async () => {
  await send({ type: "set-site", tabId: 1, allowed: true });
  assert.deepEqual(data.allowlist, ["www.youtube.com"]);
  assert.deepEqual(scripts[0].excludeMatches, ["https://www.youtube.com/*"]);
  assert.equal(dynamic[0].action.type, "allowAllRequests");
  await send({ type: "set-site", tabId: 1, allowed: false });
  assert.deepEqual(dynamic, []);
});
test("API and storage failures roll back configuration", async () => {
  rejectRulesOnce = true;
  assert.equal((await send({ type: "set-option", key: "enabled", value: false })).ok, false);
  assert.equal(data.enabled, true);
  assert.deepEqual(enabledRules, ["core"]);
  rejectStorageOnce = true;
  assert.equal((await send({ type: "set-option", key: "enabled", value: false })).ok, false);
  assert.equal(data.enabled, true);
  assert.deepEqual(enabledRules, ["core"]);
});
test("serializes rapid changes and restores settings on startup", async () => {
  await Promise.all([
    send({ type: "set-option", key: "cosmetic", value: false }),
    send({ type: "set-option", key: "youtubeExperimental", value: false })
  ]);
  assert.equal(data.cosmetic, false);
  assert.equal(data.youtubeExperimental, false);
  assert.equal(scripts.length, 0);
  startup();
  await drain();
  assert.equal(data.cosmetic, false);
});
test("rejects invalid requests and ignores page/content-script senders", async () => {
  assert.equal((await send({ type: "set-option", key: "enabled", value: "false" })).ok, false);
  assert.equal((await send({ type: "set-option", key: "allowlist", value: true })).ok, false);
  let replied = false;
  assert.equal(listener({ type: "set-option", key: "enabled", value: false },
    { id: chrome.runtime.id, url: "https://www.youtube.com/" }, () => { replied = true; }), undefined);
  assert.equal(replied, false);
});
