// Clair — js/notifications.js: Notifications: bell, page, sound, settings.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Notifications (page) ─────────────────────────────────
// The list lives in chrome.storage.local (see jiracore.js). This page mirrors it in
// state.notifications, updates the bell/badges, plays the chime and re-renders the
// Notifications page whenever the watcher (background) adds something.
const NOTIFY_TYPES = [
  { key: 'comment', label: 'Comments', color: 'var(--info)', icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>' },
  { key: 'status', label: 'Status changes', color: 'var(--violet)', icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
  { key: 'update', label: 'Updates', color: 'var(--warning)', icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
  { key: 'qa-task', label: 'QA tasks', color: 'var(--accent)', icon: '<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="2"/>' }
];
const NOTIFY_BELL = '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>';

// A short two-note chime, synthesised (no sound file). Browsers only allow audio after
// the page has been interacted with once, so the audio context is unlocked on the
// first click/keypress; Clair stays open, so that happens early in the day.
let notifyAudio = null;
const notifyAudioCtx = () => {
  try {
    notifyAudio = notifyAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (notifyAudio.state === 'suspended') notifyAudio.resume();
  } catch (e) { notifyAudio = null; }
  return notifyAudio;
};
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (!notifyAudio || notifyAudio.state === 'suspended') notifyAudioCtx(); }, { capture: true, passive: true }));
const clairChime = () => {
  document.documentElement.dataset.lastChime = String(Date.now()); // lets tests (and devtools) see a chime was played
  const ctx = notifyAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.02;
  [[784, 0], [1175, 0.14]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + delay);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + delay);
    osc.stop(t0 + delay + 0.55);
  });
};

const updateNotifyBadge = () => {
  const n = (state.notifications || []).filter(x => !x.read).length;
  document.querySelectorAll('[data-notify-badge]').forEach(el => { el.textContent = n > 99 ? '99+' : String(n); el.hidden = !n; });
  const bell = document.getElementById('notifBellBtn');
  if (bell) bell.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
};
const notifyLoad = async () => {
  if (!hasChromeStorage()) return;
  state.notifications = (await chrome.storage.local.get(NOTIFY_KEY))[NOTIFY_KEY] || [];
  state.notifySettings = await notifySettings();
  updateNotifyBadge();
};
// Tell the background watcher which Jira projects are linked (it can't read the DB safely).
let watchProjectsSig = null;
const syncWatchProjects = () => {
  if (!hasChromeStorage()) return;
  const list = (state.projects || []).filter(p => p.jira && p.jira.projectKey).map(p => ({ key: p.jira.projectKey, name: p.name }));
  const sig = JSON.stringify(list);
  if (sig === watchProjectsSig) return;
  watchProjectsSig = sig;
  chrome.storage.local.set({ [NOTIFY_PROJECTS_KEY]: list });
};
if (hasChromeStorage()) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[NOTIFY_SETTINGS_KEY]) state.notifySettings = { ...NOTIFY_DEFAULTS, ...(changes[NOTIFY_SETTINGS_KEY].newValue || {}) };
    if (!changes[NOTIFY_KEY]) return;
    const before = new Set((state.notifications || []).map(n => n.id));
    state.notifications = changes[NOTIFY_KEY].newValue || [];
    const fresh = state.notifications.filter(n => !before.has(n.id) && !n.read);
    updateNotifyBadge();
    if (fresh.length) {
      if ((state.notifySettings || NOTIFY_DEFAULTS).sound) clairChime();
      showToast(fresh.length === 1 ? fresh[0].title : `${fresh.length} new notifications`);
    }
    if (state.view === 'notifications') render();
  });
}
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'clair-open-notifications') setView('notifications'); });
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-pw-toggle]');
  if (!t) return;
  const input = document.getElementById(t.dataset.pwToggle);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  t.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
  t.classList.toggle('on', input.type === 'text');
});
const topbarDate = document.getElementById('topbarDate');
if (topbarDate) topbarDate.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const notifBellBtn = document.getElementById('notifBellBtn');
if (notifBellBtn) notifBellBtn.addEventListener('click', () => setView('notifications'));

