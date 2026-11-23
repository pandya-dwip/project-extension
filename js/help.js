// Clair — js/help.js: Interactive User Guide, Module Breakdown & Relationship Architecture.
// Part of Clair scripts, loaded in order by index.html (classic scripts share one global scope).

let helpState = {
  activeSection: 'overview', // 'overview' | 'relations' | 'commands' | 'shortcuts' | module ID
  searchQuery: ''
};

const HELP_MODULES = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
    badge: 'Overview',
    color: '#059669',
    summary: 'Central mission control command center displaying live health metrics, task velocity, test pass rates, and active deployments.',
    features: [
      { title: 'Top KPI Summary Cards', desc: 'Real-time totals for active projects, tasks across all lifecycle stages, upcoming releases, and total QA test coverage.' },
      { title: 'Weekly Velocity Bar Chart', desc: 'Visual bar chart tracking completed tasks week-by-week for the selected month to measure engineering throughput.' },
      { title: 'Actionable Recent Tasks Widget', desc: 'Instantly highlights tasks requiring immediate attention: overdue items, due today, due soon, vs completed work.' },
      { title: 'Test Pass Rates by Project', desc: 'Live horizontal progress bars charting pass/fail rates per project with immediate defect visibility.' },
      { title: 'In-Flight Release Stage Pipeline', desc: 'Displays release trains currently moving through staging and QA verification checklists.' }
    ],
    inbound: [
      { name: 'Projects', badge: 'Counts', desc: 'Active project statuses and completion percentages' },
      { name: 'Tasks', badge: 'Velocity', desc: 'Live task counts grouped by To-Do, In Progress, Done' },
      { name: 'Test Cases', badge: 'Quality', desc: 'Pass vs fail rates aggregated per project' }
    ],
    outbound: [
      { name: 'Executive Report', badge: 'Export', desc: 'Feeds high-level KPI cards into multi-sheet Excel reports' }
    ],
    proTip: 'The weekly velocity chart updates in real-time as you complete tasks. Use it during sprint reviews to showcase completed work without pulling manual reports.'
  },
  {
    id: 'projects',
    name: 'Projects',
    icon: `<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>`,
    badge: 'Core Entity',
    color: '#0284c7',
    summary: 'The primary workspace entity. Every task, release, note, and test case belongs to one or more projects.',
    features: [
      { title: 'Dual View Modes', desc: 'Switch seamlessly between the classic 3-column List view (with manual drag reordering) and the 5-stage Lifecycle Kanban board.' },
      { title: '5 Lifecycle Stages', desc: 'Progress work through: Yet to Start → On Going → Completed → Monitoring → On Hold.' },
      { title: 'Platform-Aware Versioning', desc: 'Single version milestone for Web applications; dual independent Android & iOS version trackers for Mobile Apps.' },
      { title: 'Encrypted Environments & Secrets', desc: 'Safely stores QA & Production URLs, usernames, and passwords directly in your local SQLite store.' },
      { title: 'Deep Project Details Page', desc: 'Dedicated hub featuring developer workload cards, release histories, test metrics, and full task audit logs.' }
    ],
    inbound: [
      { name: 'Developers', badge: 'Staffing', desc: 'Assigned engineers appear in project team pills and filtered dropdowns' }
    ],
    outbound: [
      { name: 'Tasks, Notes, QA, Releases', badge: 'Parent', desc: 'Serves as the root container linking all engineering artifacts' }
    ],
    proTip: 'In the Project List view, you can drag and drop project rows to custom re-order your active focus list. Clair preserves your exact manual order.'
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18"/>`,
    badge: 'Execution',
    color: '#059669',
    summary: 'Day-to-day execution board with Kanban drag-and-drop, date filters, completion audit logs, and automated Jira QA tasks.',
    features: [
      { title: '4-Column Kanban Board', desc: 'To-Do, In Progress, Done, and On Hold with individual scrollable columns and drag-and-drop card movements.' },
      { title: 'Work Done Audit Field', desc: 'Mandatory verification log detailing exactly what was accomplished before completing the task.' },
      { title: 'Completion Date Capture', desc: 'Prompts for the exact completion date whenever a task is finished, ensuring historical accuracy in velocity metrics.' },
      { title: 'Automated Jira QA Tasks', desc: 'Background engine automatically aggregates "Ready for QA" Jira tickets into batch tasks with live verification checkboxes.' },
      { title: 'Multi-Project & Multi-Assignee', desc: 'A task can belong to multiple projects and team members simultaneously for cross-functional initiatives.' }
    ],
    inbound: [
      { name: 'Projects & Developers', badge: 'Tagging', desc: 'Tagged to parent projects and assigned to team members' },
      { name: 'Jira Cloud', badge: 'Automation', desc: 'Ready for QA tickets generate automated QA batch tasks' }
    ],
    outbound: [
      { name: 'Timeline & Calendar', badge: 'Dates', desc: 'Start and completion dates render as horizontal Gantt bars and calendar cards' },
      { name: 'Dashboard', badge: 'Metrics', desc: 'Powers completion rates, velocity charts, and overdue alerts' }
    ],
    proTip: 'Press Shift while dragging cards to reorder tasks within the same column without altering their status.'
  },
  {
    id: 'timeline',
    name: 'Interactive Timeline / Gantt',
    icon: `<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="13" y2="8" stroke-width="2.2"/><line x1="10" y1="12" x2="18" y2="12" stroke-width="2.2"/><line x1="6" y1="16" x2="14" y2="16" stroke-width="2.2"/>`,
    badge: 'Planning',
    color: '#d97706',
    summary: 'Horizontal scheduling chart displaying project durations, task overlaps, release milestones, and developer workloads.',
    features: [
      { title: 'Multi-Scale Zoom Levels', desc: 'Zoom effortlessly between Days (day-by-day precision), Weeks (12-week plan), and Months (quarterly overview).' },
      { title: 'Smart Grouping Modes', desc: 'Group by Project to see overarching duration bars, or Group by Developer to spot bottlenecks and bandwidth issues.' },
      { title: 'Collapsible Clean Hierarchy', desc: 'Groups start cleanly collapsed by default. Expand individual projects or click "Expand All" for full visibility.' },
      { title: 'Release Milestone Diamonds', desc: 'Target release dates appear as purple milestone diamonds plotted directly along project tracks.' },
      { title: 'Live "Today" Indicator', desc: 'A vertical marker highlights today\'s position with a 1-click "Today" centering button.' }
    ],
    inbound: [
      { name: 'Projects & Tasks', badge: 'Durations', desc: 'Computes date boundaries from task start dates and due dates' },
      { name: 'Releases', badge: 'Milestones', desc: 'Plots scheduled release deployment dates onto the timeline' }
    ],
    outbound: [
      { name: 'Resource Audit', badge: 'Insights', desc: 'Exposes overlapping deadlines and developer scheduling conflicts' }
    ],
    proTip: 'Switch to "By Developer" grouping before sprint planning. If a developer has 5 overlapping bars in the same week, reassign tasks before bottlenecks occur.'
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    badge: 'Knowledge Base',
    color: '#0891b2',
    summary: 'Project-scoped Markdown documentation workspace with a clean 3-panel split layout and live HTML preview.',
    features: [
      { title: 'Strict 1-Level Hierarchy', desc: 'Organized cleanly per Project → Main Folder → Subfolder → Notes to prevent messy folder sprawl.' },
      { title: 'Rich Markdown Toolbar', desc: '10 formatting tools: bold, italic, headings, lists, code blocks, checklists, links, and tables.' },
      { title: 'Live Split Preview', desc: 'Toggle instantly between raw Markdown editing and formatted HTML preview mode.' },
      { title: 'Debounced Full-Text Search', desc: 'Search across titles, bodies, and project breadcrumbs in real-time.' }
    ],
    inbound: [
      { name: 'Projects', badge: 'Container', desc: 'Every note is scoped inside its respective project' }
    ],
    outbound: [
      { name: 'Documentation', badge: 'Reference', desc: 'Houses architecture specs, meeting minutes, and onboarding guides' }
    ],
    proTip: 'Use Markdown checklists (`- [ ] task`) inside project notes for meeting minutes and release runbooks.'
  },
  {
    id: 'calendar',
    name: 'Calendar',
    icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
    badge: 'Schedule',
    color: '#7c3aed',
    summary: 'Monthly grid view organizing work by active date spans, due dates, and completion milestones.',
    features: [
      { title: 'Two-Panel Daily Agenda', desc: 'Interactive month calendar grid on the left with a daily task agenda breakdown on the right.' },
      { title: 'Continuous Task Spans', desc: 'Visualizes multi-day work by highlighting every date between start and due date.' },
      { title: '1-Click Quick Creation', desc: 'Click on any calendar day to immediately create a task pre-filled with that date.' }
    ],
    inbound: [
      { name: 'Tasks', badge: 'Sync', desc: 'Reads start dates, due dates, and completed dates' }
    ],
    outbound: [
      { name: 'Planning', badge: 'Agenda', desc: 'Gives managers a day-by-day deadline overview' }
    ],
    proTip: 'Clicking any date on the calendar immediately updates the right-hand agenda to show what is due on that specific day.'
  },
  {
    id: 'tests',
    name: 'Project Insights',
    icon: `<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/>`,
    badge: 'Triage & Ideas',
    color: '#e11d48',
    summary: 'Lightweight triage board for capturing Issues, Enhancements, and Technical Notes outside of full tasks.',
    features: [
      { title: '3 Category Boards', desc: 'Organizes feedback into Issue, Enhancement, and Technical Note streams.' },
      { title: 'Triage Lifecycle', desc: 'Progresses items through In Dev → QA → Done → Known Issue.' },
      { title: 'Assignment Status Filter', desc: 'Toggle between "Yet to be assigned" and "Assigned" with developer mapping.' }
    ],
    inbound: [
      { name: 'Projects & Developers', badge: 'Scoping', desc: 'Categorized per project and assigned to engineers' }
    ],
    outbound: [
      { name: 'Tasks & Jira', badge: 'Promotion', desc: 'Approved enhancements can be promoted to formal tasks or Jira tickets' }
    ],
    proTip: 'Use Project Insights as an inbox during meetings to capture rapid bug reports before deciding if they warrant a full task.'
  },
  {
    id: 'testcases',
    name: 'Test Case Management',
    icon: `<path d="M9 3v7.2a4 4 0 01-1.3 2.9l-3.4 3.1A2 2 0 005.7 20h12.6a2 2 0 001.4-3.8l-3.4-3.1A4 4 0 0115 10.2V3"/><path d="M6 3h12M12 3v7M8.5 13h7"/>`,
    badge: 'Quality & QA',
    color: '#16a34a',
    summary: 'Full-featured QA test suite covering test scenarios, module breakdown, and spreadsheet import.',
    features: [
      { title: '3-Level QA Hierarchy', desc: 'Home (portfolio pass rates) → Project Overview (module metrics) → Test Scenarios (full interactive table).' },
      { title: 'Module Organization', desc: 'Group scenarios by functional subsystem with real-time pass-rate bars.' },
      { title: 'Excel & CSV Import', desc: 'Smart column auto-detection and duplicate scenario ID resolution with visual preview.' },
      { title: 'Bulk Status & Assignee Actions', desc: 'Multi-select rows to batch-mark Passed/Failed or assign to testers.' }
    ],
    inbound: [
      { name: 'Projects', badge: 'Hierarchy', desc: 'Tests belong to specific functional modules within a project' }
    ],
    outbound: [
      { name: 'Dashboard & Reports', badge: 'Metrics', desc: 'Pass rates and defect IDs flow into executive spreadsheets' }
    ],
    proTip: 'You can export existing test suites to Excel, edit test steps in bulk, and re-import them with duplicate protection.'
  },
  {
    id: 'releases',
    name: 'Release Management',
    icon: `<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"/><polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"/>`,
    badge: 'Deployment',
    color: '#ea580c',
    summary: 'Orchestrates software deployments through a structured 7-stage release pipeline with release note generation.',
    features: [
      { title: '7-Stage Release Pipeline', desc: 'Draft → Planned → In Progress → Testing → Approved → Released (or Rolled Back).' },
      { title: 'Multi-Version Bundles', desc: 'Deploy multi-component software by grouping backend and mobile versions in one release train.' },
      { title: 'Release Announcement Generator', desc: 'One-click generates executive email-ready release notes with change logs and test status.' },
      { title: 'Historical Release Audit', desc: 'Categorizes releases into In Flight, Released (archived by month), and Rolled Back.' }
    ],
    inbound: [
      { name: 'Projects & Release Points', badge: 'Verification', desc: 'Links to verification checklists and QA sign-offs' }
    ],
    outbound: [
      { name: 'Timeline Milestones', badge: 'Gantt', desc: 'Plots purple diamond milestones on the Gantt chart' },
      { name: 'Release Notes', badge: 'Broadcast', desc: 'Formats release summary emails for stakeholders' }
    ],
    proTip: 'Click "Generate Release Notes" on any release card to generate a clean announcement text formatted for Outlook or Slack.'
  },
  {
    id: 'releasepoints',
    name: 'Release Points',
    icon: `<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>`,
    badge: 'Verification',
    color: '#0d9488',
    summary: 'Checklist-driven release verification cards ensuring everything is tested and approved before shipping.',
    features: [
      { title: 'Interactive Checklists', desc: 'In-place ticking with keyboard accessibility (press Space or Enter to toggle).' },
      { title: 'Jira Ticket Importer', desc: 'Search accessible Jira projects and import tickets directly as release checklist points.' },
      { title: 'Progress Calculation Rings', desc: 'Live SVG progress indicators showing verified points vs total scope.' },
      { title: 'Smart Link Detection', desc: 'Automatically extracts issue keys (e.g. CIMTRACK-482) into direct Jira links.' }
    ],
    inbound: [
      { name: 'Jira Cloud', badge: 'Import', desc: 'Tickets can be imported straight into verification lists' },
      { name: 'Releases', badge: 'Parent', desc: 'Attached to parent release trains' }
    ],
    outbound: [
      { name: 'Release Sign-Off', badge: 'Gate', desc: 'All checklist items must pass before moving to Released stage' }
    ],
    proTip: 'Navigate release checklists using arrow keys and press Space to toggle items without touching your mouse.'
  },
  {
    id: 'jira',
    name: 'Jira Integration',
    icon: `<path d="M12 2L2 12l10 10 10-10L12 2z"/><path d="M12 8l-4 4 4 4 4-4-4-4z"/>`,
    badge: 'Sync & Automation',
    color: '#2563eb',
    summary: 'Direct bi-directional sync with Jira Cloud for ticket triage, status mapping, and automated QA tasks.',
    features: [
      { title: 'Offline-First Ticket Cache', desc: 'Syncs Jira issues into local SQLite, enabling instant searching without API rate limits.' },
      { title: 'Bi-Directional Status Updates', desc: 'Transition issue statuses and post rich ADF verification comments directly from Clair.' },
      { title: 'Smart Status Mapping', desc: 'Maps custom Jira workflow states to Clair\'s unified 10 status categories.' },
      { title: 'Automated Background QA Tasks', desc: 'Background poller runs every 2 hours during work hours to bundle Ready-for-QA tickets into verification tasks.' }
    ],
    inbound: [
      { name: 'Jira Cloud REST API', badge: 'Sync', desc: 'Pulls issues, statuses, and assignees over secure HTTPS' }
    ],
    outbound: [
      { name: 'Tasks & QA Tasks', badge: 'Automation', desc: 'Auto-generates ticket closing tasks with verification checklists' }
    ],
    proTip: 'Run "> Sync Jira Now" from the Command Palette (Ctrl+K) anytime to force an immediate refresh.'
  },
  {
    id: 'developers',
    name: 'Developers & Team',
    icon: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>`,
    badge: 'People',
    color: '#4f46e5',
    summary: 'Team member directory managing developer allocations, project assignments, and workload capacity.',
    features: [
      { title: 'Developer Workload Directory', desc: 'Directory showing active tasks, completed velocity, and assigned projects per person.' },
      { title: 'Smart Assignment Selectors', desc: 'Project-aware dropdowns that prioritize team members assigned to that specific project.' },
      { title: 'Contact & Profile Metadata', desc: 'Track emails, Jira usernames, and roles for seamless ticket attribution.' }
    ],
    inbound: [
      { name: 'Tasks & Projects', badge: 'Assignment', desc: 'Developers are linked to projects and assigned to tasks' }
    ],
    outbound: [
      { name: 'Timeline Swimlanes', badge: 'Workload', desc: 'Powers "By Developer" grouping in the Interactive Timeline' }
    ],
    proTip: 'Map each developer\'s Jira Account ID in their profile to enable 1-click Jira ticket assignment.'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    icon: `<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>`,
    badge: 'Alerts',
    color: '#f59e0b',
    summary: 'Centralized notification hub tracking task deadlines, Jira sync events, backup schedules, and release changes.',
    features: [
      { title: 'Deadline Proximity Alerts', desc: 'Warns about overdue tasks and items due within 24 hours.' },
      { title: 'Jira Sync Notifications', desc: 'Alerts whenever new Ready-for-QA tickets are discovered and imported.' },
      { title: 'Unread Badge Badges', desc: 'Top bell icon highlights unread count with 1-click "Mark all as read".' }
    ],
    inbound: [
      { name: 'Task Due Dates & Jira Sync', badge: 'Triggers', desc: 'Auto-generates alerts based on deadlines and sync results' }
    ],
    outbound: [
      { name: 'Topbar Bell', badge: 'Badge', desc: 'Displays red unread count badge in the application header' }
    ],
    proTip: 'Notifications stay stored in your local database so you can review yesterday\'s sync logs anytime.'
  },
  {
    id: 'settings',
    name: 'Settings & Storage',
    icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>`,
    badge: 'System & Admin',
    color: '#64748b',
    summary: 'Workspace configuration hub: manage Jira credentials, dark/light themes, automatic daily backups, and SQLite database health.',
    features: [
      { title: 'Jira Site Configuration', desc: 'Securely configure host URL, user email, and API token with a live "Test Connection" button.' },
      { title: 'Automated Daily Backups', desc: 'Clair automatically exports a timestamped JSON backup directly to your browser\'s Downloads folder.' },
      { title: 'Visual Theme Customizer', desc: 'Switch between Clean Light and High-Contrast Dark visual modes.' },
      { title: 'SQLite Database Health', desc: 'Inspect database tables, storage usage, and perform clean database exports and imports.' }
    ],
    inbound: [
      { name: 'User Preferences', badge: 'Storage', desc: 'Stores workspace configuration and credentials locally' }
    ],
    outbound: [
      { name: 'App Behavior', badge: 'Governance', desc: 'Governs app-wide theme tokens, backup timers, and Jira connections' }
    ],
    proTip: 'Export a JSON backup before making major changes. Backups can be restored instantly on any Chrome browser with 1 click.'
  }
];

