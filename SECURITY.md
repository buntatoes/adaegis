# Security and website-interaction policy

## Status

AdAegis 0.3.0 is a hardened **testing build**, not a security-certified release.
Full tsc checking and real Chrome/Chromium tests are still pending because
dependency access and a browser binary were unavailable in the implementation
environment. Do not represent this build as audited or guaranteed safe.

## Privilege boundaries

- Basic network blocking has no required HTTP/HTTPS page access. Page cleanup and
  YouTube filtering are disabled by default and request optional site permissions
  through an explicit popup interaction.
- Full page cleanup requests HTTP/HTTPS access. YouTube-only mode requests only
  youtube.com, www.youtube.com and m.youtube.com over HTTPS.
- Local settings storage is restricted to TRUSTED_CONTEXTS. Page scripts receive
  only their own two effective booleans, not the global hostname-exception list.
- Settings changes require a message from this extension's exact packaged popup,
  with no tab sender, exact keys, validated primitive values and a known action.
  Content-script read requests require an authenticated top-frame sender and use
  Chrome-provided sender metadata, never a page-supplied URL.
- No externally_connectable, web-accessible resources, native messaging, debugger,
  proxy, cookies, broad tabs permission, remote scripts, eval, or executable downloads.
- Extension-page CSP prohibits outgoing network connections, inline scripts,
  remote scripts, embedded objects, forms and frames. Display uses textContent.
- Removing page permissions disables both optional features and unregisters their
  scripts. A refresh message contains no private data.

## Hard-coded website limits

These limits are compiled into the bundled code. The popup and website cannot
configure wider targets, new fields, selectors, scripts, or budgets.

| Operation | Enforced limit |
| --- | --- |
| Experimental context | Top frame, HTTPS default port, three exact YouTube hostnames |
| Experimental pages | Home, /watch, and /shorts/ followed by an 11-character video ID |
| Eligible fetch response | Same-origin /youtubei/v1/player, successful JSON, no redirect |
| Permitted local data edits | Only adPlacements, playerAds, adSlots arrays on a recognizable plain-object player response with status OK |
| Metadata budget | At most 200 changed responses per document; at most 128 top-level keys examined per eligible response |
| Skip control | Connected, visible, enabled HTML button of type button, outside any form, under the ad-showing player, with an exact known Skip selector |
| Click budget | Once per element, at least 2 seconds apart, at most 10 per minute and 100 per document |
| DOM scan budget | Coalesced at 250 ms; stops after 10,000 scans per document |
| CSS reinsertion | Stops after 10 insertions; does not repeatedly fight page removal |
| Failure behavior | Stop hooks on player/video errors, 15-second unpaused stalls, unsupported navigation, page exit, or disable signal |

Request URLs, query parameters, methods, headers, credentials and bodies are
forwarded to the original fetch exactly once with the original arguments.
AdAegis does not generate retries or extra requests. It does not falsify
client identities, login/subscription status, tracking or ad-completion events.
It does not change stream URLs, signature parameters, DRM/license data or
playability status. The only player data modification is a shallow copy omitting
the three allowed ad fields. Unfamiliar shapes, accessors and non-OK states pass through.

Normal DNR rules have only block actions for the eight explicitly listed ad-tech
domains and exact-hostname allowAllRequests exceptions. There are no redirect,
request-header mutation, or parameter-rewriting rules.

## Residual risks and recovery

- MAIN-world code shares the website's environment. A page can interfere with
  it or its DOM; selectors are not an authenticity guarantee. It has no privileged
  extension API bridge. Bounds reduce accidental or page-induced repeated actions.
- An automatic Skip click can invoke the website's own handlers. It cannot be
  guaranteed to have no side effects on a page that has already been compromised.
- A broken player cannot be reconstructed by merely restoring hooks. Disable the
  experiment and reload. If necessary, except the site and reload.
- A compromised browser, malicious extension, local OS compromise, tampered
  download, or edited unpacked files is outside these code-level protections.
  Hard-coded limits cannot prevent an owner from modifying their own source.
- The optional broad page permission remains broad once granted; users can remove
  it from the popup or browser settings. This extension is not a malware scanner.
- Checksums detect accidental corruption and can confirm a known hash. A checksum
  bundled with a malicious replacement does not authenticate its publisher.

## Installation integrity

The package builder uses an explicit file inventory, rejects symbolic links and
oversized entries, uses fixed safe archive paths, and adds per-file SHA-256 hashes.
It excludes source/test tools, dependencies, environment files and credentials.
There is no admin installer, policy/registry modification, browser-security flag,
certificate installation, proxy configuration or automatic updater.
The unpacked folder must remain in place; install only downloads you trust.

## Reporting

Report suspected vulnerabilities privately to the repository owner through a
trusted existing contact. Do not post credentials or private browsing data in a
public issue. Disable the affected feature while a report is investigated.
