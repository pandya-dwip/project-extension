/* ===========================
   Clair — app.js
   Vanilla JS, Chrome Storage API
   =========================== */

// ─── Constants ───────────────────────────────────────────
const STATUS_OPTIONS = [
  'N/A', 'Started', 'Stable', 'Testing', 'Automation',
  'On Hold', 'Yet to Start', 'Completed', 'In Progress',
  'Blocker', 'Issue Assigned', 'Developer', 'New Development'
];

const STATUS_CLASS = {
  'N/A': 'na',
  'Started': 'started',
  'Stable': 'stable',
  'Testing': 'testing',
  'Automation': 'automation',
  'On Hold': 'on-hold',
  'Yet to Start': 'yet-to-start',
  'Completed': 'completed',
  'In Progress': 'in-progress',
  'Blocker': 'blocker',
  'Issue Assigned': 'issue-assigned',
  'Developer': 'developer',
  'New Development': 'new-development',
};

const TASK_STATUS_OPTIONS = ['To-Do', 'In Progress', 'Done', 'On Hold'];

const TEST_TYPE_OPTIONS = ['Issue', 'Enhancement', 'Note'];
const TEST_STATUS_OPTIONS = ['In Dev', 'QA', 'Done', 'Known Issue'];

const TEST_TYPE_CLASS = {
  'Issue': 'test-type-issue',
  'Enhancement': 'test-type-enhancement',
  'Note': 'test-type-note'
};

const TEST_STATUS_CLASS = {
  'In Dev': 'test-status-indev',
  'QA': 'test-status-qa',
  'Done': 'test-status-done',
  'Known Issue': 'test-status-known'
};


// ─── State ───────────────────────────────────────────────
let state = {
  projects: [],
  tasks: [],
  tests: [],
  activity: [],
  developers: [],
  releases: [],
  testCases: [],
  modules: [],
  releasePoints: [],
  activeTestCaseProjectId: null,
  activeTestCaseModuleId: null,
  testCaseSearch: '',
  testCaseFilters: { status: '', priority: '', type: '' },
  selectedTestCaseIds: new Set(),
  testCaseSelectionMode: false,
  visibleTestCaseCount: 100,
  view: 'dashboard',
  searchQuery: '',
  taskSearch: '',
  testSearch: '',
  releaseSearch: '',
  releasePtSearch: '',
  filters: { status: '', previousVersion: '', upcomingVersion: '', date: '', taskProject: '', taskPriority: '', taskDeadline: '' },
  testFilters: { project: '', developer: '', status: '', assignedStatus: '' },
  releaseFilters: { status: '' },
  releasePtFilters: { project: '', releaseType: '', completion: '' }
};

let confirmCallback = null;
let activeDetailType = null;
let activeDetailId = null;

// ─── Storage helpers ─────────────────────────────────────
const storage = {
  async load() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['projects', 'tasks', 'tests', 'activity', 'developers', 'releases', 'testCases', 'modules', 'releasePoints'], data => {
          resolve({
            projects: data.projects || [],
            tasks: data.tasks || [],
            tests: data.tests || [],
            activity: data.activity || [],
            developers: data.developers || [],
            releases: data.releases || [],
            testCases: data.testCases || [],
            modules: data.modules || [],
            releasePoints: data.releasePoints || []
          });
        });
      } else {
        // Fallback for development outside extension
        resolve({
          projects: JSON.parse(localStorage.getItem('clair_projects') || '[]'),
          tasks: JSON.parse(localStorage.getItem('clair_tasks') || '[]'),
          tests: JSON.parse(localStorage.getItem('clair_tests') || '[]'),
          activity: JSON.parse(localStorage.getItem('clair_activity') || '[]'),
          developers: JSON.parse(localStorage.getItem('clair_developers') || '[]'),
          releases: JSON.parse(localStorage.getItem('clair_releases') || '[]'),
          testCases: JSON.parse(localStorage.getItem('clair_testCases') || '[]'),
          modules: JSON.parse(localStorage.getItem('clair_modules') || '[]'),
          releasePoints: JSON.parse(localStorage.getItem('clair_releasePoints') || '[]')
        });
      }
    });
  },

  async save() {
    const payload = {
      projects: state.projects,
      tasks: state.tasks,
      tests: state.tests,
      activity: state.activity,
      developers: state.developers,
      releases: state.releases,
      testCases: state.testCases,
      modules: state.modules,
      releasePoints: state.releasePoints || []
    };
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise(resolve => chrome.storage.local.set(payload, resolve));
    } else {
      Object.entries(payload).forEach(([k, v]) =>
        localStorage.setItem(`clair_${k}`, JSON.stringify(v))
      );
    }
  }
};

// ─── Utility ─────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

const fmtDate = (iso) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
};

const statusPill = (s) =>
  `<span class="status-pill ${STATUS_CLASS[s] || 'na'}">${s}</span>`;

const highlight = (text, query) => {
  if (!query || !text) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escapedQuery})(?![^<>]*>)`, 'gi');
  return String(text).replace(re, '<mark class="search-highlight">$1</mark>');
};

const trimText = (text, maxLength = 120) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const formatCardDescription = (desc) => {
  if (!desc) return '';
  const trimmed = trimText(desc, 120);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return trimmed.replace(urlRegex, (url) => {
    let displayUrl = url;
    if (url.length > 35) {
      try {
        const parsedUrl = new URL(url);
        displayUrl = parsedUrl.hostname + parsedUrl.pathname;
        if (displayUrl.length > 35) {
          displayUrl = displayUrl.substring(0, 32) + '...';
        }
      } catch (e) {
        displayUrl = url.substring(0, 32) + '...';
      }
    }
    return `<a href="${url}" target="_blank" class="card-link" style="color: var(--accent); text-decoration: underline;">${displayUrl}</a>`;
  });
};

const formatFullDescription = (desc) => {
  if (!desc) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return desc.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" class="modal-link" style="color: var(--accent); text-decoration: underline; word-break: break-all;">${url}</a>`;
  });
};

const getTagClass = (tag) => {
  const t = tag.toLowerCase();
  if (t.includes('bug')) return 'tag-bug';
  if (t.includes('feature')) return 'tag-feature';
  if (t.includes('ui')) return 'tag-ui';
  if (t.includes('backend')) return 'tag-backend';
  if (t.includes('high') || t.includes('urgent')) return 'tag-high';
  return 'tag-default';
};

const getDevName = (id) => {
  if (!id) return '–';
  const dev = state.developers.find(d => d.id === id);
  return dev ? dev.name : id;
};

const getTaskStage = (task) => {
  if (task.status === 'Done') return 'done';
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (task.endDate) {
    const end = new Date(task.endDate);
    end.setHours(0, 0, 0, 0);
    if (end < now) {
      return 'overdue';
    }
  }

  if (task.startDate) {
    const start = new Date(task.startDate);
    start.setHours(0, 0, 0, 0);
    if (start > now) {
      return 'upcoming';
    }
  }

  return 'ongoing';
};

const updateDeveloperDropdown = (projectId, selectId, currentValue) => {
  const select = document.getElementById(selectId);
  if (!select) return;
  let devs = state.developers;
  if (projectId) {
    devs = state.developers.filter(d => d.projectIds.includes(projectId));
  }
  select.innerHTML = `<option value="">— None —</option>` +
    devs.map(d => `<option value="${d.id}" ${currentValue === d.id ? 'selected' : ''}>${d.name}</option>`).join('');
};

const getTaskAlert = (endDate, status) => {
  if (!endDate || status === 'Done') return { card: '', text: '' };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(endDate);
  target.setHours(0, 0, 0, 0);
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { card: 'alert-urgent', text: 'date-alert-urgent' };
  if (diffDays === 1) return { card: 'alert-warning', text: 'date-alert-warning' };
  return { card: '', text: '' };
};

// ─── Import / Export ─────────────────────────────────────
const triggerBrowserDownload = (url, filename) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported successfully');
};

const exportData = () => {
  const data = {
    projects: state.projects,
    tasks: state.tasks,
    tests: state.tests,
    activity: state.activity,
    developers: state.developers || [],
    releases: state.releases || [],
    testCases: state.testCases || [],
    modules: state.modules || [],
    releasePoints: state.releasePoints || [],
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `clair-export-${new Date().toISOString().split('T')[0]}.json`;

  if (typeof chrome !== 'undefined' && chrome.downloads) {
    chrome.downloads.download({
      url: url,
      filename: `Extensions/project-extension/Backup/${filename}`,
      conflictAction: 'uniquify',
      saveAs: false
    }, (downloadId) => {
      URL.revokeObjectURL(url);
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        // Fallback to normal download if downloads API failed
        const fallbackUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(fallbackUrl, filename);
      } else {
        showToast('Data exported to Backup folder');
      }
    });
  } else {
    triggerBrowserDownload(url, filename);
  }
};

const importData = (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.projects && data.tasks) {
        state.projects = data.projects;
        state.tasks = data.tasks;
        state.tests = data.tests || [];
        state.activity = data.activity || [];
        state.developers = data.developers || [];
        state.releases = data.releases || [];
        state.testCases = data.testCases || [];
        state.modules = data.modules || [];
        state.releasePoints = data.releasePoints || [];
        await storage.save();
        render();
        updateStorageInfo();
        showToast('Data imported successfully');
      } else {
        showToast('Invalid backup file', 'error');
      }
    } catch (err) {
      showToast('Error parsing file', 'error');
    }
  };
  reader.readAsText(file);
};


// ─── Activity log ─────────────────────────────────────────
const logActivity = (text, type = 'task') => {
  state.activity.unshift({
    id: uid(),
    text,
    type, // 'task' | 'project' | 'delete'
    at: new Date().toISOString()
  });
  if (state.activity.length > 200) state.activity = state.activity.slice(0, 200);
};

// ─── Toast ───────────────────────────────────────────────
const showToast = (msg, type = 'success') => {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot"></div>${msg}`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 200);
  }, 2800);
};

// ─── Storage indicator ───────────────────────────────────
const updateStorageInfo = () => {
  const total = state.projects.length + state.tasks.length + state.tests.length + (state.releases ? state.releases.length : 0) + state.testCases.length + (state.releasePoints ? state.releasePoints.length : 0);
  const pct = Math.min(total / 300 * 100, 100);
  document.getElementById('storageFill').style.width = pct + '%';
  document.getElementById('storageLabel').textContent =
    `${state.projects.length} projects · ${state.tasks.length} tasks · ${state.testCases.length} test cases · ${(state.releases || []).length} releases · ${(state.releasePoints || []).length} release pts`;
};

// ─── Navigation ──────────────────────────────────────────
const setView = (view) => {
  state.view = view;
  if (view === 'testcases') {
    state.visibleTestCaseCount = 100;
    const ct = document.getElementById('mainContent');
    if (ct) ct.scrollTop = 0;
  }
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
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
    tests: 'Project Insights',
    releases: 'Release Management',
    releasepoints: 'Release Points',
    testcases: 'Test Case Management',
    activity: 'Activity',
    settings: 'Settings'
  };

  // Show/hide topbar buttons based on view
  const addReleaseBtn = document.getElementById('addReleaseBtn');
  if (addReleaseBtn) addReleaseBtn.style.display = view === 'releases' ? '' : 'none';

  document.getElementById('pageTitle').textContent = titles[view] || 'Clair';
  render();
};

// ─── Render dispatcher ───────────────────────────────────
const render = () => {
  const ct = document.getElementById('mainContent');
  const scrollPos = ct ? ct.scrollTop : 0;

  switch (state.view) {
    case 'dashboard': ct.innerHTML = renderDashboard(); break;
    case 'projects': ct.innerHTML = renderProjects(); break;
    case 'tasks': ct.innerHTML = renderTasks(); break;
    case 'tests': ct.innerHTML = renderTests(); break;
    case 'releases': ct.innerHTML = renderReleases(); break;
    case 'releasepoints': ct.innerHTML = renderReleasePoints(); break;
    case 'testcases': ct.innerHTML = renderTestCaseManagement(); break;
    case 'activity': ct.innerHTML = renderActivity(); break;
    case 'settings': ct.innerHTML = renderSettings(); break;
  }

  if (state.view === 'testcases') {
    if (ct) ct.scrollTop = scrollPos;
    const textareas = document.querySelectorAll('.table-inline-textarea');
    textareas.forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  }
};


// ─── Shared Page Hero Builder ─────────────────────────────
const buildPageHero = ({ icon, gradient, title, subtitle, stats, progressBar }) => {
  const progressHtml = progressBar ? `
    <div class="rp-hero-progress">
      <div class="rp-hero-progress-track">
        <div class="rp-hero-progress-fill" style="width:${progressBar.pct}%;${progressBar.color ? `background:${progressBar.color};` : ''}"></div>
      </div>
      <span class="rp-hero-progress-label">${progressBar.label}</span>
    </div>
  ` : '';

  const statsHtml = stats.map((s, i) => {
    const divider = i < stats.length - 1 ? `<div class="rp-hero-stat-div"></div>` : '';
    return `
      <div class="rp-hero-stat">
        <div class="rp-hero-stat-num" style="${s.color ? `color:${s.color};` : ''}">${s.value}</div>
        <div class="rp-hero-stat-label">${s.label}</div>
      </div>
      ${divider}
    `;
  }).join('');

  return `
    <div class="rp-page-hero" style="background:${gradient};">
      <div class="rp-hero-content">
        <div class="rp-hero-icon">${icon}</div>
        <div>
          <h2 class="rp-hero-title">${title}</h2>
          <p class="rp-hero-sub">${subtitle}</p>
        </div>
      </div>
      <div class="rp-hero-stats">
        ${statsHtml}
      </div>
      ${progressHtml}
    </div>
  `;
};

// ─── Dashboard ───────────────────────────────────────────
const renderDashboard = () => {
  const totalProjects = state.projects.length;
  const totalTasks = state.tasks.length;
  const totalTests = state.tests.length;
  const totalReleases = (state.releases || []).length;
  const totalReleasePts = (state.releasePoints || []).length;
  const completedTasks = state.tasks.filter(t => t.status === 'Done').length;
  const taskPct = totalTasks === 0 ? 0 : Math.round(completedTasks / totalTasks * 100);

  const recentTasks = state.tasks.slice(0, 5);
  const recentProjects = state.projects.slice(0, 4);
  const recentTests = state.tests.slice(0, 5);

  const statusCount = {};
  state.projects.forEach(p => p.statuses.forEach(s => { statusCount[s] = (statusCount[s] || 0) + 1; }));
  const topStatus = Object.entries(statusCount).sort((a, b) => b[1] - a[1])[0];

  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Dashboard',
    subtitle: 'Overview of all your projects, tasks, insights, and release activity.',
    stats: [
      { label: 'Projects', value: totalProjects },
      { label: 'Tasks', value: totalTasks },
      { label: 'Insights', value: totalTests },
      { label: 'Releases', value: totalReleases },
      { label: 'Release Pts', value: totalReleasePts, color: '#4ade80' },
      { label: 'Tasks Done', value: `${taskPct}%`, color: taskPct === 100 ? '#4ade80' : '#fb923c' },
    ],
    progressBar: { pct: taskPct, label: `${completedTasks} / ${totalTasks} tasks completed`, color: 'linear-gradient(90deg, #4ade80, #22c55e)' }
  });

  return `
    ${hero}

    <div class="two-col" style="gap:16px;margin-bottom:16px;">
      <div class="mini-card">
        <div class="mini-card-title">Recent Projects</div>
        ${recentProjects.length ? recentProjects.map(p => `
          <div class="mini-item">
            <span class="mini-item-name">${p.name}</span>
            <span class="mini-item-meta">Prev: ${p.previousVersion || '–'} · Up: ${p.upcomingVersion || '–'}</span>
          </div>
        `).join('') : '<div class="mini-item" style="color:var(--text-muted);font-size:13px">No projects yet</div>'}
      </div>

      <div class="mini-card">
        <div class="mini-card-title">Recent Tasks</div>
        ${recentTasks.length ? recentTasks.map(t => `
          <div class="mini-item">
            <span class="mini-item-name">${t.title}</span>
            <span class="mini-item-meta">${getDevName(t.developer)}</span>
          </div>
        `).join('') : '<div class="mini-item" style="color:var(--text-muted);font-size:13px">No tasks yet</div>'}
      </div>
    </div>

    <div class="mini-card">
      <div class="mini-card-title">Recent Insights</div>
      ${recentTests.length ? recentTests.map(t => {
    const proj = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
    return `
          <div class="mini-item">
            <span class="mini-item-name">${t.title}</span>
            <span class="mini-item-meta">${proj ? proj.name : t.type || '–'}</span>
          </div>
        `;
  }).join('') : '<div class="mini-item" style="color:var(--text-muted);font-size:13px">No insights yet</div>'}
    </div>
  `;
};


// ─── Projects ────────────────────────────────────────────
const renderProjects = () => {
  let projects = state.projects;
  const q = state.searchQuery.toLowerCase();

  if (q) {
    projects = projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.previousVersion || '').toLowerCase().includes(q) ||
      (p.upcomingVersion || '').toLowerCase().includes(q)
    );
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

  return `
    ${hero}

    <div class="filters-bar">
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
      ${(state.filters.status || state.filters.previousVersion || state.filters.upcomingVersion) ? `
        <button class="btn-ghost" id="clearProjectsFilters" style="font-size:12px;padding:6px 10px">Clear filters</button>
      ` : ''}
      <span class="section-count" style="margin-left:auto;">${projects.length} project${projects.length !== 1 ? 's' : ''}</span>
    </div>

    ${projects.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
        </div>
        <h3>${q || state.filters.status ? 'No results found' : 'No projects yet'}</h3>
        <p>${q || state.filters.status ? 'Try a different search or filter.' : 'Click "Add Project" in the header to create your first project.'}</p>
      </div>
    ` : `
      <div class="card-grid">
        ${projects.map(p => renderProjectCard(p, q)).join('')}
      </div>
    `}
  `;
};


const renderProjectCard = (p, q = '') => {
  const isApp = p.projectType === 'app';

  const versionBlock = isApp ? `
    <div class="project-release-timeline" style="display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:11.5px;background:var(--surface-2);padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="platform-badge android">Android</span>
        <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:500;">Prev:</span>
        <strong style="color:var(--text-secondary);">${highlight(p.androidPreviousVersion || '–', q)}</strong>
        <span style="color:var(--text-muted);font-weight:300;">→</span>
        <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:500;">Up:</span>
        <strong style="color:var(--accent);">${highlight(p.androidUpcomingVersion || '–', q)}</strong>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="platform-badge ios">iOS</span>
        <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:500;">Prev:</span>
        <strong style="color:var(--text-secondary);">${highlight(p.iosPreviousVersion || '–', q)}</strong>
        <span style="color:var(--text-muted);font-weight:300;">→</span>
        <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:500;">Up:</span>
        <strong style="color:var(--accent);">${highlight(p.iosUpcomingVersion || '–', q)}</strong>
      </div>
    </div>
  ` : `
    <div class="project-release-timeline" style="display:flex;align-items:center;gap:8px;margin:12px 0;font-size:11.5px;color:var(--text-secondary);background:var(--surface-2);padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:500;">Previous:</span>
        <strong style="color:var(--text-secondary);">${highlight(p.previousVersion || '–', q)}</strong>
      </div>
      <div style="color:var(--text-muted);font-weight:300;">→</div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:500;">Upcoming:</span>
        <strong style="color:var(--accent);">${highlight(p.upcomingVersion || p.version || '–', q)}</strong>
      </div>
    </div>
  `;

  const primaryStatus = (p.statuses || []).includes('Stable') ? 'stable' :
    (p.statuses || []).includes('Testing') ? 'testing' :
      ((p.statuses || []).includes('In Progress') || (p.statuses || []).includes('Started')) ? 'in-progress' : 'planned';

  return `
  <div class="project-card status-${primaryStatus}" data-id="${p.id}">
    <div class="project-card-top">
      <div class="project-name">${highlight(p.name, q)}</div>
      ${isApp ? `<span class="project-type-badge app">App</span>` : `<span class="project-type-badge web">Web</span>`}
    </div>
    ${p.description ? `<div class="project-desc">${highlight(formatCardDescription(p.description), q)}</div>` : ''}
    ${versionBlock}
    <div class="project-statuses">
      ${(p.statuses || []).map(s => statusPill(s)).join('')}
    </div>
    <div class="project-card-footer">
      <span class="card-time">Updated ${timeAgo(p.updatedAt)}</span>
      <div class="card-actions">
        <button class="icon-btn" data-action="edit-project" data-id="${p.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-project" data-id="${p.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  </div>
`;
};

// ─── Tasks ───────────────────────────────────────────────
const renderTasks = () => {
  let tasks = state.tasks;
  const q = state.taskSearch.toLowerCase();

  if (q) {
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      getDevName(t.developer).toLowerCase().includes(q)
    );
  }

  if (state.filters.date) {
    tasks = tasks.filter(t => t.startDate === state.filters.date || t.endDate === state.filters.date);
  }

  if (state.filters.taskProject) {
    tasks = tasks.filter(t => t.projectId === state.filters.taskProject);
  }

  if (state.filters.taskPriority) {
    tasks = tasks.filter(t => (t.priority || 'Medium').toLowerCase() === state.filters.taskPriority.toLowerCase());
  }

  if (state.filters.taskDeadline) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayTime = now.getTime();

    tasks = tasks.filter(t => {
      if (!t.endDate || t.status === 'Done') return false;
      const end = new Date(t.endDate);
      end.setHours(0, 0, 0, 0);
      const endTime = end.getTime();

      const diffDays = Math.ceil((endTime - todayTime) / (1000 * 60 * 60 * 24));

      if (state.filters.taskDeadline === 'overdue') {
        return diffDays < 0;
      } else if (state.filters.taskDeadline === '3days') {
        return diffDays >= 0 && diffDays <= 3;
      } else if (state.filters.taskDeadline === 'week') {
        return diffDays >= 0 && diffDays <= 7;
      } else if (state.filters.taskDeadline === '15days') {
        return diffDays >= 0 && diffDays <= 15;
      }
      return true;
    });
  }

  const projectOptions = state.projects.map(p =>
    `<option value="${p.id}" ${state.filters.taskProject === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const totalTasks = state.tasks.length;
  const todoCount = state.tasks.filter(t => (t.status || 'To-Do') === 'To-Do').length;
  const inProgressCount = state.tasks.filter(t => t.status === 'In Progress').length;
  const doneCount = state.tasks.filter(t => t.status === 'Done').length;
  const overdue = state.tasks.filter(t => {
    if (!t.endDate || t.status === 'Done') return false;
    return new Date(t.endDate) < new Date();
  }).length;
  const donePct = totalTasks === 0 ? 0 : Math.round(doneCount / totalTasks * 100);

  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Kanban Board',
    subtitle: 'Plan, track, and manage your tasks across all projects.',
    stats: [
      { label: 'Total', value: totalTasks },
      { label: 'To-Do', value: todoCount },
      { label: 'In Progress', value: inProgressCount, color: '#fbbf24' },
      { label: 'Done', value: doneCount, color: '#4ade80' },
      { label: 'Overdue', value: overdue, color: overdue > 0 ? '#f87171' : undefined },
      { label: 'Completion', value: `${donePct}%`, color: donePct === 100 ? '#4ade80' : '#fb923c' },
    ],
    progressBar: { pct: donePct, label: `${doneCount} / ${totalTasks} tasks done`, color: 'linear-gradient(90deg, #4ade80, #22c55e)' }
  });

  return `
    ${hero}

    <div class="filters-bar">
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="taskSearchInput" placeholder="Search tasks…" value="${state.taskSearch}" />
        ${state.taskSearch ? `<button class="page-search-clear" id="clearTaskSearch">✕</button>` : ''}
      </div>
      <input type="date" class="filter-select" id="filterDate" data-filter="date" value="${state.filters.date || ''}" style="cursor:pointer" />
      <select class="filter-select" id="filterTaskProject" data-filter="taskProject">
        <option value="">All Projects</option>
        ${projectOptions}
      </select>
      <select class="filter-select" id="filterTaskPriority" data-filter="taskPriority">
        <option value="">All Priorities</option>
        <option value="Urgent" ${state.filters.taskPriority === 'Urgent' ? 'selected' : ''}>Urgent</option>
        <option value="High" ${state.filters.taskPriority === 'High' ? 'selected' : ''}>High</option>
        <option value="Medium" ${state.filters.taskPriority === 'Medium' ? 'selected' : ''}>Medium</option>
        <option value="Low" ${state.filters.taskPriority === 'Low' ? 'selected' : ''}>Low</option>
      </select>
      <select class="filter-select" id="filterTaskDeadline" data-filter="taskDeadline">
        <option value="">All Deadlines</option>
        <option value="overdue" ${state.filters.taskDeadline === 'overdue' ? 'selected' : ''}>Overdue</option>
        <option value="3days" ${state.filters.taskDeadline === '3days' ? 'selected' : ''}>Within 3 Days</option>
        <option value="week" ${state.filters.taskDeadline === 'week' ? 'selected' : ''}>Within a Week</option>
        <option value="15days" ${state.filters.taskDeadline === '15days' ? 'selected' : ''}>Within 15 Days</option>
      </select>
      ${(state.filters.date || state.filters.taskProject || state.filters.taskPriority || state.filters.taskDeadline) ? `
        <button class="btn-ghost" id="clearTasksFilters" style="font-size:12px;padding:6px 10px">Clear filters</button>
      ` : ''}

    </div>

    <div class="kanban-board">
      ${TASK_STATUS_OPTIONS.map(status => {
    const columnTasks = tasks.filter(t => (t.status || 'To-Do') === status);
    return `
          <div class="kanban-column" data-status="${status}">
            <div class="kanban-column-header">
              <span class="kanban-column-title">${status}</span>
              <span class="kanban-column-count">${columnTasks.length}</span>
            </div>
            <div class="kanban-tasks">
              ${columnTasks.map(t => renderTaskCard(t, q)).join('')}
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
};

// ─── Project Insights ────────────────────────────────────
const testTypePill = (type) =>
  `<span class="test-pill ${TEST_TYPE_CLASS[type] || ''}">${type}</span>`;

const testStatusPill = (status) =>
  `<span class="test-pill ${TEST_STATUS_CLASS[status] || ''}">${status}</span>`;

const testAssignedPill = (assignedStatus) => {
  const status = assignedStatus || 'Yet to be assigned';
  const cls = status === 'Assigned' ? 'test-assigned-assigned' : 'test-assigned-yet';
  return `<span class="test-pill ${cls}">${status}</span>`;
};

