// Clair — js/qa.js: QA checklist in "Ticket closing" tasks, comment templates, weekly QA report.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── QA checklist (task details) & QA comment templates ───
// "Ticket closing" tasks list their tickets with Verified & closed / Reopen. Confirming
// moves the ticket in Jira (a transition to the project's Done / back to In Progress or
// Reopen), posts the QA comment, records the outcome in the task's Work Done and
// completes the task once every ticket is handled (see jiracore.js).
let qaComposer = null;   // { taskId, key, result, text, templateId, busy, error }
state.qaTemplates = QA_DEFAULT_TEMPLATES.map(t => ({ ...t }));
const qaLoadTemplates = async () => {
  if (!hasChromeStorage()) return;
  const saved = (await chrome.storage.local.get(QA_TEMPLATES_KEY))[QA_TEMPLATES_KEY];
  if (Array.isArray(saved) && saved.length) state.qaTemplates = saved;
};
const qaSaveTemplates = () => { if (hasChromeStorage()) chrome.storage.local.set({ [QA_TEMPLATES_KEY]: state.qaTemplates }); };
if (hasChromeStorage()) chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[QA_TEMPLATES_KEY]) state.qaTemplates = ch[QA_TEMPLATES_KEY].newValue || QA_DEFAULT_TEMPLATES; });

const qaTaskRec = (task) => (state.jiraSync || []).find(r => r.id === (task.projectIds || [])[0]) || null;
const qaVars = (task, t) => ({
  key: t.key, summary: t.summary || '', developer: t.assignee || '',
  project: ((state.projects || []).find(p => p.id === (task.projectIds || [])[0]) || {}).name || '',
  date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
});

