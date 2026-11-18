// offscreen.js — builds the auto-backup file from the saved database (read-only).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'clair-offscreen' || msg.type !== 'build-backup') return;
  (async () => {
    try {
      const data = await ClairDB.loadSnapshot();
      if (!data) throw new Error('No saved Clair data found to back up');
      const json = ClairBackup.toJSON(data);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      sendResponse({ ok: true, url, bytes: json.length });
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || String(e) });
    }
  })();
  return true; // async response
});
