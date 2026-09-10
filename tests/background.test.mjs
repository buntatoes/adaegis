import test from "node:test";
import assert from "node:assert/strict";
let installed, startup, listener, permissionsRemoved, alarmListener;
let data = { enabled: false };
let enabledRules = ["core"], dynamic = [], scripts = [];
let rejectRulesOnce = false, rejectStorageOnce = false, restricted = false;
let cosmeticAccess = false, youtubeAccess = false, musicAccess = false;
let openTabs = [], injections = [], injectFail = false, alarms = [], badge = "";
const chrome = globalThis.chrome = {
  runtime: {
    id: "test-extension", getURL: path => "chrome-extension://test-extension/" + path,
    onInstalled: { addListener: f => { installed = f; } },
    onStartup: { addListener: f => { startup = f; } },
    onMessage: { addListener: f => { listener = f; } }
  },
  permissions: {
    contains: async ({ origins }) => {
      if (origins.includes("https://*/*")) return cosmeticAccess;
      if (origins.includes("https://music.youtube.com/*")) return musicAccess;
      return youtubeAccess;
    },
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
    unregisterContentScripts: async ({ ids }) => { scripts = scripts.filter(s => !ids.includes(s.id)); },
    executeScript: async opts => {
      if (injectFail) throw Error("Cannot access a chrome:// URL");
      injections.push({ tabId: opts.target.tabId, files: [...opts.files], world: opts.world, allFrames: opts.target.allFrames, injectImmediately: opts.injectImmediately });
    }
  },
  action: { setBadgeText: async ({ text }) => { badge = text; }, setBadgeBackgroundColor: async () => {} },
  alarms: {
    create: async (name, info) => { alarms = [...alarms.filter(item => item.name !== name), { name, ...info }]; },
    clear: async name => { alarms = alarms.filter(item => item.name !== name); return true; },
    onAlarm: { addListener: f => { alarmListener = f; } }
  },
  tabs: {
    get: async id => ({ id, active: id === 1, url: "https://www.youtube.com/watch?v=Abc12345678" }),
    query: async () => openTabs,
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
  for (const key of ["cosmetic", "youtubeExperimental", "youtubeMusicExperimental"]) assert.equal((await option(key, true)).ok, false);
  assert.deepEqual(scripts, []);
});
test("YouTube-only grant enables MAIN and isolated control scripts only", async () => {
  youtubeAccess = true;
  await option("youtubeExperimental", true);
  assert.equal(scripts.length, 0);
  await option("enabled", true);
  assert.equal(experiment().world, "MAIN");
  assert.equal(experiment().runAt, "document_start");
  assert.deepEqual(experiment().matches, ["https://www.youtube.com/*", "https://m.youtube.com/*", "https://youtube.com/*"]);
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
    { type: "set-site", allowed: true, tabId: 1.2 },
    { type: "set-host", host: "example.com", allowed: true, extra: 1 },
    { type: "set-pause", minutes: 10, extra: 1 }
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
  cosmeticAccess = false; youtubeAccess = false; musicAccess = false;
  permissionsRemoved(); await drain();
  assert.equal(data.cosmetic, false);
  assert.equal(data.youtubeExperimental, false);
  assert.equal(data.youtubeMusicExperimental, false);
  assert.deepEqual(scripts, []);
});
test("serialized settings and startup preserve the final state", async () => {
  await Promise.all([option("enabled", false), option("enabled", true)]);
  startup(); await drain();
  assert.equal(data.enabled, true);
  assert.deepEqual(scripts, []);
});
test("enabling page cleanup injects into matching open tabs only", async () => {
  cosmeticAccess = true;
  injections = [];
  openTabs = [
    { id: 10, url: "https://news.example/", discarded: false },
    { id: 11, url: "https://www.youtube.com/watch?v=Abc12345678", discarded: false },
    { id: 12, url: "chrome://extensions", discarded: false },
    { id: 13, discarded: false },
    { id: 14, url: "https://news.example/", discarded: true },
    { id: -1, url: "https://news.example/", discarded: false }
  ];
  await option("cosmetic", true);
  assert.deepEqual(injections.map(item => item.tabId).sort(), [10, 11]);
  assert.ok(injections.every(item => item.world === "ISOLATED" && item.files[0] === "dist/content.js"));
  assert.ok(injections.every(item => item.allFrames === false && item.injectImmediately === true));
});
test("enabling YouTube with cleanup already on only injects MAIN-world hooks", async () => {
  youtubeAccess = true;
  injections = [];
  openTabs = [
    { id: 10, url: "https://news.example/", discarded: false },
    { id: 11, url: "https://www.youtube.com/watch?v=Abc12345678", discarded: false }
  ];
  await option("youtubeExperimental", true);
  assert.deepEqual(injections, [
    { tabId: 11, files: ["dist/youtube.js"], world: "MAIN", allFrames: false, injectImmediately: true }
  ]);
});
test("YouTube-only enable injects MAIN hooks before isolated control on YouTube tabs", async () => {
  await option("youtubeExperimental", false);
  await option("cosmetic", false);
  youtubeAccess = true;
  injections = [];
  openTabs = [
    { id: 20, url: "https://news.example/", discarded: false },
    { id: 21, url: "https://www.youtube.com/watch?v=Abc12345678", discarded: false },
    { id: 22, url: "https://m.youtube.com/", discarded: false }
  ];
  await option("youtubeExperimental", true);
  assert.equal(injections.some(item => item.tabId === 20), false);
  const youtubeTabs = injections.filter(item => item.tabId === 21);
  assert.deepEqual(youtubeTabs.map(item => item.world), ["MAIN", "ISOLATED"]);
  assert.deepEqual(youtubeTabs.map(item => item.files[0]), ["dist/youtube.js", "dist/content.js"]);
  assert.ok(injections.some(item => item.tabId === 22 && item.world === "MAIN"));
});
test("already-registered scripts are not injected again on update", async () => {
  injections = [];
  await option("youtubeExperimental", true);
  assert.deepEqual(injections, []);
});
test("allowlisted hosts are not injected", async () => {
  await send({ type: "set-site", tabId: 1, allowed: true });
  await option("youtubeExperimental", false);
  injections = [];
  await option("youtubeExperimental", true);
  assert.equal(injections.some(item => item.tabId === 21), false);
  assert.ok(injections.some(item => item.tabId === 22 && item.world === "MAIN"));
});
test("removing a site exception injects into that host's open tabs", async () => {
  injections = [];
  await send({ type: "set-site", tabId: 1, allowed: false });
  assert.ok(injections.some(item => item.tabId === 21 && item.world === "MAIN"));
  assert.ok(injections.some(item => item.tabId === 21 && item.world === "ISOLATED"));
});
test("frozen tabs are not injected", async () => {
  await option("youtubeExperimental", false);
  injections = [];
  openTabs = [
    { id: 30, url: "https://www.youtube.com/watch?v=Abc12345678", discarded: false, frozen: true },
    { id: 31, url: "https://m.youtube.com/", discarded: false }
  ];
  await option("youtubeExperimental", true);
  assert.equal(injections.some(item => item.tabId === 30), false);
  assert.ok(injections.some(item => item.tabId === 31 && item.world === "MAIN"));
});
test("inject failures do not roll back a successful settings change", async () => {
  injectFail = true;
  injections = [];
  await option("enabled", false);
  const result = await option("enabled", true);
  injectFail = false;
  assert.equal(result.ok, true);
  assert.equal(data.enabled, true);
  assert.ok(scripts.some(script => script.id === "youtube-experiment"));
});
test("set-host manages exceptions without an active tab", async () => {
  await send({ type: "set-host", host: "ads.example", allowed: true });
  assert.ok(data.allowlist.includes("ads.example"));
  assert.equal((await send({ type: "set-host", host: "*.example", allowed: true })).ok, false);
  await send({ type: "set-host", host: "ads.example", allowed: false });
  assert.equal(data.allowlist.includes("ads.example"), false);
});
test("timed pause disables rules, sets a resume alarm, and restores on alarm", async () => {
  await option("enabled", true);
  assert.equal(badge, "");
  const result = await send({ type: "set-pause", minutes: 10 });
  assert.equal(result.ok, true);
  assert.equal(data.enabled, false);
  assert.ok(data.pauseUntil > Date.now());
  assert.deepEqual(enabledRules, []);
  assert.equal(badge, "10m");
  assert.ok(alarms.some(item => item.name === "adaegis-resume"));
  assert.equal(alarms.find(item => item.name === "adaegis-pause-badge")?.periodInMinutes, 1);
  data.pauseUntil = Date.now() + 4 * 60 * 1000;
  alarmListener({ name: "adaegis-pause-badge" });
  await drain();
  assert.equal(badge, "4m");
  assert.equal((await send({ type: "set-pause", minutes: 15 })).ok, false);
  alarmListener({ name: "adaegis-resume" });
  await drain();
  assert.equal(data.enabled, true);
  assert.equal(data.pauseUntil, 0);
  assert.deepEqual(enabledRules, ["core"]);
  assert.equal(badge, "");
  assert.deepEqual(alarms, []);
});
test("indefinite pause shows OFF and does not resume from a stale alarm", async () => {
  await option("enabled", false);
  assert.equal(data.pauseUntil, 0);
  assert.equal(badge, "OFF");
  assert.deepEqual(alarms, []);
  alarmListener({ name: "adaegis-resume" });
  await drain();
  assert.equal(data.enabled, false);
});
test("YouTube Music is a separate grant and does not ride on www YouTube", async () => {
  youtubeAccess = true;
  musicAccess = false;
  await option("enabled", true);
  await option("youtubeExperimental", true);
  await option("youtubeMusicExperimental", false);
  assert.ok(!experiment().matches.includes("https://music.youtube.com/*"));
  assert.equal((await option("youtubeMusicExperimental", true)).ok, false);
  musicAccess = true;
  injections = [];
  openTabs = [
    { id: 40, url: "https://www.youtube.com/watch?v=Abc12345678", discarded: false },
    { id: 41, url: "https://music.youtube.com/watch?v=Abc12345678", discarded: false }
  ];
  await option("youtubeMusicExperimental", true);
  assert.ok(experiment().matches.includes("https://music.youtube.com/*"));
  assert.ok(injections.some(item => item.tabId === 41 && item.world === "MAIN"));
  const musicPage = {
    id: chrome.runtime.id, url: "https://music.youtube.com/watch?v=Abc12345678",
    origin: "https://music.youtube.com", frameId: 0, tab: { id: 41 }
  };
  assert.deepEqual(await send({ type: "page-policy" }, musicPage), { ok: true, cosmetic: false, youtube: true });
  await option("youtubeMusicExperimental", false);
  assert.deepEqual(await send({ type: "page-policy" }, musicPage), { ok: true, cosmetic: false, youtube: false });
  await option("youtubeExperimental", false);
  injections = [];
  await option("youtubeMusicExperimental", true);
  assert.deepEqual(experiment().matches, ["https://music.youtube.com/*"]);
  assert.equal(injections.some(item => item.tabId === 40), false);
  assert.ok(injections.some(item => item.tabId === 41 && item.world === "MAIN"));
});
