// Clair — js/tasks.js: Tasks board and Calendar.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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

  const ringR = 26, ringC = 2 * Math.PI * ringR;
  const filtersActive = !!(q || state.filters.dateFrom || state.filters.dateTo || state.filters.taskProject || state.filters.taskPriority || state.filters.taskDeadline);
  const hero = `
    <section class="rpa-hero">
      <div class="rpa-hero-main">
        <span class="rpa-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg></span>
        <div>
          <h2 class="rpa-hero-title">Tasks</h2>
          <p class="rpa-hero-sub">Plan, track and move work across all projects. Drag cards between columns.</p>
        </div>
      </div>
      <div class="rpa-hero-stats">
        <div class="rpa-hstat"><strong>${totalTasks}</strong><span>Total</span></div>
        <div class="rpa-hstat"><strong>${todoCount}</strong><span>To-Do</span></div>
        <div class="rpa-hstat"><strong class="warn">${inProgressCount}</strong><span>In progress</span></div>
        <div class="rpa-hstat"><strong class="${overdue ? 'bad' : ''}">${overdue}</strong><span>Overdue</span></div>
        <div class="rpa-hstat"><strong class="ok">${doneCount}</strong><span>Done</span></div>
        <div class="rpa-hero-ring" title="${doneCount} of ${totalTasks} tasks done">
          <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${ringR}"/><circle class="fill" cx="32" cy="32" r="${ringR}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${(ringC * (1 - donePct / 100)).toFixed(2)}"/></svg>
          <span><strong>${donePct}%</strong><em>${doneCount}/${totalTasks} done</em></span>
        </div>
      </div>
    </section>`;

  return `
    <div class="rpa-page tk-page">
    ${hero}

    <div class="filters-bar tk-toolbar">
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
      <span class="rpa-showing tk-showing">${filtersActive ? `${tasks.length} of ${totalTasks} tasks` : `${totalTasks} tasks`}</span>

      <button type="button" class="btn-primary st-btn tb-new" data-action="new-task"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Task</button>
    </div>

    <div class="kanban-board tk-board">
      ${TASK_STATUS_OPTIONS.map(status => {
    const columnTasks = tasks.filter(t => (t.status || 'To-Do') === status);
    return `
          <div class="kanban-column" data-status="${status}">
            <div class="kanban-column-header">
              <span class="kanban-column-title">${status}</span>
              <span class="kanban-column-count">${columnTasks.length}</span>
            </div>
            <div class="kanban-tasks">
              ${columnTasks.map(t => renderTaskCard(t, q)).join('') || '<div class="tk-col-empty">No tasks</div>'}
            </div>
          </div>
        `;
  }).join('')}
    </div>
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

const CAL_STATUS_COLOR = { 'To-Do': 'var(--status-planned)', 'In Progress': 'var(--info)', 'Done': 'var(--accent)', 'On Hold': 'var(--danger)' };
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
    // Calm cells: up to two open tasks, completed work as one line, nothing on
    // other-month days. The side panel shows everything for the selected day.
    const open = dayTasks.filter(t => t.status !== 'Done');
    const doneN = taskCount - open.length;
    const weekend = day.date.getDay() === 0 || day.date.getDay() === 6;
    const label = taskCount ? `${open.length} open, ${doneN} done` : 'No tasks';
    const body = !day.isCurrentMonth ? '' : `
          ${open.slice(0, 2).map(t => `<span class="cal-ev" style="--c:${CAL_STATUS_COLOR[t.status] || CAL_STATUS_COLOR['To-Do']}">${escapeHtml(t.title)}</span>`).join('')}
          ${open.length > 2 ? `<span class="cal-more">+${open.length - 2} more open</span>` : ''}
          ${doneN ? `<span class="cal-done">✓ ${doneN} done</span>` : ''}`;

    return `
      <div class="calendar-day-cell ${day.isCurrentMonth ? '' : 'other-month'} ${weekend ? 'weekend' : ''} ${day.dateStr === todayStr ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-action="select-calendar-date" data-date="${day.dateStr}" title="${label}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${day.dayNum}</span>
        </div>
        <div class="cal-events">${body}</div>
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
    const n = f.key === 'all' ? rawSelTasks.length : rawSelTasks.filter(t => t.status === f.key).length;
    return `<button type="button" class="rpa-chip ${statusFilter === f.key ? 'active' : ''}" data-action="calendar-right-filter" data-filter="${f.key}">${f.label} <span>${n}</span></button>`;
  }).join('');

  // Month summary for the header.
  const monthStart = formatDateStr(year, month, 1), monthEnd = formatDateStr(year, month, numDays);
  const inMonth = tasks.filter(t => { const { start, end } = getTaskCalendarRange(t); const a = start || end, b = end || start; return a && b && a <= monthEnd && b >= monthStart; });
  const dueInMonth = tasks.filter(t => t.endDate && t.status !== 'Done' && t.endDate.slice(0, 10) >= monthStart && t.endDate.slice(0, 10) <= monthEnd).length;
  const overdueOpen = tasks.filter(t => t.endDate && t.status !== 'Done' && t.endDate.slice(0, 10) < todayStr).length;
  const doneInMonth = tasks.filter(t => t.status === 'Done' && t.completedDate && t.completedDate.slice(0, 10) >= monthStart && t.completedDate.slice(0, 10) <= monthEnd).length;
  const busiest = days.filter(d => d.isCurrentMonth).map(d => ({ d, n: tasks.filter(t => isTaskActiveOnDate(t, d.dateStr)).length })).sort((a, b) => b.n - a.n)[0];
  const isTodaySel = selectedDateStr === todayStr;
  const viewingThisMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  const taskCardsHtml = filteredSelTasks.length > 0
    ? filteredSelTasks.map(t => renderCalendarPanelTaskCard(t)).join('')
    : `<div class="calendar-task-empty">${rawSelTasks.length ? 'No tasks with this status on this day.' : 'No tasks scheduled for this day.'}</div>`;

  return `
    <div class="rpa-page cal-page">
    <section class="rpa-hero">
      <div class="rpa-hero-main">
        <span class="rpa-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        <div>
          <h2 class="rpa-hero-title">Calendar</h2>
          <p class="rpa-hero-sub">Tasks by day for ${monthName}${filterProjId ? ` · ${escapeHtml((state.projects.find(p => p.id === filterProjId) || {}).name || '')}` : ''}.</p>
        </div>
      </div>
      <div class="rpa-hero-stats">
        <div class="rpa-hstat"><strong>${inMonth.length}</strong><span>This month</span></div>
        <div class="rpa-hstat"><strong class="warn">${dueInMonth}</strong><span>Due (open)</span></div>
        <div class="rpa-hstat"><strong class="${overdueOpen ? 'bad' : ''}">${overdueOpen}</strong><span>Overdue</span></div>
        <div class="rpa-hstat"><strong class="ok">${doneInMonth}</strong><span>Done</span></div>
        <div class="rpa-hstat"><strong>${busiest && busiest.n ? busiest.d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '–'}</strong><span>Busiest day</span></div>
      </div>
    </section>

    <div class="calendar-two-panel-layout">
      <div class="calendar-left-panel">
        <div class="rpa-toolbar cal-toolbar">
          <div class="calendar-nav">
            <button type="button" class="btn-ghost cal-nav-btn" data-action="calendar-prev" aria-label="Previous month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="calendar-title">${monthName}</span>
            <button type="button" class="btn-ghost cal-nav-btn" data-action="calendar-next" aria-label="Next month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button type="button" class="btn-ghost st-btn" data-action="calendar-today" ${viewingThisMonth && isTodaySel ? 'disabled' : ''}>Today</button>
          </div>
          <div class="rpa-toolbar-right">
            <select class="filter-select" id="filterCalendarProject" data-calfilter="project" aria-label="Project">
              <option value="">All Projects</option>
              ${projectOptions}
            </select>
          </div>
        </div>

        <div class="calendar-grid-container">
          <div class="calendar-weekdays">
            ${weekdaysHtml}
          </div>
          <div class="calendar-days-grid">
            ${gridHtml}
          </div>
        </div>
        <div class="cal-foot">
          <div class="cal-legend">${Object.entries({ 'To-Do': 'To-Do', 'In Progress': 'In progress', 'Done': 'Done', 'On Hold': 'On hold' }).map(([k, l]) => `<span><i style="--c:${CAL_STATUS_COLOR[k]}"></i>${l}</span>`).join('')}</div>
          <span>Click a day to see its tasks.</span>
        </div>
      </div>

      <div class="calendar-right-panel">
        <div class="right-panel-header cal-panel-head">
          <div class="cal-panel-title">
            <div>
              <span class="cal-panel-eyebrow">${isTodaySel ? 'Today' : 'Selected day'} · ${rawSelTasks.length} task${rawSelTasks.length === 1 ? '' : 's'}</span>
              <h3>${selectedDateLabel}</h3>
            </div>
            <button type="button" class="btn-ghost st-btn" data-action="calendar-add-task" data-date="${selectedDateStr}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Task
            </button>
          </div>
          <div class="cal-panel-filters">${filterBtnsHtml}</div>
          <div class="cal-panel-sort">
            <label for="calSortSelect">Sort by</label>
            <select class="filter-select" id="calSortSelect" data-cal-sort="type">
              <option value="priority" ${sortType === 'priority' ? 'selected' : ''}>Priority</option>
              <option value="due" ${sortType === 'due' ? 'selected' : ''}>Due date</option>
            </select>
          </div>
        </div>
        <div class="right-panel-task-list">
          ${taskCardsHtml}
        </div>
      </div>
    </div>
    </div>
  `;
};
