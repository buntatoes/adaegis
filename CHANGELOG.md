# Changelog

Dates are UTC. Version numbers are extension releases, not Chrome Web Store listings.

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