// Open Help Modal
const openHelpModal = (section = 'overview') => {
  helpState.activeSection = section || 'overview';
  helpState.searchQuery = '';
  let el = document.getElementById('helpModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'helpModal';
    el.className = 'help-overlay';
    document.body.appendChild(el);
  }
  renderHelpStudio(el);
  el.classList.add('show', 'active');
  document.body.style.overflow = 'hidden';
};

const closeHelpModal = () => {
  const el = document.getElementById('helpModal');
  if (el) {
    el.classList.remove('show', 'active');
    document.body.style.overflow = '';
  }
};

// Main 2-Column Studio Renderer
const renderHelpStudio = (el) => {
  el.innerHTML = `
    <div class="help-dialog" role="dialog" aria-modal="true" aria-label="Clair Knowledge Studio">
      <!-- Header -->
      <div class="help-header">
        <div class="help-header-main">
          <div class="help-logo-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <div class="help-title-wrap">
            <h2 class="help-title">Clair — User Guide &amp; Architecture Reference</h2>
            <span class="help-tagline">100% Local-First · SQLite WASM · Complete Documentation</span>
          </div>
        </div>
        <button type="button" class="help-close-btn" id="helpCloseBtn" title="Close guide (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span>Esc</span>
        </button>
      </div>

      <!-- 2-Column Main Body -->
      <div class="help-main-body">
        <!-- Left Sidebar -->
        <div class="help-sidebar">
          <div class="help-search-container">
            <div class="help-search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" id="helpNavSearch" placeholder="Search topics, modules…" value="${escapeHtml(helpState.searchQuery)}" autocomplete="off" />
              ${helpState.searchQuery ? `<button type="button" class="help-search-clear" id="helpNavClear">✕</button>` : ''}
            </div>
          </div>
          <div class="help-nav-scroll" id="helpNavList">
            ${renderHelpNavItems()}
          </div>
        </div>

        <!-- Right Content Canvas -->
        <div class="help-content-canvas" id="helpCanvas">
          ${renderHelpCanvasContent()}
        </div>
      </div>

      <!-- Footer Bar -->
      <div class="help-footer">
        <div>
          <strong>Clair v4.4.0</strong> · WebAssembly SQLite · IndexedDB Durability · Zero External Trackers
        </div>
        <div>
          Press <kbd>Ctrl+K</kbd> anywhere to launch Command Actions
        </div>
      </div>
    </div>
  `;

  // Attach interactive listeners
  el.querySelector('#helpCloseBtn').onclick = closeHelpModal;
  el.onclick = (e) => { if (e.target === el) closeHelpModal(); };

  // Search input
  const searchInput = el.querySelector('#helpNavSearch');
  if (searchInput) {
    searchInput.oninput = (e) => {
      helpState.searchQuery = e.target.value.toLowerCase().trim();
      const navList = el.querySelector('#helpNavList');
      if (navList) navList.innerHTML = renderHelpNavItems();
      attachNavClickListeners(el);
    };
  }

  const clearBtn = el.querySelector('#helpNavClear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      helpState.searchQuery = '';
      const sInput = el.querySelector('#helpNavSearch');
      if (sInput) sInput.value = '';
      const navList = el.querySelector('#helpNavList');
      if (navList) navList.innerHTML = renderHelpNavItems();
      attachNavClickListeners(el);
    };
  }

  attachNavClickListeners(el);
  attachContentActionListeners(el);
};

