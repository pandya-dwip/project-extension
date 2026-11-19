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

// ─── Scheduled automatic JSON backup (daily, user-chosen local time) ──────
// The time is autoBackupTime ("HH:MM", default 18:00). A backup is due when the last
// attempt happened before the most recent scheduled time. The attempt time is
// recorded *before* running, so a failure is reported once and retried at the next
// scheduled time — never in a loop — and racing triggers can't double-run. If Chrome
// was closed or the PC was off at the scheduled time, the missed run happens once
// when the service worker next starts (browser launch, or any Clair event).
// Using timestamps rather than "one per calendar day" keeps this right when the time
// is changed: moving 18:00 → 16:00 after 16:00 runs today's missed backup now;
// moving 16:00 → 18:00 after a 16:00 backup still runs again at 18:00.
// Status lives in chrome.storage.local, never in Clair's SQLite file, so the
// background can't race with an open Clair tab that is saving data.
importScripts('backup.js'); // ClairBackup.DIR / autoFilename — same as the manual export

const BACKUP_ALARM = 'clair-daily-backup';
const DEFAULT_BACKUP_TIME = '18:00';

async function getBackupSettings() {
  const { autoBackupEnabled, autoBackupTime } = await chrome.storage.local.get(['autoBackupEnabled', 'autoBackupTime']);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(autoBackupTime || '') || /^(\d\d):(\d\d)$/.exec(DEFAULT_BACKUP_TIME);
  return { enabled: autoBackupEnabled !== false, hour: +m[1], minute: +m[2] }; // on by default
}

// Most recent scheduled time at or before `now`.
const lastScheduledAt = (hour, minute, now = new Date()) => {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d.getTime();
};
const nextRunAt = (hour, minute, from = new Date()) => {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
};

// Keeps exactly one one-shot alarm at the next scheduled time (one-shot, so DST can't
// drift it). Leaves a correct alarm alone; recreates it if missing or if the time
// setting changed; removes it when backups are disabled.
async function syncBackupAlarm() {
  const { enabled, hour, minute } = await getBackupSettings();
  const alarm = await chrome.alarms.get(BACKUP_ALARM);
  if (!enabled) { if (alarm) await chrome.alarms.clear(BACKUP_ALARM); return; }
  const at = alarm && new Date(alarm.scheduledTime);
  if (!at || at.getHours() !== hour || at.getMinutes() !== minute) {
    await chrome.alarms.create(BACKUP_ALARM, { when: nextRunAt(hour, minute) }); // same name replaces
  }
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Build the daily Clair JSON backup file for download'
  });
}

// Resolves with the finished DownloadItem only once Chrome reports the file complete.
function waitForDownload(id, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = async (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(onChanged);
      if (err) return reject(err);
      const [item] = await chrome.downloads.search({ id });
      resolve(item);
    };
    const check = (state, error) => {
      if (state === 'complete') finish();
      else if (state === 'interrupted') finish(new Error(`Download interrupted (${error || 'unknown reason'})`));
    };
    const onChanged = (delta) => {
      if (delta.id === id && delta.state) check(delta.state.current, delta.error && delta.error.current);
    };
    const timer = setTimeout(() => finish(new Error('Download did not finish within 2 minutes')), timeoutMs);
    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.search({ id }).then(([item]) => { if (item) check(item.state, item.error); });
  });
}

async function runBackup(startedAt) {
  try {
    await ensureOffscreen();
    const built = await chrome.runtime.sendMessage({ target: 'clair-offscreen', type: 'build-backup' });
    if (!built || !built.ok) throw new Error((built && built.error) || 'Backup page did not respond');
    const downloadId = await chrome.downloads.download({
      url: built.url,
      filename: ClairBackup.DIR + ClairBackup.autoFilename(startedAt),
      conflictAction: 'uniquify',
      saveAs: false
    });
    if (downloadId === undefined) throw new Error('Chrome refused the download');
    const item = await waitForDownload(downloadId);
    await chrome.storage.local.set({
      autoBackupStatus: 'success',
      autoBackupLastSuccessAt: new Date().toISOString(),
      autoBackupLastFile: item ? item.filename : '',
      autoBackupLastError: ''
    });
  } catch (e) {
    await chrome.storage.local.set({
      autoBackupStatus: 'failed',
      autoBackupLastFailedAt: new Date().toISOString(),
      autoBackupLastError: (e && e.message) || String(e)
    });
  } finally {
    try { await chrome.offscreen.closeDocument(); } catch (e) { /* not open */ }
  }
}

