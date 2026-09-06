const toggle = document.querySelector("#enabled");
const status = document.querySelector("#status");
if (!toggle || !status) throw new Error("AdAegis popup UI could not be initialized.");
function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "Protection is on" : "Protection is paused";
  status.classList.toggle("paused", !enabled);
}
chrome.runtime.sendMessage({ type: "get-state" }, (response) => render(response.enabled));
toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "set-enabled", enabled: toggle.checked }, (response) => {
    if (!response?.ok) {
      toggle.checked = !toggle.checked;
      status.textContent = response?.error ?? "Could not update protection.";
      status.classList.add("paused");
      return;
    }
    render(toggle.checked);
  });
});