// Render Left Navigation Items
const renderHelpNavItems = () => {
  const q = helpState.searchQuery;

  // Filter Getting Started
  const startTopics = [
    { id: 'overview', name: 'Overview & Architecture', icon: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`, badge: 'Core' },
    { id: 'relations', name: 'Relational Flow Map', icon: `<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/><circle cx="18" cy="6" r="3"/><line x1="15.5" y1="8.5" x2="8.5" y2="15.5"/>`, badge: 'Data' }
  ].filter(t => !q || t.name.toLowerCase().includes(q) || 'architecture local-first privacy sqlite'.includes(q));

  // Filter Modules
  const filteredModules = HELP_MODULES.filter(m => {
    if (!q) return true;
    return m.name.toLowerCase().includes(q) ||
      m.summary.toLowerCase().includes(q) ||
      m.badge.toLowerCase().includes(q) ||
      m.features.some(f => f.title.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q));
  });

  // Filter Power Tools
  const toolTopics = [
    { id: 'commands', name: 'Command Palette (Ctrl+K)', icon: `<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>`, badge: 'Quick' },
    { id: 'shortcuts', name: 'Keyboard Shortcuts', icon: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/>`, badge: 'Keys' }
  ].filter(t => !q || t.name.toLowerCase().includes(q) || 'commands hotkeys shortcuts ctrl+k'.includes(q));

  let html = '';

  if (startTopics.length) {
    html += `<div class="help-nav-group-title">Getting Started</div>`;
    startTopics.forEach(t => {
      const active = helpState.activeSection === t.id;
      html += `
        <button type="button" class="help-nav-item ${active ? 'active' : ''}" data-navtarget="${t.id}">
          <span class="help-nav-icon">${t.icon}</span>
          <span class="help-nav-label">${escapeHtml(t.name)}</span>
          <span class="help-nav-badge">${t.badge}</span>
        </button>
      `;
    });
  }

  if (filteredModules.length) {
    html += `<div class="help-nav-group-title">All Modules (${filteredModules.length})</div>`;
    filteredModules.forEach(m => {
      const active = helpState.activeSection === m.id;
      html += `
        <button type="button" class="help-nav-item ${active ? 'active' : ''}" data-navtarget="${m.id}">
          <span class="help-nav-icon" style="color:${m.color}">${m.icon}</span>
          <span class="help-nav-label">${escapeHtml(m.name)}</span>
          <span class="help-nav-badge" style="color:${m.color}">${escapeHtml(m.badge)}</span>
        </button>
      `;
    });
  }

  if (toolTopics.length) {
    html += `<div class="help-nav-group-title">Power Tools</div>`;
    toolTopics.forEach(t => {
      const active = helpState.activeSection === t.id;
      html += `
        <button type="button" class="help-nav-item ${active ? 'active' : ''}" data-navtarget="${t.id}">
          <span class="help-nav-icon">${t.icon}</span>
          <span class="help-nav-label">${escapeHtml(t.name)}</span>
          <span class="help-nav-badge">${t.badge}</span>
        </button>
      `;
    });
  }

  if (!html) {
    html = `<div style="padding:20px 12px;text-align:center;color:var(--text-muted);font-size:12px;">No topics found for “${escapeHtml(q)}”.</div>`;
  }

  return html;
};

