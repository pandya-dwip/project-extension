// jiracore.js — Jira logic shared by the Clair page (app.js) and the background worker:
// status categories and automatic status mapping, and the Jira sync / automatic QA task
// pipeline. Loaded as a classic script (top-level names are shared with app.js).
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
  ['qa', ['ready for qa', 'qa', 'in qa', 'qa review', 'ready for test', 'ready for testing', 'ready to test', 'testing', 'in test', 'in testing', 'uat', 'to verify', 'verify', 'verification']],
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
const JIRA_QA_SLOTS = [9, 11, 13, 15, 17];  // local hours of the scheduled runs
const JIRA_QA_END_HOUR = 18;                // operating window 9:00–18:00
const JIRA_QA_TAG = 'Auto Task Creation';
const JIRA_QA_LOCK = 'clair-jira-qa-sync';
const JIRA_QA_SKEW_MS = 10 * 60 * 1000;     // overlap between checkpoints (clock skew); duplicates are filtered

const jiraTime = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || 0; // Jira: …+0530

// Latest scheduled slot today that is due (≤ now, inside the window) and not done yet.
const jiraQaDueSlot = (now, lastSlotMs) => {
  if (now.getHours() >= JIRA_QA_END_HOUR) return 0;
  let due = 0;
  JIRA_QA_SLOTS.forEach(h => { const d = new Date(now); d.setHours(h, 0, 0, 0); if (d <= now) due = d.getTime(); });
  return due && due > (lastSlotMs || 0) ? due : 0;
};
const jiraQaNextSlot = (from = new Date()) => {
  for (let add = 0; add < 3; add++) {
    for (const h of JIRA_QA_SLOTS) {
      const d = new Date(from); d.setDate(d.getDate() + add); d.setHours(h, 0, 0, 0);
      if (d > from) return d.getTime();
    }
  }
  return from.getTime() + 86400000;
};

const jiraQaRec = (data, id) => (data.jiraQa || []).find(r => r.id === id);
const jiraQaPut = (data, rec) => { data.jiraQa = [...(data.jiraQa || []).filter(r => r.id !== rec.id), rec]; };
const jiraHash = (s) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const jiraLocalDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const jiraFmt = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  let skipped = 0;
  for (const i of rec.issues.filter(x => jiraTime(x.updated) >= from)) {
    const changes = await ClairJira.getStatusChanges(i.id);
    const entries = changes.filter(c => jiraTime(c.created) >= from && jiraCategoryOf(rec, c.toId, c.toName) === 'qa');
    if (!entries.length) continue;
    if (jiraQaRec(data, `issue:${rec.site}|${i.id}`)) { skipped++; continue; } // already produced a QA task
    const first = entries[0]; // earliest entry in this window (changelog is oldest first)
    out.push({
      eventId: `${rec.site}|${i.id}|${first.historyId}`, issueId: i.id, key: i.key, summary: i.summary,
      assignee: i.assignee || '', url: i.url, enteredAt: jiraTime(first.created), status: first.toName
    });
  }
  return { entries: out, skipped };
};

// Create (or recognise) the consolidated task for one project's batch. Returns the task id.
const jiraCreateQaTask = (data, project, entries, trigger, runAt) => {
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
    const lines = entries.map((e, k) => [
      `${k + 1}. ${e.key} — ${e.summary}`,
      `   Assignee: ${e.assignee || 'Unassigned'}`,
      `   Entered Ready for QA: ${jiraFmt(e.enteredAt)}`,
      `   ${e.url}`
    ].join('\n'));
    const now = new Date().toISOString();
    taskId = `qa${jiraHash(batchId + now)}${Math.random().toString(36).slice(2, 6)}`;
    data.tasks = [{
      id: taskId,
      title: `Ticket closing - ${project.name}`,
      description: `${entries.length} Jira ticket${entries.length === 1 ? '' : 's'} moved to Ready for QA (${project.jira.projectKey}), found by the ${trigger === 'scheduled' ? 'scheduled' : 'manual'} Jira sync on ${jiraFmt(runAt)}:\n\n${lines.join('\n\n')}`,
      workDone: '', tags: [JIRA_QA_TAG],
      startDate: jiraLocalDate(start), endDate: jiraLocalDate(start + 2 * 86400000),
      status: 'To-Do', priority: 'Medium', projectIds: [project.id], developerIds: devIds,
      completedDate: null, createdAt: now, updatedAt: now,
      autoQa: { batchId, issueIds: entries.map(e => e.issueId), keys: entries.map(e => e.key), trigger }
    }, ...(data.tasks || [])];
    data.activity = [{ id: Math.random().toString(36).slice(2, 10), text: `Added task "Ticket closing - ${project.name}" (${entries.length} Ready for QA ticket${entries.length === 1 ? '' : 's'} from Jira)`, type: 'task', at: now }, ...(data.activity || [])].slice(0, 200);
    created = true;
  }
  jiraQaPut(data, { id: `batch:${batchId}`, kind: 'batch', batchId, projectId: project.id, taskId, eventIds, createdAt: new Date().toISOString() });
  entries.forEach(e => jiraQaPut(data, { id: `issue:${e.eventId.split('|').slice(0, 2).join('|')}`, kind: 'issue', issueId: e.issueId, key: e.key, projectId: project.id, eventId: e.eventId, enteredAt: new Date(e.enteredAt).toISOString(), taskId, batchId, processedAt: new Date().toISOString() }));
  return { taskId, created };
};

// The pipeline. `data` holds the app collections (the page's state, or a loaded DB in the
// worker); `save` persists them. Returns the run summary (also stored in jiraQa).
const jiraQaSync = async ({ data, trigger, save, onProgress = () => {} }) => {
  const runAt = Date.now();
  const projects = (data.projects || []).filter(p => p.jira && p.jira.projectKey);
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
      const { entries, skipped } = await jiraFindQaEntries(data, p, rec, since);
      sum.skipped += skipped;
      sum.newQa += entries.length;
      if (entries.length) {
        const { created } = jiraCreateQaTask(data, p, entries, trigger, runAt);
        if (created) { sum.tasks++; sum.taskProjects.push(p.name); }
      }
      // Advance only after this project's work is done; saved together with its task.
      jiraQaPut(data, { id: cpId, kind: 'checkpoint', projectId: p.id, link: linkSig, at: new Date(runAt).toISOString() });
      await save();
    } catch (e) {
      sum.failures.push({ project: p.name, error: jiraErrText(e) });
      try { await save(); } catch (e2) { /* the run summary below reports it */ }
    }
  }
  sum.finishedAt = new Date().toISOString();
  sum.ok = !sum.failures.length;
  const runs = (data.jiraQa || []).filter(r => r.kind === 'run').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 19);
  data.jiraQa = [...(data.jiraQa || []).filter(r => r.kind !== 'run'), sum, ...runs];
  await save();
  return sum;
};

// Runs the pipeline unless another run (page or background) is in progress.
const jiraQaSyncLocked = (opts) => navigator.locks.request(JIRA_QA_LOCK, { ifAvailable: true }, async (lock) => {
  if (!lock) return { busy: true };
  // Start from the latest saved data (another context may have run a sync or saved since).
  if (opts.prepare) await opts.prepare();
  return jiraQaSync(opts);
});
