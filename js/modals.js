// Clair — js/modals.js: Developer, project and task forms; detail modal; search helpers.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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
    setProjectEnvFields(p);
    document.getElementById('projectDueDate').value = p.dueDate || '';
    document.getElementById('projectPriority').value = p.priority || '';
    document.getElementById('projectOverallStatus').value = p.overallProjectStatus || 'YET_TO_START';

    selectedStatuses = [...(p.statuses || [])];
    projectJiraSelection = p.jira ? { ...p.jira } : null;
  } else {
    projectJiraSelection = null;
    title.textContent = 'New Project';
    setProjectEnvFields({});
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
  const envData = readProjectEnvFields();

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
      ...envData,
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
      ...envData,
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
    // Developers of the selected projects — plus anyone already on the task, so editing
    // never silently drops an assigned developer who isn't linked to that project.
    devs = state.developers.filter(d =>
      selectedDevIds.includes(d.id) || (d.projectIds || []).some(pid => checkedProjects.includes(pid))
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
  const detailEl = document.getElementById('detailModal');
  if (detailEl) detailEl.classList.toggle('modal-qa', type === 'task' && !!(state.tasks.find(t => t.id === id) || {}).autoQa);
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

        ${task.autoQa ? `<div class="detail-desc-section" id="qaChecklist" data-task="${task.id}">${renderQaChecklist(task)}</div>` : ''}

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
    if (task.autoQa && task.status !== 'Done' && !(qaComposer && qaComposer.busy)) qaRefreshFromJira(task.id);
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
