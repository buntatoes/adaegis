import test from "node:test";
import assert from "node:assert/strict";
globalThis.chrome = { declarativeNetRequest: {
  RuleActionType: { ALLOW_ALL_REQUESTS: "allowAllRequests" }, ResourceType: { MAIN_FRAME: "main_frame" }
} };
const { normalize, hostname, exceptionRules } = await import("../dist/settings.js");

test("safe defaults; experiment is opt-in", () => {
  assert.deepEqual(normalize({}), { enabled: true, cosmetic: true, youtubeExperimental: false, allowlist: [] });
  assert.equal(normalize({ youtubeExperimental: "true" }).youtubeExperimental, false);
  assert.equal(normalize({ enabled: false }).enabled, false);
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
test("exception regex matches exact host and ports, not suffixes or subdomains", () => {
  const [rule] = exceptionRules(["example.com"]);
  const regex = new RegExp(rule.condition.regexFilter);
  for (const url of ["http://example.com/", "https://example.com:8443/a"]) assert.ok(regex.test(url));
  for (const url of ["https://exampleXcom/", "https://example.com.evil.test/", "https://www.example.com/", "https://evil.test/?example.com/"]) assert.ok(!regex.test(url));
  assert.equal(rule.action.type, "allowAllRequests");
  assert.ok(rule.priority > 1);
  assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
});
