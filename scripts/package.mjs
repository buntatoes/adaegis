import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// Explicit inventory: no recursive repository copy, symlinks, secrets or dev dependencies.
export const FILES = Object.freeze([
  "manifest.json", "popup.html", "popup.css", "INSTALL.html", "install.css", "SECURITY.md",
  "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
  "dist/background.js", "dist/settings.js", "dist/popup.js", "dist/content.js", "dist/youtube.js",
  "rules/core.json", "LICENSE", "NOTICE"
]);
const root = new URL("../", import.meta.url);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, bytes] of entries) {
    if (!/^AdAegis\/[A-Za-z0-9_./-]+$/.test(name) || name.includes("..")) throw Error("Invalid archive path.");
    const filename = Buffer.from(name);
    const compressed = deflateRawSync(bytes, { level: 9 });
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(0x21, 12); // fixed 1980-01-01 date for reproducibility
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(0x81a40000, 38); // regular file, rw-r--r--
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export async function packageExtension() {
  const entries = [];
  const sums = [];
  for (const path of FILES) {
    let prefix = "";
    for (const part of path.split("/")) {
      prefix += part;
      if ((await lstat(new URL(prefix, root))).isSymbolicLink()) throw Error("Symlink in package path: " + path);
      prefix += "/";
    }
    const url = new URL(path, root);
    const stat = await lstat(url);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error("Invalid package file: " + path);
    const bytes = await readFile(url);
    entries.push(["AdAegis/" + path, bytes]);
    sums.push(createHash("sha256").update(bytes).digest("hex") + "  " + path);
  }
  entries.push(["AdAegis/SHA256SUMS.txt", Buffer.from(sums.join("\n") + "\n")]);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw Error("Invalid version");
  const filename = "adaegis-v" + manifest.version + "-chromium.zip";
  await mkdir(new URL("release/", root), { recursive: true });
  const bytes = zip(entries);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const output = new URL("release/" + filename, root);
  await writeFile(output, bytes);
  await writeFile(new URL("release/" + filename + ".sha256", root), hash + "  " + filename + "\n");
  return { path: fileURLToPath(output), sha256: hash, files: entries.length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await packageExtension()));
