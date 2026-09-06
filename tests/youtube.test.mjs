import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const code = await readFile(new URL("../dist/youtube.js", import.meta.url), "utf8");
const fixture = () => ({
  videoDetails: { videoId: "test" }, playabilityStatus: { status: "OK" },
  streamingData: { adaptiveFormats: [{ url: "https://video.invalid/content" }] },
  adPlacements: [{}], playerAds: [{}], adSlots: [{}]
});
function setup({ initial = fixture(), player = null, fetchImpl, descriptor } = {}) {
  const events = new Map();
  const add = (name, f) => { events.set(name, f); };
  const remove = name => events.delete(name);
  const timers = new Map();
  const observers = [];
  class Video { closest() { return {}; } paused = false; readyState = 1; }
  const originalFetch = fetchImpl ?? (async () => new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } }));
  const context = {
    location: new URL("https://www.youtube.com/watch?v=test"),
    URL, Request, Response, Event, HTMLVideoElement: Video,
    document: {
      documentElement: { dataset: {} }, querySelector: () => player,
      addEventListener: add, removeEventListener: remove
    },
    addEventListener: add, removeEventListener: remove,
    fetch: originalFetch,
    console: { info() {} },
    requestAnimationFrame: f => { timers.set(1, f); return 1; },
    cancelAnimationFrame: id => timers.delete(id),
    setTimeout: f => { timers.set(2, f); return 2; },
    clearTimeout: id => timers.delete(id),
    getComputedStyle: () => ({ visibility: "visible" }),
    MutationObserver: class {
      constructor(f) { this.callback = f; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    }
  };
  context.window = context;
  Object.defineProperty(context, "ytInitialPlayerResponse", descriptor ?? { value: initial, configurable: true, writable: true });
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, events, timers, observers, originalFetch, Video };
}
test("startup and future player responses lose only recognized ad arrays", () => {
  const { context } = setup();
  assert.equal(context.ytInitialPlayerResponse.adPlacements, undefined);
  assert.equal(context.ytInitialPlayerResponse.streamingData.adaptiveFormats.length, 1);
  context.ytInitialPlayerResponse = fixture();
  assert.equal(context.ytInitialPlayerResponse.playerAds, undefined);
});
test("unrelated objects and non-configurable fields pass through", () => {
  const unknown = { adPlacements: [1] };
  const { context } = setup({ initial: unknown });
  assert.equal(context.ytInitialPlayerResponse, unknown);
  assert.deepEqual(unknown.adPlacements, [1]);
  const frozen = Object.freeze(fixture());
  context.ytInitialPlayerResponse = frozen;
  assert.ok(frozen.adPlacements);
});
test("does not replace a page accessor", () => {
  const value = fixture();
  const getter = () => value;
  const { context } = setup({ descriptor: { configurable: true, get: getter } });
  assert.equal(Object.getOwnPropertyDescriptor(context, "ytInitialPlayerResponse").get, getter);
  assert.ok(value.playerAds);
});
test("fetch modification is restricted to same-origin player JSON", async () => {
  const { context } = setup();
  const target = await context.fetch("/youtubei/v1/player?key=test");
  assert.equal((await target.json()).adSlots, undefined);
  for (const url of ["/youtubei/v1/browse", "https://evil.test/youtubei/v1/player", "/api/player"]) {
    const response = await context.fetch(url);
    assert.ok((await response.json()).adSlots);
  }
});
test("fetch rejection is preserved and text() is unchanged", async () => {
  const { context } = setup({ fetchImpl: async () => { throw Error("offline"); } });
  await assert.rejects(context.fetch("/youtubei/v1/player"), /offline/);
  const second = setup();
  const response = await second.context.fetch("/youtubei/v1/player");
  assert.ok(JSON.parse(await response.text()).adPlacements);
});
test("disable restores hooks and stops cleaning in-flight response JSON", async () => {
  const { context, events, originalFetch, observers } = setup();
  const response = await context.fetch("/youtubei/v1/player");
  events.get("adaegis:youtube-stop")();
  assert.equal(context.fetch, originalFetch);
  assert.ok((await response.json()).playerAds);
  const next = fixture();
  context.ytInitialPlayerResponse = next;
  assert.ok(context.ytInitialPlayerResponse.adPlacements);
  assert.ok(observers[0].disconnected);
});
test("playback errors and prolonged stalls trigger backoff", () => {
  for (const type of ["error", "waiting"]) {
    const { context, events, originalFetch, Video, timers } = setup();
    events.get(type)({ target: new Video() });
    if (type === "waiting") timers.get(2)();
    assert.equal(context.fetch, originalFetch);
    assert.match(context.document.documentElement.dataset.adaegisYoutube, /playback/);
  }
});
test("playing cancels a pending stall timer", () => {
  const { events, Video, timers } = setup();
  events.get("waiting")({ target: new Video() });
  events.get("playing")();
  assert.equal(timers.has(2), false);
});
test("available skip is clicked once, only during an ad", () => {
  for (const ad of [true, false]) {
    let clicks = 0;
    const button = { getClientRects: () => [1], matches: () => false, click: () => clicks++ };
    const player = { classList: { contains: () => ad }, querySelector: selector => selector === ".ytp-error" ? null : button };
    const { observers, timers } = setup({ player });
    observers[0].callback();
    timers.get(1)();
    assert.equal(clicks, ad ? 1 : 0);
  }
});
test("hidden or disabled skip buttons are untouched", () => {
  for (const hidden of [true, false]) {
    let clicks = 0;
    const button = { getClientRects: () => hidden ? [] : [1], matches: () => !hidden, click: () => clicks++ };
    setup({ player: { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button } });
    assert.equal(clicks, 0);
  }
});
