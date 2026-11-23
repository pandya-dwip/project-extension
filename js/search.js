// Clair — js/search.js: Global search & Command Palette (Ctrl+K Evolution).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Global search & Command Palette (Ctrl+K) ─────────────
// Unified box that runs quick actions (> New Task, > Sync Jira, > Theme, > Help)
// and finds pages, projects, tasks, Jira tickets, test cases, notes, releases, etc.
const PALETTE_PAGES = [
  ['dashboard', 'Dashboard'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['timeline', 'Timeline / Gantt'],
  ['notes', 'Notes'], ['calendar', 'Calendar'], ['tests', 'Project Insights'], ['testcases', 'Test Case Management'],
  ['releases', 'Release Management'], ['releasepoints', 'Release Points'], ['jira', 'Jira'],
  ['qareport', 'Weekly QA report'], ['notifications', 'Notifications'], ['developers', 'Developers'],
  ['activity', 'Activity'], ['settings', 'Settings']
];

let paletteState = { q: '', sel: 0, items: [] };

// Command Parser for "> New Task: [title] @[developer] #[project]"
const parseTaskCommand = (raw) => {
  let text = raw.replace(/^>\s*(new\s*task:?|task:?)/i, '').trim();
  const devMatch = text.match(/@([^\s#]+)/);
  const projMatch = text.match(/#([^\s@]+)/);

  const devQuery = devMatch ? devMatch[1].trim().toLowerCase() : '';
  const projQuery = projMatch ? projMatch[1].trim().toLowerCase() : '';

  let title = text.replace(/@[^\s#]+/g, '').replace(/#[^\s@]+/g, '').replace(/^:\s*/, '').trim();

  let matchedDev = null;
  if (devQuery) {
    matchedDev = (state.developers || []).find(d => d.name.toLowerCase().includes(devQuery));
  }

  let matchedProj = null;
  if (projQuery) {
    matchedProj = (state.projects || []).find(p => p.name.toLowerCase().includes(projQuery));
  }

  return { title, matchedDev, matchedProj, hasParams: !!(title || matchedDev || matchedProj) };
};

// Build list of quick actions and commands
const buildPaletteCommands = (q) => {
  const isCmdMode = q.startsWith('>');
  const cleanQ = q.replace(/^>\s*/, '').toLowerCase();
  const commands = [];

  const matches = (cmdName, ...aliases) => {
    if (!cleanQ) return true;
    return cmdName.toLowerCase().includes(cleanQ) || aliases.some(a => a.toLowerCase().includes(cleanQ));
  };

  // 1. New Task
  if (isCmdMode || matches('New Task', 'task', 'create task', 'add task')) {
    const parsed = parseTaskCommand(q);
    let titleStr = '> New Task: [title] @[developer] #[project]';
    let subStr = 'Create task. Type title, @name for dev, #name for project';

    if (parsed.hasParams) {
      titleStr = `> Create Task: "${parsed.title || 'Untitled Task'}"`;
      const meta = [];
      if (parsed.matchedDev) meta.push(`Assignee: ${parsed.matchedDev.name}`);
      if (parsed.matchedProj) meta.push(`Project: ${parsed.matchedProj.name}`);
      subStr = meta.length ? `${meta.join(' · ')} — Press Enter to open & save` : 'Press Enter to open task modal';
    }

    commands.push({
      title: titleStr,
      sub: subStr,
      badge: 'Action',
      icon: 'plus',
      run: () => {
        openTaskModal();
        setTimeout(() => {
          if (parsed.title) {
            const titleInput = document.getElementById('taskTitle');
            if (titleInput) titleInput.value = parsed.title;
          }
          if (parsed.matchedProj) {
            const projCb = document.querySelector(`input[name="taskProjectCheck"][value="${parsed.matchedProj.id}"]`);
            if (projCb) {
              projCb.checked = true;
              projCb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (parsed.matchedDev) {
            const devCb = document.querySelector(`input[name="taskDevCheck"][value="${parsed.matchedDev.id}"]`);
            if (devCb) devCb.checked = true;
          }
        }, 80);
        showToast(parsed.hasParams ? 'Task draft created from command' : 'New Task opened');
      }
    });
  }

  // 2. Sync Jira Now
  if (isCmdMode || matches('Sync Jira Now', 'jira', 'sync', 'jira sync', 'refresh jira')) {
    commands.push({
      title: '> Sync Jira Now',
      sub: 'Fetch recent tickets, update status cache & create QA tasks',
      badge: 'Jira',
      icon: 'refresh',
      run: () => {
        if (typeof jiraConnected === 'function' && jiraConnected()) {
          showToast('Starting Jira sync…');
          if (typeof runJiraQaSync === 'function') runJiraQaSync('manual');
        } else {
          showToast('Jira is not connected. Configure credentials in Settings → Integrations.', 'error');
          state.settingsSection = 'integrations';
          setView('settings');
        }
      }
    });
  }

  // 3. Toggle Dark/Light Mode
  if (isCmdMode || matches('Toggle Dark/Light Mode', 'theme', 'dark', 'light', 'mode')) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || state.theme === 'dark';
    const target = isDark ? 'light' : 'dark';
    commands.push({
      title: `> Toggle Theme (Switch to ${target.toUpperCase()})`,
      sub: `Currently in ${isDark ? 'Dark' : 'Light'} mode — instantly toggle color palette`,
      badge: 'Theme',
      icon: 'moon',
      run: async () => {
        if (typeof setTheme === 'function') {
          await setTheme(target);
          showToast(`Switched to ${target} mode`, 'success');
        }
      }
    });
  }

  // 4. Export Backup
  if (isCmdMode || matches('Export Backup', 'backup', 'export', 'json backup', 'download')) {
    commands.push({
      title: '> Export Backup',
      sub: 'Download full JSON archive of projects, tasks, releases & test cases',
      badge: 'Backup',
      icon: 'download',
      run: () => {
        if (typeof exportData === 'function') exportData();
      }
    });
  }

  // 5. Go to [Project Name]
  if (isCmdMode || matches('Go to Project', 'goto', 'project', 'open project')) {
    const projQuery = cleanQ.replace(/^(go\s*to\s*|goto\s*|project\s*)/i, '').trim();
    const matchedProjects = (state.projects || []).filter(p => !projQuery || p.name.toLowerCase().includes(projQuery));
    matchedProjects.slice(0, 4).forEach(p => {
      commands.push({
        title: `> Go to: ${p.name}`,
        sub: `Open Project Details · ${p.clientName ? `Client: ${p.clientName}` : 'Project'} · ${p.upcomingVersion || 'v1.0'}`,
        badge: 'Navigate',
        icon: 'folder',
        run: () => {
          setView('projects');
          state.overviewProjectId = p.id;
          render();
        }
      });
    });
  }

  // 6. Help & User Guide
  if (isCmdMode || matches('Help & Guide', 'help', 'guide', 'docs', 'readme', 'relations', 'architecture', 'how')) {
    commands.push({
      title: '> Help: System Guide & Module Relationships',
      sub: 'Learn how each page works, relational data flows, and shortcuts',
      badge: 'Help',
      icon: 'help',
      run: () => {
        if (typeof openHelpModal === 'function') openHelpModal('overview');
      }
    });
    commands.push({
      title: '> Help: Module Relationships Map',
      sub: 'Interactive visual architecture showing how Projects, Tasks, Jira & Releases connect',
      badge: 'Help',
      icon: 'help',
      run: () => {
        if (typeof openHelpModal === 'function') openHelpModal('relations');
      }
    });
  }

  return commands;
};

const paletteSearch = (raw) => {
  const q = raw.trim().toLowerCase();
  const hit = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(q));
  const projName = (id) => ((state.projects || []).find(p => p.id === id) || {}).name || '';
  const groups = [];
  const add = (label, list, max = 6) => { if (list.length) groups.push({ label, items: list.slice(0, max), more: Math.max(0, list.length - max) }); };

  // 1. Commands & Actions
  const commands = buildPaletteCommands(q);
  if (commands.length) {
    add('Quick Actions & Commands', commands, 6);
  }

  // If user explicitly typed a command prefix '>', prioritize commands
  if (q.startsWith('>')) {
    return groups;
  }

  // 2. Navigation Pages
  add('Pages', PALETTE_PAGES.filter(([, l]) => !q || hit(l)).map(([v, l]) => ({
    title: l,
    sub: 'Go to page',
    run: () => {
      if (v === 'qareport') state.qaReportWeek = 0;
      setView(v);
    }
  })), q ? 4 : 16);

  if (!q) {
    // Show top 4 projects when input is empty
    add('Recent Projects', (state.projects || []).slice(0, 4).map(p => ({
      title: p.name,
      sub: [p.clientName, p.assignedTeam].filter(Boolean).join(' · ') || 'Project Overview',
      run: () => { setView('projects'); state.overviewProjectId = p.id; render(); }
    })));
    return groups;
  }

  // 3. Search Collections
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
      if (typeof jiraConnected === 'function' && jiraConnected()) jiraLoadTicket(i.key);
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
      ${g.items.map(it => {
        n++;
        const isSel = n === paletteState.sel;
        const badgeHtml = it.badge ? `<span class="pl-cmd-badge">${escapeHtml(it.badge)}</span>` : '';
        return `
          <button type="button" class="pl-item ${isSel ? 'sel' : ''}" data-pl="${n}" role="option" aria-selected="${isSel}">
            <div class="pl-item-head">
              <span class="pl-title">${highlight(escapeHtml(it.title), paletteState.q.replace(/^>\s*/, '').trim())}</span>
              ${badgeHtml}
            </div>
            <span class="pl-sub">${escapeHtml(it.sub)}</span>
          </button>`;
      }).join('')}
    </div>`).join('') : `<div class="pl-empty">Nothing found for “${escapeHtml(paletteState.q)}”. Try <code>&gt; help</code> or <code>&gt; new task</code></div>`;
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
      <div class="pl-box" role="dialog" aria-modal="true" aria-label="Search Clair and run commands">
        <div class="pl-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" id="paletteInput" placeholder="Type a command (> New Task, > Sync Jira, > Help) or search anything…" autocomplete="off" spellcheck="false" role="combobox" aria-controls="paletteResults" aria-expanded="true" />
          <kbd>Esc</kbd>
        </div>
        <div class="pl-results" id="paletteResults" role="listbox"></div>
        <div class="pl-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> execute</span>
          <span><kbd>&gt;</kbd> command mode</span>
          <span><kbd>Ctrl+K</kbd> anywhere</span>
        </div>
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
