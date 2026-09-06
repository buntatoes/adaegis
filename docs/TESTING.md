# Manual release checks

These checks are pending. Automated fixture tests cannot substitute for Chrome's
actual DNR validation or YouTube's changing production player.

1. Install dev dependencies and run npm run check. Load the root unpacked in
   Chrome/Chromium 120+ and inspect extension/worker errors.
2. With protection on, confirm a request matching a bundled rule is blocked.
   Pause and retry the same request: it should no longer be blocked by AdAegis.
   Turn off other blockers while isolating results.
3. Check that toolbar counts represent network actions and OFF appears while paused.
4. Add a current-host exception, reload, and verify ads/subframe requests are
   allowed. Verify an unrelated hostname and a subdomain are not also excepted.
   Remove the exception and reload; blocking should return.
5. Check an AdSense container and a dynamically added YouTube promoted card.
   Turn cosmetic filtering off/on and verify the original page returns without
   losing normal content, player controls, keyboard navigation, or captions.
6. With the YouTube experiment OFF, reload and verify no youtube-experiment
   MAIN-world script is registered in chrome.scripting.getRegisteredContentScripts().
7. Enable the experiment and reload YouTube. Exercise home-to-watch SPA navigation,
   several videos, Shorts, live streams, fullscreen, captions, logged-in/out playback,
   and regional/account variations. Record browser version and observed behavior;
   do not log account data or raw player responses.
8. Confirm only visible available Skip controls are clicked. Look for false
   skips and playback regressions, not just apparent ad removal.
9. Trigger a playback error/stall; verify installed hooks stop and backoff state
   appears in document.documentElement.dataset.adaegisYoutube. Disable/reload to
   recover; stopping hooks alone cannot rebuild the player.
10. While a YouTube tab is open, globally pause or except that host: hooks should
    stop. Reload after changing options. Re-enabling requires a fresh page load.
11. Restart Chrome and reload/update the extension: switches and hostname
    exceptions should persist, including paused and experimental-off states.
12. On a restricted chrome:// or file:// tab, the site control should be disabled.
    Rapidly toggle settings; UI must not claim success when a write fails.
