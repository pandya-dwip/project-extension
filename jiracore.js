// jiracore.js — Jira logic shared by the Clair page (js/*.js) and the background worker:
// status categories and automatic status mapping, and the Jira sync / automatic QA task
// pipeline. Loaded as a classic script (top-level names are shared with the page scripts in js/).
// Clair categories a Jira status can be mapped to (order = display order). Colour drives
// cards, KPI tiles, the stacked bar and pills. "core" ones always show on cards/banner;
// the others show there only when they have tickets (the details page shows all).
const JIRA_CATS = [
  { key: 'todo', label: 'To Do', color: 'var(--status-planned)', core: true },
  { key: 'reopen', label: 'Reopen', color: 'var(--jd-reopen)' },
  { key: 'inprogress', label: 'In Progress', color: 'var(--warning)', core: true },
  { key: 'inreview', label: 'In Review', color: 'var(--indigo)' },
  { key: 'qa', label: 'Ready for QA', color: 'var(--info)', core: true },
  { key: 'monitoring', label: 'Monitoring', color: 'var(--jd-monitor)' },
  { key: 'onhold', label: 'On Hold', color: 'var(--violet)' },
  { key: 'done', label: 'Done', color: 'var(--accent)', core: true },
  { key: 'notapplicable', label: 'Not Applicable', short: 'N/A', color: 'var(--jd-na)' },
  { key: 'wontdo', label: 'Will Not Do / Not a Bug', short: 'Won’t Do', color: 'var(--text-muted)' }
];
const JIRA_CAT_LABEL = { ...Object.fromEntries(JIRA_CATS.map(k => [k.key, k.label])), unmapped: 'Unmapped' };

