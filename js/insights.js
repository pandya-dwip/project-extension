// Clair — js/insights.js: Project Insights and the insight form.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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

    <div class="filters-bar tk-toolbar std-toolbar">
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
      <button type="button" class="btn-primary st-btn tb-new" data-action="new-insight"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Insight</button>
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
