import test from "node:test";
import assert from "node:assert/strict";
let installed, startup, listener, permissionsRemoved;
let data = { enabled: false };
let enabledRules = ["core"], dynamic = [], scripts = [];
let rejectRulesOnce = false, rejectStorageOnce = false, restricted = false;
let cosmeticAccess = false, youtubeAccess = false;
const chrome = globalThis.chrome = {
  runtime: {
    id: "test-extension", getURL: path => "chrome-extension://test-extension/" + path,
    onInstalled: { addListener: f => { installed = f; } },
    onStartup: { addListener: f => { startup = f; } },
    onMessage: { addListener: f => { listener = f; } }
  },
  permissions: {
    contains: async ({ origins }) => origins.includes("https://*/*") ? cosmeticAccess : youtubeAccess,
    onRemoved: { addListener: f => { permissionsRemoved = f; } }
  },
  storage: { local: {
    setAccessLevel: async ({ accessLevel }) => { restricted = accessLevel === "TRUSTED_CONTEXTS"; },
    get: async () => { assert.ok(restricted); return structuredClone(data); },
    set: async next => {
      assert.ok(restricted);
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
    ExecutionWorld: { MAIN: "MAIN", ISOLATED: "ISOLATED" },
    getRegisteredContentScripts: async () => scripts,
    registerContentScripts: async items => { scripts.push(...items); },
    updateContentScripts: async items => { scripts = scripts.map(s => items.find(i => i.id === s.id) ?? s); },
    unregisterContentScripts: async ({ ids }) => { scripts = scripts.filter(s => !ids.includes(s.id)); }
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  tabs: {
    get: async id => ({ id, active: id === 1, url: "https://www.youtube.com/watch?v=Abc12345678" }),
    query: async () => [],
    sendMessage: async () => {}
  }
};
await import("../dist/background.js");
const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") };
const pageSender = { id: chrome.runtime.id, url: "https://www.youtube.com/watch?v=Abc12345678", origin: "https://www.youtube.com", frameId: 0, tab: { id: 1 } };
const send = (message, from = sender) => new Promise(resolve => listener(message, from, resolve));
const drain = () => send({ type: "get-state" });
const option = (key, value) => send({ type: "set-option", key, value });
const experiment = () => scripts.find(s => s.id === "youtube-experiment");

test("installation preserves pause, locks storage and has no page scripts by default", async () => {
  installed(); await drain();
  assert.ok(restricted);
  assert.deepEqual(enabledRules, []);
  assert.deepEqual(scripts, []);
  assert.equal(data.cosmetic, false);
  assert.equal(data.youtubeExperimental, false);
});
test("pause controls DNR without requiring page permissions", async () => {
  assert.equal((await option("enabled", true)).ok, true);
  assert.deepEqual(enabledRules, ["core"]);
  await option("enabled", false);
  assert.deepEqual(enabledRules, []);
});
test("enabling page features without grants is rejected", async () => {
  for (const key of ["cosmetic", "youtubeExperimental"]) assert.equal((await option(key, true)).ok, false);
  assert.deepEqual(scripts, []);
});
test("YouTube-only grant enables MAIN and isolated control scripts only", async () => {
  youtubeAccess = true;
  await option("youtubeExperimental", true);
  assert.equal(scripts.length, 0);
  await option("enabled", true);
  assert.equal(experiment().world, "MAIN");
  assert.equal(experiment().runAt, "document_start");
  assert.ok(experiment().matches.every(p => p.includes("youtube.com")));
  assert.equal(scripts.find(s => s.id === "youtube-control").world, "ISOLATED");
  assert.equal(scripts.some(s => s.id === "page-cleanup"), false);
});
test("full page cleanup grant uses a single isolated script alongside the experiment", async () => {
  cosmeticAccess = true;
  await option("cosmetic", true);
  assert.ok(scripts.some(s => s.id === "page-cleanup"));
  assert.equal(scripts.some(s => s.id === "youtube-control"), false);
});
test("site exception targets the active tab and excludes all registered scripts", async () => {
  assert.equal((await send({ type: "set-site", tabId: 2, allowed: true })).ok, false);
  await send({ type: "set-site", tabId: 1, allowed: true });
  assert.deepEqual(data.allowlist, ["www.youtube.com"]);
  assert.ok(scripts.every(s => s.excludeMatches.some(p => p.includes("www.youtube.com"))));
  assert.equal(dynamic[0].action.type, "allowAllRequests");
});
test("page policy contains only booleans and respects exceptions", async () => {
  assert.deepEqual(await send({ type: "page-policy" }, pageSender), { ok: true, cosmetic: false, youtube: false });
  await send({ type: "set-site", tabId: 1, allowed: false });
  assert.deepEqual(await send({ type: "page-policy" }, pageSender), { ok: true, cosmetic: true, youtube: true });
  const other = { ...pageSender, url: "https://other.test/", origin: "https://other.test" };
  assert.deepEqual(await send({ type: "page-policy" }, other), { ok: true, cosmetic: true, youtube: false });
});
test("malformed, forged, iframe and content-script mutation messages are ignored", () => {
  for (const [message, from] of [
    [{ type: "set-option", key: "enabled", value: false }, pageSender],
    [{ type: "page-policy", url: "https://other.test" }, pageSender],
    [{ type: "page-policy" }, { ...pageSender, frameId: 1 }],
    [{ type: "page-policy" }, { ...pageSender, id: "attacker" }],
    [{ type: "page-policy" }, { ...pageSender, origin: "https://other.test" }],
    [{ type: "get-state" }, { ...sender, tab: { id: 1 } }],
    [[], sender]
  ]) {
    assert.equal(listener(message, from, () => assert.fail("unexpected reply")), undefined);
  }
});
test("strict schema rejects extra fields, prototype keys and invalid tab IDs", async () => {
  for (const message of [
    { type: "get-state", url: "https://example.com" },
    { type: "set-option", key: "__proto__", value: true },
    { type: "set-option", key: "enabled", value: "false" },
    { type: "set-option", key: "enabled", value: true, script: "anything" },
    { type: "set-site", allowed: true, tabId: -1 },
    { type: "set-site", allowed: true, tabId: 1.2 }
  ]) assert.equal((await send(message)).ok, false);
});
test("API and storage failures roll back configuration", async () => {
  rejectRulesOnce = true;
  assert.equal((await option("enabled", false)).ok, false);
  assert.equal(data.enabled, true);
  assert.deepEqual(enabledRules, ["core"]);
  rejectStorageOnce = true;
  assert.equal((await option("enabled", false)).ok, false);
  assert.equal(data.enabled, true);
  assert.deepEqual(enabledRules, ["core"]);
});
test("permission revocation switches features off and removes scripts", async () => {
  cosmeticAccess = false; youtubeAccess = false;
  permissionsRemoved(); await drain();
  assert.equal(data.cosmetic, false);
  assert.equal(data.youtubeExperimental, false);
  assert.deepEqual(scripts, []);
});
test("serialized settings and startup preserve the final state", async () => {
  await Promise.all([option("enabled", false), option("enabled", true)]);
  startup(); await drain();
  assert.equal(data.enabled, true);
  assert.deepEqual(scripts, []);
});
