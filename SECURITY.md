# Security

AdAegis 0.3.0 is an early public release. It is not an audited security product.

## Permissions

- Network blocking does not need page access.
- Page cleanup asks for HTTP/HTTPS access when you turn it on.
- YouTube filtering asks only for `youtube.com`, `www.youtube.com`, and `m.youtube.com` over HTTPS.
- **Remove page access** in the popup turns those features off and drops the grants.

Settings are stored locally and can only be changed from this extension's popup. Page scripts receive two booleans for that page (cleanup and YouTube), not your exception list.

The extension does not use `externally_connectable`, web-accessible resources, native messaging, the debugger, proxy, cookies, a broad `tabs` permission, remote scripts, `eval`, or downloads of executables. Extension pages cannot make network requests or run inline scripts.

## YouTube experiment

Limits are compiled into the extension. A website cannot raise them.

| What | Limit |
| --- | --- |
| Where it runs | Top frame, HTTPS, default port, three YouTube hosts |
| Pages | Home, `/watch`, and `/shorts/` plus an 11-character video ID |
| Player responses | Same-origin `/youtubei/v1/player` JSON, success, no redirect |
| Data edits | Only `adPlacements`, `playerAds`, and `adSlots` on a recognized OK player object |
| Volume | At most 200 edited responses per page; at most 128 top-level keys inspected |
| Skip button | Visible, enabled `button` outside a form, under an ad-showing player |
| Skip budget | Once per element, ≥2 seconds apart, ≤10 per minute, ≤100 per page |
| DOM scans | Coalesced at 250 ms; stop after 10,000 per page |
| Cosmetic CSS | Stop after 10 insertions |
| Give up | Player/video errors, 15-second unpaused stall, unsupported URL, leaving the page, or disable |

Original fetch arguments are forwarded once. AdAegis does not retry, spoof login or ad-completion events, or change stream URLs, signatures, DRM, or playability. Unknown shapes are left alone.

Network rules only block the eight listed ad-tech domains, plus exact-hostname allow exceptions. There are no redirect or header-rewrite rules.

## What this does not cover

- Page scripts share the page's JavaScript environment. A page can interfere with them.
- A Skip click runs the site's own click handler.
- Restoring hooks will not repair an already broken player. Turn the experiment off and reload.
- A compromised browser, another malicious extension, or edited unpacked files are out of scope.
- Broad page permission stays broad until you remove it. This is not a malware scanner.
- Checksums catch accidental corruption. They do not prove who published the ZIP.

## Reporting

Report vulnerabilities with [GitHub private vulnerability reporting](https://github.com/buntatoes/adaegis/security/advisories/new). Do not open a public issue, and do not include passwords or browsing data. Turn the affected feature off while it is investigated.
