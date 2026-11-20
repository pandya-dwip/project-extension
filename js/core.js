// Clair — js/core.js: Constants, state, storage, theme, utilities, import/export, activity log, toasts.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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
  testCasePage: 1,
  testCasePageSize: 25,
  view: 'dashboard',
  projectsViewMode: 'list', // hydrated from ClairDB pref in init(), since DB access is async
  theme: 'light', // hydrated from ClairDB pref in init()
  projectsKanbanBoardScrollLeft: 0,
  projectsKanbanColumnScrollTops: {},
  searchQuery: '',
  projectSearch: '',
  taskSearch: '',
  testSearch: '',
  releaseSearch: '',
  releasePtSearch: '',
  filters: { status: '', previousVersion: '', upcomingVersion: '', dateFrom: '', dateTo: '', taskProject: '', taskPriority: '', taskDeadline: '' },
  testFilters: { project: '', developer: '', status: '', assignedStatus: '' },
  releaseFilters: { status: '' },
  releasePtFilters: { project: '', releaseType: '', completion: '' },
  inlineEditing: null,
  chartMonth: null,        // { year, month } — set on first render to last month
  calendarMonth: null,     // { year, month } — set on first render to current month
  calendarFilters: { project: '', type: '' },
  selectedCalendarDate: '',
  calendarRightPanelFilter: 'all',
  calendarRightPanelSort: 'priority',
  noteFolders: [],
  notes: [],
  jiraSync: [], // one record per Clair project linked to Jira: cached issues, statuses, status mapping
  jiraQa: [], // Jira sync bookkeeping: checkpoints, processed Ready-for-QA tickets, batches, run summaries
  jiraPending: [], // unsynced Jira changes per issue: { id: issueId, projectId, key, transition, comments } (separate from the cache)
  activeNoteProjectId: null,
  activeNoteFolderId: null,
  activeNoteId: null,
  noteEditorMode: 'edit',
  noteSearchQuery: '',
  noteSortBy: 'updatedAt',
  expandedNoteFolderIds: new Set(),
  hiddenModules: [],
  defaultView: 'dashboard',
  // Project Overview (sub-page of 'projects'): null = show the projects list/kanban
  overviewProjectId: null,
  overviewTaskFilter: 'all',
  overviewTaskSearch: '',
  overviewReturnScroll: 0
};

let confirmCallback = null;
let activeDetailType = null;
let activeDetailId = null;

// ─── Storage helpers ─────────────────────────────────────
// Backed by ClairDB (SQLite via sql.js, see db.js). Signature unchanged so the
// rest of the app keeps working against plain in-memory arrays as before.
const storage = {
  async load() {
    return ClairDB.load();
  },

  async save() {
    setTimeout(() => { try { syncWatchProjects(); } catch (e) { /* page still starting */ } }, 0);
    return ClairDB.save({
      projects: state.projects,
      tasks: state.tasks,
      tests: state.tests,
      activity: state.activity,
      developers: state.developers,
      releases: state.releases,
      testCases: state.testCases,
      modules: state.modules,
      releasePoints: state.releasePoints || [],
      noteFolders: state.noteFolders || [],
      notes: state.notes || [],
      // Jira dashboard cache (not part of JSON exports/backups — see ClairBackup.KEYS)
      jiraSync: state.jiraSync || [],
      jiraPending: state.jiraPending || [],
      jiraQa: state.jiraQa || []
    });
  }
};

