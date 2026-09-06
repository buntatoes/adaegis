# AdAegis

An original TypeScript Manifest V3 content-blocker prototype for Chrome/Chromium 120+.
Version 0.2.0 adds cosmetic filtering, exact-hostname exceptions, and an **opt-in,
experimental YouTube player module**. This is a small starter project, not a
replacement for a mature blocker or a promise of ad-free YouTube.

## Normal protection

- Eight bundled, hand-authored network rules for common ad-tech domains.
- A working global pause switch: disables the core DNR rules and page filtering.
- Conservative cosmetic rules for AdSense containers, selected ad frames, and
  YouTube promoted cards/companion ads. CSS also applies to newly inserted ads.
  It does not hide the video player or cover its Skip/error controls.
- Exact-hostname exceptions (including the distinction between www and non-www),
  up to 200. These bypass this extension's network filtering for the top-level
  page and its frame hierarchy, and disable page filtering/the experiment there.
- Chrome-managed per-tab network action counts in the toolbar badge. These are
  not a count of individual ads, cosmetic removals, or player skips.

Reload an open page after adding/removing an exception. Frame-based network
allow rules take effect on navigation. Cosmetic changes take effect immediately.
The popup acts on the current tab; visit an excepted host to remove its exception.

## Experimental YouTube filtering

**Off by default.** Open the popup, enable network protection and the player
experiment, then reload YouTube. Registration is limited to youtube.com,
www.youtube.com, and m.youtube.com; it does not run inside third-party embeds.

The locally bundled MAIN-world script runs at document_start and:

1. Removes recognized top-level ad arrays from a recognizable
   ytInitialPlayerResponse, including later assignments where safely hookable.
2. Cleans the json() result of same-origin /youtubei/v1/player fetch responses.
   It leaves the Response object, status, headers, stream, and request behavior intact.
3. Clicks an available visible Skip button during a detected ad, at most once
   per button element. It never seeks the video, simulates playback events,
   or pretends an unavailable Skip button is usable.
4. Stops and restores its installed hooks on a player/video error or a
   15-second unpaused playback stall. Turning it off also restores the hooks.

This deliberately narrow experiment does **not** cover XHR, response.text(),
cloned responses, every internal player path, or server-stitched ad segments.
It does not block youtube.com or googlevideo.com wholesale, bypass DRM, or
download executable updates. Scripted skipping is not network ad blocking.
Changing shared player data may break playback; live efficacy is unverified.

Stopping cannot reconstruct ad data that was already removed or reinitialize
an already broken player. **Turn the experiment off and reload if playback fails.**
For persistent issues, except the site and reload. A backoff reason is exposed
in document.documentElement.dataset.adaegisYoutube for local debugging.

MV3 allows page scripts as well as declarative network rules; it does not make
YouTube blocking categorically impossible. However, YouTube's undocumented
internals and ad delivery can change, so this implementation needs live testing
and ongoing maintenance.

## Install / update

The committed dist/ files are generated from the TypeScript source.
No build is required just to try the unpacked extension.

1. Download/clone this repository and extract it if necessary.
2. Open chrome://extensions and enable Developer mode.
3. Choose **Load unpacked** and select the repository root containing manifest.json.
4. For updates, click **Reload** on the extension and reload existing web pages.
5. The YouTube experiment remains off until explicitly enabled in the popup.

## Development and tests

Use Node.js **22.18+** (Node 24 recommended). The build and regression tests use
Node's built-in TypeScript type erasure and have no package-download requirement:

```bash
npm run build
npm test
```

This emits an experimental-API warning on some Node versions. Type erasure is
not type checking. Full static checking requires installing the dev dependencies:

```bash
npm install
npm run typecheck
npm run check
```

Do not edit dist/ manually. Tests check that all generated JS matches src/,
including the prebuilt pause behavior that was incorrect in 0.1.0.

### Validation status for 0.2.0

- Build and 30 automated regression tests passed under Node 24.19.0.
- Tests exercise mocked Chrome APIs and synthetic player/DOM fixtures: settings,
  migration, pause, exceptions, rollback, script registration, cosmetic cleanup,
  narrowly scoped JSON changes, skipping, error backoff, and package integrity.
- Static tsc checking could not run in the implementation environment:
  dev-dependency downloads were denied and tsc was unavailable.
- No Chrome binary was available for unpacked-extension or live YouTube tests.
  These tests **do not establish real-world ad-blocking effectiveness**.
- See [manual test checklist](docs/TESTING.md) before relying on the extension.

## Privacy and permissions

No telemetry, external server, remote filter downloads, or analytics. Local
storage contains switches and excepted hostnames, not a browsing history.
No request contents, account tokens, or player responses are logged or saved.

- declarativeNetRequest: network rules, exceptions, and action-count badge.
- storage: local preferences.
- scripting: register/unregister the optional YouTube MAIN-world script.
- activeTab: inspect the current tab when the user opens the popup.
- HTTP/HTTPS host access: page-ad CSS and the domain-scoped player experiment.

Cosmetic filtering is top-frame only; embedded/cross-origin frame content and
shadow DOM are not comprehensively covered. Strict page CSP or restricted browser
pages may prevent some page modifications. The main-world script is not a
security boundary: YouTube can observe or alter code in its own page context.
The only page-to-content-script signal stops the experiment; it cannot change
settings or invoke privileged extension operations.

## Sources and license

No uBlock source, assets, or filter lists are included. Reference APIs:
[Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest),
[content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
[scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting).

No license has been selected. Until one is added, no general permission to
reuse or distribute this project's code is granted.
