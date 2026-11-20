// Clair — js/search.js: Global search (Ctrl+K).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Global search (Ctrl+K) ──────────────────────────────
// One box that finds pages, projects, tasks, Jira tickets, test cases, notes, releases,
// release points and developers. Arrow keys move, Enter opens, Esc closes.
const PALETTE_PAGES = [
  ['dashboard', 'Dashboard'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['notes', 'Notes'], ['calendar', 'Calendar'],
  ['tests', 'Project Insights'], ['testcases', 'Test Case Management'], ['releases', 'Release Management'],
  ['releasepoints', 'Release Points'], ['jira', 'Jira'], ['qareport', 'Weekly QA report'], ['notifications', 'Notifications'],
  ['developers', 'Developers'], ['activity', 'Activity'], ['settings', 'Settings']
];
let paletteState = { q: '', sel: 0, items: [] };
const paletteSearch = (raw) => {
  const q = raw.trim().toLowerCase();
  const hit = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(q));
  const projName = (id) => ((state.projects || []).find(p => p.id === id) || {}).name || '';
  const groups = [];
  const add = (label, list, max = 6) => { if (list.length) groups.push({ label, items: list.slice(0, max), more: Math.max(0, list.length - max) }); };
  add('Pages', PALETTE_PAGES.filter(([, l]) => !q || hit(l)).map(([v, l]) => ({ title: l, sub: 'Go to page', run: () => { if (v === 'qareport') state.qaReportWeek = 0; setView(v); } })), q ? 4 : 15);
  if (!q) return groups;
  add('Projects', (state.projects || []).filter(p => hit(p.name, p.clientName, p.assignedTeam, p.jira && p.jira.projectKey, p.qaUrl, p.prodUrl)).map(p => ({
    title: p.name, sub: [p.clientName, p.jira && p.jira.projectKey].filter(Boolean).join(' · ') || 'Project',
    run: () => { setView('projects'); state.overviewProjectId = p.id; render(); }
  })));
  add('Tasks', (state.tasks || []).filter(t => hit(t.title, t.description, (t.tags || []).join(' '))).map(t => ({
    title: t.title, sub: `${t.status || 'To-Do'}${t.endDate ? ` · due ${fmtDate(t.endDate)}` : ''}`, run: () => openDetailModal('task', t.id)
  })));
  const tickets = [];
  (state.jiraSync || []).forEach(rec => (rec.issues || []).forEach(i => { if (hit(i.key, i.summary)) tickets.push({ rec, i }); }));
  tickets.sort((a, b) => (a.i.key.toLowerCase() === q ? -1 : 0) - (b.i.key.toLowerCase() === q ? -1 : 0));
  add('Jira tickets', tickets.map(({ rec, i }) => ({
    title: `${i.key} · ${i.summary}`, sub: `${i.status}${i.assignee ? ` · ${i.assignee}` : ''} · ${projName(rec.id)}`,
    run: () => {
      setView('jira');
      state.jiraProjectId = rec.id; jiraResetFilters(); state.jiraFilters.q = i.key; state.jiraIssueOpen = i.id;
      render();
      if (jiraConnected()) jiraLoadTicket(i.key);
    }
  })));
  add('Test cases', (state.testCases || []).filter(t => hit(t.id, t.title, t.scenario, t.defectId)).map(t => ({
    title: t.title || t.scenario || t.id, sub: `${t.id} · ${t.status || 'Untested'} · ${projName(t.projectId)}`, run: () => openDetailModal('testcase', t.id)
  })));
  add('Notes', (state.notes || []).filter(n => hit(n.title, n.content)).map(n => ({
    title: n.title || 'Untitled note', sub: projName(n.projectId) || 'Note',
    run: () => { setView('notes'); state.activeNoteProjectId = n.projectId; state.activeNoteFolderId = n.folderId || null; state.activeNoteId = n.id; render(); }
  })));
  add('Releases', (state.releases || []).filter(r => hit(r.name, ...(r.versions || [r.version]), r.workItems)).map(r => ({
    title: r.name, sub: `${r.status || 'Draft'}${r.releaseDate ? ` · ${fmtDate(r.releaseDate)}` : ''}`, run: () => openDetailModal('release', r.id)
  })));
  add('Release points', (state.releasePoints || []).filter(r => hit(r.title, ...(r.versions || []))).map(r => ({
    title: r.title, sub: (r.projectIds || [r.projectId]).map(projName).filter(Boolean).join(', ') || 'Release point',
    run: () => { setView('releasepoints'); openReleasePointOnPage(r.id); }
  })));
  add('Developers', (state.developers || []).filter(d => hit(d.name)).map(d => ({
    title: d.name, sub: `${(d.projectIds || []).length} project${(d.projectIds || []).length === 1 ? '' : 's'}`,
    run: () => { state.devSearch = d.name; setView('developers'); }
  })));
  return groups;
};
const paletteRender = () => {
  const box = document.getElementById('paletteResults');
  if (!box) return;
  const groups = paletteSearch(paletteState.q);
  paletteState.items = groups.flatMap(g => g.items);
  if (paletteState.sel >= paletteState.items.length) paletteState.sel = Math.max(0, paletteState.items.length - 1);
  let n = -1;
  box.innerHTML = groups.length ? groups.map(g => `
    <div class="pl-group">
      <div class="pl-group-label">${g.label}${g.more ? `<span>+${g.more} more — refine the search</span>` : ''}</div>
      ${g.items.map(it => { n++; return `<button type="button" class="pl-item ${n === paletteState.sel ? 'sel' : ''}" data-pl="${n}" role="option" aria-selected="${n === paletteState.sel}"><span class="pl-title">${highlight(escapeHtml(it.title), paletteState.q.trim())}</span><span class="pl-sub">${escapeHtml(it.sub)}</span></button>`; }).join('')}
    </div>`).join('') : `<div class="pl-empty">Nothing found for “${escapeHtml(paletteState.q)}”.</div>`;
  const sel = box.querySelector('.pl-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
};
const paletteOpen = () => {
  let el = document.getElementById('palette');
  if (!el) {
    el = document.createElement('div');
    el.id = 'palette';
    el.className = 'pl-overlay';
    el.innerHTML = `
      <div class="pl-box" role="dialog" aria-modal="true" aria-label="Search Clair">
        <div class="pl-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" id="paletteInput" placeholder="Search projects, tasks, tickets, test cases, notes…" autocomplete="off" spellcheck="false" role="combobox" aria-controls="paletteResults" aria-expanded="true" />
          <kbd>Esc</kbd>
        </div>
        <div class="pl-results" id="paletteResults" role="listbox"></div>
        <div class="pl-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> search from anywhere</span></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('mousedown', (e) => { if (e.target === el) paletteClose(); });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-pl]'); if (b) paletteRun(+b.dataset.pl); });
    el.querySelector('#paletteInput').addEventListener('input', (e) => { paletteState.q = e.target.value; paletteState.sel = 0; paletteRender(); });
    el.querySelector('#paletteInput').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteState.sel = Math.min(paletteState.items.length - 1, paletteState.sel + 1); paletteRender(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteState.sel = Math.max(0, paletteState.sel - 1); paletteRender(); }
      else if (e.key === 'Enter') { e.preventDefault(); paletteRun(paletteState.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); paletteClose(); }
    });
  }
  paletteState = { q: '', sel: 0, items: [] };
  el.classList.add('show');
  const input = el.querySelector('#paletteInput');
  input.value = '';
  paletteRender();
  setTimeout(() => input.focus(), 0);
};
const paletteClose = () => { const el = document.getElementById('palette'); if (el) el.classList.remove('show'); };
const paletteRun = (n) => { const it = paletteState.items[n]; if (!it) return; paletteClose(); closeModals(); it.run(); };
const paletteBtn = document.getElementById('paletteBtn');
if (paletteBtn) paletteBtn.addEventListener('click', paletteOpen);