const renderTests = () => {
  let tests = state.tests;
  const q = state.testSearch.toLowerCase();

  if (q) {
    tests = tests.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      getDevName(t.developer).toLowerCase().includes(q)
    );
  }

  if (state.testFilters.project) {
    tests = tests.filter(t => t.projectId === state.testFilters.project);
  }

  if (state.testFilters.developer) {
    tests = tests.filter(t => t.developer === state.testFilters.developer);
  }

  if (state.testFilters.status) {
    tests = tests.filter(t => t.status === state.testFilters.status);
  }

  if (state.testFilters.assignedStatus) {
    tests = tests.filter(t => (t.assignedStatus || 'Yet to be assigned') === state.testFilters.assignedStatus);
  }

  const projectOptions = state.projects.map(p =>
    `<option value="${p.id}" ${state.testFilters.project === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const devOptions = state.developers.map(d =>
    `<option value="${d.id}" ${state.testFilters.developer === d.id ? 'selected' : ''}>${d.name}</option>`
  ).join('');

  const statusOptions = TEST_STATUS_OPTIONS.map(s =>
    `<option value="${s}" ${state.testFilters.status === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const totalTests = state.tests.length;
  const assignedCount = state.tests.filter(t => t.assignedStatus === 'Assigned').length;
  const issueCount = state.tests.filter(t => (t.type || 'Issue') === 'Issue').length;
  const featureCount = state.tests.filter(t => t.type === 'Feature').length;
  const inDevCount = state.tests.filter(t => (t.status || 'In Dev') === 'In Dev').length;
  const resolvedCount = state.tests.filter(t => t.status === 'Done' || t.status === 'Resolved' || t.status === 'Closed').length;

  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Project Insights',
    subtitle: 'Track issues, features, bugs and insights across your team.',
    stats: [
      { label: 'Total', value: totalTests },
      { label: 'Issues', value: issueCount, color: '#f87171' },
      { label: 'Features', value: featureCount, color: '#60a5fa' },
      { label: 'In Dev', value: inDevCount, color: '#fbbf24' },
      { label: 'Resolved', value: resolvedCount, color: '#4ade80' },
      { label: 'Assigned', value: assignedCount, color: '#a78bfa' },
    ],
    progressBar: {
      pct: totalTests === 0 ? 0 : Math.round((resolvedCount / totalTests) * 100),
      label: `${resolvedCount} / ${totalTests} insights resolved`,
      color: 'linear-gradient(90deg, #4ade80, #22c55e)'
    }
  });

  return `
    ${hero}

    <div class="filters-bar">
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="testSearchInput" placeholder="Search tests…" value="${state.testSearch}" />
        ${state.testSearch ? `<button class="page-search-clear" id="clearTestSearch">✕</button>` : ''}
      </div>

      <select class="filter-select" id="filterTestProject" data-testfilter="project">
        <option value="">All Projects</option>
        ${projectOptions}
      </select>
      <select class="filter-select" id="filterTestDeveloper" data-testfilter="developer">
        <option value="">All Developers</option>
        ${devOptions}
      </select>
      <select class="filter-select" id="filterTestStatus" data-testfilter="status">
        <option value="">All Statuses</option>
        ${statusOptions}
      </select>
      <select class="filter-select" id="filterTestAssignedStatus" data-testfilter="assignedStatus">
        <option value="">All Assigned Statuses</option>
        <option value="Assigned" ${state.testFilters.assignedStatus === 'Assigned' ? 'selected' : ''}>Assigned</option>
        <option value="Yet to be assigned" ${state.testFilters.assignedStatus === 'Yet to be assigned' ? 'selected' : ''}>Yet to be assigned</option>
      </select>
      ${(state.testFilters.project || state.testFilters.developer || state.testFilters.status || state.testFilters.assignedStatus) ? `
        <button class="btn-ghost" id="clearTestFilters" style="font-size:12px;padding:6px 10px">Clear filters</button>
      ` : ''}
    </div>

    <div class="test-kanban-board">
      ${TEST_TYPE_OPTIONS.map(type => {
    const col = tests.filter(t => (t.type || 'Issue') === type);
    return `
          <div class="test-kanban-column" data-type="${type}">
            <div class="kanban-column-header">
              <span class="kanban-column-title test-col-${type.toLowerCase()}">${type}</span>
              <span class="kanban-column-count">${col.length}</span>
            </div>
            <div class="kanban-tasks">
              ${col.map(t => renderTestCard(t, q)).join('')}
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
};

const renderTestCard = (t, q = '') => {
  const proj = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
  const typeClass = `test-type-${(t.type || 'Issue').toLowerCase()}`;
  const statusClass = `test-status-${(t.status || 'In Dev').toLowerCase().replace(' ', '-')}`;
  return `
    <div class="task-card test-card ${typeClass} ${statusClass}" data-id="${t.id}" draggable="true">
      <div class="task-body">
        <div class="task-title">${highlight(t.title, q)}</div>
        ${t.description ? `<div class="task-desc">${highlight(formatCardDescription(t.description), q)}</div>` : ''}
        <div class="test-pills" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">
          ${testStatusPill(t.status || 'In Dev')}
          ${testAssignedPill(t.assignedStatus)}
          ${proj ? `<span class="test-pill test-proj">${proj.name}</span>` : ''}
        </div>
        <div class="task-meta" style="margin-top:6px">
          ${t.developer ? `
            <span class="task-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              ${highlight(getDevName(t.developer), q)}
            </span>
          ` : ''}
          <span class="task-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            ${timeAgo(t.updatedAt || t.createdAt)}
          </span>
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit-test" data-id="${t.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-test" data-id="${t.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  `;
};

// ─── Test Modal ───────────────────────────────────────────
const openTestModal = (id = null) => {
  const title = document.getElementById('testModalTitle');
  const sel = document.getElementById('testProject');
  sel.innerHTML = `<option value="">— None —</option>` +
    state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  if (id) {
    const t = state.tests.find(x => x.id === id);
    if (!t) return;
    title.textContent = 'Edit Insight';
    document.getElementById('testId').value = t.id;
    document.getElementById('testTitle').value = t.title;
    document.getElementById('testDesc').value = t.description || '';
    document.getElementById('testProject').value = t.projectId || '';
    updateDeveloperDropdown(t.projectId || '', 'testDeveloper', t.developer || '');
    document.getElementById('testType').value = t.type || 'Issue';
    document.getElementById('testStatus').value = t.status || 'In Dev';
    document.getElementById('testAssignedStatus').value = t.assignedStatus || 'Yet to be assigned';
  } else {
    title.textContent = 'New Insight';
    document.getElementById('testId').value = '';
    document.getElementById('testTitle').value = '';
    document.getElementById('testDesc').value = '';
    document.getElementById('testProject').value = '';
    updateDeveloperDropdown('', 'testDeveloper', '');
    document.getElementById('testType').value = 'Issue';
    document.getElementById('testStatus').value = 'In Dev';
    document.getElementById('testAssignedStatus').value = 'Yet to be assigned';
  }

  showModal('testModal');
};

const saveTest = async () => {
  const id = document.getElementById('testId').value;
  const title = document.getElementById('testTitle').value.trim();
  const desc = document.getElementById('testDesc').value.trim();
  const developer = document.getElementById('testDeveloper').value;
  const type = document.getElementById('testType').value;
  const status = document.getElementById('testStatus').value;
  const projectId = document.getElementById('testProject').value;
  const assignedStatus = document.getElementById('testAssignedStatus').value;

  if (!title) { showToast('Title is required', 'error'); return; }

  const now = new Date().toISOString();

  if (id) {
    const idx = state.tests.findIndex(t => t.id === id);
    if (idx === -1) return;
    state.tests[idx] = { ...state.tests[idx], title, description: desc, developer, type, status, projectId, assignedStatus, updatedAt: now };
    logActivity(`Updated test "${title}"`, 'task');
    showToast('Test updated');
  } else {
    state.tests.unshift({ id: uid(), title, description: desc, developer, type, status, projectId, assignedStatus, createdAt: now, updatedAt: now });
    logActivity(`Added test "${title}"`, 'task');
    showToast('Test added');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteTest = (id) => {
  const t = state.tests.find(x => x.id === id);
  if (!t) return;
  document.getElementById('confirmMessage').textContent = `Delete test "${t.title}"? This action cannot be undone.`;
  confirmCallback = () => deleteTest(id);
  showModal('confirmModal');
};

const deleteTest = async (id) => {
  const t = state.tests.find(x => x.id === id);
  if (!t) return;
  state.tests = state.tests.filter(x => x.id !== id);
  logActivity(`Deleted test "${t.title}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Test deleted');
};

// ─── Drag and Drop ───────────────────────────────────────
window.allowDrop = (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};

window.handleDragLeave = (e) => {
  e.currentTarget.classList.remove('drag-over');
};

window.dropTask = async (taskId, newStatus) => {
  const task = state.tasks.find(t => t.id === taskId);
  if (task && task.status !== newStatus) {
    const oldStatus = task.status || 'To-Do';
    task.status = newStatus;
    task.updatedAt = new Date().toISOString();
    logActivity(`Moved task "${task.title}" from ${oldStatus} to ${newStatus}`, 'task');
    await storage.save();
    render();
    showToast(`Task moved to ${newStatus}`);
  }
};


const renderTaskCard = (t, q = '') => {
  const proj = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
  const alerts = getTaskAlert(t.endDate, t.status);
  const stage = getTaskStage(t);
  const stageClass = `stage-${stage}`;

  return `
    <div class="task-card ${stageClass} ${alerts.card}" data-id="${t.id}" draggable="true">
      <!-- Top header row for Project Tag and Priority Badge -->
      <div class="task-card-header-row">
        ${proj ? `<span class="task-project-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:10px;height:10px;margin-right:4px;"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>${proj.name}</span>` : '<span></span>'}
        <span class="priority-pill ${String(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
      </div>

      <!-- Title row containing Checkbox and Title -->
      <div class="task-title-row">
        <div class="task-check" title="Mark done" data-action="complete-task"></div>
        <div class="task-title">${highlight(t.title, q)}</div>
      </div>

      <!-- Indented section for Description, Tags, and Footer Meta -->
      <div class="task-indented-content">
        ${t.description ? `<div class="task-desc">${highlight(formatCardDescription(t.description), q)}</div>` : ''}
        
        ${(t.tags && t.tags.length) ? `
          <div class="task-tags">
            ${t.tags.map(tag => `<span class="tag-pill ${getTagClass(tag)}">${highlight(tag, q)}</span>`).join('')}
          </div>
        ` : ''}

        <!-- Footer metadata rows -->
        <div class="task-meta-footer">
          <div class="task-meta-row">
            ${t.developer ? `
              <span class="task-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                ${highlight(getDevName(t.developer), q)}
              </span>
            ` : `<span class="task-meta-item"></span>`}
            <span class="task-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${timeAgo(t.updatedAt || t.createdAt)}
            </span>
          </div>
          ${(t.startDate || t.endDate) ? `
            <div class="task-meta-row">
              <span class="task-meta-item ${alerts.text}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                ${t.startDate ? fmtDate(t.startDate) : '–'} ${t.endDate ? `→ ${fmtDate(t.endDate)}` : ''}
              </span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Actions (Edit/Delete) floating overlay -->
      <div class="task-actions">
        <button class="icon-btn" data-action="edit-task" data-id="${t.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-task" data-id="${t.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  `;
};

window.dragTask = (e) => {
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
  e.currentTarget.classList.add('dragging');
};

document.addEventListener('dragend', e => {
  if (e.target.classList && e.target.classList.contains('task-card')) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  }
});

window.completeTask = async (id) => {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    const oldStatus = task.status || 'To-Do';
    if (oldStatus === 'Done') return; // Already done
    task.status = 'Done';
    task.updatedAt = new Date().toISOString();
    logActivity(`Completed task "${task.title}"`, 'task');
    await storage.save();
    render();
    showToast('Task marked as Done');
  }
};


// ─── Activity ────────────────────────────────────────────
const renderActivity = () => {
  const totalEvents = state.activity.length;
  const todayEvents = state.activity.filter(a => {
    const d = new Date(a.at); const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const taskEvents = state.activity.filter(a => a.type === 'task').length;
  const deleteEvents = state.activity.filter(a => a.type === 'delete').length;
  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Activity Feed',
    subtitle: 'A chronological log of every action taken in the system.',
    stats: [
      { label: 'Total Events', value: totalEvents },
      { label: 'Today', value: todayEvents, color: '#4ade80' },
      { label: 'Task Events', value: taskEvents, color: '#60a5fa' },
      { label: 'Deletions', value: deleteEvents, color: deleteEvents > 0 ? '#f87171' : undefined },
    ],
    progressBar: {
      pct: totalEvents === 0 ? 0 : Math.min(100, Math.round((todayEvents / totalEvents) * 100)),
      label: `${todayEvents} / ${totalEvents} events logged today`,
      color: 'linear-gradient(90deg, #4ade80, #22c55e)'
    }
  });
  return `
    ${hero}
    ${state.activity.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <h3>No activity yet</h3>
        <p>Start creating projects and tasks — every action will be tracked here.</p>
      </div>
    ` : `
      <div class="activity-list">
        ${state.activity.map(a => `
          <div class="activity-item event-${a.type}">
            <div class="activity-dot ${a.type}"></div>
            <div class="activity-content">
              <div class="activity-text">${a.text}</div>
              <div class="activity-time">${fmtDate(a.at)} · ${fmtTime(a.at)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
};

// ─── Settings ────────────────────────────────────────────
const renderSettings = () => {
  const dbSizeKb = ((JSON.stringify(state).length) / 1024).toFixed(1);
  const settingsHero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'System Settings',
    subtitle: 'Manage developers, data storage, and application configuration.',
    stats: [
      { label: 'Projects', value: state.projects.length },
      { label: 'Tasks', value: state.tasks.length },
      { label: 'Developers', value: (state.developers || []).length, color: '#60a5fa' },
      { label: 'DB Size', value: `${dbSizeKb} KB`, color: '#a78bfa' },
      { label: 'Activities', value: state.activity.length },
    ],
    progressBar: {
      pct: Math.min(100, Math.round((parseFloat(dbSizeKb) / 5120) * 100)),
      label: `${dbSizeKb} KB / 5120 KB storage utilized`,
      color: 'linear-gradient(90deg, #4ade80, #22c55e)'
    }
  });
  return `
    ${settingsHero}


  <div class="settings-container">
    <!-- Left Pane: General Info & Actions -->
    <div class="settings-left-col">
      
      <!-- General Information -->
      <div class="settings-card">
        <div class="settings-info">
          <div class="settings-header-wrap">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              System Overview
            </h3>
            <p>General database metrics and statistics.</p>
          </div>
          
          <div class="settings-stats-grid">
            <div class="settings-stat-box">
              <span class="stat-num num-projects">${state.projects.length}</span>
              <span class="stat-lbl">Projects</span>
            </div>
            <div class="settings-stat-box">
              <span class="stat-num num-tasks">${state.tasks.length}</span>
              <span class="stat-lbl">Tasks</span>
            </div>
            <div class="settings-stat-box">
              <span class="stat-num num-tests">${state.tests.length}</span>
              <span class="stat-lbl">Tests</span>
            </div>
            <div class="settings-stat-box">
              <span class="stat-num num-db">${((JSON.stringify(state).length) / 1024).toFixed(1)} KB</span>
              <span class="stat-lbl">DB Size</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions (Backup / Restore) -->
      <div class="settings-card">
        <div class="settings-info">
          <div class="settings-header-wrap">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Data Portability
            </h3>
            <p>Backup or restore your system settings.</p>
          </div>
          
          <div class="portability-btn-group">
            <button class="btn-ghost" id="settingsExportBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px; margin-right: 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export System Backup
            </button>
            <button class="btn-ghost" id="settingsImportBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px; margin-right: 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import System Backup
            </button>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="settings-card danger-zone">
        <div class="settings-info">
          <div class="settings-header-wrap" style="border-bottom-color: rgba(192, 57, 43, 0.15);">
            <h3 style="color: var(--danger);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
              Danger Zone
            </h3>
            <p>Wipe all database records. A backup file is exported first.</p>
          </div>
          
          <button class="btn-danger" id="clearDataBtn" style="width: 100%; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 8px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            Clear Database
          </button>
        </div>
      </div>

    </div>

    <!-- Right Pane: Developer Management -->
    <div class="settings-card">
      <div class="settings-info" style="margin-bottom: 24px;">
        <div class="settings-header-wrap">
          <h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Developer Management
          </h3>
          <p>Link projects to developers for automated selection drop-downs.</p>
        </div>
      </div>

      <div class="dev-manager-split">
        
        <!-- Add / Edit Form -->
        <div class="dev-form-card">
          <h4 class="dev-form-title" id="devFormTitle">Add New Developer</h4>
          <input type="hidden" id="editDevId" value="" />
          
          <div class="form-group">
            <label>Developer Name <span class="req">*</span></label>
            <input type="text" id="devNameInput" placeholder="e.g. John Doe" />
          </div>
          
          <div class="form-group">
            <label>Link Projects</label>
            <div class="dev-project-checklist">
              ${state.projects.map(p => `
                <label class="dev-project-label">
                  <input type="checkbox" name="devProjectCheck" value="${p.id}" />
                  <span>${p.name}</span>
                </label>
              `).join('') || '<span style="color: var(--text-muted); font-size: 12.5px;">No projects created yet.</span>'}
            </div>
          </div>
          
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
            <button class="btn-ghost" id="cancelDevEditBtn" style="display: none; padding: 8px 14px; font-size: 12.5px;">Cancel</button>
            <button class="btn-primary" id="saveDevBtn" style="padding: 8px 14px; font-size: 12.5px;">Save Developer</button>
          </div>
        </div>

        <!-- Developers List Grid -->
        <div class="dev-list-column">
          <h4 class="dev-list-title">Configured Developers</h4>
          
          <div class="dev-list-grid">
            ${state.developers.map(d => {
    const projectPills = (d.projectIds || []).map(pid => {
      const proj = state.projects.find(p => p.id === pid);
      return proj ? `<span class="test-pill test-proj" style="font-size: 10px; padding: 2px 6px;">${proj.name}</span>` : null;
    }).filter(Boolean).join('') || '<span style="font-size: 11.5px; color: var(--text-muted);">No linked projects</span>';

    return `
                <div class="developer-item-card">
                  <div class="dev-card-header">
                    <span class="dev-card-name">${d.name}</span>
                    <div class="dev-card-actions">
                      <button class="icon-btn" data-action="edit-dev" data-dev-id="${d.id}" title="Edit Developer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 14px; height: 14px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="icon-btn danger" data-action="delete-dev" data-dev-id="${d.id}" title="Delete Developer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 14px; height: 14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                  <div class="dev-card-projects">
                    ${projectPills}
                  </div>
                </div>
              `;
  }).join('') || `
              <div class="dev-empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                <span style="font-size: 13px;">No developers added yet</span>
              </div>
            `}
          </div>
        </div>

      </div>
    </div>
  </div>
`;
};

const clearAllData = async () => {
  // 1. Export backup first
  exportData();

  // 2. Clear state
  state.projects = [];
  state.tasks = [];
  state.tests = [];
  state.activity = [];
  state.developers = [];
  state.releases = [];
  state.releasePoints = [];
  state.testCases = [];
  state.modules = [];
  state.filters = { status: '', previousVersion: '', upcomingVersion: '', date: '', taskProject: '' };
  state.testFilters = { project: '', developer: '', status: '', assignedStatus: '' };
  state.releaseFilters = { status: '' };
  state.releasePtFilters = { project: '', releaseType: '', completion: '' };
  state.taskSearch = '';
  state.testSearch = '';
  state.releaseSearch = '';
  state.releasePtSearch = '';
  state.testCaseSearch = '';
  if (state.selectedTestCaseIds) {
    state.selectedTestCaseIds.clear();
  }

  // Set flag to prevent automatic re-initialization of mock data on next page load
  localStorage.setItem('clair_db_initialized', 'true');

  // 3. Save to storage
  await storage.save();

  // 4. Update UI
  render();
  updateStorageInfo();
  showToast('All data cleared and backed up');
};

// ─── Card interaction delegation ─────────────────────────
const attachCardListeners = () => {
  const content = document.getElementById('mainContent');

  // Add scroll listener for infinite scrolling in Test Case Management
  content.addEventListener('scroll', () => {
    if (state.view !== 'testcases') return;

    // Check if we are near the bottom of scroll
    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 150) {
      const tbody = document.getElementById('testCasesTableBody');
      if (!tbody) return;

      const currentCount = tbody.querySelectorAll('tr.testcase-row').length;
      const totalCount = state.lastFilteredCases ? state.lastFilteredCases.length : 0;

      if (currentCount < totalCount) {
        const nextSlice = state.lastFilteredCases.slice(currentCount, currentCount + 100);
        const projModules = state.modules.filter(m => m.projectId === state.activeTestCaseProjectId);

        const html = nextSlice.map((tc, idx) => {
          return renderSingleTestCaseRow(tc, currentCount + idx, projModules, state.developers, state.selectedTestCaseIds);
        }).join('');

        tbody.insertAdjacentHTML('beforeend', html);
        state.visibleTestCaseCount = currentCount + nextSlice.length;
      }
    }
  });

  // Click delegation
  content.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const { action, id } = btn.dataset;
      const card = btn.closest('[data-id]');
      const cardId = id || (card ? card.dataset.id : null);

      if (action === 'edit-project') openProjectModal(cardId);
      else if (action === 'delete-project') confirmDeleteProject(cardId);
      else if (action === 'edit-task') openTaskModal(cardId);
      else if (action === 'delete-task') confirmDeleteTask(cardId);
      else if (action === 'complete-task') completeTask(cardId);
      else if (action === 'edit-test') openTestModal(cardId);
      else if (action === 'delete-test') confirmDeleteTest(cardId);
      else if (action === 'edit-release') openReleaseModal(cardId);
      else if (action === 'delete-release') confirmDeleteRelease(cardId);
      else if (action === 'copy-notes') copyReleaseNotesToClipboard(cardId);
      else if (action === 'edit-dev') editDeveloper(btn.dataset.devId);
      else if (action === 'delete-dev') confirmDeleteDeveloper(btn.dataset.devId);
      else if (action === 'edit-module') openModuleModal(cardId);
      else if (action === 'delete-module') confirmDeleteModule(cardId);
      else if (action === 'edit-testcase') openTestCaseModal(cardId);
      else if (action === 'delete-testcase') confirmDeleteTestCase(cardId);
      else if (action === 'edit-release-pt') openReleasePtModal(cardId);
      else if (action === 'delete-release-pt') confirmDeleteReleasePt(cardId);
      else if (action === 'toggle-checklist-item') {
        const rpId = btn.dataset.rpId;
        const itemId = btn.dataset.itemId;
        toggleReleasePtChecklistItem(rpId, itemId);
      }
      else if (action === 'remove-checklist-row') {
        // Save current values
        document.querySelectorAll('.rp-cl-text').forEach(inp => {
          const i = parseInt(inp.dataset.idx);
          if (rpChecklistItems[i]) rpChecklistItems[i].text = inp.value;
        });
        const idx = parseInt(btn.dataset.idx);
        rpChecklistItems.splice(idx, 1);
        renderChecklistEditor();
      }
      return;
    }

    // Empty-state "Add Release Point" button
    const emptyRpBtn = e.target.closest('#emptyAddReleasePtBtn');
    if (emptyRpBtn) { openReleasePtModal(); return; }

    // TestCase selection bar buttons
    const toggleSelectionBtn = e.target.closest('#toggleTestCaseSelectionModeBtn');
    if (toggleSelectionBtn) {
      state.testCaseSelectionMode = !state.testCaseSelectionMode;
      if (!state.testCaseSelectionMode) {
        if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
      }
      render();
      return;
    }

    const selectAllBtn = e.target.closest('#selectAllTestCasesBtn');
    if (selectAllBtn) {
      if (!state.selectedTestCaseIds) {
        state.selectedTestCaseIds = new Set();
      }
      if (state.lastFilteredCases) {
        state.lastFilteredCases.forEach(tc => {
          state.selectedTestCaseIds.add(tc.id);
        });
      }
      render();
      return;
    }

    const clearSelectBtn = e.target.closest('#clearTestCaseSelectionBtn');
    if (clearSelectBtn) {
      if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
      render();
      return;
    }

    const cancelSelectionBtn = e.target.closest('#cancelTestCaseSelectionBtn');
    if (cancelSelectionBtn) {
      state.testCaseSelectionMode = false;
      if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
      render();
      return;
    }

    const bulkDeleteBtn = e.target.closest('#bulkDeleteTestCasesBtn');
    if (bulkDeleteBtn) {
      confirmBulkDeleteTestCases();
      return;
    }

    if (e.target.closest('.task-check') || e.target.closest('a')) {
      return;
    }

    // Toggle project tab
    const tabBtn = e.target.closest('.project-tab');
    if (tabBtn) {
      state.activeTestCaseProjectId = tabBtn.dataset.projectId;
      state.activeTestCaseModuleId = null;
      if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
      state.testCaseSelectionMode = false;
      state.visibleTestCaseCount = 100;
      if (content) content.scrollTop = 0;
      render();
      return;
    }

    // Toggle module item
    const moduleItem = e.target.closest('.module-item');
    if (moduleItem) {
      if (e.target.closest('[data-action="delete-module"]') || e.target.closest('[data-action="edit-module"]') || e.target.closest('input[type="checkbox"]')) {
        return;
      }
      const mid = moduleItem.dataset.moduleId;
      state.activeTestCaseModuleId = mid === 'root' ? null : mid;
      state.visibleTestCaseCount = 100;
      if (content) content.scrollTop = 0;
      render();
      return;
    }

    // Inline add module
    const inlineAddModBtn = e.target.closest('#inlineAddModuleBtn');
    if (inlineAddModBtn) {
      const nameInput = document.getElementById('inlineModuleName');
      const name = nameInput.value.trim();
      if (!name) { showToast('Module name cannot be empty', 'error'); return; }
      const newMod = {
        id: 'mod-' + uid(),
        projectId: state.activeTestCaseProjectId,
        name: name,
        description: ''
      };
      state.modules.push(newMod);
      logActivity(`Created module "${name}"`, 'project');
      storage.save();
      nameInput.value = '';
      render();
      showToast('Module created');
      return;
    }

    // Open add module modal
    const openAddModBtn = e.target.closest('#openAddModuleModalBtn');
    if (openAddModBtn) {
      openModuleModal();
      return;
    }

    // Open Excel Import modal
    const openExcelImportBtn = e.target.closest('#openExcelImportModalBtn');
    if (openExcelImportBtn) {
      openExcelImportModal();
      return;
    }

    // Open Bulk Update modal
    const openBulkUpdateBtn = e.target.closest('#openBulkUpdateModalBtn');
    if (openBulkUpdateBtn) {
      openBulkUpdateModal();
      return;
    }

    // Check if clicked a task/insight card
    const taskCard = e.target.closest('.task-card');
    if (taskCard) {
      const id = taskCard.dataset.id;
      if (taskCard.classList.contains('test-card')) {
        openDetailModal('test', id);
      } else {
        openDetailModal('task', id);
      }
      return;
    }

    // Check if clicked a testcase card
    const testCaseCard = e.target.closest('.testcase-card, .testcase-row');
    if (testCaseCard) {
      if (e.target.closest('[data-action]') || e.target.closest('a') || e.target.closest('input[type="checkbox"]') || e.target.closest('.table-inline-input') || e.target.closest('.table-inline-select') || e.target.closest('.table-inline-textarea')) return;
      const id = testCaseCard.dataset.id;
      if (state.testCaseSelectionMode) {
        if (!state.selectedTestCaseIds) {
          state.selectedTestCaseIds = new Set();
        }
        if (state.selectedTestCaseIds.has(id)) {
          state.selectedTestCaseIds.delete(id);
        } else {
          state.selectedTestCaseIds.add(id);
        }
        render();
      } else {
        openDetailModal('testcase', id);
      }
      return;
    }

    // Check if clicked a project card
    const projectCard = e.target.closest('.project-card');
    if (projectCard) {
      const id = projectCard.dataset.id;
      openDetailModal('project', id);
      return;
    }

    // Check if clicked a release card
    const releaseCard = e.target.closest('.release-card');
    if (releaseCard) {
      const id = releaseCard.dataset.id;
      openDetailModal('release', id);
      return;
    }

    const saveDevBtn = e.target.closest('#saveDevBtn');
    if (saveDevBtn) {
      saveDeveloper();
      return;
    }

    const cancelDevEditBtn = e.target.closest('#cancelDevEditBtn');
    if (cancelDevEditBtn) {
      cancelDevEdit();
      return;
    }

    const clearBtn = e.target.closest('#clearProjectsFilters, #clearTasksFilters, #clearTestFilters, #clearReleaseFilters, #clearTestCaseFilters, #clearReleasePtFilters');
    if (clearBtn) {
      if (clearBtn.id === 'clearTestFilters') {
        state.testFilters = { project: '', developer: '', status: '', assignedStatus: '' };
        render();
      } else if (clearBtn.id === 'clearReleaseFilters') {
        state.releaseFilters = { status: '' };
        render();
      } else if (clearBtn.id === 'clearReleasePtFilters') {
        state.releasePtFilters = { project: '', releaseType: '', completion: '' };
        render();
      } else if (clearBtn.id === 'clearTestCaseFilters') {
        state.testCaseSearch = '';
        state.testCaseFilters = { status: '', priority: '', type: '' };
        state.visibleTestCaseCount = 100;
        if (content) content.scrollTop = 0;
        render();
      } else {
        clearFilters();
      }
    }

    // Clear inline search buttons
    const clearTaskSearch = e.target.closest('#clearTaskSearch');
    if (clearTaskSearch) { state.taskSearch = ''; render(); return; }

    const clearTestSearch = e.target.closest('#clearTestSearch');
    if (clearTestSearch) { state.testSearch = ''; render(); return; }

    const clearReleaseSearch = e.target.closest('#clearReleaseSearch');
    if (clearReleaseSearch) { state.releaseSearch = ''; render(); return; }

    const clearReleasePtSearch = e.target.closest('#clearReleasePtSearch');
    if (clearReleasePtSearch) { state.releasePtSearch = ''; render(); return; }

    const clearTCSearch = e.target.closest('#clearTestCaseSearch');
    if (clearTCSearch) {
      state.testCaseSearch = '';
      state.visibleTestCaseCount = 100;
      if (content) content.scrollTop = 0;
      render();
      return;
    }

    const clearDataBtn = e.target.closest('#clearDataBtn');
    if (clearDataBtn) {
      document.getElementById('confirmMessage').textContent =
        'Are you sure you want to clear ALL data? This will delete all projects, tasks, and activities. A backup file will be downloaded automatically.';
      confirmCallback = clearAllData;
      showModal('confirmModal');
      return;
    }

    const settingsExportBtn = e.target.closest('#settingsExportBtn');
    if (settingsExportBtn) {
      exportData();
      return;
    }

    const settingsImportBtn = e.target.closest('#settingsImportBtn');
    if (settingsImportBtn) {
      document.getElementById('importInput').click();
      return;
    }
  });

  // Change delegation (filters)
  content.addEventListener('change', e => {
    const select = e.target.closest('[data-filter]');
    if (select) {
      applyFilter(select.dataset.filter, select.value);
    }
    const testSelect = e.target.closest('[data-testfilter]');
    if (testSelect) {
      state.testFilters[testSelect.dataset.testfilter] = testSelect.value;
      render();
    }
    const releaseSelect = e.target.closest('[data-releasefilter]');
    if (releaseSelect) {
      state.releaseFilters[releaseSelect.dataset.releasefilter] = releaseSelect.value;
      render();
    }
    const rptSelect = e.target.closest('[data-rptfilter]');
    if (rptSelect) {
      state.releasePtFilters[rptSelect.dataset.rptfilter] = rptSelect.value;
      render();
    }
    const tcSelect = e.target.closest('[data-tcfilter]');
    if (tcSelect) {
      state.testCaseFilters[tcSelect.dataset.tcfilter] = tcSelect.value;
      state.visibleTestCaseCount = 100;
      if (content) content.scrollTop = 0;
      render();
    }
    const selectAllTcCb = e.target.closest('#selectAllTcCb');
    if (selectAllTcCb) {
      if (!state.selectedTestCaseIds) {
        state.selectedTestCaseIds = new Set();
      }
      if (selectAllTcCb.checked) {
        if (state.lastFilteredCases) {
          state.lastFilteredCases.forEach(tc => state.selectedTestCaseIds.add(tc.id));
        }
        state.testCaseSelectionMode = true;
      } else {
        if (state.lastFilteredCases) {
          state.lastFilteredCases.forEach(tc => state.selectedTestCaseIds.delete(tc.id));
        }
        state.testCaseSelectionMode = false;
      }
      render();
    }
    const inlineInput = e.target.closest('.table-inline-input, .table-inline-select, .table-inline-textarea');
    if (inlineInput) {
      const tcId = inlineInput.dataset.id;
      const field = inlineInput.dataset.field;
      const val = inlineInput.value;

      const tc = state.testCases.find(x => x.id === tcId);
      if (tc) {
        tc[field] = val;
        if (field === 'scenario') {
          tc.title = val;
        }
        tc.updatedAt = new Date().toISOString();
        storage.save();

        const needsReRender = ['status', 'priority', 'severity', 'type', 'moduleId', 'assignee'].includes(field);
        if (needsReRender) {
          render();
        } else {
          showToast(`Auto-saved test case ${tcId}`);
        }
      }
    }
  });

  // Inline page search inputs
  let pageSearchTimer;
  content.addEventListener('input', e => {
    const inlineTextarea = e.target.closest('.table-inline-textarea');
    if (inlineTextarea) {
      inlineTextarea.style.height = 'auto';
      inlineTextarea.style.height = inlineTextarea.scrollHeight + 'px';
      return;
    }
    const taskInput = e.target.closest('#taskSearchInput');
    if (taskInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.taskSearch = taskInput.value.toLowerCase(); render(); }, 180);
      return;
    }
    const testInput = e.target.closest('#testSearchInput');
    if (testInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.testSearch = testInput.value.toLowerCase(); render(); }, 180);
      return;
    }
    const releaseInput = e.target.closest('#releaseSearchInput');
    if (releaseInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.releaseSearch = releaseInput.value.toLowerCase(); render(); }, 180);
      return;
    }
    const releasePtInput = e.target.closest('#releasePtSearchInput');
    if (releasePtInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.releasePtSearch = releasePtInput.value.toLowerCase(); render(); }, 180);
      return;
    }
    const tcInput = e.target.closest('#testCaseSearchInput');
    if (tcInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => {
        state.testCaseSearch = tcInput.value.toLowerCase();
        state.visibleTestCaseCount = 100;
        if (content) content.scrollTop = 0;
        render();
      }, 180);
      return;
    }
  });

  // Drag and Drop delegation
  content.addEventListener('dragstart', e => {
    const card = e.target.closest('.task-card');
    if (card) {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    }
  });

  content.addEventListener('dragover', e => {
    const column = e.target.closest('.kanban-column');
    if (column) {
      e.preventDefault();
      column.classList.add('drag-over');
    }
  });

  content.addEventListener('dragleave', e => {
    const column = e.target.closest('.kanban-column');
    if (column) {
      column.classList.remove('drag-over');
    }
  });

  content.addEventListener('drop', e => {
    const column = e.target.closest('.kanban-column');
    if (column) {
      e.preventDefault();
      column.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = column.dataset.status;
      dropTask(taskId, newStatus);
    }
  });
};

