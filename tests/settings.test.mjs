import test from "node:test";
import assert from "node:assert/strict";
globalThis.chrome = { declarativeNetRequest: {
  RuleActionType: { ALLOW_ALL_REQUESTS: "allowAllRequests" }, ResourceType: { MAIN_FRAME: "main_frame" }
} };
const { normalize, hostname, parseHost, exceptionRules, matchesPattern, pauseBadge, isYoutubeHost, isMusicHost } = await import("../dist/settings.js");

test("safe defaults; experiment is opt-in", () => {
  assert.deepEqual(normalize({}), {
    enabled: true, cosmetic: false, youtubeExperimental: false,
    youtubeMusicExperimental: false, allowlist: [], pauseUntil: 0
  });
  assert.equal(normalize({ youtubeExperimental: "true" }).youtubeExperimental, false);
  assert.equal(normalize({ youtubeMusicExperimental: "true" }).youtubeMusicExperimental, false);
  assert.equal(normalize({ enabled: false }).enabled, false);
  assert.equal(normalize({ pauseUntil: "100" }).pauseUntil, 0);
});
test("normalize rejects malformed hosts and deduplicates", () => {
  assert.deepEqual(normalize({ allowlist: ["example.com", "example.com", "*.com", "x/y", "a@b", "UPPER.com", "", 1] }).allowlist, ["example.com"]);
});
test("unsupported pages never produce a site exception", () => {
  for (const url of ["chrome://extensions", "about:blank", "file:///tmp/a", "javascript:x", undefined]) {
    assert.equal(hostname(url), null);
  }
  assert.equal(hostname("https://EXAMPLE.com:8443/watch?v=1"), "example.com");
});
test("match patterns cover only http(s) hosts this extension registers", () => {
  assert.equal(matchesPattern("https://news.example/a", "https://*/*"), true);
  assert.equal(matchesPattern("http://news.example/a", "http://*/*"), true);
  assert.equal(matchesPattern("https://news.example/a", "http://*/*"), false);
  assert.equal(matchesPattern("https://www.youtube.com/watch", "https://www.youtube.com/*"), true);
  assert.equal(matchesPattern("https://m.youtube.com/", "https://www.youtube.com/*"), false);
  assert.equal(matchesPattern("https://www.youtube.com.evil.test/", "https://www.youtube.com/*"), false);
  assert.equal(matchesPattern("chrome://extensions", "*://*/*"), false);
  assert.equal(matchesPattern("https://news.example/", "*://news.example/*"), true);
  assert.equal(matchesPattern("https://evil.news.example/", "*://news.example/*"), false);
});
test("exception regex matches exact host and ports, not suffixes or subdomains", () => {
  const [rule] = exceptionRules(["example.com"]);
  const regex = new RegExp(rule.condition.regexFilter);
  for (const url of ["http://example.com/", "https://example.com:8443/a"]) assert.ok(regex.test(url));
  for (const url of ["https://exampleXcom/", "https://example.com.evil.test/", "https://www.example.com/", "https://evil.test/?example.com/"]) assert.ok(!regex.test(url));
  assert.equal(rule.action.type, "allowAllRequests");
  assert.ok(rule.priority > 1);
  assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
});
test("parseHost accepts typed hostnames and http(s) URLs, not wildcards", () => {
  assert.equal(parseHost(" Example.COM "), "example.com");
  assert.equal(parseHost("https://www.youtube.com/watch?v=1"), "www.youtube.com");
  assert.equal(parseHost("news.example:8443/path"), "news.example");
  assert.equal(parseHost("*.example.com"), null);
  assert.equal(parseHost("https://example.com.evil.test/"), "example.com.evil.test");
  assert.equal(parseHost(""), null);
});
test("pause badge shows remaining time, then OFF", () => {
  const now = 1_000_000;
  assert.equal(pauseBadge({ enabled: true, pauseUntil: now + 600000 }, now), "");
  assert.equal(pauseBadge({ enabled: false, pauseUntil: now + 10 * 60000 }, now), "10m");
  assert.equal(pauseBadge({ enabled: false, pauseUntil: now + 60 * 60000 }, now), "1h");
  assert.equal(pauseBadge({ enabled: false, pauseUntil: 0 }, now), "OFF");
});
test("YouTube and Music hosts are distinct", () => {
  assert.equal(isYoutubeHost("www.youtube.com"), true);
  assert.equal(isYoutubeHost("music.youtube.com"), false);
  assert.equal(isMusicHost("music.youtube.com"), true);
  assert.equal(isMusicHost("www.youtube.com"), false);
});
