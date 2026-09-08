# Changelog

Dates are UTC. Version numbers are extension releases, not Chrome Web Store listings.

## 0.3.1 — 2026-09-08

### Fixed

- Page cleanup giving up after a CSS tug-of-war no longer stops YouTube filtering
- YouTube filtering can start again after a policy refresh, back-forward cache restore, or turning the experiment back on
- Playback errors, stalls, and scan limits still stay off until you reload
- Hiding the page more than once still cleans up cosmetics and YouTube hooks
- Popup copy matches exact-hostname exceptions

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
