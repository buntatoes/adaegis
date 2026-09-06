# AdAegis

A small, original TypeScript Manifest V3 ad-blocker for desktop Chrome/Chromium 120+.
**0.3.0 is a hardened testing build.** It is distributed outside the Chrome Web Store.
It is not a security-certified release or a guarantee of ad-free YouTube.

## Documentation

- [Changelog](CHANGELOG.md): the full implementation history, fixes and validation status.
- [Installation guide](INSTALL.html): install, update, remove permissions and uninstall.
- [Security policy](SECURITY.md): permissions, hard-coded interaction limits and residual risks.
- [Manual testing checklist](docs/TESTING.md): browser checks still needed before general distribution.

## Version highlights

| Version | Main updates |
| --- | --- |
| 0.3.0 | Ready-to-extract installation ZIP, offline guide, optional page permissions, protected settings, stricter messages/CSP and bounded YouTube interactions. |
| 0.2.0 | Cosmetic filtering, exact-hostname exceptions, network-action badge, opt-in YouTube player experiment and the prebuilt pause fix. |
| 0.1.0 | Original TypeScript MV3 starter: eight network rules, local preferences, popup and initial build setup. The prebuilt pause defect was corrected in 0.2.0. |

These are extension version milestones. See the [changelog](CHANGELOG.md) for
the detailed implementation history.

## Install without coding

Use the ready-made **adaegis-v0.3.0-chromium.zip** supplied by the project owner.
No Node.js, terminal, administrator installer, or build step is needed.

1. Extract the ZIP and keep the **AdAegis** folder in a permanent location.
2. Open your browser's Extensions page (chrome://extensions in Chrome/Chromium).
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the extracted **AdAegis** folder that contains manifest.json. Pin AdAegis
   from the extensions menu, then open its popup.

The package includes an offline [installation guide](INSTALL.html). Browser
extension-management URLs must be entered in the address bar. Web pages cannot
complete the installation for the user. Managed browsers may prohibit unpacked
extensions; the package does not bypass such policies.

You can also download this repository's source archive, extract it and select
the root folder: the generated dist/ files are committed.
The GitHub repository remains private, so downloads there require access.

### Updating and uninstalling

Replace the contents of the **same installed folder** with the new version's
files, click **Reload** in the browser's Extensions page and reload open websites.
Keep that folder in place; moving it or removing/reinstalling the extension can
change its identity and lose settings. Updates are manual.

To uninstall, choose **Remove** in the Extensions page, then delete the folder.
To keep network blocking but remove page permissions, use **Remove page access**
in the popup and reload open pages.

## Features and default permissions

- Eight fixed network rules for common ad-tech domains. Enabled by default.
- A global pause switch, up to 200 exact-hostname exceptions and Chrome-managed
  network-action counts. Reload after changing exceptions. Counts are not ad totals.
- Optional page cleanup hides recognized ad containers, including selected
  YouTube promoted cards. Off by default; asks for HTTP/HTTPS page access.
- Optional YouTube experiment. Off by default; asks for access to three exact
  YouTube HTTPS hosts. Page cleanup can remain off.

Basic blocking has **no required page host permissions**. There is no telemetry,
remote filter feed, remotely executed code, or automatic updater. Settings stay
local; content scripts cannot read the global exception list or modify settings.
All page features are permission-gated. Existing users keep a feature enabled
only when its required site permission is still granted.

## Experimental YouTube mode

Enable it in the popup, accept YouTube access and reload YouTube. It tries to:

- Remove only recognized ad arrays from a local copy of an eligible player response.
- Clean the json() consumption of a same-origin player fetch response.
- Click a recognized visible, enabled, non-form Skip button during an ad.
- Stop its hooks on playback errors, prolonged stalls or unsupported navigation.

It runs only in the top frame of YouTube's home/watch/valid Shorts pages over
HTTPS. It does not cover XHR, response.text(), every player path, embeds or
server-stitched ads. Directly opening a different route may require reloading
after navigating to a supported page.

Hard-coded limits restrict metadata changes, DOM scans and Skip clicks. The
wrapper forwards existing requests exactly once with their original URL,
parameters, body, method, credentials and headers. Authentication, subscription,
playability, stream signatures and DRM data are not changed.
See [SECURITY.md](SECURITY.md) for the precise allowed operations and limits.

The current hard-coded boundaries include:

| Operation | Limit |
| --- | --- |
| Local player edits | Only the `adPlacements`, `playerAds` and `adSlots` arrays; at most 200 changed responses per document. |
| Automatic Skip clicks | A recognized enabled, visible, non-form button; once per element, at least 2 seconds apart, at most 10 per minute and 100 per document. |
| Page processing | DOM scans coalesced at 250 ms and stopped after 10,000 scans; cosmetic CSS insertion limited to 10 attempts per document. |

These limits are bundled in the code, not configurable through website messages
or remotely supplied rules. They cannot protect against someone editing the
extension's source or a compromised browser/operating system.

Live ad-blocking effectiveness is unverified. If playback fails, disable the
experiment and reload. Restoring hooks cannot rebuild an already broken player.
Normal filtering is also intentionally small; it is not a mature filter-list engine.

## Development

Node.js **22.18+** is needed for development/packaging only. Runtime code has no
third-party packages. The build and package commands require no dependency downloads:

```bash
npm run build
npm run package
```

The package command writes the ZIP and its SHA-256 checksum under release/.
Only an explicit inventory of runtime files and installation/security
documentation is packaged. Source code, test tools,
dependencies, credentials and environment files are excluded.

Build output uses Node's TypeScript type erasure, which may emit an experimental
API warning. Type erasure is not static checking. To check types:

```bash
npm install
npm run typecheck
npm run check
```

Development dependency versions are pinned. Do not manually edit dist/.

### Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | TypeScript worker, popup, settings, cosmetic filtering and YouTube experiment. |
| `dist/` | Generated JavaScript loaded by the browser. |
| `rules/core.json` | The eight bundled network-blocking rules. |
| `scripts/build.mjs` | Generate JavaScript from TypeScript without package downloads. |
| `scripts/package.mjs` | Build the installation ZIP from an explicit file inventory and generate checksums. |
| `tests/` | Development checks for extension behavior and package integrity. |
| `release/` | Generated ZIP/checksum output; excluded from version control. |

## Distribution references

[Chrome's unpacked-install instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
document this installation method.
[Chrome's alternative-installation rules](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions)
restrict ordinary external CRX installation on Windows/macOS; Linux has additional
self-hosting options. This package uses the manual unpacked flow and does not
modify registry entries, enterprise policies, certificates or browser safeguards.

API references: [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions),
[storage access](https://developer.chrome.com/docs/extensions/reference/api/storage),
[DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

## Source and license

No uBlock source, assets or filter lists are included. No license has been
selected; no general permission to reuse or redistribute the source has been
granted by this repository.
