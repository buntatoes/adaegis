# Changelog

All notable implemented updates to AdAegis are recorded here, newest first.
Dates are UTC. Version numbers describe extension milestones, not Chrome Web
Store publications or an independent security certification.

## Unreleased

### Documentation

- Add the complete changelog for versions 0.1.0 through 0.3.0.
- Expand the README with documentation links, version highlights, current
  hard-coded interaction limits and a repository layout guide.
- Preserve installation, upgrade, uninstall, privacy and development instructions,
  along with the outstanding static-checking and live-browser testing limits.

## 0.3.0 — 2026-09-06

[Implementation commit](https://github.com/buntatoes/adaegis/commit/cc5efb31a51382e2e55640b4643c3d929425080e)

### Installation and packaging

- Add a ready-to-extract Chromium installation ZIP containing prebuilt runtime files.
  End users do not need Node.js, npm, a terminal or an administrator installer.
- Add the offline, script-free `INSTALL.html` guide and local stylesheet, covering
  Load unpacked, permanent folder placement, manual updates, permission removal,
  uninstalling and restricted/managed-browser limitations.
- Add `npm run package` to build the distribution ZIP and its checksum.
- Package only an explicit runtime/documentation inventory. Reject symbolic links,
  unsafe archive paths and oversized entries; exclude dependencies, development
  tools, environment files and credentials.
- Generate per-file SHA-256 checksums inside the ZIP and a detached ZIP checksum.
- Make archive output reproducible and ignore generated `release/` files in Git.
- Add an installation-help link in the popup. Keep updates manual.

### Permissions and settings security

- Remove required HTTP/HTTPS host permissions and unconditional content scripts.
  Basic network blocking remains available without page-read access.
- Change page cleanup from enabled by default to opt-in. Keep the YouTube
  experiment off by default.
- Request optional HTTP/HTTPS access for page cleanup, or only the three exact
  YouTube HTTPS hosts for YouTube-only filtering.
- Gate script registration on both the saved switches and granted permissions.
- Add **Remove page access** to disable page features and release their grants.
  Handle permission revocation by disabling affected features and removing scripts.
- Restrict local storage to `TRUSTED_CONTEXTS`. Give content scripts only their
  own effective cosmetic/YouTube policy booleans, not the global exception list.
- Enforce exact message schemas and packaged-popup sender checks for mutations.
  Reject unexpected fields, invalid values, inactive-tab exception changes,
  forged origins and content-script mutation requests.
- Resolve page-policy targets from browser-supplied top-frame sender metadata.
  Refresh notifications contain no settings or hostname lists.
- Strengthen hostname validation and keep exceptions bounded to 200 entries.
- Add a restrictive extension-page Content Security Policy, prohibiting outgoing
  network connections, inline/remote scripts, forms, frames and embedded objects.
- Move popup styles into a local stylesheet and pin development dependency versions.

### Hard-coded website-interaction limits

- Limit the experimental player module to top-frame HTTPS, default-port pages
  on `youtube.com`, `www.youtube.com` and `m.youtube.com`.
- Allow only home, `/watch` and valid 11-character-ID Shorts routes. Stop on
  unsupported navigation or page exit.
- Restrict response handling to successful, non-redirected, same-origin
  `/youtubei/v1/player` JSON responses.
- Change ad-data cleanup to a shallow copy omitting only `adPlacements`,
  `playerAds` and `adSlots` arrays from recognized plain-object responses.
- Require a valid video ID and playability status `OK`; leave unfamiliar shapes,
  accessors, non-OK states and ineligible fields untouched.
- Cap modified responses at 200 per document and reject eligible response objects
  with more than 128 top-level keys.
- Preserve original fetch arguments and call the original fetch exactly once:
  no URL/query, header, body, method or credential rewriting; no extra requests
  or retries. Preserve auth, subscription, playability, signature and DRM fields.
- Restrict automatic skipping to connected, visible, enabled HTML buttons of
  type `button`, outside forms, under a player showing an ad.
- Limit clicking to once per element, at least 2 seconds apart, no more than
  10 clicks per minute and 100 per document.
- Coalesce DOM inspections at 250 ms and stop after 10,000 scans per document.
- Limit cosmetic stylesheet insertion to 10 attempts instead of repeatedly
  fighting a page that removes it; narrow the cosmetic observer's scope.
- Preserve playback-error/stall backoff and hook restoration.

### Documentation

- Add `SECURITY.md` with the enforced boundaries, residual risks and reporting
  guidance; revise the README and manual browser checklist.
- Keep the live-browser verification requirements documented. This remains a
  hardened testing build, not an audit.

## 0.2.0 — 2026-09-06

[Implementation commit](https://github.com/buntatoes/adaegis/commit/ea9063a81b2c7bebaeb359d9e3d87ac341cac53e)

### Added

- Conservative cosmetic filtering for recognized generic ad containers and
  YouTube promoted/companion ad elements, including dynamically inserted content.
- Per-site exceptions using exact hostnames, with up to 200 entries and
  `allowAllRequests` rules for a page's frame hierarchy.
- Chrome-managed network-action counts in the toolbar badge.
- Separate popup controls for global protection, cosmetics, the current site
  exception and experimental YouTube filtering.
- Opt-in, dynamically registered YouTube `MAIN`-world code at `document_start`.
- Experimental cleanup of recognized startup player ad arrays and the
  `json()` consumption of same-origin player fetch responses.
- Automatic clicking of recognized available Skip controls during a detected ad.
- Error/stall detection, hook restoration, local backoff diagnostics and
  instructions to disable/reload when playback fails.
- Serialized settings updates, rollback for failed extension API/storage writes,
  and startup/installation handling.
- An explicit minimum Chrome version of 120 and a manual testing checklist.

### Fixed

- Correct the prebuilt JavaScript pause defect: the 0.1.0 distribution could
  display a paused state while its core blocking rules remained enabled.
- Generate all distributed JavaScript from the TypeScript source and check for
  source/build drift, instead of maintaining separate handwritten output.
- Improve popup loading, pending-state and failure handling.

### Build

- Replace the initial esbuild pipeline with a dependency-free Node TypeScript
  erasure script. Development now requires Node.js 22.18+ instead of 20+.
- Keep static TypeScript checking as a separate `tsc --noEmit` command.
- Keep type checking as a separate development command and document live-browser
  verification requirements.

### Limitations at this milestone

- Page cleanup used broad required HTTP/HTTPS access and was enabled by default;
  version 0.3.0 changes it to permission-gated opt-in.
- The experiment did not cover XHR, `response.text()`, cloned responses, every
  YouTube player path, or server-stitched ads. Live efficacy was unverified.
- Restoring hooks could not reconstruct already-modified player state; recovery
  required disabling the experiment and reloading.

## 0.1.0 — 2026-09-06

[Initial setup completed](https://github.com/buntatoes/adaegis/commit/effd5f913197a36b3ce9604c00895ec31c8021d6)

### Added

- Initialize the private repository with original TypeScript Manifest V3 code.
- Add a service worker and static `declarativeNetRequest` ruleset.
- Include eight hand-authored rules for DoubleClick, Google Syndication, Google
  Ad Services, AppNexus, Amazon Ad System, Criteo, Taboola and Outbrain domains.
- Add an enable/pause popup, local preferences and an OFF badge.
- Add TypeScript compiler configuration, esbuild development commands, initial
  prebuilt JavaScript and a dependency-directory ignore rule.
- Add README instructions for building and loading an unpacked extension, plus
  scope, privacy, YouTube limitations and the absence of a selected license.
- Use no uBlock source code, assets or copied filter lists.

### Known issue

- The initial prebuilt pause logic did not disable the core ruleset. This was
  fixed in 0.2.0. The initial file readback was not a full build, type check,
  or browser-runtime validation.
