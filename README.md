<p align="center">
  <img src="icons/adaegis.png" width="128" height="128" alt="AdAegis">
</p>

# AdAegis

A small ad blocker for desktop Chrome and Chromium 120+. Network blocking is on by default. Page cleanup and YouTube filtering are optional and start off.

**0.3.0** is the first public release. It is loaded unpacked from GitHub, not listed on the Chrome Web Store.

[Install](#install) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [License](LICENSE)

## Install

Download **[adaegis-v0.3.0-chromium.zip](https://github.com/buntatoes/adaegis/releases/latest)** from [Releases](https://github.com/buntatoes/adaegis/releases). You do not need Node.js.

1. Extract the ZIP and keep the **AdAegis** folder somewhere permanent, such as Documents.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** and click **Load unpacked**.
4. Select the **AdAegis** folder that contains `manifest.json`.

Pin it from the extensions menu and open the popup. A longer walkthrough ships in the ZIP as [INSTALL.html](INSTALL.html).

Chrome loads the extension from that folder. Leave it where it is. To update, copy the new files into the same folder, click **Reload**, and refresh open sites. To uninstall, click **Remove** on the Extensions page, then delete the folder.

## Features

- Eight built-in rules for common ad-tech domains, on by default
- Pause switch and up to 200 exact-hostname exceptions
- Optional page cleanup that hides recognized ad containers
- Optional experimental YouTube player filtering
- Settings stay on your computer: no account, no telemetry, no remote filter list, no auto-update

Basic blocking does not need access to the pages you visit. Page cleanup asks for HTTP/HTTPS access. YouTube filtering asks only for YouTube.

## YouTube filtering

Off by default. If you enable it, Chrome will ask for YouTube access. After you reload YouTube, it tries to:

- Strip known ad fields from an eligible player response
- Click a visible Skip button during an ad

It only runs on YouTube home, watch, and Shorts. It will not catch every ad, and it can break playback. If that happens, turn it off and reload.

## Build from source

Development needs Node.js 22.18 or newer. The extension itself has no runtime npm packages.

```bash
npm run build      # compile TypeScript into dist/
npm run package    # test and write the ZIP under release/
```

```bash
npm install
npm run typecheck
```

Edit files under `src/`. Do not edit `dist/` by hand.

| Path | What it is |
| --- | --- |
| `src/` | TypeScript sources |
| `dist/` | Generated JavaScript the browser loads |
| `rules/core.json` | Bundled network rules |
| `icons/` | Logo and toolbar icons |
| `tests/` | Automated checks |
| `docs/TESTING.md` | Manual browser checklist |

## License

Copyright 2026 Buntos ([buntatoes](https://github.com/buntatoes)).

AdAegis is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution. No uBlock source, assets, or filter lists are included.