const renderQaChecklist = (task) => {
  const tickets = jiraQaTickets(task);
  const rec = qaTaskRec(task);
  const doneN = tickets.filter(t => jiraQaOutcome(task, t.key)).length;
  const pct = tickets.length ? Math.round(doneN / tickets.length * 100) : 0;
  const busyAny = qaComposer && qaComposer.busy;
  const item = (t) => {
    const out = jiraQaOutcome(task, t.key);
    const iss = rec && rec.issues.find(i => i.key === t.key);
    const url = t.url || (iss && iss.url) || '';
    const open = qaComposer && qaComposer.taskId === task.id && qaComposer.key === t.key;
    const tpls = (state.qaTemplates || []).filter(x => !open || x.kind === qaComposer.result);
    return `
      <div class="qa-item ${out ? out.result : ''} ${open ? 'open' : ''}">
        <div class="qa-item-top">
          <div class="qa-item-main">
            <div class="qa-item-title">${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="qa-key">${escapeHtml(t.key)}</a>` : `<span class="qa-key">${escapeHtml(t.key)}</span>`}<span class="qa-sum">${escapeHtml(t.summary || (iss && iss.summary) || '')}</span></div>
            <div class="qa-item-meta">${t.assignee ? `Developer: ${escapeHtml(t.assignee)}` : 'Unassigned'}${iss ? ` · Jira: <strong>${escapeHtml(iss.status)}</strong>` : ''}</div>
          </div>
          ${out ? `<span class="qa-badge ${out.result}" title="${escapeHtml(out.note || '')}">${out.result === 'verified' ? '✓ Verified & closed' : '↺ Reopened'}${out.by === 'jira' ? ' in Jira' : ''}<em>${jiraWhen(out.at)}</em></span>`
            : open ? '' : `<div class="qa-actions">
              <button type="button" class="btn-primary st-btn" data-qa="start" data-task="${task.id}" data-key="${escapeHtml(t.key)}" data-result="verified" ${busyAny ? 'disabled' : ''}>Verified &amp; closed</button>
              <button type="button" class="btn-ghost st-btn qa-reopen" data-qa="start" data-task="${task.id}" data-key="${escapeHtml(t.key)}" data-result="reopen" ${busyAny ? 'disabled' : ''}>Reopen</button>
            </div>`}
        </div>
        ${open ? `
          <div class="qa-composer">
            <div class="qa-composer-head">
              <strong>${qaComposer.result === 'verified' ? 'Verify and close' : 'Reopen'} ${escapeHtml(t.key)}</strong>
              <select class="filter-select" data-qa="template" aria-label="Comment template" ${qaComposer.busy ? 'disabled' : ''}>
                ${tpls.map(x => `<option value="${escapeHtml(x.id)}" ${qaComposer.templateId === x.id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
                <option value="" ${!qaComposer.templateId ? 'selected' : ''}>No template</option>
              </select>
            </div>
            <textarea class="jd-draft qa-text" data-qa="text" rows="6" placeholder="Comment for Jira (optional)" ${qaComposer.busy ? 'disabled' : ''}>${escapeHtml(qaComposer.text || '')}</textarea>
            <div class="qa-composer-foot">
              <span class="jd-issue-hint">${qaComposer.result === 'verified' ? 'Moves the ticket to Done in Jira and posts this comment.' : 'Moves the ticket back (Reopen / In Progress) in Jira and posts this comment — the developer is notified by Jira.'}</span>
              <span class="qa-composer-btns">
                <button type="button" class="btn-ghost st-btn" data-qa="cancel" ${qaComposer.busy ? 'disabled' : ''}>Cancel</button>
                <button type="button" class="btn-primary st-btn ${qaComposer.result === 'reopen' ? 'qa-btn-reopen' : ''}" data-qa="confirm" ${qaComposer.busy ? 'disabled' : ''}>${qaComposer.busy ? 'Updating Jira…' : qaComposer.result === 'verified' ? 'Verify & close in Jira' : 'Reopen in Jira'}</button>
              </span>
            </div>
            ${qaComposer.error ? `<div class="jd-issue-result fail">${escapeHtml(qaComposer.error)}</div>` : ''}
          </div>` : ''}
      </div>`;
  };
  return `
    <div class="qa-checklist">
      <div class="qa-head">
        <span class="detail-meta-label">QA checklist</span>
        <span class="qa-count">${doneN}/${tickets.length} done</span>
        <button type="button" class="rpa-link qa-refresh" data-qa="refresh" data-task="${task.id}" ${busyAny ? 'disabled' : ''}>Refresh from Jira</button>
      </div>
      <div class="qa-bar"><span style="width:${pct}%"></span></div>
      ${tickets.map(item).join('')}
      ${task.status === 'Done' ? '<div class="qa-complete">All tickets handled — task completed.</div>' : ''}
    </div>`;
};
const refreshQaChecklist = () => {
  const box = document.getElementById('qaChecklist');
  if (!box) return;
  const task = state.tasks.find(t => t.id === box.dataset.task);
  if (task) box.innerHTML = renderQaChecklist(task);
};

// Current Jira status of the task's open tickets → cache → outcomes for tickets handled in Jira.
const qaRefreshFromJira = async (taskId, quiet = true) => {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !task.autoQa || !jiraAvailable() || !jiraConnected()) return;
  const pid = (task.projectIds || [])[0];
  try {
    for (const t of jiraQaTickets(task).filter(x => !jiraQaOutcome(task, x.key))) jiraCacheIssue(pid, await ClairJira.getIssue(t.key));
    const done = jiraQaReconcile(state);
    await storage.save();
    if (done.some(x => x.id === taskId)) { showToast(`"${task.title}" completed`); openDetailModal('task', taskId); }
    else refreshQaChecklist();
    if (!quiet) showToast('QA checklist refreshed from Jira');
  } catch (e) {
    if (!quiet) showToast(`Couldn't refresh from Jira — ${jiraErrorText(e)}`, 'error');
  }
};

