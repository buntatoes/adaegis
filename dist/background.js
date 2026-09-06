const RULESET_ID = "core";
async function setEnabled(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? [RULESET_ID] : [],
    disableRulesetIds: enabled ? [] : []
  });
  await chrome.storage.local.set({ enabled });
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
}
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  await setEnabled(enabled !== false);
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (typeof message !== "object" || message === null) return;
  if (message.type === "get-state") {
    chrome.storage.local.get("enabled").then(({ enabled }) => sendResponse({ enabled: enabled !== false }));
    return true;
  }
  if (message.type === "set-enabled" && typeof message.enabled === "boolean") {
    setEnabled(message.enabled)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
