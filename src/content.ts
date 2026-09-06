(() => {
  // Deliberately conservative: no generic ".ad" or text-matching rules.
  const generic = [
    "ins.adsbygoogle",
    'iframe[src*="://googleads.g.doubleclick.net/"]',
    'iframe[src*="://tpc.googlesyndication.com/"]'
  ];
  const youtube = [
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-display-ad-renderer",
    "ytd-banner-promo-renderer",
    "ytd-action-companion-ad-renderer"
  ];
  const isYoutube = ["www.youtube.com", "m.youtube.com", "youtube.com"].includes(location.hostname);
  const style = document.createElement("style");
  style.dataset.adaegis = "cosmetic";
  style.textContent = [...generic, ...(isYoutube ? youtube : [])].join(",\n") +
    "{display:none!important}";
  let active = false;
  let revision = 0;
  let frame: number | undefined;
  const ensureStyle = () => {
    if (active && document.documentElement && !style.isConnected) document.documentElement.append(style);
  };
  const observer = new MutationObserver(() => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; ensureStyle(); });
  });
  function apply(raw: Record<string, unknown>): void {
    const excepted = Array.isArray(raw.allowlist) && raw.allowlist.includes(location.hostname);
    const protectedPage = raw.enabled !== false && !excepted;
    active = protectedPage && raw.cosmetic !== false;
    observer.disconnect();
    if (active) {
      ensureStyle();
      observer.observe(document, { childList: true, subtree: true });
    } else {
      style.remove();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    }
    if (isYoutube && (!protectedPage || raw.youtubeExperimental !== true)) {
      // This signal can only turn page hooks OFF, never enable privileged capabilities.
      window.dispatchEvent(new Event("adaegis:youtube-stop"));
    }
  }
  let settings: Record<string, unknown> = {};
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    revision++;
    for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
    apply(settings);
  });
  async function initialize(): Promise<void> {
    const atStart = revision;
    try {
      const saved = await chrome.storage.local.get(null);
      // A newer storage event wins over an in-flight initial read.
      settings = revision === atStart ? saved : { ...saved, ...settings };
      apply(settings);
    } catch {
      apply({ enabled: false });
    }
  }
  void initialize();
})();
