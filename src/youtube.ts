(() => {
  // Hard-coded policy. No page message, remote list, or popup setting can widen it.
  const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
  const allowedPage = () => location.protocol === "https:" && !location.port &&
    HOSTS.includes(location.hostname) &&
    (location.pathname === "/" || location.pathname === "/watch" ||
      /^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(location.pathname));
  if (window.top !== window || !allowedPage()) return;
  const LIMITS = Object.freeze({
    edits: 200, scans: 10000, clicks: 100, clicksPerMinute: 10,
    clickCooldownMs: 2000, scanDelayMs: 250, stallMs: 15000, maxTopLevelKeys: 128
  });
  const marker = "__adaegisYoutubeActive";
  const page = window as unknown as Record<string, unknown>;
  if (page[marker]) return;
  page[marker] = true;
  let active = true;
  let pending: number | undefined;
  let stallTimer: number | undefined;
  let edits = 0, scans = 0, clickCount = 0;
  let lastClick = -Infinity;
  let recentClicks: number[] = [];
  const clicked = new WeakSet<Element>();
  const restore: Array<() => void> = [];

  function dataProperty(value: unknown, key: string): unknown {
    if (!value || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  }
  function clean(value: unknown): unknown {
    if (!active || !allowedPage() || edits >= LIMITS.edits || !value || typeof value !== "object") return value;
    try {
      if (Object.getPrototypeOf(value) !== Object.prototype) return value;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.keys(descriptors).length > LIMITS.maxTopLevelKeys ||
          Object.values(descriptors).some(item => !("value" in item))) return value;
      const videoId = dataProperty(descriptors.videoDetails?.value, "videoId");
      const status = dataProperty(descriptors.playabilityStatus?.value, "status");
      if (typeof videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || status !== "OK") return value;
      let changed = false;
      for (const key of ["adPlacements", "playerAds", "adSlots"]) {
        const descriptor = descriptors[key];
        if (descriptor?.configurable && Array.isArray(descriptor.value)) {
          delete descriptors[key];
          changed = true;
        }
      }
      if (!changed) return value;
      edits++;
      // A shallow copy changes only the three ad fields. Auth, playback status,
      // video URLs, signatures, DRM, and every other property retain their values.
      return Object.create(Object.prototype, descriptors);
    } catch { return value; } // Accessors, proxies, or unfamiliar structures fail unchanged.
  }
  function stop(reason = "disabled"): void {
    if (!active) return;
    active = false;
    observer.disconnect();
    if (pending !== undefined) clearTimeout(pending);
    if (stallTimer !== undefined) clearTimeout(stallTimer);
    window.removeEventListener("adaegis:youtube-stop", onStop);
    window.removeEventListener("pagehide", onStop);
    document.removeEventListener("error", onError, true);
    document.removeEventListener("waiting", onWaiting, true);
    document.removeEventListener("playing", onPlaying, true);
    for (const undo of restore.reverse()) { try { undo(); } catch { /* Page owns its context. */ } }
    page[marker] = false;
    if (document.documentElement) document.documentElement.dataset.adaegisYoutube = reason;
  }
  const onStop = () => stop();
  const inPlayer = (target: EventTarget | null): target is HTMLVideoElement =>
    target instanceof HTMLVideoElement && !!target.closest("#movie_player");
  const onError = (event: Event) => { if (inPlayer(event.target)) stop("playback-error"); };
  const onWaiting = (event: Event) => {
    if (!inPlayer(event.target) || stallTimer !== undefined) return;
    const video = event.target;
    stallTimer = window.setTimeout(() => {
      stallTimer = undefined;
      if (!video.paused && video.readyState < 3) stop("playback-stalled");
    }, LIMITS.stallMs);
  };
  const onPlaying = (event: Event) => {
    if (!inPlayer(event.target)) return;
    if (stallTimer !== undefined) clearTimeout(stallTimer);
    stallTimer = undefined;
  };
  function inspect(): void {
    pending = undefined;
    if (!active) return;
    if (!allowedPage()) { stop("unsupported-page"); return; }
    if (++scans > LIMITS.scans) { stop("scan-limit"); return; }
    const player = document.querySelector("#movie_player");
    if (!player) return;
    const errorPanel = player.querySelector<HTMLElement>(".ytp-error");
    if (errorPanel?.getClientRects().length && getComputedStyle(errorPanel).visibility !== "hidden") {
      stop("player-error"); return;
    }
    if (!player.classList.contains("ad-showing") && !player.classList.contains("ad-interrupting")) return;
    const button = player.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern");
    if (!(button instanceof HTMLButtonElement) || button.type !== "button" || button.form ||
        !button.isConnected || clicked.has(button) || !button.getClientRects().length ||
        button.matches(":disabled, [aria-disabled='true']")) return;
    const css = getComputedStyle(button);
    if (css.visibility !== "visible" || css.display === "none" || css.opacity === "0" || css.pointerEvents === "none") return;
    const now = Date.now();
    recentClicks = recentClicks.filter(at => now - at < 60000);
    if (now - lastClick < LIMITS.clickCooldownMs || recentClicks.length >= LIMITS.clicksPerMinute ||
        clickCount >= LIMITS.clicks) return;
    clicked.add(button);
    lastClick = now;
    recentClicks.push(now);
    clickCount++;
    button.click();
  }
  const observer = new MutationObserver(() => {
    if (active && pending === undefined) pending = window.setTimeout(inspect, LIMITS.scanDelayMs);
  });
  try {
    const key = "ytInitialPlayerResponse";
    const original = Object.getOwnPropertyDescriptor(window, key);
    if (!original || (original.configurable && "value" in original && original.writable)) {
      let value = clean(original?.value);
      const getter = () => value;
      const setter = (next: unknown) => { value = clean(next); };
      Object.defineProperty(window, key, {
        configurable: true, enumerable: original?.enumerable ?? true, get: getter, set: setter
      });
      restore.push(() => {
        const installed = Object.getOwnPropertyDescriptor(window, key);
        if (installed?.get !== getter || installed.set !== setter) return;
        if (original) Object.defineProperty(window, key, { ...original, value });
        else {
          delete page[key];
          if (value !== undefined) Object.defineProperty(window, key, {
            configurable: true, enumerable: true, writable: true, value
          });
        }
      });
    }
    const originalFetch = window.fetch;
    const wrappedFetch: typeof fetch = async function(this: Window, input, init) {
      // Exactly one original call. Never rewrite URLs, query parameters, methods,
      // request bodies, credentials, or headers; never retry or issue extra requests.
      const response = await originalFetch.call(this, input, init);
      if (!active || !allowedPage()) return response;
      try {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
        if (url.origin !== location.origin || url.pathname !== "/youtubei/v1/player" ||
            response.redirected || (response.url && new URL(response.url).origin !== location.origin) ||
            !response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return response;
        const json = response.json.bind(response);
        response.json = async () => clean(await json());
      } catch { /* Preserve unexpected response formats. */ }
      return response;
    };
    window.fetch = wrappedFetch;
    restore.push(() => { if (window.fetch === wrappedFetch) window.fetch = originalFetch; });
    window.addEventListener("adaegis:youtube-stop", onStop);
    window.addEventListener("pagehide", onStop);
    document.addEventListener("error", onError, true);
    document.addEventListener("waiting", onWaiting, true);
    document.addEventListener("playing", onPlaying, true);
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled", "aria-disabled"] });
    inspect();
  } catch { stop("initialization-error"); }
})();
