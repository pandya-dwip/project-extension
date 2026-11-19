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
      jiraPending: state.jiraPending || []
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

// ─── Export Report (Excel) ───────────────────────────────
const isWithinDateRange = (dateStr, from, to) => {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  if (from) {
    const f = new Date(from);
    f.setHours(0, 0, 0, 0);
    if (d < f) return false;
  }
  if (to) {
    const t = new Date(to);
    t.setHours(0, 0, 0, 0);
    if (d > t) return false;
  }
  return true;
};

const openExportReportModal = () => {
  const projContainer = document.getElementById('reportProjectChecklist');
  projContainer.innerHTML = state.projects.map(p => {
    const statusClass = getProjectStatusPillClass(p);
    const statusLabel = (Array.isArray(p.statuses) && p.statuses.length > 0)
      ? p.statuses[0]
      : (p.overallProjectStatus ? p.overallProjectStatus.replace(/_/g, ' ') : '');
    return `
      <label class="dev-project-label" style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px;">
        <span style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" name="reportProjectCheck" value="${p.id}" checked />
          <span>${escapeHtml(p.name)}</span>
        </span>
        ${statusLabel ? `<span class="dev-pill status-pill ${statusClass}" style="font-size:10px; padding:2px 7px;">${escapeHtml(statusLabel)}</span>` : ''}
      </label>
    `;
  }).join('') || emptyNote('No projects added yet.');

  const devContainer = document.getElementById('reportDeveloperChecklist');
  devContainer.innerHTML = state.developers.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="reportDevCheck" value="${d.id}" checked />
      <span>${d.name}</span>
    </label>
  `).join('') || emptyNote('No developers added yet.');

  const releaseStatusSel = document.getElementById('reportReleaseStatus');
  releaseStatusSel.innerHTML = `<option value="">All Statuses</option>` +
    RELEASE_STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('');

  document.getElementById('reportDateFrom').value = '';
  document.getElementById('reportDateTo').value = '';
  document.getElementById('reportTaskStatus').value = 'completed';
  document.getElementById('reportReleaseStatus').value = '';
  document.getElementById('reportTestCaseStatus').value = '';

  showModal('exportReportModal');
};

const triggerReportDownload = (url, filename) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report exported successfully');
};

// ─── Excel report theme & styling helpers (ExcelJS) ──────
const XL = {
  accent: 'FF059669',
  accentDark: 'FF047857',
  bannerFrom: 'FF0F2027',
  white: 'FFFFFFFF',
  zebra: 'FFF3F6F9',
  border: 'FFDCE3EA',
  textMuted: 'FF6B7280'
};

// Muted header/banner colors per category (toned down from saturated brand hues)
const CAT_XL = {
  projects: 'FF3D6A96',
  tasks: 'FF7A5C93',
  releases: 'FFB8763E',
  releasePoints: 'FF3F8C7D',
  testCases: 'FF047857'
};

const PROJECT_STATUS_XL = {
  'N/A': { fill: 'FFF0F0F0', font: 'FF666666' },
  'Started': { fill: 'FFE3F2FD', font: 'FF1565C0' },
  'Stable': { fill: 'FFE8F5E9', font: 'FF2E7D32' },
  'Testing': { fill: 'FFFFF3E0', font: 'FFE65100' },
  'Automation': { fill: 'FFF3E5F5', font: 'FF6A1B9A' },
  'On Hold': { fill: 'FFFBE9E7', font: 'FFBF360C' },
  'Yet to Start': { fill: 'FFE8EAF6', font: 'FF283593' },
  'Completed': { fill: 'FFE8F5E9', font: 'FF1B5E20' },
  'In Progress': { fill: 'FFE1F5FE', font: 'FF01579B' },
  'Blocker': { fill: 'FFFFEBEE', font: 'FFB71C1C' },
  'Issue Assigned': { fill: 'FFFFF8E1', font: 'FFF57F17' },
  'Developer': { fill: 'FFE8EAF6', font: 'FF3949AB' },
  'New Development': { fill: 'FFE0F2F1', font: 'FF00796B' }
};

const TASK_STATUS_XL = {
  'To-Do': { fill: 'FFF0F0F0', font: 'FF666666' },
  'In Progress': { fill: 'FFE1F5FE', font: 'FF01579B' },
  'Done': { fill: 'FFE8F5E9', font: 'FF1B5E20' },
  'On Hold': { fill: 'FFFBE9E7', font: 'FFBF360C' }
};

const RELEASE_STATUS_XL = {
  'Draft': { fill: 'FFECEFF1', font: 'FF546E7A' },
  'Planned': { fill: 'FFEDE7F6', font: 'FF5E35B1' },
  'In Progress': { fill: 'FFE3F2FD', font: 'FF1565C0' },
  'Testing': { fill: 'FFFFF3E0', font: 'FFEF6C00' },
  'Approved': { fill: 'FFE8F5E9', font: 'FF2E7D32' },
  'Released': { fill: 'FFE8F5EE', font: 'FF059669' },
  'Rolled Back': { fill: 'FFFFEBEE', font: 'FFDC2626' }
};

const TC_STATUS_XL = {
  'Not executed': { fill: 'FFF5F5F5', font: 'FF757575' },
  'Passed': { fill: 'FFE8F5EE', font: 'FF2D6A4F' },
  'Failed': { fill: 'FFFDECEA', font: 'FFC0392B' },
  'Blocked': { fill: 'FFFFF3E0', font: 'FFEF6C00' }
};

const PRIORITY_XL = {
  'Critical': { fill: 'FFFFEBEE', font: 'FFB71C1C' },
  'High': { fill: 'FFFFF3E0', font: 'FFE65100' },
  'Medium': { fill: 'FFFFFDE7', font: 'FFF57F17' },
  'Low': { fill: 'FFE8F5E9', font: 'FF2E7D32' }
};

const OVERALL_STATUS_XL = {
  'ON_GOING': { fill: 'FFE1F5FE', font: 'FF01579B', label: 'On Going' },
  'On Going': { fill: 'FFE1F5FE', font: 'FF01579B', label: 'On Going' },
  'COMPLETED': { fill: 'FFE8F5E9', font: 'FF1B5E20', label: 'Completed' },
  'Completed': { fill: 'FFE8F5E9', font: 'FF1B5E20', label: 'Completed' },
  'MONITORING': { fill: 'FFE8F5EE', font: 'FF059669', label: 'Monitoring' },
  'Monitoring': { fill: 'FFE8F5EE', font: 'FF059669', label: 'Monitoring' },
  'ON_HOLD': { fill: 'FFFBE9E7', font: 'FFBF360C', label: 'On Hold' },
  'On Hold': { fill: 'FFFBE9E7', font: 'FFBF360C', label: 'On Hold' },
  'YET_TO_START': { fill: 'FFE8EAF6', font: 'FF283593', label: 'Yet to Start' },
  'Yet to Start': { fill: 'FFE8EAF6', font: 'FF283593', label: 'Yet to Start' }
};

const formatOverallStatus = (status) => {
  if (!status) return '—';
  if (OVERALL_STATUS_XL[status]) return OVERALL_STATUS_XL[status].label;
  return status.replace(/_/g, ' ');
};

const thinBorder = (color = XL.border) => ({
  top: { style: 'thin', color: { argb: color } },
  bottom: { style: 'thin', color: { argb: color } },
  left: { style: 'thin', color: { argb: color } },
  right: { style: 'thin', color: { argb: color } }
});

const styleHeaderRow = (row, fillColor = XL.accent) => {
  row.height = 26;
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: 'Segoe UI', bold: true, color: { argb: XL.white }, size: 10.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder(fillColor);
  });
};

const zebraRow = (row, isEven) => {
  row.height = Math.max(row.height || 0, 24);
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: 'Segoe UI', size: 10, ...(cell.font || {}) };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? XL.zebra : XL.white } };
    cell.border = thinBorder();
    cell.alignment = { vertical: 'middle', ...(cell.alignment || {}) };
  });
};

const colorCell = (cell, colorMap, value) => {
  if (!value || !colorMap) return;
  const valStr = String(value).trim();
  const c = colorMap[valStr] || colorMap[valStr.toUpperCase()] || colorMap[valStr.replace(/ /g, '_').toUpperCase()];
  if (!c) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.fill } };
  cell.font = { name: 'Segoe UI', color: { argb: c.font }, bold: true, size: 9.5 };
};

const sectionBanner = (ws, rowNum, text, span, fillColor = XL.accentDark) => {
  ws.mergeCells(rowNum, 1, rowNum, span);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.font = { name: 'Segoe UI', bold: true, color: { argb: XL.white }, size: 11.5 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(rowNum).height = 26;
};

const pickPrimaryStatus = (statuses) => {
  if (!statuses || !statuses.length) return null;
  if (statuses.includes('Stable')) return 'Stable';
  if (statuses.includes('Testing')) return 'Testing';
  if (statuses.includes('In Progress')) return 'In Progress';
  if (statuses.includes('Started')) return 'Started';
  return statuses[0];
};

const generateExcelReport = async () => {
  if (typeof ExcelJS === 'undefined') {
    showToast('Excel library (ExcelJS) is not loaded', 'error');
    return;
  }

  const checkedProjectIds = Array.from(document.querySelectorAll('input[name="reportProjectCheck"]:checked')).map(cb => cb.value);
  const checkedDevIds = Array.from(document.querySelectorAll('input[name="reportDevCheck"]:checked')).map(cb => cb.value);
  const dateFrom = document.getElementById('reportDateFrom').value;
  const dateTo = document.getElementById('reportDateTo').value;
  const taskStatusFilter = document.getElementById('reportTaskStatus').value;
  const releaseStatusFilter = document.getElementById('reportReleaseStatus').value;
  const tcStatusFilter = document.getElementById('reportTestCaseStatus').value;

  const projectFilterActive = checkedProjectIds.length > 0 && checkedProjectIds.length < state.projects.length;
  const devFilterActive = checkedDevIds.length > 0 && checkedDevIds.length < state.developers.length;

  const projects = state.projects.filter(p => !projectFilterActive || checkedProjectIds.includes(p.id));
  const projectIdSet = new Set(projects.map(p => p.id));
  const projectIdsOf = (obj) => (obj.projectIds && obj.projectIds.length ? obj.projectIds : (obj.projectId ? [obj.projectId] : []));
  const projectNamesOf = (obj) => projectIdsOf(obj).map(id => { const p = state.projects.find(pr => pr.id === id); return p ? p.name : null; }).filter(Boolean).join(', ') || '—';

  // ── Tasks ──
  let tasks = state.tasks.filter(t => projectIdsOf(t).some(id => projectIdSet.has(id)));
  if (taskStatusFilter !== 'all') tasks = tasks.filter(t => t.status === 'Done');
  if (devFilterActive) tasks = tasks.filter(t => (t.developerIds || []).some(id => checkedDevIds.includes(id)));
  tasks = tasks.filter(t => isWithinDateRange(t.completedDate || t.endDate, dateFrom, dateTo));

  // ── Releases ──
  let releases = (state.releases || []).filter(r => projectIdsOf(r).some(id => projectIdSet.has(id)));
  if (releaseStatusFilter) releases = releases.filter(r => r.status === releaseStatusFilter);
  if (devFilterActive) releases = releases.filter(r => (r.developerIds || []).some(id => checkedDevIds.includes(id)));
  releases = releases.filter(r => isWithinDateRange(r.releaseDate || r.updatedAt || r.createdAt, dateFrom, dateTo));

  // ── Release Points ──
  let releasePoints = (state.releasePoints || []).filter(rp => projectIdsOf(rp).some(id => projectIdSet.has(id)));
  if (devFilterActive) releasePoints = releasePoints.filter(rp => (rp.developerIds || []).some(id => checkedDevIds.includes(id)));
  releasePoints = releasePoints.filter(rp => isWithinDateRange(rp.updatedAt || rp.createdAt, dateFrom, dateTo));

  // ── Test Cases ──
  let testCases = (state.testCases || []).filter(tc => projectIdSet.has(tc.projectId));
  if (tcStatusFilter) testCases = testCases.filter(tc => (tc.status || 'Not executed') === tcStatusFilter);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Clair Task & Project Tracker';
  wb.created = new Date();

  // ══════════════════ Overview ══════════════════
  const ov = wb.addWorksheet('Overview', { properties: { tabColor: { argb: XL.accent } }, views: [{ showGridLines: true }] });
  ov.columns = Array.from({ length: 10 }, () => ({ width: 16 }));

  ov.mergeCells('A1:J2');
  const titleCell = ov.getCell('A1');
  titleCell.value = 'Clair — Project & Executive Task Report';
  titleCell.font = { name: 'Segoe UI', bold: true, size: 18, color: { argb: XL.white } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  for (let c = 1; c <= 10; c++) {
    ov.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.bannerFrom } };
    ov.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.bannerFrom } };
  }
  ov.getRow(1).height = 24;
  ov.getRow(2).height = 24;

  ov.mergeCells('A3:J3');
  const subCell = ov.getCell('A3');
  subCell.value = `Generated on ${new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}`;
  subCell.font = { name: 'Segoe UI', italic: true, size: 10, color: { argb: XL.textMuted } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ov.getRow(3).height = 20;

  // KPI cards (Row 5 & 6)
  const kpis = [
    { label: 'PROJECTS', value: projects.length, color: CAT_XL.projects },
    { label: 'TASKS', value: tasks.length, color: CAT_XL.tasks },
    { label: 'RELEASES', value: releases.length, color: CAT_XL.releases },
    { label: 'RELEASE POINTS', value: releasePoints.length, color: CAT_XL.releasePoints },
    { label: 'TEST CASES', value: testCases.length, color: CAT_XL.testCases }
  ];
  const cardRow = 5, labelRow = 6;
  kpis.forEach((k, i) => {
    const startCol = i * 2 + 1;
    const endCol = startCol + 1;
    ov.mergeCells(cardRow, startCol, cardRow, endCol);
    ov.mergeCells(labelRow, startCol, labelRow, endCol);
    const numCell = ov.getCell(cardRow, startCol);
    numCell.value = k.value;
    numCell.font = { name: 'Segoe UI', bold: true, size: 22, color: { argb: k.color } };
    numCell.alignment = { horizontal: 'center', vertical: 'middle' };
    const labelCell = ov.getCell(labelRow, startCol);
    labelCell.value = k.label;
    labelCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: XL.textMuted } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = startCol; c <= endCol; c++) {
      ov.getCell(cardRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      ov.getCell(labelRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      ov.getCell(cardRow, c).border = { top: { style: 'medium', color: { argb: k.color } }, left: thinBorder().left, right: thinBorder().right };
      ov.getCell(labelRow, c).border = { bottom: thinBorder().bottom, left: thinBorder().left, right: thinBorder().right };
    }
  });
  ov.getRow(cardRow).height = 36;
  ov.getRow(labelRow).height = 20;

  // Executive Highlights (Row 8-11)
  sectionBanner(ov, 8, 'Executive Highlights', 10, XL.accentDark);
  const doneTasksCount = tasks.filter(t => t.status === 'Done').length;
  const inProgressTasksCount = tasks.filter(t => t.status === 'In Progress').length;
  const taskCompletionRate = tasks.length > 0 ? `${Math.round((doneTasksCount / tasks.length) * 100)}%` : '0%';
  const activeProjectsCount = projects.filter(p => (p.statuses || []).length > 0 || p.overallProjectStatus === 'ON_GOING').length;

  const highlightMetrics = [
    ['Task Completion Rate', taskCompletionRate, 'Tasks Completed', `${doneTasksCount} of ${tasks.length}`],
    ['Tasks In Progress', `${inProgressTasksCount}`, 'Active Projects', `${activeProjectsCount} of ${projects.length}`],
    ['Releases Logged', `${releases.length}`, 'Test Cases In Scope', `${testCases.length}`]
  ];

  highlightMetrics.forEach((hm, idx) => {
    const r = 9 + idx;
    ov.mergeCells(r, 1, r, 3);
    ov.mergeCells(r, 4, r, 5);
    ov.mergeCells(r, 6, r, 8);
    ov.mergeCells(r, 9, r, 10);

    const c1 = ov.getCell(r, 1);
    c1.value = hm[0];
    c1.font = { name: 'Segoe UI', bold: true, size: 10 };
    c1.alignment = { vertical: 'middle', indent: 1 };

    const c2 = ov.getCell(r, 4);
    c2.value = hm[1];
    c2.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: XL.accent } };
    c2.alignment = { vertical: 'middle', horizontal: 'center' };

    const c3 = ov.getCell(r, 6);
    c3.value = hm[2];
    c3.font = { name: 'Segoe UI', bold: true, size: 10 };
    c3.alignment = { vertical: 'middle', indent: 1 };

    const c4 = ov.getCell(r, 9);
    c4.value = hm[3];
    c4.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF1F2937' } };
    c4.alignment = { vertical: 'middle', horizontal: 'center' };

    for (let c = 1; c <= 10; c++) {
      ov.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? XL.white : XL.zebra } };
      ov.getCell(r, c).border = thinBorder();
    }
    ov.getRow(r).height = 24;
  });

  // Applied Filters section
  const filterStartRow = 9 + highlightMetrics.length + 1;
  sectionBanner(ov, filterStartRow, 'Applied Filters & Scope', 10, 'FF334155');
  const filterPairs = [
    ['Projects Scope', projectFilterActive ? projects.map(p => p.name).join(', ') || 'None' : 'All Projects'],
    ['Developers Scope', devFilterActive ? checkedDevIds.map(getDevName).join(', ') || 'None' : 'All Developers'],
    ['Date Window', (dateFrom || dateTo) ? `${dateFrom || 'Start'} to ${dateTo || 'Today'}` : 'All Time'],
    ['Task Status Scope', taskStatusFilter === 'all' ? 'All Statuses' : 'Completed Only'],
    ['Release Status Scope', releaseStatusFilter || 'All Statuses'],
    ['Test Case Scope', tcStatusFilter || 'All Statuses']
  ];
  filterPairs.forEach((pair, i) => {
    const r = filterStartRow + 1 + i;
    ov.mergeCells(r, 1, r, 2);
    ov.mergeCells(r, 3, r, 10);
    const labelC = ov.getCell(r, 1);
    labelC.value = pair[0];
    labelC.font = { name: 'Segoe UI', bold: true, size: 10 };
    const valC = ov.getCell(r, 3);
    valC.value = pair[1];
    valC.font = { name: 'Segoe UI', size: 10 };
    [labelC, valC].forEach(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? XL.white : XL.zebra } };
      c.border = thinBorder();
      c.alignment = { vertical: 'middle', indent: 1, wrapText: true };
    });
    ov.getRow(r).height = 23;
  });

  // Category breakdown section
  const breakdownStart = filterStartRow + 1 + filterPairs.length + 1;
  sectionBanner(ov, breakdownStart, 'Category Breakdown', 10, 'FF475569');
  const breakdownRows = [
    ['Projects Portfolio', projects.length, CAT_XL.projects],
    ['Tasks (In Scope)', tasks.length, CAT_XL.tasks],
    ['Releases Logged', releases.length, CAT_XL.releases],
    ['Release Points', releasePoints.length, CAT_XL.releasePoints],
    ['Test Cases', testCases.length, CAT_XL.testCases]
  ];
  breakdownRows.forEach((br, i) => {
    const r = breakdownStart + 1 + i;
    ov.mergeCells(r, 1, r, 8);
    ov.mergeCells(r, 9, r, 10);
    const labelC = ov.getCell(r, 1);
    labelC.value = br[0];
    labelC.font = { name: 'Segoe UI', bold: true, size: 10 };
    labelC.border = { left: { style: 'medium', color: { argb: br[2] } }, top: thinBorder().top, bottom: thinBorder().bottom };
    const valC = ov.getCell(r, 9);
    valC.value = br[1];
    valC.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: br[2] } };
    valC.alignment = { horizontal: 'center' };
    [labelC, valC].forEach(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? XL.white : XL.zebra } };
      c.alignment = { ...(c.alignment || {}), vertical: 'middle', indent: c === labelC ? 1 : 0 };
    });
    ov.getRow(r).height = 24;
  });

  // ══════════════════ Projects ══════════════════
  const projSheet = wb.addWorksheet('Projects', {
    properties: { tabColor: { argb: CAT_XL.projects } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  projSheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Project Name', key: 'name', width: 28 },
    { header: 'Client', key: 'client', width: 20 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Overall Status', key: 'overallStatus', width: 16 },
    { header: 'Active Statuses', key: 'statuses', width: 28 },
    { header: 'Assigned Developer(s)', key: 'developers', width: 28 },
    { header: 'Current Version', key: 'currentVersion', width: 22 },
    { header: 'Upcoming Version', key: 'upcomingVersion', width: 22 },
    { header: 'Completed Tasks', key: 'completed', width: 16 },
    { header: 'Total Tasks', key: 'total', width: 13 },
    { header: 'Task Progress', key: 'progress', width: 14 },
    { header: 'Last Release', key: 'lastRelease', width: 30 },
    { header: 'Last Release Date', key: 'lastReleaseDate', width: 16 },
    { header: 'Description', key: 'description', width: 40 }
  ];
  styleHeaderRow(projSheet.getRow(1), CAT_XL.projects);

  projects.forEach((p, i) => {
    const projectTasks = state.tasks.filter(t => projectIdsOf(t).includes(p.id));
    const completed = projectTasks.filter(t => t.status === 'Done').length;
    const total = projectTasks.length;
    const progressPercent = total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%';

    const assignedDevNames = (state.developers || [])
      .filter(d => (d.projectIds || []).includes(p.id))
      .map(d => d.name)
      .join(', ') || '—';

    const currentVer = p.projectType === 'app'
      ? `Android: ${p.androidPreviousVersion || '—'}\niOS: ${p.iosPreviousVersion || '—'}`
      : (p.previousVersion || '—');

    const upcomingVer = p.projectType === 'app'
      ? `Android: ${p.androidUpcomingVersion || '—'}\niOS: ${p.iosUpcomingVersion || '—'}`
      : (p.upcomingVersion || '—');

    const lastRel = p.lastReleaseLog || (p.releaseHistory && p.releaseHistory.length ? p.releaseHistory[0].log : '') || '—';
    const lastRelDate = p.lastReleaseAt
      ? new Date(p.lastReleaseAt)
      : (p.releaseHistory && p.releaseHistory.length && p.releaseHistory[0].releasedAt ? new Date(p.releaseHistory[0].releasedAt) : null);

    const overallLabel = formatOverallStatus(p.overallProjectStatus);

    const row = projSheet.addRow({
      idx: i + 1,
      name: p.name,
      client: p.clientName || '—',
      type: p.projectType === 'app' ? 'Mobile App' : 'Web',
      overallStatus: overallLabel,
      statuses: (p.statuses || []).join(', ') || '—',
      developers: assignedDevNames,
      currentVersion: currentVer,
      upcomingVersion: upcomingVer,
      completed,
      total,
      progress: progressPercent,
      lastRelease: lastRel,
      lastReleaseDate: lastRelDate,
      description: p.description || '—'
    });

    zebraRow(row, i % 2 === 0);

    colorCell(row.getCell('overallStatus'), OVERALL_STATUS_XL, p.overallProjectStatus || overallLabel);

    row.getCell('idx').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('name').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell('name').font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF0F172A' } };
    row.getCell('client').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell('type').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('overallStatus').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('statuses').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('developers').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('currentVersion').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    row.getCell('upcomingVersion').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    row.getCell('completed').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('total').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('progress').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('progress').font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF059669' } };
    row.getCell('lastRelease').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    if (lastRelDate) {
      row.getCell('lastReleaseDate').numFmt = 'dd mmm yyyy';
    }
    row.getCell('lastReleaseDate').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('description').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

    row.height = (p.projectType === 'app' || (p.statuses && p.statuses.length > 2)) ? 32 : 24;
  });

  if (!projects.length) {
    projSheet.mergeCells(2, 1, 2, 15);
    projSheet.getCell(2, 1).value = 'No projects match the selected filters';
    projSheet.getCell(2, 1).alignment = { horizontal: 'center' };
  } else {
    projSheet.autoFilter = { from: 'A1', to: `O${projects.length + 1}` };
  }

  // ══════════════════ Tasks ══════════════════
  const taskSheet = wb.addWorksheet('Tasks', {
    properties: { tabColor: { argb: CAT_XL.tasks } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  taskSheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Task Name', key: 'name', width: 28 },
    { header: 'Project(s)', key: 'project', width: 24 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Developer(s)', key: 'developer', width: 22 },
    { header: 'Start Date', key: 'start', width: 13 },
    { header: 'End Date', key: 'end', width: 13 },
    { header: 'Completed Date', key: 'completedDate', width: 15 },
    { header: 'Work Done', key: 'workDone', width: 42 },
    { header: 'Description', key: 'description', width: 38 },
    { header: 'Tags', key: 'tags', width: 22 }
  ];
  styleHeaderRow(taskSheet.getRow(1), CAT_XL.tasks);

  tasks.forEach((t, i) => {
    const row = taskSheet.addRow({
      idx: i + 1,
      name: t.title,
      project: getTaskProjectNames(t).join(', ') || '—',
      status: t.status,
      priority: t.priority || '—',
      developer: getTaskDevNames(t).join(', ') || '—',
      start: t.startDate ? new Date(t.startDate) : null,
      end: t.endDate ? new Date(t.endDate) : null,
      completedDate: t.completedDate ? new Date(t.completedDate) : null,
      workDone: t.workDone || '—',
      description: t.description || '—',
      tags: (t.tags || []).join(', ') || '—'
    });
    zebraRow(row, i % 2 === 0);
    colorCell(row.getCell('status'), TASK_STATUS_XL, t.status);
    colorCell(row.getCell('priority'), PRIORITY_XL, t.priority);
    ['start', 'end', 'completedDate'].forEach(k => {
      if (row.getCell(k).value) row.getCell(k).numFmt = 'dd mmm yyyy';
    });
    row.getCell('idx').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('name').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('name').font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF0F172A' } };
    row.getCell('project').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('priority').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('developer').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('start').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('end').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('completedDate').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('workDone').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('description').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell('tags').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

    const hasLongContent = (t.workDone && t.workDone.length > 50) || (t.description && t.description.length > 50);
    row.height = hasLongContent ? 32 : 24;
  });

  if (!tasks.length) {
    taskSheet.mergeCells(2, 1, 2, 12);
    taskSheet.getCell(2, 1).value = 'No tasks match the selected filters';
    taskSheet.getCell(2, 1).alignment = { horizontal: 'center' };
  } else {
    taskSheet.autoFilter = { from: 'A1', to: `L${tasks.length + 1}` };
  }

  // ══════════════════ Releases ══════════════════
  const relSheet = wb.addWorksheet('Releases', {
    properties: { tabColor: { argb: CAT_XL.releases } },
    views: [{ showGridLines: true }]
  });
  const relCols = [
    { header: '#', width: 6 },
    { header: 'Release Name', width: 28 },
    { header: 'Project(s)', width: 26 },
    { header: 'Version(s)', width: 20 },
    { header: 'Status', width: 14 },
    { header: 'Release Date', width: 16 },
    { header: 'Manager', width: 20 },
    { header: 'Developers', width: 26 },
    { header: 'Work Items', width: 32 }
  ];
  relSheet.columns = relCols.map(c => ({ width: c.width }));

  sectionBanner(relSheet, 1, `Manual Releases — Total: ${releases.length}`, relCols.length, CAT_XL.releases);
  relCols.forEach((c, i) => { relSheet.getCell(2, i + 1).value = c.header; });
  styleHeaderRow(relSheet.getRow(2), CAT_XL.releases);
  releases.forEach((r, i) => {
    const rowNum = 3 + i;
    const values = [
      i + 1,
      r.name,
      projectNamesOf(r),
      (r.versions && r.versions.length ? r.versions : [r.version]).filter(Boolean).join(', ') || '—',
      r.status || 'Draft',
      r.releaseDate ? new Date(r.releaseDate) : null,
      r.managerName || '—',
      (r.developerIds || []).map(getDevName).join(', ') || '—',
      r.workItems || '—'
    ];
    values.forEach((v, c) => { relSheet.getCell(rowNum, c + 1).value = v; });
    const row = relSheet.getRow(rowNum);
    zebraRow(row, i % 2 === 0);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF0F172A' } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    colorCell(row.getCell(5), RELEASE_STATUS_XL, r.status || 'Draft');
    if (r.releaseDate) {
      row.getCell(6).numFmt = 'dd mmm yyyy';
    }
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(8).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell(9).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.height = (r.workItems && r.workItems.length > 50) ? 32 : 24;
  });
  if (!releases.length) {
    relSheet.mergeCells(3, 1, 3, relCols.length);
    relSheet.getCell(3, 1).value = 'No manual releases match the selected filters';
    relSheet.getCell(3, 1).alignment = { horizontal: 'center' };
  }

  const rpCols = [
    { header: '#', width: 6 },
    { header: 'Release Point Title', width: 30 },
    { header: 'Project(s)', width: 26 },
    { header: 'Type', width: 14 },
    { header: 'Version(s)', width: 20 },
    { header: 'Checklist Progress', width: 22 },
    { header: 'Completed', width: 14 }
  ];
  const rpStart = (releases.length ? 3 + releases.length : 4) + 1;
  sectionBanner(relSheet, rpStart, `Release Points — Total: ${releasePoints.length}`, relCols.length, CAT_XL.releasePoints);
  rpCols.forEach((c, i) => { relSheet.getCell(rpStart + 1, i + 1).value = c.header; });
  styleHeaderRow(relSheet.getRow(rpStart + 1), CAT_XL.releasePoints);
  releasePoints.forEach((rp, i) => {
    const rowNum = rpStart + 2 + i;
    const done = (rp.checklistItems || []).filter(it => it.done).length;
    const totalItems = (rp.checklistItems || []).length;
    const pct = totalItems > 0 ? ` (${Math.round((done / totalItems) * 100)}%)` : '';
    const progressText = totalItems > 0 ? `${done} / ${totalItems} items${pct}` : '0 items';

    const values = [
      i + 1,
      rp.title,
      projectNamesOf(rp),
      rp.releaseType === 'upcoming' ? 'Upcoming' : 'Past',
      (rp.versions || []).join(', ') || '—',
      progressText,
      rp.isCompleted ? 'Yes' : 'No'
    ];
    values.forEach((v, c) => { relSheet.getCell(rowNum, c + 1).value = v; });
    const row = relSheet.getRow(rowNum);
    zebraRow(row, i % 2 === 0);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF0F172A' } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
    colorCell(row.getCell(7), {
      'Yes': { fill: 'FFE8F5EE', font: 'FF059669' },
      'No': { fill: 'FFF5F5F5', font: 'FF757575' }
    }, rp.isCompleted ? 'Yes' : 'No');
    row.height = 24;
  });
  if (!releasePoints.length) {
    relSheet.mergeCells(rpStart + 2, 1, rpStart + 2, relCols.length);
    relSheet.getCell(rpStart + 2, 1).value = 'No release points match the selected filters';
    relSheet.getCell(rpStart + 2, 1).alignment = { horizontal: 'center' };
  }

  // ══════════════════ Release Details (Detailed Breakdown & Roll-up) ══════════════════
  const relDetailSheet = wb.addWorksheet('Release Details', {
    properties: { tabColor: { argb: 'FFD97706' } },
    views: [{ showGridLines: true }]
  });

  const relDetailCols = [
    { width: 6 },   // Col 1: #
    { width: 28 },  // Col 2: Name / Title / Project
    { width: 24 },  // Col 3: Project(s)
    { width: 18 },  // Col 4: Version(s) / Linked Release
    { width: 15 },  // Col 5: Status / Type / Item #
    { width: 16 },  // Col 6: Release Date / Checks Done / Item Status
    { width: 20 },  // Col 7: Manager / Dev
    { width: 26 },  // Col 8: Developers Involved / Assigned Dev
    { width: 36 },  // Col 9: Work Items / Total Checks / Ticket
    { width: 38 },  // Col 10: Description / Progress % / Item Description
    { width: 44 },  // Col 11: Release Notes (Changelog) / Readiness
    { width: 20 }   // Col 12: Linked Points & Readiness / Extra
  ];
  relDetailSheet.columns = relDetailCols;

  let rdRow = 1;
  const RD_COLS = 12;

  // 1. Executive Roll-up: Releases & Points Summary by Project
  sectionBanner(relDetailSheet, rdRow, 'Executive Roll-up: Releases & Release Points Summary by Project', RD_COLS, XL.bannerFrom);
  rdRow++;

  const projSummaryHeaders = [
    '#', 'Project Name', 'Total Releases', 'Latest Version', 'Latest Release Date',
    'Release Points', 'Points Ready', 'Total Checks', 'Checks Done', 'Readiness %',
    'Readiness Status', 'Assigned Developer(s)'
  ];
  projSummaryHeaders.forEach((h, i) => { relDetailSheet.getCell(rdRow, i + 1).value = h; });
  styleHeaderRow(relDetailSheet.getRow(rdRow), CAT_XL.projects);
  rdRow++;

  let sumTotalReleases = 0;
  let sumTotalPoints = 0;
  let sumTotalChecks = 0;
  let sumDoneChecks = 0;

  projects.forEach((p, idx) => {
    const pReleases = releases.filter(r => projectIdsOf(r).includes(p.id));
    const pPoints = releasePoints.filter(rp => projectIdsOf(rp).includes(p.id));

    sumTotalReleases += pReleases.length;
    sumTotalPoints += pPoints.length;

    let pChecks = 0;
    let pDone = 0;
    let pCompletedPoints = 0;
    pPoints.forEach(rp => {
      const items = rp.checklistItems || [];
      pChecks += items.length;
      pDone += items.filter(it => it.done).length;
      if (rp.isCompleted || (items.length > 0 && items.every(it => it.done))) {
        pCompletedPoints++;
      }
    });

    sumTotalChecks += pChecks;
    sumDoneChecks += pDone;

    const readinessPct = pChecks > 0 ? Math.round((pDone / pChecks) * 100) : (pPoints.length === 0 ? 100 : 0);

    let readinessStatus = 'No Points';
    if (pChecks > 0) {
      if (pDone === pChecks) readinessStatus = 'Ready';
      else if (pDone > 0) readinessStatus = 'In Progress';
      else readinessStatus = 'Pending';
    }

    const sortedRel = [...pReleases].sort((a, b) => new Date(b.releaseDate || b.createdAt) - new Date(a.releaseDate || a.createdAt));
    const latestR = sortedRel[0];
    const latestVer = latestR ? (latestR.versions && latestR.versions.length ? latestR.versions.join(', ') : latestR.version || '—') : (p.previousVersion || '—');
    const latestDate = latestR && latestR.releaseDate ? new Date(latestR.releaseDate) : (p.lastReleaseAt ? new Date(p.lastReleaseAt) : null);

    const devNames = (state.developers || [])
      .filter(d => (d.projectIds || []).includes(p.id))
      .map(d => d.name)
      .join(', ') || '—';

    const row = relDetailSheet.getRow(rdRow);
    const values = [
      idx + 1,
      p.name,
      pReleases.length,
      latestVer,
      latestDate,
      pPoints.length,
      pCompletedPoints,
      pChecks,
      pDone,
      `${readinessPct}%`,
      readinessStatus,
      devNames
    ];
    values.forEach((v, c) => { row.getCell(c + 1).value = v; });
    zebraRow(row, idx % 2 === 0);

    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).font = { name: 'Segoe UI', bold: true, size: 9.5, color: { argb: 'FF0F172A' } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    if (latestDate) row.getCell(5).numFmt = 'dd mmm yyyy';
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(10).font = { name: 'Segoe UI', bold: true, size: 9.5, color: { argb: readinessPct >= 80 ? 'FF059669' : 'FFD97706' } };
    row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' };
    colorCell(row.getCell(11), {
      'Ready': { fill: 'FFE8F5EE', font: 'FF059669' },
      'In Progress': { fill: 'FFE1F5FE', font: 'FF01579B' },
      'Pending': { fill: 'FFFFF3E0', font: 'FFD97706' },
      'No Points': { fill: 'FFF5F5F5', font: 'FF757575' }
    }, readinessStatus);
    row.getCell(12).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    row.height = 24;

    rdRow++;
  });

  const rdTotalRow = relDetailSheet.getRow(rdRow);
  const overallReadyPct = sumTotalChecks > 0 ? `${Math.round((sumDoneChecks / sumTotalChecks) * 100)}%` : '0%';
  const totalVals = ['', 'TOTAL', sumTotalReleases, '', '', sumTotalPoints, '', sumTotalChecks, sumDoneChecks, overallReadyPct, '', ''];
  totalVals.forEach((v, c) => { rdTotalRow.getCell(c + 1).value = v; });
  rdTotalRow.height = 26;
  rdTotalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Segoe UI', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = { top: { style: 'medium', color: { argb: CAT_XL.projects } }, bottom: thinBorder().bottom, left: thinBorder().left, right: thinBorder().right };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center', indent: colNumber === 2 ? 1 : 0 };
  });
  rdRow += 2;

  // 2. Releases In Full Detail
  sectionBanner(relDetailSheet, rdRow, `Releases — In Full Detail (Total: ${releases.length})`, RD_COLS, CAT_XL.releases);
  rdRow++;

  const relDetailHeaders = [
    '#', 'Release Name', 'Project(s)', 'Version(s)', 'Status', 'Release Date',
    'Release Manager', 'Developers Involved', 'Work Items', 'Release Description',
    'Release Notes (Changelog)', 'Linked Points & Readiness'
  ];
  relDetailHeaders.forEach((h, i) => { relDetailSheet.getCell(rdRow, i + 1).value = h; });
  styleHeaderRow(relDetailSheet.getRow(rdRow), CAT_XL.releases);
  rdRow++;

  if (releases.length === 0) {
    relDetailSheet.mergeCells(rdRow, 1, rdRow, RD_COLS);
    relDetailSheet.getCell(rdRow, 1).value = 'No releases match the selected filters';
    relDetailSheet.getCell(rdRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    zebraRow(relDetailSheet.getRow(rdRow), false);
    rdRow++;
  } else {
    releases.forEach((r, idx) => {
      const linkedRps = releasePoints.filter(rp =>
        rp.releaseId === r.id ||
        (projectIdsOf(rp).some(pid => projectIdsOf(r).includes(pid)) &&
         (rp.versions || []).some(v => (r.versions || [r.version]).includes(v)))
      );
      const linkedChecksDone = linkedRps.reduce((sum, rp) => sum + (rp.checklistItems || []).filter(it => it.done).length, 0);
      const linkedChecksTotal = linkedRps.reduce((sum, rp) => sum + (rp.checklistItems || []).length, 0);
      const linkedSummary = linkedRps.length
        ? `${linkedRps.length} pt${linkedRps.length > 1 ? 's' : ''} (${linkedChecksDone}/${linkedChecksTotal} checks)`
        : '—';

      const relDate = r.releaseDate ? new Date(r.releaseDate) : null;
      const vers = (r.versions && r.versions.length ? r.versions : [r.version]).filter(Boolean).join(', ') || '—';
      const devNames = (r.developerIds || []).map(getDevName).join(', ') || '—';

      const row = relDetailSheet.getRow(rdRow);
      const values = [
        idx + 1,
        r.name,
        projectNamesOf(r),
        vers,
        r.status || 'Draft',
        relDate,
        r.managerName || '—',
        devNames,
        r.workItems || '—',
        r.description || '—',
        r.notes || '—',
        linkedSummary
      ];
      values.forEach((v, c) => { row.getCell(c + 1).value = v; });
      zebraRow(row, idx % 2 === 0);

      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).font = { name: 'Segoe UI', bold: true, size: 9.5, color: { argb: 'FF0F172A' } };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      colorCell(row.getCell(5), RELEASE_STATUS_XL, r.status || 'Draft');
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      if (relDate) row.getCell(6).numFmt = 'dd mmm yyyy';
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(10).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(11).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(12).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      const hasLongText = (r.workItems && r.workItems.length > 50) || (r.description && r.description.length > 50) || (r.notes && r.notes.length > 50);
      row.height = hasLongText ? 36 : 24;

      rdRow++;
    });
  }

  rdRow++;

  // 3. Release Points In Full Detail
  sectionBanner(relDetailSheet, rdRow, `Release Points — In Full Detail (Total: ${releasePoints.length})`, RD_COLS, CAT_XL.releasePoints);
  rdRow++;

  const rpDetailHeaders = [
    '#', 'Release Point Title', 'Project(s)', 'Linked Release', 'Type', 'Version(s)',
    'Assigned Developers', 'Checklist Progress', 'Status', 'Total Checks', 'Checks Done', 'Checks Pending'
  ];
  rpDetailHeaders.forEach((h, i) => { relDetailSheet.getCell(rdRow, i + 1).value = h; });
  styleHeaderRow(relDetailSheet.getRow(rdRow), CAT_XL.releasePoints);
  rdRow++;

  if (releasePoints.length === 0) {
    relDetailSheet.mergeCells(rdRow, 1, rdRow, RD_COLS);
    relDetailSheet.getCell(rdRow, 1).value = 'No release points match the selected filters';
    relDetailSheet.getCell(rdRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    zebraRow(relDetailSheet.getRow(rdRow), false);
    rdRow++;
  } else {
    releasePoints.forEach((rp, idx) => {
      const items = rp.checklistItems || [];
      const done = items.filter(it => it.done).length;
      const totalItems = items.length;
      const pending = totalItems - done;
      const pct = totalItems > 0 ? ` (${Math.round((done / totalItems) * 100)}%)` : '';
      const progressText = totalItems > 0 ? `${done} / ${totalItems} items${pct}` : '0 items';

      let status = 'Not Started';
      if (rp.isCompleted || (totalItems > 0 && done === totalItems)) status = 'Completed';
      else if (done > 0) status = 'In Progress';

      const linkedRelease = rp.releaseId ? state.releases.find(r => r.id === rp.releaseId) : null;
      const linkedRelName = linkedRelease ? linkedRelease.name : '—';
      const devNames = (rp.developerIds || []).map(getDevName).join(', ') || '—';

      const row = relDetailSheet.getRow(rdRow);
      const values = [
        idx + 1,
        rp.title,
        projectNamesOf(rp),
        linkedRelName,
        rp.releaseType === 'upcoming' ? 'Upcoming' : (rp.releaseType === 'released' ? 'Released' : 'Past'),
        (rp.versions || []).join(', ') || '—',
        devNames,
        progressText,
        status,
        totalItems,
        done,
        pending
      ];
      values.forEach((v, c) => { row.getCell(c + 1).value = v; });
      zebraRow(row, idx % 2 === 0);

      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).font = { name: 'Segoe UI', bold: true, size: 9.5, color: { argb: 'FF0F172A' } };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(8).font = { name: 'Segoe UI', bold: true, size: 9.5 };
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
      colorCell(row.getCell(9), {
        'Completed': { fill: 'FFE8F5EE', font: 'FF059669' },
        'In Progress': { fill: 'FFE1F5FE', font: 'FF01579B' },
        'Not Started': { fill: 'FFF5F5F5', font: 'FF757575' }
      }, status);
      row.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(12).alignment = { vertical: 'middle', horizontal: 'center' };
      row.height = 24;

      rdRow++;
    });
  }

  rdRow++;

  // 4. Granular Checklist Items Breakdown (Every Task)
  const allChecklistItems = [];
  releasePoints.forEach(rp => {
    const linkedRelease = rp.releaseId ? state.releases.find(r => r.id === rp.releaseId) : null;
    (rp.checklistItems || []).forEach((it, itemIdx) => {
      allChecklistItems.push({
        rpTitle: rp.title,
        projects: projectNamesOf(rp),
        versions: (rp.versions || []).join(', ') || '—',
        linkedRelName: linkedRelease ? linkedRelease.name : '—',
        itemIndex: itemIdx + 1,
        text: it.text,
        done: it.done,
        ticket: it.ticket || '',
        developerId: it.developerId || (rp.developerIds && rp.developerIds.length === 1 ? rp.developerIds[0] : null),
        relStatus: linkedRelease ? linkedRelease.status : (rp.releaseType || '—'),
        relDate: linkedRelease && linkedRelease.releaseDate ? new Date(linkedRelease.releaseDate) : (rp.updatedAt ? new Date(rp.updatedAt) : null)
      });
    });
  });

  sectionBanner(relDetailSheet, rdRow, `Detailed Checklist Items Breakdown — Total Items: ${allChecklistItems.length}`, RD_COLS, 'FF2C5282');
  rdRow++;

  const itemHeaders = [
    '#', 'Release Point Title', 'Project(s)', 'Version(s)', 'Linked Release',
    'Item #', 'Item Status', 'Assigned Developer', 'Ticket / Jira Link',
    'Checklist Item / Task Description', 'Release Status', 'Date'
  ];
  itemHeaders.forEach((h, i) => { relDetailSheet.getCell(rdRow, i + 1).value = h; });
  styleHeaderRow(relDetailSheet.getRow(rdRow), 'FF2C5282');
  rdRow++;

  if (allChecklistItems.length === 0) {
    relDetailSheet.mergeCells(rdRow, 1, rdRow, RD_COLS);
    relDetailSheet.getCell(rdRow, 1).value = 'No checklist items found for the selected scope';
    relDetailSheet.getCell(rdRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    zebraRow(relDetailSheet.getRow(rdRow), false);
    rdRow++;
  } else {
    allChecklistItems.forEach((it, idx) => {
      const devName = it.developerId ? getDevName(it.developerId) : '—';
      const itemStatus = it.done ? 'Done' : 'Pending';

      const row = relDetailSheet.getRow(rdRow);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = it.rpTitle;
      row.getCell(3).value = it.projects;
      row.getCell(4).value = it.versions;
      row.getCell(5).value = it.linkedRelName;
      row.getCell(6).value = `Item ${it.itemIndex}`;
      row.getCell(7).value = itemStatus;
      row.getCell(8).value = devName;

      if (it.ticket) {
        const isUrl = /^https?:\/\//i.test(it.ticket.trim());
        if (isUrl) {
          row.getCell(9).value = { text: it.ticket.trim(), hyperlink: it.ticket.trim() };
          row.getCell(9).font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1565C0' }, underline: true };
        } else {
          row.getCell(9).value = it.ticket.trim();
        }
      } else {
        row.getCell(9).value = '—';
      }

      row.getCell(10).value = it.text;
      row.getCell(11).value = it.relStatus;
      row.getCell(12).value = it.relDate;

      zebraRow(row, idx % 2 === 0);

      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
      colorCell(row.getCell(7), {
        'Done': { fill: 'FFE8F5EE', font: 'FF059669' },
        'Pending': { fill: 'FFFFF3E0', font: 'FFD97706' }
      }, itemStatus);
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(10).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(12).alignment = { vertical: 'middle', horizontal: 'center' };
      if (it.relDate) row.getCell(12).numFmt = 'dd mmm yyyy';

      row.height = it.text.length > 50 ? 32 : 24;
      rdRow++;
    });
  }

  // ══════════════════ Test Cases ══════════════════
  const tcSheet = wb.addWorksheet('Test Cases', {
    properties: { tabColor: { argb: CAT_XL.testCases } },
    views: [{ showGridLines: true }]
  });
  const tcStatuses = ['Not executed', 'Passed', 'Failed', 'Blocked'];
  const tcPriorities = ['Critical', 'High', 'Medium', 'Low'];
  const tcTypes = ['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression'];
  const tcColCount = 7;
  tcSheet.columns = [{ width: 6 }, { width: 28 }, { width: 18 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }];

  sectionBanner(tcSheet, 1, 'Test Case Counts by Project', tcColCount, CAT_XL.testCases);
  const tcHeader = ['#', 'Project', 'Total Test Cases', ...tcStatuses];
  tcHeader.forEach((h, i) => { tcSheet.getCell(2, i + 1).value = h; });
  styleHeaderRow(tcSheet.getRow(2), CAT_XL.testCases);

  projects.forEach((p, i) => {
    const rowNum = 3 + i;
    const pTc = testCases.filter(tc => tc.projectId === p.id);
    const counts = tcStatuses.map(s => pTc.filter(tc => (tc.status || 'Not executed') === s).length);
    [i + 1, p.name, pTc.length, ...counts].forEach((v, c) => { tcSheet.getCell(rowNum, c + 1).value = v; });
    const row = tcSheet.getRow(rowNum);
    zebraRow(row, i % 2 === 0);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF0F172A' } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    tcStatuses.forEach((s, si) => {
      const cell = row.getCell(4 + si);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (cell.value > 0) colorCell(cell, TC_STATUS_XL, s);
    });
    row.height = 24;
  });
  const totalRowNum = 3 + projects.length;
  const totalCounts = tcStatuses.map(s => testCases.filter(tc => (tc.status || 'Not executed') === s).length);
  ['', 'TOTAL', testCases.length, ...totalCounts].forEach((v, c) => { tcSheet.getCell(totalRowNum, c + 1).value = v; });
  const totalRow = tcSheet.getRow(totalRowNum);
  totalRow.height = 26;
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Segoe UI', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = { top: { style: 'medium', color: { argb: CAT_XL.testCases } }, bottom: thinBorder().bottom, left: thinBorder().left, right: thinBorder().right };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center', indent: colNumber === 2 ? 1 : 0 };
  });

  const priStart = totalRowNum + 2;
  sectionBanner(tcSheet, priStart, 'By Priority', tcColCount, CAT_XL.tasks);
  tcSheet.getCell(priStart + 1, 1).value = '#';
  tcSheet.getCell(priStart + 1, 2).value = 'Priority';
  tcSheet.getCell(priStart + 1, 3).value = 'Count';
  styleHeaderRow(tcSheet.getRow(priStart + 1), CAT_XL.tasks);
  tcPriorities.forEach((pr, i) => {
    const rowNum = priStart + 2 + i;
    tcSheet.getCell(rowNum, 1).value = i + 1;
    tcSheet.getCell(rowNum, 2).value = pr;
    tcSheet.getCell(rowNum, 3).value = testCases.filter(tc => tc.priority === pr).length;
    const row = tcSheet.getRow(rowNum);
    zebraRow(row, i % 2 === 0);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    colorCell(row.getCell(2), PRIORITY_XL, pr);
    row.height = 24;
  });

  const typeStart = priStart + 2 + tcPriorities.length + 1;
  sectionBanner(tcSheet, typeStart, 'By Type', tcColCount, CAT_XL.releases);
  tcSheet.getCell(typeStart + 1, 1).value = '#';
  tcSheet.getCell(typeStart + 1, 2).value = 'Type';
  tcSheet.getCell(typeStart + 1, 3).value = 'Count';
  styleHeaderRow(tcSheet.getRow(typeStart + 1), CAT_XL.releases);
  tcTypes.forEach((ty, i) => {
    const rowNum = typeStart + 2 + i;
    tcSheet.getCell(rowNum, 1).value = i + 1;
    tcSheet.getCell(rowNum, 2).value = ty;
    tcSheet.getCell(rowNum, 3).value = testCases.filter(tc => tc.type === ty).length;
    const row = tcSheet.getRow(rowNum);
    zebraRow(row, i % 2 === 0);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    row.height = 24;
  });

  const filename = `clair-report-${new Date().toISOString().split('T')[0]}.xlsx`;
  const arrayBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  if (typeof chrome !== 'undefined' && chrome.downloads) {
    await new Promise(resolve => {
      chrome.downloads.download({
        url,
        filename: `Extensions/project-extension/Reports/${filename}`,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        URL.revokeObjectURL(url);
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          const fallbackUrl = URL.createObjectURL(blob);
          triggerReportDownload(fallbackUrl, filename);
        } else {
          showToast('Report exported to Reports folder');
        }
        resolve();
      });
    });
  } else {
    triggerReportDownload(url, filename);
  }

  closeModals();
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
const updateStorageInfo = () => { };

// ─── Jira dashboard (Jira page) ──────────────────────────
// Overview of every Clair project linked to Jira, plus a per-project ticket table.
// Data comes from a local cache (state.jiraSync, SQLite table "jiraSync"): one record
// per linked Clair project with the last complete fetch of its issues, the project's
// Jira statuses, and the user's status-mapping overrides. "Refresh from Jira" replaces
// the issues only after a complete fetch; a failed refresh keeps the previous cache.
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
const JIRA_CAT_COLOR = { ...Object.fromEntries(JIRA_CATS.map(k => [k.key, k.color])), unmapped: 'var(--danger)' };
const JIRA_CAT_LABEL = { ...Object.fromEntries(JIRA_CATS.map(k => [k.key, k.label])), unmapped: 'Unmapped' };
const jiraEmptyCounts = () => ({ total: 0, ...Object.fromEntries(JIRA_CATS.map(k => [k.key, 0])), unmapped: 0 });
const jiraSyncInFlight = new Map(); // clair projectId -> promise (no overlapping syncs)
const jiraSyncProgress = {};        // clair projectId -> tickets fetched so far (UI only)

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

const jiraLinkedProjects = () => state.projects.filter(p => p.jira && p.jira.projectKey);
// The cache for a project, only if it belongs to the project's current Jira link.
const jiraRecordFor = (p) => {
  const r = (state.jiraSync || []).find(x => x.id === p.id);
  return r && r.site === p.jira.site && String(r.jiraProjectId) === String(p.jira.projectId) ? r : null;
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
    const link = { ...p.jira };
    jiraSyncProgress[projectId] = 0;
    try {
      const { site, issues } = await ClairJira.fetchAllIssues({
        projectKey: link.projectKey,
        onProgress: (n) => {
          jiraSyncProgress[projectId] = n;
          const el = document.querySelector(`[data-jira-progress="${projectId}"]`);
          if (el) el.textContent = `Fetching… ${n} tickets`;
        }
      });
      // Statuses: the project's workflow statuses, plus any seen on issues (e.g. if the
      // statuses endpoint isn't permitted).
      const statuses = new Map();
      try { (await ClairJira.getProjectStatuses(link.projectKey)).forEach(s => statuses.set(s.id, s)); } catch (e) { /* fall back to issue statuses */ }
      issues.forEach(i => { if (i.statusId && !statuses.has(i.statusId)) statuses.set(i.statusId, { id: i.statusId, name: i.status, category: i.statusCategory }); });
      const prev = (state.jiraSync || []).find(x => x.id === projectId);
      const sameProject = prev && prev.site === site && String(prev.jiraProjectId) === String(link.projectId);
      const rec = {
        id: projectId, site, jiraProjectId: String(link.projectId), jiraProjectKey: link.projectKey, jiraProjectName: link.projectName,
        statuses: [...statuses.values()],
        // Refresh re-applies automatic mapping: keep only real manual choices that differ
        // from what Automatic now picks, for statuses that still exist.
        statusMap: sameProject ? Object.fromEntries(Object.entries(prev.statusMap || {}).filter(([sid, cat]) =>
          statuses.has(sid) && jiraIsCat(cat) && cat !== jiraAutoCategory(statuses.get(sid).name))) : {},
        issues, syncedAt: new Date().toISOString(), lastError: '', lastErrorAt: ''
      };
      state.jiraSync = [...(state.jiraSync || []).filter(x => x.id !== projectId), rec];
      await storage.save();
      showToast(`${p.name}: ${issues.length} Jira tickets synced`);
    } catch (e) {
      // Keep the last successful cache; just record what went wrong.
      const prev = (state.jiraSync || []).find(x => x.id === projectId);
      if (prev) {
        prev.lastError = jiraErrorText(e);
        prev.lastErrorAt = new Date().toISOString();
      } else {
        state.jiraSync = [...(state.jiraSync || []), { id: projectId, site: link.site, jiraProjectId: String(link.projectId), jiraProjectKey: link.projectKey, jiraProjectName: link.projectName, statuses: [], statusMap: {}, issues: [], syncedAt: '', lastError: jiraErrorText(e), lastErrorAt: new Date().toISOString() }];
      }
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
  const linked = jiraLinkedProjects();
  if (state.jiraProjectId) {
    const p = linked.find(x => x.id === state.jiraProjectId);
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
      ${linked.length ? `
        <div class="rpa-toolbar">
          <span class="rpa-showing">${linked.length} linked project${linked.length === 1 ? '' : 's'} · counts use each project’s status mapping</span>
          <div class="rpa-toolbar-right">
            <button type="button" class="btn-primary st-btn" data-action="jira-refresh-all" ${!connected || anyBusy ? 'disabled' : ''}>${JD_I.refresh}Refresh all from Jira</button>
          </div>
        </div>
        <div class="jd-grid">${recs.map(card).join('')}</div>` : `
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
  const f = state.jiraFilters || (state.jiraFilters = { q: '', cat: '', type: '', assignee: '', sort: 'updated-desc', page: 1, size: 25 });
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
  list.sort(sorters[f.sort] || sorters['updated-desc']);
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
  const rowsHtml = paged.map(i => {
    const open = state.jiraIssueOpen === i.id;
    const np = jiraPendingCount(jiraPendingFor(i.id));
    return `
    <tr class="${open ? 'jd-row-open' : ''}">
      <td><a class="jd-key" href="${escapeHtml(i.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(i.key)} in Jira">${escapeHtml(i.key)}</a>${np ? `<span class="jd-pending-tag" title="${np} change${np === 1 ? '' : 's'} not yet synced to Jira">Pending</span>` : ''}</td>
      <td class="jd-summary"><button type="button" class="jd-summary-btn" data-action="jira-issue" data-issue="${escapeHtml(i.id)}" aria-expanded="${open}">${escapeHtml(i.summary)}</button></td>
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
              <option value="updated-desc" ${f.sort === 'updated-desc' ? 'selected' : ''}>Recently updated</option>
              <option value="updated-asc" ${f.sort === 'updated-asc' ? 'selected' : ''}>Least recently updated</option>
              <option value="priority" ${f.sort === 'priority' ? 'selected' : ''}>Priority (highest first)</option>
              <option value="key-desc" ${f.sort === 'key-desc' ? 'selected' : ''}>Key (newest first)</option>
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
              <thead><tr><th>Key</th><th>Summary</th><th>Type</th><th>Jira status</th><th>Category</th><th>Assignee</th><th>Priority</th><th>Updated</th><th></th></tr></thead>
              <tbody>${rowsHtml || `<tr><td colspan="9"><div class="dbx-empty tcs-noresults">${c.total ? 'No tickets match these filters.' : 'This Jira project has no tickets.'}</div></td></tr>`}</tbody>
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
const jiraTime = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || 0; // Jira: …+0530

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
          already = (await ClairJira.getComments(key)).some(x => jiraNormText(x.text) === jiraNormText(c.text) && jiraTime(x.created) >= since);
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
        <div class="jd-cmt-head"><strong>${escapeHtml(c.author)}</strong><span>${when(c.created)}${c.updated && c.updated !== c.created ? ` · edited ${when(c.updated)}` : ''}</span></div>
        <div class="jd-cmt-body">${escapeHtml(c.text)}</div>
      </div>`).join('') : '<div class="dbx-empty">No comments yet.</div>';
  const pendingComments = (pd ? pd.comments : []).map(c => `
      <div class="jd-cmt pending">
        <div class="jd-cmt-head"><strong>Pending — not in Jira yet</strong>
          ${busy ? '' : `<button type="button" class="rpa-link" data-action="jira-drop-comment" data-issue="${escapeHtml(i.id)}" data-cid="${escapeHtml(c.id)}">Remove</button>`}</div>
        <div class="jd-cmt-body">${escapeHtml(c.text)}</div>
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
    <tr class="jd-issue-row"><td colspan="9">
      <div class="jd-issue">
        <div class="jd-issue-main">
          <h4 class="jd-issue-title">Comments <span class="rpa-group-count">${comments.length}</span></h4>
          <div class="jd-cmts">${commentsHtml}${pendingComments}</div>
          <textarea id="jiraCommentDraft" class="jd-draft" data-key="${escapeHtml(i.key)}" rows="3" placeholder="Write a comment… (added to pending changes, sent on Sync to Jira)" ${busy ? 'disabled' : ''}>${escapeHtml(d.draft || '')}</textarea>
          <div class="jd-issue-actions"><button type="button" class="btn-ghost st-btn" data-action="jira-queue-comment" data-issue="${escapeHtml(i.id)}" ${busy ? 'disabled' : ''}>Add comment to pending</button></div>
        </div>
        <div class="jd-issue-side">
          <div class="jd-issue-field"><span>Current Jira status</span><div><strong>${escapeHtml(i.status)}</strong> <span class="jd-pill" style="--c:${JIRA_CAT_COLOR[i.cat]}">${JIRA_CAT_LABEL[i.cat]}</span></div></div>
          <div class="jd-issue-field"><span>Change status</span>${transControl}</div>
          ${pd && pd.transition ? `<div class="jd-issue-pending">Selected: <strong>${escapeHtml(pd.transition.toName)}</strong> — not applied yet</div>` : ''}
          ${pd && pd.comments.length ? `<div class="jd-issue-pending">Pending comments: <strong>${pd.comments.length}</strong></div>` : ''}
          ${n ? `<div class="jd-issue-warn">${n} change${n === 1 ? '' : 's'} not yet applied to Jira</div>` : ''}
          <button type="button" class="btn-primary st-btn jd-sync-btn" data-action="jira-sync-issue" data-issue="${escapeHtml(i.id)}" ${busy || !connected || (!n && !(d.draft || '').trim()) ? 'disabled' : ''}>${JD_I.refresh}${busy ? 'Syncing…' : 'Sync to Jira'}</button>
          ${!connected ? '<div class="jd-issue-hint">Connect Jira in Settings to sync.</div>' : ''}
          ${d.result ? `<div class="jd-issue-result ${d.result.ok ? 'ok' : 'fail'}">${escapeHtml(d.result.text)}</div>` : ''}
        </div>
      </div>
    </td></tr>`;
};

const jiraResetFilters = () => { state.jiraFilters = { q: '', cat: '', type: '', assignee: '', sort: 'updated-desc', page: 1, size: (state.jiraFilters && state.jiraFilters.size) || 25 }; };


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
    calendar: 'Calendar',
    tests: 'Project Insights',
    releases: 'Release Management',
    releasepoints: 'Release Points',
    jira: 'Jira',
    testcases: 'Test Case Management',
    notes: 'Notes',
    developers: 'Developer Management',
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

const isCurrentMonth = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

// ─── Weekly Chart (Chart.js) ─────────────────────────────
let _weeklyChartInstance = null;

const initWeeklyChart = () => {
  const canvas = document.getElementById('weeklyTaskChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (_weeklyChartInstance) { _weeklyChartInstance.destroy(); _weeklyChartInstance = null; }

  // Rebuild weekData from current state.chartMonth
  if (!state.chartMonth) {
    const _d = new Date();
    state.chartMonth = { year: _d.getFullYear(), month: _d.getMonth() };
  }
  const { year: cy, month: cm } = state.chartMonth;
  const lmStart = new Date(cy, cm, 1);
  const lmEnd = new Date(cy, cm + 1, 0, 23, 59, 59, 999);
  const firstDay = new Date(lmStart);
  const dow = firstDay.getDay();
  const off = dow === 0 ? -6 : 1 - dow;
  let wCursor = new Date(firstDay); wCursor.setDate(firstDay.getDate() + off);
  const wData = [];
  while (wCursor <= lmEnd) {
    const wEnd = new Date(wCursor); wEnd.setDate(wCursor.getDate() + 6);
    const dS = new Date(wCursor); dS.setHours(0, 0, 0, 0);
    const dE = new Date(wEnd); dE.setHours(23, 59, 59, 999);
    // Clamp both the label AND the count to this month's portion of the week —
    // otherwise a week straddling two months (e.g. Jul 27–Aug 2) counts the
    // same completed tasks in both months' totals.
    const dispS = new Date(Math.max(dS, lmStart));
    const dispE = new Date(Math.min(dE, lmEnd));
    const mo = (d) => d.toLocaleDateString('en', { month: 'short' });
    const lbl = mo(dispS) === mo(dispE)
      ? `${mo(dispS)} ${dispS.getDate()}–${dispE.getDate()}`
      : `${dispS.getDate()} ${mo(dispS)}–${dispE.getDate()} ${mo(dispE)}`;
    const count = state.tasks.filter(t => {
      if (t.status !== 'Done') return false;
      const cd = new Date(t.completedDate || t.updatedAt || t.createdAt);
      return cd >= dispS && cd <= dispE;
    }).length;
    wData.push({ label: lbl, count });
    wCursor.setDate(wCursor.getDate() + 7);
  }

  const labels = wData.map((_, i) => `Wk ${i + 1}`);
  const counts = wData.map(w => w.count);
  const subLabels = wData.map(w => `(${w.label})`);

  _weeklyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: counts.map(c => {
          const max = Math.max(...counts);
          return c === max && c > 0 ? '#1a4a36' : '#2d6a4f';
        }),
        hoverBackgroundColor: '#3d8b68',
        borderRadius: { topLeft: 6, topRight: 6 },
        borderSkipped: 'bottom',
        maxBarThickness: 72,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${labels[items[0].dataIndex]} ${subLabels[items[0].dataIndex]}`,
            label: (item) => ` ${item.raw} tasks completed`,
          },
          backgroundColor: '#1a1916',
          titleFont: { size: 11, weight: '600' },
          bodyFont: { size: 12, weight: '700' },
          padding: 10,
          cornerRadius: 8,
        },
        datalabels: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#6b6760',
            font: { size: 11, weight: '700', family: 'inherit' },
            callback: (_val, i) => [labels[i], subLabels[i]],
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false, dash: [5, 4] },
          grid: { color: '#e8e5df', drawTicks: false },
          ticks: {
            color: '#a09d96',
            font: { size: 10, family: 'inherit' },
            precision: 0,
            padding: 8,
          },
        },
      },
      animation: { duration: 400, easing: 'easeOutQuart' },
    },
    plugins: [{
      id: 'barCountLabel',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets[0].data.forEach((val, i) => {
          if (!val) return;
          const meta = chart.getDatasetMeta(0);
          const bar = meta.data[i];
          ctx.save();
          ctx.fillStyle = '#1a1916';
          ctx.font = 'bold 12px inherit';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(val, bar.x, bar.y - 4);
          ctx.restore();
        });
      },
    }],
  });
};

// ─── Sync Project Release Dates ───────────────────────────
const syncProjectReleaseDates = () => {
  if (!state.releases || !state.projects) return false;
  let changed = false;
  state.releases.forEach(r => {
    if (!r.releaseDate) return;
    const projIds = r.projectIds || (r.projectId ? [r.projectId] : []);
    const versions = r.versions || (r.version ? [r.version] : []);
    projIds.forEach(pid => {
      const p = state.projects.find(x => x.id === pid);
      if (!p || !p.releaseHistory) return;
      p.releaseHistory.forEach(entry => {
        const vClean = (entry.version || '').toLowerCase().replace(/^v/, '').trim();
        const matchesVer = versions.length === 0 || versions.some(v => (v || '').toLowerCase().replace(/^v/, '').trim() === vClean);
        if (matchesVer && entry.releasedAt !== r.releaseDate) {
          entry.releasedAt = r.releaseDate;
          changed = true;
        }
      });
      if (p.releaseHistory.length > 0 && p.lastReleaseAt !== p.releaseHistory[0].releasedAt) {
        p.lastReleaseAt = p.releaseHistory[0].releasedAt;
        changed = true;
      }
    });
  });
  return changed;
};

// ─── Dashboard sections ──────────────────────────────────
const DB_ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3v7.2a4 4 0 01-1.3 2.9l-3.4 3.1A2 2 0 005.7 20h12.6a2 2 0 001.4-3.8l-3.4-3.1A4 4 0 0115 10.2V3"/><path d="M7 3h10"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg>'
};
// 'YYYY-MM-DD' as a local date (new Date('YYYY-MM-DD') would be UTC midnight).
const dbLocalDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
};
// Same header style as the other Dashboard cards (Released, Charts & Metrics).
const dbCardHead = (icon, title, meta = '') => `
  <div class="db-card-title dbx-head">
    <span class="dbx-icon">${icon}</span>
    <span>${title}</span>
    ${meta ? `<span class="dbx-meta">${meta}</span>` : ''}
  </div>`;
const dbEmpty = (text) => `<div class="dbx-empty">${text}</div>`;

// Recent Tasks: status mix + what needs attention + what just got done.
const renderDbTaskPulse = () => {
  const tasks = state.tasks || [];
  const statusOf = (t) => TASK_STATUS_OPTIONS.includes(t.status) ? t.status : 'To-Do';
  const segs = [
    { key: 'Done', label: 'Done', cls: 'done' },
    { key: 'In Progress', label: 'In Progress', cls: 'progress' },
    { key: 'To-Do', label: 'To-Do', cls: 'todo' },
    { key: 'On Hold', label: 'On Hold', cls: 'hold' }
  ].map(s => ({ ...s, n: tasks.filter(t => statusOf(t) === s.key).length }));
  const total = tasks.length || 1;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const attention = tasks
    .filter(t => statusOf(t) !== 'Done' && t.endDate)
    .map(t => ({ t, days: Math.round((dbLocalDay(t.endDate) - today) / 86400000) }))
    .filter(x => x.days <= 3)
    .sort((a, b) => a.days - b.days);
  const done = tasks
    .filter(t => statusOf(t) === 'Done')
    .sort((a, b) => new Date(b.completedDate || b.updatedAt || b.createdAt) - new Date(a.completedDate || a.updatedAt || a.createdAt));

  const sub = (t) => {
    const p = getTaskProjectNames(t);
    const d = getTaskDevNames(t).filter(n => n && n !== '–');
    return escapeHtml([p.length ? p.join(', ') : 'No project', d.length ? d.join(', ') : 'Unassigned'].join(' · '));
  };
  const dueLabel = (d) => d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`;
  const row = (t, kind, tag, tagCls) => `
    <button type="button" class="dbx-row" data-action="view-task" data-id="${t.id}" title="Open task">
      <span class="dbx-row-icon ${kind}">${kind === 'done' ? DB_ICONS.check : DB_ICONS.alert}</span>
      <span class="dbx-row-main">
        <span class="dbx-row-title">${escapeHtml(t.title || 'Untitled task')}</span>
        <span class="dbx-row-sub">${sub(t)}</span>
      </span>
      <span class="dbx-tag ${tagCls}">${tag}</span>
    </button>`;

  const attentionHtml = attention.length
    ? attention.slice(0, 8).map(x => row(x.t, x.days < 0 ? 'overdue' : 'soon', dueLabel(x.days), x.days < 0 ? 'danger' : 'warning')).join('')
    : dbEmpty('Nothing overdue or due in the next 3 days. 🎉');
  const doneHtml = done.length
    ? done.slice(0, 8).map(t => { const at = t.completedDate || t.updatedAt || t.createdAt; return row(t, 'done', at ? timeAgo(at) : 'Done', 'muted'); }).join('')
    : dbEmpty('No completed tasks yet.');

  return `
    <div class="db-card dbx-card">
      ${dbCardHead(DB_ICONS.clock, 'Recent Tasks', `${tasks.length - segs[0].n} open · ${segs[0].n} done`)}
      <div class="dbx-pulse">
        <div class="dbx-stackbar" role="img" aria-label="Task status mix">
          ${segs.filter(s => s.n).map(s => `<span class="${s.cls}" style="flex:${s.n}" title="${s.label}: ${s.n}"></span>`).join('') || '<span class="empty" style="flex:1"></span>'}
        </div>
        <div class="dbx-pulse-stats">
          ${segs.map(s => `
            <div class="dbx-pstat">
              <span class="dbx-dot ${s.cls}"></span>
              <span class="dbx-pstat-label">${s.label}</span>
              <span class="dbx-pstat-n">${s.n}</span>
              <span class="dbx-pstat-pct">${Math.round(s.n / total * 100)}%</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="dbx-cols">
        <div class="dbx-col">
          <div class="dbx-col-head"><span>Needs attention</span><span class="dbx-count ${attention.length ? 'danger' : ''}">${attention.length}</span></div>
          <div class="dbx-list">${attentionHtml}</div>
        </div>
        <div class="dbx-col">
          <div class="dbx-col-head"><span>Recently completed</span><span class="dbx-count">${done.length}</span></div>
          <div class="dbx-list">${doneHtml}</div>
        </div>
      </div>
    </div>`;
};

// ─── Release ↔ Release Point helpers ──────────────────────
// Release Point versions are stored as the form's labels ("v1.7.0 (Up)",
// "Android v1.7.3 (Prev)"), while releases store plain versions ("v1.7.0").
// For display and matching, drop the "(Up)/(Prev)" suffix — it only described the
// project's version at the moment the box was ticked.
const rpCleanVersion = (v) => String(v || '').replace(/\s*\((up|prev)\)\s*$/i, '').trim();
const rpVersionCore = (v) => rpCleanVersion(v).replace(/^(android|ios|web)\s+/i, '').replace(/^v/i, '').toLowerCase();
const releaseVersionsOf = (r) => (r && r.versions && r.versions.length ? r.versions : (r && r.version ? [r.version] : [])).filter(Boolean);
const releaseProjectIdsOf = (r) => (r.projectIds && r.projectIds.length ? r.projectIds : (r.projectId ? [r.projectId] : []));
// One label per version: case-insensitive, and "Android v1.7.3" wins over a bare "v1.7.3".
const rpVersionLabels = (rp, linkedRelease) => {
  const isPlatform = (l) => /^(android|ios)\s/i.test(l);
  const out = [];
  [...(rp.versions || []), ...releaseVersionsOf(linkedRelease)].map(rpCleanVersion).filter(Boolean).forEach(l => {
    if (out.some(o => o.toLowerCase() === l.toLowerCase())) return;
    const bare = out.findIndex(o => !isPlatform(o) && rpVersionCore(o) === rpVersionCore(l));
    if (isPlatform(l) && bare >= 0) { out[bare] = l; return; }
    if (!isPlatform(l) && out.some(o => rpVersionCore(o) === rpVersionCore(l))) return;
    out.push(l);
  });
  return out;
};
// The release a Release Point belongs to: its Linked Release, otherwise a release of the
// same project sharing one of its versions (reported as matched: 'version').
const releaseForPoint = (rp, releases = state.releases || []) => {
  if (rp.releaseId) {
    const r = releases.find(x => x.id === rp.releaseId);
    if (r) return { release: r, matched: 'link' };
  }
  const cores = (rp.versions || []).map(rpVersionCore).filter(Boolean);
  if (!cores.length) return null;
  const pids = rp.projectIds || (rp.projectId ? [rp.projectId] : []);
  const r = releases.find(x => releaseProjectIdsOf(x).some(p => pids.includes(p)) && releaseVersionsOf(x).some(v => cores.includes(rpVersionCore(v))));
  return r ? { release: r, matched: 'version' } : null;
};

// Active Releases & Plans: stage pipeline, what's in flight (releases with their
// release points nested), and what shipped last.
const renderDbReleasePipeline = () => {
  const releases = state.releases || [];
  const STAGES = ['Draft', 'Planned', 'In Progress', 'Testing', 'Approved', 'Released'];
  const count = (s) => releases.filter(r => (r.status || 'Draft') === s).length;
  const rolledBack = count('Rolled Back');
  const IN_FLIGHT = ['Planned', 'In Progress', 'Testing', 'Approved'];
  const pointDone = (rp) => { const items = rp.checklistItems || []; return !!(rp.isCompleted || (items.length && items.every(i => i.done))); };
  // Group release points under the release they belong to (link, else project+version).
  const groups = new Map(); // releaseId -> { release, points: [{ rp, matched }] }
  const unlinked = [];
  (state.releasePoints || []).forEach(rp => {
    const m = releaseForPoint(rp, releases);
    if (!m) { if (!pointDone(rp)) unlinked.push(rp); return; }
    if (!groups.has(m.release.id)) groups.set(m.release.id, { release: m.release, points: [] });
    groups.get(m.release.id).points.push({ rp, matched: m.matched });
  });
  // In flight = releases at an in-flight stage, plus any other release that still has open checklist work.
  const inFlightGroups = releases
    .filter(r => IN_FLIGHT.includes(r.status) || (groups.get(r.id) || { points: [] }).points.some(p => !pointDone(p.rp)))
    .map(r => groups.get(r.id) || { release: r, points: [] })
    .sort((a, b) => IN_FLIGHT.indexOf(b.release.status) - IN_FLIGHT.indexOf(a.release.status));
  const shipped = releases.filter(r => r.status === 'Released' && r.releaseDate)
    .sort((a, b) => dbLocalDay(b.releaseDate) - dbLocalDay(a.releaseDate)).slice(0, 4);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysAgo = (s) => { const d = Math.round((today - dbLocalDay(s)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  const projNames = (ids) => (ids || []).map(id => (state.projects.find(p => p.id === id) || {}).name).filter(Boolean).join(', ');

  const pipeline = `
    <div class="dbx-pipeline">
      ${STAGES.map(s => { const n = count(s); return `
        <div class="dbx-stage ${n ? 'has' : ''} ${s === 'Released' ? 'final' : ''}">
          <span class="dbx-stage-n">${n}</span>
          <span class="dbx-stage-label">${s}</span>
        </div>`; }).join('<span class="dbx-stage-link"></span>')}
    </div>
    ${rolledBack ? `<div class="dbx-rolled">${rolledBack} rolled back</div>` : ''}`;

  const pointRow = (rp, matched) => {
    const items = rp.checklistItems || [];
    const d = items.filter(i => i.done).length;
    const pct = items.length ? Math.round(d / items.length * 100) : 0;
    return `
      <button type="button" class="dbx-point" data-action="open-release-pt" data-id="${rp.id}" title="Open in Release Points">
        <span class="dbx-point-icon">${DB_ICONS.list}</span>
        <span class="dbx-point-title">${escapeHtml(rp.title || 'Untitled release point')}${matched === 'version' ? '<em title="Not set as this release point’s Linked Release — matched by project and version">matched by version</em>' : ''}</span>
        <span class="dbx-point-progress"><span class="dbx-minibar"><span style="width:${pct}%"></span></span><span>${d}/${items.length}</span></span>
      </button>`;
  };
  const groupHtml = ({ release: r, points }) => {
    const sc = (r.status || 'Draft').toLowerCase().replace(' ', '');
    return `
      <div class="dbx-rel">
        <button type="button" class="dbx-row" data-action="view-release" data-id="${r.id}" title="Open release">
          <span class="dbx-row-icon release">${DB_ICONS.rocket}</span>
          <span class="dbx-row-main">
            <span class="dbx-row-title">${escapeHtml(r.name || 'Untitled release')}</span>
            <span class="dbx-row-sub">${escapeHtml([projNames(releaseProjectIdsOf(r)), releaseVersionsOf(r).join(', ')].filter(Boolean).join(' · ') || 'Release')}</span>
          </span>
          <span class="status-pill ${sc}">${escapeHtml(r.status || 'Draft')}</span>
        </button>
        <div class="dbx-rel-points">
          ${points.length ? points.map(p => pointRow(p.rp, p.matched)).join('') : '<span class="dbx-rel-none">No release point linked</span>'}
        </div>
      </div>`;
  };
  const inFlightHtml = inFlightGroups.map(groupHtml).join('') + (unlinked.length ? `
    <div class="dbx-rel dbx-rel-unlinked">
      <div class="dbx-rel-unlinked-head">Release points not linked to a release <span class="dbx-count">${unlinked.length}</span></div>
      <div class="dbx-rel-points">${unlinked.map(rp => pointRow(rp)).join('')}</div>
    </div>` : '');

  const shippedHtml = shipped.length ? `
    <div class="dbx-col">
      <div class="dbx-col-head"><span>Recently shipped</span></div>
      <div class="dbx-list">
        ${shipped.map(r => `
          <button type="button" class="dbx-row" data-action="view-release" data-id="${r.id}" title="Open release">
            <span class="dbx-row-icon done">${DB_ICONS.check}</span>
            <span class="dbx-row-main">
              <span class="dbx-row-title">${escapeHtml(r.name || 'Untitled release')}</span>
              <span class="dbx-row-sub">${escapeHtml(projNames(r.projectIds || (r.projectId ? [r.projectId] : [])) || 'Release')}</span>
            </span>
            <span class="dbx-row-when"><strong>${fmtDate(r.releaseDate)}</strong><em>${daysAgo(r.releaseDate)}</em></span>
          </button>`).join('')}
      </div>
    </div>` : '';
  const inFlightCount = inFlightGroups.length;
  const meta = [`${inFlightCount} release${inFlightCount === 1 ? '' : 's'} in flight`, unlinked.length ? `${unlinked.length} unlinked` : ''].filter(Boolean).join(' · ');

  return `
    <div class="db-card dbx-card">
      ${dbCardHead(DB_ICONS.rocket, 'Active Releases &amp; Plans', meta)}
      ${pipeline}
      <div class="dbx-col">
        <div class="dbx-col-head"><span>In flight</span><span class="dbx-count">${inFlightCount}</span><span class="dbx-col-hint">releases with their release points</span></div>
        ${inFlightCount || unlinked.length ? `<div class="dbx-list dbx-list-tall dbx-rel-list">${inFlightHtml}</div>` : `
          <div class="dbx-empty dbx-empty-cta dbx-empty-inline">
            <span>Nothing in flight right now.</span>
            <button type="button" class="btn-ghost" data-action="new-release-pt">Plan a release point</button>
          </div>`}
      </div>
      ${shippedHtml}
    </div>`;
};

// Test Cases by Project: overall pass rate + one compact row per project.
const renderDbTestCases = () => {
  const tcs = state.testCases || [];
  const kind = (s) => ['Pass', 'Passed'].includes(s) ? 'pass' : ['Fail', 'Failed'].includes(s) ? 'fail' : s === 'Blocked' ? 'blocked' : 'notrun';
  const blank = () => ({ total: 0, pass: 0, fail: 0, blocked: 0, notrun: 0 });
  const all = blank();
  const by = {};
  tcs.forEach(tc => {
    const k = kind(tc.status);
    const key = tc.projectId || '__none__';
    by[key] = by[key] || blank();
    [all, by[key]].forEach(o => { o.total++; o[k]++; });
  });
  if (!all.total) {
    return `<div class="db-card dbx-card">${dbCardHead(DB_ICONS.flask, 'Test Cases by Project')}${dbEmpty('No test cases yet.')}</div>`;
  }
  const rate = (o) => o.total ? Math.round(o.pass / o.total * 1000) / 10 : 0;
  const bar = (o) => ['pass', 'fail', 'blocked', 'notrun'].filter(k => o[k]).map(k => `<span class="${k}" style="flex:${o[k]}"></span>`).join('');
  const rows = Object.entries(by).sort((a, b) => b[1].total - a[1].total).map(([pid, o]) => {
    const p = state.projects.find(x => x.id === pid);
    const r = rate(o);
    return `
      <button type="button" class="dbx-tc-row" ${p ? `data-action="open-tc-project" data-id="${p.id}"` : 'disabled'} title="${p ? 'Open in Test Case Management' : ''}">
        <span class="dbx-tc-name">${escapeHtml(p ? p.name : 'Unassigned')}</span>
        <span class="dbx-stackbar slim">${bar(o)}</span>
        <span class="dbx-tc-rate ${r >= 95 ? 'good' : r >= 80 ? 'ok' : 'low'}">${r}%</span>
        <span class="dbx-tc-fail">${o.fail ? `<span class="dbx-tag danger">${o.fail} failed</span>` : ''}</span>
        <span class="dbx-tc-total">${o.total}</span>
      </button>`;
  }).join('');
  const legend = [['pass', 'Passed'], ['fail', 'Failed'], ['blocked', 'Blocked'], ['notrun', 'Not run']]
    .map(([k, l]) => `<span class="dbx-legend-item"><span class="dbx-dot ${k}"></span>${l}<strong>${all[k]}</strong></span>`).join('');

  return `
    <div class="db-card dbx-card">
      ${dbCardHead(DB_ICONS.flask, 'Test Cases by Project', `${all.total} cases · ${Object.keys(by).length} projects`)}
      <div class="dbx-tc-summary">
        <div class="dbx-tc-big"><span class="dbx-tc-big-n">${rate(all)}%</span><span class="dbx-tc-big-l">overall pass rate</span></div>
        <div class="dbx-tc-summary-right">
          <span class="dbx-stackbar">${bar(all)}</span>
          <div class="dbx-legend">${legend}</div>
        </div>
      </div>
      <div class="dbx-tc-table">
        <div class="dbx-tc-row dbx-tc-headrow"><span>Project</span><span>Results</span><span>Pass</span><span>Failed</span><span>Total</span></div>
        <div class="dbx-tc-body">${rows}</div>
      </div>
    </div>`;
};

// ─── Dashboard ───────────────────────────────────────────
const renderDashboard = () => {
  const totalProjects = state.projects.length;
  const totalTasks = state.tasks.length;
  const totalTests = (state.tests || []).length;
  const totalReleases = (state.releases || []).length;
  const totalReleasePts = (state.releasePoints || []).length;
  const completedTasks = state.tasks.filter(t => t.status === 'Done').length;
  const taskPct = totalTasks === 0 ? 0 : Math.round(completedTasks / totalTasks * 100);

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

  // 1. Released — month navigator
  if (!state.releasedMonth) {
    const _d = new Date();
    state.releasedMonth = { year: _d.getFullYear(), month: _d.getMonth() };
  }
  const { year: rmYear, month: rmMonth } = state.releasedMonth;
  const rmStart = new Date(rmYear, rmMonth, 1);
  const rmName = rmStart.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const isReleasedMonth = (dateStr) => {
    if (!dateStr) return false;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}/.test(dateStr)) {
      const parts = dateStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      return y === rmYear && m === rmMonth;
    }
    const d = new Date(dateStr);
    return !isNaN(d) && d.getFullYear() === rmYear && d.getMonth() === rmMonth;
  };

  syncProjectReleaseDates();

  const allReleasesThisMonth = [];

  // Get completed / released items from Release Management based strictly on their selected releaseDate
  const manualReleasesThisMonth = (state.releases || [])
    .filter(r => {
      const isRel = r.status === 'Released' || (!r.status && r.releaseDate);
      if (!isRel) return false;
      const targetDate = r.releaseDate || r.createdAt;
      return isReleasedMonth(targetDate);
    });

  manualReleasesThisMonth.forEach(r => {
    const projIds = r.projectIds || (r.projectId ? [r.projectId] : []);
    const projNames = projIds.map(pid => { const p = state.projects.find(x => x.id === pid); return p ? p.name : null; }).filter(Boolean);
    const versions = r.versions || (r.version ? [r.version] : []);
    const projSummary = projNames.length ? projNames.join(', ') : '';
    const verSummary = versions.length ? versions.join(', ') : (r.version || '');
    const displayDate = r.releaseDate || r.createdAt;

    allReleasesThisMonth.push({
      title: r.name,
      subtitle: projSummary ? `${projSummary} · Version ${verSummary || '—'}` : `Version ${verSummary || '—'}`,
      date: displayDate,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; color:var(--accent);"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`
    });
  });

  // Only include project releases from p.releaseHistory if that project is NOT tracked in Release Management!
  state.projects.forEach(p => {
    const hasReleasesInMgmt = (state.releases || []).some(r => {
      const pids = r.projectIds || (r.projectId ? [r.projectId] : []);
      return pids.includes(p.id);
    });
    if (hasReleasesInMgmt) return; // Managed via Release Management, do NOT duplicate on dashboard!

    if (p.releaseHistory) {
      p.releaseHistory.forEach(entry => {
        if (isReleasedMonth(entry.releasedAt)) {
          let icon = '';
          if (entry.platform === 'ANDROID') {
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; color:#22c55e;"><path d="M4 9h16M4 15h16M10 3v2M14 3v2M9 21h6"/></svg>`;
          } else if (entry.platform === 'IOS') {
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; color:#0ea5e9;"><path d="M12 2a10 10 0 018 4.5l-1.5 1.5A8 8 0 1012 22a10 10 0 01-8-4.5l1.5-1.5A8 8 0 0012 2z"/></svg>`;
          } else {
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; color:#eab308;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
          }
          allReleasesThisMonth.push({
            title: `${p.name} (${entry.platform})`,
            subtitle: entry.log || `Version ${entry.version} released`,
            date: entry.releasedAt,
            icon: icon
          });
        }
      });
    }
  });

  const parseItemDate = (dateStr) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-');
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
    }
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? 0 : t;
  };

  allReleasesThisMonth.sort((a, b) => parseItemDate(b.date) - parseItemDate(a.date));

  const releasesHtml = allReleasesThisMonth.length ? `
    <div class="timeline-wrap">
      ${allReleasesThisMonth.map(r => `
        <div class="timeline-node">
          <div class="timeline-node-title" style="display:flex; align-items:center; gap:8px;">
            ${r.icon}
            <span style="font-weight:600;">${r.title}</span>
          </div>
          <div style="font-size:12px; color:var(--text-secondary); margin-left:22px; padding: 2px 0;">${r.subtitle}</div>
          <div class="timeline-node-time" style="margin-left:22px;">${fmtDate(r.date)} · ${timeAgo(r.date)}</div>
        </div>
      `).join('')}
    </div>
  ` : `<div style="color:var(--text-muted);font-size:13px;font-style:italic;text-align:center;padding:36px 0;">No releases recorded for ${rmName}</div>`;

  // ── Chart 1: Tasks completed — selected month by calendar week ──
  if (!state.chartMonth) {
    const _d = new Date();
    state.chartMonth = { year: _d.getFullYear(), month: _d.getMonth() };
  }
  const { year: cmYear, month: cmMonth } = state.chartMonth;
  const lmStart = new Date(cmYear, cmMonth, 1);
  const lmEnd = new Date(cmYear, cmMonth + 1, 0, 23, 59, 59, 999);
  const lmName = lmStart.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const moAbbr = lmStart.toLocaleDateString('en', { month: 'short' });

  // Calendar weeks: Mon–Sun boundaries that intersect this month
  const weekData = [];
  // Find the Monday on or before the 1st
  const firstDay = new Date(lmStart);
  const dowFirst = firstDay.getDay(); // 0=Sun,1=Mon,...
  const offsetToMon = dowFirst === 0 ? -6 : 1 - dowFirst;
  let wCursor = new Date(firstDay); wCursor.setDate(firstDay.getDate() + offsetToMon);

  while (wCursor <= lmEnd) {
    const wEnd = new Date(wCursor); wEnd.setDate(wCursor.getDate() + 6);
    const wS = new Date(wCursor); wS.setHours(0, 0, 0, 0);
    const wE = new Date(wEnd); wE.setHours(23, 59, 59, 999);
    // Clamp both the label AND the count to this month's portion of the week —
    // otherwise a week straddling two months (e.g. Jul 27–Aug 2) counts the
    // same completed tasks in both months' totals.
    const displayStart = new Date(Math.max(wS.getTime(), lmStart.getTime()));
    const displayEnd = new Date(Math.min(wE.getTime(), lmEnd.getTime()));
    const count = state.tasks.filter(t => {
      if (t.status !== 'Done') return false;
      const cd = new Date(t.completedDate || t.updatedAt || t.createdAt);
      return cd >= displayStart && cd <= displayEnd;
    }).length;
    const startMo = displayStart.toLocaleDateString('en', { month: 'short' });
    const endMo = displayEnd.toLocaleDateString('en', { month: 'short' });
    const dateLabel = startMo === endMo
      ? `${startMo} ${displayStart.getDate()}–${displayEnd.getDate()}`
      : `${displayStart.getDate()} ${startMo} – ${displayEnd.getDate()} ${endMo}`;
    weekData.push({ label: dateLabel, count });
    wCursor.setDate(wCursor.getDate() + 7);
  }

  const totalMonthTasks = weekData.reduce((s, w) => s + w.count, 0);
  const avgTasksPerWeek = weekData.length ? Math.round(totalMonthTasks / weekData.length) : 0;

  // ── Chart 2: Task status donut ──
  const taskDone = state.tasks.filter(t => t.status === 'Done').length;
  const taskInProg = state.tasks.filter(t => t.status === 'In Progress').length;
  const taskTodo = state.tasks.filter(t => t.status === 'To-Do').length;
  const taskHold = state.tasks.filter(t => t.status === 'On Hold').length;
  const donutData = [
    { label: 'Done', count: taskDone, color: '#22c55e' },
    { label: 'In Progress', count: taskInProg, color: '#f59e0b' },
    { label: 'To-Do', count: taskTodo, color: '#60a5fa' },
    { label: 'On Hold', count: taskHold, color: '#94a3b8' },
  ];
  const donutR = 46, donutCx = 56, donutCy = 56, donutSW = 18, donutGap = 1.5;
  const donutCirc = 2 * Math.PI * donutR;
  const donutTotal = totalTasks || 1;
  let cumOff = 0;
  const donutSegs = donutData.filter(d => d.count > 0).map(({ count, color }) => {
    const dash = Math.max((count / donutTotal) * donutCirc - donutGap, 0);
    const seg = `<circle cx="${donutCx}" cy="${donutCy}" r="${donutR}" fill="none" stroke="${color}" stroke-width="${donutSW}"
      stroke-dasharray="${dash.toFixed(2)} ${(donutCirc - dash).toFixed(2)}"
      stroke-dashoffset="${(-cumOff).toFixed(2)}"
      stroke-linecap="round"
      transform="rotate(-90 ${donutCx} ${donutCy})"/>`;
    cumOff += (count / donutTotal) * donutCirc;
    return seg;
  }).join('');
  const donutLegend = donutData.map(d => `
    <div class="db-donut-legend-row">
      <span class="db-donut-dot" style="background:${d.color};"></span>
      <span class="db-donut-label">${d.label}</span>
      <span class="db-donut-val" style="color:${d.color};">${d.count}</span>
    </div>`).join('');

  // (release chips removed per user request)

  // ── Large donut for charts card ──
  const dCx = 65, dCy = 65, dR = 50, dSW = 20, dGap = 2;
  const dCirc = 2 * Math.PI * dR;
  let dOff = 0;
  const largeDonutSegs = donutData.filter(d => d.count > 0).map(({ count, color }) => {
    const dash = Math.max((count / donutTotal) * dCirc - dGap, 0);
    const seg = `<circle cx="${dCx}" cy="${dCy}" r="${dR}" fill="none" stroke="${color}" stroke-width="${dSW}"
      stroke-dasharray="${dash.toFixed(2)} ${(dCirc - dash).toFixed(2)}"
      stroke-dashoffset="${(-dOff).toFixed(2)}" stroke-linecap="round"
      transform="rotate(-90 ${dCx} ${dCy})"/>`;
    dOff += (count / donutTotal) * dCirc;
    return seg;
  }).join('');

  return `
    ${hero}

    <div class="db-container">

      <!-- Row 1: Released | Charts & Metrics -->
      <div class="db-grid">
        <div class="db-card">
          <div class="db-chart-header">
            <div class="db-card-title" style="margin-bottom:0;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Released
            </div>
            <div class="db-chart-nav">
              <button class="db-chart-nav-btn" data-action="released-month-prev" aria-label="Previous month" title="Previous month">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div class="db-chart-nav-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--accent);flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span class="db-chart-nav-label">${rmName}</span>
              </div>
              <button class="db-chart-nav-btn" data-action="released-month-next" aria-label="Next month" title="Next month"
                ${(() => { const n = new Date(); return (rmYear === n.getFullYear() && rmMonth === n.getMonth()) ? 'disabled' : ''; })()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          <div class="db-list">${releasesHtml}</div>
        </div>

        <div class="db-card db-chart-card">
          <div class="db-chart-header">
            <div class="db-card-title" style="margin-bottom:0;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;"><path d="M3 3v18h18M7 16l4-4 4 4 4-6"/></svg>
              Charts &amp; Metrics
            </div>
            <div class="db-chart-nav">
              <button class="db-chart-nav-btn" data-action="chart-month-prev" aria-label="Previous month" title="Previous month">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div class="db-chart-nav-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--accent);flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span class="db-chart-nav-label">${lmName}</span>
              </div>
              <button class="db-chart-nav-btn" data-action="chart-month-next" aria-label="Next month" title="Next month"
                ${(() => { const n = new Date(); return (cmYear === n.getFullYear() && cmMonth === n.getMonth()) ? 'disabled' : ''; })()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>

          <div class="db-chart-info-row">
            <div class="db-chart-week-label">Tasks Completed by Week</div>
            <div class="db-chart-stats">
              <div class="db-chart-stat-item">
                <div class="db-chart-stat-label">AVG TASKS/WK</div>
                <div class="db-chart-stat-val">
                  ${avgTasksPerWeek}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;color:var(--text-muted);"><path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>
                </div>
              </div>
              <div class="db-chart-stat-item">
                <div class="db-chart-stat-label">TOTAL TASKS</div>
                <div class="db-chart-stat-val">
                  ${totalMonthTasks}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;color:var(--text-muted);"><path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>
                </div>
              </div>
            </div>
          </div>
          <div class="db-chart-wrap">
            <canvas id="weeklyTaskChart" height="220"></canvas>
          </div>
        </div>
      </div>

      <!-- Row 2: Recent Tasks -->
      ${renderDbTaskPulse()}

      <!-- Row 3: Test Cases by Project | Active Releases & Plans -->
      <div class="db-grid">
        ${renderDbTestCases()}
        ${renderDbReleasePipeline()}
      </div>
    </div>
  `;
};


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

    <div class="filters-bar">
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
  const isApp = p.projectType === 'app';
  const statusPills = (p.statuses || []).map(s => statusPill(s)).join('');

  const clientLine = p.clientName ? `
    <div class="kanban-meta-item" title="Client">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>${highlight(escapeHtml(p.clientName), q)}</span>
    </div>
  ` : '';

  const teamLine = p.assignedTeam ? `
    <div class="kanban-meta-item" title="Assigned Team">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <span>${highlight(p.assignedTeam, q)}</span>
    </div>
  ` : '';

  const dueDateLine = p.dueDate ? `
    <div class="kanban-meta-item" title="Due Date">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span>${fmtDate(p.dueDate)}</span>
    </div>
  ` : '';

  const priorityBadge = p.priority ? `
    <span class="kanban-priority-badge ${p.priority.toLowerCase()}">${p.priority}</span>
  ` : '';

  const projTasks = state.tasks.filter(t => (t.projectIds || []).includes(p.id));
  const completedTasks = projTasks.filter(t => t.status === 'Done').length;
  const progressPct = projTasks.length === 0 ? 0 : Math.round((completedTasks / projTasks.length) * 100);
  const progressHtml = projTasks.length > 0 ? `
    <div class="kanban-card-progress" title="${completedTasks} of ${projTasks.length} tasks completed">
      <div class="kanban-card-progress-bar">
        <div class="kanban-card-progress-fill" style="width: ${progressPct}%;"></div>
      </div>
      <span class="kanban-card-progress-text">${progressPct}%</span>
    </div>
  ` : '';

  const typeBadge = isApp
    ? `<span class="project-type-badge app" style="font-size: 9px; padding: 1px 6px;">App</span>`
    : `<span class="project-type-badge web" style="font-size: 9px; padding: 1px 6px;">Web</span>`;

  const assignedDevs = (state.developers || []).filter(d => (d.projectIds || []).some(pid => String(pid) === String(p.id)));
  const devsLine = `
    <div class="kanban-meta-item" title="Assigned Developers" style="align-items: center;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <div class="kanban-devs-wrap">
        ${assignedDevs.length > 0 ? assignedDevs.map(d => {
    const initials = d.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
    const avatarBg = getAvatarGradient(d.name);
    return `<span class="kanban-dev-avatar" style="background: ${avatarBg};" title="${escapeHtml(d.name)}">${initials}</span><span class="kanban-dev-name-text">${highlight(d.name, q)}</span>`;
  }).join('') : '<span style="font-size:11px;color:var(--text-muted);font-style:italic;">No developers</span>'}
      </div>
    </div>
  `;

  return `
    <div class="kanban-card" data-id="${p.id}" draggable="true">
      <div class="kanban-card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap: 8px; margin-bottom: 6px;">
        <h4 class="kanban-card-title">${highlight(p.name, q)}</h4>
        ${typeBadge}
      </div>
      
      ${p.description ? `<div class="kanban-card-desc">${highlight(trimText(p.description, 80), q)}</div>` : ''}
      
      <div class="kanban-card-meta">
        ${clientLine}
        ${teamLine}
        ${devsLine}
        ${dueDateLine}
      </div>

      <div class="kanban-card-statuses" style="display:flex; flex-wrap:wrap; gap:4px; margin-top: 8px;">
        ${statusPills}
      </div>

      ${progressHtml}

      <div class="kanban-card-footer">
        ${priorityBadge}
        <div class="kanban-card-actions">
          ${projectDetailsBtn(p.id)}
          <button class="icon-btn" data-action="edit-project" data-id="${p.id}" aria-label="Edit" title="Edit" style="padding:4px; width:24px; height:24px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px; height:13px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-project" data-id="${p.id}" aria-label="Delete" title="Delete" style="padding:4px; width:24px; height:24px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px; height:13px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
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
      <div class="po-layout">
        <div class="po-main">${releaseSection}</div>
        <aside class="po-side">${teamSection}${timelineSection}</aside>
      </div>
      ${taskSection}
    </div>`;
};

// ─── Tasks ───────────────────────────────────────────────
const renderTasks = () => {
  let tasks = state.tasks;
  const q = state.taskSearch.toLowerCase();

  if (q) {
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      getTaskDevNames(t).join(' ').toLowerCase().includes(q)
    );
  }

  if (state.filters.dateFrom || state.filters.dateTo) {
    // Filters on the task's Start Date, not when it was entered into the
    // system — bulk-logging a task today for a start date earlier this week
    // should be found by that earlier date, not by today.
    tasks = tasks.filter(t => {
      if (!t.startDate) return false;
      const start = t.startDate.split('T')[0]; // YYYY-MM-DD, string-comparable
      if (state.filters.dateFrom && start < state.filters.dateFrom) return false;
      if (state.filters.dateTo && start > state.filters.dateTo) return false;
      return true;
    });
  }

  if (state.filters.taskProject) {
    tasks = tasks.filter(t => (t.projectIds || []).includes(state.filters.taskProject));
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
      <div class="date-range-wrap" title="Show tasks with a start date in this range">
        <input type="date" class="filter-select" id="filterDateFrom" value="${state.filters.dateFrom || ''}" style="cursor:pointer" />
        <span class="date-range-sep">to</span>
        <input type="date" class="filter-select" id="filterDateTo" value="${state.filters.dateTo || ''}" style="cursor:pointer" />
      </div>
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
      ${(state.filters.dateFrom || state.filters.dateTo || state.filters.taskProject || state.filters.taskPriority || state.filters.taskDeadline) ? `
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

const renderCalendarPanelTaskCard = (t) => {
  const projNames = getTaskProjectNames(t).join(', ') || 'No Project';
  const devNames = getTaskDevNames(t).join(', ') || 'Unassigned';
  const isDone = t.status === 'Done';

  const statusLabels = {
    'To-Do': 'Pending',
    'In Progress': 'In Progress',
    'Done': 'Completed',
    'On Hold': 'On-hold'
  };
  const statusClass = t.status ? t.status.toLowerCase().replace(' ', '-') : 'todo';

  return `
    <div class="calendar-task-card" data-action="edit-task" data-id="${t.id}">
      <div class="calendar-task-card-header">
        <span class="calendar-task-project">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:10px;height:10px;margin-right:4px;"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
          ${projNames}
        </span>
        <span class="priority-pill ${String(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
      </div>
      <div class="calendar-task-card-title ${isDone ? 'done' : ''}">
        ${t.title}
      </div>
      ${t.description ? `<div class="calendar-task-card-desc">${formatCardDescription(t.description)}</div>` : ''}
      <div class="calendar-task-card-footer">
        <span class="calendar-task-dev">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px;margin-right:4px;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          ${devNames}
        </span>
        <span class="calendar-task-status badge-${statusClass}">
          ${statusLabels[t.status] || t.status || 'Pending'}
        </span>
      </div>
      <div class="calendar-task-card-dates">
        ${t.startDate ? `<span>Start: ${t.startDate}</span>` : ''}
        ${t.endDate ? `<span>Due: ${t.endDate}</span>` : ''}
      </div>
    </div>
  `;
};

const renderCalendar = () => {
  // Helper to format date YYYY-MM-DD
  const formatDateStr = (y, m, d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  };

  const getTaskCalendarRange = (t) => {
    const start = t.startDate || t.date || (t.createdAt ? t.createdAt.split('T')[0] : null);
    let end = t.endDate || t.startDate || t.date || null;
    if (t.status === 'Done') {
      if (t.completedDate) end = t.completedDate.split('T')[0];
      else if (t.updatedAt) end = t.updatedAt.split('T')[0];
    }
    return { start, end };
  };

  const isTaskActiveOnDate = (t, dateStr) => {
    const { start, end } = getTaskCalendarRange(t);
    if (start && end) {
      return dateStr >= start && dateStr <= end;
    }
    if (end) {
      return end === dateStr;
    }
    if (start) {
      return start === dateStr;
    }
    return false;
  };

  if (!state.calendarMonth) {
    const d = new Date();
    state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  }

  if (!state.selectedCalendarDate) {
    const today = new Date();
    state.selectedCalendarDate = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  }

  const { year, month } = state.calendarMonth;
  const filterProjId = state.calendarFilters.project;

  // 1. Filter tasks
  let tasks = state.tasks;
  if (filterProjId) {
    tasks = tasks.filter(t => (t.projectIds || []).includes(filterProjId) || t.projectId === filterProjId);
  }

  // 2. Calendar math
  const numDays = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const paddingPrev = firstDayIndex;
  const prevMonthNumDays = new Date(year, month, 0).getDate();

  const days = [];

  // Prev Month Padding
  for (let i = paddingPrev - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthNumDays - i);
    days.push({
      date: d,
      dayNum: d.getDate(),
      isCurrentMonth: false,
      dateStr: formatDateStr(d.getFullYear(), d.getMonth(), d.getDate())
    });
  }

  // Current Month
  for (let i = 1; i <= numDays; i++) {
    days.push({
      date: new Date(year, month, i),
      dayNum: i,
      isCurrentMonth: true,
      dateStr: formatDateStr(year, month, i)
    });
  }

  // Next Month Padding
  const totalCells = Math.ceil(days.length / 7) * 7;
  const nextMonthPadding = totalCells - days.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    const d = new Date(year, month + 1, i);
    days.push({
      date: d,
      dayNum: i,
      isCurrentMonth: false,
      dateStr: formatDateStr(d.getFullYear(), d.getMonth(), d.getDate())
    });
  }

  const todayStr = formatDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const projectOptions = state.projects.map(p =>
    `<option value="${p.id}" ${state.calendarFilters.project === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  // 3. Build weekdays header
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdaysHtml = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');

  // 4. Build days grid HTML
  const gridHtml = days.map(day => {
    // Find tasks overlapping this day
    const dayTasks = tasks.filter(t => isTaskActiveOnDate(t, day.dateStr));

    const isSelected = day.dateStr === state.selectedCalendarDate;
    const taskCount = dayTasks.length;
    const badgeClass = taskCount > 0 ? '' : 'none';

    // Check if tasks are all completed (Done)
    const allDone = taskCount > 0 && dayTasks.every(t => t.status === 'Done');
    const badgeTypeClass = allDone ? 'done-only' : '';

    return `
      <div class="calendar-day-cell ${day.isCurrentMonth ? '' : 'other-month'} ${day.dateStr === todayStr ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-action="select-calendar-date" data-date="${day.dateStr}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${day.dayNum}</span>
        </div>
        <div class="calendar-day-events" style="align-items: center; justify-content: center;">
          <span class="calendar-day-task-badge ${badgeClass} ${badgeTypeClass}">${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}</span>
        </div>
      </div>
    `;
  }).join('');

  // 5. Gather tasks for selected date
  const selectedDateStr = state.selectedCalendarDate;
  const rawSelTasks = tasks.filter(t => isTaskActiveOnDate(t, selectedDateStr));

  // Apply status filter
  let filteredSelTasks = rawSelTasks;
  const statusFilter = state.calendarRightPanelFilter || 'all';
  if (statusFilter !== 'all') {
    filteredSelTasks = rawSelTasks.filter(t => t.status === statusFilter);
  }

  // Apply sorting
  const sortType = state.calendarRightPanelSort || 'priority';
  if (sortType === 'priority') {
    const priorityWeights = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    filteredSelTasks.sort((a, b) => (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0));
  } else if (sortType === 'due') {
    filteredSelTasks.sort((a, b) => {
      if (!a.endDate && !b.endDate) return 0;
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return a.endDate.localeCompare(b.endDate);
    });
  }

  const selectedDateLabel = new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // 6. Right Panel Filters & Sort Buttons
  const filterBtnsHtml = [
    { key: 'all', label: 'All' },
    { key: 'To-Do', label: 'Pending' },
    { key: 'In Progress', label: 'In Progress' },
    { key: 'Done', label: 'Completed' },
    { key: 'On Hold', label: 'On-hold' }
  ].map(f => {
    const activeClass = statusFilter === f.key ? 'active' : '';
    return `<button class="right-panel-filter-btn ${activeClass}" data-action="calendar-right-filter" data-filter="${f.key}">${f.label}</button>`;
  }).join('');

  const taskCardsHtml = filteredSelTasks.length > 0
    ? filteredSelTasks.map(t => renderCalendarPanelTaskCard(t)).join('')
    : `<div class="calendar-task-empty">No tasks scheduled for this date.</div>`;

  return `
    <div class="calendar-two-panel-layout">
      <!-- Left Panel: Calendar Grid -->
      <div class="calendar-left-panel">
        <div class="filters-bar" style="margin-top: 0; padding-bottom: 12px; border-bottom: none; background: transparent;">
          <div class="calendar-nav">
            <button class="btn-ghost" data-action="calendar-prev" style="padding: 6px 10px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="calendar-title">${monthName}</span>
            <button class="btn-ghost" data-action="calendar-next" style="padding: 6px 10px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <select class="filter-select" id="filterCalendarProject" data-calfilter="project" style="margin-left: auto; min-width: 180px;">
            <option value="">All Projects</option>
            ${projectOptions}
          </select>
        </div>

        <div class="calendar-grid-container">
          <div class="calendar-weekdays">
            ${weekdaysHtml}
          </div>
          <div class="calendar-days-grid">
            ${gridHtml}
          </div>
        </div>
      </div>

      <!-- Right Panel: Tasks List -->
      <div class="calendar-right-panel">
        <div class="right-panel-header">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <h3>Tasks for ${selectedDateLabel}</h3>
            <button class="btn-ghost" data-action="calendar-add-task" data-date="${selectedDateStr}" style="padding: 4px 8px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Task
            </button>
          </div>
          <div class="right-panel-filters">
            ${filterBtnsHtml}
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
            <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">Sort By:</span>
            <select class="right-panel-sort-select" data-cal-sort="type" style="flex: 1;">
              <option value="priority" ${sortType === 'priority' ? 'selected' : ''}>Priority</option>
              <option value="due" ${sortType === 'due' ? 'selected' : ''}>Due Date</option>
            </select>
          </div>
        </div>
        <div class="right-panel-task-list">
          ${taskCardsHtml}
        </div>
      </div>
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
        <button class="icon-btn" data-action="edit-test" data-id="${t.id}" aria-label="Edit" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-test" data-id="${t.id}" aria-label="Delete" title="Delete">
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
  if (!task || task.status === newStatus) return;
  const oldStatus = task.status || 'To-Do';
  task.status = newStatus;
  if (newStatus !== 'Done') {
    task.completedDate = null;
    task.updatedAt = new Date().toISOString();
    logActivity(`Moved task "${task.title}" from ${oldStatus} to ${newStatus}`, 'task');
    await storage.save();
    render();
    showToast(`Task moved to ${newStatus}`);
  } else {
    // Show completion date picker before saving
    const todayIso = new Date().toISOString().split('T')[0];
    document.getElementById('completionTaskId').value = taskId;
    document.getElementById('completionDateInput').value = todayIso;
    // Temporarily store the old/new status for the modal callback
    document.getElementById('completionDateModal').dataset.oldStatus = oldStatus;
    showModal('completionDateModal');
  }
};


const renderTaskCard = (t, q = '') => {
  const projNames = getTaskProjectNames(t);
  const maxVisibleProjTags = 2;
  const visibleProjNames = projNames.slice(0, maxVisibleProjTags);
  const extraProjCount = projNames.length - visibleProjNames.length;
  const alerts = getTaskAlert(t.endDate, t.status);
  const stage = getTaskStage(t);
  const stageClass = `stage-${stage}`;

  return `
    <div class="task-card ${stageClass} ${alerts.card}" data-id="${t.id}" draggable="true">
      <!-- Top header row for Project Tag and Priority Badge -->
      <div class="task-card-header-row">
        <span class="task-project-tags-wrap" ${projNames.length ? `title="${projNames.join(', ')}"` : ''}>
          ${visibleProjNames.map(name => `<span class="task-project-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:10px;height:10px;margin-right:4px;"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>${name}</span>`).join('')}
          ${extraProjCount > 0 ? `<span class="task-project-tag task-project-tag-more">+${extraProjCount}</span>` : ''}
        </span>
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
        ${t.workDone ? `<div class="task-desc task-work-done"><strong>Work done:</strong> ${highlight(formatCardDescription(t.workDone), q)}</div>` : ''}

        ${(t.tags && t.tags.length) ? `
          <div class="task-tags">
            ${t.tags.map(tag => `<span class="tag-pill ${getTagClass(tag)}">${highlight(tag, q)}</span>`).join('')}
          </div>
        ` : ''}

        <!-- Footer metadata rows -->
        <div class="task-meta-footer">
          <div class="task-meta-row">
            ${(t.developerIds && t.developerIds.length) ? `
              <span class="task-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                ${highlight(getTaskDevNames(t).join(', '), q)}
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
        <button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="Edit" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-task" data-id="${t.id}" aria-label="Delete" title="Delete">
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
    task.completedDate = new Date().toISOString();
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
      ${emptyState(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'No activity yet',
    'Start creating projects and tasks — every action will be tracked here.'
  )}
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
// ─── Module Visibility Manager ────────────────────────────
const applyModuleVisibility = () => {
  const hidden = new Set(state.hiddenModules || []);
  document.querySelectorAll('.nav-item').forEach(el => {
    const view = el.dataset.view;
    if (view === 'settings') {
      el.style.display = ''; // Settings is ALWAYS visible
      return;
    }
    if (hidden.has(view)) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });

  // Hide nav-section wrappers if all nav-items inside it are hidden
  document.querySelectorAll('.nav-section').forEach(sec => {
    const items = sec.querySelectorAll('.nav-item');
    const visibleItems = Array.from(items).filter(i => i.style.display !== 'none');
    if (visibleItems.length === 0) {
      sec.style.display = 'none';
    } else {
      sec.style.display = '';
    }
  });
};

// ─── Universal Developer Management UI (Clair Theme) ───
const getProjectStatusPillClass = (proj) => {
  if (!proj) return 'na';

  // 1. Check if the project has statuses assigned to it
  if (Array.isArray(proj.statuses) && proj.statuses.length > 0) {
    const primary = pickPrimaryStatus(proj.statuses) || proj.statuses[0];
    if (primary && STATUS_CLASS[primary]) {
      return STATUS_CLASS[primary];
    }
  }

  // 2. Check if overallProjectStatus is defined
  if (proj.overallProjectStatus) {
    const overallMap = {
      'ON_GOING': 'in-progress',
      'COMPLETED': 'completed',
      'MONITORING': 'stable',
      'ON_HOLD': 'on-hold',
      'YET_TO_START': 'yet-to-start'
    };
    if (overallMap[proj.overallProjectStatus]) {
      return overallMap[proj.overallProjectStatus];
    }
  }

  // 3. Fallback to status palette from project status selection
  const statusPalette = [
    'started',
    'stable',
    'testing',
    'automation',
    'in-progress',
    'completed',
    'new-development',
    'developer',
    'issue-assigned',
    'yet-to-start'
  ];
  let hash = 0;
  const str = (proj ? (proj.id || proj.name) : '') || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return statusPalette[Math.abs(hash) % statusPalette.length];
};

const getProjectPillClass = (projId, name = '') => {
  const proj = (state.projects || []).find(p => p.id === projId || p.name === name) || { id: projId, name };
  return getProjectStatusPillClass(proj);
};

const renderDevelopers = () => {
  const totalDevs = (state.developers || []).length;
  const linkedDevs = (state.developers || []).filter(d => (d.projectIds || []).length > 0).length;
  const unassignedDevs = totalDevs - linkedDevs;

  const query = (state.devSearch || '').toLowerCase().trim();
  const filter = state.devFilter || 'all';

  const filteredDevs = (state.developers || []).filter(d => {
    const assignedProjs = (d.projectIds || []).map(pid => (state.projects || []).find(p => p.id === pid)).filter(Boolean);
    const projNames = assignedProjs.map(p => p.name.toLowerCase()).join(' ');

    const matchesSearch = !query ||
      d.name.toLowerCase().includes(query) ||
      projNames.includes(query);

    let matchesFilter = true;
    if (filter === 'assigned') {
      matchesFilter = assignedProjs.length > 0;
    } else if (filter === 'unassigned') {
      matchesFilter = assignedProjs.length === 0;
    } else if (filter.startsWith('proj:')) {
      const targetProjId = filter.replace('proj:', '');
      matchesFilter = (d.projectIds || []).includes(targetProjId);
    }

    return matchesSearch && matchesFilter;
  });

  const selectedIds = state.devSelectedIds || [];
  const allFilteredIds = filteredDevs.map(d => d.id);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.includes(id));

  // Determine active filter label
  let activeFilterLabel = 'Filters';
  if (filter === 'assigned') activeFilterLabel = 'Assigned';
  else if (filter === 'unassigned') activeFilterLabel = 'Unassigned';
  else if (filter.startsWith('proj:')) {
    const p = (state.projects || []).find(pr => pr.id === filter.replace('proj:', ''));
    if (p) activeFilterLabel = p.name;
  }

  return `
    <div class="dev-mgmt-view">
      <!-- Universal Header matching reference UI & Clair Theme -->
      <div class="dev-mgmt-header">
        <div class="dev-mgmt-heading">
          <h1 class="dev-mgmt-title">All developers</h1>
          <span class="dev-mgmt-count-badge">${totalDevs}</span>
        </div>

        <div class="dev-mgmt-controls">
          <div class="dev-mgmt-search-box">
            <svg class="dev-mgmt-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="devSearchInput" class="dev-mgmt-search-input" placeholder="Search" value="${escapeHtml(state.devSearch || '')}" />
          </div>

          <div class="dev-filter-container">
            <button class="dev-mgmt-filter-btn ${filter !== 'all' ? 'active-filter' : ''}" id="devFilterTriggerBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                <path d="M4 6h16M6 12h12M8 18h8"/>
              </svg>
              <span>${escapeHtml(activeFilterLabel)}</span>
              ${filter !== 'all' ? '<span class="dev-mgmt-filter-dot"></span>' : ''}
            </button>
            <div class="dev-filter-menu" id="devFilterMenu" style="display: none;">
              <div class="dev-filter-opt ${filter === 'all' ? 'selected' : ''}" data-dev-filter="all">
                <span>All developers</span>
                <span style="font-size: 11px; opacity: 0.7;">${totalDevs}</span>
              </div>
              <div class="dev-filter-opt ${filter === 'assigned' ? 'selected' : ''}" data-dev-filter="assigned">
                <span>Assigned</span>
                <span style="font-size: 11px; opacity: 0.7;">${linkedDevs}</span>
              </div>
              <div class="dev-filter-opt ${filter === 'unassigned' ? 'selected' : ''}" data-dev-filter="unassigned">
                <span>Unassigned</span>
                <span style="font-size: 11px; opacity: 0.7;">${unassignedDevs}</span>
              </div>
              ${(state.projects || []).length > 0 ? `
                <div class="dev-filter-divider"></div>
                <div class="dev-filter-section-title">By Project</div>
                ${(state.projects || []).map(p => `
                  <div class="dev-filter-opt ${filter === 'proj:' + p.id ? 'selected' : ''}" data-dev-filter="proj:${p.id}">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;">${escapeHtml(p.name)}</span>
                  </div>
                `).join('')}
              ` : ''}
            </div>
          </div>

          <button class="dev-mgmt-add-btn" id="openAddDevModalBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px;">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add developer
          </button>
        </div>
      </div>

      <!-- Bulk Selection Banner (when 1+ rows selected) -->
      ${selectedIds.length > 0 ? `
        <div class="dev-bulk-banner">
          <span><strong>${selectedIds.length}</strong> developer${selectedIds.length > 1 ? 's' : ''} selected</span>
          <div class="dev-bulk-actions">
            <button class="btn-ghost sm" id="devDeselectAllBtn" style="padding: 5px 12px; font-size: 12px;">Deselect all</button>
            <button class="btn-danger sm" id="devBulkDeleteBtn" style="padding: 5px 12px; font-size: 12px; gap: 5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Delete selected
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Clean Universal Admin Table -->
      <div class="dev-table-card">
        <div class="dev-table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th class="dev-checkbox-cell">
                  <input type="checkbox" class="dev-checkbox" id="devSelectAllCheckbox" ${isAllSelected ? 'checked' : ''} title="Select all" />
                </th>
                <th style="min-width: 220px;">Developer</th>
                <th>Projects</th>
                <th style="width: 140px;">Status</th>
                <th class="dev-actions-cell" style="width: 88px;"></th>
              </tr>
            </thead>
            <tbody>
              ${filteredDevs.map(d => {
    const assignedProjs = (d.projectIds || []).map(pid => (state.projects || []).find(p => p.id === pid)).filter(Boolean);
    const totalAssigned = assignedProjs.length;
    const isSelected = selectedIds.includes(d.id);

    const MAX_VISIBLE = 4;
    const visibleProjs = assignedProjs.slice(0, MAX_VISIBLE);
    const hiddenProjs = assignedProjs.slice(MAX_VISIBLE);
    const hiddenNames = hiddenProjs.map(p => p.name).join(', ');

    const projectPills = visibleProjs.map(proj => {
      const statusClass = getProjectStatusPillClass(proj);
      const statusLabel = (Array.isArray(proj.statuses) && proj.statuses.length > 0)
        ? proj.statuses.join(', ')
        : (proj.overallProjectStatus ? proj.overallProjectStatus.replace(/_/g, ' ') : '');
      const tooltip = statusLabel ? `${proj.name} • ${statusLabel}` : proj.name;

      return `
                    <span class="dev-pill status-pill ${statusClass}" title="${escapeHtml(tooltip)}">
                      ${escapeHtml(proj.name)}
                    </span>
                  `;
    }).join('');

    const morePill = hiddenProjs.length > 0 ? `
                  <span class="dev-pill dev-pill-more" title="${escapeHtml(hiddenNames)}">
                    +${hiddenProjs.length} more
                  </span>
                ` : '';

    const initials = d.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
    const isAssigned = totalAssigned > 0;
    const avatarBg = getAvatarGradient(d.name);

    return `
                  <tr class="${isSelected ? 'row-selected' : ''}" data-dev-id="${d.id}">
                    <td class="dev-checkbox-cell">
                      <input type="checkbox" class="dev-checkbox dev-row-checkbox" data-dev-id="${d.id}" ${isSelected ? 'checked' : ''} />
                    </td>
                    <td>
                      <div class="dev-user-cell" data-action="edit-dev" data-dev-id="${d.id}" style="cursor: pointer;" title="Edit developer">
                        <div class="dev-avatar-circle" style="background: ${avatarBg};">${initials}</div>
                        <span class="dev-user-name">${escapeHtml(d.name)}</span>
                      </div>
                    </td>
                    <td>
                      <div class="dev-pills-wrap">
                        ${projectPills}${morePill}
                        ${totalAssigned === 0 ? '<span class="dev-pill-empty">No projects assigned</span>' : ''}
                      </div>
                    </td>
                    <td>
                      <span class="dev-status-tag">
                        <span class="dev-status-dot ${isAssigned ? 'active' : 'unassigned'}"></span>
                        <span>${isAssigned ? 'Assigned' : 'Unassigned'}</span>
                      </span>
                    </td>
                    <td class="dev-actions-cell">
                      <div class="dev-action-btns-group">
                        <button class="dev-action-dot-btn" data-action="edit-dev" data-dev-id="${d.id}" aria-label="Edit Developer" title="Edit Developer">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 15px; height: 15px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="dev-action-dot-btn danger" data-action="delete-dev" data-dev-id="${d.id}" aria-label="Delete Developer" title="Delete Developer">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 15px; height: 15px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
  }).join('') || `
                <tr>
                  <td colspan="5" style="text-align: center; padding: 48px 16px;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 36px; height: 36px; color: var(--text-muted);"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      <div style="font-size: 14px; font-weight: 600; color: var(--text);">No developers found</div>
                      <div style="font-size: 12.5px; color: var(--text-muted);">Try adjusting your search query or clear the active filter.</div>
                    </div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        
        <!-- Table Footer -->
        <div class="dev-table-footer">
          <span>Showing <strong>${filteredDevs.length}</strong> of <strong>${totalDevs}</strong> developer${totalDevs === 1 ? '' : 's'}</span>
          ${(query || filter !== 'all') ? `
            <button class="btn-ghost sm" id="devClearAllFiltersBtn" style="font-size: 11.5px; padding: 3px 8px;">Clear filters</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

// ─── Restructured Settings Module ─────────────────────────
const AUTO_BACKUP_KEYS = ['autoBackupEnabled', 'autoBackupTime', 'autoBackupStatus', 'autoBackupLastSuccessAt', 'autoBackupLastFile', 'autoBackupLastError', 'autoBackupLastFailedAt'];
const AUTO_BACKUP_DEFAULT_TIME = '18:00'; // must match DEFAULT_BACKUP_TIME in background.js
const autoBackupTimeOf = () => (state.autoBackup && state.autoBackup.autoBackupTime) || AUTO_BACKUP_DEFAULT_TIME;
const fmtBackupTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Automatic Backup block for the Data Portability card. The schedule itself runs in
// background.js; this only shows its status and flips autoBackupEnabled.
const renderAutoBackupSettings = () => {
  const ab = state.autoBackup;
  if (!ab) {
    return `<div class="auto-backup-box"><div class="auto-backup-row"><span>Automatic Backup</span><strong>Available in the installed extension only</strong></div></div>`;
  }
  const enabled = ab.autoBackupEnabled !== false;
  // getManifest() reflects the extension Chrome actually has loaded. Without the
  // alarms permission, an updated page is talking to an old background script that
  // has no scheduler — settings would save but no backup would ever run.
  const schedulerLoaded = (chrome.runtime.getManifest().permissions || []).includes('alarms');
  const at = (iso) => iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : 'Not yet';
  let statusHtml = '<span class="auto-backup-muted">No automatic backup has run yet</span>';
  if (ab.autoBackupStatus === 'success') statusHtml = '<span class="auto-backup-pill ok">Success</span>';
  if (ab.autoBackupStatus === 'failed') {
    statusHtml = `<span class="auto-backup-pill fail">Failed</span><span class="auto-backup-muted">${at(ab.autoBackupLastFailedAt)}</span>`;
  }
  const fileName = (ab.autoBackupLastFile || '').split(/[\\/]/).pop();
  return `
    <div class="auto-backup-box">
      <div class="auto-backup-head">
        <div>
          <div class="auto-backup-title">Automatic Backup</div>
          <div class="auto-backup-muted">Daily JSON backup to Downloads/${escapeHtml(ClairBackup.DIR)}</div>
        </div>
        <label class="switch-toggle" title="${enabled ? 'Disable' : 'Enable'} automatic backups">
          <input type="checkbox" id="autoBackupToggle" ${enabled ? 'checked' : ''} />
          <span class="switch-slider"></span>
        </label>
      </div>
      ${schedulerLoaded ? '' : `<div class="auto-backup-error"><strong>Not active yet.</strong> Clair was updated but Chrome is still running the previous version, so no automatic backup will run. Open <code>chrome://extensions</code> and click Reload on Clair.</div>`}
      <div class="auto-backup-row"><span>Automatic Backup</span><strong>${enabled ? 'Enabled' : 'Disabled'}</strong></div>
      <div class="auto-backup-row"><span>Schedule</span><strong>Daily at ${fmtBackupTime(autoBackupTimeOf())}</strong></div>
      <div class="auto-backup-row auto-backup-time-row">
        <label for="autoBackupTime">Backup Time</label>
        <span class="auto-backup-time-edit">
          <input type="time" id="autoBackupTime" value="${autoBackupTimeOf()}" required />
          <button type="button" class="btn-ghost" id="autoBackupTimeSave">Save</button>
        </span>
      </div>
      <div class="auto-backup-row"><span>Last Successful Backup</span><strong title="${escapeHtml(ab.autoBackupLastFile || '')}">${at(ab.autoBackupLastSuccessAt)}${fileName ? `<em>${escapeHtml(fileName)}</em>` : ''}</strong></div>
      <div class="auto-backup-row"><span>Backup Status</span><strong>${statusHtml}</strong></div>
      ${ab.autoBackupStatus === 'failed' && ab.autoBackupLastError ? `<div class="auto-backup-error">${escapeHtml(ab.autoBackupLastError)}</div>` : ''}
    </div>`;
};

// ─── Jira integration (UI) ───────────────────────────────
// All Jira traffic goes through ClairJira (jira.js). state.jira only ever holds the
// public part of the config (site, email, account name, hasToken) — never the token.
const jiraAvailable = () => typeof ClairJira !== 'undefined' && typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
const jiraConnected = () => !!(state.jira && state.jira.hasToken);
const jiraHost = (site) => { try { return new URL(site).hostname; } catch (e) { return site || ''; } };
const jiraErrorText = (e) => (e && e.name === 'JiraError') ? e.message : 'Something went wrong while contacting Jira. Please try again.';
const jiraEsc = (s) => escapeHtml(s == null ? '' : String(s));

const jiraResultHtml = (r) => r.ok ? `
  <div class="jira-result ok">
    <strong>Connected successfully.</strong>
    <span>Account: ${jiraEsc(r.accountName)}${r.accountEmail && r.accountEmail !== r.accountName ? ` · ${jiraEsc(r.accountEmail)}` : ''}</span>
    <span>Workspace: ${jiraEsc(r.workspace)}</span>
    <span>Projects you can access: ${Number(r.projectCount) || 0}</span>
  </div>` : `
  <div class="jira-result fail"><strong>Connection failed.</strong><span>${jiraEsc(r.message)}</span></div>`;

// The Jira form (status, site, email, token, actions). Settings wraps it in its section.
const renderJiraBox = () => {
  if (!jiraAvailable()) {
    return `<div class="jira-box"><div class="jira-field-hint">Available in the installed extension only.</div></div>`;
  }
  const j = state.jira;
  const status = jiraConnected()
    ? `<span class="jira-status on"><i></i>Connected as ${jiraEsc(j.accountName || j.email)} · ${jiraEsc(jiraHost(j.site))}</span>`
    : `<span class="jira-status off"><i></i>Not connected</span>`;
  return `
    <div class="jira-box">
      <div class="jira-head"><span class="jira-title">Connection</span>${status}</div>
      <div class="form-group">
        <label for="jiraSite">Jira Site URL</label>
        <input type="url" id="jiraSite" placeholder="https://yourcompany.atlassian.net" value="${jiraEsc(j ? j.site : '')}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="form-group">
        <label for="jiraEmail">Atlassian Account Email</label>
        <input type="email" id="jiraEmail" placeholder="you@company.com" value="${jiraEsc(j ? j.email : '')}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="form-group">
        <label for="jiraToken">API Token</label>
        <input type="password" id="jiraToken" autocomplete="new-password" spellcheck="false"
          placeholder="${j && j.hasToken ? '•••••••••••••• saved — leave blank to keep' : 'Paste your API token'}" />
        <a class="jira-help-link" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Create an API token in your Atlassian account ↗</a>
      </div>
      <div class="jira-actions">
        <button type="button" class="btn-primary" id="jiraSaveBtn">Save Configuration</button>
        <button type="button" class="btn-ghost" id="jiraTestBtn" ${jiraConnected() ? '' : 'disabled'}>Test Connection</button>
        ${j ? `<button type="button" class="btn-ghost jira-disconnect" id="jiraDisconnectBtn">Disconnect Jira</button>` : ''}
      </div>
      <div id="jiraResult">${state.jiraResult ? jiraResultHtml(state.jiraResult) : ''}</div>
      <p class="jira-note">Saved only in this browser's extension storage — not encrypted, and never included in exports or backups. You can revoke the token in your Atlassian account at any time.</p>
    </div>`;
};

// Save or Test. On failure only the result box and buttons are updated, so whatever
// the user typed stays in the form; on success the page re-renders and the token
// field comes back empty (the saved token is never put back into the DOM).
const runJiraAction = async (kind) => {
  const val = (id) => (document.getElementById(id) || {}).value || '';
  const box = document.getElementById('jiraResult');
  const btns = ['jiraSaveBtn', 'jiraTestBtn', 'jiraDisconnectBtn'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; });
  if (box) box.innerHTML = `<div class="jira-result pending">${kind === 'save' ? 'Saving and verifying with Jira…' : 'Testing connection…'}</div>`;
  try {
    const r = kind === 'save'
      ? await ClairJira.saveConfig({ site: val('jiraSite'), email: val('jiraEmail'), token: val('jiraToken') })
      : await ClairJira.testConnection();
    state.jira = await ClairJira.getPublicConfig();
    state.jiraResult = { ok: true, ...r };
    if (kind === 'save') showToast('Jira connected');
    render();
  } catch (e) {
    state.jiraResult = null;
    if (box) box.innerHTML = jiraResultHtml({ ok: false, message: jiraErrorText(e) });
    btns.forEach(b => { b.disabled = false; });
    const testBtn = document.getElementById('jiraTestBtn');
    if (testBtn) testBtn.disabled = !jiraConnected();
  }
};

const confirmJiraDisconnect = () => {
  document.getElementById('confirmMessage').textContent =
    'Disconnect Jira? This removes your saved Jira site, email and API token from Clair. Links between Clair projects and Jira projects are kept, so reconnecting restores them.';
  confirmCallback = async () => {
    await ClairJira.disconnect();
    state.jira = null;
    state.jiraResult = null;
    closeModals();
    render();
    showToast('Jira disconnected');
  };
  showModal('confirmModal');
};

// ── Project modal: optional Jira project link ──
let projectJiraSelection = null;  // { site, projectId, projectKey, projectName } or null
let projectJiraPrevious = null;   // restored by "Cancel" while changing
let jiraProjectReq = 0;
let jiraProjectTimer = null;

const renderProjectJiraField = () => {
  const el = document.getElementById('projectJiraField');
  if (!el) return;
  const sel = projectJiraSelection;
  if (sel) {
    el.innerHTML = `
      <div class="jira-linked">
        <span class="jira-key">${jiraEsc(sel.projectKey)}</span>
        <span class="jira-linked-name">${jiraEsc(sel.projectName)}</span>
        <span class="jira-linked-site">${jiraEsc(jiraHost(sel.site))}</span>
        <span class="jira-linked-actions">
          ${jiraConnected() ? `<button type="button" class="btn-ghost jira-mini" data-jira-proj="change">Change</button>` : ''}
          <button type="button" class="btn-ghost jira-mini" data-jira-proj="remove">Remove</button>
        </span>
      </div>`;
  } else if (!jiraAvailable() || !jiraConnected()) {
    el.innerHTML = `<div class="jira-field-hint">Connect Jira in Settings → Integrations to link this project to a Jira project.</div>`;
  } else {
    el.innerHTML = `
      <div class="jira-picker">
        <input type="text" id="jiraProjectSearch" placeholder="Search Jira projects by name or key…" autocomplete="off" spellcheck="false" />
        ${projectJiraPrevious ? `<button type="button" class="btn-ghost jira-mini" data-jira-proj="cancel">Cancel</button>` : ''}
      </div>
      <div class="jira-project-results" id="jiraProjectResults"></div>`;
    loadJiraProjects('');
  }
};

const loadJiraProjects = async (query, startAt = 0) => {
  const box = document.getElementById('jiraProjectResults');
  if (!box) return;
  const req = ++jiraProjectReq;
  const more = box.querySelector('[data-jira-proj="more"]');
  if (startAt === 0) box.innerHTML = `<div class="jira-state">Loading Jira projects…</div>`;
  else if (more) { more.disabled = true; more.textContent = 'Loading…'; }
  try {
    const r = await ClairJira.listProjects({ query, startAt });
    if (req !== jiraProjectReq || !document.getElementById('jiraProjectResults')) return; // stale
    const rows = r.projects.map(p => `
      <button type="button" class="jira-option" data-jira-proj="pick" data-site="${jiraEsc(r.site)}" data-id="${jiraEsc(p.id)}" data-key="${jiraEsc(p.key)}" data-name="${jiraEsc(p.name)}">
        <span class="jira-key">${jiraEsc(p.key)}</span><span>${jiraEsc(p.name)}</span>
      </button>`).join('');
    const moreBtn = r.nextStartAt !== null ? `<button type="button" class="jira-more" data-jira-proj="more" data-start="${r.nextStartAt}">Load more projects</button>` : '';
    if (startAt === 0) {
      box.innerHTML = rows ? rows + moreBtn : `<div class="jira-state">${query ? 'No Jira projects match your search.' : 'Your Jira account cannot see any projects.'}</div>`;
    } else {
      if (more) more.remove();
      box.insertAdjacentHTML('beforeend', rows + moreBtn);
    }
  } catch (e) {
    if (req !== jiraProjectReq) return;
    box.innerHTML = `<div class="jira-state error">${jiraEsc(jiraErrorText(e))} <button type="button" class="jira-more" data-jira-proj="retry">Retry</button></div>`;
  }
};

const wireProjectJiraField = () => {
  const el = document.getElementById('projectJiraField');
  if (!el || el.dataset.wired) return;
  el.dataset.wired = '1';
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'jiraProjectSearch') return;
    clearTimeout(jiraProjectTimer);
    const q = e.target.value;
    jiraProjectTimer = setTimeout(() => loadJiraProjects(q), 300);
  });
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-jira-proj]');
    if (!btn) return;
    const act = btn.dataset.jiraProj;
    const q = () => (document.getElementById('jiraProjectSearch') || {}).value || '';
    if (act === 'pick') {
      projectJiraSelection = { site: btn.dataset.site, projectId: btn.dataset.id, projectKey: btn.dataset.key, projectName: btn.dataset.name };
      projectJiraPrevious = null;
      renderProjectJiraField();
    } else if (act === 'remove') {
      projectJiraSelection = null; projectJiraPrevious = null; renderProjectJiraField();
    } else if (act === 'change') {
      projectJiraPrevious = projectJiraSelection; projectJiraSelection = null; renderProjectJiraField();
      const inp = document.getElementById('jiraProjectSearch'); if (inp) inp.focus();
    } else if (act === 'cancel') {
      projectJiraSelection = projectJiraPrevious; projectJiraPrevious = null; renderProjectJiraField();
    } else if (act === 'more') {
      loadJiraProjects(q(), parseInt(btn.dataset.start, 10) || 0);
    } else if (act === 'retry') {
      loadJiraProjects(q());
    }
  });
};

// ── Release Point modal: import Jira tickets as checklist items ──
let jiraImport = null; // { projectId, site, projectKey, query, issues, nextPageToken, selected: Map, req }
let jiraIssueTimer = null;

// Jira key of a checklist item: imported items carry jiraKey; manually added items
// count too when their ticket is a Jira key or a .../browse/KEY-123 link.
const itemJiraKey = (item) => {
  if (item.jiraKey) return String(item.jiraKey).toUpperCase();
  const t = String(item.ticket || '').trim();
  const m = t.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/i) || t.match(/^([A-Z][A-Z0-9_]*-\d+)$/i);
  return m ? m[1].toUpperCase() : '';
};

// Keys already present in this Clair project's Release Points (the one being
// edited is read from the live editor buffer, not from saved state).
const existingJiraKeysFor = (projectId) => {
  const keys = new Set();
  const editingId = (document.getElementById('releasePtId') || {}).value;
  (state.releasePoints || []).forEach(rp => {
    if (rp.id === editingId) return;
    if (!(rp.projectIds || (rp.projectId ? [rp.projectId] : [])).includes(projectId)) return;
    (rp.checklistItems || []).forEach(i => { const k = itemJiraKey(i); if (k) keys.add(k); });
  });
  rpChecklistItems.forEach(i => { const k = itemJiraKey(i); if (k) keys.add(k); });
  return keys;
};

const rpLinkedJiraProjects = () => {
  const ids = Array.from(document.querySelectorAll('input[name="rpProjectCheck"]:checked')).map(cb => cb.value);
  return state.projects.filter(p => ids.includes(p.id) && p.jira && p.jira.projectKey);
};

const updateJiraImportButton = () => {
  const btn = document.getElementById('jiraImportToggleBtn');
  if (!btn) return;
  const linked = rpLinkedJiraProjects();
  btn.style.display = linked.length ? '' : 'none';
  if (!linked.length || (jiraImport && !linked.some(p => p.id === jiraImport.projectId))) closeJiraImportPanel();
};

const closeJiraImportPanel = () => {
  jiraImport = null;
  const panel = document.getElementById('jiraImportPanel');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
};

const openJiraImportPanel = (projectId) => {
  const panel = document.getElementById('jiraImportPanel');
  const linked = rpLinkedJiraProjects();
  const proj = linked.find(p => p.id === projectId) || linked[0];
  if (!panel || !proj) return;
  document.getElementById('bulkAddPanel').style.display = 'none';
  document.getElementById('bulkAssignPanel').style.display = 'none';
  panel.style.display = 'block';
  const projectChooser = linked.length > 1
    ? `<select id="jiraImportProject" class="jira-import-project">${linked.map(p => `<option value="${p.id}" ${p.id === proj.id ? 'selected' : ''}>${jiraEsc(p.jira.projectKey)} — ${jiraEsc(p.name)}</option>`).join('')}</select>`
    : `<span class="jira-key">${jiraEsc(proj.jira.projectKey)}</span><span class="jira-import-pname">${jiraEsc(proj.jira.projectName)}</span>`;
  const head = `<div class="jira-import-head"><strong>Import from Jira</strong>${projectChooser}<button type="button" class="jira-import-close" data-jira-imp="close" aria-label="Close" title="Close">✕</button></div>`;

  let problem = '';
  if (!jiraConnected()) problem = 'Jira isn’t connected. Connect it in Settings → Integrations, then try again.';
  else if (proj.jira.site !== state.jira.site) problem = `This project is linked to ${jiraHost(proj.jira.site)}, but Clair is connected to ${jiraHost(state.jira.site)}. Connect that site or re-link the project.`;
  if (problem) {
    jiraImport = null;
    panel.innerHTML = head + `<div class="jira-state error">${jiraEsc(problem)}</div>`;
    return;
  }
  jiraImport = { projectId: proj.id, site: proj.jira.site, projectKey: proj.jira.projectKey, query: '', issues: [], nextPageToken: null, selected: new Map(), req: 0, loading: false, error: '' };
  panel.innerHTML = head + `
    <div class="jira-import-search">
      <input type="text" id="jiraIssueSearch" placeholder="Search by key (e.g. ${jiraEsc(proj.jira.projectKey)}-142) or title…" autocomplete="off" spellcheck="false" />
    </div>
    <div class="jira-issue-list" id="jiraIssueList"></div>
    <div class="jira-import-foot">
      <span id="jiraSelCount" class="jira-sel-count">0 selected</span>
      <button type="button" class="btn-accent" id="jiraImportConfirmBtn" data-jira-imp="import" disabled>Add selected</button>
    </div>`;
  loadJiraIssues();
};

const renderJiraIssueList = () => {
  const list = document.getElementById('jiraIssueList');
  if (!list || !jiraImport) return;
  const ji = jiraImport;
  const existing = existingJiraKeysFor(ji.projectId);
  let html = ji.issues.map(i => {
    const dup = existing.has(i.key.toUpperCase());
    return `
      <label class="jira-issue${dup ? ' is-dup' : ''}">
        <input type="checkbox" data-jira-key="${jiraEsc(i.key)}" ${dup ? 'disabled' : ''} ${!dup && ji.selected.has(i.key) ? 'checked' : ''} />
        <span class="jira-issue-key">${jiraEsc(i.key)}</span>
        <span class="jira-issue-sum">${jiraEsc(i.summary)}</span>
        <span class="jira-issue-asg">${i.assignee ? jiraEsc(i.assignee) : '<em>Unassigned</em>'}</span>
        ${dup ? '<span class="jira-dup">Already added</span>' : ''}
      </label>`;
  }).join('');
  if (ji.loading) html += `<div class="jira-state">Loading tickets…</div>`;
  else if (ji.error) html += `<div class="jira-state error">${jiraEsc(ji.error)} <button type="button" class="jira-more" data-jira-imp="retry">Retry</button></div>`;
  else if (!ji.issues.length) html = `<div class="jira-state">${ji.query ? 'No tickets match your search.' : `No tickets in ${jiraEsc(ji.projectKey)} yet.`}</div>`;
  else if (ji.nextPageToken) html += `<button type="button" class="jira-more" data-jira-imp="more">Load more tickets</button>`;
  list.innerHTML = html;
  const n = ji.selected.size;
  document.getElementById('jiraSelCount').textContent = `${n} selected`;
  const btn = document.getElementById('jiraImportConfirmBtn');
  btn.disabled = n === 0;
  btn.textContent = n ? `Add ${n} ticket${n === 1 ? '' : 's'}` : 'Add selected';
};

const loadJiraIssues = async (append = false) => {
  const ji = jiraImport;
  if (!ji) return;
  const req = ++ji.req;
  ji.loading = true; ji.error = '';
  if (!append) { ji.issues = []; ji.nextPageToken = null; }
  renderJiraIssueList();
  try {
    const r = await ClairJira.searchIssues({ projectKey: ji.projectKey, text: ji.query, nextPageToken: append ? ji.nextPageToken : '' });
    if (jiraImport !== ji || req !== ji.req) return; // panel closed or a newer search started
    const seen = new Set(ji.issues.map(i => i.key));
    ji.issues = ji.issues.concat(r.issues.filter(i => !seen.has(i.key)));
    ji.nextPageToken = r.nextPageToken;
  } catch (e) {
    if (jiraImport !== ji || req !== ji.req) return;
    ji.error = jiraErrorText(e);
  }
  ji.loading = false;
  renderJiraIssueList();
};

const importSelectedJiraIssues = () => {
  const ji = jiraImport;
  if (!ji || !ji.selected.size) return;
  syncChecklistItemsFromDOM();
  const existing = existingJiraKeysFor(ji.projectId);
  let added = 0;
  const skipped = [];
  ji.selected.forEach(issue => {
    const key = issue.key.toUpperCase();
    if (existing.has(key)) { skipped.push(issue.key); return; }
    // Link to a Clair developer only on an exact (case-insensitive) name match.
    const dev = issue.assignee ? state.developers.find(d => (d.name || '').trim().toLowerCase() === issue.assignee.trim().toLowerCase()) : null;
    rpChecklistItems.push({
      id: uid(), text: issue.summary, ticket: issue.url, developerId: dev ? dev.id : '', done: false,
      jiraKey: issue.key, jiraIssueId: issue.id, jiraAssignee: issue.assignee || ''
    });
    existing.add(key);
    added++;
  });
  closeJiraImportPanel();
  renderChecklistEditor();
  const parts = [];
  if (added) parts.push(`Added ${added} Jira ticket${added === 1 ? '' : 's'} — click Save Release Point to keep them`);
  if (skipped.length) parts.push(`${skipped.length} already in this project's release points (${skipped.join(', ')}), skipped`);
  showToast(parts.join(' · ') || 'Nothing to add', added ? 'success' : 'error');
};

const wireJiraImportPanel = () => {
  const panel = document.getElementById('jiraImportPanel');
  if (!panel || panel.dataset.wired) return;
  panel.dataset.wired = '1';
  panel.addEventListener('input', (e) => {
    if (e.target.id !== 'jiraIssueSearch' || !jiraImport) return;
    clearTimeout(jiraIssueTimer);
    const q = e.target.value;
    jiraIssueTimer = setTimeout(() => { if (jiraImport) { jiraImport.query = q.trim(); loadJiraIssues(false); } }, 350);
  });
  panel.addEventListener('change', (e) => {
    if (e.target.id === 'jiraImportProject') { openJiraImportPanel(e.target.value); return; }
    const key = e.target.dataset && e.target.dataset.jiraKey;
    if (!key || !jiraImport) return;
    const issue = jiraImport.issues.find(i => i.key === key);
    if (e.target.checked && issue) jiraImport.selected.set(key, issue); else jiraImport.selected.delete(key);
    renderJiraIssueList();
  });
  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-jira-imp]');
    if (!btn) return;
    const act = btn.dataset.jiraImp;
    if (act === 'close') closeJiraImportPanel();
    else if (act === 'more') loadJiraIssues(true);
    else if (act === 'retry') loadJiraIssues(false);
    else if (act === 'import') importSelectedJiraIssues();
  });
};

// Settings: section menu on the left, one section at a time on the right
// (state.settingsSection). Every control keeps its original id / data-action, so the
// existing handlers (theme, default view, module toggles, export/import/report,
// automatic backup, Jira, clear database) work unchanged.
const SETTINGS_SECTIONS = [
  { key: 'general', label: 'General', desc: 'Theme & startup', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' },
  { key: 'modules', label: 'Modules', desc: 'Sidebar navigation', icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
  { key: 'data', label: 'Data & Backups', desc: 'Export, import, auto-backup', icon: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>' },
  { key: 'integrations', label: 'Integrations', desc: 'Jira Cloud', icon: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>' },
  { key: 'danger', label: 'Danger Zone', desc: 'Clear all data', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/>', danger: true }
];

const stIcon = (paths, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ${extra}>${paths}</svg>`;
const stSection = (title, desc, body, extraHead = '') => `
  <section class="st-section">
    <div class="st-section-head">
      <div><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
      ${extraHead}
    </div>
    ${body}
  </section>`;
const stRow = (label, desc, control, cls = '') => `
  <div class="st-row ${cls}">
    <div class="st-row-text"><span class="st-row-label">${label}</span>${desc ? `<span class="st-row-desc">${desc}</span>` : ''}</div>
    <div class="st-row-control">${control}</div>
  </div>`;

const renderSettings = () => {
  const dbSizeKb = ((JSON.stringify(state, (k, v) => v instanceof Set ? [...v] : v).length) / 1024).toFixed(1);
  const hiddenSet = new Set(state.hiddenModules || []);
  const section = SETTINGS_SECTIONS.some(s => s.key === state.settingsSection) ? state.settingsSection : 'general';

  const MODULE_LIST = [
    { key: 'dashboard', label: 'Dashboard', desc: 'Main overview & project metrics', icon: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>` },
    { key: 'projects', label: 'Projects', desc: 'Project list & Kanban board', icon: `<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>` },
    { key: 'tasks', label: 'Tasks', desc: 'Task tracking & assignments', icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18"/>` },
    { key: 'notes', label: 'Notes', desc: 'Markdown note workspace', icon: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>` },
    { key: 'calendar', label: 'Calendar', desc: 'Deadline & release calendar', icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>` },
    { key: 'tests', label: 'Project Insights', desc: 'Analytics & test execution stats', icon: `<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>` },
    { key: 'testcases', label: 'Test Case Management', desc: 'Test scenarios & execution', icon: `<path d="M9 3v7.2a4 4 0 01-1.3 2.9l-3.4 3.1A2 2 0 005.7 20h12.6a2 2 0 001.4-3.8l-3.4-3.1A4 4 0 0115 10.2V3"/>` },
    { key: 'releases', label: 'Release Management', desc: 'Release versions & changelogs', icon: `<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/>` },
    { key: 'releasepoints', label: 'Release Points', desc: 'Detailed release checklist items', icon: `<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>` },
    { key: 'jira', label: 'Jira', desc: 'Jira tickets of linked projects', icon: `<path d="M12 2L2 12l10 10 10-10L12 2z"/><path d="M12 8l-4 4 4 4 4-4-4-4z"/>` },
    { key: 'developers', label: 'Developers', desc: 'Developer project mapping', icon: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/>` },
    { key: 'activity', label: 'Activity', desc: 'System activity & change logs', icon: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>` },
    { key: 'settings', label: 'Settings', desc: 'System preferences & database', locked: true, icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>` }
  ];

  const nav = `
    <nav class="st-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
      ${SETTINGS_SECTIONS.map(s => `
        <button type="button" role="tab" id="st-tab-${s.key}" class="st-nav-item ${s.key === section ? 'active' : ''} ${s.danger ? 'danger' : ''}"
          data-action="settings-section" data-section="${s.key}" aria-selected="${s.key === section}" aria-controls="st-panel" tabindex="${s.key === section ? '0' : '-1'}">
          <span class="st-nav-icon">${stIcon(s.icon)}</span>
          <span class="st-nav-text"><span class="st-nav-label">${s.label}</span><span class="st-nav-desc">${s.desc}</span></span>
        </button>`).join('')}
    </nav>`;

  let body = '';
  if (section === 'general') {
    const themes = [
      { key: 'system', label: 'System', desc: 'Follow your OS' },
      { key: 'light', label: 'Light', desc: 'Bright & crisp' },
      { key: 'dark', label: 'Dark', desc: 'Easy on the eyes' }
    ];
    const views = [['dashboard', 'Dashboard'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['notes', 'Notes'], ['calendar', 'Calendar'], ['tests', 'Project Insights'], ['testcases', 'Test Case Management'], ['releases', 'Release Management'], ['releasepoints', 'Release Points'], ['jira', 'Jira'], ['developers', 'Developer Management'], ['activity', 'Activity']];
    body = stSection('Appearance', 'Choose how Clair looks. System follows your operating system’s light/dark setting.', `
      <div class="st-themes" id="themeToggle" role="radiogroup" aria-label="Theme">
        ${themes.map(t => `
          <button type="button" class="type-btn st-theme ${state.theme === t.key ? 'active' : ''}" data-theme-choice="${t.key}" role="radio" aria-checked="${state.theme === t.key}">
            ${(() => {
              const mock = (k) => `<span class="st-theme-preview ${k}"><span class="p-side"></span><span class="p-main"><span class="p-bar"></span><span class="p-card"></span><span class="p-card short"></span></span></span>`;
              // System = the light and dark previews split along one diagonal.
              return t.key === 'system'
                ? `<span class="st-theme-split" aria-hidden="true">${mock('light')}${mock('dark')}</span>`
                : `<span aria-hidden="true">${mock(t.key)}</span>`;
            })()}
            <span class="st-theme-label">${t.label}<em>${t.desc}</em></span>
            <span class="st-theme-check" aria-hidden="true">${stIcon('<path d="M20 6L9 17l-5-5"/>', 'stroke-width="3"')}</span>
          </button>`).join('')}
      </div>`) +
      stSection('Startup', '', stRow('Default startup module', 'The page Clair opens on.', `
        <select id="defaultViewSelect" class="form-select st-select">
          ${views.map(([v, l]) => `<option value="${v}" ${state.defaultView === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>`));
  } else if (section === 'modules') {
    const visible = MODULE_LIST.length - hiddenSet.size;
    body = stSection('Sidebar modules', 'Show or hide modules in the sidebar. Hidden modules keep their data. Settings can’t be hidden.', `
      <div class="st-list st-module-list">
        ${MODULE_LIST.map(mod => {
          const isVisible = !hiddenSet.has(mod.key);
          return `
            <div class="st-row st-module ${mod.locked ? 'locked' : ''} ${isVisible ? '' : 'off'}">
              <span class="st-module-icon">${stIcon(mod.icon)}</span>
              <div class="st-row-text"><span class="st-row-label">${escapeHtml(mod.label)}</span><span class="st-row-desc">${escapeHtml(mod.desc)}</span></div>
              <div class="st-row-control">
                ${mod.locked ? `<span class="st-badge">${stIcon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>')}Always on</span>` : `
                  <label class="switch-toggle" title="${isVisible ? 'Hide' : 'Show'} ${escapeHtml(mod.label)}">
                    <input type="checkbox" data-action="toggle-module-visibility" data-module="${mod.key}" ${isVisible ? 'checked' : ''} aria-label="Show ${escapeHtml(mod.label)} in the sidebar" />
                    <span class="switch-slider"></span>
                  </label>`}
              </div>
            </div>`;
        }).join('')}
      </div>`, `<span class="st-pill">${visible} of ${MODULE_LIST.length} visible</span>`);
  } else if (section === 'data') {
    const stat = (n, l) => `<div class="st-stat"><strong>${n}</strong><span>${l}</span></div>`;
    body = stSection('Backup & restore', 'Backups are JSON files in Downloads/Extensions/project-extension/Backup.', `
      <div class="st-list">
        ${stRow('Export backup', 'Download everything in Clair as one JSON file.', `<button type="button" class="btn-ghost st-btn" id="settingsExportBtn">${stIcon('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')}Export JSON</button>`)}
        ${stRow('Import backup', 'Restore from a backup file. This replaces the current data.', `<button type="button" class="btn-ghost st-btn" id="settingsImportBtn">${stIcon('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>')}Import JSON</button>`)}
        ${stRow('Excel report', 'A formatted workbook of projects, tasks, releases and test cases.', `<button type="button" class="btn-ghost st-btn" id="openExportReportBtn">${stIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>')}Export report</button>`)}
      </div>`) +
      stSection('Automatic backup', 'A daily JSON backup, made in the background — Clair doesn’t need to be open.', renderAutoBackupSettings()) +
      stSection('Storage', 'Clair keeps everything locally in this browser (SQLite in IndexedDB).', `
        <div class="st-stats">
          ${stat((state.projects || []).length, 'Projects')}
          ${stat((state.tasks || []).length, 'Tasks')}
          ${stat((state.releasePoints || []).length, 'Release points')}
          ${stat((state.testCases || []).length, 'Test cases')}
          ${stat((state.developers || []).length, 'Developers')}
          ${stat(`${dbSizeKb} KB`, 'Data size')}
        </div>`);
  } else if (section === 'integrations') {
    body = stSection('Jira Cloud', 'Connect your own Jira account to import tickets into Release Points. Link Clair projects to Jira projects from the project form.', renderJiraBox(),
      `<span class="st-brand">${stIcon('<path d="M12 2L2 12l10 10 10-10L12 2z"/><path d="M12 8l-4 4 4 4 4-4-4-4z"/>')}</span>`);
  } else {
    body = stSection('Danger zone', '', `
      <div class="st-list st-danger-list">
        ${stRow('Clear database', 'Permanently delete every project, task, release and test case in Clair. A backup file is exported first.', `<button type="button" class="btn-danger st-btn" id="clearDataBtn">${stIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>')}Clear database</button>`)}
      </div>`);
  }

  const current = SETTINGS_SECTIONS.find(s => s.key === section);
  return `
    <div class="st-page">
      <div class="st-header">
        <h2>Settings</h2>
        <p>Preferences, data and integrations for Clair on this browser.</p>
      </div>
      <div class="st-layout">
        ${nav}
        <div class="st-panel" id="st-panel" role="tabpanel" aria-labelledby="st-tab-${section}">
          <div class="st-panel-title">${stIcon(current.icon)}<span>${current.label}</span></div>
          ${body}
        </div>
      </div>
    </div>`;
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
  state.noteFolders = [];
  state.jiraSync = [];
  state.jiraPending = [];
  state.notes = [];
  state.activeNoteProjectId = null;
  state.activeNoteFolderId = null;
  state.activeNoteId = null;
  state.noteSearchQuery = '';
  state.filters = { status: '', previousVersion: '', upcomingVersion: '', dateFrom: '', dateTo: '', taskProject: '' };
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
  await ClairDB.setPref('db_initialized', 'true');

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

  // Task Modal Search & Project-based Developer Filtering
  const projectSearch = document.getElementById('taskProjectSearch');
  if (projectSearch) {
    projectSearch.addEventListener('input', (e) => {
      filterChecklist('taskProjectChecklist', e.target.value);
    });
  }

  const devSearch = document.getElementById('taskDevSearch');
  if (devSearch) {
    devSearch.addEventListener('input', (e) => {
      filterChecklist('taskDevChecklist', e.target.value);
    });
  }

  const projectChecklist = document.getElementById('taskProjectChecklist');
  if (projectChecklist) {
    projectChecklist.addEventListener('change', (e) => {
      if (e.target.name === 'taskProjectCheck') {
        const checkedDevIds = Array.from(document.querySelectorAll('input[name="taskDevCheck"]:checked')).map(cb => cb.value);
        loadTaskDevChecklist(checkedDevIds);
        // Re-apply dev search query if any exists
        const query = document.getElementById('taskDevSearch')?.value || '';
        filterChecklist('taskDevChecklist', query);
      }
    });
  }


  // Click delegation
  content.addEventListener('click', async e => {
    const toggleBtn = e.target.closest('.view-toggle-btn[data-view-mode]');
    if (toggleBtn) {
      const mode = toggleBtn.dataset.viewMode;
      state.projectsViewMode = mode;
      await ClairDB.setPref('projects_view_mode', mode);
      render();
      return;
    }

    const themeBtn = e.target.closest('#themeToggle .type-btn');
    if (themeBtn) {
      await setTheme(themeBtn.dataset.themeChoice);
      return;
    }

    if (e.target.closest('#openAddDevModalBtn')) {
      openDevModal();
      return;
    }

    const devFilterBtn = e.target.closest('#devFilterTriggerBtn');
    if (devFilterBtn) {
      const menu = document.getElementById('devFilterMenu');
      if (menu) menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
      return;
    }

    const devFilterOpt = e.target.closest('[data-dev-filter]');
    if (devFilterOpt) {
      state.devFilter = devFilterOpt.dataset.devFilter;
      const menu = document.getElementById('devFilterMenu');
      if (menu) menu.style.display = 'none';
      render();
      return;
    }

    if (e.target.closest('#devDeselectAllBtn')) {
      state.devSelectedIds = [];
      render();
      return;
    }

    if (e.target.closest('#devBulkDeleteBtn')) {
      confirmBulkDeleteDevelopers();
      return;
    }

    if (e.target.closest('#devClearAllFiltersBtn')) {
      state.devSearch = '';
      state.devFilter = 'all';
      render();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (btn) {
      const { action, id } = btn.dataset;
      const card = btn.closest('[data-id]');
      const cardId = id || (card ? card.dataset.id : null);

      if (action === 'new-project') openProjectModal();
      else if (action === 'new-release-pt') openReleasePtModal();
      else if (action === 'open-release-pt') openReleasePointOnPage(cardId);
      else if (action === 'rpa-toggle') toggleRpAccordion(cardId);
      else if (action === 'jira-view') { state.jiraProjectId = cardId; state.jiraMappingOpen = false; state.jiraIssueOpen = null; jiraResetFilters(); render(); document.getElementById('mainContent').scrollTop = 0; }
      else if (action === 'jira-home') { state.jiraProjectId = null; state.jiraMappingOpen = false; render(); }
      else if (action === 'jira-refresh') syncJiraProject(cardId);
      else if (action === 'jira-refresh-all') {
        // One project at a time: gentler on Jira's rate limits than firing them all at once.
        (async () => { for (const p of jiraLinkedProjects()) await syncJiraProject(p.id); })();
      }
      else if (action === 'jira-open-mapping') {
        if (state.jiraProjectId !== cardId) { state.jiraProjectId = cardId; jiraResetFilters(); }
        state.jiraMappingOpen = true; render();
        const m = document.getElementById('jiraMapping'); if (m) m.scrollIntoView({ block: 'start' });
      }
      else if (action === 'jira-map-reset') {
        const rec = (state.jiraSync || []).find(x => x.id === state.jiraProjectId);
        if (rec) { rec.statusMap = {}; storage.save(); showToast('Status mapping reset to Automatic'); render(); }
      }
      else if (action === 'jira-issue') {
        const id = btn.dataset.issue;
        state.jiraIssueOpen = state.jiraIssueOpen === id ? null : id;
        render();
        const rec = (state.jiraSync || []).find(r => r.id === state.jiraProjectId);
        const iss = state.jiraIssueOpen && rec && rec.issues.find(x => x.id === id);
        if (iss && jiraConnected()) jiraLoadTicket(iss.key);
      }
      else if (action === 'jira-queue-comment') {
        const rec = (state.jiraSync || []).find(r => r.id === state.jiraProjectId);
        const iss = rec && rec.issues.find(x => x.id === btn.dataset.issue);
        const d = iss && jiraTicketData[iss.key];
        if (d && (d.draft || '').trim()) {
          jiraEnsurePending(rec.id, iss).comments.push({ id: uid(), text: d.draft, attemptedAt: '' });
          d.draft = '';
          storage.save(); render();
        }
      }
      else if (action === 'jira-drop-comment') {
        const pd = jiraPendingFor(btn.dataset.issue);
        if (pd && !jiraIssueSyncing.has(pd.id)) { pd.comments = pd.comments.filter(c => c.id !== btn.dataset.cid); jiraPruneEmptyPending(); storage.save(); render(); }
      }
      else if (action === 'jira-sync-issue') jiraSyncIssue(btn.dataset.issue);
      else if (action === 'jira-close-mapping') { state.jiraMappingOpen = false; render(); }
      else if (action === 'jira-cat') { state.jiraFilters.cat = btn.dataset.cat; state.jiraFilters.page = 1; render(); }
      else if (action === 'jira-clear-filters') { jiraResetFilters(); render(); }
      else if (action === 'jira-page') { state.jiraFilters.page += Number(btn.dataset.dir); render(); }
      else if (action === 'jira-go-settings') { state.settingsSection = 'integrations'; setView('settings'); }
      else if (action === 'settings-section') {
        state.settingsSection = btn.dataset.section;
        render();
        const tab = document.getElementById(`st-tab-${state.settingsSection}`);
        if (tab) tab.focus();
      }
      else if (action === 'rpa-expand-all' || action === 'rpa-collapse-all') {
        const open = action === 'rpa-expand-all';
        document.querySelectorAll('.rpa-item').forEach(el => toggleRpAccordion(el.dataset.id, open));
      }
      else if (action === 'rp-project-chip') {
        const pid = btn.dataset.pid || '';
        state.releasePtFilters.project = state.releasePtFilters.project === pid ? '' : pid;
        render();
      }
      else if (action === 'open-tc-project' || action === 'tc-open-project') tcGo(cardId, 'overview');
      else if (action === 'tc-home') tcGo(null);
      else if (action === 'tc-overview') tcGo(state.activeTestCaseProjectId, 'overview');
      else if (action === 'tc-open-scenarios') tcGo(state.activeTestCaseProjectId, 'scenarios', null);
      else if (action === 'tc-open-module') tcGo(state.activeTestCaseProjectId, 'scenarios', cardId === 'none' ? '__none__' : cardId);
      else if (action === 'tc-open-failures') {
        state.testCaseFilters = { status: 'Failed', priority: '', type: '' };
        state.testCaseSearch = '';
        tcGo(state.activeTestCaseProjectId, 'scenarios', null);
      }
      else if (action === 'tc-add-case') openTestCaseModal();
      else if (action === 'view-testcase') openDetailModal('testcase', cardId);
      else if (action === 'tc-status-chip') {
        state.testCaseFilters.status = btn.dataset.status || '';
        state.testCasePage = 1;
        render();
      }
      else if (action === 'tc-row-toggle') {
        // In selection mode the scenario title selects the row, like the rest of the row.
        const set = state.testCaseSelectionMode
          ? (state.selectedTestCaseIds = state.selectedTestCaseIds || new Set())
          : (state.tcExpanded = state.tcExpanded || new Set());
        if (set.has(cardId)) set.delete(cardId); else set.add(cardId);
        render();
      }
      else if (action === 'open-project-overview') openProjectOverview(cardId);
      else if (action === 'close-project-overview') closeProjectOverview();
      else if (action === 'po-task-filter') { state.overviewTaskFilter = btn.dataset.filter; render(); }
      else if (action === 'view-task') openDetailModal('task', cardId);
      else if (action === 'view-release') openDetailModal('release', cardId);
      else if (action === 'edit-project') openProjectModal(cardId);
      else if (action === 'delete-project') confirmDeleteProject(cardId);
      else if (action === 'clear-release-history') confirmClearReleaseHistory(cardId);
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
      else if (action === 'released-month-prev') {
        let { year, month } = state.releasedMonth || { year: new Date().getFullYear(), month: new Date().getMonth() };
        month--; if (month < 0) { month = 11; year--; }
        state.releasedMonth = { year, month };
        render();
      }
      else if (action === 'released-month-next') {
        let { year, month } = state.releasedMonth || { year: new Date().getFullYear(), month: new Date().getMonth() };
        const n = new Date();
        if (year === n.getFullYear() && month >= n.getMonth()) return;
        month++; if (month > 11) { month = 0; year++; }
        state.releasedMonth = { year, month };
        render();
      }
      else if (action === 'chart-month-prev') {
        let { year, month } = state.chartMonth || { year: new Date().getFullYear(), month: new Date().getMonth() - 1 };
        month--; if (month < 0) { month = 11; year--; }
        state.chartMonth = { year, month };
        render();
      }
      else if (action === 'chart-month-next') {
        let { year, month } = state.chartMonth || { year: new Date().getFullYear(), month: new Date().getMonth() };
        const n = new Date();
        if (year === n.getFullYear() && month >= n.getMonth()) return;
        month++; if (month > 11) { month = 0; year++; }
        state.chartMonth = { year, month };
        render();
      }
      else if (action === 'calendar-prev') {
        let { year, month } = state.calendarMonth || { year: new Date().getFullYear(), month: new Date().getMonth() };
        month--; if (month < 0) { month = 11; year--; }
        state.calendarMonth = { year, month };
        render();
      }
      else if (action === 'calendar-next') {
        let { year, month } = state.calendarMonth || { year: new Date().getFullYear(), month: new Date().getMonth() };
        month++; if (month > 11) { month = 0; year++; }
        state.calendarMonth = { year, month };
        render();
      }
      else if (action === 'select-calendar-date') {
        state.selectedCalendarDate = btn.dataset.date;
        render();
      }
      else if (action === 'calendar-right-filter') {
        state.calendarRightPanelFilter = btn.dataset.filter;
        render();
      }
      else if (action === 'calendar-add-task') {
        openTaskModal(null, btn.dataset.date);
      }
      else if (action === 'edit-release-pt') openReleasePtModal(cardId);
      else if (action === 'delete-release-pt') confirmDeleteReleasePt(cardId);
      else if (action === 'toggle-checklist-item') {
        if (e.target.closest('.rp-item-ticket') || e.target.closest('.rp-item-dev') || e.target.closest('.rp-item-edit-btn') || e.target.closest('.editing')) {
          return;
        }
        const rpId = btn.dataset.rpId;
        const itemId = btn.dataset.itemId;
        toggleReleasePtChecklistItem(rpId, itemId);
      }
      else if (action === 'edit-checklist-item-inline') {
        const rpId = btn.dataset.rpId;
        const itemId = btn.dataset.itemId;
        state.inlineEditing = { rpId, itemId };
        render();
      }
      else if (action === 'cancel-checklist-item-inline') {
        state.inlineEditing = null;
        render();
      }
      else if (action === 'save-checklist-item-inline') {
        const rpId = btn.dataset.rpId;
        const itemId = btn.dataset.itemId;
        const parent = btn.closest('.rp-checklist-item.editing');
        if (parent) {
          const textVal = parent.querySelector('.rp-inline-edit-text').value;
          const ticketVal = parent.querySelector('.rp-inline-edit-ticket').value;
          const devVal = parent.querySelector('.rp-inline-edit-dev').value;

          const rp = (state.releasePoints || []).find(r => r.id === rpId);
          if (rp) {
            const item = (rp.checklistItems || []).find(i => i.id === itemId);
            if (item) {
              item.text = textVal;
              item.ticket = ticketVal;
              item.developerId = devVal;
              rp.updatedAt = new Date().toISOString();
              await storage.save();
              showToast('Checklist item updated!');
            }
          }
        }
        state.inlineEditing = null;
        render();
      }
      else if (action === 'release-platform') {
        const projectId = btn.dataset.projectId;
        const platform = btn.dataset.platform;
        openReleaseVersionModal(projectId, platform);
      }
      else if (action === 'remove-checklist-row') {
        // Save current values
        syncChecklistItemsFromDOM();
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

    // Test Case project dropdown: toggle open/closed (no re-render needed)
    const tcProjectTrigger = e.target.closest('#tcProjectDropdownTrigger');
    if (tcProjectTrigger) {
      document.getElementById('tcProjectDropdown').classList.toggle('open');
      return;
    }

    // Test Case project dropdown / project overview card: select a project (or "All Projects")
    const tcProjectOption = e.target.closest('[data-tc-project-select]');
    if (tcProjectOption) {
      const pid = tcProjectOption.dataset.tcProjectSelect;
      state.activeTestCaseProjectId = pid || null;
      state.activeTestCaseModuleId = null;
      if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
      state.testCaseSelectionMode = false;
      state.testCasePage = 1;
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
      state.testCasePage = 1;
      if (content) content.scrollTop = 0;
      render();
      return;
    }

    // Test Case pagination controls
    const tcPrevPageBtn = e.target.closest('#tcPrevPageBtn');
    if (tcPrevPageBtn) {
      if (state.testCasePage > 1) { state.testCasePage -= 1; render(); }
      return;
    }
    const tcNextPageBtn = e.target.closest('#tcNextPageBtn');
    if (tcNextPageBtn) {
      state.testCasePage += 1;
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
    // Test scenarios table: clicking a row (not one of its controls) selects it in
    // selection mode, otherwise expands/collapses its details.
    const tcsRow = e.target.closest('.tcs-row');
    if (tcsRow && !e.target.closest('input, select, textarea, button, a, label')) {
      const tid = tcsRow.dataset.id;
      if (state.testCaseSelectionMode) {
        if (!state.selectedTestCaseIds) state.selectedTestCaseIds = new Set();
        if (state.selectedTestCaseIds.has(tid)) state.selectedTestCaseIds.delete(tid); else state.selectedTestCaseIds.add(tid);
      } else {
        if (!state.tcExpanded) state.tcExpanded = new Set();
        if (state.tcExpanded.has(tid)) state.tcExpanded.delete(tid); else state.tcExpanded.add(tid);
      }
      render();
      return;
    }

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
      if (clearBtn.id === 'clearProjectsFilters') {
        state.projectSearch = '';
        clearFilters();
      } else if (clearBtn.id === 'clearTestFilters') {
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
        state.testCasePage = 1;
        if (content) content.scrollTop = 0;
        render();
      } else {
        clearFilters();
      }
    }

    // Clear inline search buttons
    const clearProjectSearch = e.target.closest('#clearProjectSearch');
    if (clearProjectSearch) { state.projectSearch = ''; render(); return; }

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
      state.testCasePage = 1;
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

    if (e.target.closest('#jiraSaveBtn')) { runJiraAction('save'); return; }
    if (e.target.closest('#jiraTestBtn')) { runJiraAction('test'); return; }
    if (e.target.closest('#jiraDisconnectBtn')) { confirmJiraDisconnect(); return; }

    if (e.target.closest('#autoBackupTimeSave')) {
      // Saved only on click: a time input passes through partial values (e.g. 01:00
      // while typing 16:00), and each saved value can trigger a catch-up backup.
      const value = document.getElementById('autoBackupTime').value;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { showToast('Enter a valid backup time', 'error'); return; }
      if (value === autoBackupTimeOf()) { showToast(`Backup time is already ${fmtBackupTime(value)}`); return; }
      try {
        await chrome.storage.local.set({ autoBackupTime: value }); // background.js reschedules the alarm
        showToast(`Automatic backup time set to ${fmtBackupTime(value)} daily`);
      } catch (err) {
        showToast('Could not save the backup time', 'error');
      }
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

    const openExportReportBtn = e.target.closest('#openExportReportBtn');
    if (openExportReportBtn) {
      openExportReportModal();
      return;
    }
  });

  // Change delegation (filters)
  let dateFilterTimer;
  content.addEventListener('change', e => {
    if (e.target.id === 'autoBackupToggle') {
      // background.js reacts to this key (creates/clears the alarm); the UI refreshes via storage.onChanged.
      const on = e.target.checked;
      chrome.storage.local.set({ autoBackupEnabled: on })
        .then(() => showToast(on ? `Automatic backup enabled (daily at ${fmtBackupTime(autoBackupTimeOf())})` : 'Automatic backup disabled'))
        .catch(() => { e.target.checked = !on; showToast('Could not change the automatic backup setting', 'error'); });
      return;
    }
    const calSortSelect = e.target.closest('[data-cal-sort]');
    if (calSortSelect) {
      state.calendarRightPanelSort = calSortSelect.value;
      render();
    }
    const calSelect = e.target.closest('[data-calfilter]');
    if (calSelect) {
      state.calendarFilters[calSelect.dataset.calfilter] = calSelect.value;
      render();
    }
    // Task date-range filters. Browsers fire "change" on a type="date" input
    // once EVERY keystroke of the year segment (each digit produces a new
    // zero-padded-but-technically-complete value: 2 -> 0002, 0 -> 0020, 2 ->
    // 0202, 6 -> 2026), not just once at the end. Re-rendering (which
    // recreates the input) on each of those resets which segment is
    // highlighted back to the first one, kicking the user back to editing
    // the day. Debouncing so we only react once typing actually pauses
    // avoids re-rendering out from under an in-progress edit.
    const dateFromInput = e.target.closest('#filterDateFrom');
    if (dateFromInput) {
      clearTimeout(dateFilterTimer);
      dateFilterTimer = setTimeout(() => {
        state.filters.dateFrom = dateFromInput.value;
        rerenderPreservingFocus(dateFromInput);
      }, 600);
      return;
    }
    const dateToInput = e.target.closest('#filterDateTo');
    if (dateToInput) {
      clearTimeout(dateFilterTimer);
      dateFilterTimer = setTimeout(() => {
        state.filters.dateTo = dateToInput.value;
        rerenderPreservingFocus(dateToInput);
      }, 600);
      return;
    }
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
    if (e.target.id === 'tcHomeSort') { state.tcHomeSort = e.target.value; render(); return; }
    const jiraFilter = e.target.closest('[data-jira-filter]');
    if (jiraFilter) {
      const k = jiraFilter.dataset.jiraFilter;
      state.jiraFilters[k] = k === 'size' ? Number(jiraFilter.value) : jiraFilter.value;
      state.jiraFilters.page = 1;
      render(); return;
    }
    const jiraTr = e.target.closest('[data-jira-transition]');
    if (jiraTr) {
      const rec = (state.jiraSync || []).find(r => r.id === state.jiraProjectId);
      const iss = rec && rec.issues.find(x => x.id === jiraTr.dataset.jiraTransition);
      const t = iss && ((jiraTicketData[iss.key] || {}).transitions || []).find(x => x.id === jiraTr.value);
      if (iss && !jiraIssueSyncing.has(iss.id)) {
        const pd = jiraEnsurePending(rec.id, iss);
        pd.transition = t ? { id: t.id, name: t.name, toId: t.toId, toName: t.toName, from: iss.status } : null;
        jiraPruneEmptyPending(); storage.save(); render();
      }
      return;
    }
    const jiraMap = e.target.closest('[data-jira-map]');
    if (jiraMap) {
      const rec = (state.jiraSync || []).find(x => x.id === state.jiraProjectId);
      if (rec) {
        rec.statusMap = { ...(rec.statusMap || {}) };
        if (jiraMap.value) rec.statusMap[jiraMap.dataset.jiraMap] = jiraMap.value;
        else delete rec.statusMap[jiraMap.dataset.jiraMap];
        storage.save();
        render();
      }
      return;
    }
    const tcSelect = e.target.closest('[data-tcfilter]');
    if (tcSelect) {
      state.testCaseFilters[tcSelect.dataset.tcfilter] = tcSelect.value;
      state.testCasePage = 1;
      if (content) content.scrollTop = 0;
      render();
    }
    const tcPageSizeSelect = e.target.closest('#tcPageSizeSelect');
    if (tcPageSizeSelect) {
      const v = tcPageSizeSelect.value;
      state.testCasePageSize = v === 'all' ? 'all' : parseInt(v, 10);
      state.testCasePage = 1;
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

  // render() replaces #mainContent's innerHTML, which destroys and recreates
  // the search input — losing focus and caret position. Re-render, then
  // restore both on the fresh element so typing doesn't get interrupted.
  const rerenderPreservingFocus = (inputEl) => {
    const { id, selectionStart, selectionEnd } = inputEl;
    render();
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      // Some input types (e.g. type="date") don't support selection ranges
      // and throw if you try — harmless to skip restoring the caret there.
      try { el.setSelectionRange(selectionStart, selectionEnd); } catch (e) { /* not supported for this input type */ }
    }
  };

  // Inline page search inputs
  let pageSearchTimer;
  content.addEventListener('input', e => {
    const inlineTextarea = e.target.closest('.table-inline-textarea');
    if (inlineTextarea) {
      inlineTextarea.style.height = 'auto';
      inlineTextarea.style.height = inlineTextarea.scrollHeight + 'px';
      return;
    }
    const projectInput = e.target.closest('#projectSearchInput');
    if (projectInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.projectSearch = projectInput.value.toLowerCase(); rerenderPreservingFocus(projectInput); }, 180);
      return;
    }
    const taskInput = e.target.closest('#taskSearchInput');
    if (taskInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.taskSearch = taskInput.value.toLowerCase(); rerenderPreservingFocus(taskInput); }, 180);
      return;
    }
    const testInput = e.target.closest('#testSearchInput');
    if (testInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.testSearch = testInput.value.toLowerCase(); rerenderPreservingFocus(testInput); }, 180);
      return;
    }
    const poTaskInput = e.target.closest('#poTaskSearchInput');
    if (poTaskInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.overviewTaskSearch = poTaskInput.value.toLowerCase(); rerenderPreservingFocus(poTaskInput); }, 180);
      return;
    }
    const releaseInput = e.target.closest('#releaseSearchInput');
    if (releaseInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.releaseSearch = releaseInput.value.toLowerCase(); rerenderPreservingFocus(releaseInput); }, 180);
      return;
    }
    const releasePtInput = e.target.closest('#releasePtSearchInput');
    if (releasePtInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.releasePtSearch = releasePtInput.value.toLowerCase(); rerenderPreservingFocus(releasePtInput); }, 180);
      return;
    }
    if (e.target.id === 'jiraCommentDraft') {
      const d = jiraTicketData[e.target.dataset.key] || (jiraTicketData[e.target.dataset.key] = {});
      d.draft = e.target.value;
      const sb = document.querySelector('.jd-sync-btn');
      if (sb && jiraConnected() && !sb.textContent.includes('Syncing')) sb.disabled = !d.draft.trim() && !document.querySelector('.jd-issue-warn');
      return;
    }
    const jiraSearch = e.target.closest('#jiraTicketSearch');
    if (jiraSearch) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.jiraFilters.q = jiraSearch.value; state.jiraFilters.page = 1; rerenderPreservingFocus(jiraSearch); }, 180);
      return;
    }
    const tcHomeInput = e.target.closest('#tcHomeSearchInput');
    if (tcHomeInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.tcHomeSearch = tcHomeInput.value; rerenderPreservingFocus(tcHomeInput); }, 180);
      return;
    }
    const tcInput = e.target.closest('#testCaseSearchInput');
    if (tcInput) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => {
        state.testCaseSearch = tcInput.value.toLowerCase();
        state.testCasePage = 1;
        if (content) content.scrollTop = 0;
        rerenderPreservingFocus(tcInput);
      }, 180);
      return;
    }
    // Test Case project dropdown search — filters the option list in place,
    // no state/render involved so the input never loses focus while typing.
    const tcProjectSearchInput = e.target.closest('#tcProjectDropdownSearch');
    if (tcProjectSearchInput) {
      const q = tcProjectSearchInput.value.toLowerCase();
      document.querySelectorAll('#tcProjectDropdown .tc-project-option').forEach(opt => {
        const name = opt.dataset.searchName || '';
        opt.style.display = name.includes(q) ? '' : 'none';
      });
      return;
    }
  });

  // Drag and Drop delegation
  content.addEventListener('dragstart', e => {
    const card = e.target.closest('.task-card');
    if (card) {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
      return;
    }
    const projectCard = e.target.closest('.kanban-card');
    if (projectCard) {
      e.dataTransfer.setData('text/plain', projectCard.dataset.id);
      projectCard.classList.add('dragging');
      return;
    }
    const projectListCard = e.target.closest('.project-list .project-card');
    if (projectListCard) {
      e.dataTransfer.setData('text/plain', projectListCard.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      projectListCard.classList.add('dragging');
    }
  });

  content.addEventListener('dragend', e => {
    const card = e.target.closest('.task-card') || e.target.closest('.kanban-card') || e.target.closest('.project-list .project-card');
    if (card) {
      card.classList.remove('dragging');
    }
    document.querySelectorAll('.project-list .project-card.drag-over-top, .project-list .project-card.drag-over-bottom')
      .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
  });

  content.addEventListener('dragover', e => {
    const column = e.target.closest('.kanban-column');
    if (column) {
      e.preventDefault();
      column.classList.add('drag-over');
      return;
    }
    const projectColumn = e.target.closest('.projects-kanban-column');
    if (projectColumn) {
      e.preventDefault();
      projectColumn.classList.add('drag-over');
      return;
    }
    const projectListCard = e.target.closest('.project-list .project-card');
    if (projectListCard) {
      e.preventDefault();
      const rect = projectListCard.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      projectListCard.classList.toggle('drag-over-top', before);
      projectListCard.classList.toggle('drag-over-bottom', !before);
    }
  });

  content.addEventListener('dragleave', e => {
    const column = e.target.closest('.kanban-column');
    if (column) {
      column.classList.remove('drag-over');
      return;
    }
    const projectColumn = e.target.closest('.projects-kanban-column');
    if (projectColumn) {
      projectColumn.classList.remove('drag-over');
      return;
    }
    const projectListCard = e.target.closest('.project-list .project-card');
    if (projectListCard) {
      projectListCard.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });

  content.addEventListener('drop', async e => {
    const column = e.target.closest('.kanban-column');
    if (column) {
      e.preventDefault();
      column.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = column.dataset.status;
      dropTask(taskId, newStatus);
      return;
    }
    const projectListCard = e.target.closest('.project-list .project-card');
    if (projectListCard) {
      e.preventDefault();
      const before = projectListCard.classList.contains('drag-over-top');
      projectListCard.classList.remove('drag-over-top', 'drag-over-bottom');

      const draggedId = e.dataTransfer.getData('text/plain');
      const targetId = projectListCard.dataset.id;
      if (draggedId && targetId && draggedId !== targetId) {
        await reorderProjects(draggedId, targetId, before);
      }
      return;
    }
    const projectColumn = e.target.closest('.projects-kanban-column');
    if (projectColumn) {
      e.preventDefault();
      projectColumn.classList.remove('drag-over');

      const projectId = e.dataTransfer.getData('text/plain');
      const newStatus = projectColumn.dataset.status;
      if (projectId && newStatus) {
        const project = state.projects.find(p => p.id === projectId);
        if (project && project.overallProjectStatus !== newStatus) {
          project.overallProjectStatus = newStatus;
          project.updatedAt = new Date().toISOString();

          const statusLabels = {
            'YET_TO_START': 'Yet to Start',
            'ON_GOING': 'On Going',
            'COMPLETED': 'Completed',
            'MONITORING': 'Monitoring',
            'ON_HOLD': 'On Hold'
          };
          const friendlyStatus = statusLabels[newStatus] || newStatus;
          logActivity(`Moved project "${project.name}" to status "${friendlyStatus}"`, 'project');

          await storage.save();
          render();
        }
      }
    }
  });
};

// ─── Filter helpers ───────────────────────────────────────
window.applyFilter = (key, val) => {
  state.filters[key] = val;
  render();
};

window.clearFilters = () => {
  state.filters = { status: '', previousVersion: '', upcomingVersion: '', dateFrom: '', dateTo: '', taskProject: '', taskPriority: '', taskDeadline: '' };
  render();
};

// ─── Developer Management (Admin Panel Modal & CRUD) ────────────
const openDevModal = (devId = null) => {
  const titleEl = document.getElementById('devModalTitle');
  const nameInput = document.getElementById('devNameInput');
  const idInput = document.getElementById('editDevId');
  const checklist = document.getElementById('devModalProjectChecklist');
  const searchInput = document.getElementById('devModalProjectSearch');

  const dev = devId ? (state.developers || []).find(d => d.id === devId) : null;

  const saveBtn = document.getElementById('saveDevModalBtn');
  if (titleEl) titleEl.textContent = dev ? 'Edit Developer' : 'Add New Developer';
  if (saveBtn) saveBtn.textContent = dev ? 'Update Developer' : 'Save Developer';
  if (nameInput) nameInput.value = dev ? dev.name : '';
  if (idInput) idInput.value = dev ? dev.id : '';
  if (searchInput) searchInput.value = '';

  const assignedSet = new Set(dev ? (dev.projectIds || []) : []);

  if (checklist) {
    checklist.innerHTML = (state.projects || []).map(p => {
      const isChecked = assignedSet.has(p.id);
      const statusClass = getProjectStatusPillClass(p);
      const statusLabel = (Array.isArray(p.statuses) && p.statuses.length > 0)
        ? p.statuses[0]
        : (p.overallProjectStatus ? p.overallProjectStatus.replace(/_/g, ' ') : '');

      return `
        <label class="dev-project-checkbox-row ${isChecked ? 'checked' : ''}" data-name="${escapeHtml(p.name.toLowerCase())}">
          <div class="dev-project-checkbox-row-left">
            <input type="checkbox" name="devProjectCheck" value="${p.id}" ${isChecked ? 'checked' : ''} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; color: var(--text-muted); flex-shrink: 0;"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
            <span class="dev-project-checkbox-row-name">${escapeHtml(p.name)}</span>
          </div>
          ${statusLabel ? `<span class="dev-pill status-pill ${statusClass}" style="font-size: 10px; padding: 2px 7px;">${escapeHtml(statusLabel)}</span>` : ''}
        </label>
      `;
    }).join('') || '<div style="font-size: 12.5px; color: var(--text-muted); padding: 12px; text-align: center;">No projects created yet</div>';
  }

  showModal('developerModal');
};

const saveDeveloper = async () => {
  const nameInput = document.getElementById('devNameInput');
  const idInput = document.getElementById('editDevId');

  const name = nameInput ? nameInput.value.trim() : '';
  const id = idInput ? idInput.value : '';

  if (!name) {
    showToast('Developer name is required', 'error');
    if (nameInput) nameInput.focus();
    return;
  }

  const checkboxes = document.querySelectorAll('input[name="devProjectCheck"]:checked');
  const projectIds = Array.from(checkboxes).map(cb => cb.value);

  if (id) {
    const dev = state.developers.find(d => d.id === id);
    if (dev) {
      dev.name = name;
      dev.projectIds = projectIds;
      dev.updatedAt = new Date().toISOString();
      showToast('Developer updated');
    }
  } else {
    state.developers.push({
      id: 'dev-' + uid(),
      name,
      projectIds,
      createdAt: new Date().toISOString()
    });
    showToast('Developer added');
  }

  await storage.save();
  closeModals();
  render();
};

const editDeveloper = (devId) => {
  openDevModal(devId);
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
    t.developerIds = (t.developerIds || []).filter(id => id !== devId);
  });
  state.tests.forEach(t => {
    if (t.developer === devId) t.developer = '';
  });

  if (state.devSelectedIds) {
    state.devSelectedIds = state.devSelectedIds.filter(id => id !== devId);
  }

  await storage.save();
  closeModals();
  render();
  showToast('Developer deleted');
};

const confirmBulkDeleteDevelopers = () => {
  const count = (state.devSelectedIds || []).length;
  if (count === 0) return;
  document.getElementById('confirmMessage').textContent = `Delete ${count} selected developer${count > 1 ? 's' : ''}? This action cannot be undone.`;
  confirmCallback = () => bulkDeleteDevelopers();
  showModal('confirmModal');
};

const bulkDeleteDevelopers = async () => {
  const toDelete = new Set(state.devSelectedIds || []);
  state.developers = state.developers.filter(d => !toDelete.has(d.id));
  state.tasks.forEach(t => {
    t.developerIds = (t.developerIds || []).filter(id => !toDelete.has(id));
  });
  state.tests.forEach(t => {
    if (toDelete.has(t.developer)) t.developer = '';
  });

  state.devSelectedIds = [];
  await storage.save();
  closeModals();
  render();
  showToast(`Deleted ${toDelete.size} developers`);
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

    document.getElementById('projectClient').value = p.clientName || '';
    document.getElementById('projectTeam').value = p.assignedTeam || '';
    document.getElementById('projectDueDate').value = p.dueDate || '';
    document.getElementById('projectPriority').value = p.priority || '';
    document.getElementById('projectOverallStatus').value = p.overallProjectStatus || 'YET_TO_START';

    selectedStatuses = [...(p.statuses || [])];
    projectJiraSelection = p.jira ? { ...p.jira } : null;
  } else {
    projectJiraSelection = null;
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
    document.getElementById('projectClient').value = '';
    document.getElementById('projectTeam').value = '';
    document.getElementById('projectDueDate').value = '';
    document.getElementById('projectPriority').value = '';
    document.getElementById('projectOverallStatus').value = 'YET_TO_START';
  }

  renderStatusPicker();
  updateSelectedStatusDisplay();
  projectJiraPrevious = null;
  wireProjectJiraField();
  renderProjectJiraField();

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
  const clientName = document.getElementById('projectClient').value.trim();
  const assignedTeam = document.getElementById('projectTeam').value.trim();
  const dueDate = document.getElementById('projectDueDate').value;
  const priority = document.getElementById('projectPriority').value;
  const overallProjectStatus = document.getElementById('projectOverallStatus').value;

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
    state.projects[idx] = {
      ...old,
      name,
      description: desc,
      projectType,
      ...versionData,
      statuses: selectedStatuses,
      clientName,
      assignedTeam,
      dueDate,
      priority,
      overallProjectStatus,
      updatedAt: now
    };
    if (projectJiraSelection) state.projects[idx].jira = { ...projectJiraSelection };
    else delete state.projects[idx].jira;
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
      id: uid(),
      name,
      description: desc,
      projectType,
      ...versionData,
      statuses: selectedStatuses,
      clientName,
      assignedTeam,
      dueDate,
      priority,
      overallProjectStatus,
      ...(projectJiraSelection ? { jira: { ...projectJiraSelection } } : {}),
      createdAt: now,
      updatedAt: now
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
  state.noteFolders = (state.noteFolders || []).filter(f => f.projectId !== id);
  state.notes = (state.notes || []).filter(n => n.projectId !== id);
  if (state.activeNoteProjectId === id) {
    state.activeNoteProjectId = null;
    state.activeNoteFolderId = null;
    state.activeNoteId = null;
  }
  logActivity(`Deleted project "${p.name}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Project deleted');
};

// Manual drag-to-reorder for the Projects list view — moves draggedId to sit
// just before/after targetId in state.projects, which is the array order the
// list view renders in (new projects otherwise always land on top via unshift).
const reorderProjects = async (draggedId, targetId, insertBefore) => {
  const fromIdx = state.projects.findIndex(p => p.id === draggedId);
  if (fromIdx === -1) return;
  const [moved] = state.projects.splice(fromIdx, 1);
  let toIdx = state.projects.findIndex(p => p.id === targetId);
  if (toIdx === -1) { state.projects.splice(fromIdx, 0, moved); return; }
  if (!insertBefore) toIdx += 1;
  state.projects.splice(toIdx, 0, moved);
  await storage.save();
  render();
};

const confirmClearReleaseHistory = (projectId) => {
  const p = state.projects.find(proj => proj.id === projectId);
  if (!p) return;
  document.getElementById('confirmMessage').textContent =
    `Clear all release history for "${p.name}"? This action cannot be undone.`;
  confirmCallback = () => clearReleaseHistory(projectId);
  showModal('confirmModal');
};

const clearReleaseHistory = async (projectId) => {
  const p = state.projects.find(proj => proj.id === projectId);
  if (!p) return;
  p.releaseHistory = [];
  delete p.lastReleaseAt;
  delete p.lastReleaseLog;
  p.updatedAt = new Date().toISOString();
  await storage.save();
  closeModals();
  showToast('Release history cleared!');
  render();
};

// ─── Task Modal ──────────────────────────────────────────
const filterChecklist = (containerId, query) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  const labels = container.querySelectorAll('.dev-project-label');
  const q = query.toLowerCase().trim();
  labels.forEach(label => {
    const text = label.textContent.toLowerCase();
    if (text.includes(q)) {
      label.style.display = '';
    } else {
      label.style.display = 'none';
    }
  });
};

const loadTaskProjectChecklist = (selectedProjectIds = []) => {
  const container = document.getElementById('taskProjectChecklist');
  if (!container) return;
  container.innerHTML = state.projects.map(p => `
    <label class="dev-project-label">
      <input type="checkbox" name="taskProjectCheck" value="${p.id}" ${selectedProjectIds.includes(p.id) ? 'checked' : ''} />
      <span>${p.name}</span>
    </label>
  `).join('') || emptyNote('No projects added yet.');
};

const loadTaskDevChecklist = (selectedDevIds = []) => {
  const container = document.getElementById('taskDevChecklist');
  if (!container) return;

  const checkedProjects = Array.from(document.querySelectorAll('input[name="taskProjectCheck"]:checked')).map(cb => cb.value);

  let devs = state.developers;
  if (checkedProjects.length > 0) {
    devs = state.developers.filter(d =>
      (d.projectIds || []).some(pid => checkedProjects.includes(pid))
    );
  }

  container.innerHTML = devs.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="taskDevCheck" value="${d.id}" ${selectedDevIds.includes(d.id) ? 'checked' : ''} />
      <span>${d.name}</span>
    </label>
  `).join('') || emptyNote('No developers linked to selected project(s).');
};

const openTaskModal = (id = null, defaultDate = null) => {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('taskModalTitle');

  const todayIso = new Date().toISOString().split('T')[0];

  // Reset search inputs when opening modal
  const projectSearch = document.getElementById('taskProjectSearch');
  if (projectSearch) projectSearch.value = '';
  const devSearch = document.getElementById('taskDevSearch');
  if (devSearch) devSearch.value = '';

  if (id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    title.textContent = 'Edit Task';
    document.getElementById('taskId').value = t.id;
    document.getElementById('taskTitle').value = t.title;
    document.getElementById('taskDesc').value = t.description || '';
    document.getElementById('taskWorkDone').value = t.workDone || '';
    document.getElementById('taskTags').value = (t.tags || []).join(', ');
    document.getElementById('taskStartDate').value = t.startDate || t.date || '';
    document.getElementById('taskEndDate').value = t.endDate || '';
    document.getElementById('taskStatus').value = t.status || 'To-Do';
    document.getElementById('taskPriority').value = t.priority || 'Medium';
    loadTaskProjectChecklist(t.projectIds || []);
    loadTaskDevChecklist(t.developerIds || []);
    const cdg = document.getElementById('completionDateGroup');
    const cdi = document.getElementById('taskCompletedDate');
    if (t.status === 'Done') {
      cdg.style.display = '';
      cdi.value = t.completedDate ? t.completedDate.split('T')[0] : todayIso;
    } else {
      cdg.style.display = 'none';
      cdi.value = '';
    }
  } else {
    title.textContent = 'New Task';
    document.getElementById('taskId').value = '';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskWorkDone').value = '';
    document.getElementById('taskTags').value = '';
    document.getElementById('taskStartDate').value = defaultDate || todayIso;
    document.getElementById('taskEndDate').value = defaultDate || '';
    document.getElementById('taskStatus').value = 'To-Do';
    document.getElementById('taskPriority').value = 'Medium';
    loadTaskProjectChecklist([]);
    loadTaskDevChecklist([]);
    document.getElementById('completionDateGroup').style.display = 'none';
    document.getElementById('taskCompletedDate').value = '';
  }

  // Toggle completion date field when status changes
  document.getElementById('taskStatus').onchange = function () {
    const cdg = document.getElementById('completionDateGroup');
    const cdi = document.getElementById('taskCompletedDate');
    if (this.value === 'Done') {
      cdg.style.display = '';
      if (!cdi.value) cdi.value = todayIso;
    } else {
      cdg.style.display = 'none';
      cdi.value = '';
    }
  };

  showModal('taskModal');
};

const saveTask = async () => {
  const id = document.getElementById('taskId').value;
  const title = document.getElementById('taskTitle').value.trim();
  const desc = document.getElementById('taskDesc').value.trim();
  const workDone = document.getElementById('taskWorkDone').value.trim();
  const tags = document.getElementById('taskTags').value.split(',').map(s => s.trim()).filter(s => s !== '');
  const startDate = document.getElementById('taskStartDate').value;
  const endDate = document.getElementById('taskEndDate').value;
  const status = document.getElementById('taskStatus').value;
  const priority = document.getElementById('taskPriority').value || 'Medium';
  const projectIds = Array.from(document.querySelectorAll('input[name="taskProjectCheck"]:checked')).map(cb => cb.value);
  const developerIds = Array.from(document.querySelectorAll('input[name="taskDevCheck"]:checked')).map(cb => cb.value);

  if (!title) { showToast('Task title is required', 'error'); return; }

  const now = new Date().toISOString();

  const completedDateInput = document.getElementById('taskCompletedDate').value;

  if (id) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const old = state.tasks[idx];
    let completedDate = null;
    if (status === 'Done') {
      completedDate = completedDateInput
        ? new Date(completedDateInput + 'T12:00:00').toISOString()
        : (old.completedDate || now);
    }
    state.tasks[idx] = { ...old, title, description: desc, workDone, tags, startDate, endDate, status, priority, projectIds, developerIds, completedDate, updatedAt: now };
    delete state.tasks[idx].date;
    logActivity(`Updated task "${title}"`, 'task');
    showToast('Task updated');
  } else {
    let completedDate = null;
    if (status === 'Done') {
      completedDate = completedDateInput
        ? new Date(completedDateInput + 'T12:00:00').toISOString()
        : now;
    }
    state.tasks.unshift({
      id: uid(), title, description: desc, workDone, tags, startDate, endDate, status, priority, projectIds, developerIds,
      completedDate, createdAt: now, updatedAt: now
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

const hideModal = (id) => {
  closeModals();
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
    const projectNames = getTaskProjectNames(task);
    const devName = getTaskDevNames(task).join(', ') || '–';

    const taskStatusClass = (task.status || 'To-Do').toLowerCase().replace(' ', '').replace('-', '');
    const priorityClass = (task.priority || 'Medium').toLowerCase();

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endDateObj = task.endDate ? new Date(task.endDate + 'T00:00:00') : null;
    const isOverdue = endDateObj && task.status !== 'Done' && endDateObj < today;
    const overdueDays = isOverdue ? Math.ceil((today - endDateObj) / 86400000) : 0;

    const deadlineHtml = task.endDate
      ? (isOverdue
        ? `<span style="color:#c0392b;font-weight:600;">${fmtDate(task.endDate)}</span>&nbsp;<span style="font-size:10.5px;color:#c0392b;font-weight:700;background:#fdecea;padding:2px 7px;border-radius:4px;letter-spacing:.3px;">+${overdueDays}d overdue</span>`
        : fmtDate(task.endDate))
      : '–';

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section">
          <span class="detail-badge ${taskStatusClass}">${task.status || 'To-Do'}</span>
          <span class="priority-pill ${priorityClass}">${task.priority || 'Medium'}</span>
          ${projectNames.map(name => `<span class="detail-project-tag">${name}</span>`).join('')}
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
            <span class="detail-meta-label">Start Date</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              <span>${task.startDate ? fmtDate(task.startDate) : '–'}</span>
            </div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Deadline</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon" style="${isOverdue ? 'color:#c0392b;' : ''}"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span>${deadlineHtml}</span>
            </div>
          </div>
          ${task.completedDate ? `
          <div class="detail-meta-item">
            <span class="detail-meta-label">Completed On</span>
            <div class="detail-meta-value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="meta-icon" style="color:var(--accent);"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
              <span style="color:var(--accent);font-weight:500;">${fmtDate(task.completedDate)}</span>
            </div>
          </div>
          ` : ''}
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

        <div class="detail-desc-section">
          <span class="detail-meta-label">Work Done</span>
          <div class="detail-desc-content">${formatFullDescription(task.workDone) || '<span class="no-desc">No work logged yet.</span>'}</div>
        </div>
      </div>
    `;
  } else if (type === 'project') {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;

    titleEl.textContent = 'Project Details';
    const isApp = project.projectType === 'app';
    const assignedDevs = (state.developers || []).filter(d => (d.projectIds || []).some(pid => String(pid) === String(project.id)));
    const devsHtml = assignedDevs.length > 0
      ? assignedDevs.map(d => {
        const initials = d.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
        const avatarBg = getAvatarGradient(d.name);
        return `<span class="project-dev-badge"><span class="project-dev-badge-avatar" style="background:${avatarBg}">${initials}</span><span class="project-dev-badge-name">${escapeHtml(d.name)}</span></span>`;
      }).join('')
      : '<span class="project-dev-badge-empty">No developers assigned</span>';

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
            <span class="detail-meta-label">Client</span>
            <div class="detail-meta-value">${escapeHtml(project.clientName) || '–'}</div>
          </div>
          <div class="detail-meta-item">
            <span class="detail-meta-label">Assigned Team</span>
            <div class="detail-meta-value">${escapeHtml(project.assignedTeam) || '–'}</div>
          </div>
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

        <div class="detail-statuses-section" style="margin-top:12px;">
          <span class="detail-meta-label">Assigned Developers</span>
          <div class="project-assigned-devs-list" style="margin-top:6px;">
            ${devsHtml}
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
    const statusClass = (release.status || 'Draft').toLowerCase().replace(' ', '');

    // Multi-project (new) or legacy single projectId
    const relProjectIds = release.projectIds || (release.projectId ? [release.projectId] : []);
    const relProjNames = relProjectIds.map(pid => { const p = state.projects.find(x => x.id === pid); return p ? p.name : null; }).filter(Boolean);

    // Multi-version (new) or legacy single version
    const relVersions = release.versions || (release.version ? [release.version] : []);

    const devsList = (release.developerIds || []).map(devId => {
      const dev = state.developers.find(d => d.id === devId);
      return dev ? `<span class="release-dev-pill" style="font-size: 11px; padding: 2px 8px; margin-top: 2px;">${dev.name}</span>` : null;
    }).filter(Boolean).join('');

    bodyEl.innerHTML = `
      <div class="detail-container">
        <div class="detail-header-section" style="gap:6px;flex-wrap:wrap;">
          <span class="detail-badge release-status ${statusClass}">${release.status}</span>
          ${relProjNames.map(n => `<span class="detail-project-tag">${n}</span>`).join('')}
          ${relVersions.map(v => `<span class="detail-version-tag">${v}</span>`).join('')}
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
    releases = releases.filter(r => {
      const projIds = r.projectIds || (r.projectId ? [r.projectId] : []);
      const projNames = projIds.map(pid => { const p = state.projects.find(x => x.id === pid); return p ? p.name.toLowerCase() : ''; });
      const vers = r.versions || (r.version ? [r.version] : []);
      return r.name.toLowerCase().includes(q) ||
        vers.some(v => v.toLowerCase().includes(q)) ||
        projNames.some(n => n.includes(q)) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.workItems || '').toLowerCase().includes(q) ||
        (r.managerName || '').toLowerCase().includes(q);
    });
  }

  if (state.releaseFilters.status) {
    releases = releases.filter(r => r.status === state.releaseFilters.status);
  }

  // Sort releases by releaseDate descending (newest releaseDate first), tie-breaking by createdAt
  const parseSortTime = (dateStr) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-');
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
    }
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? 0 : t;
  };

  releases.sort((a, b) => {
    const timeA = parseSortTime(a.releaseDate) || parseSortTime(a.createdAt);
    const timeB = parseSortTime(b.releaseDate) || parseSortTime(b.createdAt);
    if (timeB !== timeA) return timeB - timeA;
    return parseSortTime(b.createdAt) - parseSortTime(a.createdAt);
  });

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
      ${emptyState(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"/><polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"/></svg>',
    q || state.releaseFilters.status ? 'No releases match search/filters' : 'No releases found',
    q || state.releaseFilters.status ? 'Try adjustments or click Clear.' : 'Click "Add Release" in the header to manage your first project release!'
  )}
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

  // Support multi-project (new) and single-project (legacy)
  const projectIds = r.projectIds || (r.projectId ? [r.projectId] : []);
  const projNames = projectIds.map(pid => { const p = state.projects.find(x => x.id === pid); return p ? p.name : null; }).filter(Boolean);
  const projPills = projNames.length
    ? projNames.map(n => `<span class="test-pill test-proj" style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">${highlight(n, q)}</span>`).join('')
    : '<span class="test-pill test-proj" style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;background:var(--border);color:var(--text-muted);">No Project</span>';

  // Support multi-version (new) and single-version (legacy)
  const versions = r.versions || (r.version ? [r.version] : []);
  const versionPills = versions.length
    ? versions.map(v => `<div class="release-version" style="margin:0;padding:2px 6px;font-size:10px;">${highlight(v, q)}</div>`).join('')
    : '';

  return `
    <div class="release-card release-status-${statusClass}" data-id="${r.id}">
      <div class="release-card-top">
        <div class="release-name-wrap">
          <div class="release-name">${highlight(r.name, q)}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">
            ${projPills}
            ${versionPills}
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
        <span class="card-time">${r.releaseDate ? 'Release: ' + fmtDate(r.releaseDate) : 'Created ' + timeAgo(r.createdAt)}</span>
        <div class="card-actions" style="opacity: 1;">
          <button class="icon-btn" data-action="copy-notes" data-id="${r.id}" aria-label="Copy Email Notes" title="Copy Email Notes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
          </button>
          <button class="icon-btn" data-action="edit-release" data-id="${r.id}" aria-label="Edit" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-release" data-id="${r.id}" aria-label="Delete" title="Delete">
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

// ─── Release Points (accordion) ──────────────────────────
// One collapsible row per Release Point, grouped into In progress / Completed.
// Open rows live in state.rpExpanded (a Set) so they survive re-renders; the first
// render opens every incomplete Release Point. Checklist rows keep the
// .rp-checklist-item markup that the toggle / inline-edit handlers rely on.
const rpProjectIdsOf = (rp) => rp.projectIds || (rp.projectId ? [rp.projectId] : []);
const rpStats = (rp) => {
  const items = rp.checklistItems || [];
  const done = items.filter(i => i.done).length;
  const complete = !!rp.isCompleted || (items.length > 0 && done === items.length);
  return { items, done, total: items.length, pct: items.length ? Math.round(done / items.length * 100) : 0, complete };
};
const rpMiniRing = (pct, complete) => {
  const r = 15, c = 2 * Math.PI * r;
  return `
    <span class="rpa-ring ${complete ? 'complete' : ''}" data-rpa="ring">
      <svg viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="${r}"/><circle class="fill" cx="18" cy="18" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}"/></svg>
      <span class="rpa-ring-icon">${complete ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : `${pct}`}</span>
    </span>`;
};

const renderRpChecklistItems = (rp) => {
  const renderTicketInline = (ticket) => {
    if (!ticket) return '';
    const t = ticket.trim();
    const isUrl = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(t);
    if (!isUrl) return `<span class="rp-item-ticket text" title="Ticket: ${escapeHtml(t)}"><span>${escapeHtml(t)}</span></span>`;
    const href = t.startsWith('www.') ? 'https://' + t : t;
    let display = t;
    try {
      // Show the last path segment (e.g. the Jira key "CIMTRACK-123" of a /browse/ link).
      const url = new URL(href);
      const segments = url.pathname.split('/').filter(Boolean);
      display = segments.length ? decodeURIComponent(segments[segments.length - 1]) : url.hostname.replace('www.', '');
    } catch (e) { /* keep raw */ }
    return `
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="rp-item-ticket link" title="View Ticket: ${escapeHtml(t)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        <span>${escapeHtml(display)}</span>
      </a>`;
  };

  return (rp.checklistItems || []).map(item => {
    if (state.inlineEditing && state.inlineEditing.rpId === rp.id && state.inlineEditing.itemId === item.id) {
      return `
        <div class="rp-checklist-item editing" data-rp-id="${rp.id}" data-item-id="${item.id}">
          <input type="text" class="rp-inline-edit-text" value="${escapeHtml(item.text)}" placeholder="Item text..." />
          <div class="rp-inline-edit-row">
            <input type="text" class="rp-inline-edit-ticket" value="${escapeHtml(item.ticket || '')}" placeholder="Ticket / Link..." />
            <select class="rp-inline-edit-dev">
              <option value="">Unassigned</option>
              ${state.developers.map(d => `<option value="${d.id}" ${item.developerId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
            </select>
          </div>
          <div class="rp-inline-edit-actions">
            <button class="rp-inline-save-btn" data-action="save-checklist-item-inline" data-rp-id="${rp.id}" data-item-id="${item.id}" aria-label="Save" title="Save">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Save</span>
            </button>
            <button class="rp-inline-cancel-btn" data-action="cancel-checklist-item-inline" aria-label="Cancel" title="Cancel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Cancel</span>
            </button>
          </div>
        </div>`;
    }
    const dev = item.developerId ? state.developers.find(d => d.id === item.developerId) : null;
    // A Clair developer wins; otherwise show the Jira assignee of an imported ticket.
    const assigneeName = dev ? dev.name : (item.jiraAssignee || '');
    const ticketHtml = item.ticket ? renderTicketInline(item.ticket) : '';
    const devHtml = assigneeName ? `
      <span class="rp-item-dev" title="${dev ? 'Assigned to' : 'Jira assignee:'} ${escapeHtml(assigneeName)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        <span>${escapeHtml(assigneeName)}</span>
      </span>` : '';
    return `
      <div class="rp-checklist-item ${item.done ? 'done' : ''}" data-action="toggle-checklist-item" data-rp-id="${rp.id}" data-item-id="${item.id}" role="checkbox" aria-checked="${item.done ? 'true' : 'false'}" tabindex="0">
        <div class="rp-check-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="rp-checklist-item-content">
          <span class="rp-checklist-item-text">${escapeHtml(item.text)}</span>
          ${(ticketHtml || devHtml) ? `<div class="rp-checklist-item-meta">${ticketHtml}${devHtml}</div>` : ''}
        </div>
        <button class="rp-item-edit-btn" data-action="edit-checklist-item-inline" data-rp-id="${rp.id}" data-item-id="${item.id}" aria-label="Edit item" title="Edit item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>`;
  }).join('');
};

const renderReleasePtAccordion = (rp, q = '', forceOpen = false) => {
  const s = rpStats(rp);
  const open = forceOpen || state.rpExpanded.has(rp.id);
  const projects = rpProjectIdsOf(rp).map(pid => state.projects.find(p => p.id === pid)).filter(Boolean);
  const linkedRelease = rp.releaseId ? state.releases.find(r => r.id === rp.releaseId) : null;
  // Each version once: the release's "v1.7.0" and the point's own "v1.7.0 (Up)" are the same version.
  const versions = rpVersionLabels(rp, linkedRelease);
  const belongsTo = releaseForPoint(rp);
  // People: Release Point developers plus anyone assigned to an item.
  const people = [...new Set([...(rp.developerIds || []), ...s.items.map(i => i.developerId).filter(Boolean)])]
    .map(id => state.developers.find(d => d.id === id)).filter(Boolean);
  const avatars = people.slice(0, 4).map(d => {
    const initials = (d.name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
    return `<span class="rpa-avatar" style="background:${getAvatarGradient(d.name)}" title="${escapeHtml(d.name)}">${escapeHtml(initials)}</span>`;
  }).join('') + (people.length > 4 ? `<span class="rpa-avatar more" title="${escapeHtml(people.slice(4).map(d => d.name).join(', '))}">+${people.length - 4}</span>` : '');
  const bodyId = `rpa-body-${rp.id}`;

  return `
    <article class="rpa-item ${open ? 'open' : ''} ${s.complete ? 'is-complete' : ''}" data-id="${rp.id}">
      <div class="rpa-head">
        <button type="button" class="rpa-summary" data-action="rpa-toggle" data-id="${rp.id}" aria-expanded="${open}" aria-controls="${bodyId}">
          <span class="rpa-chev" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 18l6-6-6-6"/></svg></span>
          ${rpMiniRing(s.pct, s.complete)}
          <span class="rpa-main">
            <span class="rpa-title">${highlight(escapeHtml(rp.title), q)}</span>
            <span class="rpa-tags">
              ${projects.map(p => `<span class="rpa-proj">${highlight(escapeHtml(p.name), q)}</span>`).join('') || '<span class="rpa-proj none">No project</span>'}
              <span class="rpa-type ${rp.releaseType === 'released' ? 'released' : 'upcoming'}">${rp.releaseType === 'released' ? 'Released' : 'Upcoming'}</span>
              ${versions.map(v => `<span class="rpa-ver">${highlight(escapeHtml(v), q)}</span>`).join('')}
              ${belongsTo ? `<span class="rpa-rel ${belongsTo.matched}" title="${belongsTo.matched === 'link' ? 'Linked release' : 'Matched to this release by project and version (no Linked Release set)'}">${DB_ICONS.rocket}${escapeHtml(belongsTo.release.name || 'Release')}</span>` : ''}
            </span>
          </span>
          <span class="rpa-progress">
            <span class="rpa-bar"><span data-rpa="bar" style="width:${s.pct}%"></span></span>
            <span class="rpa-count" data-rpa="count">${s.done}/${s.total}</span>
          </span>
          <span class="rpa-people">${avatars}</span>
          <span class="rpa-updated">${timeAgo(rp.updatedAt || rp.createdAt)}</span>
        </button>
        <div class="rpa-actions">
          <button class="icon-btn" data-action="edit-release-pt" data-id="${rp.id}" aria-label="Edit release point" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-release-pt" data-id="${rp.id}" aria-label="Delete release point" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
      <div class="rpa-body" id="${bodyId}" role="region" aria-label="${escapeHtml(rp.title)} checklist">
        <div class="rpa-body-inner">
          <div class="rpa-meta">
            ${linkedRelease ? `<span><em>Linked release</em>${escapeHtml(linkedRelease.name || '')}</span>` : ''}
            ${people.length ? `<span><em>Developers</em>${escapeHtml(people.map(d => d.name).join(', '))}</span>` : ''}
            <span><em>Progress</em><span data-rpa="summary">${s.complete ? 'All checks passed' : s.total ? `${s.total - s.done} of ${s.total} remaining` : 'No checklist items yet'}</span></span>
            <span><em>Updated</em>${fmtDate(rp.updatedAt || rp.createdAt)}</span>
          </div>
          ${s.total ? `<div class="rpa-checklist">${renderRpChecklistItems(rp)}</div>`
            : `<div class="rpa-noitems">No checklist items yet. <button type="button" class="rpa-link" data-action="edit-release-pt" data-id="${rp.id}">Add items</button></div>`}
        </div>
      </div>
    </article>`;
};

const renderReleasePoints = () => {
  const rps = state.releasePoints || [];
  if (!state.rpExpanded) state.rpExpanded = new Set(rps.filter(rp => !rpStats(rp).complete).map(rp => rp.id));
  const q = (state.releasePtSearch || '').toLowerCase().trim();
  const f = state.releasePtFilters;

  // Overall stats (before filtering)
  const stats = rps.map(rpStats);
  const total = rps.length;
  const completed = stats.filter(s => s.complete).length;
  const upcoming = rps.filter(r => r.releaseType !== 'released').length;
  const totalChecks = stats.reduce((a, s) => a + s.total, 0);
  const doneChecks = stats.reduce((a, s) => a + s.done, 0);
  const overallPct = totalChecks ? Math.round(doneChecks / totalChecks * 100) : 0;

  // Filters. Search also looks inside checklist items (text, ticket, Jira key) and opens matches.
  const itemMatches = (rp) => (rp.checklistItems || []).some(i =>
    (i.text || '').toLowerCase().includes(q) || (i.ticket || '').toLowerCase().includes(q) || (i.jiraKey || '').toLowerCase().includes(q));
  let list = rps.filter(rp => {
    if (q && !(
      (rp.title || '').toLowerCase().includes(q) ||
      rpProjectIdsOf(rp).some(pid => ((state.projects.find(p => p.id === pid) || {}).name || '').toLowerCase().includes(q)) ||
      (rp.versions || []).some(v => (v || '').toLowerCase().includes(q)) ||
      itemMatches(rp))) return false;
    if (f.project && !rpProjectIdsOf(rp).includes(f.project)) return false;
    if (f.releaseType && (rp.releaseType || 'upcoming') !== f.releaseType) return false;
    const c = rpStats(rp).complete;
    if (f.completion === 'completed' && !c) return false;
    if (f.completion === 'incomplete' && c) return false;
    return true;
  });
  const active = list.filter(rp => !rpStats(rp).complete);
  const done = list.filter(rp => rpStats(rp).complete);

  // Project chips: projects that have Release Points, with done/total.
  const chipData = state.projects.map(p => {
    const mine = rps.filter(rp => rpProjectIdsOf(rp).includes(p.id));
    return mine.length ? { p, total: mine.length, done: mine.filter(rp => rpStats(rp).complete).length } : null;
  }).filter(Boolean);
  const chips = `
    <div class="rpa-chips" role="toolbar" aria-label="Filter by project">
      <button type="button" class="rpa-chip ${!f.project ? 'active' : ''}" data-action="rp-project-chip" data-pid="">All projects <span>${total}</span></button>
      ${chipData.map(c => `
        <button type="button" class="rpa-chip ${f.project === c.p.id ? 'active' : ''}" data-action="rp-project-chip" data-pid="${c.p.id}">
          ${escapeHtml(c.p.name)} <span>${c.done}/${c.total}</span>
        </button>`).join('')}
    </div>`;

  const group = (title, items, cls) => items.length ? `
    <section class="rpa-group ${cls}">
      <div class="rpa-group-head"><span class="rpa-group-dot"></span>${title}<span class="rpa-group-count">${items.length}</span></div>
      <div class="rpa-list">${items.map(rp => renderReleasePtAccordion(rp, q, !!q && itemMatches(rp))).join('')}</div>
    </section>` : '';

  const filtersActive = !!(q || f.project || f.releaseType || f.completion);
  const ringR = 26, ringC = 2 * Math.PI * ringR;

  return `
    <div class="rpa-page">
      <section class="rpa-hero">
        <div class="rpa-hero-main">
          <span class="rpa-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></span>
          <div>
            <h2 class="rpa-hero-title">Release Points</h2>
            <p class="rpa-hero-sub">Release readiness checklists for your projects and versions.</p>
          </div>
        </div>
        <div class="rpa-hero-stats">
          <div class="rpa-hstat"><strong>${total}</strong><span>Total</span></div>
          <div class="rpa-hstat"><strong class="warn">${total - completed}</strong><span>In progress</span></div>
          <div class="rpa-hstat"><strong class="ok">${completed}</strong><span>Completed</span></div>
          <div class="rpa-hstat"><strong>${upcoming}</strong><span>Upcoming</span></div>
          <div class="rpa-hero-ring" title="${doneChecks} of ${totalChecks} checks done">
            <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${ringR}"/><circle class="fill" cx="32" cy="32" r="${ringR}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${(ringC * (1 - overallPct / 100)).toFixed(2)}"/></svg>
            <span><strong>${overallPct}%</strong><em>${doneChecks}/${totalChecks} checks</em></span>
          </div>
        </div>
      </section>

      <div class="rpa-toolbar">
        <div class="page-search-wrap rpa-search">
          <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="page-search-input" id="releasePtSearchInput" placeholder="Search titles, items, tickets…" value="${escapeHtml(state.releasePtSearch || '')}" />
          ${state.releasePtSearch ? `<button class="page-search-clear" id="clearReleasePtSearch" aria-label="Clear search">✕</button>` : ''}
        </div>
        <select class="filter-select" data-rptfilter="releaseType" aria-label="Release type">
          <option value="">All types</option>
          <option value="upcoming" ${f.releaseType === 'upcoming' ? 'selected' : ''}>Upcoming</option>
          <option value="released" ${f.releaseType === 'released' ? 'selected' : ''}>Released</option>
        </select>
        <select class="filter-select" data-rptfilter="completion" aria-label="Completion">
          <option value="">All statuses</option>
          <option value="incomplete" ${f.completion === 'incomplete' ? 'selected' : ''}>In progress</option>
          <option value="completed" ${f.completion === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
        ${filtersActive ? `<button class="btn-ghost rpa-tool-btn" id="clearReleasePtFilters">Clear filters</button>` : ''}
        <div class="rpa-toolbar-right">
          <span class="rpa-showing">${list.length} of ${total}</span>
          <div class="rpa-expand-group">
            <button type="button" class="rpa-tool-btn" data-action="rpa-expand-all" title="Expand all">Expand all</button>
            <button type="button" class="rpa-tool-btn" data-action="rpa-collapse-all" title="Collapse all">Collapse all</button>
          </div>
          <button type="button" class="btn-primary rpa-new" data-action="new-release-pt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            New Release Point
          </button>
        </div>
      </div>
      ${chipData.length ? chips : ''}

      ${list.length ? group('In progress', active, 'active') + group('Completed', done, 'done') : `
        <div class="rpa-empty">
          <span class="rpa-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></span>
          <h3>${filtersActive ? 'No release points match' : 'No release points yet'}</h3>
          <p>${filtersActive ? 'Try a different search or clear the filters.' : 'Create a release readiness checklist for an upcoming version.'}</p>
          ${filtersActive ? '' : `<button type="button" class="btn-primary" data-action="new-release-pt" style="margin-top:14px;">New Release Point</button>`}
        </div>`}
    </div>`;
};

// Expand/collapse without re-rendering (keeps scroll position and focus).
const toggleRpAccordion = (id, open) => {
  if (!state.rpExpanded) state.rpExpanded = new Set();
  const el = document.querySelector(`.rpa-item[data-id="${id}"]`);
  const isOpen = el ? el.classList.contains('open') : state.rpExpanded.has(id);
  const next = open === undefined ? !isOpen : open;
  if (next) state.rpExpanded.add(id); else state.rpExpanded.delete(id);
  if (el) {
    el.classList.toggle('open', next);
    const btn = el.querySelector('.rpa-summary');
    if (btn) btn.setAttribute('aria-expanded', String(next));
  }
};

// Jump from elsewhere (e.g. the Dashboard) to one Release Point, opened and visible.
const openReleasePointOnPage = (id) => {
  if (!(state.releasePoints || []).some(rp => rp.id === id)) return;
  if (!state.rpExpanded) state.rpExpanded = new Set();
  state.rpExpanded.add(id);
  state.releasePtSearch = '';
  state.releasePtFilters = { project: '', releaseType: '', completion: '' };
  setView('releasepoints');
  const el = document.querySelector(`.rpa-item[data-id="${id}"]`);
  if (el) { el.scrollIntoView({ block: 'start', behavior: 'instant' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
};

// In-place update after ticking a checklist item (no re-render, so the row stays
// where it is even when it becomes complete; it moves group on the next render).
const patchReleasePtCard = (rp) => {
  const el = document.querySelector(`.rpa-item[data-id="${rp.id}"]`);
  if (!el) { render(); return; }
  const s = rpStats(rp);
  (rp.checklistItems || []).forEach(item => {
    const itemEl = el.querySelector(`.rp-checklist-item[data-item-id="${item.id}"]`);
    if (itemEl) { itemEl.classList.toggle('done', !!item.done); itemEl.setAttribute('aria-checked', item.done ? 'true' : 'false'); }
  });
  el.classList.toggle('is-complete', s.complete);
  const ring = el.querySelector('[data-rpa="ring"]');
  if (ring) ring.outerHTML = rpMiniRing(s.pct, s.complete);
  const bar = el.querySelector('[data-rpa="bar"]');
  if (bar) bar.style.width = `${s.pct}%`;
  const count = el.querySelector('[data-rpa="count"]');
  if (count) count.textContent = `${s.done}/${s.total}`;
  const summary = el.querySelector('[data-rpa="summary"]');
  if (summary) summary.textContent = s.complete ? 'All checks passed' : s.total ? `${s.total - s.done} of ${s.total} remaining` : 'No checklist items yet';
};

// ─── Release Project Version Modal & Automation ─────────────
const openReleaseVersionModal = (projectId, platform) => {
  const p = state.projects.find(proj => proj.id === projectId);
  if (!p) return;

  const formatVersionLabel = (v) => {
    if (!v) return '';
    return v.toLowerCase().startsWith('v') ? v : 'v' + v;
  };

  let prevVer = '';
  let upVer = '';

  if (platform === 'android') {
    prevVer = p.androidPreviousVersion || '';
    upVer = p.androidUpcomingVersion || '';
  } else if (platform === 'ios') {
    prevVer = p.iosPreviousVersion || '';
    upVer = p.iosUpcomingVersion || '';
  } else {
    prevVer = p.previousVersion || '';
    upVer = p.upcomingVersion || p.version || '';
  }

  // Base version is strictly derived from the project's previous released version
  const baseVer = prevVer || upVer || '1.0.0';

  const platformName = platform === 'android' ? 'Android' : (platform === 'ios' ? 'iOS' : 'Web');

  const pIdInput = document.getElementById('releaseVersionProjectId');
  const platInput = document.getElementById('releaseVersionPlatform');
  const pNameEl = document.getElementById('releaseVersionProjectName');
  const pBadgeEl = document.getElementById('releaseVersionPlatformBadge');
  const prevValEl = document.getElementById('releaseVersionPrevVal');
  const nextInput = document.getElementById('nextReleaseVersionInput');

  if (pIdInput) pIdInput.value = projectId;
  if (platInput) platInput.value = platform;
  if (pNameEl) pNameEl.textContent = p.name;
  if (pBadgeEl) pBadgeEl.textContent = platformName;
  if (prevValEl) prevValEl.textContent = prevVer ? formatVersionLabel(prevVer) : 'None (Initial)';

  // Compute dynamic suggestions strictly from previous released version
  const suggestions = getSemverSuggestions(baseVer);
  const patchEl = document.getElementById('presetPatchVer');
  const minorEl = document.getElementById('presetMinorVer');
  const majorEl = document.getElementById('presetMajorVer');

  if (patchEl) patchEl.textContent = suggestions.patch;
  if (minorEl) minorEl.textContent = suggestions.minor;
  if (majorEl) majorEl.textContent = suggestions.major;

  // Determine initial selection: if upVer matches any preset, select it, otherwise default to patch or minor
  let selectedVer = upVer || suggestions.patch;
  let activePresetType = '';

  if (selectedVer === suggestions.patch) activePresetType = 'patch';
  else if (selectedVer === suggestions.minor) activePresetType = 'minor';
  else if (selectedVer === suggestions.major) activePresetType = 'major';
  else {
    activePresetType = 'patch';
    selectedVer = suggestions.patch;
  }

  document.querySelectorAll('#releaseVersionPresets .ver-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === activePresetType);
  });

  if (nextInput) {
    nextInput.value = selectedVer;
    setTimeout(() => {
      nextInput.focus();
      nextInput.select();
    }, 50);
  }

  showModal('releaseVersionModal');
};

const confirmReleaseVersion = async () => {
  const projectId = document.getElementById('releaseVersionProjectId')?.value;
  const platform = document.getElementById('releaseVersionPlatform')?.value;
  const nextInput = document.getElementById('nextReleaseVersionInput');
  const releaseVer = (nextInput?.value || '').trim();

  if (!releaseVer) {
    showToast('Please specify the version to release');
    if (nextInput) nextInput.focus();
    return;
  }

  closeModals();
  await releaseProjectVersion(projectId, platform, releaseVer);
};

const releaseProjectVersion = async (projectId, platform, releaseVer = null) => {
  const p = state.projects.find(proj => proj.id === projectId);
  if (!p) return;
  const now = new Date().toISOString();

  const formatVersionLabel = (v) => {
    if (!v) return '';
    return v.toLowerCase().startsWith('v') ? v : 'v' + v;
  };

  let releasedVersion = releaseVer;

  if (platform === 'android') {
    if (!releasedVersion) {
      releasedVersion = p.androidUpcomingVersion || incrementVersion(p.androidPreviousVersion || '1.0.0');
    }
    p.androidPreviousVersion = releasedVersion;
    p.androidUpcomingVersion = incrementVersion(releasedVersion);
    p.lastReleaseLog = `Android ${formatVersionLabel(releasedVersion)} released`;
  } else if (platform === 'ios') {
    if (!releasedVersion) {
      releasedVersion = p.iosUpcomingVersion || incrementVersion(p.iosPreviousVersion || '1.0.0');
    }
    p.iosPreviousVersion = releasedVersion;
    p.iosUpcomingVersion = incrementVersion(releasedVersion);
    p.lastReleaseLog = `iOS ${formatVersionLabel(releasedVersion)} released`;
  } else {
    // web
    if (!releasedVersion) {
      releasedVersion = p.upcomingVersion || p.version || incrementVersion(p.previousVersion || '1.0.0');
    }
    p.previousVersion = releasedVersion;
    p.upcomingVersion = incrementVersion(releasedVersion);
    p.lastReleaseLog = `${formatVersionLabel(releasedVersion)} released`;
  }

  // Check if a release exists in Release Management for this project and version
  const vNorm = releasedVersion.toLowerCase().replace(/^v/, '').trim();
  const matchingRelease = (state.releases || []).find(r => {
    const projIds = r.projectIds || (r.projectId ? [r.projectId] : []);
    const vers = r.versions || (r.version ? [r.version] : []);
    const pMatch = projIds.includes(projectId);
    const vMatch = vers.some(v => (v || '').toLowerCase().replace(/^v/, '').trim() === vNorm);
    return pMatch && (vMatch || vers.length === 0);
  });

  const effectiveReleaseDate = (matchingRelease && matchingRelease.releaseDate) ? matchingRelease.releaseDate : now;

  p.lastReleaseAt = effectiveReleaseDate;
  p.updatedAt = now;

  p.releaseHistory = p.releaseHistory || [];
  p.releaseHistory.unshift({
    version: releasedVersion,
    platform: platform.toUpperCase(),
    releasedAt: effectiveReleaseDate,
    log: p.lastReleaseLog
  });
  if (p.releaseHistory.length > 10) {
    p.releaseHistory = p.releaseHistory.slice(0, 10);
  }

  // Log activity
  const nextTargetVer = (platform === 'android' ? p.androidUpcomingVersion : (platform === 'ios' ? p.iosUpcomingVersion : p.upcomingVersion));
  logActivity(`Project "${p.name}" version ${releasedVersion} (${platform.toUpperCase()}) was marked as released! 🚀 Next upcoming version set to ${nextTargetVer}`, 'project');
  showToast(`🚀 Version ${releasedVersion} released!`);

  await storage.save();
  render();
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
  patchReleasePtCard(rp);
};

// ─── Release Points Modal ─────────────────────────────────
let rpChecklistItems = []; // local checklist buffer

const populateReleasePtVersions = (projectIdOrIds, selectedVersions = []) => {
  const container = document.getElementById('releasePtVersions');
  if (!container) return;
  const pids = Array.isArray(projectIdOrIds) ? projectIdOrIds : (projectIdOrIds ? [projectIdOrIds] : []);
  if (pids.length === 0) {
    container.innerHTML = emptyNote('Select project(s) first.');
    return;
  }
  let html = '';
  pids.forEach(pid => {
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    const versions = getProjectVersions(proj);
    if (versions.length > 0) {
      html += `<div style="font-weight:600; font-size:11.5px; color:var(--text-secondary); width:100%; margin-top:8px; margin-bottom:4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">${proj.name}</div>`;
      html += versions.map(v => `
        <label class="rp-version-checkbox-label">
          <input type="checkbox" name="rpVersionCheck" value="${v}" ${selectedVersions.includes(v) ? 'checked' : ''} />
          ${v}
        </label>
      `).join('');
    }
  });
  if (!html) {
    container.innerHTML = emptyNote('No versions configured for the selected project(s).');
  } else {
    container.innerHTML = html;
  }
};

const populateReleasePtReleases = (projectIdOrIds, selectedReleaseId = '') => {
  const select = document.getElementById('releasePtRelease');
  if (!select) return;
  const pids = Array.isArray(projectIdOrIds) ? projectIdOrIds : (projectIdOrIds ? [projectIdOrIds] : []);
  if (pids.length === 0) {
    select.innerHTML = `<option value="">— Select Release —</option>`;
    return;
  }
  // Any release that includes one of the selected projects (not just its first project).
  const projectReleases = (state.releases || []).filter(r => releaseProjectIdsOf(r).some(id => pids.includes(id)));
  select.innerHTML = `<option value="">— Select Release —</option>` +
    projectReleases.map(r => {
      const proj = state.projects.find(p => p.id === releaseProjectIdsOf(r).find(id => pids.includes(id)));
      const prefix = proj ? `${proj.name}: ` : '';
      const vers = releaseVersionsOf(r).join(', ');
      return `<option value="${r.id}" ${selectedReleaseId === r.id ? 'selected' : ''}>${escapeHtml(prefix + (r.name || 'Untitled release') + (vers ? ` (${vers})` : ''))}</option>`;
    }).join('');
};

const populateReleasePtDevs = (projectIdOrIds, selectedDevIds = []) => {
  const container = document.getElementById('releasePtDevChecklist');
  if (!container) return;
  const pids = Array.isArray(projectIdOrIds) ? projectIdOrIds : (projectIdOrIds ? [projectIdOrIds] : []);
  if (pids.length === 0) {
    container.innerHTML = emptyNote('Select project(s) first.');
    return;
  }
  const devs = state.developers.filter(d =>
    (d.projectIds || []).some(pid => pids.includes(pid))
  );
  if (devs.length === 0) {
    container.innerHTML = emptyNote('No developers for the selected project(s).');
    return;
  }
  container.innerHTML = devs.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="rpDevCheck" value="${d.id}" ${selectedDevIds.includes(d.id) ? 'checked' : ''} />
      <span>${d.name}</span>
    </label>
  `).join('');
};

const syncChecklistItemsFromDOM = () => {
  document.querySelectorAll('.rp-checklist-row').forEach(row => {
    const idx = parseInt(row.dataset.clIdx);
    if (rpChecklistItems[idx]) {
      const textInp = row.querySelector('.rp-cl-text');
      const ticketInp = row.querySelector('.rp-cl-ticket');
      const devSel = row.querySelector('.rp-cl-developer');
      if (textInp) rpChecklistItems[idx].text = textInp.value;
      if (ticketInp) rpChecklistItems[idx].ticket = ticketInp.value;
      if (devSel) rpChecklistItems[idx].developerId = devSel.value;
    }
  });
};

const renderChecklistEditor = () => {
  const container = document.getElementById('checklistItemsContainer');
  if (!container) return;
  if (rpChecklistItems.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;font-style:italic;text-align:center;padding:8px 0;">Click "Add Item" to add checklist items.</div>';
    return;
  }

  // Get currently selected projects in the modal to filter developers
  const projectChecks = document.querySelectorAll('input[name="rpProjectCheck"]:checked');
  const projectIds = Array.from(projectChecks).map(cb => cb.value);
  let filteredDevs = state.developers;
  if (projectIds.length > 0) {
    filteredDevs = state.developers.filter(d =>
      (d.projectIds || []).some(pid => projectIds.includes(pid))
    );
  }

  container.innerHTML = rpChecklistItems.map((item, idx) => {
    const devOptions = `<option value="">${item.jiraAssignee ? `Jira: ${escapeHtml(item.jiraAssignee)}` : '— Assignee —'}</option>` +
      filteredDevs.map(d => `<option value="${d.id}" ${item.developerId === d.id ? 'selected' : ''}>${d.name}</option>`).join('');

    return `
      <div class="rp-checklist-row" data-cl-idx="${idx}">
        <div class="rp-cl-fields">
          <input type="text" class="rp-cl-text" data-idx="${idx}" value="${item.text.replace(/"/g, '&quot;')}" placeholder="e.g. QA sign-off received" />
          <div class="rp-cl-row-bottom">
            <input type="text" class="rp-cl-ticket" data-idx="${idx}" value="${(item.ticket || '').replace(/"/g, '&quot;')}" placeholder="Ticket # or full URL (e.g. https://…)" />
            <select class="rp-cl-developer" data-idx="${idx}">
              ${devOptions}
            </select>
          </div>
        </div>
        <button type="button" class="rp-checklist-remove-btn" data-idx="${idx}" aria-label="Remove item" title="Remove item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    `;
  }).join('');

  // Wire delete buttons directly (they are inside the modal, not mainContent)
  container.querySelectorAll('.rp-checklist-remove-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      syncChecklistItemsFromDOM();
      const idx = parseInt(btn.dataset.idx);
      rpChecklistItems.splice(idx, 1);
      renderChecklistEditor();
      showToast('Checklist item removed');
    };
  });
};

const loadReleasePtProjectsList = (selectedProjectIds = []) => {
  const container = document.getElementById('releasePtProjects');
  if (!container) return;
  container.innerHTML = state.projects.map(p => `
    <label class="dev-project-label">
      <input type="checkbox" name="rpProjectCheck" value="${p.id}" ${selectedProjectIds.includes(p.id) ? 'checked' : ''} />
      <span>${p.name}</span>
    </label>
  `).join('');

  // Wire checkbox change to reload lists
  container.querySelectorAll('input[name="rpProjectCheck"]').forEach(cb => {
    cb.onchange = () => {
      syncChecklistItemsFromDOM();
      const checkedIds = Array.from(container.querySelectorAll('input[name="rpProjectCheck"]:checked')).map(c => c.value);
      populateReleasePtVersions(checkedIds);
      populateReleasePtReleases(checkedIds);
      populateReleasePtDevs(checkedIds);
      renderChecklistEditor();
      updateJiraImportButton();
    };
  });
};

const openReleasePtModal = (id = null) => {
  document.getElementById('releasePtModalTitle').textContent = id ? 'Edit Release Point' : 'New Release Point';
  document.getElementById('releasePtId').value = '';

  if (id) {
    const rp = (state.releasePoints || []).find(r => r.id === id);
    if (!rp) return;
    document.getElementById('releasePtId').value = rp.id;
    document.getElementById('releasePtTitle').value = rp.title;
    document.getElementById('releasePtType').value = rp.releaseType || 'upcoming';

    // Set type toggle UI
    document.querySelectorAll('.rp-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rtype === (rp.releaseType || 'upcoming'));
    });

    const projectIds = rp.projectIds || (rp.projectId ? [rp.projectId] : []);
    loadReleasePtProjectsList(projectIds);
    populateReleasePtVersions(projectIds, rp.versions || []);
    populateReleasePtReleases(projectIds, rp.releaseId || '');
    populateReleasePtDevs(projectIds, rp.developerIds || []);

    rpChecklistItems = (rp.checklistItems || []).map(i => ({ ...i }));
  } else {
    document.getElementById('releasePtTitle').value = '';
    document.getElementById('releasePtRelease').innerHTML = `<option value="">— Select Release —</option>`;
    document.getElementById('releasePtType').value = 'upcoming';
    document.querySelectorAll('.rp-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rtype === 'upcoming');
    });
    loadReleasePtProjectsList([]);
    populateReleasePtVersions([]);
    populateReleasePtDevs([]);
    rpChecklistItems = [];
  }

  // Reset panels to hidden state
  document.getElementById('bulkAddPanel').style.display = 'none';
  document.getElementById('bulkAssignPanel').style.display = 'none';
  closeJiraImportPanel();
  wireJiraImportPanel();
  updateJiraImportButton();
  document.getElementById('jiraImportToggleBtn').onclick = () => {
    if (jiraImport || document.getElementById('jiraImportPanel').style.display !== 'none') { closeJiraImportPanel(); return; }
    syncChecklistItemsFromDOM(); // so duplicate detection sees unsaved edits
    openJiraImportPanel();
  };

  renderChecklistEditor();

  // Wire type toggle
  document.querySelectorAll('.rp-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.rp-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('releasePtType').value = btn.dataset.rtype;
    };
  });

  // Wire add checklist item button
  document.getElementById('addChecklistItemBtn').onclick = () => {
    syncChecklistItemsFromDOM();
    rpChecklistItems.push({ id: uid(), text: '', ticket: '', developerId: '', done: false });
    renderChecklistEditor();
    const inputs = document.querySelectorAll('.rp-cl-text');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };

  // Wire bulk add panel
  const bulkAddPanel = document.getElementById('bulkAddPanel');
  document.getElementById('bulkAddToggleBtn').onclick = () => {
    const visible = bulkAddPanel.style.display !== 'none';
    bulkAddPanel.style.display = visible ? 'none' : 'block';
    document.getElementById('bulkAssignPanel').style.display = 'none';
    if (!visible) document.getElementById('bulkCountInput').focus();
  };
  document.getElementById('bulkCountDecBtn').onclick = () => {
    const inp = document.getElementById('bulkCountInput');
    inp.value = Math.max(1, parseInt(inp.value || '3') - 1);
  };
  document.getElementById('bulkCountIncBtn').onclick = () => {
    const inp = document.getElementById('bulkCountInput');
    inp.value = Math.min(50, parseInt(inp.value || '3') + 1);
  };
  document.getElementById('bulkAddConfirmBtn').onclick = () => {
    const count = Math.max(1, Math.min(50, parseInt(document.getElementById('bulkCountInput').value) || 3));
    syncChecklistItemsFromDOM();
    for (let i = 0; i < count; i++) {
      rpChecklistItems.push({ id: uid(), text: '', ticket: '', developerId: '', done: false });
    }
    bulkAddPanel.style.display = 'none';
    renderChecklistEditor();
    const inputs = document.querySelectorAll('.rp-cl-text');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };

  // Wire bulk assign panel
  const bulkAssignPanel = document.getElementById('bulkAssignPanel');
  document.getElementById('bulkAssignToggleBtn').onclick = () => {
    const visible = bulkAssignPanel.style.display !== 'none';
    bulkAssignPanel.style.display = visible ? 'none' : 'block';
    bulkAddPanel.style.display = 'none';
    if (!visible) {
      const projectChecks = document.querySelectorAll('input[name="rpProjectCheck"]:checked');
      const projectIds = Array.from(projectChecks).map(cb => cb.value);
      let devs = state.developers;
      if (projectIds.length > 0) {
        devs = state.developers.filter(d => (d.projectIds || []).some(pid => projectIds.includes(pid)));
      }
      const sel = document.getElementById('bulkAssignDevSelect');
      sel.innerHTML = '<option value="">— Select Developer —</option>' +
        devs.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    }
  };
  document.getElementById('bulkAssignConfirmBtn').onclick = () => {
    const devId = document.getElementById('bulkAssignDevSelect').value;
    if (!devId) { showToast('Please select a developer first', 'error'); return; }
    syncChecklistItemsFromDOM();
    rpChecklistItems.forEach(item => { item.developerId = devId; });
    bulkAssignPanel.style.display = 'none';
    renderChecklistEditor();
    showToast('Developer assigned to all items');
  };

  showModal('releasePtModal');
};

const saveReleasePoint = async () => {
  syncChecklistItemsFromDOM();

  const id = document.getElementById('releasePtId').value;
  let savedRpId = id;
  const title = document.getElementById('releasePtTitle').value.trim();
  const projectChecks = document.querySelectorAll('input[name="rpProjectCheck"]:checked');
  const projectIds = Array.from(projectChecks).map(cb => cb.value);
  const projectId = projectIds.length > 0 ? projectIds[0] : '';
  const releaseId = document.getElementById('releasePtRelease').value;
  const releaseType = document.getElementById('releasePtType').value || 'upcoming';

  if (!title) { showToast('Release point title is required', 'error'); return; }
  if (projectIds.length === 0) { showToast('Please select at least one project', 'error'); return; }

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
      title, projectId, projectIds, releaseId, releaseType, versions, developerIds,
      checklistItems, isCompleted, updatedAt: now
    };
    logActivity(`Updated release point "${title}"`, 'project');
    showToast('Release point updated');
  } else {
    if (!state.releasePoints) state.releasePoints = [];
    const newId = uid();
    state.releasePoints.unshift({
      id: newId, title, projectId, projectIds, releaseId, releaseType, versions,
      developerIds, checklistItems, isCompleted, createdAt: now, updatedAt: now
    });
    logActivity(`Created release point "${title}"`, 'project');
    showToast('Release point created');
    savedRpId = newId;
  }
  // Show what was just saved: keep it open in the Release Points accordion.
  if (!state.rpExpanded) state.rpExpanded = new Set();
  state.rpExpanded.add(savedRpId);

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

// ─── Test Case Management ────────────────────────────────
// Three levels:
//   home      (no project)            → summary + project cards
//   overview  (project, tcPage 'overview')  → KPIs, charts, modules, open failures
//   scenarios (project, tcPage 'scenarios') → module rail + scenario table
// The scenario table keeps the original hooks (table-inline-* fields with
// data-field/data-id autosave, .testcase-select-checkbox, #selectAllTcCb,
// data-tcfilter selects, #tcPageSizeSelect, .module-item, selection bar ids), so the
// existing delegated handlers keep doing the editing, filtering and paging.
const TC_STATUSES = ['Passed', 'Failed', 'Blocked', 'Untested'];
const tcCounts = (cases) => {
  const c = { total: cases.length, passed: 0, failed: 0, blocked: 0, untested: 0, automated: 0 };
  cases.forEach(tc => {
    if (tc.status === 'Passed') c.passed++;
    else if (tc.status === 'Failed') c.failed++;
    else if (tc.status === 'Blocked') c.blocked++;
    else c.untested++; // 'Untested' and anything unexpected
    if (tc.type === 'Automated') c.automated++;
  });
  c.rate = c.total ? Math.round(c.passed / c.total * 1000) / 10 : 0;
  return c;
};
const tcRateCls = (r, total) => !total ? 'none' : r >= 95 ? 'good' : r >= 80 ? 'ok' : 'low';
const tcBar = (c, cls = '') => `<span class="dbx-stackbar ${cls}">${[['pass', c.passed], ['fail', c.failed], ['blocked', c.blocked], ['notrun', c.untested]].filter(([, n]) => n).map(([k, n]) => `<span class="${k}" style="flex:${n}" title="${({ pass: 'Passed', fail: 'Failed', blocked: 'Blocked', notrun: 'Untested' })[k]}: ${n}"></span>`).join('')}</span>`;
const tcRing = (rate, total, size = 44) => {
  const r = size / 2 - 4, circ = 2 * Math.PI * r;
  return `
    <span class="tc-ring ${tcRateCls(rate, total)}" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - (total ? rate : 0) / 100)).toFixed(2)}"/></svg>
      <span>${total ? Math.round(rate) + '%' : '—'}</span>
    </span>`;
};
const tcDonut = (c) => {
  const segs = [['pass', c.passed], ['fail', c.failed], ['blocked', c.blocked], ['notrun', c.untested]].filter(([, n]) => n);
  const r = 46, circ = 2 * Math.PI * r;
  let off = 0;
  const arcs = segs.map(([k, n]) => {
    const len = c.total ? n / c.total * circ : 0;
    const gap = segs.length > 1 ? Math.min(2, len / 3) : 0;
    const s = `<circle class="seg ${k}" cx="60" cy="60" r="${r}" stroke-dasharray="${Math.max(len - gap, 0).toFixed(2)} ${(circ - Math.max(len - gap, 0)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    off += len;
    return s;
  }).join('');
  return `
    <div class="tc-donut">
      <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="${r}"/>${arcs}</svg>
      <div class="tc-donut-center"><strong>${c.rate}%</strong><span>pass rate</span></div>
    </div>`;
};
// Only real YYYY-MM-DD dates count (some imported cases hold free text there).
const tcLastRun = (cases) => cases.map(tc => tc.executionDate).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d || '') && !isNaN(new Date(d))).sort().pop() || '';
// "https://…/browse/CIMTRACK-655" → "CIMTRACK-655"; plain IDs unchanged.
const tcDefectLabel = (d) => { const s = String(d || '').trim(); const m = s.match(/([A-Z][A-Z0-9_]*-\d+)\s*$/i); return /^https?:\/\//i.test(s) && m ? m[1] : s; };
const tcCrumbs = (items) => `
  <nav class="tc-crumbs" aria-label="Breadcrumb">
    ${items.map((it, i) => i < items.length - 1
      ? `<button type="button" class="tc-crumb" data-action="${it.action}">${it.label}</button><span class="tc-crumb-sep" aria-hidden="true">/</span>`
      : `<span class="tc-crumb current" aria-current="page">${it.label}</span>`).join('')}
  </nav>`;
const TC_I = {
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3v7.2a4 4 0 01-1.3 2.9l-3.4 3.1A2 2 0 005.7 20h12.6a2 2 0 001.4-3.8l-3.4-3.1A4 4 0 0115 10.2V3"/><path d="M7 3h10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 18l6-6-6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>'
};

// ── Level 1: home ──
const renderTcHome = () => {
  const all = tcCounts(state.testCases);
  const q = (state.tcHomeSearch || '').toLowerCase().trim();
  const sort = state.tcHomeSort || 'cases';
  const rows = state.projects.map(p => {
    const cases = state.testCases.filter(tc => tc.projectId === p.id);
    return { p, cases, c: tcCounts(cases), modules: state.modules.filter(m => m.projectId === p.id).length, last: tcLastRun(cases) };
  }).filter(r => !q || r.p.name.toLowerCase().includes(q));
  const withCases = rows.filter(r => r.c.total);
  const empty = rows.filter(r => !r.c.total);
  const sorters = { cases: (a, b) => b.c.total - a.c.total, rate: (a, b) => a.c.rate - b.c.rate, failed: (a, b) => b.c.failed - a.c.failed, name: (a, b) => a.p.name.localeCompare(b.p.name) };
  withCases.sort(sorters[sort] || sorters.cases);
  const ringR = 26, ringC = 2 * Math.PI * ringR;

  const card = (r) => `
    <button type="button" class="tch-card" data-action="tc-open-project" data-id="${r.p.id}">
      <span class="tch-card-top">
        <span class="tch-card-name">${highlight(escapeHtml(r.p.name), q)}</span>
        ${tcRing(r.c.rate, r.c.total)}
      </span>
      <span class="tch-card-meta">${r.c.total} cases · ${r.modules} module${r.modules === 1 ? '' : 's'}${r.last ? ` · last run ${fmtDate(r.last)}` : ''}</span>
      ${tcBar(r.c)}
      <span class="tch-card-counts">
        <span><i class="dbx-dot pass"></i>${r.c.passed}</span>
        <span><i class="dbx-dot fail"></i>${r.c.failed}</span>
        <span><i class="dbx-dot blocked"></i>${r.c.blocked}</span>
        <span><i class="dbx-dot notrun"></i>${r.c.untested}</span>
        ${r.c.failed ? `<span class="dbx-tag danger">${r.c.failed} failing</span>` : r.c.total && r.c.passed === r.c.total ? '<span class="dbx-tag ok">All passing</span>' : ''}
      </span>
    </button>`;

  return `
    <div class="tc-page">
      <section class="rpa-hero">
        <div class="rpa-hero-main">
          <span class="rpa-hero-icon">${TC_I.flask}</span>
          <div>
            <h2 class="rpa-hero-title">Test Cases</h2>
            <p class="rpa-hero-sub">Test coverage and results across your projects.</p>
          </div>
        </div>
        <div class="rpa-hero-stats">
          <div class="rpa-hstat"><strong>${all.total}</strong><span>Total</span></div>
          <div class="rpa-hstat"><strong class="ok">${all.passed}</strong><span>Passed</span></div>
          <div class="rpa-hstat"><strong class="bad">${all.failed}</strong><span>Failed</span></div>
          <div class="rpa-hstat"><strong class="warn">${all.blocked}</strong><span>Blocked</span></div>
          <div class="rpa-hstat"><strong>${all.untested}</strong><span>Untested</span></div>
          <div class="rpa-hero-ring" title="${all.passed} of ${all.total} passed">
            <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${ringR}"/><circle class="fill" cx="32" cy="32" r="${ringR}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${(ringC * (1 - all.rate / 100)).toFixed(2)}"/></svg>
            <span><strong>${all.rate}%</strong><em>pass rate</em></span>
          </div>
        </div>
      </section>

      <div class="rpa-toolbar">
        <div class="page-search-wrap rpa-search">
          <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="page-search-input" id="tcHomeSearchInput" placeholder="Search projects…" value="${escapeHtml(state.tcHomeSearch || '')}" />
        </div>
        <select class="filter-select" id="tcHomeSort" aria-label="Sort projects">
          <option value="cases" ${sort === 'cases' ? 'selected' : ''}>Most test cases</option>
          <option value="failed" ${sort === 'failed' ? 'selected' : ''}>Most failures</option>
          <option value="rate" ${sort === 'rate' ? 'selected' : ''}>Lowest pass rate</option>
          <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
        </select>
        <div class="rpa-toolbar-right">
          <button type="button" class="btn-ghost rpa-tool-btn st-btn" id="openExcelImportModalBtn">${TC_I.upload}Import Excel</button>
          <button type="button" class="btn-primary rpa-new" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        </div>
      </div>

      ${withCases.length ? `
        <section class="rpa-group">
          <div class="rpa-group-head"><span class="rpa-group-dot" style="background:var(--accent)"></span>Projects with test cases<span class="rpa-group-count">${withCases.length}</span></div>
          <div class="tch-grid">${withCases.map(card).join('')}</div>
        </section>` : ''}
      ${empty.length ? `
        <section class="rpa-group">
          <div class="rpa-group-head"><span class="rpa-group-dot" style="background:var(--status-planned)"></span>No test cases yet<span class="rpa-group-count">${empty.length}</span></div>
          <div class="tch-empty-list">
            ${empty.map(r => `<button type="button" class="tch-empty-chip" data-action="tc-open-project" data-id="${r.p.id}">${TC_I.folder}<span>${highlight(escapeHtml(r.p.name), q)}</span><em>Add tests</em></button>`).join('')}
          </div>
        </section>` : ''}
      ${!rows.length ? `<div class="rpa-empty"><h3>No projects match “${escapeHtml(state.tcHomeSearch)}”</h3><p>Try a different name.</p></div>` : ''}
    </div>`;
};

// ── Level 2: project overview ──
const renderTcOverview = (proj) => {
  const cases = state.testCases.filter(tc => tc.projectId === proj.id);
  const c = tcCounts(cases);
  const mods = state.modules.filter(m => m.projectId === proj.id);
  const last = tcLastRun(cases);
  const head = `
    ${tcCrumbs([{ label: 'Test Cases', action: 'tc-home' }, { label: escapeHtml(proj.name) }])}
    <section class="tco-head">
      <div class="tco-head-main">
        <h2>${escapeHtml(proj.name)}</h2>
        <p>${c.total} test case${c.total === 1 ? '' : 's'} · ${mods.length} module${mods.length === 1 ? '' : 's'}${last ? ` · last run ${fmtDate(last)}` : ''}</p>
      </div>
      <div class="tco-head-actions">
        <button type="button" class="btn-ghost st-btn" id="openExcelImportModalBtn">${TC_I.upload}Import Excel</button>
        <button type="button" class="btn-ghost st-btn" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        ${c.total ? `<button type="button" class="btn-primary st-btn tco-open" data-action="tc-open-scenarios">${TC_I.list}Open test scenarios${TC_I.arrow}</button>` : ''}
      </div>
    </section>`;

  if (!c.total) {
    return `<div class="tc-page">${head}
      <div class="rpa-empty">
        <span class="rpa-empty-icon">${TC_I.flask}</span>
        <h3>No test cases in ${escapeHtml(proj.name)} yet</h3>
        <p>Import them from an Excel sheet or add them one at a time.</p>
        <div class="tco-empty-actions">
          <button type="button" class="btn-primary st-btn" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        </div>
      </div></div>`;
  }

  const kpi = (n, l, cls = '') => `<div class="po-stat ${cls}"><span class="po-stat-num">${n}</span><span class="po-stat-label">${l}</span></div>`;
  const breakdown = (title, groups) => {
    const max = Math.max(1, ...groups.map(g => g.c.total));
    return `
      <div class="tco-card">
        <h3 class="tco-card-title">${title}</h3>
        <div class="tco-bars">
          ${groups.filter(g => g.c.total).map(g => `
            <div class="tco-bar-row" title="${escapeHtml(g.label)}: ${g.c.passed} passed, ${g.c.failed} failed, ${g.c.blocked} blocked, ${g.c.untested} untested">
              <span class="tco-bar-label">${escapeHtml(g.label)}</span>
              <span class="tco-bar-track"><span style="width:${g.c.total / max * 100}%">${tcBar(g.c, 'slim')}</span></span>
              <span class="tco-bar-n">${g.c.total}</span>
            </div>`).join('') || '<div class="dbx-empty">No data</div>'}
        </div>
      </div>`;
  };
  const by = (field, values, labelOf = v => v) => values.map(v => ({ label: labelOf(v), c: tcCounts(cases.filter(tc => (tc[field] || '') === v)) }));
  const assignees = [...new Set(cases.map(tc => tc.assignee || ''))];
  const assigneeGroups = assignees.map(a => ({ label: a || 'Unassigned', c: tcCounts(cases.filter(tc => (tc.assignee || '') === a)) }))
    .sort((a, b) => b.c.total - a.c.total).slice(0, 6);

  const moduleRows = [...mods.map(m => ({ id: m.id, name: m.name, cases: cases.filter(tc => tc.moduleId === m.id) })),
    { id: '', name: 'No module', cases: cases.filter(tc => !tc.moduleId || !mods.some(m => m.id === tc.moduleId)) }]
    .filter(r => r.id || r.cases.length);
  const failures = cases.filter(tc => tc.status === 'Failed' || tc.status === 'Blocked')
    .sort((a, b) => (b.executionDate || '').localeCompare(a.executionDate || '') || (a.severity || 'S9').localeCompare(b.severity || 'S9'));
  const modName = (id) => (mods.find(m => m.id === id) || {}).name || 'No module';

  return `
    <div class="tc-page">
      ${head}
      <div class="po-stats tco-kpis">
        ${kpi(c.total, 'Test cases')}
        ${kpi(c.passed, 'Passed', 'tone-done')}
        ${kpi(c.failed, 'Failed', 'tone-fail')}
        ${kpi(c.blocked, 'Blocked', 'tone-hold')}
        ${kpi(c.untested, 'Untested', 'tone-todo')}
        ${kpi(`${c.rate}%`, 'Pass rate', 'tone-done')}
        ${kpi(`${c.total ? Math.round(c.automated / c.total * 100) : 0}%`, 'Automated', 'tone-team')}
      </div>

      <div class="tco-grid">
        <div class="tco-card tco-status">
          <h3 class="tco-card-title">Results</h3>
          <div class="tco-status-body">
            ${tcDonut(c)}
            <div class="tco-legend">
              ${[['pass', 'Passed', c.passed], ['fail', 'Failed', c.failed], ['blocked', 'Blocked', c.blocked], ['notrun', 'Untested', c.untested]].map(([k, l, n]) => `
                <div class="tco-legend-row"><i class="dbx-dot ${k}"></i><span>${l}</span><strong>${n}</strong><em>${c.total ? Math.round(n / c.total * 100) : 0}%</em></div>`).join('')}
            </div>
          </div>
        </div>
        ${breakdown('By priority', by('priority', ['Critical', 'High', 'Medium', 'Low']))}
        ${breakdown('By type', by('type', ['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression']))}
        ${breakdown('By assignee', assigneeGroups)}
      </div>

      <section class="tco-card">
        <div class="tco-card-head">
          <h3 class="tco-card-title">Modules <span class="rpa-group-count">${mods.length}</span></h3>
          <button type="button" class="btn-ghost st-btn" id="openAddModuleModalBtn">${TC_I.plus}Add Module</button>
        </div>
        <div class="tco-mod-table">
          <div class="tco-mod-row tco-mod-headrow"><span>Module</span><span>Results</span><span>Pass</span><span>Failed</span><span>Cases</span><span></span></div>
          ${moduleRows.map(r => {
            const mc = tcCounts(r.cases);
            return `
              <div class="tco-mod-row">
                <button type="button" class="tco-mod-name" data-action="tc-open-module" data-id="${r.id || 'none'}" title="View scenarios in ${escapeHtml(r.name)}">${TC_I.folder}<span>${escapeHtml(r.name)}</span></button>
                ${tcBar(mc, 'slim')}
                <span class="dbx-tc-rate ${tcRateCls(mc.rate, mc.total)}">${mc.total ? mc.rate + '%' : '—'}</span>
                <span>${mc.failed ? `<span class="dbx-tag danger">${mc.failed} failed</span>` : ''}</span>
                <span class="tco-mod-n">${mc.total}</span>
                <span class="tco-mod-actions">
                  ${r.id ? `
                    <button class="icon-btn" data-action="edit-module" data-id="${r.id}" aria-label="Rename module" title="Rename module">${TC_I.edit}</button>
                    <button class="icon-btn danger" data-action="delete-module" data-id="${r.id}" aria-label="Delete module" title="Delete module">${TC_I.trash}</button>` : ''}
                </span>
              </div>`;
          }).join('') || '<div class="dbx-empty">No modules yet. Group related scenarios with “Add Module”.</div>'}
        </div>
      </section>

      <section class="tco-card">
        <div class="tco-card-head">
          <h3 class="tco-card-title">Open failures <span class="rpa-group-count">${failures.length}</span></h3>
          ${failures.length ? `<button type="button" class="btn-ghost st-btn" data-action="tc-open-failures">View all in scenarios${TC_I.arrow}</button>` : ''}
        </div>
        ${failures.length ? `<div class="tco-fail-list">
          ${failures.slice(0, 8).map(tc => `
            <button type="button" class="tco-fail" data-action="view-testcase" data-id="${escapeHtml(tc.id)}">
              <span class="tco-fail-id">${escapeHtml(tc.id)}</span>
              <span class="tco-fail-main">
                <span class="tco-fail-title">${escapeHtml(tc.scenario || tc.title || '')}</span>
                <span class="tco-fail-sub">${escapeHtml([modName(tc.moduleId), tc.assignee, tc.defectId ? `Defect ${tcDefectLabel(tc.defectId)}` : ''].filter(Boolean).join(' · '))}</span>
              </span>
              <span class="tcs-pill ${(tc.status || '').toLowerCase()}">${escapeHtml(tc.status)}</span>
              ${tc.severity ? `<span class="tco-sev">${escapeHtml(tc.severity.split(' ')[0])}</span>` : ''}
            </button>`).join('')}
        </div>` : `<div class="dbx-empty">Nothing failing or blocked. 🎉</div>`}
      </section>
    </div>`;
};

// ── Level 3: test scenarios ──
const renderTcScenarioRow = (tc, index, projModules) => {
  const id = escapeHtml(tc.id);
  const open = state.tcExpanded && state.tcExpanded.has(tc.id);
  const checked = state.selectedTestCaseIds && state.selectedTestCaseIds.has(tc.id);
  const st = (tc.status || 'Untested').toLowerCase();
  const sel = (field, options, value, cls = '') => `
    <select class="table-inline-select tcs-select ${cls}" data-field="${field}" data-id="${id}" aria-label="${field}">
      ${options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${value === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
    </select>`;
  const area = (field, label, rows = 3) => `
    <label class="tcs-field"><span>${label}</span><textarea class="table-inline-textarea" data-field="${field}" data-id="${id}" rows="${rows}">${escapeHtml(field === 'scenario' ? (tc.scenario || tc.title || '') : (tc[field] || ''))}</textarea></label>`;
  const modName = (projModules.find(m => m.id === tc.moduleId) || {}).name || 'No module';
  return `
    <tr class="tcs-row ${open ? 'open' : ''} ${checked ? 'selected' : ''} st-${st}" data-id="${id}">
      <td class="tcs-c-check"><input type="checkbox" class="testcase-select-checkbox" data-id="${id}" ${checked ? 'checked' : ''} aria-label="Select ${id}" /></td>
      <td class="tcs-c-id"><span class="tcs-id" title="Row ${index + 1}">${id}</span></td>
      <td class="tcs-c-scn">
        <button type="button" class="tcs-toggle" data-action="tc-row-toggle" data-id="${id}" aria-expanded="${open}" title="${open ? 'Hide' : 'Show'} details">
          <span class="tcs-chev">${TC_I.chev}</span>
          <span class="tcs-scn">
            <span class="tcs-scn-title">${escapeHtml(tc.scenario || tc.title || 'Untitled scenario')}</span>
            <span class="tcs-scn-sub"><span class="tcs-scn-mod">${escapeHtml(modName)}</span>${tc.simplifiedScenario ? ` · ${escapeHtml(tc.simplifiedScenario)}` : ''}</span>
          </span>
        </button>
      </td>
      <td class="tcs-c-st">${sel('status', TC_STATUSES.map(s => [s, s]), tc.status || 'Untested', `tcs-pill ${st}`)}</td>
      <td class="tcs-c-pr">${sel('priority', [['Critical', 'Critical'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']], tc.priority || 'Medium', `tcs-prio ${(tc.priority || 'medium').toLowerCase()}`)}</td>
      <td class="tcs-c-as">${sel('assignee', [['', 'Unassigned'], ...state.developers.map(d => [d.name, d.name])], tc.assignee || '')}</td>
      <td class="tcs-c-dt"><input type="date" class="table-inline-input tcs-date" data-field="executionDate" data-id="${id}" value="${/^\d{4}-\d{2}-\d{2}$/.test(tc.executionDate || '') ? escapeHtml(tc.executionDate) : ''}" aria-label="Execution date" /></td>
      <td class="tcs-c-act">
        <button class="icon-btn" data-action="view-testcase" data-id="${id}" aria-label="Open details" title="Open details">${TC_I.eye}</button>
        <button class="icon-btn danger" data-action="delete-testcase" data-id="${id}" aria-label="Delete test case" title="Delete">${TC_I.trash}</button>
      </td>
    </tr>
    ${open ? `
      <tr class="tcs-detail" data-id="${id}">
        <td colspan="8">
          <div class="tcs-detail-props">
            <label class="tcs-field"><span>Module</span>${sel('moduleId', [['', '— None —'], ...projModules.map(m => [m.id, m.name])], tc.moduleId || '', 'tcs-boxed')}</label>
            <label class="tcs-field"><span>Severity</span>${sel('severity', [['S1 - Blocker', 'S1 – Blocker'], ['S2 - Critical', 'S2 – Critical'], ['S3 - Major', 'S3 – Major'], ['S4 - Minor', 'S4 – Minor']], tc.severity || 'S3 - Major', 'tcs-boxed')}</label>
            <label class="tcs-field"><span>Type</span>${sel('type', ['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression'].map(t => [t, t]), tc.type || 'Manual', 'tcs-boxed')}</label>
            <label class="tcs-field"><span>Defect ID</span><input type="text" class="table-inline-input" data-field="defectId" data-id="${id}" value="${escapeHtml(tc.defectId || '')}" placeholder="e.g. CIMTRACK-812" /></label>
          </div>
          <div class="tcs-detail-grid">
            ${area('scenario', 'Scenario', 2)}
            ${area('simplifiedScenario', 'Simplified scenario', 2)}
            ${area('description', 'Description')}
            ${area('steps', 'Steps', 4)}
            ${area('expected', 'Expected result')}
            ${area('actual', 'Actual result')}
            ${area('comments', 'Comments', 2)}
          </div>
          <div class="tcs-detail-foot">Changes save automatically · Updated ${timeAgo(tc.updatedAt || tc.createdAt || new Date().toISOString())}</div>
        </td>
      </tr>` : ''}`;
};

const renderTcScenarios = (proj) => {
  const projectCases = state.testCases.filter(tc => tc.projectId === proj.id);
  const mods = state.modules.filter(m => m.projectId === proj.id);
  const modCount = (id) => projectCases.filter(tc => tc.moduleId === id).length;
  const noneCount = projectCases.filter(tc => !tc.moduleId || !mods.some(m => m.id === tc.moduleId)).length;
  if (!state.tcExpanded) state.tcExpanded = new Set();

  // Module, search and dropdown filters (same fields as before).
  let list = projectCases;
  const mid = state.activeTestCaseModuleId;
  if (mid === '__none__') list = list.filter(tc => !tc.moduleId || !mods.some(m => m.id === tc.moduleId));
  else if (mid) list = list.filter(tc => tc.moduleId === mid);
  const moduleScoped = list;
  const q = (state.testCaseSearch || '').toLowerCase();
  if (q) {
    list = list.filter(tc => ['id', 'scenario', 'title', 'simplifiedScenario', 'description', 'steps', 'expected', 'actual', 'assignee', 'defectId', 'comments']
      .some(f => String(tc[f] || '').toLowerCase().includes(q)));
  }
  const f = state.testCaseFilters;
  const searchScoped = list;
  if (f.status) list = list.filter(tc => (TC_STATUSES.includes(tc.status) ? tc.status : 'Untested') === f.status);
  if (f.priority) list = list.filter(tc => tc.priority === f.priority);
  if (f.type) list = list.filter(tc => tc.type === f.type);
  state.lastFilteredCases = list;

  // Pagination (same state as before).
  const pageAll = state.testCasePageSize === 'all';
  const pageSize = pageAll ? Math.max(list.length, 1) : state.testCasePageSize;
  const totalPages = pageAll ? 1 : Math.max(1, Math.ceil(list.length / pageSize));
  if (state.testCasePage > totalPages) state.testCasePage = totalPages;
  if (state.testCasePage < 1) state.testCasePage = 1;
  const start = pageAll ? 0 : (state.testCasePage - 1) * pageSize;
  const end = pageAll ? list.length : Math.min(start + pageSize, list.length);
  const paged = list.slice(start, end);

  const statusChipCounts = tcCounts(searchScoped.filter(tc => (!f.priority || tc.priority === f.priority) && (!f.type || tc.type === f.type)));
  const chips = [['', 'All', statusChipCounts.total], ['Passed', 'Passed', statusChipCounts.passed], ['Failed', 'Failed', statusChipCounts.failed], ['Blocked', 'Blocked', statusChipCounts.blocked], ['Untested', 'Untested', statusChipCounts.untested]];
  const selectedCount = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  const filtersActive = !!(q || f.status || f.priority || f.type);
  const activeModName = mid === '__none__' ? 'No module' : mid ? ((mods.find(m => m.id === mid) || {}).name || 'Module') : 'All cases';

  const modItem = (idAttr, name, n, active, actions = '') => `
    <div class="module-item tcs-mod ${active ? 'active' : ''}" data-module-id="${idAttr}" role="button" tabindex="0">
      <span class="tcs-mod-name" title="${escapeHtml(name)}">${TC_I.folder}<span>${escapeHtml(name)}</span></span>
      <span class="tcs-mod-n">${n}</span>
      ${actions}
    </div>`;
  const pageSizeOptions = [5, 10, 25, 50, 100, 150].map(n => `<option value="${n}" ${state.testCasePageSize === n ? 'selected' : ''}>${n}</option>`).join('') + `<option value="all" ${pageAll ? 'selected' : ''}>All</option>`;

  return `
    <div class="tc-page">
      ${tcCrumbs([{ label: 'Test Cases', action: 'tc-home' }, { label: escapeHtml(proj.name), action: 'tc-overview' }, { label: 'Test scenarios' }])}
      <section class="tco-head">
        <div class="tco-head-main">
          <h2>Test scenarios</h2>
          <p>${escapeHtml(proj.name)} · ${projectCases.length} test case${projectCases.length === 1 ? '' : 's'}</p>
        </div>
        <div class="tco-head-actions">
          <button type="button" class="btn-ghost st-btn" id="openExcelImportModalBtn">${TC_I.upload}Import Excel</button>
          <button type="button" class="btn-ghost st-btn" id="openBulkUpdateModalBtn">${TC_I.edit}Bulk Update</button>
          <button type="button" class="btn-primary st-btn" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        </div>
      </section>

      <div class="tcs-layout">
        <aside class="tcs-rail" aria-label="Modules">
          <div class="tcs-rail-head"><span>Modules</span><button type="button" class="tcs-rail-add" id="openAddModuleModalBtn" title="Add module" aria-label="Add module">${TC_I.plus}</button></div>
          ${modItem('root', 'All cases', projectCases.length, !mid)}
          ${mods.map(m => modItem(m.id, m.name, modCount(m.id), mid === m.id, `
            <span class="module-item-actions tcs-mod-actions">
              <button class="module-item-btn" data-action="edit-module" data-id="${m.id}" aria-label="Rename module" title="Rename">${TC_I.edit}</button>
              <button class="module-item-btn danger" data-action="delete-module" data-id="${m.id}" aria-label="Delete module" title="Delete">${TC_I.trash}</button>
            </span>`)).join('')}
          ${noneCount ? modItem('__none__', 'No module', noneCount, mid === '__none__') : ''}
        </aside>

        <div class="tcs-main">
          <div class="tcs-toolbar">
            <div class="page-search-wrap tcs-search">
              <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" class="page-search-input" id="testCaseSearchInput" placeholder="Search ID, scenario, steps, defect…" value="${escapeHtml(state.testCaseSearch || '')}" />
              ${state.testCaseSearch ? `<button class="page-search-clear" id="clearTestCaseSearch" aria-label="Clear search">✕</button>` : ''}
            </div>
            <select class="filter-select" id="filterTCPriority" data-tcfilter="priority" aria-label="Priority">
              <option value="">All priorities</option>
              ${['Critical', 'High', 'Medium', 'Low'].map(v => `<option value="${v}" ${f.priority === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <select class="filter-select" id="filterTCType" data-tcfilter="type" aria-label="Type">
              <option value="">All types</option>
              ${['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression'].map(v => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <button class="btn-ghost rpa-tool-btn ${state.testCaseSelectionMode ? 'tcs-on' : ''}" id="toggleTestCaseSelectionModeBtn">${state.testCaseSelectionMode ? 'Cancel selection' : 'Select cases'}</button>
            ${filtersActive ? `<button class="btn-ghost rpa-tool-btn" id="clearTestCaseFilters">Clear filters</button>` : ''}
          </div>
          <div class="tcs-chips" role="toolbar" aria-label="Filter by status">
            ${chips.map(([v, l, n]) => `<button type="button" class="rpa-chip tcs-chip ${v ? v.toLowerCase() : 'all'} ${(f.status || '') === v ? 'active' : ''}" data-action="tc-status-chip" data-status="${v}">${l} <span>${n}</span></button>`).join('')}
            <span class="tcs-scope">${escapeHtml(activeModName)} · showing ${list.length} of ${moduleScoped.length}</span>
          </div>

          ${state.testCaseSelectionMode ? `
            <div class="tcs-selbar">
              <strong>${selectedCount} selected</strong>
              <button class="btn-ghost rpa-tool-btn" id="selectAllTestCasesBtn">Select all ${list.length}</button>
              <button class="btn-ghost rpa-tool-btn" id="clearTestCaseSelectionBtn" ${selectedCount ? '' : 'disabled'}>Clear</button>
              <button class="btn-danger st-btn" id="bulkDeleteTestCasesBtn" ${selectedCount ? '' : 'disabled'}>${TC_I.trash}Delete selected</button>
              <button class="btn-ghost rpa-tool-btn" id="cancelTestCaseSelectionBtn">Done</button>
            </div>` : ''}

          <div class="tcs-table-wrap" id="testCasesContainer">
            <table class="tcs-table">
              <thead>
                <tr>
                  <th class="tcs-c-check"><input type="checkbox" id="selectAllTcCb" aria-label="Select all filtered" ${selectedCount > 0 && list.length && list.every(tc => state.selectedTestCaseIds.has(tc.id)) ? 'checked' : ''} /></th>
                  <th>ID</th><th>Scenario</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Executed</th><th></th>
                </tr>
              </thead>
              <tbody id="testCasesTableBody">
                ${paged.map((tc, i) => renderTcScenarioRow(tc, start + i, mods)).join('') || `
                  <tr><td colspan="8"><div class="dbx-empty tcs-noresults">${filtersActive ? 'No test cases match these filters.' : 'No test cases in this module yet.'}</div></td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="tc-pagination-bar">
            <div class="tc-pagination-size"><label for="tcPageSizeSelect">Rows per page</label><select class="filter-select" id="tcPageSizeSelect">${pageSizeOptions}</select></div>
            <div class="tc-pagination-info">${list.length ? `Showing ${start + 1}–${end} of ${list.length}` : 'No results'}</div>
            <div class="tc-pagination-nav">
              <button class="btn-ghost" id="tcPrevPageBtn" ${state.testCasePage <= 1 ? 'disabled' : ''}>‹ Prev</button>
              <span class="tc-pagination-page">Page ${state.testCasePage} of ${totalPages}</span>
              <button class="btn-ghost" id="tcNextPageBtn" ${state.testCasePage >= totalPages ? 'disabled' : ''}>Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
};

const renderTestCaseManagement = () => {
  if (state.projects.length === 0) {
    return emptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
      'No projects found',
      'You need to create a project first before creating modules or test cases.',
      '<button class="btn-primary" data-action="new-project" style="margin-top: 12px;">Create Project</button>'
    );
  }
  // A previously-selected project may have been deleted since; fall back to home.
  const proj = state.activeTestCaseProjectId ? state.projects.find(p => p.id === state.activeTestCaseProjectId) : null;
  if (!proj) { state.activeTestCaseProjectId = null; return renderTcHome(); }
  return state.tcPage === 'scenarios' ? renderTcScenarios(proj) : renderTcOverview(proj);
};

// Navigation within Test Case Management.
const tcGo = (projectId, page = 'overview', moduleId = null) => {
  if (projectId !== state.activeTestCaseProjectId) {
    if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
    state.testCaseSelectionMode = false;
    state.testCaseSearch = '';
    state.testCaseFilters = { status: '', priority: '', type: '' };
  }
  state.activeTestCaseProjectId = projectId || null;
  state.tcPage = page;
  state.activeTestCaseModuleId = moduleId;
  state.testCasePage = 1;
  if (state.view !== 'testcases') setView('testcases'); else render();
  const ct = document.getElementById('mainContent');
  if (ct) ct.scrollTo({ top: 0, behavior: 'instant' });
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

  // Set module change listener in import modal
  const modSel = document.getElementById('excelImportModule');
  if (modSel) {
    modSel.onchange = () => {
      renderImportPreview();
    };
  }

  // Reset file input and preview styles
  document.getElementById('excelFileInput').value = '';
  document.getElementById('excelPreviewSection').style.display = 'none';
  document.getElementById('excelLoadingSection').style.display = 'none';
  document.getElementById('saveExcelImport').style.display = 'none';
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  if (replaceDupesCheckbox) replaceDupesCheckbox.checked = false;

  const dupesSec = document.getElementById('excelImportDuplicatesSection');
  if (dupesSec) dupesSec.style.display = 'none';

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
    // 3. Simplified Test Scenario — must be checked before the generic
    // "scenario" rule below, since "simplifiedscenario" also contains the
    // substring "scenario" and would otherwise be swallowed by it.
    else if (clean === 'simplifiedtestscenario' || clean === 'simplifiedscenario') {
      addMapping('simplifiedScenario', index);
    }
    // 4. Test Scenario & Description
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
  const duplicateCases = [];
  const duplicateIds = new Set();

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
      if (!duplicateIds.has(existing.id)) {
        duplicateIds.add(existing.id);
        duplicateCases.push(existing);
      }
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
    <div style="display:flex; justify-content:space-between; align-items:center; color:${dupCount > 0 ? (replaceDupes ? '#e67e22' : 'var(--danger)') : 'var(--text-muted)'};">
      <span>${replaceDupes ? 'Duplicates to Overwrite:' : 'Ignored duplicates (Already exist):'}</span> 
      <div>
        <strong>${dupCount}</strong>
        ${dupCount > 0 ? `<a href="#" id="viewExcelDupesLink" style="font-size:11px; margin-left:8px; text-decoration:underline; font-weight:600; color:inherit; cursor:pointer;">View / Clean</a>` : ''}
      </div>
    </div>
  `;

  // Render the duplicates list
  const dupesContainer = document.getElementById('excelDupesListContainer');
  const dupesSection = document.getElementById('excelImportDuplicatesSection');
  const dupesCountEl = document.getElementById('excelImportDupesCount');

  if (dupesSection && dupesContainer) {
    if (duplicateCases.length > 0) {
      dupesCountEl.textContent = `${duplicateCases.length} duplicate${duplicateCases.length !== 1 ? 's' : ''} found`;
      dupesContainer.innerHTML = duplicateCases.map(tc => {
        const mod = state.modules.find(m => m.id === tc.moduleId);
        const moduleName = mod ? mod.name : 'Root / Unassigned';
        return `
          <div class="dupe-item" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; gap: 8px; margin-bottom: 4px;">
            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
              <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <span class="status-pill planned" style="font-size: 10px; padding: 1px 4px; font-family: var(--font-mono); margin: 0;">${tc.id}</span>
                <span style="color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(tc.scenario || tc.title)}">${escapeHtml(tc.scenario || tc.title)}</span>
              </div>
              <span style="font-size: 10.5px; color: var(--text-muted);">Module: ${escapeHtml(moduleName)}</span>
            </div>
            <button class="icon-btn danger delete-dupe-btn" data-tc-id="${tc.id}" aria-label="Delete from system" title="Delete from system" style="padding: 0; width: 24px; height: 24px; flex-shrink: 0; border: 1px solid var(--border); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; background: none; cursor: pointer; transition: all 0.2s;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; color: var(--danger);"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        `;
      }).join('');
    } else {
      dupesSection.style.display = 'none';
      dupesContainer.innerHTML = '';
      const toggleLink = document.getElementById('viewExcelDupesLink');
      if (toggleLink) toggleLink.textContent = 'View / Clean';
    }
  }
};

const deleteTestCaseFromImport = async (id) => {
  if (confirm(`Delete test case "${id}" from the system? This action cannot be undone.`)) {
    state.testCases = state.testCases.filter(tc => tc.id !== id);
    logActivity(`Deleted testcase "${id}" during Excel import`, 'delete');
    await storage.save();
    showToast(`Test case ${id} deleted.`);

    // Re-render import preview
    renderImportPreview();

    // Re-render main UI in background
    render();
    updateStorageInfo();
  }
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

const getReleaseVersionOptions = (project) => {
  if (!project) return [];
  if (project.projectType === 'app') {
    const opts = [];
    if (project.androidPreviousVersion) opts.push({ value: project.androidPreviousVersion, label: `Android ${project.androidPreviousVersion} (Prev)` });
    if (project.androidUpcomingVersion) opts.push({ value: project.androidUpcomingVersion, label: `Android ${project.androidUpcomingVersion} (Up)` });
    if (project.iosPreviousVersion) opts.push({ value: project.iosPreviousVersion, label: `iOS ${project.iosPreviousVersion} (Prev)` });
    if (project.iosUpcomingVersion) opts.push({ value: project.iosUpcomingVersion, label: `iOS ${project.iosUpcomingVersion} (Up)` });
    return opts;
  }
  const opts = [];
  if (project.previousVersion) opts.push({ value: project.previousVersion, label: `${project.previousVersion} (Prev)` });
  if (project.upcomingVersion) opts.push({ value: project.upcomingVersion, label: `${project.upcomingVersion} (Up)` });
  return opts;
};

const loadReleaseProjectsList = (selectedProjectIds = []) => {
  const container = document.getElementById('releaseProjectChecklist');
  if (!container) return;
  container.innerHTML = state.projects.map(p => `
    <label class="dev-project-label">
      <input type="checkbox" name="releaseProjectCheck" value="${p.id}" ${selectedProjectIds.includes(p.id) ? 'checked' : ''} />
      <span>${p.name}</span>
    </label>
  `).join('') || emptyNote('No projects added yet.');

  container.querySelectorAll('input[name="releaseProjectCheck"]').forEach(cb => {
    cb.onchange = () => {
      const checkedIds = Array.from(container.querySelectorAll('input[name="releaseProjectCheck"]:checked')).map(c => c.value);
      loadReleaseVersionsList(checkedIds);
    };
  });
};

const loadReleaseVersionsList = (projectIds, selectedVersions = []) => {
  const container = document.getElementById('releaseVersionChecklist');
  if (!container) return;
  if (!projectIds || projectIds.length === 0) {
    container.innerHTML = emptyNote('Select project(s) first.');
    return;
  }
  let html = '';
  projectIds.forEach(pid => {
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    const opts = getReleaseVersionOptions(proj);
    if (opts.length > 0) {
      html += `<div style="font-weight:600;font-size:11.5px;color:var(--text-secondary);width:100%;margin-top:8px;margin-bottom:4px;border-bottom:1px dashed var(--border);padding-bottom:2px;">${proj.name}</div>`;
      html += opts.map(o => `
        <label class="rp-version-checkbox-label">
          <input type="checkbox" name="releaseVersionCheck" value="${o.value}" ${selectedVersions.includes(o.value) ? 'checked' : ''} />
          ${o.label}
        </label>
      `).join('');
    }
  });
  container.innerHTML = html || emptyNote('No versions configured for the selected project(s).');
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

  // Populate Product Developers checklist with devs
  const checklist = document.getElementById('releaseDevChecklist');
  checklist.innerHTML = state.developers.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="releaseDevCheck" value="${d.id}" />
      <span>${d.name}</span>
    </label>
  `).join('') || emptyNote('No developers added in Settings.');

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

    // Multi-project checklist — support legacy single projectId
    const projectIds = r.projectIds || (r.projectId ? [r.projectId] : []);
    loadReleaseProjectsList(projectIds);
    // Multi-version checklist — support legacy single version
    const versions = r.versions || (r.version ? [r.version] : []);
    loadReleaseVersionsList(projectIds, versions);

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
    document.getElementById('releaseStatus').value = 'Released';
    document.getElementById('releaseWorkItems').value = '';
    document.getElementById('releaseNotes').value = '';

    loadReleaseProjectsList([]);
    loadReleaseVersionsList([]);
  }

  showModal('releaseModal');
};

const saveRelease = async () => {
  const id = document.getElementById('releaseId').value;
  const name = document.getElementById('releaseName').value.trim();
  const releaseDate = document.getElementById('releaseDate').value;
  const description = document.getElementById('releaseDesc').value.trim();
  const managerName = document.getElementById('releaseManager').value;
  const status = document.getElementById('releaseStatus').value;
  const workItems = document.getElementById('releaseWorkItems').value.trim();
  const notes = document.getElementById('releaseNotes').value.trim();

  // Multi-project + multi-version
  const projectIds = Array.from(document.querySelectorAll('input[name="releaseProjectCheck"]:checked')).map(cb => cb.value);
  const versions = Array.from(document.querySelectorAll('input[name="releaseVersionCheck"]:checked')).map(cb => cb.value);
  // Backward-compat single fields (for display code that still reads projectId / version)
  const projectId = projectIds[0] || '';
  const version = versions[0] || '';

  if (projectIds.length === 0) { showToast('Select at least one project', 'error'); return; }
  if (!name) { showToast('Release name is required', 'error'); return; }

  // Get selected developers
  const developerIds = Array.from(document.querySelectorAll('input[name="releaseDevCheck"]:checked')).map(cb => cb.value);

  const now = new Date().toISOString();
  const versionSummary = versions.length > 0 ? versions.join(', ') : '—';

  if (id) {
    const idx = state.releases.findIndex(r => r.id === id);
    if (idx === -1) return;
    state.releases[idx] = {
      ...state.releases[idx],
      name, projectId, projectIds, version, versions, description, managerName, status, workItems, notes, developerIds, releaseDate,
      updatedAt: now
    };
    logActivity(`Updated release "${name}" (${versionSummary}) [${status}]`, 'project');
    showToast('Release updated');
  } else {
    state.releases.unshift({
      id: 'rel-' + uid(),
      name, projectId, projectIds, version, versions, description, managerName, status, workItems, notes, developerIds, releaseDate,
      createdAt: now, updatedAt: now
    });
    logActivity(`Created release "${name}" (${versionSummary}) [${status}]`, 'project');
    showToast('Release created');
  }

  syncProjectReleaseDates();

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteRelease = (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;
  const vStr = (r.versions && r.versions.length ? r.versions : (r.version ? [r.version] : [])).join(', ') || '—';
  document.getElementById('confirmMessage').textContent =
    `Delete release "${r.name}" (${vStr})? This action cannot be undone.`;
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
  const releaseDate = document.getElementById('releaseDate').value;
  const dateStr = releaseDate ? fmtDate(releaseDate) : '[Release Date]';
  const description = document.getElementById('releaseDesc').value.trim() || '[No description provided]';
  const managerName = document.getElementById('releaseManager').value || '[No Release Manager assigned]';
  const status = document.getElementById('releaseStatus').value || 'Draft';
  const workItems = document.getElementById('releaseWorkItems').value.trim() || '[No work items linked]';

  const selectedProjectIds = Array.from(document.querySelectorAll('input[name="releaseProjectCheck"]:checked')).map(cb => cb.value);
  const selectedVersions = Array.from(document.querySelectorAll('input[name="releaseVersionCheck"]:checked')).map(cb => cb.value);
  const projNames = selectedProjectIds.map(pid => { const p = state.projects.find(x => x.id === pid); return p ? p.name : null; }).filter(Boolean);
  const projName = projNames.length ? projNames.join(', ') : '[Project Name]';
  const version = selectedVersions.length ? selectedVersions.join(', ') : '[Version]';

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

// ─── Notes Module ─────────────────────────────────────────

const isTableSeparator = (str) => {
  const t = str.trim();
  if (!t.includes('-')) return false;
  return /^\|?(\s*:?-{2,}:?\s*\|)+(\s*:?-{2,}:?\s*\|?)$/.test(t) ||
         /^\|(\s*:?-{2,}:?\s*)\|$/.test(t);
};

const parseRowCells = (rowStr) => {
  let s = rowStr.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  s = s.replace(/\\\|/g, '__ESCAPED_PIPE__');
  return s.split('|').map(c => c.replace(/__ESCAPED_PIPE__/g, '|').trim());
};

const parseMarkdown = (md) => {
  if (!md) return '<p style="color:var(--text-muted);font-style:italic;">Empty note</p>';

  const codeBlocks = [];
  let html = md.replace(/```([\s\S]*?)```/g, (match, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const lines = code.split('\n');
    let body = code;
    if (lines.length > 0 && lines[0].trim() && !lines[0].includes(' ')) {
      body = lines.slice(1).join('\n');
    }
    const escapedCode = escapeHtml(body.trim());
    codeBlocks.push(`<pre><code>${escapedCode}</code></pre>`);
    return placeholder;
  });

  const inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  html = escapeHtml(html);

  const lines = html.split('\n');
  const resultLines = [];
  let inList = false;
  let listType = null;

  const closeList = () => {
    if (inList) {
      resultLines.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
    }
  };

  const usedSlugs = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('__CODE_BLOCK_')) {
      closeList();
      resultLines.push(trimmed);
      continue;
    }

    // Markdown Table: header line containing pipes followed by a separator line
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const headerRow = lines[i];
      const sepRow = lines[i + 1];

      const headerCells = parseRowCells(headerRow);
      const aligns = parseRowCells(sepRow).map(col => {
        const c = col.trim();
        const left = c.startsWith(':');
        const right = c.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
      });

      let tableHtml = '<div class="notes-table-wrap"><table class="notes-table"><thead><tr>';
      headerCells.forEach((cell, idx) => {
        const align = aligns[idx] ? ` style="text-align:${aligns[idx]};"` : '';
        tableHtml += `<th${align}>${parseInlineMarkdown(cell)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      i += 2; // advance past header & separator
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|') || isTableSeparator(rowLine)) {
          i--;
          break;
        }
        const cells = parseRowCells(rowLine);
        tableHtml += '<tr>';
        cells.forEach((cell, idx) => {
          const align = aligns[idx] ? ` style="text-align:${aligns[idx]};"` : '';
          tableHtml += `<td${align}>${parseInlineMarkdown(cell)}</td>`;
        });
        tableHtml += '</tr>';
        i++;
      }

      tableHtml += '</tbody></table></div>';
      resultLines.push(tableHtml);
      continue;
    }

    // Horizontal Rule: ---, ***, ___, etc.
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      closeList();
      resultLines.push('<hr class="notes-hr" />');
      continue;
    }

    // Headings: # to ###### with automatic slug IDs for TOC anchor navigation
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const parsedText = parseInlineMarkdown(headingText);
      const rawText = headingText.replace(/<[^>]+>/g, '').trim();
      const baseSlug = rawText
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s/g, '-');
      let slug = baseSlug;
      let count = 1;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${count++}`;
      }
      usedSlugs.add(slug);
      resultLines.push(`<h${level} id="${slug}">${parsedText}</h${level}>`);
      continue;
    }

    // Blockquotes: > quote text (groups consecutive lines)
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      closeList();
      const bqLines = [];
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        if (curTrim.startsWith('&gt;') || curTrim.startsWith('>')) {
          let text = curTrim.startsWith('&gt;') ? curTrim.slice(4) : curTrim.slice(1);
          if (text.startsWith(' ')) text = text.slice(1);
          bqLines.push(parseInlineMarkdown(text));
          i++;
        } else {
          i--;
          break;
        }
      }
      resultLines.push(`<blockquote>${bqLines.join('<br>')}</blockquote>`);
      continue;
    }

    // Checklist / Task list items
    const checkMatch = trimmed.match(/^- \[(x|X| )\] (.*)$/);
    if (checkMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        resultLines.push('<ul class="notes-task-list" style="list-style:none;padding-left:0;">');
        inList = true;
        listType = 'ul';
      }
      const checked = checkMatch[1].toLowerCase() === 'x' ? 'checked' : '';
      const text = parseInlineMarkdown(checkMatch[2]);
      resultLines.push(`<li class="task-list-item"><input type="checkbox" ${checked} disabled /> <span>${text}</span></li>`);
      continue;
    }

    // Bullet lists with indentation support
    const bulletMatch = trimmed.match(/^[-*] (.*)$/);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        resultLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const indent = line.search(/\S/);
      const indentStyle = indent >= 4 ? ' style="margin-left:36px;"' : (indent >= 2 ? ' style="margin-left:20px;"' : '');
      resultLines.push(`<li${indentStyle}>${parseInlineMarkdown(bulletMatch[1])}</li>`);
      continue;
    }

    // Numbered lists with indentation support
    const numMatch = trimmed.match(/^(\d+)\. (.*)$/);
    if (numMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        resultLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const indent = line.search(/\S/);
      const indentStyle = indent >= 4 ? ' style="margin-left:36px;"' : (indent >= 2 ? ' style="margin-left:20px;"' : '');
      resultLines.push(`<li${indentStyle}>${parseInlineMarkdown(numMatch[2])}</li>`);
      continue;
    }

    // Blank line
    if (!trimmed) {
      closeList();
      if (i > 0 && !lines[i - 1].trim()) {
        resultLines.push('<br>');
      }
      continue;
    }

    closeList();
    resultLines.push(`<p>${parseInlineMarkdown(trimmed)}</p>`);
  }

  closeList();

  let finalHtml = resultLines.join('\n');

  inlineCodes.forEach((codeHtml, i) => {
    finalHtml = finalHtml.replace(`__INLINE_CODE_${i}__`, codeHtml);
  });

  codeBlocks.forEach((codeHtml, i) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${i}__`, codeHtml);
  });

  return finalHtml;
};

const parseInlineMarkdown = (text) => {
  if (!text) return '';
  let str = text;
  // Bold + Italic: ***text*** or ___text___
  str = str.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  str = str.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/(^|[\s(])_([^_]+)_([\s).,;:!?]|$)/g, '$1<em>$2</em>$3');

  // Strikethrough: ~~text~~
  str = str.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Links & Anchors: [text](url)
  str = str.replace(/\[(.*?)\]\((.*?)\)/g, (match, txt, href) => {
    const isAnchor = href.startsWith('#');
    if (isAnchor) return `<a href="${href}">${txt}</a>`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
  });

  return str;
};

const insertMarkdownSyntax = (type) => {
  const textarea = document.getElementById('noteContentInput');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selectedText = val.substring(start, end);

  let replacement = '';
  let cursorOffset = 0;

  switch (type) {
    case 'bold':
      replacement = `**${selectedText || 'bold text'}**`;
      cursorOffset = selectedText ? replacement.length : 2;
      break;
    case 'italic':
      replacement = `*${selectedText || 'italic text'}*`;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    case 'h1':
      replacement = `# ${selectedText || 'Heading 1'}`;
      cursorOffset = replacement.length;
      break;
    case 'h2':
      replacement = `## ${selectedText || 'Heading 2'}`;
      cursorOffset = replacement.length;
      break;
    case 'bullet':
      replacement = `- ${selectedText || 'List item'}`;
      cursorOffset = replacement.length;
      break;
    case 'number':
      replacement = `1. ${selectedText || 'List item'}`;
      cursorOffset = replacement.length;
      break;
    case 'checklist':
      replacement = `- [ ] ${selectedText || 'Task item'}`;
      cursorOffset = replacement.length;
      break;
    case 'quote':
      replacement = `> ${selectedText || 'Quote text'}`;
      cursorOffset = replacement.length;
      break;
    case 'table':
      replacement = `| Column 1 | Column 2 |\n|---|---|\n| Data 1 | Data 2 |`;
      cursorOffset = replacement.length;
      break;
    case 'hr':
      replacement = `\n---\n`;
      cursorOffset = replacement.length;
      break;
    case 'code':
      replacement = `\`${selectedText || 'code'}\``;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    case 'codeblock':
      replacement = `\`\`\`\n${selectedText || 'code block'}\n\`\`\``;
      cursorOffset = selectedText ? replacement.length : 4;
      break;
    case 'link':
      replacement = `[${selectedText || 'Link Title'}](https://example.com)`;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
  }

  textarea.value = val.substring(0, start) + replacement + val.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);

  if (state.activeNoteId) {
    const note = (state.notes || []).find(n => n.id === state.activeNoteId);
    if (note) {
      note.content = textarea.value;
      note.updatedAt = new Date().toISOString();
    }
  }
};

const openFolderModal = (folderId = null, projectId = null, parentId = null) => {
  const input = document.getElementById('folderNameInput');
  const idEl = document.getElementById('folderId');
  const projEl = document.getElementById('folderProjectId');
  const parentEl = document.getElementById('folderParentId');
  const titleEl = document.getElementById('folderModalTitle');

  if (folderId) {
    const f = (state.noteFolders || []).find(x => x.id === folderId);
    if (!f) return;
    titleEl.textContent = f.parentId ? 'Rename Subfolder' : 'Rename Folder';
    idEl.value = f.id;
    projEl.value = f.projectId;
    parentEl.value = f.parentId || '';
    input.value = f.name;
  } else {
    titleEl.textContent = parentId ? 'New Subfolder' : 'New Folder';
    idEl.value = '';
    projEl.value = projectId || state.activeNoteProjectId || '';
    parentEl.value = parentId || '';
    input.value = '';
  }
  showModal('folderModal');
  setTimeout(() => input.focus(), 100);
};

const saveFolder = async () => {
  const name = document.getElementById('folderNameInput').value.trim();
  const id = document.getElementById('folderId').value;
  const projectId = document.getElementById('folderProjectId').value;
  const parentId = document.getElementById('folderParentId').value || null;

  if (!name) {
    showToast('Folder name is required', 'error');
    return;
  }
  if (!projectId) {
    showToast('Project is required', 'error');
    return;
  }

  if (parentId) {
    const parentFolder = (state.noteFolders || []).find(f => f.id === parentId);
    if (parentFolder && parentFolder.parentId) {
      showToast('Nested folders beyond one level are not allowed', 'error');
      return;
    }
  }

  const now = new Date().toISOString();
  if (!state.noteFolders) state.noteFolders = [];

  if (id) {
    const f = state.noteFolders.find(x => x.id === id);
    if (f) {
      f.name = name;
      f.updatedAt = now;
      logActivity(`Renamed folder "${name}"`, 'project');
      showToast('Folder renamed');
    }
  } else {
    const newFolder = {
      id: uid(),
      projectId,
      parentId,
      name,
      createdAt: now,
      updatedAt: now
    };
    state.noteFolders.push(newFolder);
    state.expandedNoteFolderIds.add(newFolder.id);
    if (parentId) {
      state.expandedNoteFolderIds.add(parentId);
    }
    logActivity(parentId ? `Created subfolder "${name}"` : `Created folder "${name}"`, 'project');
    showToast(parentId ? 'Subfolder created' : 'Folder created');
  }

  await storage.save();
  closeModals();
  render();
};

const confirmDeleteFolder = (folderId) => {
  const f = (state.noteFolders || []).find(x => x.id === folderId);
  if (!f) return;
  const isSub = !!f.parentId;
  document.getElementById('confirmMessage').textContent = isSub
    ? `Delete subfolder "${f.name}" and all notes inside it? This cannot be undone.`
    : `Delete folder "${f.name}", its subfolders, and all notes inside them? This cannot be undone.`;
  confirmCallback = () => deleteFolder(folderId);
  showModal('confirmModal');
};

const deleteFolder = async (folderId) => {
  const f = (state.noteFolders || []).find(x => x.id === folderId);
  if (!f) return;

  const isMain = !f.parentId;
  let targetFolderIds = [folderId];

  if (isMain) {
    const subFolderIds = (state.noteFolders || []).filter(sub => sub.parentId === folderId).map(sub => sub.id);
    targetFolderIds = targetFolderIds.concat(subFolderIds);
  }

  state.noteFolders = (state.noteFolders || []).filter(folder => !targetFolderIds.includes(folder.id));
  state.notes = (state.notes || []).filter(n => !targetFolderIds.includes(n.folderId));

  if (targetFolderIds.includes(state.activeNoteFolderId)) {
    state.activeNoteFolderId = null;
  }
  const activeNote = (state.notes || []).find(n => n.id === state.activeNoteId);
  if (!activeNote) {
    state.activeNoteId = null;
  }

  logActivity(`Deleted folder "${f.name}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  showToast('Folder deleted');
};

const createNote = async (projectId, folderId = null) => {
  if (!projectId) {
    showToast('Select a project first', 'error');
    return;
  }
  if (state.activeNoteId) {
    await saveActiveNote(true);
  }
  const now = new Date().toISOString();
  if (!state.notes) state.notes = [];

  const newNote = {
    id: uid(),
    projectId,
    folderId,
    title: 'Untitled Note',
    content: '',
    createdAt: now,
    updatedAt: now
  };

  state.notes.unshift(newNote);
  state.activeNoteId = newNote.id;
  state.activeNoteProjectId = projectId;
  state.activeNoteFolderId = folderId;
  state.noteEditorMode = 'edit';

  logActivity(`Created note "${newNote.title}"`, 'task');
  await storage.save();
  render();
  setTimeout(() => {
    const titleInput = document.getElementById('noteTitleInput');
    if (titleInput) { titleInput.focus(); titleInput.select(); }
  }, 100);
};

const selectNote = async (noteId) => {
  if (state.activeNoteId && state.activeNoteId !== noteId) {
    await saveActiveNote(true);
  }
  const note = (state.notes || []).find(n => n.id === noteId);
  if (!note) return;
  state.activeNoteId = note.id;
  state.activeNoteProjectId = note.projectId;
  state.activeNoteFolderId = note.folderId;
  render();
};

const saveActiveNote = async (silent = false) => {
  if (!state.activeNoteId) return;
  const note = (state.notes || []).find(n => n.id === state.activeNoteId);
  if (!note) return;

  const titleInput = document.getElementById('noteTitleInput');
  const contentInput = document.getElementById('noteContentInput');

  if (titleInput) note.title = titleInput.value.trim() || 'Untitled Note';
  if (contentInput) note.content = contentInput.value;
  note.updatedAt = new Date().toISOString();

  await storage.save();
  if (!silent) {
    logActivity(`Updated note "${note.title}"`, 'task');
    showToast('Note saved');
    render();
  }
};

const confirmDeleteNote = (noteId) => {
  const n = (state.notes || []).find(x => x.id === noteId);
  if (!n) return;
  document.getElementById('confirmMessage').textContent =
    `Delete note "${n.title}"? This action cannot be undone.`;
  confirmCallback = () => deleteNote(noteId);
  showModal('confirmModal');
};

const deleteNote = async (noteId) => {
  const n = (state.notes || []).find(x => x.id === noteId);
  if (!n) return;
  state.notes = (state.notes || []).filter(x => x.id !== noteId);
  if (state.activeNoteId === noteId) {
    state.activeNoteId = null;
  }
  logActivity(`Deleted note "${n.title}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  showToast('Note deleted');
};

const openMoveNoteModal = (noteId) => {
  const n = (state.notes || []).find(x => x.id === noteId);
  if (!n) return;
  document.getElementById('moveNoteId').value = noteId;

  const projSelect = document.getElementById('moveNoteProjectSelect');
  projSelect.innerHTML = (state.projects || []).map(p =>
    `<option value="${p.id}" ${p.id === n.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  updateMoveNoteFolderDropdown(n.projectId, n.folderId);

  projSelect.onchange = (e) => {
    updateMoveNoteFolderDropdown(e.target.value, null);
  };

  showModal('moveNoteModal');
};

const updateMoveNoteFolderDropdown = (projectId, currentFolderId) => {
  const folderSelect = document.getElementById('moveNoteFolderSelect');
  const projFolders = (state.noteFolders || []).filter(f => f.projectId === projectId);
  const mainFolders = projFolders.filter(f => !f.parentId);

  let html = `<option value="">(Project Root - Direct Note)</option>`;
  mainFolders.forEach(mf => {
    html += `<option value="${mf.id}" ${mf.id === currentFolderId ? 'selected' : ''}>📁 ${escapeHtml(mf.name)}</option>`;
    const subFolders = projFolders.filter(sf => sf.parentId === mf.id);
    subFolders.forEach(sf => {
      html += `<option value="${sf.id}" ${sf.id === currentFolderId ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;&nbsp;📂 ${escapeHtml(sf.name)}</option>`;
    });
  });

  folderSelect.innerHTML = html;
};

const saveMoveNote = async () => {
  const noteId = document.getElementById('moveNoteId').value;
  const targetProjectId = document.getElementById('moveNoteProjectSelect').value;
  const targetFolderId = document.getElementById('moveNoteFolderSelect').value || null;

  const note = (state.notes || []).find(n => n.id === noteId);
  if (!note) return;

  note.projectId = targetProjectId;
  note.folderId = targetFolderId;
  note.updatedAt = new Date().toISOString();

  state.activeNoteProjectId = targetProjectId;
  state.activeNoteFolderId = targetFolderId;
  state.activeNoteId = note.id;

  let destName = 'Project root';
  if (targetFolderId) {
    const f = (state.noteFolders || []).find(x => x.id === targetFolderId);
    if (f) destName = f.name;
  }

  logActivity(`Moved note "${note.title}" to "${destName}"`, 'task');
  await storage.save();
  closeModals();
  render();
  showToast('Note moved successfully');
};

const sortNotes = (notesList, sortBy) => {
  if (!notesList) return;
  notesList.sort((a, b) => {
    if (sortBy === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    } else if (sortBy === 'createdAt') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    } else {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    }
  });
};

const renderNotes = () => {
  if (!state.activeNoteProjectId && state.projects.length > 0) {
    state.activeNoteProjectId = state.projects[0].id;
  }

  const activeProject = state.projects.find(p => p.id === state.activeNoteProjectId);

  const projectsHtml = state.projects.length === 0
    ? `<div style="color:var(--text-muted);font-size:12.5px;padding:16px;text-align:center;">No projects created yet</div>`
    : state.projects.map(p => {
      const noteCount = (state.notes || []).filter(n => n.projectId === p.id).length;
      const isActive = p.id === state.activeNoteProjectId;
      return `
          <button class="notes-proj-item ${isActive ? 'active' : ''}" data-action="select-note-project" data-id="${p.id}">
            <svg class="notes-proj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span class="notes-proj-name">${escapeHtml(p.name)}</span>
            <span class="notes-proj-badge">${noteCount}</span>
          </button>
        `;
    }).join('');

  let treeHtml = '';
  const searchQ = (state.noteSearchQuery || '').toLowerCase().trim();

  let selectedFolderIsSubfolder = false;
  if (state.activeNoteFolderId) {
    const selFolder = (state.noteFolders || []).find(f => f.id === state.activeNoteFolderId);
    if (selFolder && selFolder.parentId) {
      selectedFolderIsSubfolder = true;
    }
  }

  if (!activeProject) {
    treeHtml = emptyState(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>`,
      'No Project Selected',
      'Select a project from the left panel to view its notes and folders.'
    );
  } else if (searchQ) {
    const matchingNotes = (state.notes || []).filter(n => {
      const proj = state.projects.find(p => p.id === n.projectId);
      const folder = (state.noteFolders || []).find(f => f.id === n.folderId);
      const projName = proj ? proj.name : '';
      const folderName = folder ? folder.name : '';

      return n.title.toLowerCase().includes(searchQ) ||
        n.content.toLowerCase().includes(searchQ) ||
        projName.toLowerCase().includes(searchQ) ||
        folderName.toLowerCase().includes(searchQ);
    });

    sortNotes(matchingNotes, state.noteSortBy);

    if (matchingNotes.length === 0) {
      treeHtml = `<div style="color:var(--text-muted);font-size:12.5px;padding:32px 16px;text-align:center;font-style:italic;">No notes found matching "${escapeHtml(searchQ)}"</div>`;
    } else {
      treeHtml = matchingNotes.map(n => renderNoteItem(n, searchQ, true)).join('');
    }
  } else {
    const projFolders = (state.noteFolders || []).filter(f => f.projectId === activeProject.id);
    const mainFolders = projFolders.filter(f => !f.parentId);
    const directNotes = (state.notes || []).filter(n => n.projectId === activeProject.id && !n.folderId);
    sortNotes(directNotes, state.noteSortBy);

    let html = '';

    if (directNotes.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:8px 8px 4px 8px;">Direct Notes</div>`;
      html += directNotes.map(n => renderNoteItem(n)).join('');
    }

    if (mainFolders.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 8px 4px 8px;">Folders</div>`;

      mainFolders.forEach(mf => {
        const subFolders = projFolders.filter(sf => sf.parentId === mf.id);
        const folderNotes = (state.notes || []).filter(n => n.folderId === mf.id);
        sortNotes(folderNotes, state.noteSortBy);

        const isExpanded = state.expandedNoteFolderIds.has(mf.id);
        const isFolderActive = state.activeNoteFolderId === mf.id;

        html += `
          <div class="notes-tree-node">
            <div class="notes-folder-row ${isFolderActive ? 'active' : ''}" data-action="select-note-folder" data-id="${mf.id}">
              <svg class="notes-folder-toggle ${isExpanded ? '' : 'collapsed'}" data-action="toggle-note-folder" data-id="${mf.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              <svg class="notes-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              <span class="notes-folder-name">${escapeHtml(mf.name)}</span>
              <div class="notes-folder-actions">
                <button class="icon-btn" data-action="add-subfolder" data-id="${mf.id}" title="New Subfolder" style="padding:2px;width:20px;height:20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="icon-btn" data-action="rename-folder" data-id="${mf.id}" title="Rename Folder" style="padding:2px;width:20px;height:20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn danger" data-action="delete-folder" data-id="${mf.id}" title="Delete Folder" style="padding:2px;width:20px;height:20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                </button>
              </div>
            </div>

            ${isExpanded ? `
              <div class="notes-sub-tree">
                ${folderNotes.map(n => renderNoteItem(n)).join('')}
                ${subFolders.map(sf => {
          const subNotes = (state.notes || []).filter(n => n.folderId === sf.id);
          sortNotes(subNotes, state.noteSortBy);
          const isSubExpanded = state.expandedNoteFolderIds.has(sf.id);
          const isSubActive = state.activeNoteFolderId === sf.id;

          return `
                    <div class="notes-tree-node">
                      <div class="notes-folder-row ${isSubActive ? 'active' : ''}" data-action="select-note-folder" data-id="${sf.id}">
                        <svg class="notes-folder-toggle ${isSubExpanded ? '' : 'collapsed'}" data-action="toggle-note-folder" data-id="${sf.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                        <svg class="notes-subfolder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                        <span class="notes-folder-name">${escapeHtml(sf.name)}</span>
                        <div class="notes-folder-actions">
                          <button class="icon-btn" data-action="rename-folder" data-id="${sf.id}" title="Rename Subfolder" style="padding:2px;width:20px;height:20px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button class="icon-btn danger" data-action="delete-folder" data-id="${sf.id}" title="Delete Subfolder" style="padding:2px;width:20px;height:20px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                          </button>
                        </div>
                      </div>
                      ${isSubExpanded ? `
                        <div class="notes-sub-tree">
                          ${subNotes.map(n => renderNoteItem(n)).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `;
        }).join('')}
              </div>
            ` : ''}
          </div>
        `;
      });
    }

    if (directNotes.length === 0 && mainFolders.length === 0) {
      html = `<div style="color:var(--text-muted);font-size:12.5px;padding:32px 16px;text-align:center;font-style:italic;">No notes or folders in this project yet</div>`;
    }

    treeHtml = html;
  }

  const activeNote = (state.notes || []).find(n => n.id === state.activeNoteId);
  let editorHtml = '';

  if (!activeNote) {
    editorHtml = emptyState(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
      'No Note Selected',
      'Select a note to view or edit, or click "+ New Note" to create one.'
    );
  } else {
    const noteProj = state.projects.find(p => p.id === activeNote.projectId);
    const noteFolder = (state.noteFolders || []).find(f => f.id === activeNote.folderId);
    let breadcrumbPath = noteProj ? escapeHtml(noteProj.name) : 'Project';

    if (noteFolder) {
      if (noteFolder.parentId) {
        const parentFolder = (state.noteFolders || []).find(f => f.id === noteFolder.parentId);
        if (parentFolder) {
          breadcrumbPath += ` / ${escapeHtml(parentFolder.name)}`;
        }
      }
      breadcrumbPath += ` / ${escapeHtml(noteFolder.name)}`;
    }

    const isEditMode = state.noteEditorMode === 'edit';

    editorHtml = `
      <div class="notes-editor-header">
        <div class="notes-editor-top-row">
          <div class="notes-location-breadcrumb">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            <span>${breadcrumbPath}</span>
            <span style="margin: 0 4px;">·</span>
            <span>Updated ${timeAgo(activeNote.updatedAt || activeNote.createdAt)}</span>
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-ghost" data-action="move-active-note" style="padding: 4px 8px; font-size: 11.5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;margin-right:4px;"><path d="M5 9l4-4 4 4"/><path d="M9 5v14"/><path d="M19 15l-4 4-4-4"/><path d="M15 19V5"/></svg>
              Move
            </button>
            <button class="btn-ghost danger" data-action="delete-active-note" style="padding: 4px 8px; font-size: 11.5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Delete
            </button>
            <button class="btn-primary" data-action="save-active-note" style="padding: 4px 12px; font-size: 11.5px;">Save</button>
          </div>
        </div>

        <input type="text" id="noteTitleInput" class="notes-editor-title-input" value="${escapeHtml(activeNote.title)}" placeholder="Note Title..." />
      </div>

      <div class="notes-toolbar-bar">
        <div class="notes-toolbar-group">
          <button class="notes-tb-btn" data-syntax="bold" title="Bold (**text**)"><b>B</b></button>
          <button class="notes-tb-btn" data-syntax="italic" title="Italic (*text*)"><i>I</i></button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="h1" title="Heading 1 (# Heading)">H1</button>
          <button class="notes-tb-btn" data-syntax="h2" title="Heading 2 (## Heading)">H2</button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="bullet" title="Bullet List (- item)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="number" title="Numbered List (1. item)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="checklist" title="Checklist (- [ ] Task)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          </button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="quote" title="Quote (> text)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="table" title="Table (| col | col |)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="hr" title="Horizontal Rule (---)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>
          </button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="code" title="Inline Code (\`code\`)">&lt;/&gt;</button>
          <button class="notes-tb-btn" data-syntax="codeblock" title="Code Block (\`\`\` code \`\`\`)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="link" title="Link ([title](url))">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </button>
        </div>

        <div class="notes-mode-toggle">
          <button class="notes-mode-btn ${isEditMode ? 'active' : ''}" data-action="set-note-mode" data-mode="edit">Edit</button>
          <button class="notes-mode-btn ${!isEditMode ? 'active' : ''}" data-action="set-note-mode" data-mode="preview">Preview</button>
        </div>
      </div>

      <div class="notes-editor-body">
        ${isEditMode ? `
          <textarea id="noteContentInput" class="notes-textarea" placeholder="Write markdown note here...">${escapeHtml(activeNote.content)}</textarea>
        ` : `
          <div class="notes-preview">${parseMarkdown(activeNote.content)}</div>
        `}
      </div>
    `;
  }

  return `
    <div class="notes-container">
      <div class="notes-panel-projects">
        <div class="notes-projects-header">
          <span>Projects</span>
          <span style="font-size:11px;color:var(--text-muted);">${state.projects.length}</span>
        </div>
        <div class="notes-projects-list">
          ${projectsHtml}
        </div>
      </div>

      <div class="notes-panel-tree">
        <div class="notes-tree-top">
          <div class="notes-tree-actions">
            <div class="notes-new-dropdown-wrap">
              <button class="notes-new-btn" id="notesNewBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>New</span>
              </button>
              <div class="notes-dropdown-menu" id="notesNewDropdownMenu">
                <button class="notes-dropdown-item" data-action="new-note-action">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--accent);"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  New Note
                </button>

                ${selectedFolderIsSubfolder ? '' : `
                  <button class="notes-dropdown-item" data-action="new-folder-action">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--warning);"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                    ${state.activeNoteFolderId ? 'New Subfolder' : 'New Folder'}
                  </button>
                `}
              </div>
            </div>

            <select class="notes-sort-select" id="notesSortSelect">
              <option value="updatedAt" ${state.noteSortBy === 'updatedAt' ? 'selected' : ''}>Recently Updated</option>
              <option value="createdAt" ${state.noteSortBy === 'createdAt' ? 'selected' : ''}>Recently Created</option>
              <option value="title" ${state.noteSortBy === 'title' ? 'selected' : ''}>Title A–Z</option>
            </select>
          </div>

          <div class="notes-search-wrap">
            <svg class="notes-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" id="notesSearchInput" class="notes-search-input" placeholder="Search notes & folders..." value="${escapeHtml(state.noteSearchQuery || '')}" />
          </div>
        </div>

        <div class="notes-tree-content">
          ${treeHtml}
        </div>
      </div>

      <div class="notes-panel-editor">
        ${editorHtml}
      </div>
    </div>
  `;
};

const renderNoteItem = (note, query = '', showLocation = false) => {
  const isActive = note.id === state.activeNoteId;
  const snippet = note.content ? trimText(note.content.replace(/[#*`\-[\]]/g, ''), 60) : 'No content';

  let locationStr = '';
  if (showLocation) {
    const proj = state.projects.find(p => p.id === note.projectId);
    const folder = (state.noteFolders || []).find(f => f.id === note.folderId);
    let path = proj ? proj.name : '';
    if (folder) {
      if (folder.parentId) {
        const parentFolder = (state.noteFolders || []).find(f => f.id === folder.parentId);
        if (parentFolder) path += ` / ${parentFolder.name}`;
      }
      path += ` / ${folder.name}`;
    }
    locationStr = `<div class="notes-note-meta">${escapeHtml(path)} · ${timeAgo(note.updatedAt)}</div>`;
  }

  return `
    <button class="notes-note-item ${isActive ? 'active' : ''}" data-action="select-note" data-id="${note.id}">
      <svg class="notes-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <div class="notes-note-info">
        <div class="notes-note-title">${highlight(escapeHtml(note.title), query)}</div>
        <div class="notes-note-snippet">${highlight(escapeHtml(snippet), query)}</div>
        ${locationStr}
      </div>
    </button>
  `;
};

// ─── Boot ────────────────────────────────────────────────
const init = async () => {
  const data = await storage.load();
  const hadLegacyTasksWithoutWorkDone = (data.tasks || []).some(t => t.workDone === undefined);
  state.projects = data.projects;
  state.tasks = migrateTasks(data.tasks);
  state.tests = data.tests || [];
  state.activity = data.activity;
  state.developers = data.developers || [];
  state.releases = data.releases || [];
  state.testCases = data.testCases || [];
  state.modules = data.modules || [];
  state.releasePoints = data.releasePoints || [];
  state.noteFolders = data.noteFolders || [];
  state.notes = data.notes || [];
  state.jiraSync = data.jiraSync || [];
  state.jiraPending = data.jiraPending || [];
  state.projectsViewMode = await ClairDB.getPref('projects_view_mode', 'list');
  state.theme = await ClairDB.getPref('theme', 'light');
  applyTheme(state.theme);

  const hiddenPref = await ClairDB.getPref('hidden_modules', '[]');
  try {
    state.hiddenModules = JSON.parse(hiddenPref) || [];
  } catch (e) {
    state.hiddenModules = [];
  }
  state.defaultView = await ClairDB.getPref('default_view', 'dashboard');
  applyModuleVisibility();

  // Scheduled auto-backup status is written by background.js into chrome.storage.local.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    state.autoBackup = await chrome.storage.local.get(AUTO_BACKUP_KEYS);
    if (jiraAvailable()) state.jira = await ClairJira.getPublicConfig();
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && jiraAvailable() && ClairJira.JIRA_KEY in changes) {
        state.jira = await ClairJira.getPublicConfig(); // e.g. connected/disconnected in another Clair tab
      }
      if (area !== 'local' || !AUTO_BACKUP_KEYS.some(k => k in changes)) return;
      state.autoBackup = await chrome.storage.local.get(AUTO_BACKUP_KEYS);
      // Refresh just the Automatic Backup box: a full render() here would wipe whatever
      // the user is typing elsewhere on Settings (e.g. the Jira form) when a backup runs.
      const box = state.view === 'settings' && document.querySelector('.auto-backup-box');
      if (box && (document.activeElement || {}).id !== 'autoBackupTime') box.outerHTML = renderAutoBackupSettings();
    });
  }

  // Persist the "task completed" backfill immediately so existing tasks have
  // it in SQLite right away, not only after the next edit to each one.
  if (hadLegacyTasksWithoutWorkDone) {
    await storage.save();
  }

  // Sync project release dates with Release Management release dates
  if (syncProjectReleaseDates()) {
    await storage.save();
  }

  // One-time cleanup: wipe all existing test-case modules (requested cleanup
  // of pre-existing module data). Guarded by a meta flag so it only ever
  // runs once — modules created afterward are left alone.
  const modulesWiped = (await ClairDB.getPref('modules_wiped_v1')) === 'true';
  if (!modulesWiped) {
    if (state.modules.length > 0) {
      state.modules = [];
      state.testCases.forEach(tc => { tc.moduleId = ''; });
      await storage.save();
    }
    await ClairDB.setPref('modules_wiped_v1', 'true');
  }

  // Initialize mock data on first load only
  const dbInitialized = (await ClairDB.getPref('db_initialized')) === 'true';
  if (!dbInitialized && (!state.projects || state.projects.length === 0)) {
    try {
      const backupPath = 'Backup/clair-export-2026-06-02.json';
      const response = await fetch(backupPath);
      if (response.ok) {
        const backupData = await response.json();
        state.projects = backupData.projects || [];
        state.tasks = migrateTasks(backupData.tasks || []);
        state.tests = backupData.tests || [];
        state.activity = backupData.activity || [];
        state.developers = backupData.developers || [];
        state.releases = backupData.releases || [];
        state.testCases = backupData.testCases || [];
        state.modules = backupData.modules || [];
        state.releasePoints = backupData.releasePoints || [];
        state.noteFolders = backupData.noteFolders || [];
        state.notes = backupData.notes || [];
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
    await ClairDB.setPref('db_initialized', 'true');
  } else if (!dbInitialized) {
    prepopulateMockData(); // to ensure default developers/default structures exist
    await ClairDB.setPref('db_initialized', 'true');
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
  document.getElementById('saveFolderBtn').addEventListener('click', saveFolder);
  document.getElementById('confirmMoveNoteBtn').addEventListener('click', saveMoveNote);
  document.getElementById('saveDevModalBtn')?.addEventListener('click', saveDeveloper);
  document.getElementById('closeDeveloperModal')?.addEventListener('click', closeModals);
  document.getElementById('cancelDevModal')?.addEventListener('click', closeModals);
  document.getElementById('devModalSelectAll')?.addEventListener('click', () => {
    document.querySelectorAll('#devModalProjectChecklist input[name="devProjectCheck"]').forEach(cb => {
      cb.checked = true;
      cb.closest('.dev-project-checkbox-row')?.classList.add('checked');
    });
  });
  document.getElementById('devModalDeselectAll')?.addEventListener('click', () => {
    document.querySelectorAll('#devModalProjectChecklist input[name="devProjectCheck"]').forEach(cb => {
      cb.checked = false;
      cb.closest('.dev-project-checkbox-row')?.classList.remove('checked');
    });
  });

  // Event delegation for Module Visibility Toggles & Settings controls
  document.addEventListener('change', async (e) => {
    const modToggle = e.target.closest('[data-action="toggle-module-visibility"]');
    if (modToggle) {
      const moduleKey = modToggle.dataset.module;
      if (moduleKey === 'settings') return; // Cannot toggle settings
      const hiddenSet = new Set(state.hiddenModules || []);
      if (modToggle.checked) {
        hiddenSet.delete(moduleKey);
      } else {
        hiddenSet.add(moduleKey);
      }
      state.hiddenModules = Array.from(hiddenSet);
      await ClairDB.setPref('hidden_modules', JSON.stringify(state.hiddenModules));
      applyModuleVisibility();
      showToast(modToggle.checked ? `Module enabled` : `Module hidden from sidebar`);
      render();
      return;
    }

    if (e.target.id === 'defaultViewSelect') {
      state.defaultView = e.target.value;
      await ClairDB.setPref('default_view', state.defaultView);
      showToast(`Default startup module updated to ${e.target.options[e.target.selectedIndex].text}`);
      return;
    }

    const tcCb = e.target.closest('.testcase-select-checkbox');
    if (tcCb) {
      handleTestCaseCheckboxChange(tcCb);
      return;
    }

    if (e.target.id === 'devSelectAllCheckbox') {
      const isChecked = e.target.checked;
      const query = (state.devSearch || '').toLowerCase().trim();
      const filter = state.devFilter || 'all';
      const visibleIds = (state.developers || []).filter(d => {
        const assignedProjs = (d.projectIds || []).map(pid => (state.projects || []).find(p => p.id === pid)).filter(Boolean);
        const projNames = assignedProjs.map(p => p.name.toLowerCase()).join(' ');
        const email = (d.email || '').toLowerCase();
        const role = (d.role || '').toLowerCase();
        const matchesSearch = !query || d.name.toLowerCase().includes(query) || email.includes(query) || role.includes(query) || projNames.includes(query);
        let matchesFilter = true;
        if (filter === 'assigned') matchesFilter = assignedProjs.length > 0;
        else if (filter === 'unassigned') matchesFilter = assignedProjs.length === 0;
        else if (filter.startsWith('proj:')) matchesFilter = (d.projectIds || []).includes(filter.replace('proj:', ''));
        return matchesSearch && matchesFilter;
      }).map(d => d.id);

      state.devSelectedIds = isChecked ? visibleIds : [];
      render();
      return;
    }

    const devCb = e.target.closest('.dev-row-checkbox');
    if (devCb) {
      const devId = devCb.dataset.devId;
      const selected = new Set(state.devSelectedIds || []);
      if (devCb.checked) selected.add(devId);
      else selected.delete(devId);
      state.devSelectedIds = Array.from(selected);
      render();
      return;
    }

    if (e.target.name === 'devProjectCheck') {
      const row = e.target.closest('.dev-project-checkbox-row');
      if (row) {
        if (e.target.checked) row.classList.add('checked');
        else row.classList.remove('checked');
      }
      return;
    }
  });

  // Link developer dropdown updates to project selection changes
  document.getElementById('testProject').addEventListener('change', (e) => {
    updateDeveloperDropdown(e.target.value, 'testDeveloper', document.getElementById('testDeveloper').value);
  });
  // Release project/version now uses checkboxes (multi-select) wired inside openReleaseModal.
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
  document.getElementById('closeExportReportModal').addEventListener('click', closeModals);
  document.getElementById('cancelExportReportModal').addEventListener('click', closeModals);
  document.getElementById('closeFolderModal').addEventListener('click', closeModals);
  document.getElementById('cancelFolderModal').addEventListener('click', closeModals);
  document.getElementById('closeMoveNoteModal').addEventListener('click', closeModals);
  document.getElementById('cancelMoveNoteModal').addEventListener('click', closeModals);
  document.getElementById('generateReportBtn').addEventListener('click', async () => {
    const btn = document.getElementById('generateReportBtn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Generating…';
    try {
      await generateExcelReport();
    } catch (err) {
      console.error(err);
      showToast('Failed to generate report', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
  document.getElementById('reportProjectSelectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('input[name="reportProjectCheck"]').forEach(cb => cb.checked = true);
  });
  document.getElementById('reportProjectClearBtn').addEventListener('click', () => {
    document.querySelectorAll('input[name="reportProjectCheck"]').forEach(cb => cb.checked = false);
  });
  document.getElementById('reportDevSelectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('input[name="reportDevCheck"]').forEach(cb => cb.checked = true);
  });
  document.getElementById('reportDevClearBtn').addEventListener('click', () => {
    document.querySelectorAll('input[name="reportDevCheck"]').forEach(cb => cb.checked = false);
  });
  // Completion date modal
  const applyCompletionDate = async (dateIso) => {
    const taskId = document.getElementById('completionTaskId').value;
    const modal = document.getElementById('completionDateModal');
    const oldStatus = modal.dataset.oldStatus || 'To-Do';
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      task.completedDate = new Date(dateIso + 'T12:00:00').toISOString();
      task.updatedAt = new Date().toISOString();
      logActivity(`Moved task "${task.title}" from ${oldStatus} to Done`, 'task');
      await storage.save();
    }
    closeModals();
    render();
    showToast('Task marked as Done');
  };
  document.getElementById('closeCompletionDateModal').addEventListener('click', async () => {
    await applyCompletionDate(new Date().toISOString().split('T')[0]);
  });
  document.getElementById('skipCompletionDate').addEventListener('click', async () => {
    await applyCompletionDate(new Date().toISOString().split('T')[0]);
  });
  document.getElementById('confirmCompletionDate').addEventListener('click', async () => {
    const val = document.getElementById('completionDateInput').value || new Date().toISOString().split('T')[0];
    await applyCompletionDate(val);
  });

  document.getElementById('closeConfirmModal').addEventListener('click', closeModals);
  document.getElementById('cancelConfirm').addEventListener('click', closeModals);
  document.getElementById('modalBackdrop').addEventListener('click', closeModals);

  // Release Version Modal listeners
  const closeReleaseVerModal = document.getElementById('closeReleaseVersionModal');
  if (closeReleaseVerModal) closeReleaseVerModal.addEventListener('click', closeModals);
  const cancelReleaseVerModal = document.getElementById('cancelReleaseVersionModal');
  if (cancelReleaseVerModal) cancelReleaseVerModal.addEventListener('click', closeModals);
  const confirmReleaseVerBtn = document.getElementById('confirmReleaseVersionBtn');
  if (confirmReleaseVerBtn) confirmReleaseVerBtn.addEventListener('click', confirmReleaseVersion);

  const releaseVerPresets = document.getElementById('releaseVersionPresets');
  if (releaseVerPresets) {
    releaseVerPresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.ver-preset-btn');
      if (!btn) return;
      const verSpan = btn.querySelector('.preset-ver');
      const val = verSpan ? verSpan.textContent.trim() : '';
      if (val) {
        document.querySelectorAll('#releaseVersionPresets .ver-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const input = document.getElementById('nextReleaseVersionInput');
        if (input) {
          input.value = val;
          input.focus();
        }
      }
    });
  }

  const nextVerInput = document.getElementById('nextReleaseVersionInput');
  if (nextVerInput) {
    nextVerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmReleaseVersion();
      }
    });
    nextVerInput.addEventListener('input', (e) => {
      const typed = e.target.value.trim();
      document.querySelectorAll('#releaseVersionPresets .ver-preset-btn').forEach(b => {
        const verSpan = b.querySelector('.preset-ver');
        b.classList.toggle('active', verSpan && verSpan.textContent.trim() === typed);
      });
    });
  }

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

  // Handle click delegation inside Excel Import Modal for duplicates View / Clean / Delete
  const excelImportModal = document.getElementById('excelImportModal');
  if (excelImportModal) {
    excelImportModal.addEventListener('click', async (e) => {
      const toggleLink = e.target.closest('#viewExcelDupesLink');
      if (toggleLink) {
        e.preventDefault();
        const dupesSec = document.getElementById('excelImportDuplicatesSection');
        if (dupesSec) {
          const isHidden = dupesSec.style.display === 'none';
          dupesSec.style.display = isHidden ? 'block' : 'none';
          toggleLink.textContent = isHidden ? 'Hide List' : 'View / Clean';
        }
        return;
      }

      const deleteBtn = e.target.closest('.delete-dupe-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const tcId = deleteBtn.dataset.tcId;
        await deleteTestCaseFromImport(tcId);
        return;
      }
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

  // Search (Global search removed; guard if present, and delegate Ctrl+K to in-page search)
  const searchInput = document.getElementById('globalSearch');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => handleSearch(searchInput.value), 200);
    });
  }

  // Keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const activeSearch = document.getElementById('projectSearchInput')
        || document.getElementById('taskSearchInput')
        || document.getElementById('testSearchInput')
        || document.getElementById('releaseSearchInput')
        || document.getElementById('releasePtSearchInput')
        || document.getElementById('testCaseSearchInput')
        || searchInput;
      if (activeSearch) activeSearch.focus();
    }
    if (e.key === 'Escape') {
      closeModals();
      const tcDd = document.getElementById('tcProjectDropdown');
      if (tcDd) tcDd.classList.remove('open');
    }
    // Settings section menu: arrow keys move between sections (vertical tab list).
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && e.target.closest && e.target.closest('.st-nav')) {
      e.preventDefault();
      const keys = SETTINGS_SECTIONS.map(s => s.key);
      const i = keys.indexOf(state.settingsSection || 'general');
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + keys.length) % keys.length;
      state.settingsSection = keys[next];
      render();
      const tab = document.getElementById(`st-tab-${keys[next]}`);
      if (tab) tab.focus();
    }
    // Test scenario module rail items are focusable: Enter/Space opens the module.
    if ((e.key === ' ' || e.key === 'Enter') && e.target.matches && e.target.matches('.tcs-mod')) {
      e.preventDefault();
      e.target.click();
    }
    // Release Point checklist rows are focusable checkboxes: Space/Enter toggles.
    if ((e.key === ' ' || e.key === 'Enter') && e.target.matches && e.target.matches('.rp-checklist-item[data-action="toggle-checklist-item"]')) {
      e.preventDefault();
      toggleReleasePtChecklistItem(e.target.dataset.rpId, e.target.dataset.itemId);
    }
  });

  // Test Case project dropdown: close on outside click
  document.addEventListener('click', e => {
    const tcDd = document.getElementById('tcProjectDropdown');
    if (tcDd && tcDd.classList.contains('open') && !e.target.closest('#tcProjectDropdown')) {
      tcDd.classList.remove('open');
    }
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
      const fsm = document.getElementById('folderModal');
      const mnm = document.getElementById('moveNoteModal');
      if (pm.classList.contains('show')) saveProject();
      else if (tm.classList.contains('show')) saveTask();
      else if (tsm.classList.contains('show')) saveTest();
      else if (rsm.classList.contains('show')) saveRelease();
      else if (tcsm.classList.contains('show')) saveTestCase();
      else if (msm.classList.contains('show')) saveModule();
      else if (eism.classList.contains('show')) handleExcelImport();
      else if (rpsm.classList.contains('show')) saveReleasePoint();
      else if (fsm.classList.contains('show')) saveFolder();
      else if (mnm.classList.contains('show')) saveMoveNote();
    }
  });

  // Notes module event delegation
  document.addEventListener('click', e => {
    const newBtn = e.target.closest('#notesNewBtn');
    if (newBtn) {
      e.stopPropagation();
      const menu = document.getElementById('notesNewDropdownMenu');
      if (menu) menu.classList.toggle('show');
      return;
    } else {
      const menu = document.getElementById('notesNewDropdownMenu');
      if (menu && menu.classList.contains('show') && !e.target.closest('#notesNewDropdownMenu')) {
        menu.classList.remove('show');
      }
    }

    const newNoteBtn = e.target.closest('[data-action="new-note-action"]');
    if (newNoteBtn) {
      createNote(state.activeNoteProjectId, state.activeNoteFolderId);
      return;
    }

    const newFolderBtn = e.target.closest('[data-action="new-folder-action"]');
    if (newFolderBtn) {
      openFolderModal(null, state.activeNoteProjectId, state.activeNoteFolderId);
      return;
    }

    const projItem = e.target.closest('[data-action="select-note-project"]');
    if (projItem) {
      if (state.activeNoteId) saveActiveNote(true);
      state.activeNoteProjectId = projItem.dataset.id;
      state.activeNoteFolderId = null;
      state.activeNoteId = null;
      render();
      return;
    }

    const folderRow = e.target.closest('[data-action="select-note-folder"]');
    const folderToggle = e.target.closest('[data-action="toggle-note-folder"]');
    if (folderToggle) {
      e.stopPropagation();
      const fId = folderToggle.dataset.id;
      if (state.expandedNoteFolderIds.has(fId)) {
        state.expandedNoteFolderIds.delete(fId);
      } else {
        state.expandedNoteFolderIds.add(fId);
      }
      render();
      return;
    } else if (folderRow) {
      if (state.activeNoteId) saveActiveNote(true);
      const fId = folderRow.dataset.id;
      state.activeNoteFolderId = fId;
      if (!state.expandedNoteFolderIds.has(fId)) {
        state.expandedNoteFolderIds.add(fId);
      }
      render();
      return;
    }

    const addSub = e.target.closest('[data-action="add-subfolder"]');
    if (addSub) {
      e.stopPropagation();
      openFolderModal(null, state.activeNoteProjectId, addSub.dataset.id);
      return;
    }

    const renameF = e.target.closest('[data-action="rename-folder"]');
    if (renameF) {
      e.stopPropagation();
      openFolderModal(renameF.dataset.id);
      return;
    }

    const deleteF = e.target.closest('[data-action="delete-folder"]');
    if (deleteF) {
      e.stopPropagation();
      confirmDeleteFolder(deleteF.dataset.id);
      return;
    }

    const noteItem = e.target.closest('[data-action="select-note"]');
    if (noteItem) {
      selectNote(noteItem.dataset.id);
      return;
    }

    const saveNoteBtn = e.target.closest('[data-action="save-active-note"]');
    if (saveNoteBtn) {
      saveActiveNote();
      return;
    }

    const deleteNoteBtn = e.target.closest('[data-action="delete-active-note"]');
    if (deleteNoteBtn) {
      confirmDeleteNote(state.activeNoteId);
      return;
    }

    const moveNoteBtn = e.target.closest('[data-action="move-active-note"]');
    if (moveNoteBtn) {
      openMoveNoteModal(state.activeNoteId);
      return;
    }

    const syntaxBtn = e.target.closest('[data-syntax]');
    if (syntaxBtn) {
      insertMarkdownSyntax(syntaxBtn.dataset.syntax);
      return;
    }

    const modeBtn = e.target.closest('[data-action="set-note-mode"]');
    if (modeBtn) {
      if (state.activeNoteId) saveActiveNote(true);
      state.noteEditorMode = modeBtn.dataset.mode;
      render();
      return;
    }

    const noteAnchor = e.target.closest('.notes-preview a[href^="#"]');
    if (noteAnchor) {
      e.preventDefault();
      const href = noteAnchor.getAttribute('href');
      const rawTarget = decodeURIComponent(href.replace(/^#/, ''));
      let targetEl = document.getElementById(rawTarget);
      if (!targetEl) {
        const clean = rawTarget.replace(/-+/g, '-');
        targetEl = document.getElementById(clean) ||
                   document.querySelector(`.notes-preview [id="${rawTarget}" i], .notes-preview [id="${clean}" i]`);
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
  });

  let noteSearchTimer;
  let noteAutoSaveTimer;
  let devSearchTimer;
  document.addEventListener('input', e => {
    if (e.target.id === 'devSearchInput') {
      clearTimeout(devSearchTimer);
      devSearchTimer = setTimeout(() => {
        state.devSearch = e.target.value;
        const curInput = document.getElementById('devSearchInput');
        const pos = curInput ? curInput.selectionStart : 0;
        render();
        const newInput = document.getElementById('devSearchInput');
        if (newInput) {
          newInput.focus();
          try { newInput.setSelectionRange(pos, pos); } catch (err) { }
        }
      }, 150);
      return;
    }

    if (e.target.id === 'devModalProjectSearch') {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#devModalProjectChecklist .dev-project-checkbox-row').forEach(row => {
        const name = row.dataset.name || '';
        row.style.display = (!q || name.includes(q)) ? 'flex' : 'none';
      });
      return;
    }

    if (e.target.id === 'notesSearchInput') {
      clearTimeout(noteSearchTimer);
      noteSearchTimer = setTimeout(() => {
        state.noteSearchQuery = e.target.value;
        const curInput = document.getElementById('notesSearchInput');
        const pos = curInput ? curInput.selectionStart : 0;
        render();
        const newInput = document.getElementById('notesSearchInput');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(pos, pos);
        }
      }, 200);
      return;
    }

    if (e.target.id === 'noteTitleInput' && state.activeNoteId) {
      const activeNote = (state.notes || []).find(n => n.id === state.activeNoteId);
      if (activeNote) {
        activeNote.title = e.target.value;
        activeNote.updatedAt = new Date().toISOString();
        const noteEl = document.querySelector(`.notes-note-item[data-id="${activeNote.id}"] .notes-note-title`);
        if (noteEl) noteEl.textContent = activeNote.title || 'Untitled Note';
        clearTimeout(noteAutoSaveTimer);
        noteAutoSaveTimer = setTimeout(() => storage.save(), 400);
      }
      return;
    }

    if (e.target.id === 'noteContentInput' && state.activeNoteId) {
      const activeNote = (state.notes || []).find(n => n.id === state.activeNoteId);
      if (activeNote) {
        activeNote.content = e.target.value;
        activeNote.updatedAt = new Date().toISOString();
        const snippetEl = document.querySelector(`.notes-note-item[data-id="${activeNote.id}"] .notes-note-snippet`);
        if (snippetEl) snippetEl.textContent = trimText(activeNote.content.replace(/[#*`\-[\]]/g, ''), 60) || 'No content';
        clearTimeout(noteAutoSaveTimer);
        noteAutoSaveTimer = setTimeout(() => storage.save(), 400);
      }
      return;
    }
  });

  document.addEventListener('focusout', e => {
    if ((e.target.id === 'noteTitleInput' || e.target.id === 'noteContentInput') && state.activeNoteId) {
      saveActiveNote(true);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.activeNoteId) {
      const note = (state.notes || []).find(n => n.id === state.activeNoteId);
      if (note) {
        const titleInput = document.getElementById('noteTitleInput');
        const contentInput = document.getElementById('noteContentInput');
        if (titleInput) note.title = titleInput.value.trim() || 'Untitled Note';
        if (contentInput) note.content = contentInput.value;
        note.updatedAt = new Date().toISOString();
        storage.save();
      }
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'notesSortSelect') {
      state.noteSortBy = e.target.value;
      render();
      return;
    }
  });

  document.addEventListener('click', e => {
    const menu = document.getElementById('devFilterMenu');
    if (menu && menu.style.display !== 'none' && !e.target.closest('#devFilterTriggerBtn') && !e.target.closest('#devFilterMenu')) {
      menu.style.display = 'none';
    }

    if (e.target.closest('#closeDeveloperModal') || e.target.closest('#cancelDevModal')) {
      closeModals();
      return;
    }

    if (e.target.closest('#saveDevModalBtn')) {
      saveDeveloper();
      return;
    }

    if (e.target.closest('#devModalSelectAll')) {
      document.querySelectorAll('#devModalProjectChecklist input[name="devProjectCheck"]').forEach(cb => {
        cb.checked = true;
        cb.closest('.dev-project-checkbox-row')?.classList.add('checked');
      });
      return;
    }

    if (e.target.closest('#devModalDeselectAll')) {
      document.querySelectorAll('#devModalProjectChecklist input[name="devProjectCheck"]').forEach(cb => {
        cb.checked = false;
        cb.closest('.dev-project-checkbox-row')?.classList.remove('checked');
      });
      return;
    }
  });

  // Multi-tab real-time database synchronization listener
  if (typeof BroadcastChannel !== 'undefined') {
    const tabSyncChannel = new BroadcastChannel('clair_db_sync');
    tabSyncChannel.onmessage = async (e) => {
      // Ignore self-sent messages so auto-save in this tab never destroys focus or cursor position
      if (e.data && e.data.type === 'DB_SAVED' && e.data.senderId !== ClairDB.getTabId()) {
        const active = document.activeElement;
        const isEditing = active && (active.id === 'noteTitleInput' || active.id === 'noteContentInput' || active.id === 'notesSearchInput');
        const start = isEditing ? active.selectionStart : 0;
        const end = isEditing ? active.selectionEnd : 0;
        const activeId = isEditing ? active.id : null;

        const data = await storage.load();
        state.projects = data.projects;
        state.tasks = migrateTasks(data.tasks);
        state.tests = data.tests || [];
        state.activity = data.activity;
        state.developers = data.developers || [];
        state.releases = data.releases || [];
        state.testCases = data.testCases || [];
        state.modules = data.modules || [];
        state.releasePoints = data.releasePoints || [];
        state.noteFolders = data.noteFolders || [];
        state.notes = data.notes || [];
        state.jiraSync = data.jiraSync || [];
        state.jiraPending = data.jiraPending || [];

        render();

        if (activeId) {
          const el = document.getElementById(activeId);
          if (el) {
            el.focus();
            try { el.setSelectionRange(start, end); } catch (err) { }
          }
        }
      }
    };
  }

  attachCardListeners();
  const startView = (state.defaultView && document.querySelector(`.nav-item[data-view="${state.defaultView}"]`)) ? state.defaultView : 'dashboard';
  setView(startView);
  updateStorageInfo();
};

document.addEventListener('DOMContentLoaded', init);
