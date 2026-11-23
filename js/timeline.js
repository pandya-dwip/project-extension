// Clair — js/timeline.js: Interactive Timeline / Gantt Chart View.
// Part of Clair scripts, loaded in order by index.html (classic scripts share one global scope).

let timelineState = {
  scale: 'week',       // 'day' | 'week' | 'month'
  groupBy: 'project',  // 'project' | 'developer' | 'status'
  filterProject: '',
  filterDeveloper: '',
  filterStatus: '',
  search: '',
  baseDate: new Date(),
  expandedGroups: new Set() // Default all closed / collapsed
};

// Date helper functions for timeline
const tlFormatDate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const tlParseDate = (s) => {
  if (!s) return null;
  const parts = s.split('T')[0].split('-');
  if (parts.length < 3) return null;
  return new Date(+parts[0], +parts[1] - 1, +parts[2], 0, 0, 0, 0);
};

const tlAddDays = (d, n) => {
  const res = new Date(d);
  res.setDate(res.getDate() + n);
  return res;
};

const tlDiffDays = (d1, d2) => {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((d1.getTime() - d2.getTime()) / ms);
};

// Calculate active date window based on scale and baseDate
const tlGetWindowRange = () => {
  const base = new Date(timelineState.baseDate);
  base.setHours(0, 0, 0, 0);

  let start, end, colWidth, cols = [];
  if (timelineState.scale === 'day') {
    // 30 days: 7 days before, 23 days ahead
    start = tlAddDays(base, -7);
    end = tlAddDays(base, 23);
    colWidth = 44; // px per day
    let cur = new Date(start);
    while (cur <= end) {
      cols.push({
        date: new Date(cur),
        dateStr: tlFormatDate(cur),
        label: cur.getDate(),
        sub: cur.toLocaleDateString('en-US', { weekday: 'narrow' }),
        isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
        isMonthStart: cur.getDate() === 1
      });
      cur.setDate(cur.getDate() + 1);
    }
  } else if (timelineState.scale === 'month') {
    // 8 months: 2 months back, 6 months ahead
    start = new Date(base.getFullYear(), base.getMonth() - 2, 1);
    end = new Date(base.getFullYear(), base.getMonth() + 6, 0);
    colWidth = 130; // px per month
    let cur = new Date(start);
    while (cur <= end) {
      cols.push({
        date: new Date(cur),
        dateStr: tlFormatDate(cur),
        label: cur.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        sub: '',
        isWeekend: false,
        daysInMonth: new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    // 'week' default: 12 weeks (3 weeks before, 9 weeks ahead)
    const dayOfWeek = (base.getDay() + 6) % 7; // Mon = 0
    const mon = tlAddDays(base, -dayOfWeek);
    start = tlAddDays(mon, -21); // 3 weeks back
    end = tlAddDays(mon, 63);   // 9 weeks ahead
    colWidth = 84; // px per week
    let cur = new Date(start);
    while (cur <= end) {
      const wEnd = tlAddDays(cur, 6);
      cols.push({
        date: new Date(cur),
        dateStr: tlFormatDate(cur),
        label: `${cur.toLocaleDateString('en-US', { month: 'short' })} ${cur.getDate()}`,
        sub: `– ${wEnd.getDate()}`,
        isWeekend: false
      });
      cur.setDate(cur.getDate() + 7);
    }
  }

  const totalWidth = cols.length * colWidth;
  return { start, end, colWidth, cols, totalWidth };
};

// Calculate pixel offset for a date string
const tlGetXForDate = (dateStr, win) => {
  const d = tlParseDate(dateStr);
  if (!d) return null;
  const totalDays = tlDiffDays(win.end, win.start) + (timelineState.scale === 'month' ? 1 : 0);
  if (totalDays <= 0) return 0;
  const dayOffset = tlDiffDays(d, win.start);
  return (dayOffset / totalDays) * win.totalWidth;
};

// Main renderer for Timeline view
const renderTimeline = () => {
  const win = tlGetWindowRange();
  const todayStr = tlFormatDate(new Date());
  const todayX = tlGetXForDate(todayStr, win);

  // Filter tasks & projects
  const q = (timelineState.search || '').toLowerCase();
  let projects = state.projects || [];
  let tasks = state.tasks || [];
  let releases = state.releases || [];

  if (timelineState.filterProject) {
    projects = projects.filter(p => p.id === timelineState.filterProject);
    tasks = tasks.filter(t => (t.projectIds || []).includes(timelineState.filterProject));
    releases = releases.filter(r => (r.projectIds || [r.projectId]).includes(timelineState.filterProject));
  }
  if (timelineState.filterDeveloper) {
    tasks = tasks.filter(t => (t.developerIds || []).includes(timelineState.filterDeveloper));
  }
  if (timelineState.filterStatus) {
    if (timelineState.filterStatus === 'active') {
      tasks = tasks.filter(t => t.status !== 'Done');
    } else {
      tasks = tasks.filter(t => (t.status || 'To-Do') === timelineState.filterStatus);
    }
  }
  if (q) {
    projects = projects.filter(p => p.name.toLowerCase().includes(q) || (p.clientName || '').toLowerCase().includes(q));
    tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || getTaskDevNames(t).join(' ').toLowerCase().includes(q));
  }

  // Summary KPI calculation
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
  const overdueTasks = tasks.filter(t => t.endDate && t.status !== 'Done' && new Date(t.endDate) < new Date()).length;
  const completionPct = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Build Hero Header
  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="13" y2="8" stroke-width="2.2"/><line x1="10" y1="12" x2="18" y2="12" stroke-width="2.2"/><line x1="6" y1="16" x2="14" y2="16" stroke-width="2.2"/></svg>`,
    title: 'Interactive Timeline &amp; Gantt',
    subtitle: 'Visualize chronological schedules, milestone diamond targets, overlaps and team workloads.',
    stats: [
      { label: 'Scheduled Tasks', value: totalTasks },
      { label: 'In Progress', value: inProgressTasks, color: '#fbbf24' },
      { label: 'Overdue', value: overdueTasks, color: overdueTasks ? '#f87171' : undefined },
      { label: 'Completed', value: completedTasks, color: '#4ade80' }
    ],
    progressBar: { pct: completionPct, label: `${completedTasks}/${totalTasks} tasks done` }
  });

  // Controls bar
  const projectOptions = (state.projects || []).map(p =>
    `<option value="${p.id}" ${timelineState.filterProject === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  const devOptions = (state.developers || []).map(d =>
    `<option value="${d.id}" ${timelineState.filterDeveloper === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
  ).join('');

  const controls = `
    <div class="filters-bar tk-toolbar tl-toolbar">
      <!-- Search Input -->
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="tlSearchInput" placeholder="Filter timeline items…" value="${escapeHtml(timelineState.search)}" />
        ${timelineState.search ? `<button class="page-search-clear" id="tlClearSearch">✕</button>` : ''}
      </div>

      <!-- Scale switcher -->
      <div class="tl-segmented" role="group" aria-label="Timeline scale">
        <button type="button" class="tl-seg-btn ${timelineState.scale === 'day' ? 'active' : ''}" data-tlscale="day">Days</button>
        <button type="button" class="tl-seg-btn ${timelineState.scale === 'week' ? 'active' : ''}" data-tlscale="week">Weeks</button>
        <button type="button" class="tl-seg-btn ${timelineState.scale === 'month' ? 'active' : ''}" data-tlscale="month">Months</button>
      </div>

      <!-- Grouping switcher -->
      <div class="tl-segmented" role="group" aria-label="Group by">
        <button type="button" class="tl-seg-btn ${timelineState.groupBy === 'project' ? 'active' : ''}" data-tlgroup="project">By Project</button>
        <button type="button" class="tl-seg-btn ${timelineState.groupBy === 'developer' ? 'active' : ''}" data-tlgroup="developer">By Developer</button>
      </div>

      <button type="button" class="btn-ghost st-btn tl-toggle-all-btn" data-action="tl-toggle-all" title="Toggle all groups expanded or collapsed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M7 11l5-5 5 5M7 13l5 5 5-5"/></svg>
        ${timelineState.expandedGroups.size > 0 ? 'Collapse All' : 'Expand All'}
      </button>

      <!-- Panning nav buttons -->
      <div class="tl-nav-group">
        <button type="button" class="btn-ghost tl-nav-btn" data-action="tl-prev" title="Pan left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button type="button" class="btn-ghost st-btn tl-today-btn" data-action="tl-today" title="Jump to today">Today</button>
        <button type="button" class="btn-ghost tl-nav-btn" data-action="tl-next" title="Pan right">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- Filters -->
      <select class="filter-select" id="tlFilterProject" data-tlfilter="project">
        <option value="">All Projects</option>
        ${projectOptions}
      </select>
      <select class="filter-select" id="tlFilterDeveloper" data-tlfilter="developer">
        <option value="">All Developers</option>
        ${devOptions}
      </select>
      <select class="filter-select" id="tlFilterStatus" data-tlfilter="status">
        <option value="" ${!timelineState.filterStatus ? 'selected' : ''}>All Statuses</option>
        <option value="active" ${timelineState.filterStatus === 'active' ? 'selected' : ''}>Active Only</option>
        <option value="To-Do" ${timelineState.filterStatus === 'To-Do' ? 'selected' : ''}>To-Do</option>
        <option value="In Progress" ${timelineState.filterStatus === 'In Progress' ? 'selected' : ''}>In Progress</option>
        <option value="Done" ${timelineState.filterStatus === 'Done' ? 'selected' : ''}>Done</option>
        <option value="On Hold" ${timelineState.filterStatus === 'On Hold' ? 'selected' : ''}>On Hold</option>
      </select>

      <button type="button" class="btn-primary st-btn tb-new" data-action="new-task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Task
      </button>
    </div>
  `;

  // Render rows based on groupBy
  let leftRowsHtml = '';
  let chartRowsHtml = '';

  const STATUS_COLOR_MAP = {
    'Done': '#059669',
    'In Progress': '#0284c7',
    'To-Do': '#64748b',
    'On Hold': '#d97706'
  };

  const getTaskDates = (t) => {
    const s = t.startDate || (t.createdAt ? t.createdAt.split('T')[0] : null);
    let e = t.endDate || s;
    if (t.status === 'Done') {
      if (t.completedDate) e = t.completedDate.split('T')[0];
      else if (t.updatedAt) e = t.updatedAt.split('T')[0];
    }
    return { start: s, end: e };
  };

  // Helper to render task bar in right chart
  const renderTaskBarHtml = (t) => {
    const { start, end } = getTaskDates(t);
    if (!start && !end) return `<div class="tl-bar-track"></div>`;

    let x1 = tlGetXForDate(start || end, win);
    let x2 = tlGetXForDate(end || start, win);
    if (x1 === null && x2 === null) return `<div class="tl-bar-track"></div>`;

    if (x1 === null) x1 = 0;
    if (x2 === null) x2 = win.totalWidth;
    let left = Math.min(x1, x2);
    let width = Math.max(Math.abs(x2 - x1), 16); // Minimum width 16px

    // Clamping to visible window
    const clampedLeft = Math.max(0, left);
    const clampedRight = Math.min(win.totalWidth, left + width);
    const isVisible = clampedRight > 0 && clampedLeft < win.totalWidth;
    if (!isVisible) return `<div class="tl-bar-track"></div>`;

    const color = STATUS_COLOR_MAP[t.status] || '#64748b';
    const isDone = t.status === 'Done';
    const devNames = getTaskDevNames(t).join(', ');

    return `
      <div class="tl-bar-track">
        <div class="tl-task-bar ${isDone ? 'done' : ''} ${t.status === 'In Progress' ? 'in-progress' : ''}"
          style="left:${left}px; width:${width}px; --bar-color:${color};"
          data-action="edit-task" data-id="${t.id}"
          data-tooltip="${escapeHtml(t.title)} | ${t.status} | ${start || '—'} to ${end || '—'}${devNames ? ` | ${devNames}` : ''}">
          <span class="tl-bar-title">${escapeHtml(t.title)}</span>
          ${isDone ? `<span class="tl-bar-check">✓</span>` : ''}
        </div>
      </div>
    `;
  };

  if (timelineState.groupBy === 'developer') {
    // Group by Developer
    const devs = state.developers || [];
    devs.forEach(dev => {
      const devTasks = tasks.filter(t => (t.developerIds || []).includes(dev.id));
      if (!devTasks.length && timelineState.filterDeveloper) return;

      const isExpanded = timelineState.expandedGroups.has(dev.id);
      const devCompleted = devTasks.filter(t => t.status === 'Done').length;

      leftRowsHtml += `
        <div class="tl-group-row" data-tlgroup-id="${dev.id}">
          <button type="button" class="tl-group-toggle" data-action="tl-toggle-group" data-id="${dev.id}" title="${isExpanded ? 'Collapse' : 'Expand'}">
            <svg class="tl-chevron ${isExpanded ? 'expanded' : 'collapsed'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <span class="tl-dev-avatar">${dev.name.slice(0, 2).toUpperCase()}</span>
          <span class="tl-group-name" data-action="tl-toggle-group" data-id="${dev.id}" title="${escapeHtml(dev.name)}">${escapeHtml(dev.name)}</span>
          <span class="tl-group-count">${devCompleted}/${devTasks.length}</span>
        </div>
      `;
      chartRowsHtml += `<div class="tl-group-track"></div>`;

      if (isExpanded) {
        devTasks.forEach(t => {
          const { start, end } = getTaskDates(t);
          leftRowsHtml += `
            <div class="tl-task-row" data-action="edit-task" data-id="${t.id}" title="${escapeHtml(t.title)}">
              <span class="tl-task-status-dot" style="background:${STATUS_COLOR_MAP[t.status] || '#64748b'}"></span>
              <span class="tl-task-name">${escapeHtml(t.title)}</span>
              <span class="tl-task-dates">${start ? start.slice(5) : ''}${end ? `–${end.slice(5)}` : ''}</span>
            </div>
          `;
          chartRowsHtml += renderTaskBarHtml(t);
        });
      }
    });
  } else {
    // Group by Project (default)
    projects.forEach(p => {
      const pTasks = tasks.filter(t => (t.projectIds || []).includes(p.id));
      const pReleases = releases.filter(r => (r.projectIds || [r.projectId]).includes(p.id));
      const isExpanded = timelineState.expandedGroups.has(p.id);

      // Project bar bounds
      let pStart = p.createdAt ? p.createdAt.split('T')[0] : null;
      let pEnd = p.dueDate || null;
      pTasks.forEach(t => {
        const { start, end } = getTaskDates(t);
        if (start && (!pStart || start < pStart)) pStart = start;
        if (end && (!pEnd || end > pEnd)) pEnd = end;
      });

      const pDone = pTasks.filter(t => t.status === 'Done').length;
      const pPct = pTasks.length ? Math.round((pDone / pTasks.length) * 100) : 0;

      leftRowsHtml += `
        <div class="tl-group-row tl-project-group-row" data-tlgroup-id="${p.id}">
          <button type="button" class="tl-group-toggle" data-action="tl-toggle-group" data-id="${p.id}" title="${isExpanded ? 'Collapse' : 'Expand'}">
            <svg class="tl-chevron ${isExpanded ? 'expanded' : 'collapsed'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <span class="tl-proj-badge ${p.projectType}">${p.projectType === 'app' ? 'APP' : 'WEB'}</span>
          <span class="tl-group-name" data-action="tl-toggle-group" data-id="${p.id}" title="Click to ${isExpanded ? 'collapse' : 'expand'}">${escapeHtml(p.name)}</span>
          <button type="button" class="tl-proj-open-btn" data-action="open-project" data-id="${p.id}" title="View Project Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
          </button>
          <span class="tl-group-count">${pDone}/${pTasks.length} (${pPct}%)</span>
        </div>
      `;

      // Project level timeline bar
      let projBarHtml = '';
      if (pStart || pEnd) {
        let px1 = tlGetXForDate(pStart || pEnd, win);
        let px2 = tlGetXForDate(pEnd || pStart, win);
        if (px1 !== null || px2 !== null) {
          if (px1 === null) px1 = 0;
          if (px2 === null) px2 = win.totalWidth;
          const pLeft = Math.min(px1, px2);
          const pWidth = Math.max(Math.abs(px2 - px1), 24);
          projBarHtml = `
            <div class="tl-proj-bar" style="left:${pLeft}px; width:${pWidth}px;" title="${escapeHtml(p.name)} (${pStart || '—'} to ${pEnd || '—'}) · ${pPct}% complete">
              <div class="tl-proj-bar-progress" style="width:${pPct}%"></div>
              <span class="tl-proj-bar-label">${escapeHtml(p.name)}</span>
            </div>
          `;
        }
      }

      // Add Release milestone diamonds along project track
      pReleases.forEach(r => {
        if (!r.releaseDate) return;
        const rx = tlGetXForDate(r.releaseDate, win);
        if (rx !== null && rx >= 0 && rx <= win.totalWidth) {
          projBarHtml += `
            <div class="tl-milestone" style="left:${rx}px;" data-action="view-release" data-id="${r.id}"
              title="Release: ${escapeHtml(r.name)} (${r.releaseDate}) · ${r.status || 'Draft'}">
              <div class="tl-diamond"></div>
              <span class="tl-milestone-tag">${escapeHtml((r.versions && r.versions[0]) || r.version || r.name)}</span>
            </div>
          `;
        }
      });

      chartRowsHtml += `<div class="tl-group-track">${projBarHtml}</div>`;

      // Child task rows
      if (isExpanded) {
        pTasks.forEach(t => {
          const { start, end } = getTaskDates(t);
          const devInitials = getTaskDevNames(t).map(n => n[0]).join('');
          leftRowsHtml += `
            <div class="tl-task-row" data-action="edit-task" data-id="${t.id}" title="${escapeHtml(t.title)}">
              <span class="tl-task-status-dot" style="background:${STATUS_COLOR_MAP[t.status] || '#64748b'}"></span>
              <span class="tl-task-name">${escapeHtml(t.title)}</span>
              ${devInitials ? `<span class="tl-task-avatar">${devInitials}</span>` : ''}
              <span class="tl-task-dates">${start ? start.slice(5) : ''}${end ? `–${end.slice(5)}` : ''}</span>
            </div>
          `;
          chartRowsHtml += renderTaskBarHtml(t);
        });
      }
    });
  }

  // Column headers
  const colHeadersHtml = win.cols.map(c => `
    <div class="tl-col-header ${c.isWeekend ? 'weekend' : ''}" style="width:${win.colWidth}px;">
      <span class="tl-col-label">${c.label}</span>
      ${c.sub ? `<span class="tl-col-sub">${c.sub}</span>` : ''}
    </div>
  `).join('');

  // Column background grid
  const colGridHtml = win.cols.map(c => `
    <div class="tl-grid-col ${c.isWeekend ? 'weekend' : ''}" style="width:${win.colWidth}px;"></div>
  `).join('');

  return `
    <div class="rpa-page tl-page">
      ${hero}
      ${controls}

      <div class="tl-main-container">
        <!-- Left sticky list -->
        <div class="tl-left-panel">
          <div class="tl-left-header">
            <span>Work Items &amp; Hierarchy</span>
            <span class="tl-item-count">${tasks.length} tasks</span>
          </div>
          <div class="tl-left-rows">
            ${leftRowsHtml || '<div class="tl-empty">No items to display</div>'}
          </div>
        </div>

        <!-- Right horizontal scroll chart -->
        <div class="tl-chart-panel" id="tlChartScroll">
          <div class="tl-chart-content" style="width:${win.totalWidth}px;">
            <!-- Header row with dates -->
            <div class="tl-header-row">
              ${colHeadersHtml}
            </div>

            <!-- Body with background grid, today line, and tracks -->
            <div class="tl-body-area">
              <div class="tl-grid-background">
                ${colGridHtml}
              </div>

              ${todayX !== null && todayX >= 0 && todayX <= win.totalWidth ? `
                <div class="tl-today-line" style="left:${todayX}px;" title="Today: ${todayStr}">
                  <span class="tl-today-tag">TODAY</span>
                </div>
              ` : ''}

              <div class="tl-tracks-layer">
                ${chartRowsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

// Interactive event listeners for Timeline
const initTimelineEvents = () => {
  // Sync vertical scroll between left list and right chart
  const leftRows = document.querySelector('.tl-left-rows');
  const chartScroll = document.getElementById('tlChartScroll');
  if (leftRows && chartScroll) {
    let isLeftSyncing = false;
    let isRightSyncing = false;
    leftRows.addEventListener('scroll', () => {
      if (isRightSyncing) return;
      isLeftSyncing = true;
      chartScroll.scrollTop = leftRows.scrollTop;
      isLeftSyncing = false;
    });
    chartScroll.addEventListener('scroll', () => {
      if (isLeftSyncing) return;
      isRightSyncing = true;
      leftRows.scrollTop = chartScroll.scrollTop;
      isRightSyncing = false;
    });

    // Auto-scroll to Today marker on initial load
    setTimeout(() => {
      const todayEl = document.querySelector('.tl-today-line');
      if (todayEl && chartScroll) {
        const offset = todayEl.offsetLeft - (chartScroll.clientWidth / 2);
        chartScroll.scrollLeft = Math.max(0, offset);
      }
    }, 50);
  }

  // Panning buttons
  const prevBtn = document.querySelector('[data-action="tl-prev"]');
  if (prevBtn) {
    prevBtn.onclick = () => {
      const days = timelineState.scale === 'day' ? 14 : (timelineState.scale === 'month' ? 60 : 28);
      timelineState.baseDate = tlAddDays(timelineState.baseDate, -days);
      render();
    };
  }

  const nextBtn = document.querySelector('[data-action="tl-next"]');
  if (nextBtn) {
    nextBtn.onclick = () => {
      const days = timelineState.scale === 'day' ? 14 : (timelineState.scale === 'month' ? 60 : 28);
      timelineState.baseDate = tlAddDays(timelineState.baseDate, days);
      render();
    };
  }

  const todayBtn = document.querySelector('[data-action="tl-today"]');
  if (todayBtn) {
    todayBtn.onclick = () => {
      timelineState.baseDate = new Date();
      render();
    };
  }

  // Scale buttons
  document.querySelectorAll('[data-tlscale]').forEach(btn => {
    btn.onclick = () => {
      timelineState.scale = btn.dataset.tlscale;
      render();
    };
  });

  // GroupBy buttons
  document.querySelectorAll('[data-tlgroup]').forEach(btn => {
    btn.onclick = () => {
      timelineState.groupBy = btn.dataset.tlgroup;
      render();
    };
  });

  // Dropdown filters
  const fProj = document.getElementById('tlFilterProject');
  if (fProj) fProj.onchange = (e) => { timelineState.filterProject = e.target.value; render(); };

  const fDev = document.getElementById('tlFilterDeveloper');
  if (fDev) fDev.onchange = (e) => { timelineState.filterDeveloper = e.target.value; render(); };

  const fStat = document.getElementById('tlFilterStatus');
  if (fStat) fStat.onchange = (e) => { timelineState.filterStatus = e.target.value; render(); };

  // Search input
  const sInput = document.getElementById('tlSearchInput');
  if (sInput) {
    sInput.oninput = (e) => {
      timelineState.search = e.target.value;
      render();
      const newInp = document.getElementById('tlSearchInput');
      if (newInp) {
        newInp.focus();
        newInp.setSelectionRange(newInp.value.length, newInp.value.length);
      }
    };
  }
  const sClear = document.getElementById('tlClearSearch');
  if (sClear) {
    sClear.onclick = () => {
      timelineState.search = '';
      render();
    };
  }

  // Toggle group expand/collapse
  document.querySelectorAll('[data-action="tl-toggle-group"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (timelineState.expandedGroups.has(id)) {
        timelineState.expandedGroups.delete(id);
      } else {
        timelineState.expandedGroups.add(id);
      }
      render();
    };
  });

  // Toggle all expand/collapse
  const toggleAllBtn = document.querySelector('[data-action="tl-toggle-all"]');
  if (toggleAllBtn) {
    toggleAllBtn.onclick = () => {
      if (timelineState.expandedGroups.size > 0) {
        timelineState.expandedGroups.clear();
      } else {
        if (timelineState.groupBy === 'developer') {
          (state.developers || []).forEach(d => timelineState.expandedGroups.add(d.id));
        } else {
          (state.projects || []).forEach(p => timelineState.expandedGroups.add(p.id));
        }
      }
      render();
    };
  }

  // Open project details from project group name
  document.querySelectorAll('[data-action="open-project"]').forEach(el => {
    el.onclick = () => {
      state.overviewProjectId = el.dataset.id;
      setView('projects');
    };
  });
};