// Common status names → category. Anything else stays Unmapped until the user maps it.
// Order matters for phrase-in-name matches: negative/specific categories come first, so
// "Not Done" or "Review in progress" don't land in Done / In Progress.
const JIRA_AUTO = [
  ['wontdo', ["won't do", 'wont do', 'will not do', "won't fix", 'wont fix', 'will not fix', 'not a bug', 'not bug', 'rejected', 'cancelled', 'canceled', 'invalid', 'duplicate', 'declined', 'obsolete', 'cannot reproduce', "can't reproduce", 'cant reproduce', 'not reproducible']],
  ['notapplicable', ['not applicable', 'n/a', 'na', 'not relevant']],
  ['onhold', ['on hold', 'hold', 'blocked', 'paused', 'deferred', 'parked', 'postponed']],
  ['reopen', ['reopen', 'reopened', 're open', 're opened']],
  ['qa', ['ready for qa', 'rfqa', 'rfq', 'qa', 'in qa', 'qa review', 'ready for test', 'ready for testing', 'ready to test', 'testing', 'in test', 'in testing', 'uat', 'to verify', 'verify', 'verification']],
  ['inreview', ['in review', 'review', 'code review', 'in code review', 'under review', 'peer review', 'pr review', 'awaiting review', 'ready for review']],
  ['monitoring', ['monitoring', 'in monitoring', 'monitor', 'under observation', 'observation', 'watching']],
  ['inprogress', ['in progress', 'in development', 'in dev', 'doing', 'development', 'implementing', 'work in progress', 'wip']],
  ['done', ['done', 'closed', 'resolved', 'complete', 'completed', 'released', 'deployed', 'fixed', 'shipped']],
  ['todo', ['to do', 'todo', 'open', 'backlog', 'new', 'selected for development', 'ready for dev', 'ready for development', 'planned']]
].map(([cat, phrases]) => {
  const label = JIRA_CAT_LABEL[cat].toLowerCase();
  const all = [...new Set([...phrases, label, ...label.split(/\s*\/\s*/)])];
  return [cat, new Set(all), new RegExp(`(^|[^a-z0-9'])(${all.map(p => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})(?=$|[^a-z0-9'])`)];
});
const jiraNormStatus = (s) => String(s || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const jiraExactCategory = (n) => (JIRA_AUTO.find(([, set]) => set.has(n)) || [''])[0];
const jiraAutoCategory = (name) => {
  const n = jiraNormStatus(name);
  if (!n) return '';
  // 1. The whole name is a known status ("Ready for QA", "Not a Bug").
  const exact = jiraExactCategory(n);
  if (exact) return exact;
  // 2. Several names joined ("WILL NOT DO/NOT A BUG", "Done | Closed"): use them if they agree.
  const parts = n.split(/\s*(?:\/|\||,|&|\+|\bor\b)\s*/).filter(Boolean);
  if (parts.length > 1) {
    const cats = new Set(parts.map(jiraExactCategory).filter(Boolean));
    if (cats.size === 1) return [...cats][0];
    if (cats.size > 1) return ''; // conflicting ("Done/To Do") → let the user decide
  }
  // 3. A known status phrase inside a longer name ("In QA", "Blocked by vendor").
  //    Negated names ("Not Done") only count for the negative categories.
  const hit = JIRA_AUTO.find(([, , re]) => re.test(n));
  if (!hit) return '';
  return /\bnot\b/.test(n) && hit[0] !== 'wontdo' && hit[0] !== 'notapplicable' ? '' : hit[0];
};

// A manual choice must be a real category ("unmapped" is never a choice; older versions
// could save it, which pinned a status to Unmapped and hid the automatic match).
const jiraIsCat = (k) => JIRA_CATS.some(c => c.key === k);
// Category of a status: user override, else automatic, else unmapped.
const jiraCategoryOf = (rec, statusId, statusName) => {
  const o = rec && rec.statusMap ? rec.statusMap[statusId] : undefined;
  if (jiraIsCat(o)) return o;
  return jiraAutoCategory(statusName) || 'unmapped';
};

// ─── Jira sync pipeline (shared by the Clair page and the background worker) ───
// One pipeline for "Sync Now" and the scheduled runs: refresh every linked project's
// ticket cache, find tickets that newly ENTERED the status mapped to Ready for QA
// (from each issue's changelog), and create ONE "Ticket closing" task per Clair project.
// All bookkeeping lives in the SQLite table jiraQa (records by `kind`):
//   checkpoint  one per Clair project: changes at/after `at` still need processing
//   issue       one per Jira issue that already produced a QA task (never again)
//   batch       one per created task: stable batch id → task id
//   run         the last runs' summaries (shown on the Jira page)
// A task and the records that mark its tickets processed are saved in the same
// whole-state save, so a crash can't leave one without the other.
// Local [hour, minute] of the scheduled runs: office opens at 9:30, then every two hours.
const JIRA_QA_SLOTS = [[9, 30], [11, 30], [13, 30], [15, 30], [17, 30]];
const JIRA_QA_END_HOUR = 18;                // operating window 9:30–18:00
const JIRA_QA_TAG = 'Auto Task Creation';
const JIRA_QA_LOCK = 'clair-jira-qa-sync';
const JIRA_QA_SKEW_MS = 10 * 60 * 1000;     // overlap between checkpoints (clock skew); duplicates are filtered

const jiraTime = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || 0; // Jira: …+0530

// Latest scheduled slot today that is due (≤ now, inside the window) and not done yet.
const jiraQaDueSlot = (now, lastSlotMs) => {
  if (now.getHours() >= JIRA_QA_END_HOUR) return 0;
  let due = 0;
  JIRA_QA_SLOTS.forEach(([h, m]) => { const d = new Date(now); d.setHours(h, m, 0, 0); if (d <= now) due = d.getTime(); });
  return due && due > (lastSlotMs || 0) ? due : 0;
};
const jiraQaNextSlot = (from = new Date()) => {
  for (let add = 0; add < 3; add++) {
    for (const [h, m] of JIRA_QA_SLOTS) {
      const d = new Date(from); d.setDate(d.getDate() + add); d.setHours(h, m, 0, 0);
      if (d > from) return d.getTime();
    }
  }
  return from.getTime() + 86400000;
};

const jiraQaRec = (data, id) => (data.jiraQa || []).find(r => r.id === id);
const jiraQaPut = (data, rec) => { data.jiraQa = [...(data.jiraQa || []).filter(r => r.id !== rec.id), rec]; };
const jiraHash = (s) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const jiraLocalDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const jiraFmt = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const jiraErrText = (e) => (e && e.name === 'JiraError') ? e.message : ((e && e.message) || 'Something went wrong while contacting Jira.');

// Fetch every issue of a linked project and replace its cache — only after a complete
// fetch. On failure the previous cache is kept, the error recorded, and the error rethrown.
const jiraRefreshProjectCache = async (data, project, onProgress) => {
  const link = { ...project.jira };
  try {
    const { site, issues } = await ClairJira.fetchAllIssues({ projectKey: link.projectKey, onProgress });
    // Statuses: the project's workflow statuses, plus any seen on issues.
    const statuses = new Map();
    try { (await ClairJira.getProjectStatuses(link.projectKey)).forEach(s => statuses.set(s.id, s)); } catch (e) { /* fall back to issue statuses */ }
    issues.forEach(i => { if (i.statusId && !statuses.has(i.statusId)) statuses.set(i.statusId, { id: i.statusId, name: i.status, category: i.statusCategory }); });
    const prev = (data.jiraSync || []).find(x => x.id === project.id);
    const sameProject = prev && prev.site === site && String(prev.jiraProjectId) === String(link.projectId);
    const rec = {
      id: project.id, site, jiraProjectId: String(link.projectId), jiraProjectKey: link.projectKey, jiraProjectName: link.projectName,
      statuses: [...statuses.values()],
      // Refresh re-applies automatic mapping: keep only real manual choices that differ
      // from what Automatic now picks, for statuses that still exist.
      statusMap: sameProject ? Object.fromEntries(Object.entries(prev.statusMap || {}).filter(([sid, cat]) =>
        statuses.has(sid) && jiraIsCat(cat) && cat !== jiraAutoCategory(statuses.get(sid).name))) : {},
      issues, syncedAt: new Date().toISOString(), lastError: '', lastErrorAt: ''
    };
    data.jiraSync = [...(data.jiraSync || []).filter(x => x.id !== project.id), rec];
    return rec;
  } catch (e) {
    const prev = (data.jiraSync || []).find(x => x.id === project.id);
    if (prev) { prev.lastError = jiraErrText(e); prev.lastErrorAt = new Date().toISOString(); }
    else data.jiraSync = [...(data.jiraSync || []), { id: project.id, site: link.site, jiraProjectId: String(link.projectId), jiraProjectKey: link.projectKey, jiraProjectName: link.projectName, statuses: [], statusMap: {}, issues: [], syncedAt: '', lastError: jiraErrText(e), lastErrorAt: new Date().toISOString() }];
    throw e;
  }
};

// Newly entered Ready for QA events of one project since its checkpoint.
const jiraFindQaEntries = async (data, project, rec, sinceMs) => {
  const from = sinceMs - JIRA_QA_SKEW_MS;
  const out = [];
  const skipped = []; // assignees of tickets that already produced a QA task
  for (const i of rec.issues.filter(x => jiraTime(x.updated) >= from)) {
    const changes = await ClairJira.getStatusChanges(i.id);
    const entries = changes.filter(c => jiraTime(c.created) >= from && jiraCategoryOf(rec, c.toId, c.toName) === 'qa');
    if (!entries.length) continue;
    if (jiraQaRec(data, `issue:${rec.site}|${i.id}`)) { skipped.push(i.assignee || ''); continue; } // already produced a QA task
    const first = entries[0]; // earliest entry in this window (changelog is oldest first)
    out.push({
      eventId: `${rec.site}|${i.id}|${first.historyId}`, issueId: i.id, key: i.key, summary: i.summary,
      assignee: i.assignee || '', url: i.url, enteredAt: jiraTime(first.created), status: first.toName
    });
  }
  return { entries: out, skipped };
};

// Task description for a QA batch. Plain text (task descriptions keep line breaks and
// make links clickable); the first line is what task cards preview.
const jiraQaDescription = ({ projectKey, tickets, trigger, at }) => {
  const n = tickets.length;
  const one = n === 1;
  const pad = one ? '' : '   ';
  const block = (t, k) => [
    `${one ? '' : `${k + 1}. `}${t.key} · ${t.summary}`,
    `${pad}Developer: ${t.assignee || 'Unassigned'}`,
    `${pad}Ready for QA since: ${t.readyAt}`,
    `${pad}${t.url}`
  ].join('\n');
  return [
    one ? `Verify ${tickets[0].key}: ${tickets[0].summary}` : `Verify ${n} ${projectKey} tickets that are ready for QA.`,
    '',
    one
      ? 'This ticket was moved to Ready for QA in Jira. Test the fix, then close the ticket in Jira — or send it back to the developer with a comment if the issue still occurs.'
      : 'These tickets were moved to Ready for QA in Jira. Test each fix, then close the ticket in Jira — or send it back to the developer with a comment if the issue still occurs.',
    '',
    one ? 'Ticket details' : `Tickets (${n})`,
    '',
    tickets.map(block).join('\n\n'),
    '',
    '—',
    `Created automatically by the ${trigger === 'scheduled' ? 'scheduled' : 'manual'} Jira sync on ${at}.`
  ].join('\n');
};

// Rewrites descriptions of earlier automatic QA tasks that still have the original
// generated wording (never touches a description the user has edited). Returns true if any changed.
const jiraQaUpgradeDescriptions = (data) => {
  let changed = false;
  (data.tasks || []).forEach(t => {
    if (!t.autoQa || !t.description) return;
    const head = /^(\d+) Jira tickets? moved to Ready for QA \(([^)]+)\), found by the (scheduled|manual) Jira sync on ([^\n]+):\n\n/.exec(t.description);
    if (!head) return;
    const tickets = [];
    const re = /(?:^|\n\n)\d+\. (\S+) — ([^\n]*)\n {3}Assignee: ([^\n]*)\n {3}Entered Ready for QA: ([^\n]*)\n {3}(\S+)/g;
    let m;
    while ((m = re.exec(t.description.slice(head[0].length)))) tickets.push({ key: m[1], summary: m[2], assignee: m[3] === 'Unassigned' ? '' : m[3], readyAt: m[4], url: m[5] });
    // Only if the whole description was the generated text.
    const original = `${head[1]} Jira ticket${+head[1] === 1 ? '' : 's'} moved to Ready for QA (${head[2]}), found by the ${head[3]} Jira sync on ${head[4]}:\n\n` +
      tickets.map((x, k) => `${k + 1}. ${x.key} — ${x.summary}\n   Assignee: ${x.assignee || 'Unassigned'}\n   Entered Ready for QA: ${x.readyAt}\n   ${x.url}`).join('\n\n');
    if (!tickets.length || original !== t.description) return;
    t.description = jiraQaDescription({ projectKey: head[2], tickets, trigger: head[3], at: head[4] });
    t.autoQa = { ...t.autoQa, tickets };
    changed = true;
  });
  return changed;
};

