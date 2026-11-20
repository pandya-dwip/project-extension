// Clair — js/projects.js: Projects (list, Kanban, environments, Project Details).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Projects ────────────────────────────────────────────
const renderProjects = () => {
  let projects = state.projects;
  const q = (state.projectSearch || '').toLowerCase().trim();

  if (q) {
    projects = projects.filter(p => {
      const assignedDevs = (state.developers || []).filter(d => (d.projectIds || []).some(pid => String(pid) === String(p.id)));
      const devMatch = assignedDevs.some(d => (d.name || '').toLowerCase().includes(q));
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.clientName || '').toLowerCase().includes(q) ||
        [p.qaUrl, p.prodUrl, p.qaUser, p.prodUser].some(v => (v || '').toLowerCase().includes(q)) ||
        (p.assignedTeam || '').toLowerCase().includes(q) ||
        (p.previousVersion || '').toLowerCase().includes(q) ||
        (p.upcomingVersion || '').toLowerCase().includes(q) ||
        (p.androidPreviousVersion || '').toLowerCase().includes(q) ||
        (p.androidUpcomingVersion || '').toLowerCase().includes(q) ||
        (p.iosPreviousVersion || '').toLowerCase().includes(q) ||
        (p.iosUpcomingVersion || '').toLowerCase().includes(q) ||
        (p.statuses || []).some(s => s.toLowerCase().includes(q)) ||
        devMatch
      );
    });
  }

  if (state.filters.status) {
    projects = projects.filter(p => p.statuses.includes(state.filters.status));
  }

  if (state.filters.previousVersion) {
    projects = projects.filter(p => p.previousVersion === state.filters.previousVersion);
  }

  if (state.filters.upcomingVersion) {
    projects = projects.filter(p => p.upcomingVersion === state.filters.upcomingVersion);
  }

  const previousVersions = [...new Set(state.projects.map(p => p.previousVersion || ''))].filter(Boolean);
  const upcomingVersions = [...new Set(state.projects.map(p => p.upcomingVersion || ''))].filter(Boolean);

  const appProjects = state.projects.filter(p => p.projectType === 'app').length;
  const webProjects = state.projects.filter(p => p.projectType !== 'app').length;
  const activeProjects = state.projects.filter(p =>
    p.statuses && p.statuses.some(s => ['Started', 'Testing', 'In Progress', 'Developer', 'New Development', 'Yet to Start', 'Automation', 'Issue Assigned'].includes(s))
  ).length;
  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Projects',
    subtitle: 'Manage all your active projects, versions, and release timelines.',
    stats: [
      { label: 'Total', value: state.projects.length },
      { label: 'Active', value: activeProjects, color: '#4ade80' },
      { label: 'Apps', value: appProjects, color: '#fb923c' },
      { label: 'Web', value: webProjects, color: '#60a5fa' },
      { label: 'Filtered', value: projects.length },
    ],
    progressBar: {
      pct: state.projects.length === 0 ? 0 : Math.round((activeProjects / state.projects.length) * 100),
      label: `${activeProjects} / ${state.projects.length} active projects`,
      color: 'linear-gradient(90deg, #4ade80, #22c55e)'
    }
  });

  const viewContent = state.projectsViewMode === 'kanban'
    ? renderKanbanBoard(projects, q)
    : (projects.length === 0 ? `
      ${emptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
      q || state.filters.status ? 'No results found' : 'No projects yet',
      q || state.filters.status ? 'Try a different search or filter.' : 'Click "Add Project" in the header to create your first project.'
    )}
    ` : `
      <div class="project-list">
        ${projects.map(p => renderProjectCard(p, q)).join('')}
      </div>
    `);

  return `
    ${hero}

    <div class="filters-bar tk-toolbar std-toolbar">
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="projectSearchInput" placeholder="Search projects, clients, versions, devs…" value="${state.projectSearch || ''}" />
        ${state.projectSearch ? `<button class="page-search-clear" id="clearProjectSearch">✕</button>` : ''}
      </div>
      <select class="filter-select" id="filterStatus" data-filter="status">
        <option value="">All Statuses</option>
        ${STATUS_OPTIONS.map(s => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <select class="filter-select" id="filterPreviousVersion" data-filter="previousVersion">
        <option value="">All Previous Versions</option>
        ${previousVersions.map(v => `<option value="${v}" ${state.filters.previousVersion === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <select class="filter-select" id="filterUpcomingVersion" data-filter="upcomingVersion">
        <option value="">All Upcoming Versions</option>
        ${upcomingVersions.map(v => `<option value="${v}" ${state.filters.upcomingVersion === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      ${(state.filters.status || state.filters.previousVersion || state.filters.upcomingVersion || state.projectSearch) ? `
        <button class="btn-ghost" id="clearProjectsFilters" style="font-size:12px;padding:6px 10px">Clear filters</button>
      ` : ''}
      
      <div class="view-toggle-group">
        <button class="view-toggle-btn ${state.projectsViewMode !== 'kanban' ? 'active' : ''}" data-view-mode="list" aria-label="List View" title="List View">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          List
        </button>
        <button class="view-toggle-btn ${state.projectsViewMode === 'kanban' ? 'active' : ''}" data-view-mode="kanban" aria-label="Kanban View" title="Kanban View">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          Kanban
        </button>
      </div>
      <button type="button" class="btn-primary st-btn tb-new" data-action="new-project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Project</button>
    </div>

    ${viewContent}
  `;
};

// Opens the full Project Details page (renderProjectOverview) from a List/Kanban card.
const projectDetailsBtn = (id) => `
  <button class="pc-details-btn" data-action="open-project-overview" data-id="${id}" title="Open project details page">
    Project Details
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
  </button>`;

const renderKanbanBoard = (projects, q = '') => {
  const columns = [
    { id: 'YET_TO_START', label: 'Yet to Start' },
    { id: 'ON_GOING', label: 'On Going' },
    { id: 'COMPLETED', label: 'Completed' },
    { id: 'MONITORING', label: 'Monitoring' },
    { id: 'ON_HOLD', label: 'On Hold' }
  ];

  return `
    <div class="projects-kanban-board">
      ${columns.map(col => {
    const colProjects = projects.filter(p => (p.overallProjectStatus || 'YET_TO_START') === col.id);
    return `
          <div class="projects-kanban-column" data-status="${col.id}">
            <div class="projects-kanban-column-header">
              <h3 class="projects-kanban-column-title">${col.label}</h3>
              <span class="projects-kanban-column-count">${colProjects.length}</span>
            </div>
            <div class="projects-kanban-cards">
              ${colProjects.length === 0
        ? `<div class="projects-kanban-empty">No projects in this stage</div>`
        : colProjects.map(p => renderKanbanCard(p, q)).join('')}
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
};

const renderKanbanCard = (p, q = '') => {
  const hl = (v) => highlight(escapeHtml(v), q);
  const isApp = p.projectType === 'app';
  const statuses = p.statuses || [];
  const projTasks = state.tasks.filter(t => (t.projectIds || []).includes(p.id));
  const done = projTasks.filter(t => t.status === 'Done').length;
  const pct = projTasks.length ? Math.round(done / projTasks.length * 100) : 0;
  const devs = (state.developers || []).filter(d => (d.projectIds || []).some(pid => String(pid) === String(p.id)));
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'DV';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = p.dueDate && (p.overallProjectStatus || 'YET_TO_START') !== 'COMPLETED' && new Date(p.dueDate) < today;
  const sub = [p.clientName, p.assignedTeam].filter(Boolean);
  const prio = (p.priority || '').toLowerCase();
  return `
    <div class="kanban-card pk-card" data-id="${p.id}" draggable="true">
      <div class="pk-top">
        <div class="pk-titles">
          <h4 class="kanban-card-title">${hl(p.name)}</h4>
          ${sub.length ? `<span class="pk-sub">${sub.map(hl).join(' · ')}</span>` : ''}
        </div>
        <span class="pk-type ${isApp ? 'app' : 'web'}">${isApp ? 'App' : 'Web'}</span>
      </div>
      ${p.description ? `<p class="pk-desc">${hl(p.description)}</p>` : ''}
      ${statuses.length ? `<div class="pk-statuses">${statuses.slice(0, 3).map(st => statusPill(st)).join('')}${statuses.length > 3 ? `<span class="pk-more">+${statuses.length - 3}</span>` : ''}</div>` : ''}
      ${projTasks.length ? `
        <div class="pk-progress" title="${done} of ${projTasks.length} tasks done">
          <div class="pk-progress-head"><span>Tasks ${done}/${projTasks.length}</span><strong>${pct}%</strong></div>
          <div class="pk-bar"><span style="width:${pct}%"></span></div>
        </div>` : ''}
      <div class="pk-foot">
        <div class="pk-devs" title="${escapeHtml(devs.map(d => d.name).join(', ') || 'No developers')}">
          ${devs.length ? devs.slice(0, 4).map(d => `<span class="pk-avatar" style="background:${getAvatarGradient(d.name)}">${initials(d.name)}</span>`).join('') + (devs.length > 4 ? `<span class="pk-avatar more">+${devs.length - 4}</span>` : '') : '<span class="pk-none">No developers</span>'}
        </div>
        <div class="pk-chips">
          ${p.dueDate ? `<span class="pk-due ${overdue ? 'overdue' : ''}" title="${overdue ? 'Overdue — due' : 'Due'} ${fmtDate(p.dueDate)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>` : ''}
          ${p.priority ? `<span class="pk-prio ${prio}">${escapeHtml(p.priority)}</span>` : ''}
        </div>
      </div>
      <div class="pk-actions">
        ${projectDetailsBtn(p.id)}
        <span class="pk-actions-right">
          <button class="icon-btn" data-action="edit-project" data-id="${p.id}" aria-label="Edit project" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-project" data-id="${p.id}" aria-label="Delete project" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </span>
      </div>
    </div>
  `;
};

// ─── Project environments (QA / Production URL and login) ───
const PROJECT_ENVS = [{ key: 'qa', label: 'QA', field: 'Qa' }, { key: 'prod', label: 'Production', field: 'Prod' }];
const envHas = (p, e) => !!(p[e.key + 'Url'] || p[e.key + 'User'] || p[e.key + 'Password']);
const envHost = (url) => { try { return new URL(url).host + (new URL(url).pathname.length > 1 ? new URL(url).pathname : ''); } catch (e) { return url; } };
const envNormalizeUrl = (v) => { v = String(v || '').trim(); return v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? 'https://' + v : v; };
const setProjectEnvFields = (p = {}) => PROJECT_ENVS.forEach(e => ['Url', 'User', 'Password'].forEach(f => {
  const el = document.getElementById(`project${e.field}${f}`);
  if (el) { el.value = p[e.key + f] || ''; if (f === 'Password') el.type = 'password'; }
}));
const readProjectEnvFields = () => Object.fromEntries(PROJECT_ENVS.flatMap(e => [
  [e.key + 'Url', envNormalizeUrl(document.getElementById(`project${e.field}Url`).value)],
  [e.key + 'User', document.getElementById(`project${e.field}User`).value.trim()],
  [e.key + 'Password', document.getElementById(`project${e.field}Password`).value]
]));
// Rows for the project card ('card') or the Project Details page ('page'). Passwords are
// never written into the page: dots, plus show/copy buttons that read them from state.
const ENV_I = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>'
};
const renderProjectEnv = (p, variant = 'card') => {
  const envs = PROJECT_ENVS.filter(e => envHas(p, e));
  if (!envs.length) return variant === 'page' ? '<div class="po-empty"><span>No QA or production details yet — add them from Edit Project.</span></div>' : '';
  const shown = state.envRevealed || (state.envRevealed = new Set());
  const btn = (action, e, field, icon, label) => `<button type="button" class="env-btn" data-action="${action}" data-id="${p.id}" data-env="${e.key}" data-field="${field}" title="${label}" aria-label="${label}">${icon}</button>`;
  const line = (label, value, acts, cls = '') => `<div class="env-line"><span class="env-label">${label}</span><span class="env-val ${cls}" title="${cls ? '' : value}">${value}</span><span class="env-acts">${acts}</span></div>`;
  return `<div class="env-list ${variant}">${envs.map(e => {
    const url = p[e.key + 'Url'], user = p[e.key + 'User'], pw = p[e.key + 'Password'];
    const open = shown.has(p.id + ':' + e.key);
    return `
      <div class="env-card ${e.key}">
        <div class="env-card-head">
          <span class="env-tag ${e.key}">${e.label}</span>
          ${url ? `<a class="env-url" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(url)}"><span>${escapeHtml(envHost(url))}</span>${ENV_I.ext}</a>` : '<span class="env-muted">No URL</span>'}
        </div>
        ${user ? line('User', escapeHtml(user), btn('env-copy', e, 'User', ENV_I.copy, 'Copy username')) : ''}
        ${pw ? line('Password', open ? escapeHtml(pw) : '••••••••', btn('env-reveal', e, 'Password', ENV_I.eye, open ? 'Hide password' : 'Show password') + btn('env-copy', e, 'Password', ENV_I.copy, 'Copy password'), open ? '' : 'masked') : ''}
      </div>`;
  }).join('')}</div>`;
};

const renderProjectCard = (p, q = '') => {
  const isApp = p.projectType === 'app';
  const assignedDevs = (state.developers || []).filter(d => (d.projectIds || []).some(pid => String(pid) === String(p.id)));
  const assignedDevsHtml = `
    <div class="project-assigned-devs-row">
      <span class="project-assigned-devs-label">Developers:</span>
      <div class="project-assigned-devs-list">
        ${assignedDevs.length > 0 ? assignedDevs.map(d => {
    const initials = d.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
    const avatarBg = getAvatarGradient(d.name);
    return `<span class="project-dev-badge" title="${escapeHtml(d.name)}"><span class="project-dev-badge-avatar" style="background:${avatarBg}">${initials}</span><span class="project-dev-badge-name">${highlight(d.name, q)}</span></span>`;
  }).join('') : '<span class="project-dev-badge-empty">Unassigned</span>'}
      </div>
    </div>
  `;

  // ── Version center panel ──
  const verVal = (v) => (!v || v === 'N/A' || v === 'n/a') ? '—' : v;
  const versionPanel = isApp ? `
    <div class="pc-ver-app">
      <div class="pc-ver-box pc-ver-box--app">
        <span class="pc-ver-platform-lbl">Android</span>
        <div class="pc-ver-plat-cols">
          <div class="pc-ver-col">
            <span class="pc-ver-label">Prev</span>
            <span class="pc-ver-value prev">${highlight(verVal(p.androidPreviousVersion), q)}</span>
          </div>
          <div class="pc-ver-col">
            <span class="pc-ver-label">Up</span>
            <span class="pc-ver-value curr">${highlight(verVal(p.androidUpcomingVersion), q)}</span>
          </div>
        </div>
      </div>
      <div class="pc-ver-box pc-ver-box--app">
        <span class="pc-ver-platform-lbl">iOS</span>
        <div class="pc-ver-plat-cols">
          <div class="pc-ver-col">
            <span class="pc-ver-label">Prev</span>
            <span class="pc-ver-value prev">${highlight(verVal(p.iosPreviousVersion), q)}</span>
          </div>
          <div class="pc-ver-col">
            <span class="pc-ver-label">Up</span>
            <span class="pc-ver-value curr">${highlight(verVal(p.iosUpcomingVersion), q)}</span>
          </div>
        </div>
      </div>
    </div>
  ` : `
    <div class="pc-ver-web">
      <div class="pc-ver-box">
        <div class="pc-ver-col left">
          <span class="pc-ver-label">Previous</span>
          <span class="pc-ver-value prev">${highlight(verVal(p.previousVersion), q)}</span>
        </div>
        <div class="pc-ver-col">
          <span class="pc-ver-label">Current</span>
          <span class="pc-ver-value curr">${highlight(verVal(p.upcomingVersion || p.version), q)}</span>
        </div>
      </div>
    </div>
  `;

  // ── Release action buttons ──
  const releaseSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:13px;height:13px;flex-shrink:0;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`;
  const actionButtons = isApp ? `
    <button class="pc-release-btn" data-action="release-platform" data-project-id="${p.id}" data-platform="android">Android Release</button>
    <button class="pc-release-btn" data-action="release-platform" data-project-id="${p.id}" data-platform="ios">iOS Release</button>
  ` : `
    <button class="pc-release-btn" data-action="release-platform" data-project-id="${p.id}" data-platform="web">${releaseSvg} Release Version</button>
  `;

  // ── Release history ──
  const history = p.releaseHistory || [];
  const displayHistory = [...history];
  if (displayHistory.length === 0 && p.lastReleaseAt) {
    displayHistory.push({
      version: p.previousVersion || p.androidPreviousVersion || p.iosPreviousVersion || 'v1.0.0',
      platform: isApp ? 'App' : 'Web',
      releasedAt: p.lastReleaseAt,
      log: p.lastReleaseLog
    });
  }

  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;color:var(--accent);flex-shrink:0;margin-top:1px;"><path d="M20 6L9 17l-5-5"/></svg>`;
  const historyHtml = displayHistory.length
    ? displayHistory.slice(0, 3).map(h => {
      const displayLog = h.log || `${h.platform ? h.platform + ' ' : ''}${h.version} released`;
      return `
          <div class="pc-history-item">
            ${checkSvg}
            <span class="pc-history-text">${displayLog}</span>
            <span class="pc-history-date">${fmtDate(h.releasedAt)}</span>
          </div>`;
    }).join('')
    : `<div class="pc-history-empty">No releases logged yet</div>`;

  const primaryStatus = (p.statuses || []).includes('Stable') ? 'stable' :
    (p.statuses || []).includes('Testing') ? 'testing' :
      ((p.statuses || []).includes('In Progress') || (p.statuses || []).includes('Started')) ? 'in-progress' : 'planned';

  return `
  <div class="project-card status-${primaryStatus}" data-id="${p.id}" draggable="true">

    <!-- Col 1: Project info -->
    <div class="pc-info">
      <div class="pc-name-row">
        <div class="project-name">${highlight(p.name, q)}</div>
        ${isApp ? `<span class="project-type-badge app">App</span>` : `<span class="project-type-badge web">Web</span>`}
      </div>
      ${p.clientName ? `<div class="pc-client" title="Client"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${highlight(escapeHtml(p.clientName), q)}</div>` : ''}
      <div class="project-statuses">
        ${(p.statuses || []).map(s => statusPill(s)).join('')}
      </div>
      ${p.description ? `<div class="project-desc">${highlight(formatCardDescription(p.description), q)}</div>` : ''}
      ${assignedDevsHtml}
      <div class="pc-footer">
        ${projectDetailsBtn(p.id)}
        <div class="card-actions">
          <button class="icon-btn" data-action="edit-project" data-id="${p.id}" aria-label="Edit" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-project" data-id="${p.id}" aria-label="Delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Col 2: Version -->
    <div class="pc-version">
      ${versionPanel}
      ${renderProjectEnv(p, 'card')}
    </div>

    <!-- Col 3: Release history + action -->
    <div class="pc-history">
      <div class="pc-history-header">
        <span class="pc-history-label">Release History</span>
        ${displayHistory.length ? `<button class="clear-history-btn" data-action="clear-release-history" data-id="${p.id}">Clear</button>` : ''}
        <div class="pc-history-meta">
          <span class="pc-history-meta-label">Updated</span>
          <span class="pc-history-meta-date">${p.updatedAt ? fmtDate(p.updatedAt) : '—'}</span>
        </div>
      </div>
      <div class="pc-history-list">${historyHtml}</div>
      <div class="pc-action-btns">${actionButtons}</div>
    </div>

  </div>
`;
};

// ─── Project Overview ────────────────────────────────────
// A sub-page of 'projects' (state.overviewProjectId). Everything shown is derived
// on each render from projects/tasks/releases/developers — nothing is stored, so
// any edit elsewhere in Clair is reflected the next time render() runs.
const PO_OVERALL_STATUS = {
  YET_TO_START: { label: 'Yet to Start', cls: 'yet-to-start' },
  ON_GOING: { label: 'On Going', cls: 'in-progress' },
  COMPLETED: { label: 'Completed', cls: 'completed' },
  MONITORING: { label: 'Monitoring', cls: 'stable' },
  ON_HOLD: { label: 'On Hold', cls: 'on-hold' }
};
const PO_PLATFORM_LABEL = { ANDROID: 'Android', IOS: 'iOS', WEB: 'Web', APP: 'App' };

const openProjectOverview = (id) => {
  if (!state.projects.some(p => p.id === id)) return;
  const ct = document.getElementById('mainContent');
  if (!state.overviewProjectId && ct) state.overviewReturnScroll = ct.scrollTop;
  state.overviewProjectId = id;
  state.overviewTaskFilter = 'all';
  state.overviewTaskSearch = '';
  document.getElementById('pageTitle').textContent = 'Project Details';
  render();
  if (ct) ct.scrollTo({ top: 0, behavior: 'instant' });
};

const closeProjectOverview = () => {
  state.overviewProjectId = null;
  document.getElementById('pageTitle').textContent = 'Projects';
  render();
  const ct = document.getElementById('mainContent');
  if (ct) ct.scrollTo({ top: state.overviewReturnScroll || 0, behavior: 'instant' });
};

// Task status as the app treats it: tasks saved before statuses existed count as To-Do.
const poTaskStatus = (t) => TASK_STATUS_OPTIONS.includes(t.status) ? t.status : 'To-Do';
const poNormVer = (v) => String(v || '').toLowerCase().replace(/^v/, '').trim();

const getProjectOverviewData = (p) => {
  const isApp = p.projectType === 'app';
  const tasks = state.tasks.filter(t => (t.projectIds || []).includes(p.id));
  const countBy = (list, s) => list.filter(t => poTaskStatus(t) === s).length;

  // Developers: anyone assigned to one of this project's tasks, plus anyone linked
  // to the project in Developer Management.
  const devIds = new Set(tasks.flatMap(t => t.developerIds || []));
  (state.developers || []).forEach(d => { if ((d.projectIds || []).includes(p.id)) devIds.add(d.id); });
  const developers = [...devIds].map(id => {
    const dev = (state.developers || []).find(d => d.id === id);
    const dt = tasks.filter(t => (t.developerIds || []).includes(id));
    return {
      id, name: String(dev ? dev.name : id),
      member: !!dev && (dev.projectIds || []).includes(p.id),
      total: dt.length, done: countBy(dt, 'Done'), inProgress: countBy(dt, 'In Progress'),
      todo: countBy(dt, 'To-Do'), onHold: countBy(dt, 'On Hold')
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Version releases logged via the project's "Release Version" buttons (the same
  // data the project card shows, including its legacy single-entry fallback).
  const history = [...(p.releaseHistory || [])];
  if (history.length === 0 && p.lastReleaseAt) {
    history.push({ version: p.previousVersion || p.androidPreviousVersion || p.iosPreviousVersion || '', platform: isApp ? 'APP' : 'WEB', releasedAt: p.lastReleaseAt, log: p.lastReleaseLog });
  }

  // Release Management records linked to this project.
  const records = (state.releases || []).filter(r => (r.projectIds || (r.projectId ? [r.projectId] : [])).includes(p.id));
  const knownVers = new Set([
    ...history.map(h => poNormVer(h.version)),
    ...[p.previousVersion, p.upcomingVersion, p.androidPreviousVersion, p.androidUpcomingVersion, p.iosPreviousVersion, p.iosUpcomingVersion].filter(Boolean).map(poNormVer)
  ]);
  // Platform is not stored on release records; it is read from this project's own
  // version data, and left blank when nothing matches.
  const platformsFor = (versions) => {
    if (!isApp) return ['WEB'];
    const set = new Set();
    versions.map(poNormVer).forEach(v => {
      history.forEach(h => { if (poNormVer(h.version) === v && h.platform && h.platform !== 'APP') set.add(h.platform); });
      if (v && (v === poNormVer(p.androidPreviousVersion) || v === poNormVer(p.androidUpcomingVersion))) set.add('ANDROID');
      if (v && (v === poNormVer(p.iosPreviousVersion) || v === poNormVer(p.iosUpcomingVersion))) set.add('IOS');
    });
    return [...set];
  };

  const recordEntries = records.map(r => {
    const all = r.versions || (r.version ? [r.version] : []);
    const multiProject = (r.projectIds || []).length > 1;
    const own = all.filter(v => knownVers.has(poNormVer(v)));
    const versions = multiProject && own.length ? own : all; // don't show other projects' versions
    return {
      kind: 'record', id: r.id, name: r.name || 'Untitled release', versions, platforms: platformsFor(versions),
      status: r.status || 'Draft', date: r.releaseDate || r.createdAt || '', createdAt: r.createdAt,
      manager: r.managerName || '', notes: r.description || r.notes || ''
    };
  });
  const recordVers = new Set(recordEntries.flatMap(e => e.versions.map(poNormVer)));
  const versionEntries = history
    .filter(h => !recordVers.has(poNormVer(h.version)))
    .map(h => ({
      kind: 'version', id: null, name: h.log || `${h.version} released`, versions: h.version ? [h.version] : [],
      platforms: h.platform ? [h.platform] : [], status: 'Released', date: h.releasedAt || '', manager: '', notes: ''
    }));
  const byDateDesc = (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
  const releases = [...recordEntries, ...versionEntries].sort(byDateDesc);
  const latestRelease = releases.find(r => r.status === 'Released' && r.date);

  // Timeline from recorded dates only (the Activity log has no project reference).
  const events = [];
  const add = (date, text, ref = null, dateOnly = false) => { if (date) events.push({ date, text, ref, dateOnly }); };
  add(p.createdAt, 'Project created');
  if (p.updatedAt && p.updatedAt !== p.createdAt) add(p.updatedAt, 'Project last updated');
  tasks.forEach(t => {
    const ref = { action: 'view-task', id: t.id, label: t.title };
    add(t.createdAt, 'Task created', ref);
    if (poTaskStatus(t) === 'Done') add(t.completedDate, 'Task completed', ref, true); // time is a noon placeholder from the date picker
  });
  recordEntries.forEach(r => {
    const ref = { action: 'view-release', id: r.id, label: r.name };
    add(r.createdAt, 'Release created', ref);
    if (r.status === 'Released' && r.date !== r.createdAt) add(r.date, 'Release published', ref);
  });
  versionEntries.forEach(v => add(v.date, 'Version released', { label: v.name }));
  events.sort(byDateDesc);

  return {
    tasks, developers, releases, events, latestRelease,
    stats: {
      total: tasks.length, done: countBy(tasks, 'Done'), inProgress: countBy(tasks, 'In Progress'),
      todo: countBy(tasks, 'To-Do'), onHold: countBy(tasks, 'On Hold')
    }
  };
};

const renderProjectOverview = () => {
  const p = state.projects.find(x => x.id === state.overviewProjectId);
  if (!p) { state.overviewProjectId = null; return renderProjects(); } // e.g. project was deleted

  const isApp = p.projectType === 'app';
  const d = getProjectOverviewData(p);
  const esc = (s) => escapeHtml(s == null ? '' : String(s));
  const ver = (v) => (!v || /^n\/a$/i.test(v)) ? '—' : esc(v);
  const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const when = (s) => isDateOnly(s) ? fmtDate(s) : `${fmtDate(s)} · ${fmtTime(s)}`;
  const overall = PO_OVERALL_STATUS[p.overallProjectStatus || 'YET_TO_START'] || PO_OVERALL_STATUS.YET_TO_START;
  const statusCls = (s) => s.toLowerCase().replace(' ', '').replace('-', '');
  const pct = d.stats.total ? Math.round((d.stats.done / d.stats.total) * 100) : 0;
  const icon = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    client: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
  };
  const cardHead = (ic, title, count, extra = '') => `
    <div class="po-card-head">
      <span class="po-card-icon">${ic}</span>
      <h3 class="po-card-title">${title}</h3>
      ${count != null ? `<span class="po-card-count">${count}</span>` : ''}
      ${extra}
    </div>`;

  // ── Hero ──
  const verPair = (label, prev, curr) => `
    <div class="po-hero-meta-item">
      <span class="po-hero-meta-label">${label}</span>
      <span class="po-hero-meta-value po-hero-vers"><span class="po-hv prev">${ver(prev)}</span><span class="po-hv-arrow">→</span><span class="po-hv curr">${ver(curr)}</span></span>
    </div>`;
  const metaItem = (label, value) => `
    <div class="po-hero-meta-item"><span class="po-hero-meta-label">${label}</span><span class="po-hero-meta-value">${value}</span></div>`;
  const ringR = 34, ringC = 2 * Math.PI * ringR;
  const hero = `
    <section class="po-hero">
      <div class="po-hero-bar">
        <button class="po-hero-btn" data-action="close-project-overview">${icon.back} Projects</button>
        <button class="po-hero-btn primary" data-action="edit-project" data-id="${p.id}">${icon.edit} Edit Project</button>
      </div>
      <div class="po-hero-body">
        <div class="po-hero-main">
          <div class="po-hero-chips">
            <span class="po-hchip type">${isApp ? 'App' : 'Web'}</span>
            <span class="po-hchip status ${overall.cls}"><i></i>${overall.label}</span>
            ${p.priority ? `<span class="po-hchip prio ${esc(p.priority.toLowerCase())}">${esc(p.priority)} priority</span>` : ''}
          </div>
          <h2 class="po-hero-title">${esc(p.name)}</h2>
          ${p.clientName ? `<div class="po-hero-client">${icon.client}<span>${esc(p.clientName)}</span></div>` : ''}
          ${p.description ? `<div class="po-hero-desc">${formatFullDescription(esc(p.description))}</div>` : ''}
          ${(p.statuses || []).length ? `<div class="po-hero-statuses">${p.statuses.map(s => `<span class="po-hstatus">${esc(s)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="po-hero-ring" title="${d.stats.done} of ${d.stats.total} tasks completed">
          <svg viewBox="0 0 80 80">
            <circle class="track" cx="40" cy="40" r="${ringR}"/>
            <circle class="fill" cx="40" cy="40" r="${ringR}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${(ringC * (1 - pct / 100)).toFixed(2)}"/>
          </svg>
          <div class="po-hero-ring-label"><strong>${pct}%</strong><span>complete</span></div>
          <div class="po-hero-ring-sub">${d.stats.done} / ${d.stats.total} tasks</div>
        </div>
      </div>
      <div class="po-hero-meta">
        ${metaItem('Client', esc(p.clientName) || '—')}
        ${metaItem('Assigned Team', esc(p.assignedTeam) || '—')}
        ${metaItem('Due Date', p.dueDate ? fmtDate(p.dueDate) : '—')}
        ${isApp
      ? verPair('Android', p.androidPreviousVersion, p.androidUpcomingVersion) + verPair('iOS', p.iosPreviousVersion, p.iosUpcomingVersion)
      : verPair('Version', p.previousVersion, p.upcomingVersion || p.version)}
        ${metaItem('Created', p.createdAt ? fmtDate(p.createdAt) : '—')}
        ${metaItem('Last Updated', p.updatedAt ? timeAgo(p.updatedAt) : '—')}
        ${p.jira ? metaItem('Jira Project', `${esc(p.jira.projectKey)} · ${esc(p.jira.projectName)}`) : ''}
      </div>
    </section>`;

  // ── Stat strip ──
  const stat = (label, value, tone) => `<div class="po-stat tone-${tone}"><span class="po-stat-num">${value}</span><span class="po-stat-label">${label}</span></div>`;
  const stats = `
    <div class="po-stats">
      ${stat('Total Tasks', d.stats.total, 'neutral')}
      ${stat('Completed', d.stats.done, 'done')}
      ${stat('In Progress', d.stats.inProgress, 'progress')}
      ${stat('Pending (To-Do)', d.stats.todo, 'todo')}
      ${stat('On Hold', d.stats.onHold, 'hold')}
      ${stat('Developers', d.developers.length, 'team')}
      ${stat('Releases', d.releases.length, 'release')}
      ${stat('Latest Release', d.latestRelease ? fmtDate(d.latestRelease.date) : '—', 'release date')}
    </div>`;

  // ── Releases (rail) ──
  const releaseSection = `
    <section class="po-card">
      ${cardHead(icon.rocket, 'Release History', d.releases.length)}
      ${d.releases.length === 0 ? `<div class="po-empty">${icon.rocket}<span>No releases recorded for this project yet.</span></div>` : `
      <div class="po-rail">
        ${d.releases.map((r, i) => {
    const dt = r.date ? new Date(isDateOnly(r.date) ? r.date + 'T00:00:00' : r.date) : null;
    const valid = dt && !isNaN(dt);
    const isLatest = d.latestRelease && r === d.latestRelease;
    return `
          <div class="po-rail-item ${isLatest ? 'latest' : ''}">
            <div class="po-rail-date">
              ${valid ? `<span class="day">${dt.getDate()}</span><span class="mon">${dt.toLocaleDateString('en-IN', { month: 'short' })} ${dt.getFullYear()}</span>` : '<span class="mon">No date</span>'}
            </div>
            <div class="po-rail-node"><i></i></div>
            <div class="po-rail-card ${r.kind === 'record' ? 'po-row-link' : ''}" ${r.kind === 'record' ? `data-action="view-release" data-id="${r.id}" title="Open release details"` : ''}>
              <div class="po-rail-top">
                <span class="po-rail-name">${esc(r.name)}</span>
                ${isLatest ? '<span class="po-latest-tag">Latest</span>' : ''}
                <span class="status-pill ${statusCls(r.status)} po-rail-status">${esc(r.status)}</span>
              </div>
              <div class="po-rail-tags">
                ${r.versions.map(v => `<span class="po-ver">${esc(v)}</span>`).join('')}
                ${r.platforms.map(pl => `<span class="po-platform ${pl.toLowerCase()}">${PO_PLATFORM_LABEL[pl] || esc(pl)}</span>`).join('')}
                ${r.kind === 'version' ? '<span class="po-kind">Version release</span>' : ''}
                ${r.manager ? `<span class="po-rail-mgr">Manager · <strong>${esc(r.manager)}</strong></span>` : ''}
              </div>
              ${r.notes ? `<div class="po-rail-notes">${esc(trimText(r.notes, 220))}</div>` : ''}
            </div>
          </div>`;
  }).join('')}
      </div>`}
    </section>`;

  // ── Task history ──
  const filter = state.overviewTaskFilter || 'all';
  const q = (state.overviewTaskSearch || '').trim();
  const shownTasks = d.tasks
    .filter(t => filter === 'all' || poTaskStatus(t) === filter)
    .filter(t => !q || (t.title || '').toLowerCase().includes(q) || getTaskDevNames(t).join(' ').toLowerCase().includes(q))
    .sort((a, b) => (Date.parse(b.createdAt || b.startDate) || 0) - (Date.parse(a.createdAt || a.startDate) || 0));
  const filters = [['all', 'All', d.stats.total], ['Done', 'Completed', d.stats.done], ['In Progress', 'In Progress', d.stats.inProgress], ['To-Do', 'To-Do', d.stats.todo], ['On Hold', 'On Hold', d.stats.onHold]];
  const taskSection = `
    <section class="po-card">
      ${cardHead(icon.tasks, 'Task History', d.tasks.length)}
      <div class="po-toolbar">
        <div class="po-seg">
          ${filters.map(([val, label, n]) => `<button class="po-seg-btn ${filter === val ? 'active' : ''}" data-action="po-task-filter" data-filter="${val}">${label}<span>${n}</span></button>`).join('')}
        </div>
        <div class="page-search-wrap po-search">
          <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="page-search-input" id="poTaskSearchInput" placeholder="Search task or developer…" value="${esc(state.overviewTaskSearch || '')}" />
        </div>
      </div>
      ${shownTasks.length === 0 ? `<div class="po-empty">${icon.tasks}<span>${d.tasks.length === 0 ? 'No tasks are linked to this project yet.' : 'No tasks match this filter.'}</span></div>` : `
      <div class="po-table-wrap">
        <table class="po-table po-task-table">
          <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Developer(s)</th><th>Start → End</th><th>Created</th><th>Completed</th><th>Work Done</th></tr></thead>
          <tbody>
            ${shownTasks.map(t => {
    const s = poTaskStatus(t);
    const devs = getTaskDevNames(t);
    const prio = t.priority || 'Medium';
    return `<tr class="po-row-link" data-action="view-task" data-id="${t.id}" title="Open task details">
                <td class="po-task-title">${esc(t.title)}</td>
                <td><span class="po-tstatus ${statusCls(s)}"><i></i>${s}</span></td>
                <td><span class="po-prio ${esc(prio.toLowerCase())}"><i></i>${esc(prio)}</span></td>
                <td class="po-task-devs">${devs.length ? esc(devs.join(', ')) : '<span class="po-muted">—</span>'}</td>
                <td class="nowrap">${t.startDate ? fmtDate(t.startDate) : '—'}<br><span class="po-muted">→ ${t.endDate ? fmtDate(t.endDate) : '—'}</span></td>
                <td class="nowrap">${t.createdAt ? fmtDate(t.createdAt) : '—'}</td>
                <td class="nowrap">${s === 'Done' && t.completedDate ? fmtDate(t.completedDate) : '<span class="po-muted">—</span>'}</td>
                <td class="po-workdone" title="${esc(t.workDone || '')}">${t.workDone ? esc(trimText(t.workDone, 110)) : '<span class="po-muted">—</span>'}</td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>`}
    </section>`;

  // ── Team (developer involvement) ──
  const seg = (n, total, cls) => n ? `<span class="${cls}" style="width:${(n / total) * 100}%"></span>` : '';
  const teamSection = `
    <section class="po-card">
      ${cardHead(icon.team, 'Developer Involvement', d.developers.length)}
      ${d.developers.length === 0 ? `<div class="po-empty">${icon.team}<span>No developers are linked to this project or its tasks yet.</span></div>` : `
      <div class="po-team">
        ${d.developers.map(dv => {
    const initials = dv.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
    const parts = [[dv.done, 'done'], [dv.inProgress, 'in progress'], [dv.todo, 'to-do'], [dv.onHold, 'on hold']].filter(([n]) => n).map(([n, l]) => `${n} ${l}`);
    return `
          <div class="po-dev-row">
            <span class="po-dev-avatar" style="background:${getAvatarGradient(dv.name)}">${esc(initials)}</span>
            <div class="po-dev-info">
              <div class="po-dev-top">
                <span class="po-dev-name">${esc(dv.name)}</span>
                ${dv.member ? '' : '<span class="po-dev-note" title="Not linked to this project in Developer Management">tasks only</span>'}
                <span class="po-dev-total" title="Tasks assigned">${dv.total}</span>
              </div>
              <div class="po-dev-bar">${dv.total ? seg(dv.done, dv.total, 'done') + seg(dv.inProgress, dv.total, 'progress') + seg(dv.todo, dv.total, 'todo') + seg(dv.onHold, dv.total, 'hold') : ''}</div>
              <div class="po-dev-legend">${parts.length ? parts.join(' · ') : 'No tasks yet'}</div>
            </div>
          </div>`;
  }).join('')}
      </div>
      <div class="po-legend"><span><i class="done"></i>Completed</span><span><i class="progress"></i>In Progress</span><span><i class="todo"></i>To-Do</span><span><i class="hold"></i>On Hold</span></div>`}
    </section>`;

  // ── Environments & access ──
  const envSection = `
    <section class="po-card">
      ${cardHead('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', 'Environments & access', null, '<button type="button" class="po-card-note po-card-link" data-action="edit-project" data-id="' + p.id + '">Edit</button>')}
      ${renderProjectEnv(p, 'page')}
    </section>`;

  // ── Timeline ──
  const timelineSection = `
    <section class="po-card">
      ${cardHead(icon.clock, 'Project Timeline', d.events.length, '<span class="po-card-note">From task &amp; release records</span>')}
      ${d.events.length === 0 ? `<div class="po-empty">${icon.clock}<span>No dated history for this project yet.</span></div>` : `
      <ul class="po-timeline">
        ${d.events.map(ev => `
          <li class="po-tl-item">
            <span class="po-tl-dot"></span>
            <div class="po-tl-body">
              <span class="po-tl-text">${ev.text}${ev.ref ? `: ${ev.ref.action
      ? `<button type="button" class="po-tl-ref" data-action="${ev.ref.action}" data-id="${ev.ref.id}">${esc(ev.ref.label)}</button>`
      : `<span class="po-tl-ref-plain">${esc(ev.ref.label)}</span>`}` : ''}</span>
              <span class="po-tl-date">${ev.dateOnly ? fmtDate(ev.date) : when(ev.date)}</span>
            </div>
          </li>`).join('')}
      </ul>`}
    </section>`;

  return `
    <div class="po-page">
      ${hero}
      ${stats}
      ${envSection}
      <div class="po-layout">
        <div class="po-main">${releaseSection}</div>
        <aside class="po-side">${teamSection}${timelineSection}</aside>
      </div>
      ${taskSection}
    </div>`;
};
