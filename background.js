// background.js — Service Worker for Clair Extension

let clairTabId = null;

chrome.action.onClicked.addListener(async () => {
  // Check if the tab still exists
  if (clairTabId !== null) {
    try {
      const tab = await chrome.tabs.get(clairTabId);
      if (tab) {
        // Focus the existing tab
        await chrome.tabs.update(clairTabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch (e) {
      // Tab no longer exists
      clairTabId = null;
    }
  }

  // Open a new tab
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  clairTabId = tab.id;
});

// If the tab is closed, reset the reference
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === clairTabId) {
    clairTabId = null;
  }
});
