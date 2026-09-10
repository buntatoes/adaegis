import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const code = await readFile(new URL("../dist/youtube.js", import.meta.url), "utf8");
const fixture = () => ({
  videoDetails: { videoId: "Abc12345678" }, playabilityStatus: { status: "OK" },
  streamingData: { adaptiveFormats: [{ url: "https://video.invalid/content" }] },
  playerConfig: { ssapConfig: { enabled: true }, audioConfig: { loudness: -1 } },
  adPlacements: [{}], playerAds: [{}], adSlots: [{}], adBreakHeartbeatParams: { interval: 5 }
});
class Button {
  type = "button"; form = null; isConnected = true; clicks = 0;
  getClientRects() { return [1]; } matches() { return false; } click() { this.clicks++; }
}
function setup({ initial = fixture(), player = null, fetchImpl, descriptor,
  url = "https://www.youtube.com/watch?v=Abc12345678", framed = false, XMLHttpRequest } = {}) {
  const events = new Map();
  const add = (name, f) => { events.set(name, f); };
  const remove = name => events.delete(name);
  const timers = new Map();
  const observers = [];
  let now = 10000;
  class Video { closest() { return {}; } paused = false; readyState = 1; duration = NaN; currentTime = 0; playbackRate = 1; muted = false; }
  const originalFetch = fetchImpl ?? (async () => new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } }));
  const context = {
    location: new URL(url),
    URL, URLSearchParams, Request, Response, Event, Object, TextEncoder, Blob, HTMLVideoElement: Video, HTMLButtonElement: Button,
    JSON: { parse: JSON.parse.bind(JSON), stringify: JSON.stringify.bind(JSON) },
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
    },
    XMLHttpRequest
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
  assert.equal(context.ytInitialPlayerResponse.adBreakHeartbeatParams, undefined);
  assert.equal(context.ytInitialPlayerResponse.playerConfig.ssapConfig, undefined);
  assert.equal(context.ytInitialPlayerResponse.playerConfig.audioConfig.loudness, -1);
  assert.equal(context.ytInitialPlayerResponse.streamingData.adaptiveFormats.length, 1);
  context.ytInitialPlayerResponse = fixture();
  assert.equal(context.ytInitialPlayerResponse.playerAds, undefined);
});
test("wrapped playerResponse on the initial payload loses only ad arrays", () => {
  const nested = fixture();
  const { context } = setup({ initial: { responseContext: { visitorData: "unchanged" }, playerResponse: nested } });
  assert.equal(context.ytInitialPlayerResponse.responseContext.visitorData, "unchanged");
  assert.equal(context.ytInitialPlayerResponse.playerResponse.adPlacements, undefined);
  assert.equal(context.ytInitialPlayerResponse.playerResponse.streamingData.adaptiveFormats.length, 1);
  assert.ok(nested.adPlacements);
});
test("unrelated objects and non-configurable fields pass through", () => {
  const unknown = { unknownAds: [1] };
  const { context } = setup({ initial: unknown });
  assert.equal(context.ytInitialPlayerResponse, unknown);
  assert.deepEqual(unknown.unknownAds, [1]);
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
  assert.equal((await (await context.fetch("/youtubei/v1/player/ad_break")).json()).adSlots, undefined);
});
test("fetch rejection is preserved and text() is cleaned on player JSON", async () => {
  const { context } = setup({ fetchImpl: async () => { throw Error("offline"); } });
  await assert.rejects(context.fetch("/youtubei/v1/player"), /offline/);
  const second = setup();
  const response = await second.context.fetch("/youtubei/v1/player");
  assert.equal(JSON.parse(await response.text()).adPlacements, undefined);
  const third = setup();
  assert.equal((await (await third.context.fetch("/youtubei/v1/player")).json()).adSlots, undefined);
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
  assert.equal(result.playerConfig.audioConfig, original.playerConfig.audioConfig);
  assert.equal(result.playerConfig.ssapConfig, undefined);
  assert.ok(original.playerConfig.ssapConfig);
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
test("HTML default submit type outside a form is still Skip", () => {
  const button = Object.assign(new Button(), { type: "submit" });
  const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
  const { observers, timers } = setup({ player });
  observers[0].callback();
  timers.get(1)();
  assert.equal(button.clicks, 1);
});
test("form buttons and arbitrary matching elements cannot be clicked", () => {
  for (const button of [Object.assign(new Button(), { form: {} }), { ...new Button(), click: () => assert.fail() }]) {
    const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
    setup({ player });
    assert.equal(button.clicks, 0);
  }
});
test("a later visible Skip is used when an earlier match is hidden", () => {
  const hidden = new Button();
  hidden.getClientRects = () => [];
  const visible = new Button();
  const player = {
    classList: { contains: () => true },
    querySelector: s => s === ".ytp-error" ? null : hidden,
    querySelectorAll: () => [hidden, visible]
  };
  const { observers, timers } = setup({ player });
  observers[0].callback();
  timers.get(1)();
  assert.equal(hidden.clicks, 0);
  assert.equal(visible.clicks, 1);
});
test("player skipAd is used when no Skip button is present", () => {
  let skips = 0;
  const player = {
    classList: { contains: () => true },
    querySelector: () => null,
    skipAd() { skips++; }
  };
  const { observers, timers } = setup({ player });
  observers[0].callback();
  timers.get(1)();
  assert.equal(skips, 1);
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
test("a start signal reinstalls hooks after a non-terminal stop", async () => {
  const { context, events, originalFetch } = setup();
  events.get("adaegis:youtube-stop")();
  assert.equal(context.fetch, originalFetch);
  events.get("adaegis:youtube-start")();
  assert.notEqual(context.fetch, originalFetch);
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adSlots, undefined);
  const next = fixture();
  context.ytInitialPlayerResponse = next;
  assert.equal(context.ytInitialPlayerResponse.adPlacements, undefined);
  assert.ok(next.adPlacements);
});
test("playback errors ignore a later start signal", () => {
  const { context, events, originalFetch, Video } = setup();
  events.get("error")({ target: new Video() });
  assert.equal(context.fetch, originalFetch);
  events.get("adaegis:youtube-start")();
  assert.equal(context.fetch, originalFetch);
  const next = fixture();
  context.ytInitialPlayerResponse = next;
  assert.ok(next.adPlacements);
});
test("restart does not reset the per-document ad-data budget", () => {
  const { context, events } = setup();
  let modified = 1;
  for (let i = 0; i < 50; i++) {
    const next = fixture(); context.ytInitialPlayerResponse = next;
    if (context.ytInitialPlayerResponse !== next) modified++;
  }
  events.get("adaegis:youtube-stop")();
  events.get("adaegis:youtube-start")();
  for (let i = 0; i < 200; i++) {
    const next = fixture(); context.ytInitialPlayerResponse = next;
    if (context.ytInitialPlayerResponse !== next) modified++;
  }
  assert.equal(modified, 200);
});
test("start is a no-op on an unsupported route", () => {
  const { context, events, originalFetch } = setup();
  events.get("adaegis:youtube-stop")();
  context.location = new URL("https://www.youtube.com/account");
  events.get("adaegis:youtube-start")();
  assert.equal(context.fetch, originalFetch);
});
test("search already wraps player JSON so a click-through is not missed", async () => {
  const { context, events, originalFetch } = setup({ url: "https://www.youtube.com/results?search_query=test" });
  assert.notEqual(context.fetch, originalFetch);
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adSlots, undefined);
  const wrapped = context.fetch;
  context.location = new URL("https://www.youtube.com/watch?v=Abc12345678");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, wrapped);
  const next = fixture();
  context.ytInitialPlayerResponse = next;
  assert.equal(context.ytInitialPlayerResponse.adPlacements, undefined);
});
test("channel navigation keeps player hooks", () => {
  const { context, events, originalFetch } = setup();
  const wrapped = context.fetch;
  context.location = new URL("https://www.youtube.com/channel/UC1234567890");
  events.get("popstate")();
  assert.equal(context.fetch, wrapped);
  assert.notEqual(context.fetch, originalFetch);
  assert.equal(context.document.documentElement.dataset.adaegisYoutube, undefined);
  context.location = new URL("https://www.youtube.com/watch?v=Abc12345678");
  events.get("popstate")();
  assert.equal(context.fetch, wrapped);
});
test("home to watch does not tear down existing hooks", () => {
  const { context, events, originalFetch } = setup({ url: "https://www.youtube.com/" });
  const wrapped = context.fetch;
  assert.notEqual(wrapped, originalFetch);
  context.location = new URL("https://www.youtube.com/watch?v=Abc12345678");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, wrapped);
});
test("Shorts after in-page navigation keeps the same player hooks", async () => {
  const { context, events, originalFetch } = setup({ url: "https://www.youtube.com/results?search_query=test" });
  const wrapped = context.fetch;
  assert.notEqual(wrapped, originalFetch);
  context.location = new URL("https://www.youtube.com/shorts/Abc12345678");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, wrapped);
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adSlots, undefined);
});
test("playback errors ignore later in-page navigation", () => {
  const { context, events, originalFetch, Video } = setup();
  events.get("error")({ target: new Video() });
  context.location = new URL("https://www.youtube.com/shorts/Abc12345678");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, originalFetch);
});
test("a stop signal blocks navigation from starting hooks until start", () => {
  const { context, events, originalFetch } = setup({ url: "https://www.youtube.com/results?search_query=test" });
  events.get("adaegis:youtube-stop")();
  assert.equal(context.fetch, originalFetch);
  context.location = new URL("https://www.youtube.com/watch?v=Abc12345678");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, originalFetch);
  events.get("adaegis:youtube-start")();
  assert.notEqual(context.fetch, originalFetch);
});
test("search does not click Skip; account still restores hooks", () => {
  const button = new Button();
  const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
  const search = setup({ url: "https://www.youtube.com/results?search_query=test", player });
  search.observers[0].callback();
  search.timers.get(1)?.();
  assert.equal(button.clicks, 0);
  const watch = setup();
  watch.context.location = new URL("https://www.youtube.com/results?search_query=x");
  watch.events.get("yt-navigate-finish")();
  assert.notEqual(watch.context.fetch, watch.originalFetch);
  watch.context.location = new URL("https://www.youtube.com/account");
  watch.events.get("yt-navigate-finish")();
  assert.equal(watch.context.fetch, watch.originalFetch);
});
test("redirected player responses are left untouched", async () => {
  const { context } = setup({ fetchImpl: async () => {
    const response = new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "redirected", { value: true });
    return response;
  } });
  assert.ok((await (await context.fetch("/youtubei/v1/player")).json()).adSlots);
});
test("player requests with a trailing slash are still cleaned", async () => {
  const { context } = setup();
  assert.equal((await (await context.fetch("/youtubei/v1/player/")).json()).adSlots, undefined);
});
test("get_watch nested playerResponse loses only ad arrays", async () => {
  const nested = fixture();
  const { context } = setup({ fetchImpl: async () => new Response(JSON.stringify({
    responseContext: { visitorData: "unchanged" }, playerResponse: nested
  }), { headers: { "content-type": "application/json" } }) });
  const body = await (await context.fetch("/youtubei/v1/get_watch")).json();
  assert.equal(body.responseContext.visitorData, "unchanged");
  assert.equal(body.playerResponse.adPlacements, undefined);
  assert.equal(body.playerResponse.streamingData.adaptiveFormats.length, 1);
  assert.ok(nested.adPlacements);
  assert.equal((await (await context.fetch("/youtubei/v1/get_watch?prettyPrint=false")).json()).playerResponse.playerAds, undefined);
});
test("browse responses with a nested playerResponse are left untouched", async () => {
  const nested = fixture();
  const { context } = setup({ fetchImpl: async () => new Response(JSON.stringify({
    playerResponse: nested
  }), { headers: { "content-type": "application/json" } }) });
  const body = await (await context.fetch("/youtubei/v1/browse")).json();
  assert.ok(body.playerResponse.adSlots);
  assert.ok(nested.adSlots);
});
test("yt-navigate-start from search onto watch keeps the same hooks", async () => {
  const { context, events, originalFetch } = setup({ url: "https://www.youtube.com/results?search_query=test" });
  const wrapped = context.fetch;
  assert.notEqual(wrapped, originalFetch);
  context.location = new URL("https://www.youtube.com/watch?v=Abc12345678");
  events.get("yt-navigate-start")();
  assert.equal(context.fetch, wrapped);
});
test("watch with a trailing slash still clicks Skip", () => {
  const button = new Button();
  const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
  const { observers, timers } = setup({
    url: "https://www.youtube.com/watch/?v=Abc12345678", player
  });
  observers[0].callback();
  timers.get(1)();
  assert.equal(button.clicks, 1);
});
test("a new video after a playback error starts a fresh budget", async () => {
  const { context, events, originalFetch, Video } = setup();
  events.get("error")({ target: new Video() });
  assert.equal(context.fetch, originalFetch);
  context.location = new URL("https://www.youtube.com/watch?v=Xyz98765432");
  events.get("yt-navigate-finish")();
  assert.notEqual(context.fetch, originalFetch);
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adSlots, undefined);
});
test("the same video ID after an error stays off", () => {
  const { context, events, originalFetch, Video } = setup();
  events.get("error")({ target: new Video() });
  context.location = new URL("https://www.youtube.com/watch?v=Abc12345678&t=12");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, originalFetch);
});
test("a new video after an error resumes if the experiment was toggled during navigation", async () => {
  const { context, events, originalFetch, Video } = setup();
  events.get("error")({ target: new Video() });
  events.get("adaegis:youtube-stop")();
  context.location = new URL("https://www.youtube.com/watch?v=Xyz98765432");
  events.get("yt-navigate-finish")();
  assert.equal(context.fetch, originalFetch);
  events.get("adaegis:youtube-start")();
  assert.notEqual(context.fetch, originalFetch);
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adSlots, undefined);
});
test("YouTube Music installs hooks and clicks Skip on a music player", () => {
  const button = new Button();
  const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
  const { context, observers, timers, originalFetch } = setup({
    url: "https://music.youtube.com/watch?v=Abc12345678", player
  });
  assert.notEqual(context.fetch, originalFetch);
  observers[0].callback();
  timers.get(1)();
  assert.equal(button.clicks, 1);
});
test("Music browse pages keep skip available; account still restores hooks", () => {
  const button = new Button();
  const player = { classList: { contains: () => true }, querySelector: s => s === ".ytp-error" ? null : button };
  const browse = setup({ url: "https://music.youtube.com/library", player });
  browse.observers[0].callback();
  browse.timers.get(1)?.();
  assert.equal(button.clicks, 1);
  browse.context.location = new URL("https://music.youtube.com/account");
  browse.events.get("yt-navigate-finish")();
  assert.equal(browse.context.fetch, browse.originalFetch);
});
test("cloned player fetch JSON and arrayBuffer lose ad fields", async () => {
  const { context } = setup();
  const copy = (await context.fetch("/youtubei/v1/player")).clone();
  const body = await copy.json();
  assert.equal(body.adSlots, undefined);
  assert.equal(body.adBreakHeartbeatParams, undefined);
  const buffer = await (await context.fetch("/youtubei/v1/player")).arrayBuffer();
  assert.equal(JSON.parse(new TextDecoder().decode(buffer)).playerAds, undefined);
});
test("player JSON without a content-type is still cleaned", async () => {
  const { context } = setup({
    fetchImpl: async () => new Response(JSON.stringify(fixture()), { headers: {} })
  });
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adPlacements, undefined);
});
test("same-origin player XHR JSON loses only ad arrays", () => {
  function XHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseType = "";
    this.responseText = "";
    this.response = "";
    this.listeners = {};
  }
  XHR.prototype.open = function(_method, url) { this.url = url; };
  XHR.prototype.send = function() {
    this.readyState = 4;
    this.status = 200;
    this.responseText = JSON.stringify(fixture());
    this.response = this.responseText;
    for (const fn of this.listeners.readystatechange ?? []) fn.call(this);
  };
  XHR.prototype.addEventListener = function(name, fn) { (this.listeners[name] ??= []).push(fn); };
  XHR.prototype.getResponseHeader = function(name) {
    return name.toLowerCase() === "content-type" ? "application/json" : null;
  };
  const { context } = setup({ XMLHttpRequest: XHR });
  const xhr = new context.XMLHttpRequest();
  xhr.open("POST", "/youtubei/v1/player");
  xhr.send();
  assert.equal(JSON.parse(xhr.responseText).adSlots, undefined);
  const browse = new context.XMLHttpRequest();
  browse.open("POST", "/youtubei/v1/browse");
  browse.send();
  assert.ok(JSON.parse(browse.responseText).adSlots);
});
test("JSON.parse of player JSON and ad-only payloads lose ad fields", () => {
  const { context } = setup();
  const body = context.JSON.parse(JSON.stringify(fixture()));
  assert.equal(body.adPlacements, undefined);
  assert.equal(body.streamingData.adaptiveFormats.length, 1);
  const adsOnly = context.JSON.parse(JSON.stringify({ adPlacements: [{}], playerAds: [{}], adSlots: [{}] }));
  assert.equal(adsOnly.adPlacements, undefined);
  assert.equal(adsOnly.playerAds, undefined);
  assert.equal(context.JSON.parse(JSON.stringify({ comments: [1] })).comments[0], 1);
});
test("JSON.parse of ad-shaped objects does not exhaust the player-edit cap", async () => {
  const { context } = setup();
  for (let i = 0; i < 200; i++) {
    const parsed = context.JSON.parse(JSON.stringify({ adPlacements: [{}], playerAds: [{}] }));
    assert.equal(parsed.adPlacements, undefined);
  }
  assert.equal((await (await context.fetch("/youtubei/v1/player")).json()).adPlacements, undefined);
});
test("ad_break and next player JSON lose ad fields", async () => {
  const nested = fixture();
  const { context } = setup({ fetchImpl: async url => new Response(JSON.stringify(
    String(url).includes("next") ? { playerResponse: nested } : fixture()
  ), { headers: { "content-type": "application/json" } }) });
  assert.equal((await (await context.fetch("/youtubei/v1/player/ad_break")).json()).playerAds, undefined);
  assert.equal((await (await context.fetch("/youtubei/v1/next")).json()).playerResponse.adSlots, undefined);
  assert.equal((await (await context.fetch("/youtubei/v1/reel/reel_item_watch")).json()).adPlacements, undefined);
});
test("cloned player blob loses ad fields", async () => {
  const { context } = setup();
  const blob = await (await context.fetch("/youtubei/v1/player")).blob();
  assert.equal(JSON.parse(await blob.text()).adSlots, undefined);
});
test("ad-showing video is seeked to the end when Skip is missing", () => {
  let node;
  const { context, observers, timers } = setup({
    player: {
      classList: { contains: () => true },
      querySelector: s => s === "video" ? node : null
    }
  });
  node = new context.HTMLVideoElement();
  node.duration = 15;
  node.currentTime = 1;
  observers[0].callback();
  timers.get(1)();
  assert.equal(node.currentTime, 15);
});
test("live ads are sped up when duration is unknown", () => {
  let node;
  const { context, observers, timers } = setup({
    player: {
      classList: { contains: () => true },
      querySelector: s => s === "video" ? node : null
    }
  });
  node = new context.HTMLVideoElement();
  node.duration = Infinity;
  node.currentTime = 2;
  observers[0].callback();
  timers.get(1)();
  assert.equal(node.playbackRate, 16);
  assert.equal(node.muted, true);
});
test("playback errors during an ad do not tear down hooks", () => {
  class AdVideo {
    closest() { return { classList: { contains: name => name === "ad-showing" } }; }
    paused = false; readyState = 1;
  }
  const { context, events, originalFetch } = setup();
  Object.setPrototypeOf(AdVideo.prototype, context.HTMLVideoElement.prototype);
  events.get("error")({ target: new AdVideo() });
  assert.notEqual(context.fetch, originalFetch);
});
test("Skip inside an open shadow root is still clicked", () => {
  const button = new Button();
  const player = {
    classList: { contains: () => true },
    querySelector: () => null,
    querySelectorAll: () => [],
    shadowRoot: { querySelectorAll: () => [button] }
  };
  const { observers, timers } = setup({ player });
  observers[0].callback();
  timers.get(1)();
  assert.equal(button.clicks, 1);
});
