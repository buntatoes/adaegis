import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const code = await readFile(new URL("../dist/content.js", import.meta.url), "utf8");
async function setup(policy = { ok: true, cosmetic: true, youtube: false }, host = "www.youtube.com") {
  let listener, mutation;
  const signals = [], timers = [];
  const listeners = {};
  const style = { dataset: {}, isConnected: false, remove() { this.isConnected = false; } };
  const context = {
    location: new URL("https://" + host + "/watch"),
    document: { createElement: () => style, documentElement: { append: s => { s.isConnected = true; } } },
    window: {
      dispatchEvent: e => signals.push(e.type),
      setTimeout: f => timers.push(f),
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); }
    },
    Event, clearTimeout() {},
    MutationObserver: class { constructor(f) { mutation = f; } observe() {} disconnect() {} },
    chrome: { runtime: {
      id: "self",
      sendMessage: async message => { assert.deepEqual(Object.keys(message), ["type"]); return policy; },
      onMessage: { addListener: f => { listener = f; } }
    } }
  };
  vm.runInNewContext(code, context);
  const drain = () => new Promise(resolve => setImmediate(resolve));
  await drain();
  return {
    style, signals, mutation, timers,
    refresh: async next => {
      policy = next; listener({ type: "refresh-policy" }, { id: "self" }); await drain();
    },
    hide: () => { for (const fn of listeners.pagehide ?? []) fn(new Event("pagehide")); },
    show: async persisted => {
      for (const fn of listeners.pageshow ?? []) fn({ persisted });
      await drain();
    }
  };
}
test("safe CSS selectors leave player controls intact", async () => {
  const { style } = await setup();
  assert.ok(style.isConnected);
  assert.match(style.textContent, /ytd-ad-slot-renderer/);
  assert.ok(!style.textContent.includes("#movie_player"));
  assert.ok(!style.textContent.includes(".ytp-ad"));
});
test("policy changes remove styles immediately and turn page hooks off", async () => {
  const { style, signals, refresh } = await setup({ ok: true, cosmetic: true, youtube: true });
  assert.deepEqual(signals, ["adaegis:youtube-start"]);
  await refresh({ ok: true, cosmetic: false, youtube: false });
  assert.equal(style.isConnected, false);
  assert.deepEqual(signals, ["adaegis:youtube-start", "adaegis:youtube-stop"]);
});
test("cosmetic pause does not stop the separately enabled experiment", async () => {
  const { style, signals, refresh } = await setup({ ok: true, cosmetic: true, youtube: true });
  await refresh({ ok: true, cosmetic: false, youtube: true });
  assert.equal(style.isConnected, false);
  assert.ok(!signals.includes("adaegis:youtube-stop"));
  assert.ok(signals.includes("adaegis:youtube-start"));
});
test("malformed policies fail closed", async () => {
  for (const policy of [{ ok: false }, { ok: true, cosmetic: "true", youtube: true }, null]) {
    const { style, signals } = await setup(policy);
    assert.equal(style.isConnected, false);
    assert.ok(signals.includes("adaegis:youtube-stop"));
    assert.ok(!signals.includes("adaegis:youtube-start"));
  }
});
test("a later valid policy restarts YouTube after a fail-closed stop", async () => {
  const { style, signals, refresh } = await setup({ ok: false });
  assert.ok(signals.includes("adaegis:youtube-stop"));
  await refresh({ ok: true, cosmetic: false, youtube: true });
  assert.equal(style.isConnected, false);
  assert.ok(signals.includes("adaegis:youtube-start"));
});
test("style-removal tug of war is bounded and does not stop YouTube", async () => {
  const { style, mutation, timers, signals } = await setup({ ok: true, cosmetic: true, youtube: true });
  for (let i = 0; i < 15; i++) { style.remove(); mutation(); timers.shift()?.(); }
  assert.equal(style.isConnected, false);
  assert.equal(timers.length, 0);
  assert.ok(!signals.includes("adaegis:youtube-stop"));
  assert.ok(signals.includes("adaegis:youtube-start"));
});
test("pagehide cleanup runs every time and bfcache restore reapplies policy", async () => {
  const { style, signals, hide, show } = await setup({ ok: true, cosmetic: true, youtube: true });
  hide();
  assert.equal(style.isConnected, false);
  assert.ok(signals.includes("adaegis:youtube-stop"));
  await show(true);
  assert.equal(style.isConnected, true);
  assert.ok(signals.includes("adaegis:youtube-start"));
  hide();
  assert.equal(style.isConnected, false);
});
test("generic pages only receive fixed generic selectors", async () => {
  const { style, signals } = await setup(undefined, "example.com");
  assert.match(style.textContent, /adsbygoogle/);
  assert.ok(!style.textContent.includes("ytd-"));
  assert.deepEqual(signals, []);
});