// When several Clair projects are linked to the same Jira project (e.g. CIMTrack — the
// app — and CIMTrack Dashboard — the web software — both on CIMTRACK), a ticket belongs to
// the Clair project its Jira assignee works on (Developers page). If the assignee is on
// none or several of them, or there is no assignee, it goes to the first of those
// projects in Clair's project order.
const jiraQaOwner = (data, group, assignee) => {
  if (group.length < 2) return group[0] && group[0].id;
  const n = String(assignee || '').trim().toLowerCase();
  const dev = n && (data.developers || []).find(d => (d.name || '').trim().toLowerCase() === n);
  const onIt = dev ? group.filter(p => (dev.projectIds || []).map(String).includes(String(p.id))) : [];
  return (onIt.length === 1 ? onIt[0] : group[0]).id;
};

// Create (or recognise) the consolidated task for one project's batch. Returns the task id.
const JIRA_QA_MAX_PER_TASK = 5; // tickets per "Ticket closing" task; more are split into further tasks
const jiraCreateQaTask = (data, project, entries, trigger, runAt, part = '') => {
  const eventIds = entries.map(e => e.eventId).sort();
  const batchId = `qa-${jiraHash(project.id + '|' + eventIds.join(','))}`;
  const existing = jiraQaRec(data, `batch:${batchId}`) || null;
  const existingTask = (data.tasks || []).find(t => t.autoQa && t.autoQa.batchId === batchId);
  let taskId = existing ? existing.taskId : existingTask ? existingTask.id : null;
  let created = false;
  if (!taskId) {
    entries.sort((a, b) => a.enteredAt - b.enteredAt || a.key.localeCompare(b.key, undefined, { numeric: true }));
    const start = entries[0].enteredAt;
    const devIds = [...new Set(entries.map(e => {
      const n = e.assignee.trim().toLowerCase();
      const d = n && (data.developers || []).find(x => (x.name || '').trim().toLowerCase() === n);
      return d ? d.id : null;
    }).filter(Boolean))];
    const tickets = entries.map(e => ({ key: e.key, summary: e.summary, assignee: e.assignee, readyAt: jiraFmt(e.enteredAt), url: e.url }));
    const now = new Date().toISOString();
    taskId = `qa${jiraHash(batchId + now)}${Math.random().toString(36).slice(2, 6)}`;
    data.tasks = [{
      id: taskId,
      title: `Ticket closing - ${project.name}${part}`,
      description: jiraQaDescription({ projectKey: project.jira.projectKey, tickets, trigger, at: jiraFmt(runAt) }),
      workDone: '', tags: [JIRA_QA_TAG],
      startDate: jiraLocalDate(start), endDate: jiraLocalDate(start + 2 * 86400000),
      status: 'To-Do', priority: 'Medium', projectIds: [project.id], developerIds: devIds,
      completedDate: null, createdAt: now, updatedAt: now,
      autoQa: { batchId, issueIds: entries.map(e => e.issueId), keys: entries.map(e => e.key), trigger, tickets, routed: true }
    }, ...(data.tasks || [])];
    data.activity = [{ id: Math.random().toString(36).slice(2, 10), text: `Added task "Ticket closing - ${project.name}${part}" (${entries.length} Ready for QA ticket${entries.length === 1 ? '' : 's'} from Jira)`, type: 'task', at: now }, ...(data.activity || [])].slice(0, 200);
    created = true;
  }
  jiraQaPut(data, { id: `batch:${batchId}`, kind: 'batch', batchId, projectId: project.id, taskId, eventIds, createdAt: new Date().toISOString() });
  entries.forEach(e => jiraQaPut(data, { id: `issue:${e.eventId.split('|').slice(0, 2).join('|')}`, kind: 'issue', issueId: e.issueId, key: e.key, projectId: project.id, eventId: e.eventId, enteredAt: new Date(e.enteredAt).toISOString(), taskId, batchId, processedAt: new Date().toISOString() }));
  return { taskId, created, batchId };
};

