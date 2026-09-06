const toggle = document.querySelector<HTMLInputElement>("#enabled");
const status = document.querySelector<HTMLElement>("#status");

if (!toggle || !status) {
  throw new Error("AdAegis popup UI could not be initialized.");
}

function render(enabled: boolean): void {
  toggle.checked = enabled;
  status.textContent = enabled ? "Protection is on" : "Protection is paused";
  status.classList.toggle("paused", !enabled);
}

chrome.runtime.sendMessage({ type: "get-state" }, (response: { enabled: boolean }) => {
  render(response.enabled);
});

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage(
    { type: "set-enabled", enabled: toggle.checked },
    (response: { ok: boolean; error?: string }) => {
      if (!response?.ok) {
        toggle.checked = !toggle.checked;
        status.textContent = response?.error ?? "Could not update protection.";
        status.classList.add("paused");
        return;
      }

      render(toggle.checked);
    }
  );
});
