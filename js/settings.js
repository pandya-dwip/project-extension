// Clair — js/settings.js: Settings, modules, developers page, Jira settings.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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

  const openByDev = {};
  (state.tasks || []).forEach(t => { if (t.status !== 'Done') (t.developerIds || []).forEach(id => { openByDev[id] = (openByDev[id] || 0) + 1; }); });
  const coveredProjects = new Set((state.developers || []).flatMap(d => d.projectIds || [])).size;
  const openAssigned = Object.values(openByDev).reduce((x, y) => x + y, 0);
  const devHero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
    title: 'Developers',
    subtitle: 'Your team and the projects each developer works on.',
    stats: [
      { label: 'Developers', value: totalDevs },
      { label: 'On projects', value: linkedDevs, color: '#4ade80' },
      { label: 'Not assigned', value: unassignedDevs, color: unassignedDevs ? '#fbbf24' : undefined },
      { label: 'Open tasks', value: openAssigned }
    ],
    progressBar: (state.projects || []).length ? { pct: Math.round(coveredProjects / state.projects.length * 100), label: `${coveredProjects}/${state.projects.length} projects staffed` } : null
  });
  return `
    ${devHero}
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
      jiraKey: issue.key, jiraIssueId: issue.id, jiraAssignee: issue.assignee || '',
      jiraStatus: issue.status || '', jiraStatusCategory: issue.statusCategory || ''
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
  { key: 'qa', label: 'QA workflow', desc: 'Comment templates', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
  { key: 'notifications', label: 'Notifications', desc: 'Sound & alerts', icon: '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>' },
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
    { key: 'timeline', label: 'Timeline & Gantt', desc: 'Interactive horizontal schedule & milestones', icon: `<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="13" y2="8" stroke-width="2.2"/><line x1="10" y1="12" x2="18" y2="12" stroke-width="2.2"/><line x1="6" y1="16" x2="14" y2="16" stroke-width="2.2"/>` },
    { key: 'notes', label: 'Notes', desc: 'Markdown note workspace', icon: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>` },
    { key: 'calendar', label: 'Calendar', desc: 'Deadline & release calendar', icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>` },
    { key: 'tests', label: 'Project Insights', desc: 'Analytics & test execution stats', icon: `<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>` },
    { key: 'testcases', label: 'Test Case Management', desc: 'Test scenarios & execution', icon: `<path d="M9 3v7.2a4 4 0 01-1.3 2.9l-3.4 3.1A2 2 0 005.7 20h12.6a2 2 0 001.4-3.8l-3.4-3.1A4 4 0 0115 10.2V3"/>` },
    { key: 'releases', label: 'Release Management', desc: 'Release versions & changelogs', icon: `<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/>` },
    { key: 'releasepoints', label: 'Release Points', desc: 'Detailed release checklist items', icon: `<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>` },
    { key: 'notifications', label: 'Notifications', desc: 'Jira changes & QA task alerts', icon: `<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>` },
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
    const views = [['dashboard', 'Dashboard'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['notes', 'Notes'], ['calendar', 'Calendar'], ['tests', 'Project Insights'], ['testcases', 'Test Case Management'], ['releases', 'Release Management'], ['releasepoints', 'Release Points'], ['jira', 'Jira'], ['notifications', 'Notifications'], ['developers', 'Developer Management'], ['activity', 'Activity']];
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
  } else if (section === 'qa') {
    body = renderQaSettings();
  } else if (section === 'notifications') {
    body = renderNotifySettings();
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
  state.jiraQa = [];
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
