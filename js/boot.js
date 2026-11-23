// Clair — js/boot.js: Startup (init) and global listeners.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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
  state.jiraQa = data.jiraQa || [];
  const qaFixed = jiraQaUpgradeDescriptions(state) + jiraQaReroute(state); // older auto QA tasks: current wording, right project
  if (qaFixed) await storage.save();
  syncWatchProjects();
  qaLoadTemplates();
  notifyLoad().then(() => { if (location.hash === '#notifications') { history.replaceState(null, '', location.pathname); setView('notifications'); } });
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
    el.addEventListener('click', () => {
      if (el.dataset.view) {
        setView(el.dataset.view);
      } else if (el.dataset.action === 'open-help') {
        if (typeof openHelpModal === 'function') openHelpModal('overview');
      }
    });
  });

  // Modals
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

  // Help Triggers (Topbar + Sidebar + Footer)
  const handleOpenHelp = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (typeof openHelpModal === 'function') openHelpModal('overview');
  };
  document.getElementById('topbarHelpBtn')?.addEventListener('click', handleOpenHelp);
  document.getElementById('sidebarHelpNavBtn')?.addEventListener('click', handleOpenHelp);
  document.getElementById('sidebarHelpPill')?.addEventListener('click', handleOpenHelp);

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
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      paletteOpen();
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

        await ClairDB.reload(); // read what the other context saved, not this tab's own copy
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
        state.jiraQa = data.jiraQa || [];

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
  document.documentElement.dataset.ready = '1'; // start-up finished (used by tests and devtools)
};

document.addEventListener('DOMContentLoaded', init);