// The pipeline. `data` holds the app collections (the page's state, or a loaded DB in the
// worker); `save` persists them. Returns the run summary (also stored in jiraQa).
const jiraQaSync = async ({ data, trigger, save, onProgress = () => {} }) => {
  const runAt = Date.now();
  const projects = (data.projects || []).filter(p => p.jira && p.jira.projectKey && !p.jira.hiddenFromBoard);
  jiraQaReroute(data); // earlier tasks in the wrong one of several projects sharing a Jira project
  const qaEvents = [];
  const sum = { kind: 'run', id: `run:${runAt}`, trigger, startedAt: new Date(runAt).toISOString(), finishedAt: '', projects: projects.length, synced: 0, tickets: 0, newQa: 0, tasks: 0, taskProjects: [], skipped: 0, failures: [], ok: false };
  for (const [n, p] of projects.entries()) {
    onProgress(`Syncing ${p.name} (${n + 1} of ${projects.length})…`);
    try {
      const rec = await jiraRefreshProjectCache(data, p, (k) => onProgress(`Syncing ${p.name} (${n + 1} of ${projects.length}) — ${k} tickets…`));
      sum.synced++;
      sum.tickets += rec.issues.length;
      const cpId = `checkpoint:${p.id}`;
      const cp = jiraQaRec(data, cpId);
      const linkSig = `${rec.site}|${rec.jiraProjectId}`;
      // First run for this link: start from the beginning of today (no flood of old tickets).
      const since = cp && cp.link === linkSig ? jiraTime(cp.at) : new Date(new Date(runAt).setHours(0, 0, 0, 0)).getTime();
      onProgress(`Checking ${p.name} for new Ready for QA tickets…`);
      const found = await jiraFindQaEntries(data, p, rec, since);
      // Jira project shared by several Clair projects → keep only this project's tickets.
      const group = projects.filter(x => x.jira.site === p.jira.site && String(x.jira.projectId) === String(p.jira.projectId));
      const entries = found.entries.filter(e => jiraQaOwner(data, group, e.assignee) === p.id);
      sum.skipped += found.skipped.filter(a => jiraQaOwner(data, group, a) === p.id).length;
      sum.newQa += entries.length;
      // At most JIRA_QA_MAX_PER_TASK tickets per task (earliest Ready-for-QA first).
      entries.sort((a, b) => a.enteredAt - b.enteredAt || a.key.localeCompare(b.key, undefined, { numeric: true }));
      const chunks = [];
      for (let k = 0; k < entries.length; k += JIRA_QA_MAX_PER_TASK) chunks.push(entries.slice(k, k + JIRA_QA_MAX_PER_TASK));
      chunks.forEach((chunk, n) => {
        const part = chunks.length > 1 ? ` (${n + 1}/${chunks.length})` : '';
        const { created, taskId, batchId } = jiraCreateQaTask(data, p, chunk, trigger, runAt, part);
        if (created) {
          sum.tasks++;
          if (!sum.taskProjects.includes(p.name)) sum.taskProjects.push(p.name);
          qaEvents.push({ id: `qa:${batchId}`, type: 'qa-task', taskId, title: `QA task created: ${p.name}${part}`,
            body: `${chunk.length} ticket${chunk.length === 1 ? '' : 's'} ready for QA: ${chunk.map(e => e.key).join(', ')}` });
        }
      });
      // Advance only after this project's work is done; saved together with its task.
      jiraQaPut(data, { id: cpId, kind: 'checkpoint', projectId: p.id, link: linkSig, at: new Date(runAt).toISOString() });
      await save();
    } catch (e) {
      sum.failures.push({ project: p.name, error: jiraErrText(e) });
      try { await save(); } catch (e2) { /* the run summary below reports it */ }
    }
  }
  // Tickets closed or sent back directly in Jira complete their QA task too.
  const autoCompleted = jiraQaReconcile(data);
  sum.qaCompleted = autoCompleted.length;
  sum.finishedAt = new Date().toISOString();
  sum.ok = !sum.failures.length;
  const runs = (data.jiraQa || []).filter(r => r.kind === 'run').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 19);
  data.jiraQa = [...(data.jiraQa || []).filter(r => r.kind !== 'run'), sum, ...runs];
  await save();
  try { await notifyAdd(qaEvents); } catch (e) { /* the tasks exist; a missed notification is not fatal */ }
  return sum;
};

