# Manual browser tests

Run these in Chrome or Chromium 120+ before tagging a release.

1. `npm run check` and `npm run package`. Load the ZIP in a fresh profile and check the service worker for errors.
2. Follow INSTALL.html with no extra tools. Confirm the install does not request page access.
3. Hit a domain covered by the bundled rules; pause and try again. Turn off other blockers while you do this.
4. Enable page cleanup and deny the permission prompt: it must stay off. Grant access and check that recognized ads hide on the current page without a reload, and that forms, captions, and keyboard use still work.
5. With cleanup off, enable only YouTube filtering. The prompt should be YouTube-only. Open home, watch, and Shorts. Click from home to a video without a full reload; filtering should continue. Open search or a channel, then a video; the new video should still be filtered, including when the address has a trailing slash. Account pages must not keep those hooks.
6. From a content-script context, global settings must be unreadable. A page-policy reply is only `ok` / `cosmetic` / `youtube` for that page.
7. Add an exact-host exception and confirm only that host is excepted. Remove it; page features should return on that host's open tab. Reload if you need previously blocked ads to load again.
8. Toggle features and **Remove page access** on open pages. First enable should inject into matching tabs. If YouTube filtering was already running, turning it off and on should restore hooks without a reload. Confirm grants are actually gone.
9. On YouTube, a playback error or stall must stay off until reload, including after in-page navigation. Turning the experiment off and on again must restore hooks. Normal player controls must stay clickable. Skip must not fire on forms or links, or hammer a rotating button.
10. Try signed-in and signed-out YouTube, captions, fullscreen, in-page navigation, live, and offline. Note the browser version and what you saw.
11. Toolbar counts are network actions, not ads removed. Restart the browser while paused: settings should stick and extra scripts should stay unregistered.
12. Site exceptions cannot be changed on `chrome://`, `file://`, or inactive tabs.
13. Update by replacing files in the same folder, then reload. Settings should survive. After uninstall, nothing should remain except the folder you delete yourself.

Do not paste cookies, history, or raw player responses into issues.
