# Changelog

Dates are UTC. Version numbers are extension releases, not Chrome Web Store listings.

## 0.4.2 — unreleased

### Changed

- Compiled `dist/` scripts are no longer stored in git. `npm run build` writes them locally; the release ZIP still includes them.

## 0.4.1.1 — 2026-09-08

YouTube ads still played after 0.4.1 because many of them never passed through `response.json()` on `/player`.

### Fixed

- Player JSON is cleaned when the page uses `JSON.parse`, including ad-only follow-ups that have no video id
- `/youtubei/v1/player/ad_break`, `/youtubei/v1/next`, and Shorts reel watch URLs are cleaned the same way as `/player`
- Fetch `blob()` replies are cleaned with the other body readers
- If Skip never appears, the existing ad video is seeked to the end. Live ads with no duration are sped up on that same element
- Overlay close controls and Skip inside an open shadow root are clicked
- A playback error or stall during an ad no longer turns filtering off for that video

Turning the experiment off in the popup still stops it. A video that is already playing when you turn filtering on may still need a reload.

## 0.4.1 — 2026-09-08

YouTube filtering missed ads that 0.4.0 already thought it was handling.

### Fixed

- Skip clicks the actual Skip control. YouTube’s button often has HTML’s default `submit` type and is not in a form; that is no longer ignored
- A hidden Skip placeholder no longer blocks a later visible one
- Player JSON is also cleaned when the page `clone()`s the response, reads `arrayBuffer()`, or omits a JSON content type
- `adBreakHeartbeatParams` and `playerConfig.ssapConfig` are removed from recognized player objects, so ads are not scheduled again after the first strip
- If Skip is missing, the player’s own `skipAd` method is used once under the same click budget

Turning the experiment off in the popup still stops it. A video that is already playing when you turn filtering on may still need a reload.

## 0.4.0 — 2026-09-08

Exception list and timed pause in the popup, YouTube Music as its own grant, and player replies that are not only `response.json()`.

### Added

- Site exceptions can be listed, removed, and typed in by hostname in the popup
- Pause 10 minutes or 1 hour. The toolbar badge shows remaining time, and protection comes back even if Chrome has put the worker to sleep
- YouTube Music filtering, off by default. Chrome asks only for `music.youtube.com`
- Player JSON is also cleaned when the page reads `text()` or loads the same `/player` and `/get_watch` URLs with XHR

### Changed

- A stall, player error, or scan cap on one YouTube video no longer leaves the experiment off for the next video in that same page
- Skip still only runs on home, watch, and Shorts on youtube.com. On Music it can run on ordinary Music pages. Account and billing URLs are still left alone

Turning the experiment off in the popup still stops it. A video that is already playing when you turn filtering on may still need a reload.

## 0.3.4 — 2026-09-08

Follow-up to 0.3.3 for click-throughs that could still miss player data.

### Fixed

- Player data sent on `/youtubei/v1/get_watch`, on a trailing slash, or nested under `playerResponse` is cleaned the same way
- Skip still runs if watch or Shorts has a trailing slash
- In-page navigation also follows YouTube's start and page-data events, not only the finish event

Playback errors, stalls, and the scan limit still stay off until you reload.

## 0.3.3 — 2026-09-08

Bug fixes for 0.3.2.

### Fixed

- Clicking a video from search or a channel no longer drops YouTube player filtering for that video
- Skip still only runs on home, watch, and Shorts. Account and billing pages still turn the experiment off
- Clearing a site exception can start page features on that host's already-open tabs
- Frozen tabs are skipped when injecting into open pages

Playback errors, stalls, and the scan limit still stay off until you reload.

## 0.3.2 — 2026-09-08

Page cleanup and YouTube filtering on tabs that are already open, YouTube in-page navigation, and a larger bundled block list.

### Added

- Page cleanup can start on HTTP and HTTPS tabs you already have open
- YouTube filtering can start on an open YouTube tab instead of waiting for a reload
- YouTube filtering follows in-page navigation between home, watch, and Shorts, and can start again after you leave a search or channel page and come back

### Changed

- Bundled network rules grew from 8 to 24 well-known ad-tech hosts. Still no remote lists, and YouTube media hosts stay unblocked
- Page cleanup hides additional known ad slots, including Google ad boxes, Taboola, Outbrain, and more YouTube ad units

A video that is already playing when you turn YouTube filtering on may still need a reload or the next video. Playback errors, stalls, and the scan limit still stay off until you reload.

## 0.3.1 — 2026-09-08

Patch on the first public release.

### Fixed

- Page cleanup that gives up after a site keeps removing its stylesheet no longer turns off YouTube filtering
- YouTube filtering can start again after you turn it back on, change a setting, or restore a tab from the back-forward cache
- Leaving the page more than once still cleans up page hooks
- The popup now says site exceptions apply to the exact hostname

Playback errors, stalls, and the scan limit still stay off until you reload.

## 0.3.0 — 2026-09-08

First public release. Install from [GitHub Releases](https://github.com/buntatoes/adaegis/releases).

### Added

- Chromium ZIP with prebuilt files, checksums, and an offline install guide
- Optional host permissions: network blocking no longer needs page access
- **Remove page access** in the popup
- Apache License 2.0 and NOTICE
- Toolbar icon and logo

### Changed

- Page cleanup is opt-in (it was on by default in 0.2.0)
- YouTube filtering stays off until you enable it and grant YouTube access
- Settings can only be changed from the packaged popup
- Page scripts no longer see the global exception list
- Tighter extension-page CSP

### YouTube experiment

- Runs only on `youtube.com`, `www.youtube.com`, and `m.youtube.com` (HTTPS, top frame)
- Home, `/watch`, and valid Shorts only
- Edits only `adPlacements`, `playerAds`, and `adSlots` on eligible player responses
- Skip clicks are capped (once per button, 2 seconds apart, 10/minute, 100 per page)

## 0.2.0 — 2026-09-06

### Added

- Cosmetic filtering for recognized ad containers
- Per-site exceptions (exact hostnames, up to 200)
- Toolbar network-action counts
- Optional YouTube player filtering and Skip-button clicks
- Minimum Chrome version 120

### Fixed

- Pause in 0.1.0 could show as off while the ruleset stayed enabled
- Distributed JavaScript is generated from TypeScript instead of handwritten `dist/` files

### Build

- Replaced esbuild with a dependency-free Node compile step (Node.js 22.18+)

## 0.1.0 — 2026-09-06

### Added

- Manifest V3 service worker and eight network rules (DoubleClick, Google Syndication, Google Ad Services, AppNexus, Amazon, Criteo, Taboola, Outbrain)
- Enable/pause popup and local settings

### Known issue

- Pause did not disable the core ruleset. Fixed in 0.2.0.