// Runs the pipeline unless another run (page or background) is in progress.
const jiraQaSyncLocked = (opts) => navigator.locks.request(JIRA_QA_LOCK, { ifAvailable: true }, async (lock) => {
  if (!lock) return { busy: true };
  // Start from the latest saved data (another context may have run a sync or saved since).
  if (opts.prepare) await opts.prepare();
  return jiraQaSync(opts);
});

// ─── Notifications (shared by the page and the background worker) ───
// Stored in chrome.storage.local (not the SQLite file), so the background watcher can
// add notifications while a Clair page is open without racing the page's whole-file
// saves; pages see new ones instantly through chrome.storage.onChanged. Every
// read-modify-write of the list holds the "clair-notify" Web Lock.
const NOTIFY_KEY = 'clairNotifications';           // [{ id, type, title, body, url, issueKey, taskId, author, at, read }], newest first
const NOTIFY_SETTINGS_KEY = 'clairNotifySettings';
const NOTIFY_WATCH_KEY = 'clairJiraWatch';          // watcher state: { lastPollAt, seen: [event ids] } (worker/page)
const NOTIFY_PROJECTS_KEY = 'clairJiraWatchProjects'; // [{ key, name }] linked Jira projects, written by the page
const NOTIFY_DEFAULTS = { sound: true, desktop: true, comments: true, status: true, updates: true, qaTasks: true, own: false };
const NOTIFY_MAX = 300;
const NOTIFY_TYPE_SETTING = { comment: 'comments', status: 'status', update: 'updates', 'qa-task': 'qaTasks' };
const hasChromeStorage = () => typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
const notifyLocked = (fn) => navigator.locks.request('clair-notify', fn);

const notifySettings = async () => {
  if (!hasChromeStorage()) return { ...NOTIFY_DEFAULTS };
  return { ...NOTIFY_DEFAULTS, ...((await chrome.storage.local.get(NOTIFY_SETTINGS_KEY))[NOTIFY_SETTINGS_KEY] || {}) };
};

// Adds notifications (skipping ids already present and types switched off in Settings),
// newest first, and shows desktop pop-ups when enabled. Returns the ones added.
const notifyAdd = async (items) => {
  if (!items.length || !hasChromeStorage()) return [];
  const st = await notifySettings();
  const wanted = items.filter(n => st[NOTIFY_TYPE_SETTING[n.type]] !== false);
  if (!wanted.length) return [];
  const fresh = await notifyLocked(async () => {
    const cur = (await chrome.storage.local.get(NOTIFY_KEY))[NOTIFY_KEY] || [];
    const have = new Set(cur.map(n => n.id));
    const add = wanted.filter(n => !have.has(n.id)).map(n => ({ read: false, at: new Date().toISOString(), ...n }))
      .sort((a, b) => b.at.localeCompare(a.at));
    if (add.length) await chrome.storage.local.set({ [NOTIFY_KEY]: [...add, ...cur].slice(0, NOTIFY_MAX) });
    return add;
  });
  if (fresh.length && st.desktop && chrome.notifications) {
    const icon = chrome.runtime.getURL('assets/icon128.png');
    const show = fresh.length > 4
      ? [{ id: `clair-batch-${Date.now()}`, title: `${fresh.length} new Clair notifications`, body: fresh.slice(0, 3).map(n => n.title).join('\n') }]
      : fresh;
    show.forEach(n => chrome.notifications.create(n.id, { type: 'basic', iconUrl: icon, title: n.title, message: n.body || '', priority: 1 }, () => void chrome.runtime.lastError));
  }
  return fresh;
};

