(() => {
  // Hard-coded policy. No page message, remote list, or popup setting can widen it.
  const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"];
  const SKIP = ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button, .ytp-skip-ad-button button, .ytp-ad-skip-button-slot button, .ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container button, .ytmusic-skip-ad-button";
  const allowedHost = () => location.protocol === "https:" && !location.port && HOSTS.includes(location.hostname);
  const pagePath = () => location.pathname.replace(/\/$/, "") || "/";
  const sensitivePage = () =>
    /^\/(account|signin|login|logout|paid_memberships|premium|purchase|reporthistory|embed)(\/|$)/.test(location.pathname);
  const allowHooks = () => allowedHost() && !sensitivePage();
  const allowInspect = () => {
    if (!allowHooks()) return false;
    if (location.hostname === "music.youtube.com") return true;
    const path = pagePath();
    return path === "/" || path === "/watch" || /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(path);
  };
  const playerPath = (path: string) => {
    const normalized = path.replace(/\/$/, "") || "/";
    return normalized === "/youtubei/v1/player" ||
      normalized === "/youtubei/v1/get_watch" ||
      normalized === "/youtubei/v1/player/ad_break" ||
      normalized === "/youtubei/v1/next" ||
      normalized === "/youtubei/v1/reel/reel_item_watch" ||
      normalized === "/youtubei/v1/reel/reel_watch_sequence";
  };
  const jsonContent = (type: string | null) => {
    const kind = type?.split(";")[0].trim().toLowerCase() ?? "";
    return !kind || kind === "application/json" || kind === "text/plain";
  };
  const videoId = () => {
    const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})$/.exec(pagePath());
    if (shorts) return shorts[1];
    const value = new URLSearchParams(location.search).get("v");
    return value && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : "";
  };
  const pageKey = () => videoId() || (allowHooks() ? pagePath() : "");
  if (window.top !== window || !allowedHost()) return;
  const LIMITS = Object.freeze({
    edits: 200, scans: 10000, clicks: 100, clicksPerMinute: 10,
    clickCooldownMs: 2000, scanDelayMs: 250, stallMs: 15000, maxTopLevelKeys: 256
  });
  const TERMINAL = new Set([
    "playback-error", "playback-stalled", "player-error", "scan-limit", "initialization-error"
  ]);
  const loaded = "__adaegisYoutubeLoaded";
  const page = window as unknown as Record<string, unknown>;
  if (page[loaded]) return;
  page[loaded] = true;
  let installed = false;
  let observing = false;
  let wanted = true;
  let terminal = false;
  let pending: number | undefined;
  let stallTimer: number | undefined;
  let edits = 0, scans = 0, clickCount = 0;
  let lastClick = -Infinity;
  let recentClicks: number[] = [];
  let seenKey = "";
  const clicked = new WeakSet<Element>();
  const restore: Array<() => void> = [];

  function dataProperty(value: unknown, key: string): unknown {
    if (!value || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  }
  function dropConfig(descriptors: PropertyDescriptorMap): boolean {
    const config = descriptors.playerConfig;
    if (!config?.configurable || !("value" in config) || !config.value || typeof config.value !== "object") return false;
    if (Object.getPrototypeOf(config.value) !== Object.prototype) return false;
    const nested = Object.getOwnPropertyDescriptors(config.value);
    if (Object.values(nested).some(item => !("value" in item)) || !nested.ssapConfig?.configurable) return false;
    delete nested.ssapConfig;
    descriptors.playerConfig = { ...config, value: Object.create(Object.prototype, nested) };
    return true;
  }
  function dropAds(descriptors: PropertyDescriptorMap): boolean {
    let changed = dropConfig(descriptors);
    for (const key of ["adPlacements", "playerAds", "adSlots"]) {
      const descriptor = descriptors[key];
      if (descriptor?.configurable && Array.isArray(descriptor.value)) {
        delete descriptors[key];
        changed = true;
      }
    }
    const heartbeat = descriptors.adBreakHeartbeatParams;
    if (heartbeat?.configurable && "value" in heartbeat && heartbeat.value !== undefined) {
      delete descriptors.adBreakHeartbeatParams;
      changed = true;
    }
    return changed;
  }
  function isPlayer(descriptors: PropertyDescriptorMap): boolean {
    const id = dataProperty(descriptors.videoDetails?.value, "videoId");
    const status = dataProperty(descriptors.playabilityStatus?.value, "status");
    return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id) && status === "OK";
  }
  function otherPlayer(descriptors: PropertyDescriptorMap): boolean {
    const id = dataProperty(descriptors.videoDetails?.value, "videoId");
    return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id) && !isPlayer(descriptors);
  }
  function hasAdKeys(descriptors: PropertyDescriptorMap): boolean {
    return ["adPlacements", "playerAds", "adSlots"].some(key => {
      const descriptor = descriptors[key];
      return !!descriptor?.configurable && Array.isArray(descriptor.value);
    }) || (descriptors.adBreakHeartbeatParams?.configurable === true &&
      "value" in descriptors.adBreakHeartbeatParams &&
      descriptors.adBreakHeartbeatParams.value !== undefined);
  }
  function clean(value: unknown, depth = 0): unknown {
    if (!installed || !wanted || edits >= LIMITS.edits || !value || typeof value !== "object") return value;
    try {
      if (Object.getPrototypeOf(value) !== Object.prototype) return value;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.keys(descriptors).length > LIMITS.maxTopLevelKeys ||
          Object.values(descriptors).some(item => !("value" in item))) return value;
      if (otherPlayer(descriptors)) return value;
      if (isPlayer(descriptors) || hasAdKeys(descriptors)) {
        if (!dropAds(descriptors)) return value;
        edits++;
        // A shallow copy changes only known ad fields. Auth, playback status,
        // video URLs, signatures, DRM, and every other property retain their values.
        return Object.create(Object.prototype, descriptors);
      }
      const nested = descriptors.playerResponse;
      if (depth > 0 || !nested?.configurable || !("value" in nested)) return value;
      const cleaned = clean(nested.value, depth + 1);
      if (cleaned === nested.value) return value;
      return Object.create(Object.prototype, { ...descriptors, playerResponse: { ...nested, value: cleaned } });
    } catch { return value; } // Accessors, proxies, or unfamiliar structures fail unchanged.
  }
  function setObserving(on: boolean): void {
    if (on) {
      if (observing) return;
      observing = true;
      observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled", "aria-disabled"] });
      inspect();
      return;
    }
    if (!observing) return;
    observing = false;
    observer.disconnect();
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
  }
  function stop(reason = "disabled"): void {
    if (!installed) return;
    installed = false;
    setObserving(false);
    if (stallTimer !== undefined) clearTimeout(stallTimer);
    stallTimer = undefined;
    window.removeEventListener("pagehide", onStop);
    document.removeEventListener("error", onError, true);
    document.removeEventListener("waiting", onWaiting, true);
    document.removeEventListener("playing", onPlaying, true);
    while (restore.length) {
      const undo = restore.pop();
      try { undo?.(); } catch { /* Page owns its context. */ }
    }
    if (TERMINAL.has(reason)) terminal = true;
    if (document.documentElement) document.documentElement.dataset.adaegisYoutube = reason;
  }
  function recover(): void {
    terminal = false;
    edits = 0;
    scans = 0;
    clickCount = 0;
    lastClick = -Infinity;
    recentClicks = [];
  }
  function rememberPage(): void {
    const key = pageKey();
    if (!wanted || !key) return;
    if (seenKey && key !== seenKey) recover();
    seenKey = key;
  }
  function playerUrl(value: string): URL | null {
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || !playerPath(url.pathname)) return null;
      return url;
    } catch { return null; }
  }
  function attachCleaner(response: Response): void {
    const originalText = response.text.bind(response);
    const originalClone = response.clone.bind(response);
    let parsed: Promise<unknown> | undefined;
    const body = () => {
      parsed ??= originalText().then(raw => {
        try { return clean(JSON.parse(raw)); }
        catch { return raw; }
      });
      return parsed;
    };
    const asText = async () => {
      const value = await body();
      return typeof value === "string" ? value : JSON.stringify(value);
    };
    response.json = async () => {
      const value = await body();
      return typeof value === "string" ? JSON.parse(value) : value;
    };
    response.text = asText;
    response.clone = () => {
      const copy = originalClone();
      attachCleaner(copy);
      return copy;
    };
    if (typeof TextEncoder === "function") {
      const encoder = new TextEncoder();
      response.arrayBuffer = async () => encoder.encode(await asText()).buffer;
    }
    if (typeof Blob === "function") {
      response.blob = async () => new Blob([await asText()], { type: "application/json" });
    }
  }
  function start(): void {
    if (terminal || !wanted || !allowHooks()) return;
    if (!installed) {
      installed = true;
      if (document.documentElement) delete document.documentElement.dataset.adaegisYoutube;
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
            const installedHook = Object.getOwnPropertyDescriptor(window, key);
            if (installedHook?.get !== getter || installedHook.set !== setter) return;
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
          if (!installed || !wanted) return response;
          try {
            const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
            if (url.origin !== location.origin || !playerPath(url.pathname) ||
                response.redirected || (response.url && new URL(response.url).origin !== location.origin) ||
                !response.ok || !jsonContent(response.headers.get("content-type"))) return response;
            attachCleaner(response);
          } catch { /* Preserve unexpected response formats. */ }
          return response;
        };
        window.fetch = wrappedFetch;
        restore.push(() => { if (window.fetch === wrappedFetch) window.fetch = originalFetch; });
        const originalParse = JSON.parse;
        const wrappedParse: typeof JSON.parse = (text, reviver) => {
          const parsed = originalParse(text, reviver);
          return installed && wanted ? clean(parsed) : parsed;
        };
        JSON.parse = wrappedParse;
        restore.push(() => { if (JSON.parse === wrappedParse) JSON.parse = originalParse; });
        const XHR = window.XMLHttpRequest;
        if (typeof XHR === "function") {
          const proto = XHR.prototype;
          const originalOpen = proto.open;
          const originalSend = proto.send;
          const targets = new WeakMap<XMLHttpRequest, URL>();
          const wrappedOpen = function(this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
            const target = playerUrl(String(url));
            if (target) targets.set(this, target); else targets.delete(this);
            return originalOpen.apply(this, arguments as unknown as Parameters<XMLHttpRequest["open"]>);
          };
          const wrappedSend: typeof proto.send = function(this: XMLHttpRequest, body) {
            if (targets.has(this)) {
              this.addEventListener("readystatechange", () => {
                if (!installed || !wanted || this.readyState !== 4 || this.status < 200 || this.status >= 300) return;
                const kind = this.responseType;
                if (kind === "arraybuffer" || kind === "blob" || kind === "document") return;
                if (!jsonContent(this.getResponseHeader("content-type"))) return;
                try {
                  const raw = this.responseType === "json" ? this.response : originalParse(this.responseText);
                  const cleaned = clean(raw);
                  if (cleaned === raw) return;
                  const text = JSON.stringify(cleaned);
                  Object.defineProperty(this, "responseText", { configurable: true, value: text });
                  Object.defineProperty(this, "response", {
                    configurable: true, value: this.responseType === "json" ? cleaned : text
                  });
                } catch { /* Preserve unexpected response formats. */ }
              });
            }
            return originalSend.call(this, body);
          };
          proto.open = wrappedOpen as typeof proto.open;
          proto.send = wrappedSend;
          restore.push(() => {
            if (proto.open === wrappedOpen) proto.open = originalOpen;
            if (proto.send === wrappedSend) proto.send = originalSend;
          });
        }
        window.addEventListener("pagehide", onStop);
        document.addEventListener("error", onError, true);
        document.addEventListener("waiting", onWaiting, true);
        document.addEventListener("playing", onPlaying, true);
      } catch { stop("initialization-error"); return; }
    }
    setObserving(allowInspect());
  }
  function sync(): void {
    rememberPage();
    if (terminal) return;
    if (wanted && allowHooks()) start();
    else if (installed) stop(wanted ? "unsupported-page" : "disabled");
  }
  const onStop = () => stop();
  const inPlayer = (target: EventTarget | null): target is HTMLVideoElement =>
    target instanceof HTMLVideoElement &&
      !!(target.closest("#movie_player") || target.closest("ytmusic-player"));
  const adPlayer = (player: Element | null): boolean => {
    const list = player?.classList;
    return !!list && (list.contains("ad-showing") || list.contains("ad-interrupting"));
  };
  const playerFromVideo = (video: HTMLVideoElement): Element | null =>
    video.closest("#movie_player") || video.closest("ytmusic-player");
  const onError = (event: Event) => {
    if (!inPlayer(event.target)) return;
    if (adPlayer(playerFromVideo(event.target))) return;
    stop("playback-error");
  };
  const onWaiting = (event: Event) => {
    if (!inPlayer(event.target) || stallTimer !== undefined) return;
    if (adPlayer(playerFromVideo(event.target))) return;
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
  function skipNodes(player: Element): Element[] {
    const roots: Array<ParentNode> = [player];
    const shadow = (player as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (shadow) roots.push(shadow);
    const found: Element[] = [];
    for (const root of roots) {
      if (typeof (root as Element).querySelectorAll === "function") {
        found.push(...[...(root as Element).querySelectorAll(SKIP)]);
      }
    }
    if (found.length) return found;
    const one = typeof player.querySelector === "function" ? player.querySelector(SKIP) : null;
    return one ? [one] : [];
  }
  function skipButton(node: Element): HTMLButtonElement | null {
    const button = node instanceof HTMLButtonElement ? node :
      (typeof node.querySelector === "function" ? node.querySelector("button") : null);
    if (!(button instanceof HTMLButtonElement) || button.form || !button.isConnected || clicked.has(button) ||
        !button.getClientRects().length || button.matches(":disabled, [aria-disabled='true']")) return null;
    const css = getComputedStyle(button);
    if (css.visibility !== "visible" || css.display === "none" || css.opacity === "0" || css.pointerEvents === "none") return null;
    return button;
  }
  function withinBudget(now: number): boolean {
    recentClicks = recentClicks.filter(at => now - at < 60000);
    return now - lastClick >= LIMITS.clickCooldownMs && recentClicks.length < LIMITS.clicksPerMinute &&
      clickCount < LIMITS.clicks;
  }
  function takeClick(now: number): void {
    lastClick = now;
    recentClicks.push(now);
    clickCount++;
  }
  function skipVideo(player: Element): boolean {
    const node = typeof player.querySelector === "function" ? player.querySelector("video") : null;
    if (!(node instanceof HTMLVideoElement)) return false;
    try {
      if (node.duration === Infinity) {
        if (node.playbackRate < 16) node.playbackRate = 16;
        node.muted = true;
        return true;
      }
      if (!Number.isFinite(node.duration) || node.duration <= 0) return false;
      if (node.currentTime >= node.duration - 0.15) return false;
      node.currentTime = node.duration;
      return true;
    } catch { return false; }
  }
  function inspect(): void {
    pending = undefined;
    if (!installed || !wanted) return;
    if (!allowInspect()) {
      if (!allowHooks()) stop("unsupported-page");
      else setObserving(false);
      return;
    }
    if (++scans > LIMITS.scans) { stop("scan-limit"); return; }
    const player = document.querySelector("#movie_player") ?? document.querySelector("ytmusic-player");
    if (!player) return;
    const errorPanel = player.querySelector<HTMLElement>(".ytp-error");
    if (errorPanel?.getClientRects().length && getComputedStyle(errorPanel).visibility !== "hidden") {
      stop("player-error"); return;
    }
    if (!adPlayer(player)) return;
    const now = Date.now();
    if (!withinBudget(now)) return;
    for (const node of skipNodes(player)) {
      const button = skipButton(node);
      if (!button) continue;
      clicked.add(button);
      takeClick(now);
      button.click();
      return;
    }
    if (skipVideo(player)) {
      takeClick(now);
      return;
    }
    const skipAd = (player as { skipAd?: unknown }).skipAd;
    if (typeof skipAd === "function") {
      takeClick(now);
      skipAd.call(player);
    }
  }
  const observer = new MutationObserver(() => {
    if (observing && pending === undefined) pending = window.setTimeout(inspect, LIMITS.scanDelayMs);
  });
  window.addEventListener("adaegis:youtube-stop", () => { wanted = false; stop(); });
  window.addEventListener("adaegis:youtube-start", () => { wanted = true; start(); });
  for (const name of ["yt-navigate-finish", "yt-navigate-start", "yt-page-data-updated"]) {
    document.addEventListener(name, sync);
    window.addEventListener(name, sync);
  }
  window.addEventListener("popstate", sync);
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  if (navigation && typeof navigation.addEventListener === "function") {
    navigation.addEventListener("navigatesuccess", sync);
  }
  rememberPage();
  start();
})();
