# Security

AdAegis 0.4.1.1 is an early public build. It is not an audited security product.

## Permissions

- Network blocking does not need page access.
- Page cleanup asks for HTTP/HTTPS access when you turn it on.
- YouTube filtering asks only for `youtube.com`, `www.youtube.com`, and `m.youtube.com` over HTTPS.
- YouTube Music filtering asks only for `music.youtube.com` over HTTPS.
- Timed pause uses the `alarms` permission so a 10-minute or 1-hour pause can end after the worker sleeps.
- **Remove page access** in the popup turns those page features off and drops the grants.

Settings are stored locally and can only be changed from this extension's popup. Page scripts receive two booleans for that page (cleanup and YouTube), not your exception list.

The extension does not use `externally_connectable`, web-accessible resources, native messaging, the debugger, proxy, cookies, a broad `tabs` permission, remote scripts, `eval`, or downloads of executables. Extension pages cannot make network requests or run inline scripts.

Turning on page cleanup, YouTube filtering, or Music filtering injects the matching scripts into open tabs you have already granted. Clearing a site exception does the same for that host. Restricted pages (browser UI, the Chrome Web Store, frozen tabs, and similar) are skipped.

## YouTube experiment

Limits are compiled into the extension. A website cannot raise them.

| What | Limit |
| --- | --- |
| Where it runs | Top frame, HTTPS, default port. youtube.com hosts if that switch is on; `music.youtube.com` only if Music is on |
| Skip clicks | YouTube: home, `/watch`, and `/shorts/` plus an 11-character video ID. Music: ordinary Music pages. Trailing slashes still count. |
| Player responses | Same-origin `/youtubei/v1/player`, `/get_watch`, `/player/ad_break`, `/next`, and Shorts reel watch JSON, success, no redirect, via `json()`, `text()`, `clone()`, `arrayBuffer()`, `blob()`, or XHR. Missing or `text/plain` content types still count. Nested `playerResponse` on those replies only. `JSON.parse` of the same shapes on the page. Also on search and channel pages while the experiment is on |
| Data edits | Only `adPlacements`, `playerAds`, `adSlots`, `adBreakHeartbeatParams`, and `playerConfig.ssapConfig` on a plain JSON object. A recognized OK player object still qualifies without those keys; an ad-only object with those keys and no video id also qualifies. Non-OK player objects are left alone |
| Volume | At most 200 edited responses per video; at most 256 top-level keys inspected |
| Skip button | Visible, enabled `button` outside a form, under an ad-showing player, including an open shadow root on that player. HTML’s default `submit` type is allowed when there is no form. Overlay close buttons on the player are included |
| Skip fallback | If no such button is present, the existing `video` element is seeked to its end, or sped up if duration is infinite. The player’s own `skipAd` is used only after that |
| Skip budget | Once per element, ≥2 seconds apart, ≤10 per minute, ≤100 per video |
| DOM scans | Coalesced at 250 ms; stop after 10,000 per video |
| Cosmetic CSS | Stop after 10 insertions. Does not stop YouTube filtering. |
| Pause | Turning the experiment off, hiding the page, or opening account, sign-in, billing, or embedded player URLs. Search and channels keep player filtering in place. |
| Give up until the next video | Player/video errors outside an ad, 15-second unpaused stall outside an ad, or 10,000 DOM scans. A new video ID in the same page starts a fresh budget. |

Original fetch and XHR arguments are forwarded once. AdAegis does not retry, spoof login or ad-completion events, or change stream URLs, signatures, DRM, or playability. Unknown shapes are left alone. XHR wrapping is only for those player paths. Seeking or speeding up uses the page’s existing video element during an ad. `skipAd` is the player’s own method and is used only when no eligible Skip button is present and the current ad cannot be seeked.

Network rules only block the ad-tech hosts in `rules/core.json`, plus exact-hostname allow exceptions. There are no redirect or header-rewrite rules. YouTube, `googlevideo.com`, and other Google site/media hosts are not in that list.

## What this does not cover

- Page scripts share the page's JavaScript environment. A page can interfere with them.
- A Skip click runs the site's own click handler.
- Restoring hooks will not repair an already broken player.
- A compromised browser, another malicious extension, or edited unpacked files are out of scope.
- Broad page permission stays broad until you remove it. This is not a malware scanner.
- Checksums catch accidental corruption. They do not prove who published the ZIP.

## Reporting

Report vulnerabilities with [GitHub private vulnerability reporting](https://github.com/buntatoes/adaegis/security/advisories/new). Do not open a public issue, and do not include passwords or browsing data. Turn the affected feature off while it is investigated.