// ─── Theme ───────────────────────────────────────────────
// Defaults to light. 'system' resolves against the OS here in JS (not via a
// CSS prefers-color-scheme query) so the very first paint — before this has
// even run — is always light instead of racing the OS setting.
const applyTheme = (theme) => {
  let resolved = theme;
  if (theme === 'system' || !theme) {
    resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  if (resolved === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }
};

const setTheme = async (theme) => {
  state.theme = theme;
  applyTheme(theme);
  await ClairDB.setPref('theme', theme);
  render();
};

// Muted inline placeholder for empty sub-lists (checklists, dropdown sources, etc.)
const emptyNote = (text) => `<span style="color:var(--text-muted);font-size:12.5px;">${text}</span>`;

// Shared empty-state block (icon + title + message + optional CTA), used
// wherever a list/view has nothing to show.
const emptyState = (iconSvg, title, message, ctaHtml = '') => `
  <div class="empty-state">
    <div class="empty-icon">${iconSvg}</div>
    <h3>${title}</h3>
    <p>${message}</p>
    ${ctaHtml}
  </div>
`;

// ─── Utility ─────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

// Migrates legacy single-value task.projectId/task.developer onto task.projectIds/task.developerIds arrays.
const migrateTasks = (tasks) => {
  return (tasks || []).map(t => {
    if (!Array.isArray(t.projectIds)) {
      t.projectIds = t.projectId ? [t.projectId] : [];
    }
    if (!Array.isArray(t.developerIds)) {
      t.developerIds = t.developer ? [t.developer] : [];
    }
    if (t.workDone === undefined) {
      t.workDone = 'task completed';
    }
    delete t.projectId;
    delete t.developer;
    return t;
  });
};

const getTaskProjectNames = (t) => (t.projectIds || [])
  .map(id => { const p = state.projects.find(pr => pr.id === id); return p ? p.name : null; })
  .filter(Boolean);

const getTaskDevNames = (t) => (t.developerIds || []).map(getDevName);

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
  return fmtDate(iso);
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

const escapeHtml = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const getAvatarGradient = (name = '') => {
  const gradients = [
    'linear-gradient(135deg, #059669, #047857)',
    'linear-gradient(135deg, #475569, #334155)',
    'linear-gradient(135deg, #2563eb, #1d4ed8)',
    'linear-gradient(135deg, #4f46e5, #3730a3)',
    'linear-gradient(135deg, #d97706, #b45309)',
    'linear-gradient(135deg, #0d9488, #0f766e)'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
};

const incrementVersion = (ver) => {
  if (!ver) return '1.0.0';

  // Try to parse standard semantic version like v1.0.0 or 1.0.0
  const semverMatch = ver.trim().match(/^([vV]?)(\d+)\.(\d+)\.(\d+)$/);
  if (semverMatch) {
    const prefix = semverMatch[1];
    const major = parseInt(semverMatch[2], 10);
    const minor = parseInt(semverMatch[3], 10);
    const patch = parseInt(semverMatch[4], 10);

    let nextMajor = major;
    let nextMinor = minor;
    let nextPatch = patch;

    if (minor === 0 && patch === 9) {
      nextMinor = 2;
      nextPatch = 0;
    } else if (patch === 9) {
      if (minor === 9) {
        nextMajor = major + 1;
        nextMinor = 0;
        nextPatch = 0;
      } else {
        nextMinor = minor + 1;
        nextPatch = 0;
      }
    } else {
      nextPatch = patch + 1;
    }

    return `${prefix}${nextMajor}.${nextMinor}.${nextPatch}`;
  }

  // Fallback to original increment logic for other formats
  const match = ver.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return prefix + (num + 1);
  }
  const digits = ver.match(/\d+/g);
  if (digits) {
    const lastDigit = digits[digits.length - 1];
    const idx = ver.lastIndexOf(lastDigit);
    const num = parseInt(lastDigit, 10);
    return ver.substring(0, idx) + (num + 1) + ver.substring(idx + lastDigit.length);
  }
  return ver + '.1';
};

const getSemverSuggestions = (ver) => {
  const raw = (ver || '1.0.0').trim();
  const hasV = raw.toLowerCase().startsWith('v');
  const clean = raw.replace(/^[vV]/, '').trim();

  const parts = clean.split('.').map(p => parseInt(p, 10));
  const major = !isNaN(parts[0]) ? parts[0] : 1;
  const minor = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 0;
  const patch = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 0;

  const prefix = hasV ? (raw.startsWith('V') ? 'V' : 'v') : '';

  return {
    patch: `${prefix}${major}.${minor}.${patch + 1}`,
    minor: `${prefix}${major}.${minor + 1}.0`,
    major: `${prefix}${major + 1}.0.0`
  };
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

const updateDeveloperDropdown = (projectIdOrIds, selectId, currentValue) => {
  const select = document.getElementById(selectId);
  if (!select) return;
  let devs = state.developers;
  if (projectIdOrIds) {
    if (Array.isArray(projectIdOrIds)) {
      if (projectIdOrIds.length > 0) {
        devs = state.developers.filter(d =>
          (d.projectIds || []).some(pid => projectIdOrIds.includes(pid))
        );
      }
    } else {
      devs = state.developers.filter(d => (d.projectIds || []).includes(projectIdOrIds));
    }
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
  // Same builder the scheduled auto-backup uses (backup.js), so both formats stay identical.
  const blob = new Blob([ClairBackup.toJSON(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `clair-export-${new Date().toISOString().split('T')[0]}.json`;

  if (typeof chrome !== 'undefined' && chrome.downloads) {
    chrome.downloads.download({
      url: url,
      filename: `${ClairBackup.DIR}${filename}`,
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
        state.tasks = migrateTasks(data.tasks);
        state.tests = data.tests || [];
        state.activity = data.activity || [];
        state.developers = data.developers || [];
        state.releases = data.releases || [];
        state.testCases = data.testCases || [];
        state.modules = data.modules || [];
        state.releasePoints = data.releasePoints || [];
        state.noteFolders = data.noteFolders || [];
        state.notes = data.notes || [];
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
