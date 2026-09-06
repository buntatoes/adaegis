# Manual checks before general distribution

These checks are pending. Automated tests use mocked Chrome APIs and synthetic
page fixtures; they do not validate Chrome's actual permission prompts, DNR
engine, registration lifecycle, or YouTube's production behavior.

1. Install the pinned development dependencies and run npm run check. Run
   npm run package; confirm a clean ZIP loads in desktop Chrome/Chromium 120+.
   Inspect extension and service-worker errors.
2. Follow INSTALL.html from a fresh browser profile without Node or admin rights.
   Confirm there is no required page-host access at installation.
3. Check that a request matching a bundled rule is blocked; pause and repeat it.
   Turn off other blockers when isolating this behavior.
4. Enable page cleanup and decline its permission prompt: the feature must stay
   off. Enable again and grant access, reload, and confirm recognized ads hide.
   Check normal content, form controls, captions and keyboard navigation.
5. With page cleanup off, enable only the YouTube experiment. Verify the prompt
   is limited to the three YouTube hosts and no general page cleanup script is
   registered. Reload and test supported routes.
6. Inspect local storage access from a content-script context: global preferences
   must be inaccessible. A page-policy reply contains only ok/cosmetic/youtube
   booleans for that page, never hostnames or the global allowlist.
7. Add an exact-host exception, reload, and verify that this extension allows
   its page/frame requests. An unrelated host or subdomain must not be excepted.
   Remove the exception and reload; blocking should return.
8. Test optional-feature switches, global pause and permission revocation while
   pages are open. Styles/hooks should stop. Newly enabled scripts require reload.
   Use Remove page access and verify grants are actually removed.
9. Check error backoff and disable/reload recovery on YouTube. Verify that normal
   player controls are not hidden, form/anchor elements cannot be auto-clicked,
   and rapid rotating Skip controls do not produce repeated clicks.
10. Test logged-in/out YouTube home/watch/Shorts playback, captions, fullscreen,
    SPA navigation, live streams, network loss and browser back/forward cache.
    Do not claim success across account/regional variations without testing them.
11. Verify toolbar count behavior; counts are network actions, not removed ads.
    Restart the browser and reload/update the extension while paused: settings
    and exceptions should persist and unauthorized scripts should stay absent.
12. Confirm site exceptions cannot be changed for chrome://, file:// or inactive
    tabs. Test denied storage/DNR API calls and rapid settings changes.
13. Update by replacing files in the same installed folder, then reload. Confirm
    the extension identity/settings stay intact. Remove the extension and verify
    no registry, proxy, policy, certificate or updater components remain.

Record browser version, OS, test cases and observed results before publishing
release claims. Do not log credentials, browsing history or raw player responses.