const qaConfirm = async () => {
  const c = qaComposer;
  const task = c && state.tasks.find(t => t.id === c.taskId);
  if (!task || c.busy) return;
  const rec = qaTaskRec(task);
  const pid = (task.projectIds || [])[0];
  const want = c.result === 'verified' ? ['done'] : ['reopen', 'inprogress', 'todo'];
  c.busy = true; c.error = ''; refreshQaChecklist();
  try {
    const cur = await ClairJira.getIssue(c.key);
    const curCat = jiraCategoryOf(rec, cur.statusId, cur.status);
    if (!want.includes(curCat)) {
      const trans = await ClairJira.getTransitions(c.key);
      let pick = null;
      for (const cat of want) { pick = trans.find(t => jiraCategoryOf(rec, t.toId, t.toName) === cat); if (pick) break; }
      if (!pick) throw new Error(`Jira offers no move from "${cur.status}" to ${c.result === 'verified' ? 'Done' : 'Reopen / In Progress'} for ${c.key}. Check its workflow in Jira or the status mapping on the Jira page.`);
      await ClairJira.doTransition(c.key, pick.id);
    }
    let commentErr = '';
    if ((c.text || '').trim()) { try { await ClairJira.addComment(c.key, c.text); } catch (e) { commentErr = jiraErrorText(e); } }
    const note = c.result === 'reopen' ? String(c.text || '').split('\n').map(x => x.replace(/[*_`#>-]/g, '').trim()).filter(Boolean)[0] || '' : '';
    jiraQaRecord(state, task, c.key, c.result === 'verified' ? 'verified' : 'reopened', 'clair', note.length > 140 ? note.slice(0, 137) + '…' : note);
    try { jiraCacheIssue(pid, await ClairJira.getIssue(c.key)); } catch (e) { /* cache refreshes on the next sync */ }
    const completed = jiraQaMaybeComplete(state, task);
    logActivity(`${c.result === 'verified' ? 'Verified and closed' : 'Reopened'} ${c.key} (${task.title})`, 'task');
    await storage.save();
    qaComposer = null;
    if (commentErr) showToast(`${c.key} updated in Jira, but the comment wasn't posted — ${commentErr}`, 'error');
    else showToast(`${c.key} ${c.result === 'verified' ? 'verified and closed' : 'reopened'} in Jira`);
    if (completed) showToast(`"${task.title}" completed — all tickets handled`);
    openDetailModal('task', task.id);
    if (state.view === 'tasks' || state.view === 'dashboard' || state.view === 'calendar') render();
  } catch (e) {
    c.busy = false;
    c.error = e && e.name === 'JiraError' ? e.message : (e && e.message) || 'Something went wrong while updating Jira.';
    refreshQaChecklist();
  }
};

// Clicks and edits inside the task details modal (outside #mainContent).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-qa]');
  if (!b || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA') return;
  const act = b.dataset.qa;
  if (act === 'start') {
    const task = state.tasks.find(t => t.id === b.dataset.task);
    const t = task && jiraQaTickets(task).find(x => x.key === b.dataset.key);
    if (!t) return;
    const tpl = (state.qaTemplates || []).find(x => x.kind === b.dataset.result);
    qaComposer = { taskId: task.id, key: t.key, result: b.dataset.result, templateId: tpl ? tpl.id : '', text: tpl ? qaFillTemplate(tpl.text, qaVars(task, t)) : '', busy: false, error: '' };
    refreshQaChecklist();
    const ta = document.querySelector('#qaChecklist .qa-text');
    if (ta) ta.focus();
  } else if (act === 'cancel') { qaComposer = null; refreshQaChecklist(); }
  else if (act === 'confirm') qaConfirm();
  else if (act === 'refresh') qaRefreshFromJira(b.dataset.task, false);
});
document.addEventListener('change', (e) => {
  if (!e.target.matches || !e.target.matches('[data-qa="template"]') || !qaComposer) return;
  const task = state.tasks.find(t => t.id === qaComposer.taskId);
  const t = task && jiraQaTickets(task).find(x => x.key === qaComposer.key);
  const tpl = (state.qaTemplates || []).find(x => x.id === e.target.value);
  qaComposer.templateId = e.target.value;
  qaComposer.text = tpl && t ? qaFillTemplate(tpl.text, qaVars(task, t)) : '';
  refreshQaChecklist();
});
document.addEventListener('input', (e) => { if (qaComposer && e.target.matches && e.target.matches('[data-qa="text"]')) qaComposer.text = e.target.value; });

// Settings → QA workflow: comment templates.
const renderQaSettings = () => stSection('QA comment templates', 'Used by the QA checklist in “Ticket closing” tasks. Placeholders: {key}, {summary}, {developer}, {project}, {date}. Markdown lists and **bold** show properly in Jira.', `
    <div class="qa-tpl-list">
      ${(state.qaTemplates || []).map((t, i) => `
        <div class="qa-tpl">
          <div class="qa-tpl-head">
            <input type="text" class="qa-tpl-name" data-qa-tpl="name" data-i="${i}" value="${escapeHtml(t.name)}" aria-label="Template name" />
            <select class="filter-select" data-qa-tpl="kind" data-i="${i}" aria-label="Used for">
              <option value="verified" ${t.kind === 'verified' ? 'selected' : ''}>Verified &amp; closed</option>
              <option value="reopen" ${t.kind === 'reopen' ? 'selected' : ''}>Reopen</option>
            </select>
            <button type="button" class="icon-btn danger" data-action="qa-tpl-delete" data-i="${i}" title="Delete template" aria-label="Delete template"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
          </div>
          <textarea class="qa-tpl-text" data-qa-tpl="text" data-i="${i}" rows="6" aria-label="Template text">${escapeHtml(t.text)}</textarea>
        </div>`).join('')}
    </div>
    <div class="qa-tpl-actions">
      <button type="button" class="btn-ghost st-btn" data-action="qa-tpl-add" data-kind="verified">+ Verified template</button>
      <button type="button" class="btn-ghost st-btn" data-action="qa-tpl-add" data-kind="reopen">+ Reopen template</button>
      <button type="button" class="btn-ghost st-btn" data-action="qa-tpl-reset">Restore defaults</button>
    </div>`);

// ─── Weekly QA report ──────────────────────────────────────
// Built from the automatic QA tasks: each ticket's outcome (verified / reopened, in Clair
// or Jira) and when it entered Ready for QA (jiraQa issue records).
const qaWeekRange = (offset = 0) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); // Monday
  const end = new Date(d); end.setDate(d.getDate() + 7);
  return { start: d.getTime(), end: end.getTime() };
};
const qaReportData = (offset = 0) => {
  const { start, end } = qaWeekRange(offset);
  const inWeek = (iso) => { const t = Date.parse(iso || ''); return t >= start && t < end; };
  const entered = {};
  (state.jiraQa || []).filter(r => r.kind === 'issue').forEach(r => { entered[r.key] = Date.parse(r.enteredAt); });
  const projName = (id) => ((state.projects || []).find(p => p.id === id) || {}).name || 'Unknown project';
  const qaTasks = (state.tasks || []).filter(t => t.autoQa);
  const done = [], pending = [];
  qaTasks.forEach(task => {
    const project = projName((task.projectIds || [])[0]);
    jiraQaTickets(task).forEach(t => {
      const out = jiraQaOutcome(task, t.key);
      const row = { key: t.key, summary: t.summary || '', developer: t.assignee || '', project, url: t.url || '', taskId: task.id };
      if (out && inWeek(out.at)) done.push({ ...row, result: out.result, at: out.at, by: out.by, hours: entered[t.key] ? (Date.parse(out.at) - entered[t.key]) / 3600000 : null });
      else if ((!out || Date.parse(out.at) >= end) && Date.parse(task.createdAt) < end) pending.push({ ...row, since: entered[t.key] || Date.parse(task.createdAt) });
    });
  });
  done.sort((a, b) => a.at.localeCompare(b.at));
  const verified = done.filter(r => r.result === 'verified');
  const reopened = done.filter(r => r.result === 'reopened');
  const timed = verified.filter(r => r.hours != null && r.hours >= 0);
  const avgHours = timed.length ? timed.reduce((s, r) => s + r.hours, 0) / timed.length : null;
  const projects = [...new Set([...done, ...pending].map(r => r.project))].sort().map(name => ({
    name,
    verified: verified.filter(r => r.project === name).length,
    reopened: reopened.filter(r => r.project === name).length,
    pending: pending.filter(r => r.project === name).length
  }));
  return {
    start, end, verified, reopened, pending, projects, avgHours,
    created: qaTasks.filter(t => inWeek(t.createdAt)).length,
    completed: qaTasks.filter(t => t.status === 'Done' && inWeek(t.completedDate)).length
  };
};
const qaShortWhen = (v) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const qaDuration = (h) => h == null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24 * 10) / 10} days`;
const qaWeekLabel = (r) => `${new Date(r.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(r.end - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
const qaReportText = (r) => {
  const line = (x) => `- ${x.key} ${x.summary}${x.developer ? ` (${x.developer})` : ''} — ${new Date(x.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  return [
    `QA report — ${qaWeekLabel(r)}`,
    '',
    `Verified & closed: ${r.verified.length} · Reopened: ${r.reopened.length} · Still pending: ${r.pending.length}`,
    `QA tasks: ${r.created} created, ${r.completed} completed · Average time to verify: ${qaDuration(r.avgHours)}`,
    '',
    'By project',
    ...(r.projects.length ? r.projects.map(p => `- ${p.name}: ${p.verified} verified, ${p.reopened} reopened, ${p.pending} pending`) : ['- No QA activity']),
    ...(r.verified.length ? ['', 'Verified & closed', ...r.verified.map(line)] : []),
    ...(r.reopened.length ? ['', 'Reopened', ...r.reopened.map(line)] : []),
    ...(r.pending.length ? ['', 'Still pending', ...r.pending.map(x => `- ${x.key} ${x.summary}${x.developer ? ` (${x.developer})` : ''}`)] : [])
  ].join('\n');
};
const qaReportCsv = (r) => {
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Week', 'Project', 'Ticket', 'Summary', 'Developer', 'Result', 'Date', 'Done in', 'Hours from Ready for QA']];
  const week = qaWeekLabel(r);
  r.verified.concat(r.reopened).forEach(x => rows.push([week, x.project, x.key, x.summary, x.developer, x.result === 'verified' ? 'Verified & closed' : 'Reopened', new Date(x.at).toLocaleString('en-IN'), x.by === 'jira' ? 'Jira' : 'Clair', x.hours == null ? '' : Math.round(x.hours * 10) / 10]));
  r.pending.forEach(x => rows.push([week, x.project, x.key, x.summary, x.developer, 'Pending', '', '', '']));
  return rows.map(cols => cols.map(q).join(',')).join('\r\n');
};

const renderQaReport = () => {
  const off = state.qaReportWeek || 0;
  const r = qaReportData(off);
  const hero = buildPageHero({
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    title: 'Weekly QA report',
    subtitle: `${qaWeekLabel(r)} · from the automatic “Ticket closing” tasks.`,
    stats: [
      { label: 'Verified', value: r.verified.length, color: '#4ade80' },
      { label: 'Reopened', value: r.reopened.length, color: r.reopened.length ? '#f87171' : undefined },
      { label: 'Pending', value: r.pending.length, color: r.pending.length ? '#fbbf24' : undefined },
      { label: 'Tasks created', value: r.created },
      { label: 'Tasks completed', value: r.completed },
      { label: 'Avg. time to verify', value: qaDuration(r.avgHours) }
    ]
  });
  const table = (rows, kind) => rows.length ? `
    <div class="tcs-table-wrap"><table class="tcs-table qr-table">
      <thead><tr><th>Ticket</th><th>Summary</th><th>Project</th><th>Developer</th><th>${kind === 'pending' ? 'In QA since' : 'When'}</th>${kind === 'pending' ? '' : '<th>Done in</th><th>Turnaround</th>'}</tr></thead>
      <tbody>${rows.map(x => `
        <tr>
          <td class="jd-nowrap">${x.url ? `<a class="jd-key" href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.key)}</a>` : escapeHtml(x.key)}</td>
          <td class="jd-summary">${escapeHtml(x.summary)}</td>
          <td class="jd-nowrap">${escapeHtml(x.project)}</td>
          <td class="jd-nowrap">${x.developer ? escapeHtml(x.developer) : '<span class="po-muted">Unassigned</span>'}</td>
          <td class="jd-nowrap">${kind === 'pending' ? (x.since ? qaShortWhen(x.since) : '—') : qaShortWhen(x.at)}</td>
          ${kind === 'pending' ? '' : `<td class="jd-nowrap">${x.by === 'jira' ? 'Jira' : 'Clair'}</td><td class="jd-nowrap">${qaDuration(x.hours)}</td>`}
        </tr>`).join('')}</tbody>
    </table></div>` : '<div class="dbx-empty">None this week.</div>';
  return `
    ${hero}
    <div class="filters-bar tk-toolbar std-toolbar">
      <div class="qr-week">
        <button type="button" class="btn-ghost cal-nav-btn" data-action="qa-report-week" data-dir="-1" aria-label="Previous week"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
        <strong>${qaWeekLabel(r)}</strong>
        <button type="button" class="btn-ghost cal-nav-btn" data-action="qa-report-week" data-dir="1" ${off >= 0 ? 'disabled' : ''} aria-label="Next week"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
        <button type="button" class="btn-ghost st-btn" data-action="qa-report-week" data-dir="0" ${off === 0 ? 'disabled' : ''}>This week</button>
      </div>
      <div class="rpa-toolbar-right">
        <button type="button" class="btn-ghost st-btn" data-action="qa-report-copy">Copy for email</button>
        <button type="button" class="btn-primary st-btn" data-action="qa-report-csv">Download CSV</button>
      </div>
    </div>
    <div class="qr-grid">
      <section class="tco-card">
        <div class="tco-card-head"><h3 class="tco-card-title">By project</h3></div>
        ${r.projects.length ? `<div class="qr-projects">${r.projects.map(p => {
          return `<div class="qr-proj"><div class="qr-proj-top"><strong>${escapeHtml(p.name)}</strong><span>${p.verified} verified · ${p.reopened} reopened · ${p.pending} pending</span></div>
            <span class="dbx-stackbar">${[['pass', p.verified], ['fail', p.reopened], ['hold', p.pending]].filter(([, n]) => n).map(([c, n]) => `<span class="${c}" style="flex:${n}"></span>`).join('')}</span></div>`;
        }).join('')}</div>` : '<div class="dbx-empty">No QA activity this week.</div>'}
      </section>
      <section class="tco-card"><div class="tco-card-head"><h3 class="tco-card-title">Verified &amp; closed <span class="rpa-group-count">${r.verified.length}</span></h3></div>${table(r.verified, 'done')}</section>
      <section class="tco-card"><div class="tco-card-head"><h3 class="tco-card-title">Reopened <span class="rpa-group-count">${r.reopened.length}</span></h3></div>${table(r.reopened, 'done')}</section>
      <section class="tco-card"><div class="tco-card-head"><h3 class="tco-card-title">Still pending <span class="rpa-group-count">${r.pending.length}</span></h3></div>${table(r.pending, 'pending')}</section>
    </div>`;
};
const qaReportDownload = () => {
  const r = qaReportData(state.qaReportWeek || 0);
  const blob = new Blob(['﻿' + qaReportCsv(r)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `clair-qa-report-${new Date(r.start).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
