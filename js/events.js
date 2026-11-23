// Clair — js/events.js: Event delegation for page actions, filters.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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
  // Jira ticket rows are clickable; Enter/Space toggle them too.
  content.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.jd-row, .nt-item, .rl-row')) { e.preventDefault(); e.target.click(); }
  });
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

      if (action === 'env-copy' || action === 'env-reveal') {
        const proj = state.projects.find(x => x.id === btn.dataset.id);
        if (proj) {
          const key = btn.dataset.env + btn.dataset.field;
          if (action === 'env-copy') {
            navigator.clipboard.writeText(proj[key] || '').then(() => showToast(btn.dataset.field === 'Password' ? 'Password copied' : 'Username copied'), () => showToast('Could not copy', 'error'));
          } else {
            const set = state.envRevealed || (state.envRevealed = new Set());
            const k = proj.id + ':' + btn.dataset.env;
            if (set.has(k)) set.delete(k); else set.add(k);
            render();
          }
        }
      }
      else if (action === 'new-project') openProjectModal();
      else if (action === 'new-task') openTaskModal();
      else if (action === 'new-insight') openTestModal();
      else if (action === 'new-release') openReleaseModal();
      else if (action === 'new-release-pt') openReleasePtModal();
      else if (action === 'go-calendar') setView('calendar');
      else if (action === 'go-tasks') setView('tasks');
      else if (action === 'go-timeline') setView('timeline');
      else if (action === 'open-help') { if (typeof openHelpModal === 'function') openHelpModal(); }
      else if (action === 'open-release-pt') openReleasePointOnPage(cardId);
      else if (action === 'rpa-toggle') toggleRpAccordion(cardId);
      else if (action === 'jira-view') { state.jiraProjectId = cardId; state.jiraMappingOpen = false; state.jiraIssueOpen = null; jiraResetFilters(); render(); document.getElementById('mainContent').scrollTop = 0; }
      else if (action === 'jira-home') { state.jiraProjectId = null; state.jiraMappingOpen = false; render(); }
      else if (action === 'jira-refresh') syncJiraProject(cardId);
      else if (action === 'jira-sync-now') runJiraQaSync('manual');
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
        if (e.target.closest('a, select, textarea, input')) return;
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
      else if (action === 'open-qa-report') { state.qaReportWeek = 0; setView('qareport'); }
      else if (action === 'qa-report-week') { const d = +btn.dataset.dir; state.qaReportWeek = d === 0 ? 0 : Math.min(0, (state.qaReportWeek || 0) + d); render(); }
      else if (action === 'qa-report-copy') navigator.clipboard.writeText(qaReportText(qaReportData(state.qaReportWeek || 0))).then(() => showToast('Report copied — paste it into an email'), () => showToast('Could not copy', 'error'));
      else if (action === 'qa-report-csv') qaReportDownload();
      else if (action === 'qa-tpl-add') { state.qaTemplates = [...(state.qaTemplates || []), { id: uid(), name: btn.dataset.kind === 'verified' ? 'New verified template' : 'New reopen template', kind: btn.dataset.kind, text: '' }]; qaSaveTemplates(); render(); }
      else if (action === 'qa-tpl-delete') { state.qaTemplates = (state.qaTemplates || []).filter((_, i) => i !== +btn.dataset.i); qaSaveTemplates(); render(); }
      else if (action === 'qa-tpl-reset') { state.qaTemplates = QA_DEFAULT_TEMPLATES.map(t => ({ ...t })); qaSaveTemplates(); render(); showToast('Default templates restored'); }
      else if (action === 'notif-filter') { state.notifyFilter = btn.dataset.filter; render(); }
      else if (action === 'notif-check-now') runNotifyCheck();
      else if (action === 'notif-mark-all') notifyUpdate(list => list.map(n => ({ ...n, read: true })));
      else if (action === 'notif-clear-read') notifyUpdate(list => list.filter(n => !n.read));
      else if (action === 'notif-settings') { state.settingsSection = 'notifications'; setView('settings'); }
      else if (action === 'notify-test-sound') clairChime();
      else if (action === 'notif-toggle-read') { const id = btn.dataset.nid; notifyUpdate(list => list.map(n => n.id === id ? { ...n, read: !n.read } : n)); }
      else if (action === 'notif-open') {
        const n = (state.notifications || []).find(x => x.id === btn.dataset.nid);
        if (n) {
          if (!n.read) notifyUpdate(list => list.map(x => x.id === n.id ? { ...x, read: true } : x));
          if (n.url) window.open(n.url, '_blank', 'noopener');
          else if (n.taskId && state.tasks.some(t => t.id === n.taskId)) openDetailModal('task', n.taskId);
        }
      }
      else if (action === 'release-status') { state.releaseFilters.status = state.releaseFilters.status === btn.dataset.status ? '' : btn.dataset.status; render(); }
      else if (action === 'activity-filter') { state.activityFilter = btn.dataset.filter; render(); }
      else if (action === 'calendar-today') {
        const d = new Date();
        state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
        state.selectedCalendarDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
        state.releaseFilters = { status: '' }; state.releaseSearch = '';
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
    const tplField = e.target.closest('[data-qa-tpl]');
    if (tplField) {
      const t = (state.qaTemplates || [])[+tplField.dataset.i];
      if (t) { t[tplField.dataset.qaTpl] = tplField.value; qaSaveTemplates(); }
      return;
    }
    const nset = e.target.closest('[data-notify-setting]');
    if (nset) {
      const next = { ...(state.notifySettings || NOTIFY_DEFAULTS), [nset.dataset.notifySetting]: nset.checked };
      state.notifySettings = next;
      if (hasChromeStorage()) chrome.storage.local.set({ [NOTIFY_SETTINGS_KEY]: next });
      if (nset.dataset.notifySetting === 'sound' && nset.checked) clairChime();
      return;
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
    const actSearch = e.target.closest('#activitySearchInput');
    if (actSearch) {
      clearTimeout(pageSearchTimer);
      pageSearchTimer = setTimeout(() => { state.activitySearch = actSearch.value; rerenderPreservingFocus(actSearch); }, 180);
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
