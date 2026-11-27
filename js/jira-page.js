// Clair — js/jira-page.js: Jira page: dashboard, Sync Now card, ticket panel (status, comments, Sync to Jira).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Jira dashboard (Jira page) ──────────────────────────
// Overview of every Clair project linked to Jira, plus a per-project ticket table.
// Data comes from a local cache (state.jiraSync, SQLite table "jiraSync"): one record
// per linked Clair project with the last complete fetch of its issues, the project's
// Jira statuses, and the user's status-mapping overrides. "Refresh from Jira" replaces
// the issues only after a complete fetch; a failed refresh keeps the previous cache.
const JIRA_CAT_COLOR = { ...Object.fromEntries(JIRA_CATS.map(k => [k.key, k.color])), unmapped: 'var(--danger)' };
const jiraEmptyCounts = () => ({ total: 0, ...Object.fromEntries(JIRA_CATS.map(k => [k.key, 0])), unmapped: 0 });
const jiraSyncInFlight = new Map(); // clair projectId -> promise (no overlapping syncs)
const jiraSyncProgress = {};        // clair projectId -> tickets fetched so far (UI only)


const jiraAllLinkedProjects = () => state.projects.filter(p => p.jira && p.jira.projectKey);
const jiraLinkedProjects = () => state.projects.filter(p => p.jira && p.jira.projectKey && !p.jira.hiddenFromBoard);
// The cache for a project, only if it belongs to the project's current Jira link.
const jiraRecordFor = (p) => {
  const r = (state.jiraSync || []).find(x => x.id === p.id);
  return r && r.site === p.jira.site && String(r.jiraProjectId) === String(p.jira.projectId) ? r : null;
};
const jiraCounts = (rec) => {
  const c = jiraEmptyCounts();
  (rec ? rec.issues : []).forEach(i => { c.total++; const k = jiraCategoryOf(rec, i.statusId, i.status); c[k in c ? k : 'unmapped']++; });
  return c;
};
const jiraWhen = (iso) => iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '';

// Fetch every issue of a linked project and replace its cache — only after success.
const syncJiraProject = (projectId) => {
  if (jiraSyncInFlight.has(projectId)) return jiraSyncInFlight.get(projectId);
  const p = state.projects.find(x => x.id === projectId);
  if (!p || !p.jira || !jiraConnected()) return Promise.resolve();
  const run = (async () => {
    jiraSyncProgress[projectId] = 0;
    try {
      const rec = await jiraRefreshProjectCache(state, p, (n) => {
        jiraSyncProgress[projectId] = n;
        const el = document.querySelector(`[data-jira-progress="${projectId}"]`);
        if (el) el.textContent = `Fetching… ${n} tickets`;
      });
      const qaDone = jiraQaReconcile(state);
      await storage.save();
      showToast(`${p.name}: ${rec.issues.length} Jira tickets synced${qaDone.length ? ` · ${qaDone.length} QA task${qaDone.length === 1 ? '' : 's'} completed` : ''}`);
    } catch (e) {
      // The previous cache is kept; the error is recorded on it.
      await storage.save();
      showToast(`${p.name}: Jira refresh failed — ${jiraErrorText(e)}`, 'error');
    } finally {
      delete jiraSyncProgress[projectId];
      jiraSyncInFlight.delete(projectId);
      if (state.view === 'jira') render();
    }
  })();
  jiraSyncInFlight.set(projectId, run);
  if (state.view === 'jira') render(); // after the lock is set, so the busy state shows
  return run;
};
// ─── Sync Now / scheduled Jira sync (runs the shared pipeline from jiracore.js) ───
// The background worker hands scheduled runs to an open Clair page, so the page's
// in-memory state stays the single writer; with no page open it runs them itself.
let jiraQaRunning = false;
let jiraQaProgressText = '';
const runJiraQaSync = async (trigger, opts = {}) => {
  if (jiraQaRunning || !jiraAvailable() || !jiraConnected()) return null;
  jiraQaRunning = true;
  jiraQaProgressText = 'Starting…';
  if (state.view === 'jira') render();
  let res = null;
  try {
    res = await jiraQaSyncLocked({
      data: state, trigger, save: () => storage.save(),
      // Pick up what another context (the background worker, another tab) saved meanwhile.
      prepare: async () => {
        await ClairDB.reload();
        const d = await storage.load();
        state.projects = d.projects;
        state.tasks = migrateTasks(d.tasks);
        state.activity = d.activity;
        state.developers = d.developers || [];
        state.jiraSync = d.jiraSync || [];
        state.jiraQa = d.jiraQa || [];
      },
      onProgress: (t) => {
        jiraQaProgressText = t;
        const el = document.getElementById('jiraQaProgress');
        if (el) el.textContent = t;
      }
    });
    if (!opts.silentToast) {
      if (res && res.busy) showToast('A Jira sync is already running', 'error');
      else if (res) {
        showToast(res.ok
          ? `Jira sync done: ${res.newQa} new Ready for QA ticket${res.newQa === 1 ? '' : 's'}, ${res.tasks} task${res.tasks === 1 ? '' : 's'} created${res.qaCompleted ? `, ${res.qaCompleted} completed` : ''}`
          : `Jira sync finished with ${res.failures.length} failure${res.failures.length === 1 ? '' : 's'}`, res.ok ? 'success' : 'error');
      }
    }
  } catch (e) {
    if (!opts.silentToast) showToast(`Jira sync failed — ${jiraErrorText(e)}`, 'error');
    else console.warn('Jira sync failed:', e);
  } finally {
    jiraQaRunning = false;
    jiraQaProgressText = '';
    render();
  }
  return res;
};
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'clair-jira-qa-sync') return;
    if (!jiraConnected() || jiraQaRunning) { sendResponse({ handled: jiraQaRunning }); return; }
    sendResponse({ handled: true });
    runJiraQaSync(msg.trigger === 'scheduled' ? 'scheduled' : 'manual');
  });
}

