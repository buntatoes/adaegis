import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { packageExtension, FILES, zip } from "../scripts/package.mjs";
const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const manifest = JSON.parse(await read("manifest.json"));

test("least-privilege manifest and explicit network-denying extension CSP", () => {
  assert.deepEqual(manifest.permissions, ["declarativeNetRequest", "storage", "scripting", "activeTab"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  for (const key of ["externally_connectable", "web_accessible_resources", "update_url", "sandbox"]) assert.equal(manifest[key], undefined);
  const csp = manifest.content_security_policy.extension_pages;
  for (const directive of ["script-src 'self'", "object-src 'none'", "connect-src 'none'", "form-action 'none'", "frame-src 'none'"]) {
    assert.ok(csp.includes(directive));
  }
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(!csp.includes("unsafe-inline"));
});
test("installation page is offline, script-free, and references local CSS", async () => {
  const html = await read("INSTALL.html");
  assert.ok(!/<script\b|\son\w+\s*=|<iframe\b/i.test(html));
  assert.ok(!/https?:\/\//i.test(html));
  assert.match(html, /href="install.css"/);
  assert.match(html, /img-src 'self'/);
  assert.match(html, /src="icons\/icon128\.png"/);
  assert.ok(FILES.includes("icons/icon128.png"));
  assert.ok((await read("install.css")).length > 0);
});
test("popup uses no HTML execution sinks or inline code", async () => {
  const html = await read("popup.html");
  const script = await read("src/popup.ts");
  assert.ok(!/<style\b|\son\w+\s*=/i.test(html));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(/.test(script));
  assert.match(html, /id="revoke"/);
  assert.match(html, /href="INSTALL.html"/);
  assert.match(html, /exact hostname/);
  assert.match(html, /src="icons\/icon48\.png"/);
});
test("invalid zip entry paths are rejected", () => {
  for (const path of ["../secret", "AdAegis/../../secret", "/etc/passwd", "AdAegis\\evil", "other/file"]) {
    assert.throws(() => zip([[path, Buffer.from("test")]]), /Invalid archive path/);
  }
});
test("generated ZIP is reproducible, has the exact runtime inventory, and valid SHA-256 values", async () => {
  const first = await packageExtension();
  const second = await packageExtension();
  assert.equal(first.sha256, second.sha256);
  const bytes = await readFile(first.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), first.sha256);
  const entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), uncompressed = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    const content = inflateRawSync(bytes.subarray(start, start + size));
    assert.equal(content.length, uncompressed);
    entries.set(name, content);
    offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  const eocd = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(eocd), 0x06054b50);
  assert.equal(bytes.readUInt16LE(eocd + 10), entries.size);
  assert.equal(bytes.readUInt32LE(eocd + 16), offset);
  assert.deepEqual([...entries.keys()].sort(), [...FILES.map(path => "AdAegis/" + path), "AdAegis/SHA256SUMS.txt"].sort());
  assert.ok(![...entries.keys()].some(path => /node_modules|\.env|\.pem|tests\/|src\//.test(path)));
  for (const line of entries.get("AdAegis/SHA256SUMS.txt").toString().trim().split("\n")) {
    const [hash, name] = line.split("  ");
    assert.equal(createHash("sha256").update(entries.get("AdAegis/" + name)).digest("hex"), hash);
  }
});
