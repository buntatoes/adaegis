# AdAegis

A lightweight, original Chrome/Chromium Manifest V3 ad and tracker blocker written in TypeScript.

## What is implemented

- Chrome's Manifest V3 `declarativeNetRequest` API
- A small, hand-authored starter ruleset for common ad-tech domains
- A popup switch that enables or pauses filtering
- Local-only state; no telemetry, account, or remote service
- TypeScript source and reproducible ESBuild output

This project is a clean implementation. It does **not** include uBlock Origin source code, assets, or copied filter lists.

## Development

Requires Node.js 20+.

```bash
npm install
npm run typecheck
npm run build
```

Then load the repository folder as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's root folder.

## Important MV3 limitation

Manifest V3 network filtering can block many third-party ad and tracker requests. It cannot reliably remove every first-party or server-inserted ad—especially YouTube ads—from Chrome. That is a platform constraint, not a promise this extension makes.

## Next steps

- Add an original, reviewed ruleset pipeline
- Add per-site allowlisting
- Add blocked-request counters
- Add content-script cosmetic filtering with opt-in site rules

## License

No license has been selected yet. Until one is added, the code is not licensed for reuse.
