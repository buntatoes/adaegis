# AdAegis

A small, original TypeScript Manifest V3 ad-blocker for desktop Chrome/Chromium 120+.
**0.3.0 is a hardened testing build.** It is distributed outside the Chrome Web Store.
It is not a security-certified release or a guarantee of ad-free YouTube.

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

Live ad-blocking effectiveness is unverified. If playback fails, disable the
experiment and reload. Restoring hooks cannot rebuild an already broken player.
Normal filtering is also intentionally small; it is not a mature filter-list engine.

## Development

Node.js **22.18+** is needed for development/packaging only. Runtime code has no
third-party packages. Build and regression tests require no dependency downloads:

```bash
npm run build
npm test
npm run package
```

The package command runs the regression suite, then writes the ZIP and its
SHA-256 checksum under release/. Only an explicit inventory of runtime files
and installation/security documentation is packaged. Source code, test tools,
dependencies, credentials and environment files are excluded.

Build output uses Node's TypeScript type erasure, which may emit an experimental
API warning. Type erasure is not static checking. To check types:

```bash
npm install
npm run typecheck
npm run check
```

Development dependency versions are pinned. Do not manually edit dist/.

## Validation

- Build and **50 automated tests passed** using Node 24.19.0.
- Tests cover mocked extension APIs, synthetic player/DOM behavior, malformed
  messages, permission denial/revocation, least privilege, request-argument
  preservation, data-edit boundaries, click budgets, recovery and ZIP integrity.
- Repeated packaging produced identical bytes. Python's independent ZIP reader
  also checked the archive without errors.
- **Full tsc checking and real Chrome/Chromium tests remain pending.** Dependency
  installation was denied and a test-browser binary was unavailable.
- This is not a penetration test, independent audit, or assurance that no
  vulnerabilities remain. Follow [the manual checks](docs/TESTING.md) before
  distributing a release as ready for general use.

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
