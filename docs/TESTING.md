# Manual browser tests

Run these in Chrome or Chromium 120+ before tagging a release.

1. `npm run check` and `npm run package`. Load the ZIP in a fresh profile and check the service worker for errors.
2. Follow INSTALL.html with no extra tools. Confirm the install does not request page access.
3. Hit a domain covered by the bundled rules; pause and try again. Pause 10 minutes and 1 hour: the badge should show remaining time, and protection should return when the time is up. Indefinite pause should show OFF and stay off across a browser restart.
4. Enable page cleanup and deny the permission prompt: it must stay off. Grant access and check that recognized ads hide on the current page without a reload, and that forms, captions, and keyboard use still work.
5. With cleanup off, enable only YouTube filtering. The prompt should be YouTube-only, not Music. Open home, watch, and Shorts. Click from home to a video without a full reload; filtering should continue. Open search or a channel, then a video; the new video should still be filtered, including when the address has a trailing slash. Account pages must not keep those hooks.
6. Cause a player error or stall on one video, then click a different video without reloading. Filtering should start again for the new video. The same video should stay off until you reload or click something else.
7. Enable only YouTube Music filtering. The prompt should be `music.youtube.com` only. Play from Music home, a playlist, and watch. Account pages must not keep those hooks. www YouTube must stay untouched if Music is the only grant.
8. From a content-script context, global settings must be unreadable. A page-policy reply is only `ok` / `cosmetic` / `youtube` for that page.
9. Add an exact-host exception from the current-site switch and by typing a hostname. Confirm the list, remove an entry, and confirm only that host is excepted. Remove it; page features should return on that host's open tab. Reload if you need previously blocked ads to load again.
10. Toggle features and **Remove page access** on open pages. First enable should inject into matching tabs. If YouTube filtering was already running, turning it off and on should restore hooks without a reload. Confirm grants are actually gone, including Music.
11. On YouTube, turning the experiment off in the popup must restore hooks only after you turn it back on. Normal player controls must stay clickable. Skip must not fire on forms or links, or hammer a rotating button.
12. Try signed-in and signed-out YouTube, captions, fullscreen, in-page navigation, live, Music, and offline. Note the browser version and what you saw.
13. Toolbar counts are network actions, not ads removed. Restart the browser while paused: settings should stick and extra scripts should stay unregistered.
14. Site exceptions cannot be changed on `chrome://`, `file://`, or inactive tabs. Typed hostnames that are not exact hosts must be rejected.
15. Update by replacing files in the same folder, then reload. Settings should survive. After uninstall, nothing should remain except the folder you delete yourself.

Do not paste cookies, history, or raw player responses into issues.
