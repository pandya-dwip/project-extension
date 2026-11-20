// Clair — js/navigation.js: Navigation, render dispatcher, shared page header.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Navigation ──────────────────────────────────────────
const setView = (view) => {
  if (state.view === 'notes' && state.activeNoteId) {
    saveActiveNote(true);
  }
  state.view = view;
  state.overviewProjectId = null;
  if (view === 'jira') { state.jiraProjectId = null; state.jiraMappingOpen = false; state.jiraIssueOpen = null; }
  if (view === 'testcases') {
    state.testCasePage = 1;
    const ct = document.getElementById('mainContent');
    if (ct) ct.scrollTop = 0;
  }
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === (view === 'qareport' ? 'jira' : view));
  });

  // Close sidebar on mobile after navigation
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar.classList.contains('show')) {
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
  }

  const titles = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    tasks: 'Tasks',
    calendar: 'Calendar',
    tests: 'Project Insights',
    releases: 'Release Management',
    releasepoints: 'Release Points',
    jira: 'Jira',
    notifications: 'Notifications',
    qareport: 'Weekly QA Report',
    testcases: 'Test Case Management',
    notes: 'Notes',
    developers: 'Developer Management',
    activity: 'Activity',
    settings: 'Settings'
  };

  document.getElementById('pageTitle').textContent = titles[view] || 'Clair';
  render();
};

// ─── Render dispatcher ───────────────────────────────────
const render = () => {
  const ct = document.getElementById('mainContent');
  const scrollPos = ct ? ct.scrollTop : 0;

  let boardScrollLeft = state.projectsKanbanBoardScrollLeft || 0;
  let columnScrollTops = state.projectsKanbanColumnScrollTops || {};
  if (state.view === 'projects') {
    const boardEl = document.querySelector('.projects-kanban-board');
    if (boardEl) {
      boardScrollLeft = boardEl.scrollLeft;
      columnScrollTops = {};
      document.querySelectorAll('.projects-kanban-cards').forEach(col => {
        const colColumn = col.closest('.projects-kanban-column');
        const colId = colColumn ? colColumn.dataset.status : null;
        if (colId) {
          columnScrollTops[colId] = col.scrollTop;
        }
      });
      state.projectsKanbanBoardScrollLeft = boardScrollLeft;
      state.projectsKanbanColumnScrollTops = columnScrollTops;
    }
  }

  switch (state.view) {
    case 'dashboard': ct.innerHTML = renderDashboard(); initWeeklyChart(); break;
    case 'projects': ct.innerHTML = state.overviewProjectId ? renderProjectOverview() : renderProjects(); break;
    case 'tasks': ct.innerHTML = renderTasks(); break;
    case 'calendar': ct.innerHTML = renderCalendar(); break;
    case 'tests': ct.innerHTML = renderTests(); break;
    case 'releases': ct.innerHTML = renderReleases(); break;
    case 'releasepoints': ct.innerHTML = renderReleasePoints(); break;
    case 'jira': ct.innerHTML = renderJiraPage(); break;
    case 'notifications': ct.innerHTML = renderNotifications(); break;
    case 'qareport': ct.innerHTML = renderQaReport(); break;
    case 'testcases': ct.innerHTML = renderTestCaseManagement(); break;
    case 'notes': ct.innerHTML = renderNotes(); break;
    case 'developers': ct.innerHTML = renderDevelopers(); break;
    case 'activity': ct.innerHTML = renderActivity(); break;
    case 'settings': ct.innerHTML = renderSettings(); break;
  }

  if (state.view === 'projects' && state.projectsViewMode === 'kanban') {
    const boardEl = document.querySelector('.projects-kanban-board');
    if (boardEl) {
      boardEl.scrollLeft = boardScrollLeft;
      document.querySelectorAll('.projects-kanban-cards').forEach(col => {
        const colColumn = col.closest('.projects-kanban-column');
        const colId = colColumn ? colColumn.dataset.status : null;
        if (colId && columnScrollTops[colId] !== undefined) {
          col.scrollTop = columnScrollTops[colId];
        }
      });
    }
  }

  if (state.view === 'testcases' || state.view === 'releasepoints') {
    if (ct) ct.scrollTop = scrollPos;
  }
  if (state.view === 'testcases') {
    const textareas = document.querySelectorAll('.table-inline-textarea');
    textareas.forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  }
};


// ─── Shared Page Hero Builder ─────────────────────────────
// Page header used across Clair (same look as Release Points, Test Cases, Jira):
// icon + title on the left, stats on the right, and an optional completion ring.
// Stat colours: green/amber/red map to the shared ok/warn/bad tones; anything else
// is applied as given. (`gradient` is ignored — every page uses the shared header.)
const HERO_TONE = { '#4ade80': 'ok', '#22c55e': 'ok', '#fbbf24': 'warn', '#fb923c': 'warn', '#f59e0b': 'warn', '#f87171': 'bad', '#ef4444': 'bad' };
const buildPageHero = ({ icon, title, subtitle, stats, progressBar }) => {
  const statsHtml = stats.map(s => {
    const tone = s.color && HERO_TONE[String(s.color).toLowerCase()];
    return `<div class="rpa-hstat"><strong${tone ? ` class="${tone}"` : s.color ? ` style="color:${s.color}"` : ''}>${s.value}</strong><span>${s.label}</span></div>`;
  }).join('');
  let ring = '';
  if (progressBar) {
    const r = 26, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, Number(progressBar.pct) || 0));
    ring = `
      <div class="rpa-hero-ring" title="${progressBar.label}">
        <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${r}"/><circle class="fill" cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}"/></svg>
        <span><strong>${Math.round(pct)}%</strong><em>${progressBar.label}</em></span>
      </div>`;
  }
  return `
    <section class="rpa-hero page-hero-std">
      <div class="rpa-hero-main">
        <span class="rpa-hero-icon">${icon}</span>
        <div>
          <h2 class="rpa-hero-title">${title}</h2>
          <p class="rpa-hero-sub">${subtitle}</p>
        </div>
      </div>
      <div class="rpa-hero-stats">${statsHtml}${ring}</div>
    </section>
  `;
};

const isCurrentMonth = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};