// Applies `fn(list)` → new list to the stored notifications (mark read, clear …).
const notifyUpdate = (fn) => notifyLocked(async () => {
  const cur = (await chrome.storage.local.get(NOTIFY_KEY))[NOTIFY_KEY] || [];
  await chrome.storage.local.set({ [NOTIFY_KEY]: fn(cur) });
});

// Friendly field names for Jira changelog items.
const JIRA_FIELD_LABEL = { assignee: 'assignee', priority: 'priority', summary: 'summary', description: 'description', duedate: 'due date', labels: 'labels', resolution: 'resolution', Sprint: 'sprint', 'Fix Version': 'fix version', issuetype: 'type', reporter: 'reporter', Attachment: 'attachment', 'Story Points': 'story points' };
const JIRA_FIELD_IGNORE = new Set(['Rank', 'RemoteIssueLink', 'WorklogId', 'timeestimate', 'timeoriginalestimate', 'timespent', 'Workflow', 'Link']);

// One watcher run: tickets updated since the last run in every linked Jira project →
// comment / status / update notifications (your own changes skipped unless enabled).
// The first run only records the starting point, so nothing old floods in.
const jiraWatchPoll = async (opts = {}) => {
  if (!hasChromeStorage() || typeof ClairJira === 'undefined') return { skipped: 'unavailable' };
  const cfg = await ClairJira.getPublicConfig();
  if (!cfg || !cfg.hasToken) return { skipped: 'not connected' };
  const projects = (await chrome.storage.local.get(NOTIFY_PROJECTS_KEY))[NOTIFY_PROJECTS_KEY] || [];
  if (!projects.length) return { skipped: 'no linked projects' };
  const st = await notifySettings();
  const w = (await chrome.storage.local.get(NOTIFY_WATCH_KEY))[NOTIFY_WATCH_KEY] || {};
  const now = Date.now();
  const lookbackMs = (opts.lookbackMinutes || 0) * 60000;
  let since;
  if (!w.lastPollAt) {
    // Initial run: look back up to 24h (or specified lookback) so recent activity isn't discarded
    since = now - (lookbackMs || 24 * 60 * 60 * 1000);
  } else if (lookbackMs) {
    // Manual check or startup catch-up: look back at least lookbackMinutes
    since = Math.min(w.lastPollAt - 60000, now - lookbackMs);
  } else {
    since = w.lastPollAt - 60000; // periodic poll
  }
  const minutes = Math.min(7 * 24 * 60, Math.max(1, (now - since) / 60000 + 1));
  const issues = await ClairJira.searchUpdated({ projectKeys: projects.map(p => p.key), minutes });
  const seen = new Set(w.seen || []);
  const mine = (id) => !st.own && cfg.accountId && id === cfg.accountId;
  const events = [];
  for (const i of issues.slice(0, 60)) {
    const base = `jira:${cfg.site}:${i.id}`;
    if (st.status || st.updates) {
      for (const h of await ClairJira.getRecentHistory(i.id)) {
        if (jiraTime(h.created) < since || mine(h.authorId)) continue;
        const items = h.items.filter(it => !JIRA_FIELD_IGNORE.has(it.field));
        const statusItem = items.find(it => it.fieldId === 'status' || it.field === 'status');
        const assigneeItem = items.find(it => it.field === 'assignee');
        const others = items.filter(it => it !== statusItem && it !== assigneeItem);
        const at = new Date(jiraTime(h.created) || now).toISOString();
        if (statusItem) events.push({ id: `${base}:h:${h.id}:s`, type: 'status', at, issueKey: i.key, url: i.url, author: h.author,
          title: `${i.key} moved to ${statusItem.to}`, body: `${h.author}: ${statusItem.from || '—'} → ${statusItem.to} · ${i.summary}` });
        if (assigneeItem) events.push({ id: `${base}:h:${h.id}:a`, type: 'update', at, issueKey: i.key, url: i.url, author: h.author,
          title: assigneeItem.to ? `${i.key} assigned to ${assigneeItem.to}` : `${i.key} unassigned`, body: `${h.author} · ${i.summary}` });
        if (others.length) {
          const fields = [...new Set(others.map(it => JIRA_FIELD_LABEL[it.field] || String(it.field).toLowerCase()))];
          events.push({ id: `${base}:h:${h.id}:u`, type: 'update', at, issueKey: i.key, url: i.url, author: h.author,
            title: `${i.key} updated`, body: `${h.author} changed ${fields.join(', ')} · ${i.summary}` });
        }
      }
    }
    // A ticket created since the last check (it has no history yet).
    if (st.updates && jiraTime(i.created) >= since && !mine(i.creatorId)) {
      events.push({ id: `${base}:new`, type: 'update', at: new Date(jiraTime(i.created) || now).toISOString(), issueKey: i.key, url: i.url, author: i.creator,
        title: `New ticket ${i.key}`, body: `${i.creator || 'Someone'} created ${i.type ? `a ${i.type}` : 'it'}: ${i.summary}` });
    }
    if (st.comments) {
      for (const c of await ClairJira.getRecentComments(i.id)) {
        const text = String(c.text || '').replace(/\s+/g, ' ').trim();
        const short = text.length > 160 ? text.slice(0, 157) + '…' : (text || i.summary);
        if (jiraTime(c.created) >= since && !mine(c.authorId)) {
          events.push({ id: `${base}:c:${c.id}`, type: 'comment', at: new Date(jiraTime(c.created) || now).toISOString(), issueKey: i.key, url: i.url, author: c.author,
            title: `${c.author} commented on ${i.key}`, body: short });
        }
        // An existing comment edited since the last check (not just the edit right after posting).
        const edited = jiraTime(c.updated) - jiraTime(c.created) > 60000 && jiraTime(c.updated) >= since;
        if (edited && !mine(c.editorId || c.authorId)) {
          events.push({ id: `${base}:c:${c.id}:e:${jiraTime(c.updated)}`, type: 'comment', at: new Date(jiraTime(c.updated)).toISOString(), issueKey: i.key, url: i.url, author: c.editor || c.author,
            title: `${c.editor || c.author} edited a comment on ${i.key}`, body: short });
        }
      }
    }
  }
  const fresh = events.filter(e => !seen.has(e.id));
  const added = await notifyAdd(fresh);
  fresh.forEach(e => seen.add(e.id));
  await chrome.storage.local.set({ [NOTIFY_WATCH_KEY]: { lastPollAt: now, seen: [...seen].slice(-800) } });
  return { checked: issues.length, added: added.length };
};
const jiraWatchPollLocked = (opts) => navigator.locks.request('clair-jira-watch', { ifAvailable: true }, async (lock) => lock ? jiraWatchPoll(opts) : { busy: true });

