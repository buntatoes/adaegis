import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const code = await readFile(new URL("../dist/youtube.js", import.meta.url), "utf8");
const fixture = () => ({
  videoDetails: { videoId: "Abc12345678" }, playabilityStatus: { status: "OK" },
  streamingData: { adaptiveFormats: [{ url: "https://video.invalid/content" }] },
  adPlacements: [{}], playerAds: [{}], adSlots: [{}]
});
class Button {
  type = "button"; form = null; isConnected = true; clicks = 0;
  getClientRects() { return [1]; } matches() { return false; } click() { this.clicks++; }
}
function setup({ initial = fixture(), player = null, fetchImpl, descriptor,
  url = "https://www.youtube.com/watch?v=Abc12345678", framed = false } = {}) {
  const events = new Map();
  const add = (name, f) => { events.set(name, f); };
  const remove = name => events.delete(name);
  const timers = new Map();
  const observers = [];
  let now = 10000;
  class Video { closest() { return {}; } paused = false; readyState = 1; }
  const originalFetch = fetchImpl ?? (async () => new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } }));
  const context = {
    location: new URL(url),
    URL, Request, Response, Event, Object, HTMLVideoElement: Video, HTMLButtonElement: Button,
    Date: { now: () => now },
    document: {
      documentElement: { dataset: {} }, querySelector: () => player,
      addEventListener: add, removeEventListener: remove
    },
    addEventListener: add, removeEventListener: remove,
    fetch: originalFetch,
    console: { info() {} },
    requestAnimationFrame: f => { timers.set(1, f); return 1; },
    cancelAnimationFrame: id => timers.delete(id),
    setTimeout: (f, delay) => { const id = delay === 15000 ? 2 : 1; timers.set(id, f); return id; },
    clearTimeout: id => timers.delete(id),
    getComputedStyle: () => ({ visibility: "visible", opacity: "1", display: "block", pointerEvents: "auto" }),
    MutationObserver: class {
      constructor(f) { this.callback = f; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    }
  };
  context.window = context;
  context.top = framed ? {} : context;
  Object.defineProperty(context, "ytInitialPlayerResponse", descriptor ?? { value: initial, configurable: true, writable: true });
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, events, timers, observers, originalFetch, Video, advance: ms => { now += ms; } };
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
  events.get("playing")({ target: new Video() });
  assert.equal(timers.has(2), false);
});
test("available skip is clicked once, only during an ad", () => {
  for (const ad of [true, false]) {
    const button = new Button();
    const player = { classList: { contains: () => ad }, querySelector: selector => selector === ".ytp-error" ? null : button };
    const { observers, timers } = setup({ player });
    observers[0].callback();
    timers.get(1)();
    assert.equal(button.clicks, ad ? 1 : 0);
  }
});
test("hidden or disabled skip buttons are untouched", () => {
  for (const hidden of [true, false]) {
    const button = new Button();
    button.getClientRects = () => hidden ? [] : [1];
    button.matches = () => !hidden;
    setup({ player: { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button } });
    assert.equal(button.clicks, 0);
  }
});

test("no hooks on lookalike hosts, insecure/custom-port pages, sensitive routes or frames", () => {
  for (const url of ["https://youtube.com.evil.test/watch", "http://www.youtube.com/watch",
    "https://www.youtube.com:8443/watch", "https://www.youtube.com/account",
    "https://www.youtube.com/paid_memberships", "https://www.youtube.com/embed/Abc12345678"]) {
    const { context, originalFetch } = setup({ url });
    assert.equal(context.fetch, originalFetch);
    assert.ok(context.ytInitialPlayerResponse.adSlots);
  }
  const framed = setup({ framed: true });
  assert.equal(framed.context.fetch, framed.originalFetch);
});
test("request URL, query, body, headers and credentials are forwarded exactly once", async () => {
  const seen = [];
  const { context } = setup({ fetchImpl: async (...args) => {
    seen.push(args); return new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } });
  } });
  const url = "/youtubei/v1/player?key=unchanged&client=original";
  const init = { method: "POST", body: JSON.stringify({ videoId: "Abc12345678", client: "original" }),
    headers: new Headers({ authorization: "test-fixture", "x-client": "original" }), credentials: "same-origin" };
  await (await context.fetch(url, init)).json();
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], url);
  assert.equal(seen[0][1], init);
  assert.equal(init.headers.get("x-client"), "original");
});
test("metadata cleanup returns a copy and preserves auth, DRM and stream fields", () => {
  const original = fixture();
  original.licenseInfos = [{ drm: "unchanged" }];
  original.auth = { token: "synthetic-token" };
  original.trackingParams = "unchanged";
  const { context } = setup({ initial: original });
  const result = context.ytInitialPlayerResponse;
  assert.notEqual(result, original);
  assert.ok(original.adSlots);
  for (const key of ["videoDetails", "playabilityStatus", "streamingData", "licenseInfos", "auth", "trackingParams"]) {
    assert.equal(result[key], original[key]);
  }
});
test("accessors, prototype-bearing objects and non-OK player states are never sanitized", () => {
  let invoked = 0;
  const getter = fixture();
  Object.defineProperty(getter, "auth", { get() { invoked++; throw Error("must not execute"); }, configurable: true });
  const { context } = setup({ initial: getter });
  assert.equal(context.ytInitialPlayerResponse, getter);
  assert.equal(invoked, 0);
  const locked = { ...fixture(), playabilityStatus: { status: "LOGIN_REQUIRED" } };
  context.ytInitialPlayerResponse = locked;
  assert.equal(context.ytInitialPlayerResponse, locked);
  const inherited = Object.create(fixture());
  context.ytInitialPlayerResponse = inherited;
  assert.equal(context.ytInitialPlayerResponse, inherited);
});
test("ad-data changes stop at 200 per document", () => {
  const { context } = setup();
  let modified = 1;
  for (let i = 0; i < 250; i++) {
    const next = fixture(); context.ytInitialPlayerResponse = next;
    if (context.ytInitialPlayerResponse !== next) modified++;
  }
  assert.equal(modified, 200);
});
test("form buttons and arbitrary matching elements cannot be clicked", () => {
  for (const button of [Object.assign(new Button(), { type: "submit" }),
    Object.assign(new Button(), { form: {} }), { ...new Button(), click: () => assert.fail() }]) {
    const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
    setup({ player });
    assert.equal(button.clicks, 0);
  }
});
test("rotating skip elements respect cooldown and per-minute limits", () => {
  let button = new Button();
  const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
  const state = setup({ player });
  let clicks = button.clicks;
  for (let i = 0; i < 100; i++) {
    button = new Button();
    state.advance(250);
    state.observers[0].callback(); state.timers.get(1)();
    clicks += button.clicks;
  }
  assert.equal(clicks, 10);
});
test("navigation out of the allowed routes restores hooks", () => {
  const { context, observers, timers, originalFetch } = setup();
  context.location = new URL("https://www.youtube.com/account");
  observers[0].callback(); timers.get(1)();
  assert.equal(context.fetch, originalFetch);
});
test("redirected player responses are left untouched", async () => {
  const { context } = setup({ fetchImpl: async () => {
    const response = new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "redirected", { value: true });
    return response;
  } });
  assert.ok((await (await context.fetch("/youtubei/v1/player")).json()).adSlots);
});
