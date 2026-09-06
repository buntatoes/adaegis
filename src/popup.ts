import { hostname, validHost, ALL_SITES, YOUTUBE_SITES, type Settings } from "./settings.js";

async function main(): Promise<void> {
  const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
  const cosmetic = document.querySelector<HTMLInputElement>("#cosmetic")!;
  const youtube = document.querySelector<HTMLInputElement>("#youtube")!;
  const site = document.querySelector<HTMLInputElement>("#site")!;
  const status = document.querySelector<HTMLElement>("#status")!;
  const hostLabel = document.querySelector<HTMLElement>("#host")!;
  const notice = document.querySelector<HTMLElement>("#notice")!;
  const revoke = document.querySelector<HTMLButtonElement>("#revoke")!;
  const controls = [enabled, cosmetic, youtube, site];
  let tab: chrome.tabs.Tab | undefined;
  let state: Settings;
  let busy = false;
  const host = () => hostname(tab?.url);

  async function request(message: object): Promise<Settings> {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error ?? "Could not reach AdAegis.");
    return response.settings;
  }
  function render(): void {
    enabled.checked = state.enabled;
    cosmetic.checked = state.cosmetic;
    youtube.checked = state.youtubeExperimental;
    const currentHost = host();
    site.checked = !!currentHost && state.allowlist.includes(currentHost);
    hostLabel.textContent = currentHost ?? "Unavailable on this page";
    status.textContent = !state.enabled ? "Protection paused" :
      site.checked ? "This site is excepted" : "Protection on";
    for (const input of controls) input.disabled = busy;
    site.disabled = busy || !validHost(currentHost);
    revoke.disabled = busy;
  }
  async function save(message: object, permission?: Promise<boolean>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      if (permission && !(await permission)) throw new Error("Site access was declined. The feature stays off.");
      state = await request(message);
      notice.textContent = "Saved. Reload the page for network exceptions and YouTube startup changes.";
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "Could not save.";
    } finally { busy = false; render(); }
  }
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state = await request({ type: "get-state" });
    render();
  } catch (error) {
    status.textContent = "Unable to load settings";
    notice.textContent = String(error);
    return;
  }
  for (const [input, key] of [[enabled, "enabled"], [cosmetic, "cosmetic"], [youtube, "youtubeExperimental"]] as const) {
    input.addEventListener("change", () => {
      if (busy) return;
      const value = input.checked;
      // Request in the click/change gesture, before awaiting any worker response.
      const permission = value && key !== "enabled"
        ? chrome.permissions.request({ origins: key === "cosmetic" ? ALL_SITES : YOUTUBE_SITES }) : undefined;
      void save({ type: "set-option", key, value }, permission);
    });
  }
  site.addEventListener("change", () => {
    void save({ type: "set-site", tabId: tab?.id, allowed: site.checked });
  });
  revoke.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    render();
    try {
      state = await request({ type: "set-option", key: "cosmetic", value: false });
      state = await request({ type: "set-option", key: "youtubeExperimental", value: false });
      const granted = await chrome.permissions.getAll();
      const origins = (granted.origins ?? []).filter(origin => /^https?:/.test(origin));
      if (origins.length && !(await chrome.permissions.remove({ origins }))) throw new Error("Use browser extension settings to remove remaining access.");
      notice.textContent = "Page access removed. Network blocking stays available. Reload open pages.";
    } catch (error) { notice.textContent = error instanceof Error ? error.message : "Could not remove page access."; }
    finally { busy = false; render(); }
  });
}
void main();
