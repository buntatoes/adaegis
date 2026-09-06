import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const code = await readFile(new URL("../dist/content.js", import.meta.url), "utf8");
async function setup(saved = {}, host = "www.youtube.com") {
  let changed;
  const signals = [];
  const style = { dataset: {}, isConnected: false, remove() { this.isConnected = false; } };
  const context = {
    location: { hostname: host },
    document: { createElement: () => style, documentElement: { append: s => { s.isConnected = true; } } },
    window: { dispatchEvent: event => signals.push(event.type) },
    Event, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: {
      storage: {
        onChanged: { addListener: f => { changed = f; } },
        local: { get: async () => saved }
      }
    }
  };
  vm.runInNewContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  return { style, signals, changed };
}
test("cosmetic style covers dynamic ad elements without hiding the player", async () => {
  const { style } = await setup();
  assert.ok(style.isConnected);
  assert.match(style.textContent, /ytd-ad-slot-renderer/);
  assert.ok(!style.textContent.includes("#movie_player"));
  assert.ok(!style.textContent.includes(".ytp-ad"));
});
test("page styles disappear immediately when paused or excepted", async () => {
  for (const changes of [{ enabled: { newValue: false } }, { allowlist: { newValue: ["www.youtube.com"] } }]) {
    const { style, changed } = await setup({ youtubeExperimental: true });
    changed(changes, "local");
    assert.equal(style.isConnected, false);
  }
});
test("cosmetic switch does not disable the separate player experiment", async () => {
  const { style, signals, changed } = await setup({ youtubeExperimental: true });
  changed({ cosmetic: { newValue: false } }, "local");
  assert.equal(style.isConnected, false);
  assert.deepEqual(signals, []);
  changed({ youtubeExperimental: { newValue: false } }, "local");
  assert.deepEqual(signals, ["adaegis:youtube-stop"]);
});
test("exceptions survive initial load and CSS resumes after removing one", async () => {
  const { style, changed } = await setup({ allowlist: ["www.youtube.com"] });
  assert.equal(style.isConnected, false);
  changed({ allowlist: { newValue: [] } }, "local");
  assert.equal(style.isConnected, true);
});
test("generic sites do not get YouTube selectors", async () => {
  const { style } = await setup({}, "example.com");
  assert.match(style.textContent, /adsbygoogle/);
  assert.ok(!style.textContent.includes("ytd-"));
});