// ─── QA checklist on "Ticket closing" tasks (shared by page and worker) ───
// Each ticket of an automatic QA task gets an outcome — verified (closed) or reopened —
// recorded in task.autoQa.outcomes[key] = { result, at, by: 'clair' | 'jira', note },
// with a line appended to the task's Work Done. When every ticket has an outcome the
// task is completed. Tickets handled directly in Jira are recognised from their current
// status (via the project's status mapping) whenever the ticket cache is refreshed.
const QA_CLOSED_CATS = ['done', 'wontdo', 'notapplicable'];       // counted as verified & closed
const QA_SENT_BACK_CATS = ['todo', 'inprogress', 'reopen', 'inreview']; // counted as reopened
const jiraQaTickets = (task) => (task.autoQa && task.autoQa.tickets && task.autoQa.tickets.length)
  ? task.autoQa.tickets
  : ((task.autoQa && task.autoQa.keys) || []).map(key => ({ key, summary: '', assignee: '', readyAt: '', url: '' }));
const jiraQaOutcome = (task, key) => (task.autoQa && task.autoQa.outcomes && task.autoQa.outcomes[key]) || null;

const jiraQaRecord = (data, task, key, result, by, note = '') => {
  if (jiraQaOutcome(task, key)) return false;
  const now = new Date().toISOString();
  task.autoQa = { ...task.autoQa, outcomes: { ...(task.autoQa.outcomes || {}), [key]: { result, at: now, by, note } } };
  const line = `${result === 'verified' ? '✓' : '↺'} ${key} — ${result === 'verified' ? 'Verified and closed' : 'Reopened'}${by === 'jira' ? ' in Jira' : ''} · ${jiraFmt(Date.now())}${note ? `\n   ${note}` : ''}`;
  task.workDone = task.workDone ? `${task.workDone}\n${line}` : line;
  task.updatedAt = now;
  return true;
};

const jiraQaMaybeComplete = (data, task) => {
  const tickets = jiraQaTickets(task);
  if (!tickets.length || task.status === 'Done' || !tickets.every(t => jiraQaOutcome(task, t.key))) return false;
  const now = new Date().toISOString();
  task.status = 'Done';
  task.completedDate = now;
  task.updatedAt = now;
  const v = tickets.filter(t => jiraQaOutcome(task, t.key).result === 'verified').length;
  data.activity = [{ id: Math.random().toString(36).slice(2, 10), text: `Completed task "${task.title}" — ${v} verified, ${tickets.length - v} reopened`, type: 'task', at: now }, ...(data.activity || [])].slice(0, 200);
  return true;
};

// Outcomes for tickets someone already closed or sent back in Jira. Returns completed tasks.
const jiraQaReconcile = (data) => {
  const completed = [];
  (data.tasks || []).forEach(task => {
    if (!task.autoQa || task.status === 'Done') return;
    const rec = (data.jiraSync || []).find(r => r.id === (task.projectIds || [])[0]);
    if (!rec) return;
    jiraQaTickets(task).forEach(t => {
      if (jiraQaOutcome(task, t.key)) return;
      const iss = rec.issues.find(i => i.key === t.key);
      if (!iss) return;
      const cat = jiraCategoryOf(rec, iss.statusId, iss.status);
      if (QA_CLOSED_CATS.includes(cat)) jiraQaRecord(data, task, t.key, 'verified', 'jira', `Jira status: ${iss.status}`);
      else if (QA_SENT_BACK_CATS.includes(cat)) jiraQaRecord(data, task, t.key, 'reopened', 'jira', `Jira status: ${iss.status}`);
    });
    if (jiraQaMaybeComplete(data, task)) completed.push(task);
  });
  return completed;
};