// ─── Filter helpers ───────────────────────────────────────
window.applyFilter = (key, val) => {
  state.filters[key] = val;
  render();
};

window.clearFilters = () => {
  state.filters = { status: '', previousVersion: '', upcomingVersion: '', date: '', taskProject: '', taskPriority: '', taskDeadline: '' };
  render();
};

// ─── Developer Management ────────────────────────────────
const saveDeveloper = async () => {
  const name = document.getElementById('devNameInput').value.trim();
  const id = document.getElementById('editDevId').value;
  if (!name) { showToast('Developer name is required', 'error'); return; }

  const checkboxes = document.querySelectorAll('input[name="devProjectCheck"]:checked');
  const projectIds = Array.from(checkboxes).map(cb => cb.value);

  if (id) {
    const dev = state.developers.find(d => d.id === id);
    if (dev) {
      dev.name = name;
      dev.projectIds = projectIds;
      showToast('Developer updated');
    }
  } else {
    state.developers.push({
      id: 'dev-' + uid(),
      name,
      projectIds
    });
    showToast('Developer added');
  }

  await storage.save();
  cancelDevEdit();
  render();
};

const cancelDevEdit = () => {
  document.getElementById('devNameInput').value = '';
  document.getElementById('editDevId').value = '';
  document.querySelectorAll('input[name="devProjectCheck"]').forEach(cb => cb.checked = false);
  document.getElementById('devFormTitle').textContent = 'Add New Developer';
  document.getElementById('cancelDevEditBtn').style.display = 'none';
};

const editDeveloper = (devId) => {
  const dev = state.developers.find(d => d.id === devId);
  if (!dev) return;

  document.getElementById('devNameInput').value = dev.name;
  document.getElementById('editDevId').value = dev.id;
  document.getElementById('devFormTitle').textContent = 'Edit Developer';
  document.getElementById('cancelDevEditBtn').style.display = 'inline-block';

  document.querySelectorAll('input[name="devProjectCheck"]').forEach(cb => {
    cb.checked = (dev.projectIds || []).includes(cb.value);
  });
};

const confirmDeleteDeveloper = (devId) => {
  const dev = state.developers.find(d => d.id === devId);
  if (!dev) return;
  document.getElementById('confirmMessage').textContent = `Delete developer "${dev.name}"? This action cannot be undone.`;
  confirmCallback = () => deleteDeveloper(devId);
  showModal('confirmModal');
};

const deleteDeveloper = async (devId) => {
  state.developers = state.developers.filter(d => d.id !== devId);
  state.tasks.forEach(t => {
    if (t.developer === devId) t.developer = '';
  });
  state.tests.forEach(t => {
    if (t.developer === devId) t.developer = '';
  });

  await storage.save();
  closeModals();
  render();
  showToast('Developer deleted');
};

// ─── Project Modal ───────────────────────────────────────
let selectedStatuses = [];

const renderStatusPicker = () => {
  const picker = document.getElementById('statusPicker');
  picker.innerHTML = STATUS_OPTIONS.map(s => `
    <span class="status-option status-pill ${STATUS_CLASS[s] || 'na'} ${selectedStatuses.includes(s) ? 'selected' : ''}"
      data-status="${s}">${s}</span>
  `).join('');

  picker.querySelectorAll('.status-option').forEach(el => {
    el.addEventListener('click', () => {
      const s = el.dataset.status;
      if (selectedStatuses.includes(s)) {
        selectedStatuses = selectedStatuses.filter(x => x !== s);
        el.classList.remove('selected');
      } else if (selectedStatuses.length < 3) {
        selectedStatuses.push(s);
        el.classList.add('selected');
      } else {
        showToast('Maximum 3 statuses per project', 'error');
      }
      updateSelectedStatusDisplay();
    });
  });
};

const updateSelectedStatusDisplay = () => {
  const el = document.getElementById('selectedStatuses');
  el.innerHTML = selectedStatuses.map(s => statusPill(s)).join('');
};

const openProjectModal = (id = null) => {
  const modal = document.getElementById('projectModal');
  const title = document.getElementById('projectModalTitle');

  selectedStatuses = [];

  if (id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    title.textContent = 'Edit Project';
    document.getElementById('projectId').value = p.id;
    document.getElementById('projectName').value = p.name;
    document.getElementById('projectDesc').value = p.description || '';

    const type = p.projectType || 'web';
    document.getElementById('projectType').value = type;
    setProjectTypeUI(type);

    if (type === 'app') {
      document.getElementById('projectAndroidPrev').value = p.androidPreviousVersion || '';
      document.getElementById('projectAndroidUpcoming').value = p.androidUpcomingVersion || '';
      document.getElementById('projectIosPrev').value = p.iosPreviousVersion || '';
      document.getElementById('projectIosUpcoming').value = p.iosUpcomingVersion || '';
    } else {
      document.getElementById('projectPreviousVersion').value = p.previousVersion || '';
      document.getElementById('projectUpcomingVersion').value = p.upcomingVersion || p.version || '';
    }

    selectedStatuses = [...(p.statuses || [])];
  } else {
    title.textContent = 'New Project';
    document.getElementById('projectId').value = '';
    document.getElementById('projectName').value = '';
    document.getElementById('projectDesc').value = '';
    document.getElementById('projectType').value = 'web';
    setProjectTypeUI('web');
    document.getElementById('projectPreviousVersion').value = '';
    document.getElementById('projectUpcomingVersion').value = '';
    document.getElementById('projectAndroidPrev').value = '';
    document.getElementById('projectAndroidUpcoming').value = '';
    document.getElementById('projectIosPrev').value = '';
    document.getElementById('projectIosUpcoming').value = '';
  }

  renderStatusPicker();
  updateSelectedStatusDisplay();

  // Wire up type toggle buttons
  document.querySelectorAll('#projectTypeToggle .type-btn').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.type;
      document.getElementById('projectType').value = t;
      // If creating a new project, clear version fields on type switch
      if (!document.getElementById('projectId').value) {
        document.getElementById('projectPreviousVersion').value = '';
        document.getElementById('projectUpcomingVersion').value = '';
        document.getElementById('projectAndroidPrev').value = '';
        document.getElementById('projectAndroidUpcoming').value = '';
        document.getElementById('projectIosPrev').value = '';
        document.getElementById('projectIosUpcoming').value = '';
      }
      setProjectTypeUI(t);
    };
  });

  showModal('projectModal');
};

