// Clair — js/excel-report.js: Excel report export (ExcelJS styling).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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