// QA comment templates (chrome.storage.local). Placeholders: {key} {summary} {developer} {project} {date}.
const QA_TEMPLATES_KEY = 'clairQaTemplates';
const QA_DEFAULT_TEMPLATES = [
  { id: 'verified-default', name: 'Verified and closed', kind: 'verified', text: 'Verified the fix for {key} — {summary}.\n\n- Tested the reported scenario; it now works as expected.\n- Checked the related flows for regressions.\n\n**QA verification completed and ticket closed.**' },
  { id: 'reopen-default', name: 'Reopen — still failing', kind: 'reopen', text: 'Reopening {key} — the issue still occurs.\n\n- Steps: \n- Expected: \n- Actual: \n\nPlease fix and move it back to Ready for QA.' }
];
const qaFillTemplate = (text, vars) => String(text || '').replace(/\{(key|summary|developer|project|date)\}/g, (m, k) => vars[k] != null ? vars[k] : m);

// Open QA tasks created before assignee routing may sit in the wrong Clair project when
// several Clair projects share one Jira project (e.g. CIMTrack / CIMTrack Dashboard).
// Moves each such task to the project its tickets belong to — or splits it, one task per
// project, when its tickets belong to different ones. Outcomes already recorded travel
// with their tickets. Idempotent: does nothing once every task is in the right place.
// Returns the number of tasks moved or created.
const jiraQaReroute = (data) => {
  let changed = 0;
  const linked = (data.projects || []).filter(p => p.jira && p.jira.projectKey);
  const devIdsFor = (tickets) => [...new Set(tickets.map(t => {
    const n = String(t.assignee || '').trim().toLowerCase();
    const d = n && (data.developers || []).find(x => (x.name || '').trim().toLowerCase() === n);
    return d ? d.id : null;
  }).filter(Boolean))];
  [...(data.tasks || [])].forEach(task => {
    // Each task is checked once (autoQa.routed), so a project you set by hand is never undone.
    if (!task.autoQa || task.autoQa.routed || task.status === 'Done') return;
    if (!(task.autoQa.tickets && task.autoQa.tickets.length)) return; // no assignee info to route by
    task.autoQa = { ...task.autoQa, routed: true };
    changed++;
    const cur = linked.find(p => p.id === (task.projectIds || [])[0]);
    if (!cur) return;
    const group = linked.filter(x => x.jira.site === cur.jira.site && String(x.jira.projectId) === String(cur.jira.projectId));
    if (group.length < 2) return;
    const tickets = jiraQaTickets(task);
    const ids = task.autoQa.issueIds || [];
    const byOwner = new Map();
    tickets.forEach((t, k) => {
      const owner = jiraQaOwner(data, group, t.assignee);
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push({ t, issueId: ids[k] });
    });
    if (byOwner.size === 1 && byOwner.has(cur.id)) return;
    const now = new Date().toISOString();
    const createdAt = Date.parse(task.createdAt) || Date.now();
    const split = byOwner.size > 1;
    [...byOwner].forEach(([ownerId, items], n) => {
      const owner = group.find(p => p.id === ownerId);
      const tks = items.map(x => x.t);
      const outcomes = Object.fromEntries(Object.entries(task.autoQa.outcomes || {}).filter(([key]) => tks.some(t => t.key === key)));
      const target = n === 0 ? task : { ...task, id: `${task.id}-${n}`, workDone: '', createdAt: now };
      target.projectIds = [ownerId];
      target.title = `Ticket closing - ${owner.name}`;
      target.developerIds = devIdsFor(tks);
      target.updatedAt = now;
      target.autoQa = { ...task.autoQa, routed: true, keys: tks.map(t => t.key), issueIds: items.map(x => x.issueId).filter(Boolean), tickets: tks, outcomes,
        batchId: n === 0 ? task.autoQa.batchId : `${task.autoQa.batchId}-${n}` };
      if (split) target.description = jiraQaDescription({ projectKey: owner.jira.projectKey, tickets: tks, trigger: task.autoQa.trigger, at: jiraFmt(createdAt) });
      if (n > 0) data.tasks = [target, ...data.tasks];
      // Keep the processed-ticket records pointing at the right task and project.
      (data.jiraQa || []).forEach(r => { if (r.kind === 'issue' && r.taskId === task.id && tks.some(t => t.key === r.key)) { r.taskId = target.id; r.projectId = ownerId; } });
      changed++;
    });
    data.activity = [{ id: Math.random().toString(36).slice(2, 10), text: split ? `Split QA task "${task.title}" by project (${[...byOwner.keys()].map(id => group.find(p => p.id === id).name).join(', ')})` : `Moved QA task to ${group.find(p => p.id === [...byOwner.keys()][0]).name}`, type: 'task', at: now }, ...(data.activity || [])].slice(0, 200);
  });
  return changed;
};