let notifyChecking = false;
const runNotifyCheck = async () => {
  if (notifyChecking) return;
  notifyChecking = true;
  render();
  try {
    // 1. Run watcher with a 24-hour lookback window so recent changes / changes while PC was off are caught
    const watchPromise = jiraWatchPollLocked({ lookbackMinutes: 1440 });
    // 2. Run QA Sync pipeline to detect Ready for QA tickets and create QA tasks
    const qaPromise = (typeof runJiraQaSync === 'function' && jiraAvailable() && jiraConnected())
      ? runJiraQaSync('manual', { silentToast: true })
      : Promise.resolve(null);

    const [watchRes, qaRes] = await Promise.all([watchPromise, qaPromise]);
    await notifyLoad();

    if (qaRes && qaRes.newQa > 0) {
      const parts = [`${qaRes.newQa} Ready for QA ticket${qaRes.newQa === 1 ? '' : 's'} synced (${qaRes.tasks} QA task${qaRes.tasks === 1 ? '' : 's'} created)`];
      if (watchRes && watchRes.added > 0) parts.push(`${watchRes.added} update notification${watchRes.added === 1 ? '' : 's'}`);
      showToast(parts.join(' · '), 'success');
    } else if (watchRes && watchRes.added > 0) {
      showToast(`${watchRes.added} new notification${watchRes.added === 1 ? '' : 's'} from Jira`, 'success');
    } else if (watchRes && watchRes.skipped === 'not connected') {
      showToast('Connect Jira in Settings → Integrations first', 'error');
    } else if (watchRes && watchRes.skipped === 'no linked projects') {
      showToast('Link a project to Jira first (project Edit form)', 'error');
    } else if (watchRes && watchRes.skipped) {
      showToast('Notifications are available in the installed extension only', 'error');
    } else if (qaRes && qaRes.busy) {
      showToast('A Jira sync is already running');
    } else {
      showToast('No new changes in Jira — all tickets up to date');
    }
  } catch (e) {
    showToast(`Couldn't check Jira — ${jiraErrorText(e)}`, 'error');
  } finally {
    notifyChecking = false;
    render();
  }
};

