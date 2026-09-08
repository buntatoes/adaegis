import { hostname, validHost, parseHost, ALL_SITES, YOUTUBE_SITES, MUSIC_SITES, type Settings } from "./settings.js";

async function main(): Promise<void> {
  const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
  const cosmetic = document.querySelector<HTMLInputElement>("#cosmetic")!;
  const youtube = document.querySelector<HTMLInputElement>("#youtube")!;
  const music = document.querySelector<HTMLInputElement>("#music")!;
  const site = document.querySelector<HTMLInputElement>("#site")!;
  const status = document.querySelector<HTMLElement>("#status")!;
  const hostLabel = document.querySelector<HTMLElement>("#host")!;
  const notice = document.querySelector<HTMLElement>("#notice")!;
  const revoke = document.querySelector<HTMLButtonElement>("#revoke")!;
  const pause10 = document.querySelector<HTMLButtonElement>("#pause10")!;
  const pause60 = document.querySelector<HTMLButtonElement>("#pause60")!;
  const exceptions = document.querySelector<HTMLElement>("#exceptions")!;
  const exceptionEmpty = document.querySelector<HTMLElement>("#exception-empty")!;
  const hostInput = document.querySelector<HTMLInputElement>("#host-input")!;
  const addHost = document.querySelector<HTMLButtonElement>("#add-host")!;
  const addForm = document.querySelector<HTMLFormElement>("#add-site")!;
  const controls = [enabled, cosmetic, youtube, music, site, hostInput];
  const buttons = [revoke, pause10, pause60, addHost];
  let tab: chrome.tabs.Tab | undefined;
  let state: Settings;
  let busy = false;
  const host = () => hostname(tab?.url);

  async function request(message: object): Promise<Settings> {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error ?? "Could not reach AdAegis.");
    return response.settings;
  }
  function renderExceptions(): void {
    exceptions.replaceChildren();
    exceptionEmpty.classList.toggle("hidden", state.allowlist.length > 0);
    for (const name of state.allowlist) {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.disabled = busy;
      remove.addEventListener("click", () => { void save({ type: "set-host", host: name, allowed: false }); });
      row.append(label, remove);
      exceptions.append(row);
    }
  }
  function render(): void {
    enabled.checked = state.enabled;
    cosmetic.checked = state.cosmetic;
    youtube.checked = state.youtubeExperimental;
    music.checked = state.youtubeMusicExperimental;
    const currentHost = host();
    site.checked = !!currentHost && state.allowlist.includes(currentHost);
    hostLabel.textContent = currentHost ?? "Unavailable on this page";
    if (!state.enabled && state.pauseUntil > Date.now()) {
      status.textContent = "Paused until " + new Date(state.pauseUntil).toLocaleTimeString([], {
        hour: "numeric", minute: "2-digit"
      });
    } else {
      status.textContent = !state.enabled ? "Protection paused" :
        site.checked ? "This site is excepted" : "Protection on";
    }
    for (const input of controls) input.disabled = busy;
    for (const button of buttons) button.disabled = busy;
    site.disabled = busy || !validHost(currentHost);
    renderExceptions();
  }
  async function save(message: object, permission?: Promise<boolean>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      if (permission && !(await permission)) throw new Error("Site access was declined. The feature stays off.");
      state = await request(message);
      notice.textContent = "Saved. Open tabs pick this up. Reload if a YouTube video is already playing, or if you need blocked ads to load again.";
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
  for (const [input, key, origins] of [
    [enabled, "enabled", undefined],
    [cosmetic, "cosmetic", ALL_SITES],
    [youtube, "youtubeExperimental", YOUTUBE_SITES],
    [music, "youtubeMusicExperimental", MUSIC_SITES]
  ] as const) {
    input.addEventListener("change", () => {
      if (busy) return;
      const value = input.checked;
      // Request in the click/change gesture, before awaiting any worker response.
      const permission = value && origins ? chrome.permissions.request({ origins: [...origins] }) : undefined;
      void save({ type: "set-option", key, value }, permission);
    });
  }
  site.addEventListener("change", () => {
    void save({ type: "set-site", tabId: tab?.id, allowed: site.checked });
  });
  pause10.addEventListener("click", () => { void save({ type: "set-pause", minutes: 10 }); });
  pause60.addEventListener("click", () => { void save({ type: "set-pause", minutes: 60 }); });
  addForm.addEventListener("submit", event => {
    event.preventDefault();
    if (busy) return;
    const name = parseHost(hostInput.value);
    if (!name) {
      notice.textContent = "Use an exact hostname, such as example.com.";
      return;
    }
    hostInput.value = "";
    void save({ type: "set-host", host: name, allowed: true });
  });
  revoke.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    render();
    try {
      state = await request({ type: "set-option", key: "cosmetic", value: false });
      state = await request({ type: "set-option", key: "youtubeExperimental", value: false });
      state = await request({ type: "set-option", key: "youtubeMusicExperimental", value: false });
      const granted = await chrome.permissions.getAll();
      const origins = (granted.origins ?? []).filter(origin => /^https?:/.test(origin));
      if (origins.length && !(await chrome.permissions.remove({ origins }))) throw new Error("Use browser extension settings to remove remaining access.");
      notice.textContent = "Page access removed. Network blocking stays available. Reload open pages.";
    } catch (error) { notice.textContent = error instanceof Error ? error.message : "Could not remove page access."; }
    finally { busy = false; render(); }
  });
}
void main();
