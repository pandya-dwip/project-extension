// backup.js — the single definition of Clair's JSON backup format and location.
// Shared by the manual Export (app.js, page context) and the scheduled automatic
// backup (offscreen.js / background.js), so both always produce identical files.
const ClairBackup = (() => {
  // chrome.downloads paths are relative to the user's Downloads folder.
  const DIR = 'Extensions/project-extension/Backup/';
  const KEYS = ['projects', 'tasks', 'tests', 'activity', 'developers', 'releases', 'testCases', 'modules', 'releasePoints', 'noteFolders', 'notes'];

  const toJSON = (data) => {
    const payload = {};
    KEYS.forEach(k => { payload[k] = data[k] || []; });
    payload.exportedAt = new Date().toISOString();
    return JSON.stringify(payload, null, 2);
  };

  const pad = (n) => String(n).padStart(2, '0');
  // Local time, e.g. clair-autobackup-2026-11-18_18-00-00.json
  const autoFilename = (d = new Date()) =>
    `clair-autobackup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;

  return { DIR, KEYS, toJSON, autoFilename };
})();