// Summary card for the Jira page: last run, schedule, progress.
const jiraQaRuns = () => (state.jiraQa || []).filter(r => r.kind === 'run').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
const renderJiraQaCard = (connected) => {
  const runs = jiraQaRuns();
  const last = runs[0];
  const lastOk = runs.find(r => r.ok);
  const nextAt = jiraQaNextSlot(new Date());
  const trig = (r) => r.trigger === 'scheduled' ? 'Scheduled' : 'Manual';
  const body = jiraQaRunning
    ? `<div class="jd-qa-progress"><span class="jd-qa-spinner" aria-hidden="true"></span><span id="jiraQaProgress">${escapeHtml(jiraQaProgressText)}</span></div>`
    : last ? `
      <div class="jd-qa-stats">
        <div><strong>${last.synced}/${last.projects}</strong><span>Projects synced</span></div>
        <div><strong>${last.tickets}</strong><span>Tickets fetched</span></div>
        <div><strong>${last.newQa}</strong><span>New Ready for QA</span></div>
        <div><strong>${last.tasks}</strong><span>QA tasks created</span></div>
        <div><strong>${last.skipped}</strong><span>Already processed</span></div>
      </div>
      ${last.taskProjects.length ? `<div class="jd-qa-line">Tasks created for: <strong>${last.taskProjects.map(escapeHtml).join(', ')}</strong></div>` : ''}
      ${last.failures.length ? `<div class="jd-qa-fail">${last.failures.map(f => `<div><strong>${escapeHtml(f.project)}</strong> — ${escapeHtml(f.error)} <em>(will be retried on the next sync)</em></div>`).join('')}</div>` : ''}`
    : '<div class="jd-qa-line">No sync yet. Click Sync Now to fetch tickets and create QA tasks for tickets that moved to Ready for QA.</div>';
  return `
    <section class="tco-card jd-qa">
      <div class="jd-qa-head">
        <div>
          <h3 class="tco-card-title">Jira sync &amp; QA tasks</h3>
          <p class="jd-qa-sub">Automatic sync every day at 9:30 AM, 11:30 AM, 1:30 PM, 3:30 PM and 5:30 PM · next ${jiraWhen(new Date(nextAt).toISOString())}.
            Tickets that move to <strong>Ready for QA</strong> become one “Ticket closing” task per project.</p>
          ${last && !jiraQaRunning ? `<p class="jd-qa-sub">Last run: ${trig(last)}, ${jiraWhen(last.finishedAt || last.startedAt)} — <span class="${last.ok ? 'jd-qa-ok' : 'jd-qa-bad'}">${last.ok ? 'completed' : 'completed with failures'}</span>${lastOk && lastOk !== last ? ` · last fully successful: ${jiraWhen(lastOk.finishedAt)}` : ''}</p>` : ''}
        </div>
        <span class="jd-qa-btns"><button type="button" class="btn-ghost st-btn" data-action="open-qa-report">Weekly QA report</button>
        <button type="button" class="btn-primary st-btn" data-action="jira-sync-now" ${!connected || jiraQaRunning ? 'disabled' : ''}>${JD_I.refresh}${jiraQaRunning ? 'Syncing…' : 'Sync Now'}</button></span>
      </div>
      ${body}
    </section>`;
};

const jiraSyncStatusHtml = (p, rec) => {
  if (jiraSyncInFlight.has(p.id)) return `<span class="jd-sync busy" data-jira-progress="${p.id}">Fetching… ${jiraSyncProgress[p.id] || 0} tickets</span>`;
  const synced = rec && rec.syncedAt ? `<span class="jd-sync">Last synced ${jiraWhen(rec.syncedAt)}</span>` : '<span class="jd-sync never">Never synced</span>';
  const failed = (state.jiraSync || []).find(x => x.id === p.id);
  const err = failed && failed.lastError && (!rec || !rec.syncedAt || failed.lastErrorAt > rec.syncedAt)
    ? `<span class="jd-sync error" title="${escapeHtml(failed.lastError)}">Last refresh failed ${jiraWhen(failed.lastErrorAt)}${rec && rec.syncedAt ? ' — showing the previous sync' : ''}</span>` : '';
  return synced + err;
};
const jiraCatBar = (c) => `<span class="dbx-stackbar">${Object.keys(JIRA_CAT_COLOR).filter(k => c[k]).map(k => `<span style="flex:${c[k]};--c:${JIRA_CAT_COLOR[k]}" title="${JIRA_CAT_LABEL[k]}: ${c[k]}"></span>`).join('')}</span>`;
const JD_I = {
  jira: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 12l10 10 10-10L12 2z"/><path d="M12 8l-4 4 4 4 4-4-4-4z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l3 3-3 3"/></svg>'
};