// Render Right Canvas Content
const renderHelpCanvasContent = () => {
  const active = helpState.activeSection;

  // 1. Overview & Architecture
  if (active === 'overview') {
    return `
      <div class="help-doc-hero">
        <div class="help-dh-meta">
          <div class="help-dh-icon" style="background:var(--accent-subtle); color:var(--accent);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="help-dh-title-wrap">
            <h2>Architecture &amp; Core Philosophy <span class="help-dh-tag" style="background:#dcfce7; color:#15803d;">Local-First</span></h2>
            <p class="help-dh-summary">Clair is a local-first engineering command center running entirely in your browser with zero cloud servers, zero database subscriptions, and 100% privacy.</p>
          </div>
        </div>
      </div>

      <div class="help-section-title">The Four Architectural Pillars</div>
      <div class="help-feature-grid">
        <div class="help-feat-card">
          <div class="help-fc-header"><span class="help-fc-dot" style="background:#059669;"></span>1. WebAssembly SQLite Engine</div>
          <p class="help-fc-body">A true ACID-compliant relational SQL engine running directly in WebAssembly inside your browser tab. All tables, foreign keys, and indexes execute locally with near-zero latency.</p>
        </div>
        <div class="help-feat-card">
          <div class="help-fc-header"><span class="help-fc-dot" style="background:#0284c7;"></span>2. Durable IndexedDB Persistence</div>
          <p class="help-fc-body">Your entire SQLite database file is mirrored durably into browser IndexedDB storage after every commit. Closing the tab, restarting Chrome, or rebooting your computer never loses data.</p>
        </div>
        <div class="help-feat-card">
          <div class="help-fc-header"><span class="help-fc-dot" style="background:#7c3aed;"></span>3. Bi-Directional Jira Cloud Sync</div>
          <p class="help-fc-body">Connects directly to Atlassian Jira Cloud using your API token. Pulls issues, caches them for offline speed, transitions statuses, and posts rich verification comments without intermediate proxy servers.</p>
        </div>
        <div class="help-feat-card">
          <div class="help-fc-header"><span class="help-fc-dot" style="background:#ea580c;"></span>4. Automated Daily Backups &amp; Excel Reports</div>
          <p class="help-fc-body">Clair automatically generates background daily JSON backup exports directly to your Downloads folder. You can also export comprehensive executive Excel workbooks with KPIs and charts anytime.</p>
        </div>
      </div>

      <div class="help-section-title">Technical Specifications</div>
      <div class="help-matrix-table-wrap">
        <table class="help-matrix-table">
          <thead>
            <tr><th>Component</th><th>Technology</th><th>Implementation Detail</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Database Engine</strong></td><td>SQLite 3 (WASM)</td><td>In-memory virtual filesystem with transactional WAL journaling</td></tr>
            <tr><td><strong>Persistence Layer</strong></td><td>IndexedDB API</td><td>Binary ArrayBuffer chunking with auto-commit debouncing</td></tr>
            <tr><td><strong>Network Privacy</strong></td><td>Zero External Trackers</td><td>No telemetry, no external analytic scripts, no account logins required</td></tr>
            <tr><td><strong>Backup Format</strong></td><td>JSON &amp; Excel (.xlsx)</td><td>Portable single-file JSON backup archives &amp; formatted Excel reports</td></tr>
            <tr><td><strong>Execution Platform</strong></td><td>Chrome Extension V3</td><td>Fast vanilla JS architecture with zero heavy build steps</td></tr>
          </tbody>
        </table>
      </div>

      <div class="help-protip-box" style="margin-top:20px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <div>
          <strong>Total Privacy Guarantee:</strong> Because Clair has no remote server, your team's project secrets, passwords, and Jira credentials never leave your personal computer.
        </div>
      </div>
    `;
  }

  // 2. Relational Flow Map
  if (active === 'relations') {
    return `
      <div class="help-doc-hero">
        <div class="help-dh-meta">
          <div class="help-dh-icon" style="background:#e0f2fe; color:#0284c7;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/><circle cx="18" cy="6" r="3"/><line x1="15.5" y1="8.5" x2="8.5" y2="15.5"/></svg>
          </div>
          <div class="help-dh-title-wrap">
            <h2>Relational Architecture &amp; Data Flow <span class="help-dh-tag" style="background:#e0f2fe; color:#0284c7;">System Map</span></h2>
            <p class="help-dh-summary">Understand how Projects and Developers anchor your tasks, test suites, releases, and documentation in Clair.</p>
          </div>
        </div>
      </div>

      <!-- Visual Hub & Spokes Diagram -->
      <div class="help-diagram-canvas">
        <div class="help-hub-row">
          <div class="help-hub-node">
            <strong>PROJECT</strong>
            <span>Web or Mobile App</span>
          </div>
          <div class="help-hub-node" style="background:#4f46e5;">
            <strong>DEVELOPER</strong>
            <span>Team Allocation</span>
          </div>
        </div>

        <div class="help-spokes-grid">
          <div class="help-spoke-card" data-navtarget="tasks">
            <div class="help-sc-top">
              <span class="help-sc-name">Tasks</span>
              <span class="help-sc-cardinality">1 to Many</span>
            </div>
            <p class="help-sc-desc">Daily execution board. Tagged to Projects &amp; Developers. Feeds Gantt bars &amp; velocity charts.</p>
          </div>
          <div class="help-spoke-card" data-navtarget="jira">
            <div class="help-sc-top">
              <span class="help-sc-name">Jira Sync</span>
              <span class="help-sc-cardinality">2-Way Sync</span>
            </div>
            <p class="help-sc-desc">Pulls Ready-for-QA tickets, generates automated testing tasks, and pushes verification back.</p>
          </div>
          <div class="help-spoke-card" data-navtarget="timeline">
            <div class="help-sc-top">
              <span class="help-sc-name">Timeline / Gantt</span>
              <span class="help-sc-cardinality">Planning</span>
            </div>
            <p class="help-sc-desc">Plots project durations, task overlaps, release milestone diamonds, and developer bandwidth.</p>
          </div>
          <div class="help-spoke-card" data-navtarget="releases">
            <div class="help-sc-top">
              <span class="help-sc-name">Releases</span>
              <span class="help-sc-cardinality">1 to Many</span>
            </div>
            <p class="help-sc-desc">7-stage deployment pipeline bundling version milestones and release notes.</p>
          </div>
          <div class="help-spoke-card" data-navtarget="releasepoints">
            <div class="help-sc-top">
              <span class="help-sc-name">Release Points</span>
              <span class="help-sc-cardinality">Checklists</span>
            </div>
            <p class="help-sc-desc">Verification checklist cards linked to Jira issues. Must pass before shipping.</p>
          </div>
          <div class="help-spoke-card" data-navtarget="testcases">
            <div class="help-sc-top">
              <span class="help-sc-name">Test Cases</span>
              <span class="help-sc-cardinality">QA Suites</span>
            </div>
            <p class="help-sc-desc">Functional test scenarios grouped by module. Tracks pass/fail rates and defect IDs.</p>
          </div>
        </div>
      </div>

      <div class="help-section-title">Relational Connections Table</div>
      <div class="help-matrix-table-wrap">
        <table class="help-matrix-table">
          <thead>
            <tr><th>Module A</th><th>Cardinality</th><th>Module B</th><th>Operational Behavior</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Projects</strong></td><td>1 to Many</td><td><strong>Tasks</strong></td><td>Every task belongs to one or more project IDs. In Project Details, all task progress and velocity aggregate automatically.</td></tr>
            <tr><td><strong>Developers</strong></td><td>Many to Many</td><td><strong>Projects &amp; Tasks</strong></td><td>Engineers assigned to a project appear in contextual assignment dropdowns. In Timeline, you can group by Developer to inspect team workloads.</td></tr>
            <tr><td><strong>Releases</strong></td><td>1 to Many</td><td><strong>Release Points</strong></td><td>A Release represents a target version train (e.g. v1.4.0). Release Points are the checklists (staging smoke tests, store submissions) that must pass before shipping.</td></tr>
            <tr><td><strong>Jira Cloud</strong></td><td>Bi-Directional</td><td><strong>Tasks &amp; QA</strong></td><td>Ready-for-QA tickets generate "Ticket closing" tasks in Clair with interactive verification checklists that transition status and comment back in Jira.</td></tr>
            <tr><td><strong>Test Cases</strong></td><td>Belongs to</td><td><strong>Project &amp; Module</strong></td><td>Scenarios belong to functional modules inside a project. Failing scenarios record Defect IDs which cross-link with Project Insights or Jira.</td></tr>
            <tr><td><strong>Notes</strong></td><td>Hierarchy</td><td><strong>Project Folders</strong></td><td>Notes are organized strictly inside project-scoped 1-level folders for architectural documentation and meeting minutes.</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // 3. Command Palette Quick Actions
  if (active === 'commands') {
    return `
      <div class="help-doc-hero">
        <div class="help-dh-meta">
          <div class="help-dh-icon" style="background:#fef3c7; color:#d97706;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </div>
          <div class="help-dh-title-wrap">
            <h2>Command Palette Quick Actions <span class="help-dh-tag" style="background:#fef3c7; color:#d97706;">Ctrl+K</span></h2>
            <p class="help-dh-summary">Press <kbd>Ctrl+K</kbd> (or <kbd>⌘K</kbd> on Mac) anywhere in Clair to launch the Command Palette. Type <code>&gt;</code> to trigger instant actions.</p>
          </div>
        </div>
      </div>

      <div class="help-section-title">Supported Command Actions</div>
      <div class="help-cmd-list">
        <div class="help-cmd-row">
          <div class="help-cmd-code-wrap">
            <span class="help-cmd-code">&gt; New Task: [title] @[dev] #[project]</span>
            <button type="button" class="help-cmd-copy-btn" data-copy="> New Task: Fix login bug @Rutvik #CIMTrack">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
            </button>
          </div>
          <span class="help-cmd-desc">Opens the New Task modal with title, assignee, and project pre-filled from your command!</span>
        </div>

        <div class="help-cmd-row">
          <div class="help-cmd-code-wrap">
            <span class="help-cmd-code">&gt; Sync Jira Now</span>
            <button type="button" class="help-cmd-copy-btn" data-copy="> Sync Jira Now">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
            </button>
          </div>
          <span class="help-cmd-desc">Forces an immediate sync with all linked Jira projects, pulling new Ready-for-QA tickets.</span>
        </div>

        <div class="help-cmd-row">
          <div class="help-cmd-code-wrap">
            <span class="help-cmd-code">&gt; Toggle Dark/Light Mode</span>
            <button type="button" class="help-cmd-copy-btn" data-copy="> Toggle Dark/Light Mode">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
            </button>
          </div>
          <span class="help-cmd-desc">Instantly toggles visual appearance between Clean Light and High-Contrast Dark modes.</span>
        </div>

        <div class="help-cmd-row">
          <div class="help-cmd-code-wrap">
            <span class="help-cmd-code">&gt; Export Backup</span>
            <button type="button" class="help-cmd-copy-btn" data-copy="> Export Backup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
            </button>
          </div>
          <span class="help-cmd-desc">Triggers an immediate JSON file download containing every collection and setting in Clair.</span>
        </div>

        <div class="help-cmd-row">
          <div class="help-cmd-code-wrap">
            <span class="help-cmd-code">&gt; Go to [Project Name]</span>
            <button type="button" class="help-cmd-copy-btn" data-copy="> Go to Tender 360">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
            </button>
          </div>
          <span class="help-cmd-desc">Instantly navigates straight to any project's dedicated Project Details page.</span>
        </div>

        <div class="help-cmd-row">
          <div class="help-cmd-code-wrap">
            <span class="help-cmd-code">&gt; Help</span>
            <button type="button" class="help-cmd-copy-btn" data-copy="> Help">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
            </button>
          </div>
          <span class="help-cmd-desc">Opens this interactive User Guide and System Architecture reference.</span>
        </div>
      </div>
    `;
  }

  // 4. Keyboard Shortcuts
  if (active === 'shortcuts') {
    return `
      <div class="help-doc-hero">
        <div class="help-dh-meta">
          <div class="help-dh-icon" style="background:#ede9fe; color:#7c3aed;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/></svg>
          </div>
          <div class="help-dh-title-wrap">
            <h2>Universal Keyboard Shortcuts <span class="help-dh-tag" style="background:#ede9fe; color:#7c3aed;">Productivity</span></h2>
            <p class="help-dh-summary">Master Clair without taking your hands off the keyboard using these global hotkeys.</p>
          </div>
        </div>
      </div>

      <div class="help-section-title">Everyday Navigation &amp; Editing</div>
      <div class="help-hotkeys-grid">
        <div class="help-hk-item">
          <span class="help-hk-label">Open Command Palette / Global Search</span>
          <div class="help-hk-keys"><kbd>Ctrl</kbd><kbd>K</kbd></div>
        </div>
        <div class="help-hk-item">
          <span class="help-hk-label">Save &amp; Commit Active Modal Form</span>
          <div class="help-hk-keys"><kbd>Ctrl</kbd><kbd>Enter</kbd></div>
        </div>
        <div class="help-hk-item">
          <span class="help-hk-label">Close Active Modal or Palette</span>
          <div class="help-hk-keys"><kbd>Esc</kbd></div>
        </div>
        <div class="help-hk-item">
          <span class="help-hk-label">Toggle Release Point Checklist Item</span>
          <div class="help-hk-keys"><kbd>Space</kbd> / <kbd>Enter</kbd></div>
        </div>
        <div class="help-hk-item">
          <span class="help-hk-label">Navigate Search Results</span>
          <div class="help-hk-keys"><kbd>↑</kbd><kbd>↓</kbd></div>
        </div>
        <div class="help-hk-item">
          <span class="help-hk-label">Execute Selected Command</span>
          <div class="help-hk-keys"><kbd>Enter</kbd></div>
        </div>
      </div>

      <div class="help-protip-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <strong>Power User Workflow:</strong> Press <kbd>Ctrl+K</kbd>, type <code>&gt; New Task: Fix API bug @Rutvik #CIMTrack</code>, and press <kbd>Enter</kbd>. The task modal opens instantly with everything pre-selected!
        </div>
      </div>
    `;
  }

  // 5. Individual Module Deep-Dive
  const mod = HELP_MODULES.find(m => m.id === active);
  if (mod) {
    return `
      <div class="help-doc-hero">
        <div class="help-dh-meta">
          <div class="help-dh-icon" style="background:${mod.color}18; color:${mod.color};">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${mod.icon}</svg>
          </div>
          <div class="help-dh-title-wrap">
            <h2>${escapeHtml(mod.name)} <span class="help-dh-tag" style="background:${mod.color}18; color:${mod.color};">${escapeHtml(mod.badge)}</span></h2>
            <p class="help-dh-summary">${escapeHtml(mod.summary)}</p>
          </div>
        </div>
        <button type="button" class="help-dh-jump-btn" data-jumpview="${mod.id}">
          <span>Open ${escapeHtml(mod.name)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
        </button>
      </div>

      <div class="help-section-title">Core Capabilities &amp; Features</div>
      <div class="help-feature-grid">
        ${mod.features.map(f => `
          <div class="help-feat-card">
            <div class="help-fc-header">
              <span class="help-fc-dot" style="background:${mod.color};"></span>
              ${escapeHtml(f.title)}
            </div>
            <p class="help-fc-body">${escapeHtml(f.desc)}</p>
          </div>
        `).join('')}
      </div>

      <div class="help-section-title">Module Connections &amp; Data Flow</div>
      <div class="help-relations-grid">
        ${(mod.inbound || []).map(r => `
          <div class="help-rel-card">
            <div class="help-rc-head">
              <span>Inbound Connection</span>
              <span class="help-rc-badge">${escapeHtml(r.badge)}</span>
            </div>
            <span class="help-rc-target">← ${escapeHtml(r.name)}</span>
            <p class="help-rc-desc">${escapeHtml(r.desc)}</p>
          </div>
        `).join('')}
        ${(mod.outbound || []).map(r => `
          <div class="help-rel-card">
            <div class="help-rc-head">
              <span>Outbound Connection</span>
              <span class="help-rc-badge">${escapeHtml(r.badge)}</span>
            </div>
            <span class="help-rc-target">→ ${escapeHtml(r.name)}</span>
            <p class="help-rc-desc">${escapeHtml(r.desc)}</p>
          </div>
        `).join('')}
      </div>

      ${mod.proTip ? `
        <div class="help-protip-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <div>
            <strong>Pro Tip:</strong> ${escapeHtml(mod.proTip)}
          </div>
        </div>
      ` : ''}
    `;
  }

  return `<div style="padding:40px;text-align:center;color:var(--text-muted);">Please select a topic from the left sidebar.</div>`;
};

// Attach Listeners to Navigation Items
const attachNavClickListeners = (el) => {
  el.querySelectorAll('[data-navtarget]').forEach(btn => {
    btn.onclick = () => {
      helpState.activeSection = btn.dataset.navtarget;
      // Re-render nav to update active indicator
      const navList = el.querySelector('#helpNavList');
      if (navList) navList.innerHTML = renderHelpNavItems();
      attachNavClickListeners(el);

      // Re-render canvas
      const canvas = el.querySelector('#helpCanvas');
      if (canvas) {
        canvas.innerHTML = renderHelpCanvasContent();
        canvas.scrollTop = 0;
        attachContentActionListeners(el);
      }
    };
  });
};

// Attach Listeners to Content Canvas Actions
const attachContentActionListeners = (el) => {
  // Jump to view button
  el.querySelectorAll('[data-jumpview]').forEach(btn => {
    btn.onclick = () => {
      const view = btn.dataset.jumpview;
      closeHelpModal();
      if (typeof setView === 'function') setView(view);
    };
  });

  // Copy command buttons
  el.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        btn.style.color = '#059669';
        btn.style.borderColor = '#059669';
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 1800);
      } catch (err) {
        console.warn('Clipboard write failed:', err);
      }
    };
  });
};

// Global escape listener for help modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const el = document.getElementById('helpModal');
    if (el && (el.classList.contains('active') || el.classList.contains('show'))) {
      e.preventDefault();
      closeHelpModal();
    }
  }
});
