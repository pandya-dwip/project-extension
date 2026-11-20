// Clair — js/dashboard.js: Dashboard (charts, sections, releases in flight).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

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