const renderJiraPage = () => {
  const allLinked = jiraAllLinkedProjects();
  const linked = jiraLinkedProjects();
  const hiddenCount = allLinked.length - linked.length;
  if (state.jiraProjectId) {
    const p = allLinked.find(x => x.id === state.jiraProjectId);
    if (p) return renderJiraDetails(p);
    state.jiraProjectId = null;
  }
  const connected = jiraAvailable() && jiraConnected();
  const notice = !jiraAvailable() ? 'The Jira page is available in the installed extension only.'
    : !connected ? 'Jira isn’t connected, so tickets can’t be refreshed. Cached data (if any) is shown below. Connect in Settings → Integrations.' : '';
  const recs = linked.map(p => ({ p, rec: jiraRecordFor(p) }));
  const sum = jiraEmptyCounts();
  recs.forEach(({ rec }) => { const c = jiraCounts(rec); Object.keys(sum).forEach(k => { sum[k] += c[k]; }); });

  const card = ({ p, rec }) => {
    const c = jiraCounts(rec);
    return `
      <div class="jd-card" data-id="${p.id}">
        <div class="jd-card-top">
          <div class="jd-card-names">
            <span class="jd-card-title">${escapeHtml(p.name)}</span>
            <span class="jd-card-sub"><span class="jira-key">${escapeHtml(p.jira.projectKey)}</span>${escapeHtml(p.jira.projectName)}</span>
          </div>
          <span class="jd-total"><strong>${c.total}</strong><em>tickets</em></span>
        </div>
        ${jiraCatBar(c)}
        <div class="jd-cats">
          ${JIRA_CATS.filter(k => k.core || c[k.key]).map(k => `<span class="jd-cat" style="--c:${k.color}" title="${k.label}: ${c[k.key]}"><strong>${c[k.key]}</strong><em>${k.short || k.label}</em></span>`).join('')}
        </div>
        ${c.unmapped ? `<button type="button" class="jd-unmapped" data-action="jira-open-mapping" data-id="${p.id}">${c.unmapped} ticket${c.unmapped === 1 ? '' : 's'} with unmapped statuses — map them</button>` : ''}
        <div class="jd-card-foot">
          <div class="jd-card-sync">${jiraSyncStatusHtml(p, rec)}</div>
          <div class="jd-card-actions">
            <button type="button" class="btn-ghost st-btn" data-action="jira-hide-project" data-id="${p.id}" title="Remove project from Jira board display and exclude from sync" style="color:var(--text-muted);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:3px;"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Remove Display
            </button>
            <button type="button" class="btn-ghost st-btn" data-action="jira-refresh" data-id="${p.id}" ${!connected || jiraSyncInFlight.has(p.id) ? 'disabled' : ''}>${JD_I.refresh}Refresh</button>
            <button type="button" class="btn-primary st-btn" data-action="jira-view" data-id="${p.id}">View Details</button>
          </div>
        </div>
      </div>`;
  };
  const anyBusy = linked.some(p => jiraSyncInFlight.has(p.id));

  return `
    <div class="tc-page">
      <section class="rpa-hero">
        <div class="rpa-hero-main">
          <span class="rpa-hero-icon">${JD_I.jira}</span>
          <div>
            <h2 class="rpa-hero-title">Jira</h2>
            <p class="rpa-hero-sub">Tickets of every Clair project linked to a Jira project.</p>
          </div>
        </div>
        <div class="rpa-hero-stats">
          <div class="rpa-hstat"><strong>${linked.length}</strong><span>Projects</span></div>
          <div class="rpa-hstat"><strong>${sum.total}</strong><span>Tickets</span></div>
          ${JIRA_CATS.filter(k => k.core || sum[k.key]).map(k => `<div class="rpa-hstat" title="${k.label}"><strong${k.key === 'inprogress' ? ' class="warn"' : k.key === 'done' ? ' class="ok"' : ''}>${sum[k.key]}</strong><span>${k.short || k.label}</span></div>`).join('')}
        </div>
      </section>
      ${notice ? `<div class="jd-notice">${escapeHtml(notice)}${jiraAvailable() && !connected ? ` <button type="button" class="rpa-link" data-action="jira-go-settings">Open Settings</button>` : ''}</div>` : ''}
      ${allLinked.length ? renderJiraQaCard(connected) : ''}
      ${allLinked.length ? `
        <div class="rpa-toolbar">
          <span class="rpa-showing">Showing ${linked.length} of ${allLinked.length} linked project${allLinked.length === 1 ? '' : 's'}${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''} · counts use each project’s status mapping</span>
          <div class="rpa-toolbar-right">
            <button type="button" class="btn-primary st-btn" data-action="jira-display-projects" title="Select which Jira projects to display and sync on the board">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Display Projects${hiddenCount > 0 ? ` (${hiddenCount})` : ''}
            </button>
          </div>
        </div>` : ''}
      ${linked.length ? `
        <div class="jd-grid">${recs.map(card).join('')}</div>` : allLinked.length ? `
        <div class="rpa-empty">
          <span class="rpa-empty-icon">${JD_I.jira}</span>
          <h3>All Jira projects are hidden from display</h3>
          <p>You have ${allLinked.length} project${allLinked.length === 1 ? '' : 's'} linked to Jira, but all are currently removed from board display and sync.</p>
          <button type="button" class="btn-primary" data-action="jira-display-projects" style="margin-top:12px;">Display Projects</button>
        </div>` : `
        <div class="rpa-empty">
          <span class="rpa-empty-icon">${JD_I.jira}</span>
          <h3>No projects linked to Jira</h3>
          <p>Open a project’s Edit form and pick its Jira project under “Jira Project”. Linked projects appear here.</p>
        </div>`}
    </div>`;
};