const setProjectTypeUI = (type) => {
  document.getElementById('webVersionFields').style.display = type === 'web' ? '' : 'none';
  document.getElementById('appVersionFields').style.display = type === 'app' ? '' : 'none';
  document.querySelectorAll('#projectTypeToggle .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
};

const saveProject = async () => {
  const id = document.getElementById('projectId').value;
  const name = document.getElementById('projectName').value.trim();
  const desc = document.getElementById('projectDesc').value.trim();
  const projectType = document.getElementById('projectType').value;

  if (!name) { showToast('Project name is required', 'error'); return; }

  let versionData = {};

  if (projectType === 'app') {
    const androidUpcoming = document.getElementById('projectAndroidUpcoming').value.trim();
    const iosUpcoming = document.getElementById('projectIosUpcoming').value.trim();
    if (!androidUpcoming || !iosUpcoming) {
      showToast('Android and iOS upcoming versions are required', 'error'); return;
    }
    versionData = {
      androidPreviousVersion: document.getElementById('projectAndroidPrev').value.trim(),
      androidUpcomingVersion: androidUpcoming,
      iosPreviousVersion: document.getElementById('projectIosPrev').value.trim(),
      iosUpcomingVersion: iosUpcoming,
    };
  } else {
    const upcomingVer = document.getElementById('projectUpcomingVersion').value.trim();
    if (!upcomingVer) { showToast('Upcoming Release Version is required', 'error'); return; }
    versionData = {
      previousVersion: document.getElementById('projectPreviousVersion').value.trim(),
      upcomingVersion: upcomingVer,
    };
  }

  const now = new Date().toISOString();
  const logVersion = projectType === 'app'
    ? `Android ${versionData.androidUpcomingVersion} / iOS ${versionData.iosUpcomingVersion}`
    : versionData.upcomingVersion;

  if (id) {
    const idx = state.projects.findIndex(p => p.id === id);
    if (idx === -1) return;
    const old = state.projects[idx];
    state.projects[idx] = { ...old, name, description: desc, projectType, ...versionData, statuses: selectedStatuses, updatedAt: now };
    // Clean up old fields if type changed
    if (projectType === 'app') {
      delete state.projects[idx].previousVersion;
      delete state.projects[idx].upcomingVersion;
      delete state.projects[idx].version;
    } else {
      delete state.projects[idx].androidPreviousVersion;
      delete state.projects[idx].androidUpcomingVersion;
      delete state.projects[idx].iosPreviousVersion;
      delete state.projects[idx].iosUpcomingVersion;
    }
    logActivity(`Updated project "${name}" → ${logVersion}`, 'project');
    showToast('Project updated');
  } else {
    state.projects.unshift({
      id: uid(), name, description: desc, projectType, ...versionData,
      statuses: selectedStatuses,
      createdAt: now, updatedAt: now
    });
    logActivity(`Created project "${name}" (${logVersion})`, 'project');
    showToast('Project created');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteProject = (id) => {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  document.getElementById('confirmMessage').textContent =
    `Delete project "${p.name}"? This action cannot be undone.`;
  confirmCallback = () => deleteProject(id);
  showModal('confirmModal');
};

const deleteProject = async (id) => {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  state.projects = state.projects.filter(x => x.id !== id);
  logActivity(`Deleted project "${p.name}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Project deleted');
};

// ─── Task Modal ──────────────────────────────────────────
const openTaskModal = (id = null) => {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('taskModalTitle');

  // Populate project dropdown
  const sel = document.getElementById('taskProject');
  sel.innerHTML = `<option value="">— None —</option>` +
    state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  if (id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    title.textContent = 'Edit Task';
    document.getElementById('taskId').value = t.id;
    document.getElementById('taskTitle').value = t.title;
    document.getElementById('taskDesc').value = t.description || '';
    document.getElementById('taskTags').value = (t.tags || []).join(', ');
    document.getElementById('taskStartDate').value = t.startDate || t.date || '';
    document.getElementById('taskEndDate').value = t.endDate || '';
    document.getElementById('taskStatus').value = t.status || 'To-Do';
    document.getElementById('taskPriority').value = t.priority || 'Medium';
    document.getElementById('taskProject').value = t.projectId || '';
    updateDeveloperDropdown(t.projectId || '', 'taskDeveloper', t.developer || '');
  } else {
    title.textContent = 'New Task';
    document.getElementById('taskId').value = '';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskTags').value = '';
    document.getElementById('taskStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('taskEndDate').value = '';
    document.getElementById('taskStatus').value = 'To-Do';
    document.getElementById('taskPriority').value = 'Medium';
    document.getElementById('taskProject').value = '';
    updateDeveloperDropdown('', 'taskDeveloper', '');
  }

  showModal('taskModal');
};

const saveTask = async () => {
  const id = document.getElementById('taskId').value;
  const title = document.getElementById('taskTitle').value.trim();
  const desc = document.getElementById('taskDesc').value.trim();
  const tags = document.getElementById('taskTags').value.split(',').map(s => s.trim()).filter(s => s !== '');
  const startDate = document.getElementById('taskStartDate').value;
  const endDate = document.getElementById('taskEndDate').value;
  const status = document.getElementById('taskStatus').value;
  const priority = document.getElementById('taskPriority').value || 'Medium';
  const projectId = document.getElementById('taskProject').value;
  const developer = document.getElementById('taskDeveloper').value;

  if (!title) { showToast('Task title is required', 'error'); return; }

  const now = new Date().toISOString();

  if (id) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const old = state.tasks[idx];
    state.tasks[idx] = { ...old, title, description: desc, tags, startDate, endDate, status, priority, projectId, developer, updatedAt: now };
    // Remove old date field if it exists
    delete state.tasks[idx].date;
    logActivity(`Updated task "${title}"`, 'task');
    showToast('Task updated');
  } else {
    state.tasks.unshift({
      id: uid(), title, description: desc, tags, startDate, endDate, status, priority, projectId, developer,
      createdAt: now, updatedAt: now
    });
    logActivity(`Added task "${title}"`, 'task');
    showToast('Task added');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteTask = (id) => {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('confirmMessage').textContent =
    `Delete task "${t.title}"? This action cannot be undone.`;
  confirmCallback = () => deleteTask(id);
  showModal('confirmModal');
};

const deleteTask = async (id) => {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  state.tasks = state.tasks.filter(x => x.id !== id);
  logActivity(`Deleted task "${t.title}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Task deleted');
};

// ─── Modal helpers ───────────────────────────────────────
const showModal = (id) => {
  document.getElementById('modalBackdrop').classList.add('show');
  document.getElementById(id).classList.add('show');
};

const closeModals = () => {
  document.getElementById('modalBackdrop').classList.remove('show');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
};

const openDetailModal = (type, id) => {
  activeDetailType = type;
  activeDetailId = id;

  const titleEl = document.getElementById('detailModalTitle');
  const bodyEl = document.getElementById('detailModalBody');

  if (type === 'task') {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    titleEl.textContent = 'Task Details';
    const proj = task.projectId ? state.projects.find(p => p.id === task.projectId) : null;
    const projectName = proj ? proj.name : '';
    const devName = getDevName(task.developer);

    const taskStatusClass = (task.status || 'To-Do').toLowerCase().replace(' ', '').replace('-', '');

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section">
          <span class="detail-badge ${taskStatusClass}">${task.status || 'To-Do'}</span>
          ${projectName ? `<span class="detail-project-tag">${projectName}</span>` : ''}
        </div>
        <h3 class="detail-title">${task.title}</h3>
        
        <div class="detail-meta-grid">
          <div class="detail-meta-item">
            <span class="detail-meta-label">Assigned Developer</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span>${devName}</span>
            </div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Timeline</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              <span>${task.startDate ? fmtDate(task.startDate) : '–'} ${task.endDate ? `→ ${fmtDate(task.endDate)}` : ''}</span>
            </div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Created</span>
            <div class="detail-meta-value">${fmtDate(task.createdAt)} at ${fmtTime(task.createdAt)}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Last Updated</span>
            <div class="detail-meta-value">${timeAgo(task.updatedAt || task.createdAt)}</div>
          </div>
        </div>

        ${(task.tags && task.tags.length) ? `
          <div class="detail-tags-section">
            <span class="detail-meta-label">Tags</span>
            <div class="detail-tags-list">
              ${task.tags.map(tag => `<span class="tag-pill ${getTagClass(tag)}">${tag}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="detail-desc-section">
          <span class="detail-meta-label">Description</span>
          <div class="detail-desc-content">${formatFullDescription(task.description) || '<span class="no-desc">No description provided.</span>'}</div>
        </div>
      </div>
    `;
  } else if (type === 'project') {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;

    titleEl.textContent = 'Project Details';
    const isApp = project.projectType === 'app';

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section">
          <span class="detail-badge project-type ${project.projectType || 'web'}">${isApp ? 'Application' : 'Web Software'}</span>
        </div>
        <h3 class="detail-title">${project.name}</h3>

        <div class="detail-meta-grid">
          ${isApp ? `
            <div class="detail-meta-item">
              <span class="detail-meta-label">Android Version</span>
              <div class="detail-meta-value">Prev: <strong>${project.androidPreviousVersion || '–'}</strong> · Up: <strong style="color:var(--accent);">${project.androidUpcomingVersion || '–'}</strong></div>
            </div>
            <div class="detail-meta-item">
              <span class="detail-meta-label">iOS Version</span>
              <div class="detail-meta-value">Prev: <strong>${project.iosPreviousVersion || '–'}</strong> · Up: <strong style="color:var(--accent);">${project.iosUpcomingVersion || '–'}</strong></div>
            </div>
          ` : `
            <div class="detail-meta-item">
              <span class="detail-meta-label">Previous Release</span>
              <div class="detail-meta-value">${project.previousVersion || '–'}</div>
            </div>
            <div class="detail-meta-item">
              <span class="detail-meta-label">Upcoming Release</span>
              <div class="detail-meta-value" style="color:var(--accent); font-weight:600;">${project.upcomingVersion || '–'}</div>
            </div>
          `}
          <div class="detail-meta-item">
            <span class="detail-meta-label">Created</span>
            <div class="detail-meta-value">${fmtDate(project.createdAt)}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Last Updated</span>
            <div class="detail-meta-value">${timeAgo(project.updatedAt || project.createdAt)}</div>
          </div>
        </div>

        <div class="detail-statuses-section">
          <span class="detail-meta-label">Statuses</span>
          <div class="detail-statuses-list" style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
            ${(project.statuses || []).map(s => statusPill(s)).join('')}
          </div>
        </div>

        <div class="detail-desc-section">
          <span class="detail-meta-label">Description</span>
          <div class="detail-desc-content">${formatFullDescription(project.description) || '<span class="no-desc">No description provided.</span>'}</div>
        </div>
      </div>
    `;
  } else if (type === 'test') {
    const insight = state.tests.find(t => t.id === id);
    if (!insight) return;

    titleEl.textContent = 'Insight Details';
    const proj = insight.projectId ? state.projects.find(p => p.id === insight.projectId) : null;
    const projectName = proj ? proj.name : '—';
    const devName = getDevName(insight.developer);

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section" style="gap:6px;">
          <span class="detail-badge ${TEST_TYPE_CLASS[insight.type] || ''}">${insight.type}</span>
          <span class="detail-badge ${TEST_STATUS_CLASS[insight.status] || ''}">${insight.status}</span>
          <span class="detail-badge ${insight.assignedStatus === 'Assigned' ? 'test-assigned-assigned' : 'test-assigned-yet'}">${insight.assignedStatus || 'Yet to be assigned'}</span>
        </div>
        <h3 class="detail-title">${insight.title}</h3>

        <div class="detail-meta-grid">
          <div class="detail-meta-item">
            <span class="detail-meta-label">Project</span>
            <div class="detail-meta-value">${projectName}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Developer</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span>${devName}</span>
            </div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Created</span>
            <div class="detail-meta-value">${fmtDate(insight.createdAt)}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Last Updated</span>
            <div class="detail-meta-value">${timeAgo(insight.updatedAt || insight.createdAt)}</div>
          </div>
        </div>

        <div class="detail-desc-section">
          <span class="detail-meta-label">Description</span>
          <div class="detail-desc-content">${formatFullDescription(insight.description) || '<span class="no-desc">No description provided.</span>'}</div>
        </div>
      </div>
    `;
  } else if (type === 'release') {
    const release = state.releases.find(r => r.id === id);
    if (!release) return;

    titleEl.textContent = 'Release Details';
    const proj = release.projectId ? state.projects.find(p => p.id === release.projectId) : null;
    const projectName = proj ? proj.name : '—';
    const statusClass = (release.status || 'Draft').toLowerCase().replace(' ', '');

    const devsList = (release.developerIds || []).map(devId => {
      const dev = state.developers.find(d => d.id === devId);
      return dev ? `<span class="release-dev-pill" style="font-size: 11px; padding: 2px 8px; margin-top: 2px;">${dev.name}</span>` : null;
    }).filter(Boolean).join('');

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section" style="gap:6px;">
          <span class="detail-badge release-status ${statusClass}">${release.status}</span>
          <span class="detail-project-tag">${projectName}</span>
          <span class="detail-version-tag">${release.version}</span>
        </div>
        <h3 class="detail-title">${release.name}</h3>

        <div class="detail-meta-grid">
          <div class="detail-meta-item">
            <span class="detail-meta-label">Release Manager</span>
            <div class="detail-meta-value">${release.managerName || '–'}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Release Date</span>
            <div class="detail-meta-value">${release.releaseDate ? fmtDate(release.releaseDate) : '–'}</div>
          </div>
          <div class="detail-meta-item" style="grid-column: span 2;">
            <span class="detail-meta-label">Work Items</span>
            <div class="detail-meta-value">${release.workItems || '–'}</div>
          </div>
          <div class="detail-meta-item" style="grid-column: span 2;">
            <span class="detail-meta-label">Developers Involved</span>
            <div class="detail-meta-value" style="display:flex; flex-wrap:wrap; gap:4px;">${devsList || '<span style="color:var(--text-muted);font-style:italic">None linked</span>'}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Created</span>
            <div class="detail-meta-value">${fmtDate(release.createdAt)}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Last Updated</span>
            <div class="detail-meta-value">${timeAgo(release.updatedAt || release.createdAt)}</div>
          </div>
        </div>

        <div class="detail-desc-section">
          <span class="detail-meta-label">Description</span>
          <div class="detail-desc-content">${formatFullDescription(release.description) || '<span class="no-desc">No description provided.</span>'}</div>
        </div>

        ${release.notes ? `
          <div class="detail-desc-section" style="margin-top:16px;">
            <span class="detail-meta-label">Release Notes</span>
            <pre class="detail-notes-content" style="white-space: pre-wrap; font-family: var(--font-mono); font-size: 11.5px; background: var(--surface-2); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); max-height: 200px; overflow-y: auto; margin-top:6px; color: var(--text-secondary);">${release.notes}</pre>
          </div>
        ` : ''}
      </div>
    `;
  } else if (type === 'testcase') {
    const tc = state.testCases.find(t => t.id === id);
    if (!tc) return;

    titleEl.textContent = 'Test Case Details';
    const proj = tc.projectId ? state.projects.find(p => p.id === tc.projectId) : null;
    const projectName = proj ? proj.name : '';
    const mod = tc.moduleId ? state.modules.find(m => m.id === tc.moduleId) : null;
    const moduleName = mod ? mod.name : '—';
    const statusClass = tc.status.toLowerCase();
    const priorityClass = tc.priority.toLowerCase();

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section" style="gap:6px; display:flex; align-items:center;">
          <span class="detail-version-tag" style="font-family:var(--font-mono); font-weight:bold;">${tc.id}</span>
          <span class="testcase-status-pill ${statusClass}" style="border:1px solid transparent; font-size:10px; font-weight:600; padding:2px 7px; border-radius:100px; text-transform:uppercase; letter-spacing:0.3px;">${tc.status}</span>
          <span class="testcase-priority-tag ${priorityClass}" style="font-size:10px; font-weight:500; padding:2px 7px; border-radius:4px;">${tc.priority} Priority</span>
          <span class="detail-project-tag" style="background:var(--surface-2); border:1px solid var(--border); font-size:11.5px; padding:2px 8px; border-radius:4px; color:var(--text-secondary);">${projectName}</span>
        </div>

        <div style="margin-top: 12px;">
          <span class="detail-meta-label">Test Scenario</span>
          <h3 class="detail-title" style="margin-top: 4px; font-size: 16px; line-height: 1.45; font-weight:600;">${tc.scenario || tc.title || '—'}</h3>
        </div>

        ${tc.simplifiedScenario ? `
        <div style="margin-top: 8px;">
          <span class="detail-meta-label">Simplified Test Scenario</span>
          <div style="font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-top: 2px;">${tc.simplifiedScenario}</div>
        </div>
        ` : ''}

        <div class="detail-meta-grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 16px;">
          <div class="detail-meta-item">
            <span class="detail-meta-label">Module</span>
            <div class="detail-meta-value">${moduleName}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Test Type</span>
            <div class="detail-meta-value">${tc.type || 'Manual'}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Severity</span>
            <div class="detail-meta-value">${tc.severity || 'S3 - Major'}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Tested By</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon" style="width:13px; height:13px;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span>${tc.assignee || 'Unassigned'}</span>
            </div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Execution Date</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon" style="width:13px; height:13px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${tc.executionDate ? fmtDate(tc.executionDate) : 'Not Executed'}</span>
            </div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Defect ID</span>
            <div class="detail-meta-value">
              ${tc.defectId ? `
                <span class="testcase-status-pill failed" style="font-size:10px; font-weight:600; padding:2px 7px; border-radius:4px; text-transform:uppercase;">${tc.defectId}</span>
              ` : '<span style="color:var(--text-muted); font-style:italic;">None</span>'}
            </div>
          </div>
        </div>

        ${tc.description ? `
        <div class="detail-desc-section" style="margin-top: 16px;">
          <span class="detail-meta-label">Description / Preconditions</span>
          <div class="detail-desc-content" style="white-space: pre-wrap;">${formatFullDescription(tc.description)}</div>
        </div>
        ` : ''}

        <div class="detail-desc-section" style="margin-top: 16px;">
          <span class="detail-meta-label">Test Steps</span>
          <div class="detail-desc-content" style="white-space: pre-wrap; font-family: var(--font); background: var(--surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; margin-top:4px;">${tc.steps || 'No steps provided.'}</div>
        </div>

        <div class="detail-desc-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px;">
          <div>
            <span class="detail-meta-label">Expected Result</span>
            <div class="detail-desc-content" style="white-space: pre-wrap; font-family: var(--font); background: var(--accent-light); padding: 10px; border-radius: var(--radius-sm); border: 1px solid rgba(45,106,79,0.15); font-size: 12.5px; color: var(--accent); line-height: 1.5; margin-top: 4px;">${tc.expected || 'No expected result.'}</div>
          </div>
          <div>
            <span class="detail-meta-label">Actual Result</span>
            <div class="detail-desc-content" style="white-space: pre-wrap; font-family: var(--font); background: var(--surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; margin-top: 4px;">${tc.actual || '<span style="color:var(--text-muted); font-style:italic;">Not executed / No actual result.</span>'}</div>
          </div>
        </div>

        ${tc.comments ? `
        <div class="detail-desc-section" style="margin-top: 16px;">
          <span class="detail-meta-label">Comments / Run Notes</span>
          <div class="detail-desc-content" style="white-space: pre-wrap; font-size: 12.5px; color: var(--text-secondary); background: #fff8e1; border: 1px solid #ffe082; padding: 10px; border-radius: var(--radius-sm); margin-top:4px;">${tc.comments}</div>
        </div>
        ` : ''}

        <div class="detail-desc-section" style="border-top:1px solid var(--border); padding-top:12px; margin-top:16px; display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
          <span>Created: ${fmtDate(tc.createdAt)}</span>
          <span>Last Updated: ${timeAgo(tc.updatedAt || tc.createdAt)}</span>
        </div>
      </div>
    `;
  }

  showModal('detailModal');
};

// ─── Search ──────────────────────────────────────────────
const handleSearch = (q) => {
  state.searchQuery = q.toLowerCase();
  if (state.view !== 'projects' && state.view !== 'tasks') {
    if (q) {
      // Auto switch to a view with results
      const hasProjects = state.projects.some(p =>
        p.name.toLowerCase().includes(state.searchQuery));
      setView(hasProjects ? 'projects' : 'tasks');
      return;
    }
  }
  render();
};

// ─── Release Management ──────────────────────────────────
const RELEASE_STATUS_OPTIONS = ['Draft', 'Planned', 'In Progress', 'Testing', 'Approved', 'Released', 'Rolled Back'];

const renderReleases = () => {
  let releases = state.releases || [];
  const q = state.releaseSearch.toLowerCase();

  // Statistics
  const total = releases.length;
  const draftOrPlanned = releases.filter(r => r.status === 'Draft' || r.status === 'Planned').length;
  const activeCount = releases.filter(r => r.status === 'In Progress' || r.status === 'Testing' || r.status === 'Approved').length;
  const releasedCount = releases.filter(r => r.status === 'Released').length;
  const rolledBackCount = releases.filter(r => r.status === 'Rolled Back').length;

  if (q) {
    releases = releases.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.version.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.workItems || '').toLowerCase().includes(q) ||
      (r.managerName || '').toLowerCase().includes(q)
    );
  }

  if (state.releaseFilters.status) {
    releases = releases.filter(r => r.status === state.releaseFilters.status);
  }

  const releasedPct = total === 0 ? 0 : Math.round(releasedCount / total * 100);

  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"/><polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Release Management',
    subtitle: 'Plan and track every product release from draft to deployment.',
    stats: [
      { label: 'Total', value: total },
      { label: 'Draft/Planned', value: draftOrPlanned, color: '#60a5fa' },
      { label: 'Active', value: activeCount, color: '#fbbf24' },
      { label: 'Released', value: releasedCount, color: '#4ade80' },
      { label: 'Rolled Back', value: rolledBackCount, color: rolledBackCount > 0 ? '#f87171' : undefined },
      { label: 'Success Rate', value: `${releasedPct}%`, color: releasedPct >= 80 ? '#4ade80' : '#fb923c' },
    ],
    progressBar: { pct: releasedPct, label: `${releasedCount} / ${total} released`, color: 'linear-gradient(90deg, #4ade80, #22c55e)' }
  });

  return `
    ${hero}

    <div class="filters-bar">
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="releaseSearchInput" placeholder="Search releases…" value="${state.releaseSearch || ''}" />
        ${state.releaseSearch ? `<button class="page-search-clear" id="clearReleaseSearch">✕</button>` : ''}
      </div>
      <select class="filter-select" id="filterReleaseStatus" data-releasefilter="status">
        <option value="">All Statuses</option>
        ${RELEASE_STATUS_OPTIONS.map(s => `<option value="${s}" ${state.releaseFilters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      ${state.releaseFilters.status ? `
        <button class="btn-ghost" id="clearReleaseFilters" style="font-size:12px;padding:6px 10px">Clear filters</button>
      ` : ''}
      <span class="section-count" style="margin-left:auto;">${releases.length} release${releases.length !== 1 ? 's' : ''}</span>
    </div>

    ${releases.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"/><polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"/></svg>
        </div>
        <h3>${q || state.releaseFilters.status ? 'No releases match search/filters' : 'No releases found'}</h3>
        <p>${q || state.releaseFilters.status ? 'Try adjustments or click Clear.' : 'Click "Add Release" in the header to manage your first project release!'}</p>
      </div>
    ` : `
      <div class="card-grid">
        ${releases.map(r => renderReleaseCard(r, q)).join('')}
      </div>
    `}

  `;
};

const renderReleaseCard = (r, q = '') => {
  const statusClass = (r.status || 'Draft').toLowerCase().replace(' ', '');
  const devsList = (r.developerIds || []).map(id => {
    const dev = state.developers.find(d => d.id === id);
    return dev ? `<span class="release-dev-pill">${dev.name}</span>` : null;
  }).filter(Boolean).join('');

  const proj = r.projectId ? state.projects.find(p => p.id === r.projectId) : null;
  const projName = proj ? proj.name : '—';

  return `
    <div class="release-card release-status-${statusClass}" data-id="${r.id}">
      <div class="release-card-top">
        <div class="release-name-wrap">
          <div class="release-name">${highlight(r.name, q)}</div>
          <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
            <span class="test-pill test-proj" style="font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600;">${highlight(projName, q)}</span>
            <div class="release-version" style="margin:0; padding:2px 6px; font-size:10px;">${highlight(r.version, q)}</div>
          </div>
        </div>
        <span class="status-pill ${statusClass}">${r.status || 'Draft'}</span>
      </div>
      
      ${r.description ? `<div class="release-desc">${highlight(formatCardDescription(r.description), q)}</div>` : '<div class="release-desc" style="color:var(--text-muted);font-style:italic">No description provided.</div>'}
      
      <div class="release-meta-grid">
        <div class="release-meta-block">
          <span class="release-meta-label">Release Manager</span>
          <span class="release-meta-value" title="${r.managerName || '–'}">${highlight(r.managerName || '–', q)}</span>
        </div>
        <div class="release-meta-block">
          <span class="release-meta-label">Release Date</span>
          <span class="release-meta-value" title="${r.releaseDate ? fmtDate(r.releaseDate) : '–'}">${r.releaseDate ? fmtDate(r.releaseDate) : '–'}</span>
        </div>
        <div class="release-meta-block" style="grid-column: span 2;">
          <span class="release-meta-label">Work Items</span>
          <span class="release-meta-value" title="${r.workItems || '–'}">${highlight(r.workItems || '–', q)}</span>
        </div>
        <div class="release-meta-block" style="grid-column: span 2;">
          <span class="release-meta-label">Developers Involved</span>
          <div class="release-devs">${devsList || '<span style="color:var(--text-muted);font-style:italic">None linked</span>'}</div>
        </div>
      </div>

      ${r.notes ? `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span class="release-meta-label">Release Notes Preview</span>
          <div class="release-notes-preview">${r.notes}</div>
        </div>
      ` : ''}

      <div class="project-card-footer" style="margin-top:auto; padding-top:10px;">
        <span class="card-time">Created ${timeAgo(r.createdAt)}</span>
        <div class="card-actions" style="opacity: 1;">
          <button class="icon-btn" data-action="copy-notes" data-id="${r.id}" title="Copy Email Notes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
          </button>
          <button class="icon-btn" data-action="edit-release" data-id="${r.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-release" data-id="${r.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
};

// =======================================================
// ─── Release Points ──────────────────────────────────
// =======================================================

const getProjectVersions = (project) => {
  if (!project) return [];
  if (project.projectType === 'app') {
    const versions = [];
    if (project.androidPreviousVersion) versions.push(`Android ${project.androidPreviousVersion} (Prev)`);
    if (project.androidUpcomingVersion) versions.push(`Android ${project.androidUpcomingVersion} (Up)`);
    if (project.iosPreviousVersion) versions.push(`iOS ${project.iosPreviousVersion} (Prev)`);
    if (project.iosUpcomingVersion) versions.push(`iOS ${project.iosUpcomingVersion} (Up)`);
    return versions;
  }
  const versions = [];
  if (project.previousVersion) versions.push(`${project.previousVersion} (Prev)`);
  if (project.upcomingVersion) versions.push(`${project.upcomingVersion} (Up)`);
  return versions;
};

const renderReleasePoints = () => {
  let rps = state.releasePoints || [];
  const q = state.releasePtSearch ? state.releasePtSearch.toLowerCase() : '';

  // stats (computed before filtering)
  const total = rps.length;
  const completed = rps.filter(r => r.isCompleted).length;
  const inProgress = rps.filter(r => !r.isCompleted && r.checklistItems && r.checklistItems.some(i => i.done)).length;
  const upcoming = rps.filter(r => r.releaseType === 'upcoming').length;
  const released = rps.filter(r => r.releaseType === 'released').length;
  const totalChecks = rps.reduce((s, r) => s + (r.checklistItems || []).length, 0);
  const doneChecks = rps.reduce((s, r) => s + (r.checklistItems || []).filter(i => i.done).length, 0);
  const overallPct = totalChecks === 0 ? 0 : Math.round((doneChecks / totalChecks) * 100);

  // apply filters
  let filtered = [...rps];
  if (q) {
    filtered = filtered.filter(r =>
      r.title.toLowerCase().includes(q) ||
      (state.projects.find(p => p.id === r.projectId) || { name: '' }).name.toLowerCase().includes(q) ||
      (r.versions || []).some(v => v.toLowerCase().includes(q))
    );
  }
  if (state.releasePtFilters.project) filtered = filtered.filter(r => r.projectId === state.releasePtFilters.project);
  if (state.releasePtFilters.releaseType) filtered = filtered.filter(r => r.releaseType === state.releasePtFilters.releaseType);
  if (state.releasePtFilters.completion === 'completed') filtered = filtered.filter(r => r.isCompleted);
  else if (state.releasePtFilters.completion === 'incomplete') filtered = filtered.filter(r => !r.isCompleted);

  const projectOptions = state.projects.map(p =>
    `<option value="${p.id}" ${state.releasePtFilters.project === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  // Recent activity - last 4 updated rps
  const recentRps = [...rps].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 4);

  // Per-project breakdown for sidebar
  const projBreakdown = state.projects.map(p => {
    const pts = rps.filter(r => r.projectId === p.id);
    const done = pts.filter(r => r.isCompleted).length;
    return pts.length ? { name: p.name, total: pts.length, done } : null;
  }).filter(Boolean);

  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Release Points',
    subtitle: 'Track release readiness checklists for your projects and versions.',
    stats: [
      { label: 'Total', value: total },
      { label: 'Done', value: completed, color: '#4ade80' },
      { label: 'Upcoming', value: upcoming, color: '#fb923c' },
      { label: 'Checks Done', value: `${overallPct}%` }
    ],
    progressBar: { pct: overallPct, label: `${doneChecks} / ${totalChecks} checks completed`, color: 'linear-gradient(90deg, #4ade80, #22c55e)' }
  });

  return `
    ${hero}

    <!-- Page Body: Sidebar + Main -->
    <div class="rp-page-body">

      <!-- Left Sidebar Summary -->
      <aside class="rp-sidebar-panel">
        <div class="rp-sidebar-section">
          <div class="rp-sidebar-label">Status Breakdown</div>
          <div class="rp-sidebar-stat-list">
            <div class="rp-sidebar-stat-row">
              <span class="rp-sidebar-dot green"></span>
              <span>Completed</span>
              <strong>${completed}</strong>
            </div>
            <div class="rp-sidebar-stat-row">
              <span class="rp-sidebar-dot blue"></span>
              <span>In Progress</span>
              <strong>${inProgress}</strong>
            </div>
            <div class="rp-sidebar-stat-row">
              <span class="rp-sidebar-dot amber"></span>
              <span>Not Started</span>
              <strong>${total - completed - inProgress}</strong>
            </div>
            <div class="rp-sidebar-stat-row">
              <span class="rp-sidebar-dot orange"></span>
              <span>Yet to Release</span>
              <strong>${upcoming}</strong>
            </div>
            <div class="rp-sidebar-stat-row">
              <span class="rp-sidebar-dot indigo"></span>
              <span>Released</span>
              <strong>${released}</strong>
            </div>
          </div>
        </div>

        ${projBreakdown.length ? `
        <div class="rp-sidebar-section">
          <div class="rp-sidebar-label">By Project</div>
          ${projBreakdown.map(pb => `
            <div class="rp-sidebar-proj-row">
              <div class="rp-sidebar-proj-name">${pb.name}</div>
              <div class="rp-sidebar-proj-bar-wrap">
                <div class="rp-sidebar-proj-bar">
                  <div class="rp-sidebar-proj-fill" style="width:${pb.total === 0 ? 0 : Math.round(pb.done / pb.total * 100)}%;"></div>
                </div>
                <span class="rp-sidebar-proj-count">${pb.done}/${pb.total}</span>
              </div>
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${recentRps.length ? `
        <div class="rp-sidebar-section">
          <div class="rp-sidebar-label">Recently Updated</div>
          ${recentRps.map(rp => {
    const items = rp.checklistItems || [];
    const done = items.filter(i => i.done).length;
    const pct = items.length === 0 ? 0 : Math.round(done / items.length * 100);
    return `
            <div class="rp-sidebar-recent-row">
              <div class="rp-sidebar-recent-title">${rp.title}</div>
              <div class="rp-sidebar-recent-meta">${pct}% · ${timeAgo(rp.updatedAt || rp.createdAt)}</div>
            </div>`;
  }).join('')}
        </div>
        ` : ''}
      </aside>

      <!-- Main Content -->
      <div class="rp-main-content">

        <!-- Filters Bar -->
        <div class="filters-bar" style="margin-bottom:16px;">
          <div class="page-search-wrap">
            <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" class="page-search-input" id="releasePtSearchInput" placeholder="Search release points…" value="${state.releasePtSearch || ''}" />
            ${state.releasePtSearch ? `<button class="page-search-clear" id="clearReleasePtSearch">✕</button>` : ''}
          </div>
          <select class="filter-select" data-rptfilter="project">
            <option value="">All Projects</option>
            ${projectOptions}
          </select>
          <select class="filter-select" data-rptfilter="releaseType">
            <option value="">All Types</option>
            <option value="upcoming" ${state.releasePtFilters.releaseType === 'upcoming' ? 'selected' : ''}>⏳ Upcoming</option>
            <option value="released" ${state.releasePtFilters.releaseType === 'released' ? 'selected' : ''}>✓ Released</option>
          </select>
          <select class="filter-select" data-rptfilter="completion">
            <option value="">All Statuses</option>
            <option value="completed" ${state.releasePtFilters.completion === 'completed' ? 'selected' : ''}>✅ Completed</option>
            <option value="incomplete" ${state.releasePtFilters.completion === 'incomplete' ? 'selected' : ''}>⏳ Incomplete</option>
          </select>
          ${(state.releasePtFilters.project || state.releasePtFilters.releaseType || state.releasePtFilters.completion) ? `
            <button class="btn-ghost" id="clearReleasePtFilters" style="font-size:12px;padding:6px 10px;">✕ Clear</button>
          ` : ''}
          <span class="section-count" style="margin-left:auto;">${filtered.length} item${filtered.length !== 1 ? 's' : ''}</span>
        </div>

        ${filtered.length === 0 ? `
          <div class="rp-empty-page">
            <div class="rp-empty-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </div>
            <h3>${q || state.releasePtFilters.project ? 'No release points match' : 'No release points yet'}</h3>
            <p>${q || state.releasePtFilters.project ? 'Try adjusting your search or filters.' : 'Click "Add Release Point" beside the Add Project button to create your first release checklist.'}</p>
            ${!q && !state.releasePtFilters.project ? `
              <button class="btn-accent" id="emptyAddReleasePtBtn" style="margin-top:16px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M12 5v14M5 12h14"/></svg>
                Add Release Point
              </button>
            ` : ''}
          </div>
        ` : `
          <div class="rp-card-grid">
            ${filtered.map(rp => renderReleasePtCard(rp, q)).join('')}
          </div>
        `}
      </div>
    </div>
  `;
};


const buildProgressRing = (done, total) => {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : done / total;
  const offset = circ * (1 - pct);
  const isComplete = total > 0 && done === total;
  return `
    <div class="rp-progress-ring-container">
      <svg class="rp-ring-svg" viewBox="0 0 52 52">
        <circle class="rp-ring-track" cx="26" cy="26" r="${r}" />
        <circle class="rp-ring-fill ${isComplete ? 'complete' : ''}"
          cx="26" cy="26" r="${r}"
          stroke-dasharray="${circ.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}" />
      </svg>
      <div class="rp-ring-label">
        <strong>${done}</strong>
        <span>/ ${total}</span>
      </div>
    </div>
  `;
};

const renderReleasePtCard = (rp, q = '') => {
  const proj = rp.projectId ? state.projects.find(p => p.id === rp.projectId) : null;
  const projName = proj ? proj.name : '—';
  const linkedRelease = rp.releaseId ? state.releases.find(r => r.id === rp.releaseId) : null;

  const items = rp.checklistItems || [];
  const doneCount = items.filter(i => i.done).length;
  const totalCount = items.length;
  const isCompleted = rp.isCompleted || (totalCount > 0 && doneCount === totalCount);

  // Build dev pills
  const devPills = (rp.developerIds || []).map(id => {
    const dev = state.developers.find(d => d.id === id);
    return dev ? `<span class="rp-dev-pill">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      ${dev.name}
    </span>` : '';
  }).join('');

  const checklistHtml = items.map(item => `
    <div class="rp-checklist-item ${item.done ? 'done' : ''}" data-action="toggle-checklist-item" data-rp-id="${rp.id}" data-item-id="${item.id}">
      <div class="rp-check-circle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span class="rp-checklist-item-text">${item.text}</span>
    </div>
  `).join('');

  const cardClass = isCompleted ? 'rp-card rp-completed' : (rp.releaseType === 'released' ? 'rp-card rp-released' : 'rp-card');

  return `
    <div class="${cardClass}" data-id="${rp.id}">
      <div class="rp-card-left">
        <div class="rp-card-header">
          <div class="rp-card-title-wrap">
            <div class="rp-card-title">${highlight(rp.title, q)}</div>
            <div class="rp-card-badges">
              <span class="test-pill test-proj" style="font-size:10px;padding:2px 6px;">${highlight(projName, q)}</span>
              <span class="rp-type-badge ${rp.releaseType || 'upcoming'}">
                ${rp.releaseType === 'released' ? '✓ Released' : '⏳ Upcoming'}
              </span>
              ${linkedRelease ? `<span class="release-version" style="font-size:10px;padding:2px 6px;">${linkedRelease.version}</span>` : ''}
              ${(rp.versions || []).map(v => `<span class="release-version" style="font-size:10px;padding:2px 6px;">${v}</span>`).join('')}
            </div>
          </div>
          <div class="card-actions" style="opacity:1;display:flex;gap:4px;">
            <button class="icon-btn" data-action="edit-release-pt" data-id="${rp.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delete-release-pt" data-id="${rp.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        </div>

        ${devPills ? `<div class="rp-dev-pills" style="margin-top:4px;">${devPills}</div>` : ''}

        <!-- Progress Ring -->
        <div class="rp-progress-wrap" style="margin-top:12px;">
          ${buildProgressRing(doneCount, totalCount)}
          <div class="rp-progress-info">
            <div class="rp-progress-text">${doneCount} of ${totalCount} complete</div>
            <div class="rp-progress-sub">${isCompleted ? '🎉 All checks passed!' : totalCount === 0 ? 'No checklist items yet' : `${totalCount - doneCount} item${(totalCount - doneCount) !== 1 ? 's' : ''} remaining`}</div>
          </div>
        </div>

        ${isCompleted ? `
          <div class="rp-completed-banner" style="margin-top:12px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Release point completed!
          </div>
        ` : ''}

        <div class="rp-card-footer" style="margin-top:auto;padding-top:12px;">
          <span class="card-time">Updated ${timeAgo(rp.updatedAt || rp.createdAt)}</span>
        </div>
      </div>

      <div class="rp-card-right">
        <div class="rp-checklist-title">Checklist items</div>
        ${totalCount > 0 ? `
          <div class="rp-card-checklist">
            ${checklistHtml}
          </div>
        ` : `<div style="color:var(--text-muted);font-size:12.5px;font-style:italic;padding:4px 0;">No checklist items. Click Edit to add items.</div>`}
      </div>
    </div>
  `;
};

// ─── Toggle Checklist Item ────────────────────────────────
const toggleReleasePtChecklistItem = async (rpId, itemId) => {
  const rp = (state.releasePoints || []).find(r => r.id === rpId);
  if (!rp) return;
  const item = (rp.checklistItems || []).find(i => i.id === itemId);
  if (!item) return;
  item.done = !item.done;
  rp.isCompleted = rp.checklistItems.length > 0 && rp.checklistItems.every(i => i.done);
  rp.updatedAt = new Date().toISOString();
  if (rp.isCompleted) {
    logActivity(`Release point "${rp.title}" marked as completed! 🎉`, 'project');
    showToast('🎉 All items complete – Release Point completed!');
  }
  await storage.save();
  render();
};

// ─── Release Points Modal ─────────────────────────────────
let rpChecklistItems = []; // local checklist buffer

const populateReleasePtVersions = (projectId, selectedVersions = []) => {
  const container = document.getElementById('releasePtVersions');
  if (!container) return;
  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12.5px;">Select a project first.</span>';
    return;
  }
  const versions = getProjectVersions(proj);
  if (versions.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12.5px;">No versions configured for this project.</span>';
    return;
  }
  container.innerHTML = versions.map(v => `
    <label class="rp-version-checkbox-label">
      <input type="checkbox" name="rpVersionCheck" value="${v}" ${selectedVersions.includes(v) ? 'checked' : ''} />
      ${v}
    </label>
  `).join('');
};

const populateReleasePtReleases = (projectId, selectedReleaseId = '') => {
  const select = document.getElementById('releasePtRelease');
  if (!select) return;
  const projectReleases = (state.releases || []).filter(r => r.projectId === projectId);
  select.innerHTML = `<option value="">— Select Release —</option>` +
    projectReleases.map(r => `<option value="${r.id}" ${selectedReleaseId === r.id ? 'selected' : ''}>${r.name} (${r.version})</option>`).join('');
};

const populateReleasePtDevs = (projectId, selectedDevIds = []) => {
  const container = document.getElementById('releasePtDevChecklist');
  if (!container) return;
  let devs = state.developers;
  if (projectId) {
    devs = state.developers.filter(d => (d.projectIds || []).includes(projectId));
  }
  if (devs.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12.5px;">No developers for this project.</span>';
    return;
  }
  container.innerHTML = devs.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="rpDevCheck" value="${d.id}" ${selectedDevIds.includes(d.id) ? 'checked' : ''} />
      <span>${d.name}</span>
    </label>
  `).join('');
};

const renderChecklistEditor = () => {
  const container = document.getElementById('checklistItemsContainer');
  if (!container) return;
  if (rpChecklistItems.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;font-style:italic;text-align:center;padding:8px 0;">Click "Add Item" to add checklist items.</div>';
    return;
  }
  container.innerHTML = rpChecklistItems.map((item, idx) => `
    <div class="rp-checklist-row" data-cl-idx="${idx}">
      <input type="text" class="rp-cl-text" data-idx="${idx}" value="${item.text.replace(/"/g, '&quot;')}" placeholder="e.g. QA sign-off received" />
      <button type="button" class="rp-checklist-remove-btn" data-action="remove-checklist-row" data-idx="${idx}" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>
    </div>
  `).join('');
};

const openReleasePtModal = (id = null) => {
  document.getElementById('releasePtModalTitle').textContent = id ? 'Edit Release Point' : 'New Release Point';
  document.getElementById('releasePtId').value = '';

  // Populate project dropdown
  const projSel = document.getElementById('releasePtProject');
  projSel.innerHTML = `<option value="">— Select Project —</option>` +
    state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  if (id) {
    const rp = (state.releasePoints || []).find(r => r.id === id);
    if (!rp) return;
    document.getElementById('releasePtId').value = rp.id;
    document.getElementById('releasePtTitle').value = rp.title;
    document.getElementById('releasePtProject').value = rp.projectId || '';
    document.getElementById('releasePtType').value = rp.releaseType || 'upcoming';

    // Set type toggle UI
    document.querySelectorAll('.rp-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rtype === (rp.releaseType || 'upcoming'));
    });

    populateReleasePtVersions(rp.projectId, rp.versions || []);
    populateReleasePtReleases(rp.projectId, rp.releaseId || '');
    populateReleasePtDevs(rp.projectId, rp.developerIds || []);

    rpChecklistItems = (rp.checklistItems || []).map(i => ({ ...i }));
  } else {
    document.getElementById('releasePtTitle').value = '';
    document.getElementById('releasePtProject').value = '';
    document.getElementById('releasePtRelease').innerHTML = `<option value="">— Select Release —</option>`;
    document.getElementById('releasePtType').value = 'upcoming';
    document.querySelectorAll('.rp-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rtype === 'upcoming');
    });
    populateReleasePtVersions('');
    populateReleasePtDevs('');
    rpChecklistItems = [];
  }

  renderChecklistEditor();

  // Wire type toggle
  document.querySelectorAll('.rp-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.rp-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('releasePtType').value = btn.dataset.rtype;
    };
  });

  // Wire project change
  document.getElementById('releasePtProject').onchange = (e) => {
    const pid = e.target.value;
    populateReleasePtVersions(pid);
    populateReleasePtReleases(pid);
    populateReleasePtDevs(pid);
  };

  // Wire add checklist item button
  document.getElementById('addChecklistItemBtn').onclick = () => {
    // Save current text values before re-render
    document.querySelectorAll('.rp-cl-text').forEach(inp => {
      const idx = parseInt(inp.dataset.idx);
      if (rpChecklistItems[idx]) rpChecklistItems[idx].text = inp.value;
    });
    rpChecklistItems.push({ id: uid(), text: '', done: false });
    renderChecklistEditor();
    // focus last
    const inputs = document.querySelectorAll('.rp-cl-text');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };

  showModal('releasePtModal');
};

const saveReleasePoint = async () => {
  // Sync checklist text before saving
  document.querySelectorAll('.rp-cl-text').forEach(inp => {
    const idx = parseInt(inp.dataset.idx);
    if (rpChecklistItems[idx] !== undefined) rpChecklistItems[idx].text = inp.value;
  });

  const id = document.getElementById('releasePtId').value;
  const title = document.getElementById('releasePtTitle').value.trim();
  const projectId = document.getElementById('releasePtProject').value;
  const releaseId = document.getElementById('releasePtRelease').value;
  const releaseType = document.getElementById('releasePtType').value || 'upcoming';

  if (!title) { showToast('Release point title is required', 'error'); return; }
  if (!projectId) { showToast('Please select a project', 'error'); return; }

  const versionChecks = document.querySelectorAll('input[name="rpVersionCheck"]:checked');
  const versions = Array.from(versionChecks).map(cb => cb.value);

  const devChecks = document.querySelectorAll('input[name="rpDevCheck"]:checked');
  const developerIds = Array.from(devChecks).map(cb => cb.value);

  const checklistItems = rpChecklistItems.filter(i => i.text.trim() !== '');
  if (checklistItems.length === 0) { showToast('Add at least one checklist item', 'error'); return; }

  const isCompleted = checklistItems.length > 0 && checklistItems.every(i => i.done);
  const now = new Date().toISOString();

  if (id) {
    const idx = (state.releasePoints || []).findIndex(r => r.id === id);
    if (idx === -1) return;
    state.releasePoints[idx] = {
      ...state.releasePoints[idx],
      title, projectId, releaseId, releaseType, versions, developerIds,
      checklistItems, isCompleted, updatedAt: now
    };
    logActivity(`Updated release point "${title}"`, 'project');
    showToast('Release point updated');
  } else {
    if (!state.releasePoints) state.releasePoints = [];
    state.releasePoints.unshift({
      id: uid(), title, projectId, releaseId, releaseType, versions,
      developerIds, checklistItems, isCompleted, createdAt: now, updatedAt: now
    });
    logActivity(`Created release point "${title}"`, 'project');
    showToast('Release point created');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteReleasePt = (id) => {
  const rp = (state.releasePoints || []).find(r => r.id === id);
  if (!rp) return;
  document.getElementById('confirmMessage').textContent = `Delete release point "${rp.title}"? This cannot be undone.`;
  confirmCallback = () => deleteReleasePt(id);
  showModal('confirmModal');
};

const deleteReleasePt = async (id) => {
  const rp = (state.releasePoints || []).find(r => r.id === id);
  if (!rp) return;
  state.releasePoints = state.releasePoints.filter(r => r.id !== id);
  logActivity(`Deleted release point "${rp.title}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Release point deleted');
};

// =======================================================
// Test Case Management Core Logic & UI Simulation
// =======================================================

const prepopulateMockData = () => {

  // Ensure default developers exist
  if (!state.developers || state.developers.length === 0) {
    state.developers = [
      { id: 'dev-dwip', name: 'Dwip Pandya', projectIds: [] },
      { id: 'dev-albert', name: 'Albert Einstein', projectIds: [] },
      { id: 'dev-marie', name: 'Marie Curie', projectIds: [] }
    ];
  }

  // Prepopulate projects if empty
  if (!state.projects || state.projects.length === 0) {
    const p1Id = 'proj-clair';
    const p2Id = 'proj-mobile';
    state.projects = [
      {
        id: p1Id,
        name: 'Clair Workspace Portal',
        description: 'Web-based core system for tracking developer productivity, insights, tasks, and test automation coverage.',
        projectType: 'web',
        previousVersion: 'v1.0.0',
        upcomingVersion: 'v1.1.0',
        statuses: ['Stable', 'Testing', 'Automation'],
        createdAt: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: p2Id,
        name: 'Clair iOS & Android App',
        description: 'Mobile clients for real-time task notifications, release checklist signs, and system overview dashboard widgets.',
        projectType: 'app',
        androidPreviousVersion: 'v2.1.0',
        androidUpcomingVersion: 'v2.2.0',
        iosPreviousVersion: 'v2.1.2',
        iosUpcomingVersion: 'v2.2.0',
        statuses: ['Started', 'Testing', 'In Progress'],
        createdAt: new Date(Date.now() - 15 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    // Assign dev projectIds
    state.developers.forEach(d => {
      d.projectIds = [p1Id, p2Id];
    });
  }

  const p1Id = state.projects[0].id;
  const p2Id = state.projects[1] ? state.projects[1].id : p1Id;

  // Prepopulate modules if empty
  if (!state.modules || state.modules.length === 0) {
    state.modules = [
      { id: 'mod-auth', projectId: p1Id, name: 'User Authentication', description: 'Covers login, signup, password resets, and session management.' },
      { id: 'mod-billing', projectId: p1Id, name: 'Billing & Subscriptions', description: 'Stripe integration, invoices, upgrades, and discount codes.' },
      { id: 'mod-notify', projectId: p2Id, name: 'Push Notifications', description: 'FCM setup, deep-linking, background polling, and permission dialogs.' },
      { id: 'mod-sync', projectId: p2Id, name: 'Offline Syncing', description: 'SQLite local caching, background workers, and conflict resolution.' }
    ];
  }

  // Prepopulate test cases if empty
  if (!state.testCases || state.testCases.length === 0) {
    state.testCases = [
      {
        id: 'TC-101',
        projectId: p1Id,
        moduleId: 'mod-auth',
        title: 'Verify login with correct credentials and active session redirect',
        scenario: 'Verify login with correct credentials and active session redirect',
        simplifiedScenario: 'Login with correct credentials',
        description: 'Verify that a user who enters active credentials gets redirected to the dashboard page immediately, and a valid token is set in local storage.',
        steps: '1. Go to the login page.\n2. Enter "user@clair.com" and password "ClairPass123!".\n3. Click the Submit button.',
        expected: 'User is redirected to "/dashboard", and token is stored in localStorage.',
        actual: 'User is successfully redirected and token is stored in localStorage.',
        priority: 'Critical',
        severity: 'S2 - Critical',
        status: 'Passed',
        type: 'Automated',
        assignee: 'Dwip Pandya',
        executionDate: '2026-05-28',
        defectId: '',
        comments: 'Verified automatically via selenium scripts. Flow runs smoothly.',
        createdAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-102',
        projectId: p1Id,
        moduleId: 'mod-auth',
        title: 'Verify password strength validator rejecting common strings',
        scenario: 'Verify password strength validator rejecting common strings',
        simplifiedScenario: 'Password strength validator rejection',
        description: 'Registration form should validate password against a blacklist of common weak passwords (e.g. "password", "12345678", "qwerty").',
        steps: '1. Navigate to Registration page.\n2. Fill valid email.\n3. Input "password" as password.\n4. Attempt registration.',
        expected: 'An inline validation error "Password is too weak" is shown, disabling submit button.',
        actual: 'An inline validation error "Password is too weak" is shown, disabling submit button.',
        priority: 'High',
        severity: 'S3 - Major',
        status: 'Passed',
        type: 'Manual',
        assignee: 'Albert Einstein',
        executionDate: '2026-05-27',
        defectId: '',
        comments: 'Verified manually. Checked common variations like 12345678 and qwerty too.',
        createdAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-103',
        projectId: p1Id,
        moduleId: 'mod-billing',
        title: 'Verify coupon code discount is calculated correctly on checkout',
        scenario: 'Verify coupon code discount is calculated correctly on checkout',
        simplifiedScenario: 'Coupon code discount checkout',
        description: 'Verify that applying a validated 10% coupon correctly deducts the amount and updates total cost.',
        steps: '1. Add "Clair Premium Annual Plan" to checkout.\n2. Apply discount code "CLAIR10".\n3. Click Apply.',
        expected: 'Total displays a 10% deduction. Price changes from $120.00 to $108.00.',
        actual: 'Price remained $120.00. Discount was verified in database log but checkout page did not re-calculate.',
        priority: 'High',
        severity: 'S2 - Critical',
        status: 'Failed',
        type: 'Automated',
        assignee: 'Marie Curie',
        executionDate: '2026-05-28',
        defectId: 'BUG-103',
        comments: 'UI failed to trigger reactive total calculations when coupon applied. API call succeeded.',
        createdAt: new Date(Date.now() - 4 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-104',
        projectId: p1Id,
        moduleId: '',
        title: 'Verify dark mode toggle applies stylesheets instantaneously',
        scenario: 'Verify dark mode toggle applies stylesheets instantaneously',
        simplifiedScenario: 'Dark mode toggle stylesheets',
        description: 'Dark mode selection should change root variables without a page reload or white flash.',
        steps: '1. Navigate to Settings page.\n2. Click the Dark Theme toggle button.',
        expected: 'The interface color theme shifts instantly to dark theme. Value is cached in local preferences.',
        actual: '',
        priority: 'Medium',
        severity: 'S4 - Minor',
        status: 'Blocked',
        type: 'Manual',
        assignee: 'Dwip Pandya',
        executionDate: '',
        defectId: '',
        comments: 'Blocked pending landing page consolidation layout pull request.',
        createdAt: new Date(Date.now() - 4 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-105',
        projectId: p2Id,
        moduleId: 'mod-notify',
        title: 'Verify FCM token registration upon application launch',
        scenario: 'Verify FCM token registration upon application launch',
        simplifiedScenario: 'FCM token registration',
        description: 'Device token should be fetched from Firebase and sent to Clair backend upon notification consent.',
        steps: '1. Install clean build and launch application.\n2. Click Accept on Notification prompt.',
        expected: 'Device registered success payload sent to backend API, token saved in device config.',
        actual: '',
        priority: 'Critical',
        severity: 'S1 - Blocker',
        status: 'Untested',
        type: 'Automated',
        assignee: 'Dwip Pandya',
        executionDate: '',
        defectId: '',
        comments: 'Need Android emulator test accounts configured first.',
        createdAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-106',
        projectId: p2Id,
        moduleId: 'mod-notify',
        title: 'Verify app launch redirection when clicking a push notification',
        scenario: 'Verify app launch redirection when clicking a push notification',
        simplifiedScenario: 'App launch redirect notification',
        description: 'Verify deep-linking path works when clicking notification while app is running in background.',
        steps: '1. Put app in background.\n2. Send push with custom data: url="clair://app/tasks/101".\n3. Click notification toast.',
        expected: 'App opens in foreground and loads Task #101 detail screen immediately.',
        actual: 'App crashed with NullPointerException when attempting to unpack deep-link bundle.',
        priority: 'High',
        severity: 'S2 - Critical',
        status: 'Failed',
        type: 'Manual',
        assignee: 'Albert Einstein',
        executionDate: '2026-05-26',
        defectId: 'BUG-204',
        comments: 'Crash occurs consistently on iOS 16 devices. Android passes.',
        createdAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-107',
        projectId: p2Id,
        moduleId: 'mod-sync',
        title: 'Verify SQLite database updates sync to cloud on network reconnect',
        scenario: 'Verify SQLite database updates sync to cloud on network reconnect',
        simplifiedScenario: 'Offline SQLite database sync',
        description: 'Offline created actions should trigger sync worker when connection goes from offline to online.',
        steps: '1. Enable offline mode in app settings.\n2. Complete 2 tasks.\n3. Turn network back online.',
        expected: 'Background sync runs, cloud database updates tasks, SQLite local indicators change to synced.',
        actual: 'Background sync completed after 5 seconds, all items successfully synchronized to cloud.',
        priority: 'High',
        severity: 'S3 - Major',
        status: 'Passed',
        type: 'Automated',
        assignee: 'Marie Curie',
        executionDate: '2026-05-28',
        defectId: '',
        comments: 'Sync verified on both Android and iOS devices. Logs match.',
        createdAt: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }
};

const renderSingleTestCaseRow = (tc, index, projModules, developers, selectedTestCaseIds) => {
  const statusCls = tc.status ? tc.status.toLowerCase() : 'untested';
  const priorityCls = tc.priority ? tc.priority.toLowerCase() : 'medium';
  const severityCls = tc.severity ? tc.severity.toLowerCase().split(' ')[0] : 'medium';

  const isChecked = selectedTestCaseIds && selectedTestCaseIds.has(tc.id);
  const rowSelectedClass = isChecked ? 'selected' : '';

  const modulesOptions = `<option value="">— None —</option>` +
    projModules.map(m => `<option value="${m.id}" ${tc.moduleId === m.id ? 'selected' : ''}>${m.name}</option>`).join('');

  const developersOptions = `<option value="">— Unassigned —</option>` +
    developers.map(d => `<option value="${d.name}" ${tc.assignee === d.name ? 'selected' : ''}>${d.name}</option>`).join('');

  return `
    <tr class="testcase-row ${rowSelectedClass}" data-id="${tc.id}">
      <td style="text-align: center; vertical-align: middle;">
        <input type="checkbox" class="testcase-select-checkbox" data-id="${tc.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer;" />
      </td>
      <td style="text-align: center; vertical-align: middle; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
      <td style="vertical-align: middle;"><strong class="testcase-id">${tc.id}</strong></td>
      
      <!-- Module Dropdown -->
      <td style="vertical-align: middle;">
        <select class="table-inline-select" data-field="moduleId" data-id="${tc.id}">
          ${modulesOptions}
        </select>
      </td>

      <!-- Scenario Input -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea scenario-cell" data-field="scenario" data-id="${tc.id}" rows="2">${tc.scenario || tc.title || ''}</textarea>
      </td>

      <!-- Simplified Scenario Input -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea" data-field="simplifiedScenario" data-id="${tc.id}" rows="2">${tc.simplifiedScenario || ''}</textarea>
      </td>

      <!-- Status Dropdown -->
      <td style="text-align: center; vertical-align: middle;">
        <select class="table-inline-select select-status-${statusCls}" style="font-weight:600;" data-field="status" data-id="${tc.id}">
          <option value="Untested" ${tc.status === 'Untested' ? 'selected' : ''}>Untested</option>
          <option value="Passed" ${tc.status === 'Passed' ? 'selected' : ''}>Passed</option>
          <option value="Failed" ${tc.status === 'Failed' ? 'selected' : ''}>Failed</option>
          <option value="Blocked" ${tc.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
        </select>
      </td>

      <!-- Priority Dropdown -->
      <td style="text-align: center; vertical-align: middle;">
        <select class="table-inline-select select-priority-${priorityCls}" style="font-weight:600;" data-field="priority" data-id="${tc.id}">
          <option value="Critical" ${tc.priority === 'Critical' ? 'selected' : ''}>Critical</option>
          <option value="High" ${tc.priority === 'High' ? 'selected' : ''}>High</option>
          <option value="Medium" ${tc.priority === 'Medium' ? 'selected' : ''}>Medium</option>
          <option value="Low" ${tc.priority === 'Low' ? 'selected' : ''}>Low</option>
        </select>
      </td>

      <!-- Severity Dropdown -->
      <td style="text-align: center; vertical-align: middle;">
        <select class="table-inline-select select-severity-${severityCls}" style="font-weight:600;" data-field="severity" data-id="${tc.id}">
          <option value="S1 - Blocker" ${tc.severity === 'S1 - Blocker' ? 'selected' : ''}>S1 - Blocker</option>
          <option value="S2 - Critical" ${tc.severity === 'S2 - Critical' ? 'selected' : ''}>S2 - Critical</option>
          <option value="S3 - Major" ${tc.severity === 'S3 - Major' ? 'selected' : ''}>S3 - Major</option>
          <option value="S4 - Minor" ${tc.severity === 'S4 - Minor' ? 'selected' : ''}>S4 - Minor</option>
        </select>
      </td>

      <!-- Type Dropdown -->
      <td style="text-align: center; vertical-align: middle;">
        <select class="table-inline-select" data-field="type" data-id="${tc.id}">
          <option value="Manual" ${tc.type === 'Manual' ? 'selected' : ''}>Manual</option>
          <option value="Automated" ${tc.type === 'Automated' ? 'selected' : ''}>Automated</option>
          <option value="API" ${tc.type === 'API' ? 'selected' : ''}>API</option>
          <option value="Security" ${tc.type === 'Security' ? 'selected' : ''}>Security</option>
          <option value="Performance" ${tc.type === 'Performance' ? 'selected' : ''}>Performance</option>
          <option value="Regression" ${tc.type === 'Regression' ? 'selected' : ''}>Regression</option>
        </select>
      </td>

      <!-- Assignee Dropdown -->
      <td style="vertical-align: middle;">
        <select class="table-inline-select" data-field="assignee" data-id="${tc.id}">
          ${developersOptions}
        </select>
      </td>

      <!-- Execution Date -->
      <td style="vertical-align: middle;">
        <input type="date" class="table-inline-input" data-field="executionDate" data-id="${tc.id}" value="${tc.executionDate || ''}" />
      </td>

      <!-- Defect ID -->
      <td style="vertical-align: middle;">
        <input type="text" class="table-inline-input" data-field="defectId" data-id="${tc.id}" value="${tc.defectId || ''}" />
      </td>

      <!-- Description -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea" data-field="description" data-id="${tc.id}" rows="2">${tc.description || ''}</textarea>
      </td>

      <!-- Steps -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea" data-field="steps" data-id="${tc.id}" rows="3">${tc.steps || ''}</textarea>
      </td>

      <!-- Expected -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea" data-field="expected" data-id="${tc.id}" rows="2">${tc.expected || ''}</textarea>
      </td>

      <!-- Actual -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea" data-field="actual" data-id="${tc.id}" rows="2">${tc.actual || ''}</textarea>
      </td>

      <!-- Comments -->
      <td style="vertical-align: middle;">
        <textarea class="table-inline-textarea" data-field="comments" data-id="${tc.id}" rows="2">${tc.comments || ''}</textarea>
      </td>

      <!-- Actions Column (Delete button only) -->
      <td style="text-align: center; vertical-align: middle;">
        <button class="icon-btn danger" data-action="delete-testcase" data-id="${tc.id}" title="Delete Test Case" style="width: 24px; height: 24px; padding: 2px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:12px; height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </td>
    </tr>
  `;
};

const renderTestCaseManagement = () => {
  // Ensure we have active project selected
  if (state.projects.length > 0 && !state.activeTestCaseProjectId) {
    state.activeTestCaseProjectId = state.projects[0].id;
  }

  // Handle case where there are no projects at all
  if (state.projects.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
        </div>
        <h3>No projects found</h3>
        <p>You need to create a project first before creating modules or test cases.</p>
        <button class="btn-primary" onclick="openProjectModal()" style="margin-top: 12px;">Create Project</button>
      </div>
    `;
  }

  const activeProj = state.projects.find(p => p.id === state.activeTestCaseProjectId) || state.projects[0];
  state.activeTestCaseProjectId = activeProj.id;
  const activeProjId = state.activeTestCaseProjectId;

  // 1. Pre-group test cases by moduleId and projectId for O(1) lookups
  const projectCases = [];
  const moduleCasesMap = {}; // moduleId -> array of test cases
  const projectCounts = {}; // projectId -> count

  state.testCases.forEach(tc => {
    projectCounts[tc.projectId] = (projectCounts[tc.projectId] || 0) + 1;
    if (tc.projectId === activeProjId) {
      projectCases.push(tc);
      const mid = tc.moduleId || '';
      if (!moduleCasesMap[mid]) {
        moduleCasesMap[mid] = [];
      }
      moduleCasesMap[mid].push(tc);
    }
  });

  const isModuleSelected = (moduleId) => {
    let mCases;
    if (moduleId === 'all') {
      mCases = projectCases;
    } else {
      mCases = moduleCasesMap[moduleId] || [];
    }
    if (mCases.length === 0) return false;
    return mCases.every(tc => state.selectedTestCaseIds && state.selectedTestCaseIds.has(tc.id));
  };

  // ─── Filter logic ───
  let filteredCases = projectCases;

  // Module filter
  if (state.activeTestCaseModuleId !== null) {
    filteredCases = moduleCasesMap[state.activeTestCaseModuleId] || [];
  }

  const allCount = projectCases.length;

  // Search filter
  const q = state.testCaseSearch.toLowerCase();
  if (q) {
    filteredCases = filteredCases.filter(tc =>
      tc.id.toLowerCase().includes(q) ||
      (tc.scenario || tc.title || '').toLowerCase().includes(q) ||
      (tc.simplifiedScenario || '').toLowerCase().includes(q) ||
      (tc.description || '').toLowerCase().includes(q) ||
      (tc.steps || '').toLowerCase().includes(q) ||
      (tc.expected || '').toLowerCase().includes(q) ||
      (tc.actual || '').toLowerCase().includes(q) ||
      (tc.assignee || '').toLowerCase().includes(q) ||
      (tc.defectId || '').toLowerCase().includes(q) ||
      (tc.comments || '').toLowerCase().includes(q)
    );
  }

  // Dropdown filters
  if (state.testCaseFilters.status) {
    filteredCases = filteredCases.filter(tc => tc.status === state.testCaseFilters.status);
  }
  if (state.testCaseFilters.priority) {
    filteredCases = filteredCases.filter(tc => tc.priority === state.testCaseFilters.priority);
  }
  if (state.testCaseFilters.type) {
    filteredCases = filteredCases.filter(tc => tc.type === state.testCaseFilters.type);
  }
  state.lastFilteredCases = filteredCases;

  // ─── Calculate stats for charts ───
  const scopeCases = state.activeTestCaseModuleId !== null ? (moduleCasesMap[state.activeTestCaseModuleId] || []) : projectCases;

  const total = scopeCases.length;
  let passed = 0, failed = 0, blocked = 0, untested = 0, automated = 0;
  scopeCases.forEach(tc => {
    if (tc.status === 'Passed') passed++;
    else if (tc.status === 'Failed') failed++;
    else if (tc.status === 'Blocked') blocked++;
    else if (tc.status === 'Untested') untested++;

    if (tc.type === 'Automated') automated++;
  });

  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const autoRate = total > 0 ? Math.round((automated / total) * 100) : 0;

  // Donut SVG Math
  const circumference = 2 * Math.PI * 30; // 188.49
  const strokeDash = `${(passRate / 100) * circumference} ${circumference}`;

  // Tabs HTML
  const tabsHtml = state.projects.map(p => {
    const count = projectCounts[p.id] || 0;
    const isActive = p.id === state.activeTestCaseProjectId ? 'active' : '';
    return `
      <button class="project-tab ${isActive}" data-project-id="${p.id}">
        <span>${p.name}</span>
        <span class="project-tab-count">${count}</span>
      </button>
    `;
  }).join('');

  // Modules List HTML
  const projModules = state.modules.filter(m => m.projectId === state.activeTestCaseProjectId);
  const rootActive = state.activeTestCaseModuleId === null ? 'active' : '';

  const modulesHtml = `
    <div class="module-item ${rootActive}" data-module-id="root">
      <div class="module-item-left">
        ${state.testCaseSelectionMode ? `<input type="checkbox" class="module-select-checkbox" data-module-id="all" ${isModuleSelected('all') ? 'checked' : ''} style="margin-right: 6px; cursor: pointer;" />` : ''}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
        <span class="module-item-name">All Cases</span>
      </div>
      <span class="project-tab-count">${allCount}</span>
    </div>
  ` + projModules.map(m => {
    const mCount = (moduleCasesMap[m.id] || []).length;
    const isActive = m.id === state.activeTestCaseModuleId ? 'active' : '';
    const isModChecked = isModuleSelected(m.id) ? 'checked' : '';
    return `
      <div class="module-item ${isActive}" data-module-id="${m.id}">
        <div class="module-item-left">
          ${state.testCaseSelectionMode ? `<input type="checkbox" class="module-select-checkbox" data-module-id="${m.id}" ${isModChecked} style="margin-right: 6px; cursor: pointer;" />` : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
          <span class="module-item-name" title="${m.name}">${m.name}</span>
        </div>
        <div class="module-item-right">
          <span class="project-tab-count">${mCount}</span>
          <div class="module-item-actions">
            <button class="module-item-btn" data-action="edit-module" data-id="${m.id}" title="Edit Module">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px; height:10px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="module-item-btn danger" data-action="delete-module" data-id="${m.id}" title="Delete Module">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px; height:10px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Stats and progress row
  const passWidth = total > 0 ? (passed / total) * 100 : 0;
  const failWidth = total > 0 ? (failed / total) * 100 : 0;
  const blockWidth = total > 0 ? (blocked / total) * 100 : 0;
  const untestWidth = total > 0 ? (untested / total) * 100 : 0;

  // Table Rows layout with pagination
  const visibleCount = state.visibleTestCaseCount || 100;
  const tableRowsHtml = filteredCases.slice(0, visibleCount).map((tc, index) => {
    return renderSingleTestCaseRow(tc, index, projModules, state.developers, state.selectedTestCaseIds);
  }).join('') || `
    <tr>
      <td colspan="19" style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
        <h3>No test cases found</h3>
        <p>Try clearing filters or click "Add Test Case" to create one.</p>
      </td>
    </tr>
  `;

  const selectedCount = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  const selectionBarHtml = state.testCaseSelectionMode ? `
    <div class="selection-action-bar" style="background: var(--accent-light); border: 1px solid rgba(45, 106, 79, 0.15); display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-radius: var(--radius-sm); margin-bottom: 16px;">
      <div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color: var(--accent);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px; color: var(--accent);">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <path d="M9 11l3 3 5-5"/>
        </svg>
        <span>${selectedCount} test cases selected</span>
      </div>
      <div style="display:flex; gap:8px; align-items: center;">
        <button class="btn-ghost" id="selectAllTestCasesBtn" style="font-size:12px; padding:6px 12px; height: 28px; line-height: 1; border: 1px solid var(--border); font-weight: 500; background: var(--surface); color: var(--text);">Select All</button>
        <button class="btn-ghost" id="clearTestCaseSelectionBtn" style="font-size:12px; padding:6px 12px; height: 28px; line-height: 1; border: 1px solid var(--border); font-weight: 500; background: var(--surface); color: var(--text-secondary);" ${selectedCount === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed; background: var(--surface);"' : ''}>Clear All</button>
        <button class="btn-primary" id="bulkDeleteTestCasesBtn" style="font-size:12px; padding:6px 12px; background:#c0392b; border-color:#c0392b; color:#fff; height: 28px; line-height: 1; font-weight: 500;" ${selectedCount === 0 ? 'disabled style="background:#e8c4c4; border-color:#e8c4c4; color:#fff; cursor: not-allowed;"' : ''}>Delete Selected</button>
        <span style="color: var(--border); margin: 0 4px;">|</span>
        <button class="btn-ghost" id="cancelTestCaseSelectionBtn" style="font-size:12px; padding:6px 12px; height: 28px; line-height: 1; color: var(--text-muted); font-weight: 500; border: 1px solid transparent; background: transparent;">Exit</button>
      </div>
    </div>
  ` : '';

  // Build hero banner stats
  const tcHero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg>`,
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
    title: 'Test Case Management',
    subtitle: 'Manage, execute and track test cases across your project modules.',
    stats: [
      { label: 'Total Cases', value: state.testCases.length },
      { label: 'Passed', value: passed, color: '#4ade80' },
      { label: 'Failed', value: failed, color: '#f87171' },
      { label: 'Blocked', value: blocked, color: '#fb923c' },
      { label: 'Untested', value: untested, color: '#94a3b8' },
      { label: 'Pass Rate', value: `${passRate}%`, color: passRate >= 80 ? '#4ade80' : passRate >= 50 ? '#fbbf24' : '#f87171' },
    ],
    progressBar: { pct: passRate, label: `${passed} / ${total} passed`, color: 'linear-gradient(90deg, #4ade80, #22c55e)' }
  });

  // Return full workspace markup
  return `
    ${tcHero}
    <div class="project-tabs-container">
      ${tabsHtml}
    </div>


    <div class="testcases-workspace">
      <!-- Full-Width Main Panel -->
      <section class="testcases-main-panel" style="width: 100%;">
        <!-- Modules Horizontal Row -->
        <div class="modules-horizontal-row">
          <div class="modules-horizontal-title">Modules:</div>
          <div class="modules-horizontal-list" id="testCaseModulesList">
            ${modulesHtml}
          </div>
          <button class="add-module-pill-btn" id="openAddModuleModalBtn" title="New Module">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px; height:12px; margin-right:4px;"><path d="M12 5v14M5 12h14"/></svg>
            Add Module
          </button>
        </div>
        ${selectionBarHtml}
        
        <!-- Reports and Analytics Charts Row -->
        <div class="testcases-charts-row">
          
          <!-- Pass Rate Donut Chart -->
          <div class="chart-card">
            <span class="chart-card-title">Test Pass Rate</span>
            <div class="chart-container">
              <div style="position:relative; width:90px; height:90px; display:grid; place-items:center;">
                <svg class="donut-svg">
                  <circle cx="45" cy="45" r="30" fill="none" stroke="var(--border)" stroke-width="12"></circle>
                  <circle class="donut-segment" cx="45" cy="45" r="30" fill="none" stroke="#2d6a4f" stroke-dasharray="${strokeDash}" stroke-dashoffset="0"></circle>
                </svg>
                <div class="donut-center">
                  <span class="donut-val">${passRate}%</span>
                  <span class="donut-lbl">Passed</span>
                </div>
              </div>
              <div class="chart-legend">
                <div class="legend-item">
                  <span class="legend-color" style="background:#2d6a4f;"></span>
                  <span>Passed</span>
                  <span class="legend-val">${passed}</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color" style="background:#c0392b;"></span>
                  <span>Failed</span>
                  <span class="legend-val">${failed}</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color" style="background:#ef6c00;"></span>
                  <span>Blocked</span>
                  <span class="legend-val">${blocked}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Execution Summary Progress Bar & Automation Rate -->
          <div class="chart-card">
            <span class="chart-card-title">Automation & Run Status</span>
            <div style="display:flex; flex-direction:column; justify-content:center; gap:16px; height:100%;">
              <div class="stacked-progress-wrap">
                <div style="display:flex; justify-content:space-between; font-size:11.5px;">
                  <span style="font-weight:600; color:var(--text-secondary);">Execution Coverage</span>
                  <span style="color:var(--text-muted);">${total - untested} / ${total} Run</span>
                </div>
                <div class="stacked-progress-bar">
                  <div class="progress-segment pass" style="width: ${passWidth}%" title="Passed: ${passed}"></div>
                  <div class="progress-segment fail" style="width: ${failWidth}%" title="Failed: ${failed}"></div>
                  <div class="progress-segment blocked" style="width: ${blockWidth}%" title="Blocked: ${blocked}"></div>
                  <div class="progress-segment untested" style="width: ${untestWidth}%" title="Untested: ${untested}"></div>
                </div>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border); padding-top:12px;">
                <div style="display:flex; flex-direction:column;">
                  <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:500;">Automation</span>
                  <strong style="font-size:18px; color:var(--text);">${autoRate}%</strong>
                </div>
                <span class="status-pill automation" style="background:var(--accent-light); color:var(--accent); border:1px solid rgba(45,106,79,0.15); font-size:10.5px;">
                  ${automated} Automated cases
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter Toolbar -->
        <div class="filters-bar" style="margin-bottom: 0;">
          <div class="page-search-wrap">
            <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="text" class="page-search-input" id="testCaseSearchInput" placeholder="Search test cases…" value="${state.testCaseSearch || ''}" />
            ${state.testCaseSearch ? `<button class="page-search-clear" id="clearTestCaseSearch">✕</button>` : ''}
          </div>

          <select class="filter-select" id="filterTCStatus" data-tcfilter="status">
            <option value="">All Run Statuses</option>
            <option value="Passed" ${state.testCaseFilters.status === 'Passed' ? 'selected' : ''}>Passed</option>
            <option value="Failed" ${state.testCaseFilters.status === 'Failed' ? 'selected' : ''}>Failed</option>
            <option value="Blocked" ${state.testCaseFilters.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
            <option value="Untested" ${state.testCaseFilters.status === 'Untested' ? 'selected' : ''}>Untested</option>
          </select>

          <select class="filter-select" id="filterTCPriority" data-tcfilter="priority">
            <option value="">All Priorities</option>
            <option value="Critical" ${state.testCaseFilters.priority === 'Critical' ? 'selected' : ''}>Critical</option>
            <option value="High" ${state.testCaseFilters.priority === 'High' ? 'selected' : ''}>High</option>
            <option value="Medium" ${state.testCaseFilters.priority === 'Medium' ? 'selected' : ''}>Medium</option>
            <option value="Low" ${state.testCaseFilters.priority === 'Low' ? 'selected' : ''}>Low</option>
          </select>

          <select class="filter-select" id="filterTCType" data-tcfilter="type">
            <option value="">All Types</option>
            <option value="Manual" ${state.testCaseFilters.type === 'Manual' ? 'selected' : ''}>Manual</option>
            <option value="Automated" ${state.testCaseFilters.type === 'Automated' ? 'selected' : ''}>Automated</option>
          </select>

          <button class="btn-ghost" id="openExcelImportModalBtn" style="padding: 6px 12px; font-size: 12.5px; border-radius: var(--radius-sm); font-weight:500;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px; height:13px; margin-right:4px;">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            Import Excel
          </button>

          <button class="btn-ghost" id="openBulkUpdateModalBtn" style="padding: 6px 12px; font-size: 12.5px; border-radius: var(--radius-sm); font-weight:500; margin-left: 6px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px; height:13px; margin-right:4px;">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Bulk Update
          </button>

          <button class="btn-ghost ${state.testCaseSelectionMode ? 'active' : ''}" id="toggleTestCaseSelectionModeBtn" style="padding: 6px 12px; font-size: 12.5px; border-radius: var(--radius-sm); font-weight:500; margin-left: 6px; ${state.testCaseSelectionMode ? 'background: var(--accent-light); color: var(--accent); border-color: var(--accent); font-weight: 600;' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px; height:13px; margin-right:4px;">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <path d="M9 11l3 3 5-5"/>
            </svg>
            ${state.testCaseSelectionMode ? 'Cancel Selection' : 'Select Cases'}
          </button>

          ${(state.testCaseSearch || state.testCaseFilters.status || state.testCaseFilters.priority || state.testCaseFilters.type) ? `
            <button class="btn-ghost" id="clearTestCaseFilters" style="font-size:12px; padding:6px 10px;">Clear filters</button>
          ` : ''}
        </div>

        <!-- Table Container -->
        <div class="testcases-table-wrapper" id="testCasesContainer">
          <table class="testcases-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center; vertical-align: middle;">
                  <input type="checkbox" id="selectAllTcCb" style="cursor: pointer;" ${state.selectedTestCaseIds && state.selectedTestCaseIds.size > 0 && state.selectedTestCaseIds.size === filteredCases.length ? 'checked' : ''} />
                </th>
                <th style="width: 60px; text-align: center; vertical-align: middle;">Sr No.</th>
                <th style="min-width: 100px; vertical-align: middle;">ID</th>
                <th style="min-width: 150px; vertical-align: middle;">Module</th>
                <th style="min-width: 250px; vertical-align: middle;">Scenario</th>
                <th style="min-width: 180px; vertical-align: middle;">Simplified Scenario</th>
                <th style="min-width: 110px; text-align: center; vertical-align: middle;">Status</th>
                <th style="min-width: 90px; text-align: center; vertical-align: middle;">Priority</th>
                <th style="min-width: 90px; text-align: center; vertical-align: middle;">Severity</th>
                <th style="min-width: 90px; text-align: center; vertical-align: middle;">Type</th>
                <th style="min-width: 120px; vertical-align: middle;">Assignee</th>
                <th style="min-width: 130px; vertical-align: middle;">Execution Date</th>
                <th style="min-width: 100px; vertical-align: middle;">Defect ID</th>
                <th style="min-width: 250px; vertical-align: middle;">Description</th>
                <th style="min-width: 250px; vertical-align: middle;">Steps</th>
                <th style="min-width: 250px; vertical-align: middle;">Expected Result</th>
                <th style="min-width: 250px; vertical-align: middle;">Actual Result</th>
                <th style="min-width: 200px; vertical-align: middle;">Comments</th>
                <th style="min-width: 80px; text-align: center; vertical-align: middle;">Actions</th>
              </tr>
            </thead>
            <tbody id="testCasesTableBody">
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>

      </section>
    </div>
  `;
};

// ─── Test Case Management Dropdown Helpers ───────────────────
const updateTestCaseModuleDropdown = (projectId, selectedModuleValue = '') => {
  const modSel = document.getElementById('testCaseModule');
  if (!modSel) return;
  if (!projectId) {
    modSel.innerHTML = `<option value="">— None —</option>`;
    return;
  }
  const projModules = state.modules.filter(m => m.projectId === projectId);
  modSel.innerHTML = `<option value="">— None (Directly in Project) —</option>` +
    projModules.map(m => `<option value="${m.id}" ${selectedModuleValue === m.id ? 'selected' : ''}>${m.name}</option>`).join('');
};

// ─── Test Case Actions ───────────────────────────────────────
const openTestCaseModal = (id = null) => {
  const modal = document.getElementById('testCaseModal');
  const title = document.getElementById('testCaseModalTitle');

  // Reset tab states to first tab
  modal.querySelectorAll('.modal-tab').forEach((tab, idx) => {
    tab.classList.toggle('active', idx === 0);
  });
  modal.querySelectorAll('.modal-tab-content').forEach((content, idx) => {
    content.classList.toggle('active', idx === 0);
  });

  // Populate projects dropdown
  const projSel = document.getElementById('testCaseProject');
  projSel.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  // Populate assignees dropdown
  const assigneeSel = document.getElementById('testCaseAssignee');
  assigneeSel.innerHTML = `<option value="">— Unassigned —</option>` +
    state.developers.map(d => `<option value="${d.name}">${d.name}</option>`).join('');

  if (id) {
    const tc = state.testCases.find(x => x.id === id);
    if (!tc) return;
    title.textContent = 'Edit Test Case';
    document.getElementById('testCaseId').value = tc.id;
    document.getElementById('testCaseScenario').value = tc.scenario || tc.title || '';
    document.getElementById('testCaseSimplifiedScenario').value = tc.simplifiedScenario || '';
    document.getElementById('testCaseDesc').value = tc.description || '';
    document.getElementById('testCaseSteps').value = tc.steps || '';
    document.getElementById('testCaseExpected').value = tc.expected || '';
    document.getElementById('testCaseActual').value = tc.actual || '';

    projSel.value = tc.projectId;
    updateTestCaseModuleDropdown(tc.projectId, tc.moduleId || '');

    document.getElementById('testCaseCustomId').value = tc.id;
    document.getElementById('testCasePriority').value = tc.priority;
    document.getElementById('testCaseSeverity').value = tc.severity || 'S3 - Major';
    document.getElementById('testCaseType').value = tc.type || 'Manual';
    document.getElementById('testCaseStatus').value = tc.status || 'Untested';
    document.getElementById('testCaseAssignee').value = tc.assignee || '';
    document.getElementById('testCaseExecutionDate').value = tc.executionDate || '';
    document.getElementById('testCaseDefectId').value = tc.defectId || '';
    document.getElementById('testCaseComments').value = tc.comments || '';
  } else {
    title.textContent = 'New Test Case';
    document.getElementById('testCaseId').value = '';
    document.getElementById('testCaseScenario').value = '';
    document.getElementById('testCaseSimplifiedScenario').value = '';
    document.getElementById('testCaseDesc').value = '';
    document.getElementById('testCaseSteps').value = '';
    document.getElementById('testCaseExpected').value = '';
    document.getElementById('testCaseActual').value = '';

    // Default to active tab project
    projSel.value = state.activeTestCaseProjectId || (state.projects[0] ? state.projects[0].id : '');
    updateTestCaseModuleDropdown(projSel.value, state.activeTestCaseModuleId || '');

    document.getElementById('testCaseCustomId').value = '';
    document.getElementById('testCasePriority').value = 'High';
    document.getElementById('testCaseSeverity').value = 'S3 - Major';
    document.getElementById('testCaseType').value = 'Manual';
    document.getElementById('testCaseStatus').value = 'Untested';
    document.getElementById('testCaseAssignee').value = '';
    document.getElementById('testCaseExecutionDate').value = '';
    document.getElementById('testCaseDefectId').value = '';
    document.getElementById('testCaseComments').value = '';
  }

  showModal('testCaseModal');
};

const saveTestCase = async () => {
  const id = document.getElementById('testCaseId').value;
  const scenario = document.getElementById('testCaseScenario').value.trim();
  const simplifiedScenario = document.getElementById('testCaseSimplifiedScenario').value.trim();
  const description = document.getElementById('testCaseDesc').value.trim();
  const steps = document.getElementById('testCaseSteps').value.trim();
  const expected = document.getElementById('testCaseExpected').value.trim();
  const actual = document.getElementById('testCaseActual').value.trim();
  const projectId = document.getElementById('testCaseProject').value;
  const moduleId = document.getElementById('testCaseModule').value;
  const customId = document.getElementById('testCaseCustomId').value.trim();
  const priority = document.getElementById('testCasePriority').value;
  const severity = document.getElementById('testCaseSeverity').value;
  const type = document.getElementById('testCaseType').value;
  const status = document.getElementById('testCaseStatus').value;
  const assignee = document.getElementById('testCaseAssignee').value;
  const executionDate = document.getElementById('testCaseExecutionDate').value;
  const defectId = document.getElementById('testCaseDefectId').value.trim();
  const comments = document.getElementById('testCaseComments').value.trim();

  if (!scenario) { showToast('Test scenario is required', 'error'); return; }
  if (!steps) { showToast('Steps are required', 'error'); return; }
  if (!expected) { showToast('Expected result is required', 'error'); return; }
  if (!projectId) { showToast('Project selection is required', 'error'); return; }

  const now = new Date().toISOString();

  if (id) {
    const idx = state.testCases.findIndex(tc => tc.id === id);
    if (idx === -1) return;

    let finalId = id;
    if (customId && customId !== id) {
      const conflict = state.testCases.find(tc => tc.id === customId);
      if (conflict) {
        showToast(`Test Case ID "${customId}" already exists`, 'error');
        return;
      }
      finalId = customId;
    }

    state.testCases[idx] = {
      ...state.testCases[idx],
      id: finalId,
      title: scenario,
      scenario,
      simplifiedScenario,
      description,
      steps,
      expected,
      actual,
      projectId,
      moduleId,
      priority,
      severity,
      type,
      status,
      assignee,
      executionDate,
      defectId,
      comments,
      updatedAt: now
    };
    logActivity(`Updated test case "${finalId}"`, 'task');
    showToast('Test case updated');
  } else {
    let finalId = customId;
    if (!finalId) {
      const lastIdNum = state.testCases.reduce((max, tc) => {
        const match = tc.id.match(/^TC-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, 100);
      finalId = `TC-${lastIdNum + 1}`;
    } else {
      const conflict = state.testCases.find(tc => tc.id === finalId);
      if (conflict) {
        showToast(`Test Case ID "${finalId}" already exists`, 'error');
        return;
      }
    }

    state.testCases.push({
      id: finalId,
      title: scenario,
      scenario,
      simplifiedScenario,
      description,
      steps,
      expected,
      actual,
      projectId,
      moduleId,
      priority,
      severity,
      type,
      status,
      assignee,
      executionDate,
      defectId,
      comments,
      createdAt: now,
      updatedAt: now
    });
    logActivity(`Created test case "${finalId}"`, 'task');
    showToast('Test case created');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteTestCase = (id) => {
  const tc = state.testCases.find(x => x.id === id);
  if (!tc) return;
  document.getElementById('confirmMessage').textContent =
    `Delete test case "${tc.id}: ${tc.scenario || tc.title}"? This action cannot be undone.`;
  confirmCallback = () => deleteTestCase(id);
  showModal('confirmModal');
};

const deleteTestCase = async (id) => {
  state.testCases = state.testCases.filter(x => x.id !== id);
  logActivity(`Deleted test case "${id}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Test case deleted');
};

// ─── Module Actions ──────────────────────────────────────────
const openModuleModal = (id = null) => {
  const modal = document.getElementById('moduleModal');
  const title = document.getElementById('moduleModalTitle');

  // Populate projects
  const projSel = document.getElementById('moduleProject');
  projSel.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  if (id) {
    const m = state.modules.find(x => x.id === id);
    if (!m) return;
    title.textContent = 'Edit Module';
    document.getElementById('moduleId').value = m.id;
    document.getElementById('moduleName').value = m.name;
    projSel.value = m.projectId;
    document.getElementById('moduleDesc').value = m.description || '';
  } else {
    title.textContent = 'New Module';
    document.getElementById('moduleId').value = '';
    document.getElementById('moduleName').value = '';
    projSel.value = state.activeTestCaseProjectId || (state.projects[0] ? state.projects[0].id : '');
    document.getElementById('moduleDesc').value = '';
  }

  showModal('moduleModal');
};

const saveModule = async () => {
  const id = document.getElementById('moduleId').value;
  const name = document.getElementById('moduleName').value.trim();
  const projectId = document.getElementById('moduleProject').value;
  const description = document.getElementById('moduleDesc').value.trim();

  if (!name) { showToast('Module name is required', 'error'); return; }
  if (!projectId) { showToast('Project is required', 'error'); return; }

  if (id) {
    const idx = state.modules.findIndex(m => m.id === id);
    if (idx === -1) return;
    state.modules[idx] = {
      ...state.modules[idx],
      name, projectId, description
    };
    logActivity(`Updated module "${name}"`, 'project');
    showToast('Module updated');
  } else {
    state.modules.push({
      id: 'mod-' + uid(),
      projectId, name, description
    });
    logActivity(`Created module "${name}"`, 'project');
    showToast('Module created');
  }

  await storage.save();
  closeModals();
  render();
};

const confirmDeleteModule = (id) => {
  const m = state.modules.find(x => x.id === id);
  if (!m) return;
  document.getElementById('confirmMessage').textContent =
    `Delete module "${m.name}"? Test cases within this module will not be deleted; they will be moved to the project root level.`;
  confirmCallback = () => deleteModule(id);
  showModal('confirmModal');
};

const deleteModule = async (id) => {
  const m = state.modules.find(x => x.id === id);
  if (!m) return;

  // Detach test cases from module
  state.testCases.forEach(tc => {
    if (tc.moduleId === id) {
      tc.moduleId = '';
    }
  });

  state.modules = state.modules.filter(x => x.id !== id);
  logActivity(`Deleted module "${m.name}"`, 'delete');

  if (state.activeTestCaseModuleId === id) {
    state.activeTestCaseModuleId = null;
  }

  await storage.save();
  closeModals();
  render();
  showToast('Module deleted');
};

// ─── Excel Import Simulator ──────────────────────────────────
const openExcelImportModal = () => {
  const modal = document.getElementById('excelImportModal');

  // Populate target project dropdown
  const projSel = document.getElementById('excelImportProject');
  projSel.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  projSel.value = state.activeTestCaseProjectId || (state.projects[0] ? state.projects[0].id : '');

  // Populate target module dropdown based on selected project
  updateExcelImportModuleDropdown(projSel.value);

  // Set project change listener in import modal
  projSel.onchange = (e) => {
    updateExcelImportModuleDropdown(e.target.value);
    renderImportPreview();
  };

  // Reset file input and preview styles
  document.getElementById('excelFileInput').value = '';
  document.getElementById('excelPreviewSection').style.display = 'none';
  document.getElementById('excelLoadingSection').style.display = 'none';
  document.getElementById('saveExcelImport').style.display = 'none';
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  if (replaceDupesCheckbox) replaceDupesCheckbox.checked = false;

  const dropzone = document.getElementById('excelDropzone');
  dropzone.style.display = 'flex';

  showModal('excelImportModal');
};

const updateExcelImportModuleDropdown = (projectId) => {
  const modSel = document.getElementById('excelImportModule');
  if (!modSel) return;
  const projModules = state.modules.filter(m => m.projectId === projectId);
  modSel.innerHTML = `<option value="">-- Let Excel determine module --</option>` +
    `<option value="root_only">-- Root Level (No Module) --</option>` +
    projModules.map(m => `<option value="${m.id}">Into module: ${m.name}</option>`).join('');
};

let pendingImportData = null;

const parseCSVText = (text, delimiter = ',') => {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter) {
      if (insideQuote) {
        row[row.length - 1] += delimiter;
      } else {
        row.push("");
      }
    } else if (char === '\r' || char === '\n') {
      if (insideQuote) {
        row[row.length - 1] += char;
      } else {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      }
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }

  return lines.filter(r => r.some(cell => cell.trim() !== ""));
};

const mapHeaders = (headers) => {
  const mapping = {};
  const addMapping = (key, index) => {
    if (!mapping[key]) {
      mapping[key] = [];
    }
    mapping[key].push(index);
  };

  headers.forEach((h, index) => {
    const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. TestCase ID
    if (clean === 'testcaseid' || clean === 'id' || clean === 'tcid' || clean.includes('srno') || clean === 'no' || clean === 'testcasesrno' || clean === 'sr') {
      addMapping('id', index);
    }
    // 2. Test Type
    else if (clean.includes('testtype') || clean === 'type') {
      addMapping('type', index);
    }
    // 3. Test Scenario & Description
    else if (clean === 'testscenario' || clean === 'scenario' || clean === 'title' || clean === 'name' || clean.includes('description') || clean.includes('scenario')) {
      addMapping('scenario', index);
      if (clean.includes('description') || clean === 'desc') {
        addMapping('description', index);
      }
    }
    else if (clean.includes('description') || clean === 'desc') {
      addMapping('description', index);
      addMapping('scenario', index); // fallback
    }
    // 4. Simplified Test Scenario
    else if (clean === 'simplifiedtestscenario' || clean === 'simplifiedscenario') {
      addMapping('simplifiedScenario', index);
    }
    // 5. Test Steps
    else if (clean === 'teststeps' || clean === 'steps') {
      addMapping('steps', index);
    }
    // 6. Expected Result
    else if (clean.includes('expected') || clean.includes('validationpoint')) {
      addMapping('expected', index);
    }
    // 7. Actual Result
    else if (clean.includes('actual')) {
      addMapping('actual', index);
    }
    // 8. Priority
    else if (clean === 'priority') {
      addMapping('priority', index);
    }
    // 9. Severity
    else if (clean === 'severity') {
      addMapping('severity', index);
    }
    // 10. Status
    else if (clean.includes('status')) {
      addMapping('status', index);
    }
    // 11. Tested By
    else if (clean.includes('testedby') || clean.includes('tester') || clean === 'assignee') {
      addMapping('assignee', index);
    }
    // 12. Execution Date
    else if (clean.includes('testingdate') || clean === 'executiondate' || clean === 'date') {
      addMapping('executionDate', index);
    }
    // 13. Defect ID
    else if (clean.includes('defectid') || clean.includes('bugid') || clean.includes('bugno') || clean === 'defect') {
      addMapping('defectId', index);
    }
    // 14. Comments
    else if (clean.includes('comment') || clean === 'comments' || clean === 'notes' || clean === 'runnotes') {
      addMapping('comments', index);
    }
    // 15. Module
    else if (clean.includes('module') || clean.includes('folder') || clean.includes('component') || clean.includes('functionality')) {
      addMapping('module', index);
    }
  });

  return mapping;
};

const normalizePriority = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.includes('critical')) return 'Critical';
  if (clean.includes('high')) return 'High';
  if (clean.includes('low')) return 'Low';
  if (clean.includes('medium')) return 'Medium';
  return 'Medium'; // default
};

const normalizeSeverity = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.includes('s1') || clean.includes('blocker')) return 'S1 - Blocker';
  if (clean.includes('s2') || clean.includes('critical')) return 'S2 - Critical';
  if (clean.includes('s4') || clean.includes('minor')) return 'S4 - Minor';
  if (clean.includes('s3') || clean.includes('major')) return 'S3 - Major';
  return 'S3 - Major'; // default
};

const normalizeStatus = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.startsWith('pass')) return 'Passed';
  if (clean.startsWith('fail')) return 'Failed';
  if (clean.startsWith('block')) return 'Blocked';
  if (clean.startsWith('untest')) return 'Untested';
  return 'Untested'; // default
};

const normalizeType = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.includes('auto')) return 'Automated';
  if (clean.includes('api')) return 'API';
  if (clean.includes('security') || clean.includes('sec')) return 'Security';
  if (clean.includes('performance') || clean.includes('perf')) return 'Performance';
  if (clean.includes('regression') || clean.includes('reg')) return 'Regression';
  if (clean.includes('manual')) return 'Manual';
  return 'Manual'; // default
};

const parseAndFormatImportDate = (val) => {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      return val.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }
  const str = String(val).trim();
  if (!str) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return d.toISOString().split('T')[0];
    } catch (e) {
      return str;
    }
  }
  return str;
};

const hasDiff = (existing, row, activeMapping, projectId) => {
  const getVal = (key) => {
    const idxs = activeMapping[key];
    if (idxs === undefined) return "";
    if (Array.isArray(idxs)) {
      for (let i = idxs.length - 1; i >= 0; i--) {
        const val = String(row[idxs[i]] || '').trim();
        if (val !== "") return row[idxs[i]];
      }
      return row[idxs[0]] || "";
    }
    return (row[idxs] !== undefined) ? row[idxs] : "";
  };

  const getCleanStr = (key) => {
    const raw = getVal(key);
    return raw instanceof Date ? parseAndFormatImportDate(raw) : String(raw || '').trim();
  };

  for (const key in activeMapping) {
    if (activeMapping[key] === undefined) continue;

    if (key === 'scenario') {
      const val = getCleanStr('scenario');
      if ((existing.scenario || existing.title || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'simplifiedScenario') {
      const val = getCleanStr('simplifiedScenario');
      if ((existing.simplifiedScenario || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'steps') {
      const val = getCleanStr('steps');
      if ((existing.steps || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'expected') {
      const val = getCleanStr('expected');
      if ((existing.expected || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'actual') {
      const val = getCleanStr('actual');
      if ((existing.actual || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'priority') {
      const val = normalizePriority(getVal('priority'));
      if (existing.priority !== val) {
        return true;
      }
    }
    else if (key === 'severity') {
      const val = normalizeSeverity(getVal('severity'));
      if (existing.severity !== val) {
        return true;
      }
    }
    else if (key === 'status') {
      const val = normalizeStatus(getVal('status'));
      if (existing.status !== val) {
        return true;
      }
    }
    else if (key === 'type') {
      const val = normalizeType(getVal('type'));
      if (existing.type !== val) {
        return true;
      }
    }
    else if (key === 'assignee') {
      const val = getCleanStr('assignee');
      if ((existing.assignee || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'executionDate') {
      const val = parseAndFormatImportDate(getVal('executionDate'));
      if (existing.executionDate !== val) {
        return true;
      }
    }
    else if (key === 'defectId') {
      const val = getCleanStr('defectId');
      if ((existing.defectId || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'comments') {
      const val = getCleanStr('comments');
      if ((existing.comments || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'module') {
      const val = getCleanStr('module');
      const existingModuleName = existing.moduleId ? (state.modules.find(m => m.id === existing.moduleId)?.name || '') : '';
      if (existingModuleName.trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
};

const detectHeaderRowIndex = (rows) => {
  const maxSearchRows = Math.min(rows.length, 30);
  let bestRowIndex = 0;
  let maxMatchCount = 0;

  const standardTerms = new Set([
    'testcaseid', 'id', 'tcid', 'testcase',
    'testtype', 'type',
    'testscenario', 'scenario', 'title', 'name',
    'simplifiedtestscenario', 'simplifiedscenario',
    'teststeps', 'steps',
    'expectedresult', 'expected',
    'actualresult', 'actual',
    'priority',
    'severity',
    'status', 'runstatus',
    'testedby', 'assignee',
    'executiondate', 'date',
    'defectid', 'bugid', 'defect',
    'comments', 'notes', 'runnotes',
    'module', 'modulename', 'folder', 'component'
  ]);

  for (let i = 0; i < maxSearchRows; i++) {
    const row = rows[i];
    if (!row) continue;

    let matchCount = 0;
    row.forEach(cell => {
      const clean = String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean && standardTerms.has(clean)) {
        matchCount++;
      }
    });

    if (matchCount > maxMatchCount && matchCount >= 2) {
      maxMatchCount = matchCount;
      bestRowIndex = i;
    }
  }

  return { index: bestRowIndex, matchCount: maxMatchCount };
};

const processPendingImportFile = (file) => {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
  const reader = new FileReader();

  if (isExcel) {
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (typeof XLSX === 'undefined') {
          showToast('Excel parser library (SheetJS) is not loaded', 'error');
          return;
        }
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (rows.length < 2) {
          showToast('Spreadsheet has no data rows', 'error');
          return;
        }

        const headerDetection = detectHeaderRowIndex(rows);
        const headerIndex = headerDetection.matchCount >= 2 ? headerDetection.index : 0;

        if (rows.length <= headerIndex + 1) {
          showToast('Spreadsheet has no data rows', 'error');
          return;
        }

        // Detect if there's a double header (grouped header above)
        let isDoubleHeader = false;
        if (headerIndex > 0) {
          const parentRow = rows[headerIndex - 1];
          let nonEmptyCount = 0;
          parentRow.forEach(cell => {
            if (String(cell || '').trim() !== '') nonEmptyCount++;
          });
          if (nonEmptyCount >= 2) {
            isDoubleHeader = true;
          }
        }

        let headers = [];
        if (isDoubleHeader) {
          const parentRow = rows[headerIndex - 1];
          const childRow = rows[headerIndex];
          let currentParent = "";
          const maxLength = Math.max(parentRow.length, childRow.length);
          for (let j = 0; j < maxLength; j++) {
            const pCell = String(parentRow[j] || '').trim();
            if (pCell !== "") {
              currentParent = pCell;
            }
            const cCell = String(childRow[j] || '').trim();
            if (currentParent !== "") {
              if (cCell !== "") {
                headers.push(`${currentParent} ${cCell}`);
              } else {
                headers.push(currentParent);
              }
            } else {
              headers.push(cCell);
            }
          }
        } else {
          headers = rows[headerIndex].map(h => String(h || '').trim());
        }

        const dataRows = rows.slice(headerIndex + 1).map(r => r.map(cell => {
          if (cell instanceof Date) return cell;
          return String(cell !== undefined && cell !== null ? cell : '').trim();
        }));
        const mapping = mapHeaders(headers);

        pendingImportData = {
          filename: file.name,
          headers: headers,
          dataRows: dataRows,
          mapping: mapping
        };

        renderImportPreview();
      } catch (err) {
        console.error(err);
        showToast('Failed to parse Excel file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let delimiter = ',';
        const firstLine = text.split(/\r?\n/)[0];
        if (firstLine.includes(';') && !firstLine.includes(',')) {
          delimiter = ';';
        } else if (firstLine.includes('\t')) {
          delimiter = '\t';
        }

        const rows = parseCSVText(text, delimiter);
        if (rows.length < 2) {
          showToast('File has no data rows', 'error');
          return;
        }

        const headerDetection = detectHeaderRowIndex(rows);
        const headerIndex = headerDetection.matchCount >= 2 ? headerDetection.index : 0;

        if (rows.length <= headerIndex + 1) {
          showToast('File has no data rows', 'error');
          return;
        }

        // Detect if there's a double header (grouped header above)
        let isDoubleHeader = false;
        if (headerIndex > 0) {
          const parentRow = rows[headerIndex - 1];
          let nonEmptyCount = 0;
          parentRow.forEach(cell => {
            if (String(cell || '').trim() !== '') nonEmptyCount++;
          });
          if (nonEmptyCount >= 2) {
            isDoubleHeader = true;
          }
        }

        let headers = [];
        if (isDoubleHeader) {
          const parentRow = rows[headerIndex - 1];
          const childRow = rows[headerIndex];
          let currentParent = "";
          const maxLength = Math.max(parentRow.length, childRow.length);
          for (let j = 0; j < maxLength; j++) {
            const pCell = String(parentRow[j] || '').trim();
            if (pCell !== "") {
              currentParent = pCell;
            }
            const cCell = String(childRow[j] || '').trim();
            if (currentParent !== "") {
              if (cCell !== "") {
                headers.push(`${currentParent} ${cCell}`);
              } else {
                headers.push(currentParent);
              }
            } else {
              headers.push(cCell);
            }
          }
        } else {
          headers = rows[headerIndex].map(h => String(h || '').trim());
        }

        const dataRows = rows.slice(headerIndex + 1).map(r => r.map(cell => String(cell || '').trim()));
        const mapping = mapHeaders(headers);

        pendingImportData = {
          filename: file.name,
          headers: headers,
          dataRows: dataRows,
          mapping: mapping
        };

        renderImportPreview();
      } catch (err) {
        console.error(err);
        showToast('Failed to parse CSV file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }
};

const renderImportPreview = () => {
  const data = pendingImportData;
  if (!data) return;

  const dropzone = document.getElementById('excelDropzone');
  dropzone.style.display = 'none';

  const preview = document.getElementById('excelPreviewSection');
  const badge = document.getElementById('excelFileBadge');
  const saveBtn = document.getElementById('saveExcelImport');

  badge.textContent = data.filename;
  preview.style.display = 'block';
  saveBtn.style.display = 'inline-block';

  // Calculate stats (duplicates check)
  const projectId = document.getElementById('excelImportProject').value;
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  const replaceDupes = replaceDupesCheckbox ? replaceDupesCheckbox.checked : false;

  let newCount = 0;
  let dupCount = 0;

  const scenarioIdx = data.mapping.scenario;
  const idIdx = data.mapping.id;

  const seenIds = new Set();
  const seenScenarios = new Set();

  const modalModuleId = document.getElementById('excelImportModule').value;
  const tempModuleCache = {};

  data.dataRows.forEach(row => {
    const getVal = (key) => {
      const idxs = data.mapping[key];
      if (idxs === undefined) return "";
      if (Array.isArray(idxs)) {
        for (let i = idxs.length - 1; i >= 0; i--) {
          const val = String(row[idxs[i]] || '').trim();
          if (val !== "") return row[idxs[i]];
        }
        return row[idxs[0]] || "";
      }
      return (row[idxs] !== undefined) ? row[idxs] : "";
    };

    const scenarioRaw = getVal('scenario');
    const scenario = scenarioRaw instanceof Date ? parseAndFormatImportDate(scenarioRaw) : String(scenarioRaw).trim();
    if (!scenario) return;

    const customIdRaw = getVal('id');
    const customId = String(customIdRaw || '').trim();

    // Determine module FIRST
    let targetModuleId = '';
    if (modalModuleId === 'root_only') {
      targetModuleId = '';
    } else if (modalModuleId !== '') {
      targetModuleId = modalModuleId;
    } else {
      const csvModuleNameRaw = getVal('module');
      const csvModuleName = String(csvModuleNameRaw || '').trim();
      if (csvModuleName) {
        const cleanName = csvModuleName.toLowerCase();
        if (tempModuleCache[cleanName]) {
          targetModuleId = tempModuleCache[cleanName];
        } else {
          const existingMod = state.modules.find(m => m.projectId === projectId && m.name.toLowerCase() === cleanName);
          if (existingMod) {
            targetModuleId = existingMod.id;
            tempModuleCache[cleanName] = targetModuleId;
          } else {
            const tempId = 'temp-mod-' + cleanName;
            tempModuleCache[cleanName] = tempId;
            targetModuleId = tempId;
          }
        }
      } else {
        const defaultMod = state.modules.find(m => m.projectId === projectId);
        targetModuleId = defaultMod ? defaultMod.id : '';
      }
    }

    // Check if it matches an existing system test case IN THE SAME TARGET MODULE
    let existing = null;
    if (customId) {
      existing = state.testCases.find(tc => tc.projectId === projectId && tc.moduleId === targetModuleId && tc.id.toLowerCase() === customId.toLowerCase());
    }
    if (!existing && scenario) {
      existing = state.testCases.find(tc => tc.projectId === projectId && tc.moduleId === targetModuleId && (tc.scenario || tc.title || '').trim().toLowerCase() === scenario.toLowerCase());
    }

    // Check duplicate within the same file (scoped to target module)
    const fileIdKey = targetModuleId + "|||" + customId.toLowerCase();
    const fileScenarioKey = targetModuleId + "|||" + scenario.toLowerCase();
    let isFileDup = false;
    if (customId && seenIds.has(fileIdKey)) isFileDup = true;
    if (!isFileDup && seenScenarios.has(fileScenarioKey)) isFileDup = true;

    let isSystemDup = false;
    let isUpdated = false;

    if (existing) {
      if (hasDiff(existing, row, data.mapping, projectId)) {
        isUpdated = true;
      } else {
        isSystemDup = true;
      }
    }

    if (isFileDup || isSystemDup) {
      if (isUpdated) {
        newCount++;
      } else {
        dupCount++;
      }
    } else {
      newCount++;
    }

    // Add to seen sets
    if (customId) seenIds.add(fileIdKey);
    seenScenarios.add(fileScenarioKey);
  });

  // Re-write preview section info
  const mappingGrid = document.querySelector('#excelPreviewSection .mapping-grid');

  const fields = [
    { label: 'Test Case ID (Override)', key: 'id' },
    { label: 'Test Scenario (Required)', key: 'scenario' },
    { label: 'Simplified Test Scenario', key: 'simplifiedScenario' },
    { label: 'Test Steps', key: 'steps' },
    { label: 'Expected Result', key: 'expected' },
    { label: 'Actual Result', key: 'actual' },
    { label: 'Priority', key: 'priority' },
    { label: 'Severity', key: 'severity' },
    { label: 'Status', key: 'status' },
    { label: 'Tested By', key: 'assignee' },
    { label: 'Execution Date', key: 'executionDate' },
    { label: 'Defect ID', key: 'defectId' },
    { label: 'Comments / Run Notes', key: 'comments' },
    { label: 'Module / Folder Name', key: 'module' },
    { label: 'Test Type', key: 'type' }
  ];

  let gridHtml = '';
  fields.forEach(f => {
    const selectedIdx = Array.isArray(data.mapping[f.key]) ? data.mapping[f.key][data.mapping[f.key].length - 1] : data.mapping[f.key];
    const optionsHtml = `<option value="">— Leave Blank / Unmapped —</option>` +
      data.headers.map((h, idx) => `<option value="${idx}" ${selectedIdx === idx ? 'selected' : ''}>Col: ${h}</option>`).join('');

    gridHtml += `
      <div class="mapping-item" style="background:var(--surface-2); padding:6px 10px; border-radius:var(--radius-sm); border:1px solid var(--border); display:flex; flex-direction:column; gap:2px; font-size:11.5px;">
        <span style="font-weight:600; color:var(--text-secondary);">${f.label}</span>
        <select class="mapping-field-select" data-field-key="${f.key}" style="width:100%; border:1px solid var(--border); border-radius:4px; padding:2px; background:#fff; font-size:11px; height:22px; outline:none;">
          ${optionsHtml}
        </select>
      </div>
    `;
  });

  mappingGrid.innerHTML = gridHtml;

  // Render or update summary block
  let summaryCard = document.getElementById('excelImportSummaryCard');
  if (!summaryCard) {
    summaryCard = document.createElement('div');
    summaryCard.id = 'excelImportSummaryCard';
    summaryCard.style.cssText = 'background:var(--accent-light); border:1px solid rgba(45,106,79,0.15); padding:10px 14px; border-radius:var(--radius-sm); margin-bottom:12px; font-size:12.5px; line-height:1.5; color:var(--accent);';
    preview.insertBefore(summaryCard, preview.firstChild.nextSibling);
  }

  summaryCard.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px;">File parsed successfully!</div>
    <div style="display:flex; justify-content:space-between; margin-top:2px;">
      <span>Total Rows Found:</span> <strong>${data.dataRows.length}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; color:#27ae60;">
      <span>New / Updated Test Cases:</span> <strong>${newCount}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; color:${dupCount > 0 ? (replaceDupes ? '#e67e22' : 'var(--danger)') : 'var(--text-muted)'};">
      <span>${replaceDupes ? 'Duplicates to Overwrite:' : 'Ignored duplicates (Already exist):'}</span> <strong>${dupCount}</strong>
    </div>
  `;
};

const handleExcelImport = async () => {
  const projectId = document.getElementById('excelImportProject').value;
  const modalModuleId = document.getElementById('excelImportModule').value;

  if (!projectId) { showToast('Project selection is required', 'error'); return; }
  if (!pendingImportData) { showToast('No file data available', 'error'); return; }

  // Read mappings dynamically
  const data = pendingImportData;
  const activeMapping = {};
  const selectDropdowns = document.querySelectorAll('.mapping-field-select');
  selectDropdowns.forEach(sel => {
    const key = sel.dataset.fieldKey;
    const val = sel.value;
    if (val !== "") {
      const idxVal = parseInt(val, 10);
      const originalVal = data.mapping[key];
      if (Array.isArray(originalVal) && originalVal.includes(idxVal)) {
        activeMapping[key] = originalVal;
      } else {
        activeMapping[key] = [idxVal];
      }
    }
  });

  if (activeMapping.scenario === undefined) {
    showToast('Please map the required field "Test Scenario"', 'error');
    return;
  }

  // Read replace preference
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  const replaceDupes = replaceDupesCheckbox ? replaceDupesCheckbox.checked : false;

  // Hide the import save button during processing to prevent double-triggering
  const saveBtn = document.getElementById('saveExcelImport');
  if (saveBtn) saveBtn.style.display = 'none';

  // Show loading spinner
  document.getElementById('excelPreviewSection').style.display = 'none';
  document.getElementById('excelLoadingSection').style.display = 'flex';
  document.getElementById('excelLoadingText').textContent = 'Importing test cases and avoiding duplicates...';

  // Process rows after short delay for loading render
  setTimeout(async () => {
    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    // Get max TC ID number
    let lastIdNum = state.testCases.reduce((max, tc) => {
      const match = tc.id.match(/^TC-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 100);

    const moduleCache = {};
    state.modules.forEach(m => {
      if (m.projectId === projectId) {
        moduleCache[m.name.toLowerCase()] = m.id;
      }
    });
    const defaultMod = state.modules.find(m => m.projectId === projectId);
    const defaultModId = defaultMod ? defaultMod.id : '';

    const existingIdsSet = new Set(state.testCases.map(tc => tc.id.toLowerCase()));
    const existingIdMap = new Map();
    const existingScenarioMap = new Map();
    state.testCases.forEach(tc => {
      const pId = tc.projectId;
      const mId = tc.moduleId || '';
      if (tc.id) {
        existingIdMap.set(pId + "|||" + mId + "|||" + tc.id.toLowerCase(), tc);
      }
      const scenarioVal = (tc.scenario || tc.title || '').trim().toLowerCase();
      if (scenarioVal) {
        existingScenarioMap.set(pId + "|||" + mId + "|||" + scenarioVal, tc);
      }
    });

    const seenIds = new Set();
    const seenScenarios = new Set();

    data.dataRows.forEach(row => {
      const getVal = (key) => {
        const idxs = activeMapping[key];
        if (idxs === undefined) return "";
        if (Array.isArray(idxs)) {
          for (let i = idxs.length - 1; i >= 0; i--) {
            const val = String(row[idxs[i]] || '').trim();
            if (val !== "") return row[idxs[i]];
          }
          return row[idxs[0]] || "";
        }
        return (row[idxs] !== undefined) ? row[idxs] : "";
      };

      const scenarioRaw = getVal('scenario');
      const scenario = scenarioRaw instanceof Date ? parseAndFormatImportDate(scenarioRaw) : String(scenarioRaw).trim();
      if (!scenario) return; // skip rows without scenario

      const customIdRaw = getVal('id');
      const customId = String(customIdRaw || '').trim();

      // Determine module FIRST
      let targetModuleId = '';
      if (modalModuleId === 'root_only') {
        targetModuleId = '';
      } else if (modalModuleId !== '') {
        targetModuleId = modalModuleId;
      } else {
        const csvModuleNameRaw = getVal('module');
        const csvModuleName = String(csvModuleNameRaw || '').trim();
        if (csvModuleName) {
          const cleanName = csvModuleName.toLowerCase();
          if (moduleCache[cleanName]) {
            targetModuleId = moduleCache[cleanName];
          } else {
            const newModId = 'mod-' + uid();
            state.modules.push({
              id: newModId,
              projectId: projectId,
              name: csvModuleName,
              description: 'Auto-created during import'
            });
            targetModuleId = newModId;
            moduleCache[cleanName] = targetModuleId;
          }
        } else {
          targetModuleId = defaultModId;
        }
      }

      // Check if it matches an existing system test case IN THE SAME TARGET MODULE
      let existing = null;
      if (customId) {
        existing = existingIdMap.get(projectId + "|||" + targetModuleId + "|||" + customId.toLowerCase()) || null;
      }
      if (!existing && scenario) {
        existing = existingScenarioMap.get(projectId + "|||" + targetModuleId + "|||" + scenario.toLowerCase()) || null;
      }

      // Check duplicate within the same file (scoped to target module)
      const fileIdKey = targetModuleId + "|||" + customId.toLowerCase();
      const fileScenarioKey = targetModuleId + "|||" + scenario.toLowerCase();
      let isFileDup = false;
      if (customId && seenIds.has(fileIdKey)) isFileDup = true;
      if (!isFileDup && seenScenarios.has(fileScenarioKey)) isFileDup = true;

      let isUpdated = false;
      if (existing) {
        isUpdated = hasDiff(existing, row, activeMapping, projectId);
      }

      if (isFileDup) {
        skipped++;
        return; // skip duplicate row inside file
      }

      // Mark as seen in file
      if (customId) seenIds.add(fileIdKey);
      seenScenarios.add(fileScenarioKey);

      if (existing) {
        if (isUpdated || replaceDupes) {
          // Overwrite in place
          existing.scenario = scenario;
          existing.title = scenario; // compatibility
          existing.simplifiedScenario = String(getVal('simplifiedScenario') || '').trim();
          existing.description = String(getVal('description') || '').trim();
          existing.steps = String(getVal('steps') || '').trim();
          existing.expected = String(getVal('expected') || '').trim();
          existing.actual = String(getVal('actual') || '').trim();
          existing.priority = normalizePriority(getVal('priority'));
          existing.severity = normalizeSeverity(getVal('severity'));
          existing.status = normalizeStatus(getVal('status'));
          existing.type = normalizeType(getVal('type'));
          existing.assignee = String(getVal('assignee') || '').trim();
          existing.executionDate = parseAndFormatImportDate(getVal('executionDate'));
          existing.defectId = String(getVal('defectId') || '').trim();
          existing.comments = String(getVal('comments') || '').trim();
          existing.updatedAt = now;
          existing.moduleId = targetModuleId;
          imported++;
        } else {
          skipped++;
        }
        return;
      }

      // Generate ID (ensure globally unique)
      let finalId = customId;
      const idExistsGlobally = (id) => existingIdsSet.has(id.toLowerCase());

      if (!finalId || idExistsGlobally(finalId)) {
        lastIdNum += 1;
        while (idExistsGlobally(`TC-${lastIdNum}`)) {
          lastIdNum += 1;
        }
        finalId = `TC-${lastIdNum}`;
      }

      // Insert test case matching standard 14-field schema
      const newTestCase = {
        id: finalId,
        projectId: projectId,
        moduleId: targetModuleId,
        title: scenario, // compatibility
        scenario: scenario,
        simplifiedScenario: String(getVal('simplifiedScenario') || '').trim(),
        description: String(getVal('description') || '').trim(),
        steps: String(getVal('steps') || '').trim(),
        expected: String(getVal('expected') || '').trim(),
        actual: String(getVal('actual') || '').trim(),
        priority: normalizePriority(getVal('priority')),
        severity: normalizeSeverity(getVal('severity')),
        status: normalizeStatus(getVal('status')),
        type: normalizeType(getVal('type')),
        assignee: String(getVal('assignee') || '').trim(),
        executionDate: parseAndFormatImportDate(getVal('executionDate')),
        defectId: String(getVal('defectId') || '').trim(),
        comments: String(getVal('comments') || '').trim(),
        createdAt: now,
        updatedAt: now
      };

      state.testCases.push(newTestCase);
      existingIdsSet.add(finalId.toLowerCase());
      existingIdMap.set(projectId + "|||" + targetModuleId + "|||" + finalId.toLowerCase(), newTestCase);
      existingScenarioMap.set(projectId + "|||" + targetModuleId + "|||" + scenario.toLowerCase(), newTestCase);

      imported++;
    });

    logActivity(`Imported/Updated ${imported} test cases from Excel/CSV (skipped ${skipped} duplicates)`, 'task');
    await storage.save();
    closeModals();
    render();
    updateStorageInfo();
    showToast(`Successfully imported/updated ${imported} test cases. Skipped ${skipped} duplicates.`);
    pendingImportData = null;
  }, 1400);
};

const handleModuleCheckboxChange = (cb) => {
  if (!state.selectedTestCaseIds) {
    state.selectedTestCaseIds = new Set();
  }

  const moduleId = cb.dataset.moduleId;
  const checked = cb.checked;

  let mCases;
  if (moduleId === 'all') {
    mCases = state.testCases.filter(tc => tc.projectId === state.activeTestCaseProjectId);
  } else {
    mCases = state.testCases.filter(tc => tc.projectId === state.activeTestCaseProjectId && tc.moduleId === moduleId);
  }

  mCases.forEach(tc => {
    if (checked) {
      state.selectedTestCaseIds.add(tc.id);
    } else {
      state.selectedTestCaseIds.delete(tc.id);
    }
  });

  if (checked && mCases.length > 0) {
    state.testCaseSelectionMode = true;
  }

  render();
};

const handleTestCaseCheckboxChange = (cb) => {
  if (!state.selectedTestCaseIds) {
    state.selectedTestCaseIds = new Set();
  }

  const tcId = cb.dataset.id;
  const checked = cb.checked;

  if (checked) {
    state.selectedTestCaseIds.add(tcId);
  } else {
    state.selectedTestCaseIds.delete(tcId);
  }

  render();
};

const confirmBulkDeleteTestCases = () => {
  const count = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  if (count === 0) return;
  document.getElementById('confirmMessage').textContent =
    `Delete ${count} selected test cases? This action cannot be undone.`;
  confirmCallback = () => bulkDeleteTestCases();
  showModal('confirmModal');
};

const bulkDeleteTestCases = async () => {
  const count = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  if (count === 0) return;

  state.testCases = state.testCases.filter(tc => !state.selectedTestCaseIds.has(tc.id));
  logActivity(`Bulk deleted ${count} test cases`, 'delete');
  state.selectedTestCaseIds.clear();
  state.testCaseSelectionMode = false;
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast(`Successfully deleted ${count} test cases.`);
};

const openBulkUpdateModal = () => {
  const modal = document.getElementById('bulkUpdateModal');
  const infoCard = document.getElementById('bulkUpdateInfoCard');

  const targetCases = state.lastFilteredCases || [];
  if (targetCases.length === 0) {
    showToast('No test cases in view to bulk update', 'error');
    return;
  }

  const activeProj = state.projects.find(p => p.id === state.activeTestCaseProjectId);
  const projName = activeProj ? activeProj.name : '';

  infoCard.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px;">Bulk Update Target</div>
    This will update <strong>${targetCases.length}</strong> test cases currently in view under project <strong>${projName}</strong>.
  `;

  document.getElementById('bulkUpdateField').value = '';
  document.getElementById('bulkUpdateValueGroup').style.display = 'none';
  document.getElementById('saveBulkUpdate').style.display = 'none';
  document.getElementById('bulkUpdateValueInputContainer').innerHTML = '';

  showModal('bulkUpdateModal');
};

const handleBulkUpdateFieldChange = () => {
  const field = document.getElementById('bulkUpdateField').value;
  const valGroup = document.getElementById('bulkUpdateValueGroup');
  const saveBtn = document.getElementById('saveBulkUpdate');
  const container = document.getElementById('bulkUpdateValueInputContainer');
  const label = document.getElementById('bulkUpdateValueLabel');

  if (!field) {
    valGroup.style.display = 'none';
    saveBtn.style.display = 'none';
    return;
  }

  valGroup.style.display = 'block';
  saveBtn.style.display = 'inline-block';

  const fieldOption = document.querySelector(`#bulkUpdateField option[value="${field}"]`);
  const fieldName = fieldOption ? fieldOption.textContent : 'Value';
  label.textContent = `New ${fieldName} Value`;

  let html = '';
  if (field === 'priority') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="Critical">Critical</option>
        <option value="High" selected>High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
    `;
  } else if (field === 'severity') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="S1 - Blocker">S1 - Blocker</option>
        <option value="S2 - Critical">S2 - Critical</option>
        <option value="S3 - Major" selected>S3 - Major</option>
        <option value="S4 - Minor">S4 - Minor</option>
      </select>
    `;
  } else if (field === 'status') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="Untested" selected>Untested</option>
        <option value="Passed">Passed</option>
        <option value="Failed">Failed</option>
        <option value="Blocked">Blocked</option>
      </select>
    `;
  } else if (field === 'type') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="Manual" selected>Manual</option>
        <option value="Automated">Automated</option>
        <option value="API">API</option>
        <option value="Security">Security</option>
        <option value="Performance">Performance</option>
        <option value="Regression">Regression</option>
      </select>
    `;
  } else if (field === 'assignee') {
    const devOptions = state.developers.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="">— Unassigned —</option>
        ${devOptions}
      </select>
    `;
  } else if (field === 'module') {
    const projModules = state.modules.filter(m => m.projectId === state.activeTestCaseProjectId);
    const modOptions = projModules.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="">— None (Directly in Project) —</option>
        ${modOptions}
      </select>
    `;
  } else if (field === 'executionDate') {
    html = `<input type="date" id="bulkUpdateValueInput" style="background:var(--surface);" />`;
  } else if (field === 'defectId') {
    html = `<input type="text" id="bulkUpdateValueInput" placeholder="e.g. BUG-824" style="background:var(--surface);" />`;
  } else if (field === 'comments') {
    html = `<textarea id="bulkUpdateValueInput" placeholder="Add comments…" rows="3" style="background:var(--surface);"></textarea>`;
  }

  container.innerHTML = html;
};

const saveBulkUpdate = async () => {
  const field = document.getElementById('bulkUpdateField').value;
  if (!field) return;

  const selectEl = document.getElementById('bulkUpdateValueSelect');
  const inputEl = document.getElementById('bulkUpdateValueInput');
  const val = selectEl ? selectEl.value : (inputEl ? inputEl.value.trim() : '');

  const targetCases = state.lastFilteredCases || [];
  if (targetCases.length === 0) return;

  const now = new Date().toISOString();
  let updatedCount = 0;

  targetCases.forEach(tc => {
    const masterTc = state.testCases.find(x => x.id === tc.id);
    if (masterTc) {
      if (field === 'module') {
        masterTc.moduleId = val;
      } else {
        masterTc[field] = val;
      }
      masterTc.updatedAt = now;
      updatedCount++;
    }
  });

  logActivity(`Bulk updated ${updatedCount} test cases: field "${field}" to "${val}"`, 'task');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast(`Successfully updated ${updatedCount} test cases.`);
};

const initExcelUploadSimulator = () => {
  const dropzone = document.getElementById('excelDropzone');
  const fileInput = document.getElementById('excelFileInput');
  const selectBtn = document.getElementById('selectExcelFileBtn');

  if (!dropzone || !fileInput || !selectBtn) return;

  selectBtn.onclick = (e) => {
    e.stopPropagation();
    fileInput.click();
  };

  fileInput.onchange = (e) => {
    if (e.target.files.length) {
      processPendingImportFile(e.target.files[0]);
    }
  };

  dropzone.onclick = () => {
    fileInput.click();
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  };

  dropzone.ondragleave = () => {
    dropzone.classList.remove('dragover');
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      processPendingImportFile(e.dataTransfer.files[0]);
    }
  };
};

const updateReleaseVersionDropdown = (projectId, selectedVersionValue = '') => {
  const verSel = document.getElementById('releaseVersion');
  if (!verSel) return;
  if (!projectId) {
    verSel.innerHTML = `<option value="">— Select Version —</option>`;
    return;
  }

  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) {
    verSel.innerHTML = `<option value="">— Select Version —</option>`;
    return;
  }

  let versions = [];
  if (proj.projectType === 'app') {
    if (proj.androidUpcomingVersion) versions.push({ val: proj.androidUpcomingVersion, label: `${proj.androidUpcomingVersion} (Android Upcoming)` });
    if (proj.androidPreviousVersion) versions.push({ val: proj.androidPreviousVersion, label: `${proj.androidPreviousVersion} (Android Previous)` });
    if (proj.iosUpcomingVersion) versions.push({ val: proj.iosUpcomingVersion, label: `${proj.iosUpcomingVersion} (iOS Upcoming)` });
    if (proj.iosPreviousVersion) versions.push({ val: proj.iosPreviousVersion, label: `${proj.iosPreviousVersion} (iOS Previous)` });
  } else {
    if (proj.upcomingVersion) versions.push({ val: proj.upcomingVersion, label: `${proj.upcomingVersion} (Upcoming)` });
    if (proj.previousVersion) versions.push({ val: proj.previousVersion, label: `${proj.previousVersion} (Previous)` });
  }

  // Fallback: If no versions configured, show a helpful placeholder or allow custom
  if (versions.length === 0) {
    verSel.innerHTML = `<option value="">— No versions configured —</option>`;
    return;
  }

  verSel.innerHTML = `<option value="">— Select Version —</option>` +
    versions.map(v => `<option value="${v.val}" ${selectedVersionValue === v.val ? 'selected' : ''}>${v.label}</option>`).join('');
};

const openReleaseModal = (id = null) => {
  const modal = document.getElementById('releaseModal');
  const title = document.getElementById('releaseModalTitle');

  // Populate Release Manager dropdown with devs and ensure Dwip Pandya is a default choice
  const mgrSel = document.getElementById('releaseManager');
  let mgrOptions = state.developers.map(d => d.name);
  if (!mgrOptions.includes('Dwip Pandya')) {
    mgrOptions.unshift('Dwip Pandya');
  }
  mgrSel.innerHTML = `<option value="">— Select Manager —</option>` +
    mgrOptions.map(name => `<option value="${name}">${name}</option>`).join('');

  // Populate Projects dropdown
  const projSel = document.getElementById('releaseProject');
  projSel.innerHTML = `<option value="">— Select Project —</option>` +
    state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  // Populate Product Developers checklist with devs
  const checklist = document.getElementById('releaseDevChecklist');
  checklist.innerHTML = state.developers.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="releaseDevCheck" value="${d.id}" />
      <span>${d.name}</span>
    </label>
  `).join('') || '<span style="color:var(--text-muted); font-size:12.5px;">No developers added in Settings.</span>';

  if (id) {
    const r = state.releases.find(x => x.id === id);
    if (!r) return;
    title.textContent = 'Edit Release';
    document.getElementById('releaseId').value = r.id;
    document.getElementById('releaseName').value = r.name;
    document.getElementById('releaseDate').value = r.releaseDate || '';
    document.getElementById('releaseDesc').value = r.description || '';
    document.getElementById('releaseManager').value = r.managerName || '';
    document.getElementById('releaseStatus').value = r.status || 'Draft';
    document.getElementById('releaseWorkItems').value = r.workItems || '';
    document.getElementById('releaseNotes').value = r.notes || '';

    // Project selection and version dropdown setting
    projSel.value = r.projectId || '';
    updateReleaseVersionDropdown(r.projectId || '', r.version || '');

    // Check dev checkboxes
    document.querySelectorAll('input[name="releaseDevCheck"]').forEach(cb => {
      cb.checked = (r.developerIds || []).includes(cb.value);
    });
  } else {
    title.textContent = 'New Release';
    document.getElementById('releaseId').value = '';
    document.getElementById('releaseName').value = '';
    document.getElementById('releaseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('releaseDesc').value = '';
    document.getElementById('releaseManager').value = 'Dwip Pandya';
    document.getElementById('releaseStatus').value = 'Draft';
    document.getElementById('releaseWorkItems').value = '';
    document.getElementById('releaseNotes').value = '';

    projSel.value = '';
    updateReleaseVersionDropdown('');
  }

  showModal('releaseModal');
};

const saveRelease = async () => {
  const id = document.getElementById('releaseId').value;
  const name = document.getElementById('releaseName').value.trim();
  const releaseDate = document.getElementById('releaseDate').value;
  const projectId = document.getElementById('releaseProject').value;
  const version = document.getElementById('releaseVersion').value;
  const description = document.getElementById('releaseDesc').value.trim();
  const managerName = document.getElementById('releaseManager').value;
  const status = document.getElementById('releaseStatus').value;
  const workItems = document.getElementById('releaseWorkItems').value.trim();
  const notes = document.getElementById('releaseNotes').value.trim();

  if (!projectId) { showToast('Project selection is required', 'error'); return; }
  if (!version) { showToast('Release version is required', 'error'); return; }
  if (!name) { showToast('Release name is required', 'error'); return; }

  // Get selected developers
  const checkboxes = document.querySelectorAll('input[name="releaseDevCheck"]:checked');
  const developerIds = Array.from(checkboxes).map(cb => cb.value);

  const now = new Date().toISOString();

  if (id) {
    const idx = state.releases.findIndex(r => r.id === id);
    if (idx === -1) return;
    state.releases[idx] = {
      ...state.releases[idx],
      name, version, description, managerName, status, workItems, notes, developerIds, projectId, releaseDate,
      updatedAt: now
    };
    logActivity(`Updated release "${name}" to version ${version} (${status})`, 'project');
    showToast('Release updated');
  } else {
    state.releases.unshift({
      id: 'rel-' + uid(),
      name, version, description, managerName, status, workItems, notes, developerIds, projectId, releaseDate,
      createdAt: now, updatedAt: now
    });
    logActivity(`Created release "${name}" version ${version} (${status})`, 'project');
    showToast('Release created');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteRelease = (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;
  document.getElementById('confirmMessage').textContent =
    `Delete release "${r.name}" (${r.version})? This action cannot be undone.`;
  confirmCallback = () => deleteRelease(id);
  showModal('confirmModal');
};

const deleteRelease = async (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;
  state.releases = state.releases.filter(x => x.id !== id);
  logActivity(`Deleted release "${r.name}" version ${r.version}`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Release deleted');
};

const triggerNotesMailGeneration = () => {
  const name = document.getElementById('releaseName').value.trim() || '[Release Name]';
  const version = document.getElementById('releaseVersion').value || '[Version]';
  const releaseDate = document.getElementById('releaseDate').value;
  const dateStr = releaseDate ? fmtDate(releaseDate) : '[Release Date]';
  const description = document.getElementById('releaseDesc').value.trim() || '[No description provided]';
  const managerName = document.getElementById('releaseManager').value || '[No Release Manager assigned]';
  const status = document.getElementById('releaseStatus').value || 'Draft';
  const workItems = document.getElementById('releaseWorkItems').value.trim() || '[No work items linked]';

  const projectId = document.getElementById('releaseProject').value;
  const proj = state.projects.find(p => p.id === projectId);
  const projName = proj ? proj.name : '[Project Name]';

  // Get selected devs
  const checkboxes = document.querySelectorAll('input[name="releaseDevCheck"]:checked');
  const developerNames = Array.from(checkboxes).map(cb => {
    const dev = state.developers.find(d => d.id === cb.value);
    return dev ? dev.name : null;
  }).filter(Boolean);
  const devsStr = developerNames.length ? developerNames.join(', ') : '[No developers linked]';

  const notesText = `Subject: [RELEASE] ${projName} - ${name} (${version}) - Status: ${status}

Hi Team,

We are excited to share the release details for "${name}" (${version}) on project "${projName}"!

=======================================================
RELEASE BRIEF
=======================================================
• Project         : ${projName}
• Release Date    : ${dateStr}
• Release Manager : ${managerName}
• Current Status  : ${status}
• Product Devs    : ${devsStr}

=======================================================
DESCRIPTION
=======================================================
${description}

=======================================================
WORK ITEMS / TICKETS INCLUDED
=======================================================
${workItems}

Best Regards,
${managerName === '[No Release Manager assigned]' ? 'The Engineering Team' : managerName}`;

  document.getElementById('releaseNotes').value = notesText;
  showToast('Email release notes generated!');
};

const copyReleaseNotesToClipboard = (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;

  let finalNotes = r.notes;
  if (!finalNotes) {
    // Generate inline
    const devsList = (r.developerIds || []).map(id => {
      const dev = state.developers.find(d => d.id === id);
      return dev ? dev.name : null;
    }).filter(Boolean);
    const devsStr = devsList.length ? devsList.join(', ') : '[No developers linked]';

    const proj = r.projectId ? state.projects.find(p => p.id === r.projectId) : null;
    const projName = proj ? proj.name : '[Project Name]';
    const dateStr = r.releaseDate ? fmtDate(r.releaseDate) : '[Release Date]';

    finalNotes = `Subject: [RELEASE] ${projName} - ${r.name} (${r.version}) - Status: ${r.status || 'Draft'}

Hi Team,

We are excited to share the release details for "${r.name}" (${r.version}) on project "${projName}"!

=======================================================
RELEASE BRIEF
=======================================================
• Project         : ${projName}
• Release Date    : ${dateStr}
• Release Manager : ${r.managerName || '[No Release Manager assigned]'}
• Current Status  : ${r.status || 'Draft'}
• Product Devs    : ${devsStr}

=======================================================
DESCRIPTION
=======================================================
${r.description || '[No description provided]'}

=======================================================
WORK ITEMS / TICKETS INCLUDED
=======================================================
${r.workItems || '[No work items linked]'}

Best Regards,
${(r.managerName && r.managerName !== '— Select Manager —') ? r.managerName : 'The Engineering Team'}`;
  }

  navigator.clipboard.writeText(finalNotes).then(() => {
    logActivity(`Copied email release notes for "${r.name}" version ${r.version}`, 'task');
    showToast('Release notes copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
};

// ─── Boot ────────────────────────────────────────────────
const init = async () => {
  const data = await storage.load();
  state.projects = data.projects;
  state.tasks = data.tasks;
  state.tests = data.tests || [];
  state.activity = data.activity;
  state.developers = data.developers || [];
  state.releases = data.releases || [];
  state.testCases = data.testCases || [];
  state.modules = data.modules || [];
  state.releasePoints = data.releasePoints || [];

  // Initialize mock data on first load only
  const dbInitialized = localStorage.getItem('clair_db_initialized') === 'true';
  if (!dbInitialized && (!state.projects || state.projects.length === 0)) {
    try {
      const backupPath = 'Backup/clair-export-2026-06-02.json';
      const response = await fetch(backupPath);
      if (response.ok) {
        const backupData = await response.json();
        state.projects = backupData.projects || [];
        state.tasks = backupData.tasks || [];
        state.tests = backupData.tests || [];
        state.activity = backupData.activity || [];
        state.developers = backupData.developers || [];
        state.releases = backupData.releases || [];
        state.testCases = backupData.testCases || [];
        state.modules = backupData.modules || [];
        state.releasePoints = backupData.releasePoints || [];
        await storage.save();
        console.log('Restored data from local backup file.');
      } else {
        prepopulateMockData();
        await storage.save();
      }
    } catch (e) {
      console.warn('Backup fetch failed, using default mock data:', e);
      prepopulateMockData();
      await storage.save();
    }
    localStorage.setItem('clair_db_initialized', 'true');
  } else if (!dbInitialized) {
    prepopulateMockData(); // to ensure default developers/default structures exist
    localStorage.setItem('clair_db_initialized', 'true');
  }

  // Nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.view));
  });

  // Modals
  document.getElementById('addProjectBtn').addEventListener('click', () => openProjectModal());
  document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
  document.getElementById('addTestBtn').addEventListener('click', () => openTestModal());
  document.getElementById('addReleaseBtn').addEventListener('click', () => openReleaseModal());
  document.getElementById('addTestCaseBtn').addEventListener('click', () => openTestCaseModal());
  document.getElementById('addReleasePtBtn').addEventListener('click', () => openReleasePtModal());
  document.getElementById('saveProject').addEventListener('click', saveProject);
  document.getElementById('saveTask').addEventListener('click', saveTask);
  document.getElementById('saveTest').addEventListener('click', saveTest);
  document.getElementById('saveRelease').addEventListener('click', saveRelease);
  document.getElementById('saveTestCase').addEventListener('click', saveTestCase);
  document.getElementById('saveModule').addEventListener('click', saveModule);
  document.getElementById('saveReleasePt').addEventListener('click', saveReleasePoint);
  document.getElementById('saveExcelImport').addEventListener('click', handleExcelImport);
  document.getElementById('saveBulkUpdate').addEventListener('click', saveBulkUpdate);
  document.getElementById('bulkUpdateField').addEventListener('change', handleBulkUpdateFieldChange);
  document.getElementById('generateMailNotesBtn').addEventListener('click', triggerNotesMailGeneration);

  // Handle bulk action checkboxes
  document.addEventListener('change', (e) => {
    const modCb = e.target.closest('.module-select-checkbox');
    if (modCb) {
      handleModuleCheckboxChange(modCb);
      return;
    }

    const tcCb = e.target.closest('.testcase-select-checkbox');
    if (tcCb) {
      handleTestCaseCheckboxChange(tcCb);
      return;
    }
  });

  // Link developer dropdown updates to project selection changes
  document.getElementById('taskProject').addEventListener('change', (e) => {
    updateDeveloperDropdown(e.target.value, 'taskDeveloper', document.getElementById('taskDeveloper').value);
  });
  document.getElementById('testProject').addEventListener('change', (e) => {
    updateDeveloperDropdown(e.target.value, 'testDeveloper', document.getElementById('testDeveloper').value);
  });
  document.getElementById('releaseProject').addEventListener('change', (e) => {
    updateReleaseVersionDropdown(e.target.value, '');
  });
  document.getElementById('testCaseProject').addEventListener('change', (e) => {
    updateTestCaseModuleDropdown(e.target.value, '');
  });

  // TestCase Modal Tabs switching
  document.querySelectorAll('#testCaseModal .modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#testCaseModal .modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#testCaseModal .modal-tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.target;
      document.getElementById(targetId).classList.add('active');
    });
  });

  document.getElementById('closeProjectModal').addEventListener('click', closeModals);
  document.getElementById('cancelProjectModal').addEventListener('click', closeModals);
  document.getElementById('closeTaskModal').addEventListener('click', closeModals);
  document.getElementById('cancelTaskModal').addEventListener('click', closeModals);
  document.getElementById('closeTestModal').addEventListener('click', closeModals);
  document.getElementById('cancelTestModal').addEventListener('click', closeModals);
  document.getElementById('closeReleaseModal').addEventListener('click', closeModals);
  document.getElementById('cancelReleaseModal').addEventListener('click', closeModals);
  document.getElementById('closeTestCaseModal').addEventListener('click', closeModals);
  document.getElementById('cancelTestCaseModal').addEventListener('click', closeModals);
  document.getElementById('closeModuleModal').addEventListener('click', closeModals);
  document.getElementById('cancelModuleModal').addEventListener('click', closeModals);
  document.getElementById('closeExcelImportModal').addEventListener('click', closeModals);
  document.getElementById('cancelExcelImportModal').addEventListener('click', closeModals);
  document.getElementById('closeBulkUpdateModal').addEventListener('click', closeModals);
  document.getElementById('cancelBulkUpdateModal').addEventListener('click', closeModals);
  document.getElementById('closeReleasePtModal').addEventListener('click', closeModals);
  document.getElementById('cancelReleasePtModal').addEventListener('click', closeModals);
  document.getElementById('closeConfirmModal').addEventListener('click', closeModals);
  document.getElementById('cancelConfirm').addEventListener('click', closeModals);
  document.getElementById('modalBackdrop').addEventListener('click', closeModals);

  document.getElementById('closeDetailModal').addEventListener('click', closeModals);
  document.getElementById('closeDetailBtn').addEventListener('click', closeModals);
  document.getElementById('editDetailBtn').addEventListener('click', () => {
    if (activeDetailType && activeDetailId) {
      closeModals();
      if (activeDetailType === 'task') openTaskModal(activeDetailId);
      else if (activeDetailType === 'project') openProjectModal(activeDetailId);
      else if (activeDetailType === 'test') openTestModal(activeDetailId);
      else if (activeDetailType === 'release') openReleaseModal(activeDetailId);
      else if (activeDetailType === 'testcase') openTestCaseModal(activeDetailId);
    }
  });

  document.getElementById('confirmDelete').addEventListener('click', () => {
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  });

  // Initialize Excel Import Drag and drop listeners
  initExcelUploadSimulator();

  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  if (replaceDupesCheckbox) {
    replaceDupesCheckbox.addEventListener('change', () => {
      renderImportPreview();
    });
  }

  // Mobile Sidebar Toggle
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  const toggleSidebar = () => {
    const isShown = sidebar.classList.toggle('show');
    sidebarOverlay.classList.toggle('show', isShown);
  };

  menuBtn.addEventListener('click', toggleSidebar);
  sidebarOverlay.addEventListener('click', toggleSidebar);

  // Import / Export
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importInput').click();
  });
  document.getElementById('importInput').addEventListener('change', (e) => {
    if (e.target.files.length) importData(e.target.files[0]);
  });

  // Search
  const searchInput = document.getElementById('globalSearch');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => handleSearch(searchInput.value), 200);
  });

  // Keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') closeModals();
  });

  // Enter to save in modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      const pm = document.getElementById('projectModal');
      const tm = document.getElementById('taskModal');
      const tsm = document.getElementById('testModal');
      const rsm = document.getElementById('releaseModal');
      const tcsm = document.getElementById('testCaseModal');
      const msm = document.getElementById('moduleModal');
      const eism = document.getElementById('excelImportModal');
      const rpsm = document.getElementById('releasePtModal');
      if (pm.classList.contains('show')) saveProject();
      else if (tm.classList.contains('show')) saveTask();
      else if (tsm.classList.contains('show')) saveTest();
      else if (rsm.classList.contains('show')) saveRelease();
      else if (tcsm.classList.contains('show')) saveTestCase();
      else if (msm.classList.contains('show')) saveModule();
      else if (eism.classList.contains('show')) handleExcelImport();
      else if (rpsm.classList.contains('show')) saveReleasePoint();
    }
  });

  attachCardListeners();
  setView('dashboard');
  updateStorageInfo();
};

document.addEventListener('DOMContentLoaded', init);