let backupInFlight = null;
function maybeBackup() {
  if (backupInFlight) return backupInFlight;
  backupInFlight = (async () => {
    const { enabled, hour, minute } = await getBackupSettings();
    if (!enabled) return;
    const now = new Date();
    // Never attempted (first activation) counts as missed: the most recent scheduled
    // time is caught up once, so a time chosen before the scheduler was active still runs.
    const { autoBackupLastAttemptAt = 0 } = await chrome.storage.local.get('autoBackupLastAttemptAt');
    if (autoBackupLastAttemptAt >= lastScheduledAt(hour, minute, now)) return; // already ran (or was attempted)
    await chrome.storage.local.set({ autoBackupLastAttemptAt: now.getTime() });
    await runBackup(now);
  })().finally(() => { backupInFlight = null; });
  return backupInFlight;
}

chrome.runtime.onInstalled.addListener(() => { syncBackupAlarm(); maybeBackup(); });
chrome.runtime.onStartup.addListener(() => { syncBackupAlarm(); maybeBackup(); });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== BACKUP_ALARM) return;
  await maybeBackup();
  await syncBackupAlarm(); // the one-shot alarm is spent; schedule the next run
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !(changes.autoBackupEnabled || changes.autoBackupTime)) return;
  await syncBackupAlarm();
  await maybeBackup();
});

// Every service-worker start (including after termination): make sure the alarm
// exists and catch up a missed slot. Both are no-ops when nothing is needed.
syncBackupAlarm();
maybeBackup();

// ─── Scheduled Jira sync + automatic QA tasks (9, 11, 13, 15, 17 h local) ──────
// One one-shot alarm at the next slot (same name replaces → never duplicated). A missed
// slot is caught up once, when the worker next starts or an alarm fires, but only inside
// the 9:00–18:00 window. The pipeline itself (jiracore.js) is shared with "Sync Now";
// both take the same Web Lock, so runs never overlap, and duplicate prevention lives in
// Clair's SQLite data (jiraQa), not here. If a Clair page is open it does the run (its
// in-memory state stays the only writer); otherwise the worker loads the database, runs
// it, and saves — open pages reload on the DB_SAVED broadcast.
importScripts('sql-wasm.js', 'db.js', 'jira.js', 'jiracore.js');
const JIRA_ALARM = 'clair-jira-qa-sync';

async function syncJiraAlarm() {
  const when = jiraQaNextSlot(new Date());
  const alarm = await chrome.alarms.get(JIRA_ALARM);
  if (!alarm || Math.abs(alarm.scheduledTime - when) > 60000) await chrome.alarms.create(JIRA_ALARM, { when });
}

// Run the pipeline in the worker on the latest saved database (reloaded inside the lock).
async function runJiraSyncHere() {
  if (!(await ClairDB.loadSnapshot())) return null; // Clair has never saved data
  const data = {};
  return jiraQaSyncLocked({
    data, trigger: 'scheduled', save: () => ClairDB.save(data),
    prepare: async () => { await ClairDB.reload(); Object.assign(data, await ClairDB.load()); }
  });
}

let jiraSyncInFlight = null;
function maybeJiraSync() {
  if (jiraSyncInFlight) return jiraSyncInFlight;
  jiraSyncInFlight = (async () => {
    const { jiraQaLastSlot = 0 } = await chrome.storage.local.get('jiraQaLastSlot');
    const slot = jiraQaDueSlot(new Date(), jiraQaLastSlot);
    if (!slot) return;
    const cfg = await ClairJira.getPublicConfig();
    if (!cfg || !cfg.hasToken) return; // Jira not connected: nothing to do
    await chrome.storage.local.set({ jiraQaLastSlot: slot }); // recorded first: a failure is retried at the next slot, never in a loop
    let handled = false;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'clair-jira-qa-sync', trigger: 'scheduled' });
      handled = !!(r && r.handled);
    } catch (e) { /* no Clair page open */ }
    if (handled) return;
    await runJiraSyncHere();
  })().catch(e => console.warn('Clair scheduled Jira sync failed:', e && e.message))
    .finally(() => { jiraSyncInFlight = null; });
  return jiraSyncInFlight;
}

chrome.runtime.onInstalled.addListener(() => { syncJiraAlarm(); maybeJiraSync(); });
chrome.runtime.onStartup.addListener(() => { syncJiraAlarm(); maybeJiraSync(); });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== JIRA_ALARM) return;
  await maybeJiraSync();
  await syncJiraAlarm();
});
syncJiraAlarm();
maybeJiraSync();