const renderJiraDetails = (p) => {
  const rec = jiraRecordFor(p);
  const connected = jiraAvailable() && jiraConnected();
  const c = jiraCounts(rec);
  const f = state.jiraFilters || (state.jiraFilters = { q: '', cat: '', type: '', assignee: '', sort: 'key-desc', page: 1, size: 25 });
  const issues = rec ? rec.issues.map(i => ({ ...i, cat: jiraCategoryOf(rec, i.statusId, i.status) })) : [];
  const types = [...new Set(issues.map(i => i.type))].sort();
  const assignees = [...new Set(issues.map(i => i.assignee || ''))].sort((a, b) => (a || '~').localeCompare(b || '~'));
  const q = f.q.trim().toLowerCase();
  const PRIO = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
  const prioRank = (s) => (s && PRIO[s.toLowerCase()] !== undefined ? PRIO[s.toLowerCase()] : 5);
  const keyNum = (k) => { const m = /-(\d+)$/.exec(k); return m ? +m[1] : 0; };
  // Search/type/assignee narrow everything below, including the counts; the category chip
  // then picks within that (so the other chips still show what they'd select).
  const base = issues.filter(i =>
    (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) &&
    (!f.type || i.type === f.type) &&
    (f.assignee === '' || (f.assignee === '__none__' ? !i.assignee : i.assignee === f.assignee)));
  const narrowed = base.length !== issues.length;
  const fc = jiraEmptyCounts();
  base.forEach(i => { fc.total++; fc[i.cat]++; });
  let list = base.filter(i => !f.cat || i.cat === f.cat);
  const sorters = {
    'updated-desc': (a, b) => (b.updated || '').localeCompare(a.updated || ''),
    'updated-asc': (a, b) => (a.updated || '').localeCompare(b.updated || ''),
    'priority': (a, b) => prioRank(a.priority) - prioRank(b.priority) || (b.updated || '').localeCompare(a.updated || ''),
    'key-asc': (a, b) => keyNum(a.key) - keyNum(b.key),
    'key-desc': (a, b) => keyNum(b.key) - keyNum(a.key)
  };
  list.sort(sorters[f.sort] || sorters['key-desc']);
  const pages = Math.max(1, Math.ceil(list.length / f.size));
  if (f.page > pages) f.page = pages;
  if (f.page < 1) f.page = 1;
  const start = (f.page - 1) * f.size;
  const paged = list.slice(start, start + f.size);

  const kpi = (n, l, cls = '') => `<div class="po-stat ${cls}"><span class="po-stat-num">${n}</span><span class="po-stat-label">${l}</span></div>`;
  const chip = (v, l, n) => `<button type="button" class="rpa-chip jd-chip ${v || 'all'} ${f.cat === v ? 'active' : ''}" data-action="jira-cat" data-cat="${v}">${l} <span>${n}</span></button>`;

  // Status mapping panel.
  const statusCounts = {};
  issues.forEach(i => { statusCounts[i.statusId] = (statusCounts[i.statusId] || 0) + 1; });
  const statuses = rec ? [...rec.statuses].sort((a, b) => (statusCounts[b.id] || 0) - (statusCounts[a.id] || 0) || a.name.localeCompare(b.name)) : [];
  const JIRA_CAT_HINT = { new: 'To Do', indeterminate: 'In Progress', done: 'Done' };
  const mappingHtml = state.jiraMappingOpen ? `
    <section class="tco-card jd-mapping" id="jiraMapping">
      <div class="tco-card-head">
        <h3 class="tco-card-title">Status mapping <span class="rpa-group-count">${statuses.length}</span></h3>
        <div class="jd-mapping-actions">
          ${Object.values(rec ? rec.statusMap : {}).some(jiraIsCat) ? '<button type="button" class="btn-ghost st-btn" data-action="jira-map-reset">Reset all to Automatic</button>' : ''}
          <button type="button" class="btn-ghost st-btn" data-action="jira-close-mapping">Done</button>
        </div>
      </div>
      <p class="jd-mapping-help">Choose which Clair category each Jira status in ${escapeHtml(p.jira.projectKey)} counts as. “Automatic” matches common status names (re-checked on every refresh); statuses it can’t recognise stay <strong>Unmapped</strong> until you choose. Your manual choices are kept and saved for this project only.</p>
      ${statuses.length ? `<div class="jd-map-list">
        ${statuses.map(s => {
          const o = jiraIsCat(rec.statusMap[s.id]) ? rec.statusMap[s.id] : '';
          const auto = jiraAutoCategory(s.name);
          return `
            <div class="jd-map-row">
              <span class="jd-map-name">${escapeHtml(s.name)}</span>
              <span class="jd-map-hint">${s.category && JIRA_CAT_HINT[s.category] ? `Jira category: ${JIRA_CAT_HINT[s.category]}` : ''}</span>
              <span class="jd-map-n">${statusCounts[s.id] || 0} ticket${statusCounts[s.id] === 1 ? '' : 's'}</span>
              <select class="filter-select jd-map-select" data-jira-map="${escapeHtml(s.id)}" aria-label="Category for ${escapeHtml(s.name)}">
                <option value="" ${!o ? 'selected' : ''}>Automatic — ${auto ? JIRA_CAT_LABEL[auto] : 'Unmapped'}</option>
                ${JIRA_CATS.map(k => `<option value="${k.key}" ${o === k.key ? 'selected' : ''}>${k.label}</option>`).join('')}
              </select>
            </div>`;
        }).join('')}
      </div>` : '<div class="dbx-empty">Refresh from Jira to load this project’s statuses.</div>'}
    </section>` : '';

  const catPill = (cat) => `<span class="jd-pill" style="--c:${JIRA_CAT_COLOR[cat]}">${JIRA_CAT_LABEL[cat]}</span>`;
  const rowsHtml = paged.map((i, idx) => {
    const open = state.jiraIssueOpen === i.id;
    const np = jiraPendingCount(jiraPendingFor(i.id));
    return `
    <tr class="jd-row ${open ? 'jd-row-open' : ''}" data-action="jira-issue" data-issue="${escapeHtml(i.id)}" tabindex="0" aria-expanded="${open}" title="${open ? 'Hide' : 'Show'} status and comments">
      <td class="jd-idx">${start + idx + 1}</td>
      <td class="jd-nowrap"><span class="jd-key">${escapeHtml(i.key)}</span>${np ? `<span class="jd-pending-tag" title="${np} change${np === 1 ? '' : 's'} not yet synced to Jira">Pending</span>` : ''}</td>
      <td class="jd-summary">${escapeHtml(i.summary)}</td>
      <td class="jd-nowrap">${escapeHtml(i.type)}</td>
      <td class="jd-nowrap">${escapeHtml(i.status)}</td>
      <td>${catPill(i.cat)}</td>
      <td class="jd-nowrap">${i.assignee ? escapeHtml(i.assignee) : '<span class="po-muted">Unassigned</span>'}</td>
      <td class="jd-nowrap">${escapeHtml(i.priority || '—')}</td>
      <td class="jd-nowrap" title="${escapeHtml(i.updated)}">${i.updated ? fmtDate(i.updated) : '—'}</td>
      <td><a class="icon-btn jd-open" href="${escapeHtml(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(i.key)} in Jira" title="Open in Jira">${JD_I.ext}</a></td>
    </tr>${open ? renderJiraIssuePanel(p, rec, i) : ''}`;
  }).join('');

  return `
    <div class="tc-page">
      ${tcCrumbs([{ label: 'Jira', action: 'jira-home' }, { label: escapeHtml(p.name) }])}
      <section class="tco-head">
        <div class="tco-head-main">
          <h2><span class="jira-key jd-head-key">${escapeHtml(p.jira.projectKey)}</span>${escapeHtml(p.jira.projectName)}</h2>
          <p>${escapeHtml(p.name)} · <span class="jd-head-sync">${jiraSyncStatusHtml(p, rec)}</span></p>
        </div>
        <div class="tco-head-actions">
          <a class="btn-ghost st-btn" href="${escapeHtml(`${p.jira.site}/browse/${p.jira.projectKey}`)}" target="_blank" rel="noopener noreferrer">${JD_I.ext}Open in Jira</a>
          <button type="button" class="btn-ghost st-btn ${state.jiraMappingOpen ? 'tcs-on' : ''}" data-action="${state.jiraMappingOpen ? 'jira-close-mapping' : 'jira-open-mapping'}" data-id="${p.id}">${JD_I.map}Status mapping${c.unmapped ? ` <span class="jd-badge">${c.unmapped}</span>` : ''}</button>
          <button type="button" class="btn-primary st-btn" data-action="jira-refresh" data-id="${p.id}" ${!connected || jiraSyncInFlight.has(p.id) ? 'disabled' : ''}>${JD_I.refresh}Refresh from Jira</button>
        </div>
      </section>
      ${!connected && jiraAvailable() ? `<div class="jd-notice">Jira isn’t connected, so this data can’t be refreshed. <button type="button" class="rpa-link" data-action="jira-go-settings">Open Settings</button></div>` : ''}
      <div class="po-stats jd-kpis">
        ${kpi(fc.total, narrowed ? `Matching tickets (of ${c.total})` : 'Total tickets')}
        ${JIRA_CATS.map(k => `<div class="po-stat" style="--tone:${k.color}"><span class="po-stat-num">${fc[k.key]}</span><span class="po-stat-label">${k.label}</span></div>`).join('')}
        ${fc.unmapped ? kpi(fc.unmapped, 'Unmapped', 'tone-fail') : ''}
      </div>
      ${mappingHtml}
      ${!rec || !rec.syncedAt ? `
        <div class="rpa-empty">
          <span class="rpa-empty-icon">${JD_I.jira}</span>
          <h3>No tickets loaded yet</h3>
          <p>${connected ? 'Click “Refresh from Jira” to fetch every ticket in this project.' : 'Connect Jira in Settings → Integrations, then refresh.'}</p>
        </div>` : `
        <div class="tcs-main">
          <div class="tcs-toolbar">
            <div class="page-search-wrap tcs-search">
              <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" class="page-search-input" id="jiraTicketSearch" placeholder="Search key or summary…" value="${escapeHtml(f.q)}" />
            </div>
            <select class="filter-select" data-jira-filter="type" aria-label="Issue type">
              <option value="">All issue types</option>
              ${types.map(t => `<option value="${escapeHtml(t)}" ${f.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
            <select class="filter-select" data-jira-filter="assignee" aria-label="Assignee">
              <option value="">All assignees</option>
              ${assignees.map(a => `<option value="${a ? escapeHtml(a) : '__none__'}" ${f.assignee === (a || '__none__') ? 'selected' : ''}>${a ? escapeHtml(a) : 'Unassigned'}</option>`).join('')}
            </select>
            <select class="filter-select" data-jira-filter="sort" aria-label="Sort">
              <option value="key-desc" ${f.sort === 'key-desc' ? 'selected' : ''}>Newest tickets first</option>
              <option value="updated-desc" ${f.sort === 'updated-desc' ? 'selected' : ''}>Recently updated</option>
              <option value="updated-asc" ${f.sort === 'updated-asc' ? 'selected' : ''}>Least recently updated</option>
              <option value="priority" ${f.sort === 'priority' ? 'selected' : ''}>Priority (highest first)</option>
              <option value="key-asc" ${f.sort === 'key-asc' ? 'selected' : ''}>Key (oldest first)</option>
            </select>
            ${(f.q || f.cat || f.type || f.assignee) ? `<button class="btn-ghost rpa-tool-btn" data-action="jira-clear-filters">Clear filters</button>` : ''}
          </div>
          <div class="tcs-chips">
            ${chip('', 'All', fc.total)}${JIRA_CATS.map(k => chip(k.key, k.label, fc[k.key])).join('')}${fc.unmapped || f.cat === 'unmapped' ? chip('unmapped', 'Unmapped', fc.unmapped) : ''}
            <span class="tcs-scope">showing ${list.length} of ${c.total}</span>
          </div>
          <div class="tcs-table-wrap">
            <table class="tcs-table jd-table">
              <thead><tr><th class="jd-idx">#</th><th>Key</th><th>Summary</th><th>Type</th><th>Jira status</th><th>Category</th><th>Assignee</th><th>Priority</th><th>Updated</th><th></th></tr></thead>
              <tbody>${rowsHtml || `<tr><td colspan="10"><div class="dbx-empty tcs-noresults">${c.total ? 'No tickets match these filters.' : 'This Jira project has no tickets.'}</div></td></tr>`}</tbody>
            </table>
          </div>
          <div class="tc-pagination-bar">
            <div class="tc-pagination-size"><label for="jiraPageSize">Rows per page</label>
              <select class="filter-select" id="jiraPageSize" data-jira-filter="size">${[25, 50, 100].map(n => `<option value="${n}" ${f.size === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="tc-pagination-info">${list.length ? `Showing ${start + 1}–${Math.min(start + f.size, list.length)} of ${list.length}` : 'No results'}</div>
            <div class="tc-pagination-nav">
              <button class="btn-ghost" data-action="jira-page" data-dir="-1" ${f.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
              <span class="tc-pagination-page">Page ${f.page} of ${pages}</span>
              <button class="btn-ghost" data-action="jira-page" data-dir="1" ${f.page >= pages ? 'disabled' : ''}>Next ›</button>
            </div>
          </div>
        </div>`}
    </div>`;
};

// ─── Jira ticket panel: status transitions, comments, Sync to Jira ───
// Pending changes live in state.jiraPending (own SQLite table, not exported) — never in
// the ticket cache. Each one is removed only after Jira confirms that operation, and is
// saved right away, so a partial sync never repeats a step that already succeeded.
const jiraTicketData = {};          // issue key -> { transitions, transErr, comments, commentsErr, loading, draft, result }
const jiraIssueSyncing = new Set(); // issue ids being synced (no duplicate requests)
const jiraPendingFor = (issueId) => (state.jiraPending || []).find(x => x.id === issueId);
const jiraPendingCount = (pd) => pd ? (pd.transition ? 1 : 0) + (pd.comments || []).length : 0;
const jiraEnsurePending = (projectId, issue) => {
  let pd = jiraPendingFor(issue.id);
  if (!pd) {
    pd = { id: issue.id, projectId, key: issue.key, transition: null, comments: [] };
    state.jiraPending = [...(state.jiraPending || []), pd];
  }
  return pd;
};
const jiraPruneEmptyPending = () => { state.jiraPending = (state.jiraPending || []).filter(x => jiraPendingCount(x)); };
const jiraNormText = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Re-render without losing the comment box's focus/caret (async loads land while typing).
const jiraRender = () => {
  if (state.view !== 'jira') return;
  const typing = document.activeElement && document.activeElement.id === 'jiraCommentDraft';
  render();
  const t = typing && document.getElementById('jiraCommentDraft');
  if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
};

// Load the issue's available transitions and its comments.
const jiraLoadTicket = async (key) => {
  const d = jiraTicketData[key] || (jiraTicketData[key] = {});
  d.loading = true;
  jiraRender();
  const [t, c] = await Promise.allSettled([ClairJira.getTransitions(key), ClairJira.getComments(key)]);
  d.transitions = t.status === 'fulfilled' ? t.value : null;
  d.transErr = t.status === 'rejected' ? jiraErrorText(t.reason) : '';
  d.comments = c.status === 'fulfilled' ? c.value : (d.comments || null);
  d.commentsErr = c.status === 'rejected' ? jiraErrorText(c.reason) : '';
  d.loading = false;
  jiraRender();
};

// Put a freshly fetched issue into the cache (only data Jira returned — never pending values).
const jiraCacheIssue = (projectId, fresh) => {
  const rec = (state.jiraSync || []).find(r => r.id === projectId);
  if (!rec) return;
  const idx = rec.issues.findIndex(i => i.id === fresh.id);
  if (idx >= 0) rec.issues[idx] = fresh; else rec.issues.unshift(fresh);
  if (fresh.statusId && !rec.statuses.some(s => s.id === fresh.statusId)) rec.statuses.push({ id: fresh.statusId, name: fresh.status, category: fresh.statusCategory });
};

const jiraSyncIssue = async (issueId) => {
  if (jiraIssueSyncing.has(issueId)) return;
  const pd = jiraPendingFor(issueId);
  if (!pd) return;
  const key = pd.key;
  const d = jiraTicketData[key] || (jiraTicketData[key] = {});
  if ((d.draft || '').trim()) { pd.comments.push({ id: uid(), text: d.draft, attemptedAt: '' }); d.draft = ''; }
  if (!jiraPendingCount(pd)) return;
  jiraIssueSyncing.add(issueId);
  d.result = null;
  await storage.save();
  jiraRender();
  const done = [], failed = [];
  try {
    if (pd.transition) {
      const t = pd.transition;
      try {
        // Already in the target status (e.g. an earlier attempt's response was lost)? Don't redo it.
        const cur = await ClairJira.getIssue(key);
        if (!(t.toId && cur.statusId === t.toId)) await ClairJira.doTransition(key, t.id);
        pd.transition = null;
        done.push(`status changed to “${t.toName}”`);
        await storage.save();
      } catch (e) {
        failed.push(`Status change to “${t.toName}” failed: ${jiraErrorText(e)}`);
      }
    }
    let sent = 0;
    while (pd.comments.length) {
      const c = pd.comments[0];
      try {
        let already = false;
        if (c.attemptedAt) { // an earlier attempt may have reached Jira — check before sending again
          const since = Date.parse(c.attemptedAt) - 10 * 60 * 1000; // allow for clock skew
          const sent = jiraNormText(ClairJira.adfPlain(c.text)); // how Jira stores it (lists, bold … converted)
          already = (await ClairJira.getComments(key)).some(x => jiraNormText(x.text) === sent && jiraTime(x.created) >= since);
        }
        if (!already) {
          c.attemptedAt = new Date().toISOString();
          await storage.save();
          await ClairJira.addComment(key, c.text);
        }
        pd.comments.shift();
        sent++;
        await storage.save();
      } catch (e) {
        failed.push(`${pd.comments.length === 1 ? 'The comment was' : `${pd.comments.length} comments were`} not sent: ${jiraErrorText(e)}`);
        break; // keep order; the rest stay pending
      }
    }
    if (sent) done.push(`${sent} comment${sent === 1 ? '' : 's'} added`);
    // Refresh the cached ticket, its comments and transitions from Jira.
    if (done.length) {
      try { jiraCacheIssue(pd.projectId, await ClairJira.getIssue(key)); } catch (e) { /* cache stays as last confirmed */ }
    }
  } finally {
    jiraIssueSyncing.delete(issueId);
    jiraPruneEmptyPending();
    const doneText = done.length ? done.join(' and ').replace(/^./, ch => ch.toUpperCase()) + '.' : '';
    d.result = failed.length
      ? { ok: false, text: `${doneText ? doneText + ' ' : ''}${failed.join(' ')} Unsent changes are kept — click Sync to Jira to retry them.` }
      : { ok: true, text: doneText || 'Nothing to sync.' };
    await storage.save();
    showToast(failed.length ? `${key}: some changes were not synced` : `${key}: synced to Jira`, failed.length ? 'error' : 'success');
    await jiraLoadTicket(key);
  }
};

// Escaped text with http(s) links made clickable.
const jiraLinkify = (text) => escapeHtml(text)
  .replace(/(\[attachment\]\s*)+/g, m => { const n = (m.match(/\[attachment\]/g) || []).length; return `<span class="jd-att">${n} attachment${n === 1 ? '' : 's'}</span>`; }).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)'"\]]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
const jiraInitials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const renderJiraIssuePanel = (p, rec, i) => {
  const d = jiraTicketData[i.key] || {};
  const pd = jiraPendingFor(i.id);
  const busy = jiraIssueSyncing.has(i.id);
  const n = jiraPendingCount(pd);
  const connected = jiraConnected();
  const when = (s) => s ? `${fmtDate(s)}, ${fmtTime(s)}` : '';
  const comments = d.comments || [];
  const commentsHtml = d.commentsErr && !d.comments ? `<div class="jd-issue-error">Comments couldn’t be loaded: ${escapeHtml(d.commentsErr)}</div>`
    : !d.comments && d.loading ? '<div class="dbx-empty">Loading comments…</div>'
    : comments.length ? comments.map(c => `
      <div class="jd-cmt">
        <span class="jd-avatar" aria-hidden="true">${escapeHtml(jiraInitials(c.author))}</span>
        <div class="jd-cmt-main">
          <div class="jd-cmt-head"><strong>${escapeHtml(c.author)}</strong><span>${when(c.created)}${c.updated && c.updated !== c.created ? ` · edited ${when(c.updated)}` : ''}</span></div>
          <div class="jd-cmt-body">${jiraLinkify(c.text)}</div>
        </div>
      </div>`).join('') : '<div class="jd-cmts-empty">No comments yet.</div>';
  const pendingComments = (pd ? pd.comments : []).map(c => `
      <div class="jd-cmt pending">
        <span class="jd-avatar" aria-hidden="true">…</span>
        <div class="jd-cmt-main">
          <div class="jd-cmt-head"><strong>Pending — not in Jira yet</strong>
            ${busy ? '' : `<button type="button" class="rpa-link" data-action="jira-drop-comment" data-issue="${escapeHtml(i.id)}" data-cid="${escapeHtml(c.id)}">Remove</button>`}</div>
          <div class="jd-cmt-body">${jiraLinkify(c.text)}</div>
        </div>
      </div>`).join('');
  const trans = d.transitions || [];
  const sel = pd && pd.transition ? pd.transition.id : '';
  const transControl = d.transErr ? `<div class="jd-issue-error">Status changes unavailable: ${escapeHtml(d.transErr)}</div>`
    : !d.transitions ? `<div class="jd-issue-hint">${d.loading ? 'Loading available transitions…' : ''}</div>`
    : !trans.length ? '<div class="jd-issue-hint">No status changes are available to you for this ticket.</div>'
    : `<select class="filter-select" data-jira-transition="${escapeHtml(i.id)}" ${busy ? 'disabled' : ''} aria-label="Change Jira status">
        <option value="">No change</option>
        ${trans.map(t => `<option value="${escapeHtml(t.id)}" ${sel === t.id ? 'selected' : ''}>${escapeHtml(t.name)}${t.toName && t.toName !== t.name ? ` → ${escapeHtml(t.toName)}` : ''}</option>`).join('')}
      </select>`;
  return `
    <tr class="jd-issue-row"><td colspan="10">
      <div class="jd-issue">
        <div class="jd-issue-main">
          <div class="jd-issue-head">
            <h4 class="jd-issue-title">Comments <span class="rpa-group-count">${comments.length}</span>${d.loading && d.comments ? '<span class="jd-issue-hint">Refreshing…</span>' : ''}</h4>
          </div>
          <div class="jd-cmts">${commentsHtml}${pendingComments}</div>
          <div class="jd-composer">
            <textarea id="jiraCommentDraft" class="jd-draft" data-key="${escapeHtml(i.key)}" rows="3" placeholder="Write a comment…" aria-label="New comment" ${busy ? 'disabled' : ''}>${escapeHtml(d.draft || '')}</textarea>
            <div class="jd-composer-foot">
              <span class="jd-issue-hint">Added to pending changes and sent with Sync to Jira.</span>
              <button type="button" class="btn-ghost st-btn" data-action="jira-queue-comment" data-issue="${escapeHtml(i.id)}" ${busy ? 'disabled' : ''}>Add to pending</button>
            </div>
          </div>
        </div>
        <div class="jd-issue-col">
          <div class="jd-issue-head"><h4 class="jd-issue-title">Status</h4></div>
          <div class="jd-issue-side">
          <div class="jd-issue-field"><span>Current Jira status</span>
            <div class="jd-status-now"><strong>${escapeHtml(i.status)}</strong><span class="jd-issue-hint">Clair: <span class="jd-pill" style="--c:${JIRA_CAT_COLOR[i.cat]}">${JIRA_CAT_LABEL[i.cat]}</span></span></div></div>
          <div class="jd-issue-field"><span>Change status</span>${transControl}</div>
          ${pd && pd.transition ? `<div class="jd-issue-pending">Selected: <strong>${escapeHtml(pd.transition.toName)}</strong> — not applied yet</div>` : ''}
          ${pd && pd.comments.length ? `<div class="jd-issue-pending">Pending comments: <strong>${pd.comments.length}</strong></div>` : ''}
          ${n ? `<div class="jd-issue-warn">${n} change${n === 1 ? '' : 's'} not yet applied to Jira</div>` : ''}
          <button type="button" class="btn-primary st-btn jd-sync-btn" data-action="jira-sync-issue" data-issue="${escapeHtml(i.id)}" ${busy || !connected || (!n && !(d.draft || '').trim()) ? 'disabled' : ''}>${JD_I.refresh}${busy ? 'Syncing…' : 'Sync to Jira'}</button>
          ${!connected ? '<div class="jd-issue-hint">Connect Jira in Settings to sync.</div>' : ''}
          ${d.result ? `<div class="jd-issue-result ${d.result.ok ? 'ok' : 'fail'}">${escapeHtml(d.result.text)}</div>` : ''}
          </div>
        </div>
      </div>
    </td></tr>`;
};

const jiraResetFilters = () => { state.jiraFilters = { q: '', cat: '', type: '', assignee: '', sort: 'key-desc', page: 1, size: (state.jiraFilters && state.jiraFilters.size) || 25 }; };

// ─── Project Display Management on Jira Board ────────────────────────
const openJiraDisplayModal = () => {
  const container = document.getElementById('jiraDisplayProjectsList');
  if (!container) return;
  const allLinked = jiraAllLinkedProjects();
  if (!allLinked.length) {
    container.innerHTML = emptyNote('No projects are currently connected to Jira. Link a project in the Project edit form.');
    showModal('jiraDisplayProjectsModal');
    return;
  }
  container.innerHTML = allLinked.map(p => {
    const isDisplayed = !p.jira.hiddenFromBoard;
    const rec = jiraRecordFor(p);
    const count = rec && rec.issues ? rec.issues.length : 0;
    return `
      <label class="dev-project-label" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:6px; margin-bottom:4px; cursor:pointer; background:var(--bg-card); border:1px solid var(--border-light);">
        <div style="display:flex; align-items:center; gap:10px;">
          <input type="checkbox" name="jiraDisplayProjectCheck" value="${p.id}" ${isDisplayed ? 'checked' : ''} style="cursor:pointer;" />
          <span style="font-weight:600; color:var(--text-primary); font-size:13px;">${escapeHtml(p.name)}</span>
          <span class="jira-key" style="font-size:11px;">${escapeHtml(p.jira.projectKey)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.jira.projectName || '')}</span>
          <span class="badge" style="font-size:11px; padding:2px 7px;">${count} tickets</span>
          ${!isDisplayed ? `<span class="dev-pill" style="font-size:10px; padding:2px 6px; background:#fef3c7; color:#b45309;">Hidden</span>` : `<span class="dev-pill" style="font-size:10px; padding:2px 6px; background:#dcfce7; color:#15803d;">Displayed</span>`}
        </div>
      </label>
    `;
  }).join('');

  showModal('jiraDisplayProjectsModal');
};

const jiraDisplaySelectAll = () => {
  document.querySelectorAll('input[name="jiraDisplayProjectCheck"]').forEach(cb => { cb.checked = true; });
};

const jiraDisplaySelectNone = () => {
  document.querySelectorAll('input[name="jiraDisplayProjectCheck"]').forEach(cb => { cb.checked = false; });
};

const saveJiraDisplayProjects = async () => {
  const checkboxes = Array.from(document.querySelectorAll('input[name="jiraDisplayProjectCheck"]'));
  let changed = false;
  checkboxes.forEach(cb => {
    const p = state.projects.find(x => x.id === cb.value);
    if (!p || !p.jira) return;
    const shouldHide = !cb.checked;
    if (!!p.jira.hiddenFromBoard !== shouldHide) {
      p.jira.hiddenFromBoard = shouldHide;
      changed = true;
    }
  });
  if (changed) {
    await storage.save();
    syncWatchProjects();
    const displayedCount = jiraLinkedProjects().length;
    showToast(`Jira board display updated: ${displayedCount} project${displayedCount === 1 ? '' : 's'} displayed`);
  }
  closeModals();
  if (state.view === 'jira') render();
};

const hideJiraProject = async (projectId) => {
  const p = state.projects.find(x => x.id === projectId);
  if (!p || !p.jira) return;
  p.jira.hiddenFromBoard = true;
  await storage.save();
  syncWatchProjects();
  showToast(`Removed "${p.name}" from Jira board. Click "Display Projects" to show it again.`);
  if (state.view === 'jira') render();
};
