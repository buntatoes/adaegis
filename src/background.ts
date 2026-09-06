const RULESET_ID = "core";

async function setEnabled(enabled: boolean): Promise<void> {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? [RULESET_ID] : [],
    disableRulesetIds: enabled ? [] : [RULESET_ID]
  });

  await chrome.storage.local.set({ enabled });
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  await setEnabled(enabled !== false);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== "object" || message === null) return;

  const request = message as { type?: string; enabled?: boolean };

  if (request.type === "get-state") {
    chrome.storage.local.get("enabled").then(({ enabled }) => {
      sendResponse({ enabled: enabled !== false });
    });
    return true;
  }

  if (request.type === "set-enabled" && typeof request.enabled === "boolean") {
    setEnabled(request.enabled)
      .then(() => sendResponse({ ok: true }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