const renderNotifications = () => {
  const all = state.notifications || [];
  const f = state.notifyFilter || '';
  const typeOf = (k) => NOTIFY_TYPES.find(t => t.key === k) || NOTIFY_TYPES[2];
  const unread = all.filter(n => !n.read).length;
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = new Date();
  const todayKey = dayKey(now);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const count = (k) => all.filter(n => n.type === k).length;
  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${NOTIFY_BELL}</svg>`,
    title: 'Notifications',
    subtitle: 'Comments, status changes and updates in your linked Jira projects, and automatic QA tasks — checked every 30 seconds.',
    stats: [
      { label: 'Unread', value: unread, color: unread ? '#fbbf24' : undefined },
      { label: 'Today', value: all.filter(n => dayKey(new Date(n.at)) === todayKey).length },
      ...NOTIFY_TYPES.map(t => ({ label: t.label, value: count(t.key) }))
    ]
  });
  const connected = jiraAvailable() && jiraConnected();
  const linked = (state.projects || []).some(p => p.jira && p.jira.projectKey);
  const setup = !jiraAvailable() ? 'Notifications work in the installed extension only.'
    : !connected ? 'Connect Jira in Settings → Integrations to get notifications about your tickets.'
    : !linked ? 'Link a Clair project to a Jira project (project Edit form) to get notifications about its tickets.' : '';
  const chip = (k, l, n) => `<button type="button" class="rpa-chip ${f === k ? 'active' : ''}" data-action="notif-filter" data-filter="${k}">${l} <span>${n}</span></button>`;
  const list = all.filter(n => !f || (f === 'unread' ? !n.read : n.type === f));
  const groups = [];
  list.forEach(n => {
    const d = new Date(n.at);
    const k = dayKey(d);
    let g = groups[groups.length - 1];
    if (!g || g.k !== k) {
      g = { k, label: k === todayKey ? 'Today' : k === dayKey(y) ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }), items: [] };
      groups.push(g);
    }
    g.items.push(n);
  });
  const item = (n) => {
    const t = typeOf(n.type);
    return `
      <div class="nt-item ${n.read ? '' : 'unread'}" style="--c:${t.color}" data-action="notif-open" data-nid="${escapeHtml(n.id)}" role="button" tabindex="0">
        <span class="act-icon nt-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t.icon}</svg></span>
        <div class="nt-main">
          <div class="nt-title">${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="nt-body">${escapeHtml(n.body)}</div>` : ''}
          <div class="nt-meta">${escapeHtml(t.label)}${n.url ? ' · opens in Jira' : n.taskId ? ' · opens the task' : ''}</div>
        </div>
        <time class="act-time" datetime="${escapeHtml(n.at)}">${fmtTime(n.at)}</time>
        <button type="button" class="icon-btn nt-read" data-action="notif-toggle-read" data-nid="${escapeHtml(n.id)}" title="${n.read ? 'Mark as unread' : 'Mark as read'}" aria-label="${n.read ? 'Mark as unread' : 'Mark as read'}">
          ${n.read ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>'}
        </button>
      </div>`;
  };
  return `
    ${hero}
    ${setup ? `<div class="jd-notice nt-notice">${escapeHtml(setup)}${jiraAvailable() && !connected ? ' <button type="button" class="rpa-link" data-action="jira-go-settings">Open Settings</button>' : ''}</div>` : ''}
    <div class="filters-bar tk-toolbar std-toolbar">
      <div class="act-chips">${chip('', 'All', all.length)}${chip('unread', 'Unread', unread)}${NOTIFY_TYPES.map(t => chip(t.key, t.label, count(t.key))).join('')}</div>
      <div class="rpa-toolbar-right">
        <button type="button" class="btn-ghost st-btn" data-action="notif-settings">Settings</button>
        <button type="button" class="btn-ghost st-btn" data-action="notif-clear-read" ${all.some(n => n.read) ? '' : 'disabled'}>Clear read</button>
        <button type="button" class="btn-ghost st-btn" data-action="notif-mark-all" ${unread ? '' : 'disabled'}>Mark all read</button>
        <button type="button" class="btn-primary st-btn" data-action="notif-check-now" ${notifyChecking || !connected ? 'disabled' : ''}>${notifyChecking ? 'Checking…' : 'Check now'}</button>
      </div>
    </div>
    ${groups.length ? `<div class="act-timeline">${groups.map(g => `
      <section class="act-day">
        <h3 class="act-day-title">${g.label}<span class="rpa-group-count">${g.items.length}</span></h3>
        <div class="act-items">${g.items.map(item).join('')}</div>
      </section>`).join('')}</div>` : `
      <div class="rpa-empty">
        <span class="rpa-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${NOTIFY_BELL}</svg></span>
        <h3>${all.length ? 'Nothing here' : 'You’re all caught up'}</h3>
        <p>${all.length ? 'No notifications match this filter.' : 'New comments, status changes and updates in your linked Jira projects will appear here.'}</p>
      </div>`}
  `;
};

// Settings → Notifications.
const renderNotifySettings = () => {
  const ns = state.notifySettings || NOTIFY_DEFAULTS;
  const tg = (k, label) => `<label class="switch-toggle" title="${label}"><input type="checkbox" data-notify-setting="${k}" ${ns[k] ? 'checked' : ''} aria-label="${label}" /><span class="switch-slider"></span></label>`;
  return stSection('Alerts', 'How Clair tells you about something new.', `
      <div class="st-list">
        ${stRow('Sound', 'Play a short chime when a notification arrives while Clair is open.', `<button type="button" class="btn-ghost st-btn" data-action="notify-test-sound">Play</button>${tg('sound', 'Sound')}`)}
        ${stRow('Desktop notifications', 'Also show a Windows notification — useful when Clair is in the background.', tg('desktop', 'Desktop notifications'))}
      </div>`) +
    stSection('What to notify about', 'Clair checks your linked Jira projects every 30 seconds while Chrome is running.', `
      <div class="st-list">
        ${stRow('Comments', 'Someone comments on a ticket.', tg('comments', 'Comments'))}
        ${stRow('Status changes', 'A ticket moves to another status.', tg('status', 'Status changes'))}
        ${stRow('Other updates', 'Assignee, priority, summary and other field changes.', tg('updates', 'Other updates'))}
        ${stRow('QA tasks created', 'The Jira sync creates a “Ticket closing” task.', tg('qaTasks', 'QA tasks created'))}
        ${stRow('Include my own changes', 'Also notify about changes you make in Jira yourself.', tg('own', 'Include my own changes'))}
      </div>`);
};
