// Clair — js/test-cases.js: Test Case Management, actions, modules, Excel import.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Test Case Management ────────────────────────────────
// Three levels:
//   home      (no project)            → summary + project cards
//   overview  (project, tcPage 'overview')  → KPIs, charts, modules, open failures
//   scenarios (project, tcPage 'scenarios') → module rail + scenario table
// The scenario table keeps the original hooks (table-inline-* fields with
// data-field/data-id autosave, .testcase-select-checkbox, #selectAllTcCb,
// data-tcfilter selects, #tcPageSizeSelect, .module-item, selection bar ids), so the
// existing delegated handlers keep doing the editing, filtering and paging.
const TC_STATUSES = ['Passed', 'Failed', 'Blocked', 'Untested'];
const tcCounts = (cases) => {
  const c = { total: cases.length, passed: 0, failed: 0, blocked: 0, untested: 0, automated: 0 };
  cases.forEach(tc => {
    if (tc.status === 'Passed') c.passed++;
    else if (tc.status === 'Failed') c.failed++;
    else if (tc.status === 'Blocked') c.blocked++;
    else c.untested++; // 'Untested' and anything unexpected
    if (tc.type === 'Automated') c.automated++;
  });
  c.rate = c.total ? Math.round(c.passed / c.total * 1000) / 10 : 0;
  return c;
};
const tcRateCls = (r, total) => !total ? 'none' : r >= 95 ? 'good' : r >= 80 ? 'ok' : 'low';
const tcBar = (c, cls = '') => `<span class="dbx-stackbar ${cls}">${[['pass', c.passed], ['fail', c.failed], ['blocked', c.blocked], ['notrun', c.untested]].filter(([, n]) => n).map(([k, n]) => `<span class="${k}" style="flex:${n}" title="${({ pass: 'Passed', fail: 'Failed', blocked: 'Blocked', notrun: 'Untested' })[k]}: ${n}"></span>`).join('')}</span>`;
const tcRing = (rate, total, size = 44) => {
  const r = size / 2 - 4, circ = 2 * Math.PI * r;
  return `
    <span class="tc-ring ${tcRateCls(rate, total)}" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - (total ? rate : 0) / 100)).toFixed(2)}"/></svg>
      <span>${total ? Math.round(rate) + '%' : '—'}</span>
    </span>`;
};
const tcDonut = (c) => {
  const segs = [['pass', c.passed], ['fail', c.failed], ['blocked', c.blocked], ['notrun', c.untested]].filter(([, n]) => n);
  const r = 46, circ = 2 * Math.PI * r;
  let off = 0;
  const arcs = segs.map(([k, n]) => {
    const len = c.total ? n / c.total * circ : 0;
    const gap = segs.length > 1 ? Math.min(2, len / 3) : 0;
    const s = `<circle class="seg ${k}" cx="60" cy="60" r="${r}" stroke-dasharray="${Math.max(len - gap, 0).toFixed(2)} ${(circ - Math.max(len - gap, 0)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    off += len;
    return s;
  }).join('');
  return `
    <div class="tc-donut">
      <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="${r}"/>${arcs}</svg>
      <div class="tc-donut-center"><strong>${c.rate}%</strong><span>pass rate</span></div>
    </div>`;
};
// Only real YYYY-MM-DD dates count (some imported cases hold free text there).
const tcLastRun = (cases) => cases.map(tc => tc.executionDate).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d || '') && !isNaN(new Date(d))).sort().pop() || '';
// "https://…/browse/CIMTRACK-655" → "CIMTRACK-655"; plain IDs unchanged.
const tcDefectLabel = (d) => { const s = String(d || '').trim(); const m = s.match(/([A-Z][A-Z0-9_]*-\d+)\s*$/i); return /^https?:\/\//i.test(s) && m ? m[1] : s; };
const tcCrumbs = (items) => `
  <nav class="tc-crumbs" aria-label="Breadcrumb">
    ${items.map((it, i) => i < items.length - 1
      ? `<button type="button" class="tc-crumb" data-action="${it.action}">${it.label}</button><span class="tc-crumb-sep" aria-hidden="true">/</span>`
      : `<span class="tc-crumb current" aria-current="page">${it.label}</span>`).join('')}
  </nav>`;
const TC_I = {
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3v7.2a4 4 0 01-1.3 2.9l-3.4 3.1A2 2 0 005.7 20h12.6a2 2 0 001.4-3.8l-3.4-3.1A4 4 0 0115 10.2V3"/><path d="M7 3h10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 18l6-6-6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>'
};

// ── Level 1: home ──
const renderTcHome = () => {
  const all = tcCounts(state.testCases);
  const q = (state.tcHomeSearch || '').toLowerCase().trim();
  const sort = state.tcHomeSort || 'cases';
  const rows = state.projects.map(p => {
    const cases = state.testCases.filter(tc => tc.projectId === p.id);
    return { p, cases, c: tcCounts(cases), modules: state.modules.filter(m => m.projectId === p.id).length, last: tcLastRun(cases) };
  }).filter(r => !q || r.p.name.toLowerCase().includes(q));
  const withCases = rows.filter(r => r.c.total);
  const empty = rows.filter(r => !r.c.total);
  const sorters = { cases: (a, b) => b.c.total - a.c.total, rate: (a, b) => a.c.rate - b.c.rate, failed: (a, b) => b.c.failed - a.c.failed, name: (a, b) => a.p.name.localeCompare(b.p.name) };
  withCases.sort(sorters[sort] || sorters.cases);
  const ringR = 26, ringC = 2 * Math.PI * ringR;

  const card = (r) => `
    <button type="button" class="tch-card" data-action="tc-open-project" data-id="${r.p.id}">
      <span class="tch-card-top">
        <span class="tch-card-name">${highlight(escapeHtml(r.p.name), q)}</span>
        ${tcRing(r.c.rate, r.c.total)}
      </span>
      <span class="tch-card-meta">${r.c.total} cases · ${r.modules} module${r.modules === 1 ? '' : 's'}${r.last ? ` · last run ${fmtDate(r.last)}` : ''}</span>
      ${tcBar(r.c)}
      <span class="tch-card-counts">
        <span><i class="dbx-dot pass"></i>${r.c.passed}</span>
        <span><i class="dbx-dot fail"></i>${r.c.failed}</span>
        <span><i class="dbx-dot blocked"></i>${r.c.blocked}</span>
        <span><i class="dbx-dot notrun"></i>${r.c.untested}</span>
        ${r.c.failed ? `<span class="dbx-tag danger">${r.c.failed} failing</span>` : r.c.total && r.c.passed === r.c.total ? '<span class="dbx-tag ok">All passing</span>' : ''}
      </span>
    </button>`;

  return `
    <div class="tc-page">
      <section class="rpa-hero">
        <div class="rpa-hero-main">
          <span class="rpa-hero-icon">${TC_I.flask}</span>
          <div>
            <h2 class="rpa-hero-title">Test Cases</h2>
            <p class="rpa-hero-sub">Test coverage and results across your projects.</p>
          </div>
        </div>
        <div class="rpa-hero-stats">
          <div class="rpa-hstat"><strong>${all.total}</strong><span>Total</span></div>
          <div class="rpa-hstat"><strong class="ok">${all.passed}</strong><span>Passed</span></div>
          <div class="rpa-hstat"><strong class="bad">${all.failed}</strong><span>Failed</span></div>
          <div class="rpa-hstat"><strong class="warn">${all.blocked}</strong><span>Blocked</span></div>
          <div class="rpa-hstat"><strong>${all.untested}</strong><span>Untested</span></div>
          <div class="rpa-hero-ring" title="${all.passed} of ${all.total} passed">
            <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${ringR}"/><circle class="fill" cx="32" cy="32" r="${ringR}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${(ringC * (1 - all.rate / 100)).toFixed(2)}"/></svg>
            <span><strong>${all.rate}%</strong><em>pass rate</em></span>
          </div>
        </div>
      </section>

      <div class="rpa-toolbar">
        <div class="page-search-wrap rpa-search">
          <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="page-search-input" id="tcHomeSearchInput" placeholder="Search projects…" value="${escapeHtml(state.tcHomeSearch || '')}" />
        </div>
        <select class="filter-select" id="tcHomeSort" aria-label="Sort projects">
          <option value="cases" ${sort === 'cases' ? 'selected' : ''}>Most test cases</option>
          <option value="failed" ${sort === 'failed' ? 'selected' : ''}>Most failures</option>
          <option value="rate" ${sort === 'rate' ? 'selected' : ''}>Lowest pass rate</option>
          <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
        </select>
        <div class="rpa-toolbar-right">
          <button type="button" class="btn-ghost rpa-tool-btn st-btn" id="openExcelImportModalBtn">${TC_I.upload}Import Excel</button>
          <button type="button" class="btn-primary rpa-new" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        </div>
      </div>

      ${withCases.length ? `
        <section class="rpa-group">
          <div class="rpa-group-head"><span class="rpa-group-dot" style="background:var(--accent)"></span>Projects with test cases<span class="rpa-group-count">${withCases.length}</span></div>
          <div class="tch-grid">${withCases.map(card).join('')}</div>
        </section>` : ''}
      ${empty.length ? `
        <section class="rpa-group">
          <div class="rpa-group-head"><span class="rpa-group-dot" style="background:var(--status-planned)"></span>No test cases yet<span class="rpa-group-count">${empty.length}</span></div>
          <div class="tch-empty-list">
            ${empty.map(r => `<button type="button" class="tch-empty-chip" data-action="tc-open-project" data-id="${r.p.id}">${TC_I.folder}<span>${highlight(escapeHtml(r.p.name), q)}</span><em>Add tests</em></button>`).join('')}
          </div>
        </section>` : ''}
      ${!rows.length ? `<div class="rpa-empty"><h3>No projects match “${escapeHtml(state.tcHomeSearch)}”</h3><p>Try a different name.</p></div>` : ''}
    </div>`;
};

// ── Level 2: project overview ──
const renderTcOverview = (proj) => {
  const cases = state.testCases.filter(tc => tc.projectId === proj.id);
  const c = tcCounts(cases);
  const mods = state.modules.filter(m => m.projectId === proj.id);
  const last = tcLastRun(cases);
  const head = `
    ${tcCrumbs([{ label: 'Test Cases', action: 'tc-home' }, { label: escapeHtml(proj.name) }])}
    <section class="tco-head">
      <div class="tco-head-main">
        <h2>${escapeHtml(proj.name)}</h2>
        <p>${c.total} test case${c.total === 1 ? '' : 's'} · ${mods.length} module${mods.length === 1 ? '' : 's'}${last ? ` · last run ${fmtDate(last)}` : ''}</p>
      </div>
      <div class="tco-head-actions">
        <button type="button" class="btn-ghost st-btn" id="openExcelImportModalBtn">${TC_I.upload}Import Excel</button>
        <button type="button" class="btn-ghost st-btn" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        ${c.total ? `<button type="button" class="btn-primary st-btn tco-open" data-action="tc-open-scenarios">${TC_I.list}Open test scenarios${TC_I.arrow}</button>` : ''}
      </div>
    </section>`;

  if (!c.total) {
    return `<div class="tc-page">${head}
      <div class="rpa-empty">
        <span class="rpa-empty-icon">${TC_I.flask}</span>
        <h3>No test cases in ${escapeHtml(proj.name)} yet</h3>
        <p>Import them from an Excel sheet or add them one at a time.</p>
        <div class="tco-empty-actions">
          <button type="button" class="btn-primary st-btn" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        </div>
      </div></div>`;
  }

  const kpi = (n, l, cls = '') => `<div class="po-stat ${cls}"><span class="po-stat-num">${n}</span><span class="po-stat-label">${l}</span></div>`;
  const breakdown = (title, groups) => {
    const max = Math.max(1, ...groups.map(g => g.c.total));
    return `
      <div class="tco-card">
        <h3 class="tco-card-title">${title}</h3>
        <div class="tco-bars">
          ${groups.filter(g => g.c.total).map(g => `
            <div class="tco-bar-row" title="${escapeHtml(g.label)}: ${g.c.passed} passed, ${g.c.failed} failed, ${g.c.blocked} blocked, ${g.c.untested} untested">
              <span class="tco-bar-label">${escapeHtml(g.label)}</span>
              <span class="tco-bar-track"><span style="width:${g.c.total / max * 100}%">${tcBar(g.c, 'slim')}</span></span>
              <span class="tco-bar-n">${g.c.total}</span>
            </div>`).join('') || '<div class="dbx-empty">No data</div>'}
        </div>
      </div>`;
  };
  const by = (field, values, labelOf = v => v) => values.map(v => ({ label: labelOf(v), c: tcCounts(cases.filter(tc => (tc[field] || '') === v)) }));
  const assignees = [...new Set(cases.map(tc => tc.assignee || ''))];
  const assigneeGroups = assignees.map(a => ({ label: a || 'Unassigned', c: tcCounts(cases.filter(tc => (tc.assignee || '') === a)) }))
    .sort((a, b) => b.c.total - a.c.total).slice(0, 6);

  const moduleRows = [...mods.map(m => ({ id: m.id, name: m.name, cases: cases.filter(tc => tc.moduleId === m.id) })),
    { id: '', name: 'No module', cases: cases.filter(tc => !tc.moduleId || !mods.some(m => m.id === tc.moduleId)) }]
    .filter(r => r.id || r.cases.length);
  const failures = cases.filter(tc => tc.status === 'Failed' || tc.status === 'Blocked')
    .sort((a, b) => (b.executionDate || '').localeCompare(a.executionDate || '') || (a.severity || 'S9').localeCompare(b.severity || 'S9'));
  const modName = (id) => (mods.find(m => m.id === id) || {}).name || 'No module';

  return `
    <div class="tc-page">
      ${head}
      <div class="po-stats tco-kpis">
        ${kpi(c.total, 'Test cases')}
        ${kpi(c.passed, 'Passed', 'tone-done')}
        ${kpi(c.failed, 'Failed', 'tone-fail')}
        ${kpi(c.blocked, 'Blocked', 'tone-hold')}
        ${kpi(c.untested, 'Untested', 'tone-todo')}
        ${kpi(`${c.rate}%`, 'Pass rate', 'tone-done')}
        ${kpi(`${c.total ? Math.round(c.automated / c.total * 100) : 0}%`, 'Automated', 'tone-team')}
      </div>

      <div class="tco-grid">
        <div class="tco-card tco-status">
          <h3 class="tco-card-title">Results</h3>
          <div class="tco-status-body">
            ${tcDonut(c)}
            <div class="tco-legend">
              ${[['pass', 'Passed', c.passed], ['fail', 'Failed', c.failed], ['blocked', 'Blocked', c.blocked], ['notrun', 'Untested', c.untested]].map(([k, l, n]) => `
                <div class="tco-legend-row"><i class="dbx-dot ${k}"></i><span>${l}</span><strong>${n}</strong><em>${c.total ? Math.round(n / c.total * 100) : 0}%</em></div>`).join('')}
            </div>
          </div>
        </div>
        ${breakdown('By priority', by('priority', ['Critical', 'High', 'Medium', 'Low']))}
        ${breakdown('By type', by('type', ['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression']))}
        ${breakdown('By assignee', assigneeGroups)}
      </div>

      <section class="tco-card">
        <div class="tco-card-head">
          <h3 class="tco-card-title">Modules <span class="rpa-group-count">${mods.length}</span></h3>
          <button type="button" class="btn-ghost st-btn" id="openAddModuleModalBtn">${TC_I.plus}Add Module</button>
        </div>
        <div class="tco-mod-table">
          <div class="tco-mod-row tco-mod-headrow"><span>Module</span><span>Results</span><span>Pass</span><span>Failed</span><span>Cases</span><span></span></div>
          ${moduleRows.map(r => {
            const mc = tcCounts(r.cases);
            return `
              <div class="tco-mod-row">
                <button type="button" class="tco-mod-name" data-action="tc-open-module" data-id="${r.id || 'none'}" title="View scenarios in ${escapeHtml(r.name)}">${TC_I.folder}<span>${escapeHtml(r.name)}</span></button>
                ${tcBar(mc, 'slim')}
                <span class="dbx-tc-rate ${tcRateCls(mc.rate, mc.total)}">${mc.total ? mc.rate + '%' : '—'}</span>
                <span>${mc.failed ? `<span class="dbx-tag danger">${mc.failed} failed</span>` : ''}</span>
                <span class="tco-mod-n">${mc.total}</span>
                <span class="tco-mod-actions">
                  ${r.id ? `
                    <button class="icon-btn" data-action="edit-module" data-id="${r.id}" aria-label="Rename module" title="Rename module">${TC_I.edit}</button>
                    <button class="icon-btn danger" data-action="delete-module" data-id="${r.id}" aria-label="Delete module" title="Delete module">${TC_I.trash}</button>` : ''}
                </span>
              </div>`;
          }).join('') || '<div class="dbx-empty">No modules yet. Group related scenarios with “Add Module”.</div>'}
        </div>
      </section>

      <section class="tco-card">
        <div class="tco-card-head">
          <h3 class="tco-card-title">Open failures <span class="rpa-group-count">${failures.length}</span></h3>
          ${failures.length ? `<button type="button" class="btn-ghost st-btn" data-action="tc-open-failures">View all in scenarios${TC_I.arrow}</button>` : ''}
        </div>
        ${failures.length ? `<div class="tco-fail-list">
          ${failures.slice(0, 8).map(tc => `
            <button type="button" class="tco-fail" data-action="view-testcase" data-id="${escapeHtml(tc.id)}">
              <span class="tco-fail-id">${escapeHtml(tc.id)}</span>
              <span class="tco-fail-main">
                <span class="tco-fail-title">${escapeHtml(tc.scenario || tc.title || '')}</span>
                <span class="tco-fail-sub">${escapeHtml([modName(tc.moduleId), tc.assignee, tc.defectId ? `Defect ${tcDefectLabel(tc.defectId)}` : ''].filter(Boolean).join(' · '))}</span>
              </span>
              <span class="tcs-pill ${(tc.status || '').toLowerCase()}">${escapeHtml(tc.status)}</span>
              ${tc.severity ? `<span class="tco-sev">${escapeHtml(tc.severity.split(' ')[0])}</span>` : ''}
            </button>`).join('')}
        </div>` : `<div class="dbx-empty">Nothing failing or blocked. 🎉</div>`}
      </section>
    </div>`;
};

// ── Level 3: test scenarios ──
const renderTcScenarioRow = (tc, index, projModules) => {
  const id = escapeHtml(tc.id);
  const open = state.tcExpanded && state.tcExpanded.has(tc.id);
  const checked = state.selectedTestCaseIds && state.selectedTestCaseIds.has(tc.id);
  const st = (tc.status || 'Untested').toLowerCase();
  const sel = (field, options, value, cls = '') => `
    <select class="table-inline-select tcs-select ${cls}" data-field="${field}" data-id="${id}" aria-label="${field}">
      ${options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${value === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
    </select>`;
  const area = (field, label, rows = 3) => `
    <label class="tcs-field"><span>${label}</span><textarea class="table-inline-textarea" data-field="${field}" data-id="${id}" rows="${rows}">${escapeHtml(field === 'scenario' ? (tc.scenario || tc.title || '') : (tc[field] || ''))}</textarea></label>`;
  const modName = (projModules.find(m => m.id === tc.moduleId) || {}).name || 'No module';
  return `
    <tr class="tcs-row ${open ? 'open' : ''} ${checked ? 'selected' : ''} st-${st}" data-id="${id}">
      <td class="tcs-c-check"><input type="checkbox" class="testcase-select-checkbox" data-id="${id}" ${checked ? 'checked' : ''} aria-label="Select ${id}" /></td>
      <td class="tcs-c-id"><span class="tcs-id" title="Row ${index + 1}">${id}</span></td>
      <td class="tcs-c-scn">
        <button type="button" class="tcs-toggle" data-action="tc-row-toggle" data-id="${id}" aria-expanded="${open}" title="${open ? 'Hide' : 'Show'} details">
          <span class="tcs-chev">${TC_I.chev}</span>
          <span class="tcs-scn">
            <span class="tcs-scn-title">${escapeHtml(tc.scenario || tc.title || 'Untitled scenario')}</span>
            <span class="tcs-scn-sub"><span class="tcs-scn-mod">${escapeHtml(modName)}</span>${tc.simplifiedScenario ? ` · ${escapeHtml(tc.simplifiedScenario)}` : ''}</span>
          </span>
        </button>
      </td>
      <td class="tcs-c-st">${sel('status', TC_STATUSES.map(s => [s, s]), tc.status || 'Untested', `tcs-pill ${st}`)}</td>
      <td class="tcs-c-pr">${sel('priority', [['Critical', 'Critical'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']], tc.priority || 'Medium', `tcs-prio ${(tc.priority || 'medium').toLowerCase()}`)}</td>
      <td class="tcs-c-as">${sel('assignee', [['', 'Unassigned'], ...state.developers.map(d => [d.name, d.name])], tc.assignee || '')}</td>
      <td class="tcs-c-dt"><input type="date" class="table-inline-input tcs-date" data-field="executionDate" data-id="${id}" value="${/^\d{4}-\d{2}-\d{2}$/.test(tc.executionDate || '') ? escapeHtml(tc.executionDate) : ''}" aria-label="Execution date" /></td>
      <td class="tcs-c-act">
        <button class="icon-btn" data-action="view-testcase" data-id="${id}" aria-label="Open details" title="Open details">${TC_I.eye}</button>
        <button class="icon-btn danger" data-action="delete-testcase" data-id="${id}" aria-label="Delete test case" title="Delete">${TC_I.trash}</button>
      </td>
    </tr>
    ${open ? `
      <tr class="tcs-detail" data-id="${id}">
        <td colspan="8">
          <div class="tcs-detail-props">
            <label class="tcs-field"><span>Module</span>${sel('moduleId', [['', '— None —'], ...projModules.map(m => [m.id, m.name])], tc.moduleId || '', 'tcs-boxed')}</label>
            <label class="tcs-field"><span>Severity</span>${sel('severity', [['S1 - Blocker', 'S1 – Blocker'], ['S2 - Critical', 'S2 – Critical'], ['S3 - Major', 'S3 – Major'], ['S4 - Minor', 'S4 – Minor']], tc.severity || 'S3 - Major', 'tcs-boxed')}</label>
            <label class="tcs-field"><span>Type</span>${sel('type', ['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression'].map(t => [t, t]), tc.type || 'Manual', 'tcs-boxed')}</label>
            <label class="tcs-field"><span>Defect ID</span><input type="text" class="table-inline-input" data-field="defectId" data-id="${id}" value="${escapeHtml(tc.defectId || '')}" placeholder="e.g. CIMTRACK-812" /></label>
          </div>
          <div class="tcs-detail-grid">
            ${area('scenario', 'Scenario', 2)}
            ${area('simplifiedScenario', 'Simplified scenario', 2)}
            ${area('description', 'Description')}
            ${area('steps', 'Steps', 4)}
            ${area('expected', 'Expected result')}
            ${area('actual', 'Actual result')}
            ${area('comments', 'Comments', 2)}
          </div>
          <div class="tcs-detail-foot">Changes save automatically · Updated ${timeAgo(tc.updatedAt || tc.createdAt || new Date().toISOString())}</div>
        </td>
      </tr>` : ''}`;
};

const renderTcScenarios = (proj) => {
  const projectCases = state.testCases.filter(tc => tc.projectId === proj.id);
  const mods = state.modules.filter(m => m.projectId === proj.id);
  const modCount = (id) => projectCases.filter(tc => tc.moduleId === id).length;
  const noneCount = projectCases.filter(tc => !tc.moduleId || !mods.some(m => m.id === tc.moduleId)).length;
  if (!state.tcExpanded) state.tcExpanded = new Set();

  // Module, search and dropdown filters (same fields as before).
  let list = projectCases;
  const mid = state.activeTestCaseModuleId;
  if (mid === '__none__') list = list.filter(tc => !tc.moduleId || !mods.some(m => m.id === tc.moduleId));
  else if (mid) list = list.filter(tc => tc.moduleId === mid);
  const moduleScoped = list;
  const q = (state.testCaseSearch || '').toLowerCase();
  if (q) {
    list = list.filter(tc => ['id', 'scenario', 'title', 'simplifiedScenario', 'description', 'steps', 'expected', 'actual', 'assignee', 'defectId', 'comments']
      .some(f => String(tc[f] || '').toLowerCase().includes(q)));
  }
  const f = state.testCaseFilters;
  const searchScoped = list;
  if (f.status) list = list.filter(tc => (TC_STATUSES.includes(tc.status) ? tc.status : 'Untested') === f.status);
  if (f.priority) list = list.filter(tc => tc.priority === f.priority);
  if (f.type) list = list.filter(tc => tc.type === f.type);
  state.lastFilteredCases = list;

  // Pagination (same state as before).
  const pageAll = state.testCasePageSize === 'all';
  const pageSize = pageAll ? Math.max(list.length, 1) : state.testCasePageSize;
  const totalPages = pageAll ? 1 : Math.max(1, Math.ceil(list.length / pageSize));
  if (state.testCasePage > totalPages) state.testCasePage = totalPages;
  if (state.testCasePage < 1) state.testCasePage = 1;
  const start = pageAll ? 0 : (state.testCasePage - 1) * pageSize;
  const end = pageAll ? list.length : Math.min(start + pageSize, list.length);
  const paged = list.slice(start, end);

  const statusChipCounts = tcCounts(searchScoped.filter(tc => (!f.priority || tc.priority === f.priority) && (!f.type || tc.type === f.type)));
  const chips = [['', 'All', statusChipCounts.total], ['Passed', 'Passed', statusChipCounts.passed], ['Failed', 'Failed', statusChipCounts.failed], ['Blocked', 'Blocked', statusChipCounts.blocked], ['Untested', 'Untested', statusChipCounts.untested]];
  const selectedCount = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  const filtersActive = !!(q || f.status || f.priority || f.type);
  const activeModName = mid === '__none__' ? 'No module' : mid ? ((mods.find(m => m.id === mid) || {}).name || 'Module') : 'All cases';

  const modItem = (idAttr, name, n, active, actions = '') => `
    <div class="module-item tcs-mod ${active ? 'active' : ''}" data-module-id="${idAttr}" role="button" tabindex="0">
      <span class="tcs-mod-name" title="${escapeHtml(name)}">${TC_I.folder}<span>${escapeHtml(name)}</span></span>
      <span class="tcs-mod-n">${n}</span>
      ${actions}
    </div>`;
  const pageSizeOptions = [5, 10, 25, 50, 100, 150].map(n => `<option value="${n}" ${state.testCasePageSize === n ? 'selected' : ''}>${n}</option>`).join('') + `<option value="all" ${pageAll ? 'selected' : ''}>All</option>`;

  return `
    <div class="tc-page">
      ${tcCrumbs([{ label: 'Test Cases', action: 'tc-home' }, { label: escapeHtml(proj.name), action: 'tc-overview' }, { label: 'Test scenarios' }])}
      <section class="tco-head">
        <div class="tco-head-main">
          <h2>Test scenarios</h2>
          <p>${escapeHtml(proj.name)} · ${projectCases.length} test case${projectCases.length === 1 ? '' : 's'}</p>
        </div>
        <div class="tco-head-actions">
          <button type="button" class="btn-ghost st-btn" id="openExcelImportModalBtn">${TC_I.upload}Import Excel</button>
          <button type="button" class="btn-ghost st-btn" id="openBulkUpdateModalBtn">${TC_I.edit}Bulk Update</button>
          <button type="button" class="btn-primary st-btn" data-action="tc-add-case">${TC_I.plus}Add Test Case</button>
        </div>
      </section>

      <div class="tcs-layout">
        <aside class="tcs-rail" aria-label="Modules">
          <div class="tcs-rail-head"><span>Modules</span><button type="button" class="tcs-rail-add" id="openAddModuleModalBtn" title="Add module" aria-label="Add module">${TC_I.plus}</button></div>
          ${modItem('root', 'All cases', projectCases.length, !mid)}
          ${mods.map(m => modItem(m.id, m.name, modCount(m.id), mid === m.id, `
            <span class="module-item-actions tcs-mod-actions">
              <button class="module-item-btn" data-action="edit-module" data-id="${m.id}" aria-label="Rename module" title="Rename">${TC_I.edit}</button>
              <button class="module-item-btn danger" data-action="delete-module" data-id="${m.id}" aria-label="Delete module" title="Delete">${TC_I.trash}</button>
            </span>`)).join('')}
          ${noneCount ? modItem('__none__', 'No module', noneCount, mid === '__none__') : ''}
        </aside>

        <div class="tcs-main">
          <div class="tcs-toolbar">
            <div class="page-search-wrap tcs-search">
              <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" class="page-search-input" id="testCaseSearchInput" placeholder="Search ID, scenario, steps, defect…" value="${escapeHtml(state.testCaseSearch || '')}" />
              ${state.testCaseSearch ? `<button class="page-search-clear" id="clearTestCaseSearch" aria-label="Clear search">✕</button>` : ''}
            </div>
            <select class="filter-select" id="filterTCPriority" data-tcfilter="priority" aria-label="Priority">
              <option value="">All priorities</option>
              ${['Critical', 'High', 'Medium', 'Low'].map(v => `<option value="${v}" ${f.priority === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <select class="filter-select" id="filterTCType" data-tcfilter="type" aria-label="Type">
              <option value="">All types</option>
              ${['Manual', 'Automated', 'API', 'Security', 'Performance', 'Regression'].map(v => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <button class="btn-ghost rpa-tool-btn ${state.testCaseSelectionMode ? 'tcs-on' : ''}" id="toggleTestCaseSelectionModeBtn">${state.testCaseSelectionMode ? 'Cancel selection' : 'Select cases'}</button>
            ${filtersActive ? `<button class="btn-ghost rpa-tool-btn" id="clearTestCaseFilters">Clear filters</button>` : ''}
          </div>
          <div class="tcs-chips" role="toolbar" aria-label="Filter by status">
            ${chips.map(([v, l, n]) => `<button type="button" class="rpa-chip tcs-chip ${v ? v.toLowerCase() : 'all'} ${(f.status || '') === v ? 'active' : ''}" data-action="tc-status-chip" data-status="${v}">${l} <span>${n}</span></button>`).join('')}
            <span class="tcs-scope">${escapeHtml(activeModName)} · showing ${list.length} of ${moduleScoped.length}</span>
          </div>

          ${state.testCaseSelectionMode ? `
            <div class="tcs-selbar">
              <strong>${selectedCount} selected</strong>
              <button class="btn-ghost rpa-tool-btn" id="selectAllTestCasesBtn">Select all ${list.length}</button>
              <button class="btn-ghost rpa-tool-btn" id="clearTestCaseSelectionBtn" ${selectedCount ? '' : 'disabled'}>Clear</button>
              <button class="btn-danger st-btn" id="bulkDeleteTestCasesBtn" ${selectedCount ? '' : 'disabled'}>${TC_I.trash}Delete selected</button>
              <button class="btn-ghost rpa-tool-btn" id="cancelTestCaseSelectionBtn">Done</button>
            </div>` : ''}

          <div class="tcs-table-wrap" id="testCasesContainer">
            <table class="tcs-table">
              <thead>
                <tr>
                  <th class="tcs-c-check"><input type="checkbox" id="selectAllTcCb" aria-label="Select all filtered" ${selectedCount > 0 && list.length && list.every(tc => state.selectedTestCaseIds.has(tc.id)) ? 'checked' : ''} /></th>
                  <th>ID</th><th>Scenario</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Executed</th><th></th>
                </tr>
              </thead>
              <tbody id="testCasesTableBody">
                ${paged.map((tc, i) => renderTcScenarioRow(tc, start + i, mods)).join('') || `
                  <tr><td colspan="8"><div class="dbx-empty tcs-noresults">${filtersActive ? 'No test cases match these filters.' : 'No test cases in this module yet.'}</div></td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="tc-pagination-bar">
            <div class="tc-pagination-size"><label for="tcPageSizeSelect">Rows per page</label><select class="filter-select" id="tcPageSizeSelect">${pageSizeOptions}</select></div>
            <div class="tc-pagination-info">${list.length ? `Showing ${start + 1}–${end} of ${list.length}` : 'No results'}</div>
            <div class="tc-pagination-nav">
              <button class="btn-ghost" id="tcPrevPageBtn" ${state.testCasePage <= 1 ? 'disabled' : ''}>‹ Prev</button>
              <span class="tc-pagination-page">Page ${state.testCasePage} of ${totalPages}</span>
              <button class="btn-ghost" id="tcNextPageBtn" ${state.testCasePage >= totalPages ? 'disabled' : ''}>Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
};

const renderTestCaseManagement = () => {
  if (state.projects.length === 0) {
    return emptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
      'No projects found',
      'You need to create a project first before creating modules or test cases.',
      '<button class="btn-primary" data-action="new-project" style="margin-top: 12px;">Create Project</button>'
    );
  }
  // A previously-selected project may have been deleted since; fall back to home.
  const proj = state.activeTestCaseProjectId ? state.projects.find(p => p.id === state.activeTestCaseProjectId) : null;
  if (!proj) { state.activeTestCaseProjectId = null; return renderTcHome(); }
  return state.tcPage === 'scenarios' ? renderTcScenarios(proj) : renderTcOverview(proj);
};

// Navigation within Test Case Management.
const tcGo = (projectId, page = 'overview', moduleId = null) => {
  if (projectId !== state.activeTestCaseProjectId) {
    if (state.selectedTestCaseIds) state.selectedTestCaseIds.clear();
    state.testCaseSelectionMode = false;
    state.testCaseSearch = '';
    state.testCaseFilters = { status: '', priority: '', type: '' };
  }
  state.activeTestCaseProjectId = projectId || null;
  state.tcPage = page;
  state.activeTestCaseModuleId = moduleId;
  state.testCasePage = 1;
  if (state.view !== 'testcases') setView('testcases'); else render();
  const ct = document.getElementById('mainContent');
  if (ct) ct.scrollTo({ top: 0, behavior: 'instant' });
};

// ─── Test Case Management Dropdown Helpers ───────────────────
const updateTestCaseModuleDropdown = (projectId, selectedModuleValue = '') => {
  const modSel = document.getElementById('testCaseModule');
  if (!modSel) return;
  if (!projectId) {
    modSel.innerHTML = `<option value="">— None —</option>`;
    return;
  }
  const projModules = state.modules.filter(m => m.projectId === projectId);
  modSel.innerHTML = `<option value="">— None (Directly in Project) —</option>` +
    projModules.map(m => `<option value="${m.id}" ${selectedModuleValue === m.id ? 'selected' : ''}>${m.name}</option>`).join('');
};

// ─── Test Case Actions ───────────────────────────────────────
const openTestCaseModal = (id = null) => {
  const modal = document.getElementById('testCaseModal');
  const title = document.getElementById('testCaseModalTitle');

  // Reset tab states to first tab
  modal.querySelectorAll('.modal-tab').forEach((tab, idx) => {
    tab.classList.toggle('active', idx === 0);
  });
  modal.querySelectorAll('.modal-tab-content').forEach((content, idx) => {
    content.classList.toggle('active', idx === 0);
  });

  // Populate projects dropdown
  const projSel = document.getElementById('testCaseProject');
  projSel.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  // Populate assignees dropdown
  const assigneeSel = document.getElementById('testCaseAssignee');
  assigneeSel.innerHTML = `<option value="">— Unassigned —</option>` +
    state.developers.map(d => `<option value="${d.name}">${d.name}</option>`).join('');

  if (id) {
    const tc = state.testCases.find(x => x.id === id);
    if (!tc) return;
    title.textContent = 'Edit Test Case';
    document.getElementById('testCaseId').value = tc.id;
    document.getElementById('testCaseScenario').value = tc.scenario || tc.title || '';
    document.getElementById('testCaseSimplifiedScenario').value = tc.simplifiedScenario || '';
    document.getElementById('testCaseDesc').value = tc.description || '';
    document.getElementById('testCaseSteps').value = tc.steps || '';
    document.getElementById('testCaseExpected').value = tc.expected || '';
    document.getElementById('testCaseActual').value = tc.actual || '';

    projSel.value = tc.projectId;
    updateTestCaseModuleDropdown(tc.projectId, tc.moduleId || '');

    document.getElementById('testCaseCustomId').value = tc.id;
    document.getElementById('testCasePriority').value = tc.priority;
    document.getElementById('testCaseSeverity').value = tc.severity || 'S3 - Major';
    document.getElementById('testCaseType').value = tc.type || 'Manual';
    document.getElementById('testCaseStatus').value = tc.status || 'Untested';
    document.getElementById('testCaseAssignee').value = tc.assignee || '';
    document.getElementById('testCaseExecutionDate').value = tc.executionDate || '';
    document.getElementById('testCaseDefectId').value = tc.defectId || '';
    document.getElementById('testCaseComments').value = tc.comments || '';
  } else {
    title.textContent = 'New Test Case';
    document.getElementById('testCaseId').value = '';
    document.getElementById('testCaseScenario').value = '';
    document.getElementById('testCaseSimplifiedScenario').value = '';
    document.getElementById('testCaseDesc').value = '';
    document.getElementById('testCaseSteps').value = '';
    document.getElementById('testCaseExpected').value = '';
    document.getElementById('testCaseActual').value = '';

    // Default to active tab project
    projSel.value = state.activeTestCaseProjectId || (state.projects[0] ? state.projects[0].id : '');
    updateTestCaseModuleDropdown(projSel.value, state.activeTestCaseModuleId || '');

    document.getElementById('testCaseCustomId').value = '';
    document.getElementById('testCasePriority').value = 'High';
    document.getElementById('testCaseSeverity').value = 'S3 - Major';
    document.getElementById('testCaseType').value = 'Manual';
    document.getElementById('testCaseStatus').value = 'Untested';
    document.getElementById('testCaseAssignee').value = '';
    document.getElementById('testCaseExecutionDate').value = '';
    document.getElementById('testCaseDefectId').value = '';
    document.getElementById('testCaseComments').value = '';
  }

  showModal('testCaseModal');
};

const saveTestCase = async () => {
  const id = document.getElementById('testCaseId').value;
  const scenario = document.getElementById('testCaseScenario').value.trim();
  const simplifiedScenario = document.getElementById('testCaseSimplifiedScenario').value.trim();
  const description = document.getElementById('testCaseDesc').value.trim();
  const steps = document.getElementById('testCaseSteps').value.trim();
  const expected = document.getElementById('testCaseExpected').value.trim();
  const actual = document.getElementById('testCaseActual').value.trim();
  const projectId = document.getElementById('testCaseProject').value;
  const moduleId = document.getElementById('testCaseModule').value;
  const customId = document.getElementById('testCaseCustomId').value.trim();
  const priority = document.getElementById('testCasePriority').value;
  const severity = document.getElementById('testCaseSeverity').value;
  const type = document.getElementById('testCaseType').value;
  const status = document.getElementById('testCaseStatus').value;
  const assignee = document.getElementById('testCaseAssignee').value;
  const executionDate = document.getElementById('testCaseExecutionDate').value;
  const defectId = document.getElementById('testCaseDefectId').value.trim();
  const comments = document.getElementById('testCaseComments').value.trim();

  if (!scenario) { showToast('Test scenario is required', 'error'); return; }
  if (!steps) { showToast('Steps are required', 'error'); return; }
  if (!expected) { showToast('Expected result is required', 'error'); return; }
  if (!projectId) { showToast('Project selection is required', 'error'); return; }

  const now = new Date().toISOString();

  if (id) {
    const idx = state.testCases.findIndex(tc => tc.id === id);
    if (idx === -1) return;

    let finalId = id;
    if (customId && customId !== id) {
      const conflict = state.testCases.find(tc => tc.id === customId);
      if (conflict) {
        showToast(`Test Case ID "${customId}" already exists`, 'error');
        return;
      }
      finalId = customId;
    }

    state.testCases[idx] = {
      ...state.testCases[idx],
      id: finalId,
      title: scenario,
      scenario,
      simplifiedScenario,
      description,
      steps,
      expected,
      actual,
      projectId,
      moduleId,
      priority,
      severity,
      type,
      status,
      assignee,
      executionDate,
      defectId,
      comments,
      updatedAt: now
    };
    logActivity(`Updated test case "${finalId}"`, 'task');
    showToast('Test case updated');
  } else {
    let finalId = customId;
    if (!finalId) {
      const lastIdNum = state.testCases.reduce((max, tc) => {
        const match = tc.id.match(/^TC-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, 100);
      finalId = `TC-${lastIdNum + 1}`;
    } else {
      const conflict = state.testCases.find(tc => tc.id === finalId);
      if (conflict) {
        showToast(`Test Case ID "${finalId}" already exists`, 'error');
        return;
      }
    }

    state.testCases.push({
      id: finalId,
      title: scenario,
      scenario,
      simplifiedScenario,
      description,
      steps,
      expected,
      actual,
      projectId,
      moduleId,
      priority,
      severity,
      type,
      status,
      assignee,
      executionDate,
      defectId,
      comments,
      createdAt: now,
      updatedAt: now
    });
    logActivity(`Created test case "${finalId}"`, 'task');
    showToast('Test case created');
  }

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteTestCase = (id) => {
  const tc = state.testCases.find(x => x.id === id);
  if (!tc) return;
  document.getElementById('confirmMessage').textContent =
    `Delete test case "${tc.id}: ${tc.scenario || tc.title}"? This action cannot be undone.`;
  confirmCallback = () => deleteTestCase(id);
  showModal('confirmModal');
};

const deleteTestCase = async (id) => {
  state.testCases = state.testCases.filter(x => x.id !== id);
  logActivity(`Deleted test case "${id}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Test case deleted');
};

// ─── Module Actions ──────────────────────────────────────────
const openModuleModal = (id = null) => {
  const modal = document.getElementById('moduleModal');
  const title = document.getElementById('moduleModalTitle');

  // Populate projects
  const projSel = document.getElementById('moduleProject');
  projSel.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  if (id) {
    const m = state.modules.find(x => x.id === id);
    if (!m) return;
    title.textContent = 'Edit Module';
    document.getElementById('moduleId').value = m.id;
    document.getElementById('moduleName').value = m.name;
    projSel.value = m.projectId;
    document.getElementById('moduleDesc').value = m.description || '';
  } else {
    title.textContent = 'New Module';
    document.getElementById('moduleId').value = '';
    document.getElementById('moduleName').value = '';
    projSel.value = state.activeTestCaseProjectId || (state.projects[0] ? state.projects[0].id : '');
    document.getElementById('moduleDesc').value = '';
  }

  showModal('moduleModal');
};

const saveModule = async () => {
  const id = document.getElementById('moduleId').value;
  const name = document.getElementById('moduleName').value.trim();
  const projectId = document.getElementById('moduleProject').value;
  const description = document.getElementById('moduleDesc').value.trim();

  if (!name) { showToast('Module name is required', 'error'); return; }
  if (!projectId) { showToast('Project is required', 'error'); return; }

  if (id) {
    const idx = state.modules.findIndex(m => m.id === id);
    if (idx === -1) return;
    state.modules[idx] = {
      ...state.modules[idx],
      name, projectId, description
    };
    logActivity(`Updated module "${name}"`, 'project');
    showToast('Module updated');
  } else {
    state.modules.push({
      id: 'mod-' + uid(),
      projectId, name, description
    });
    logActivity(`Created module "${name}"`, 'project');
    showToast('Module created');
  }

  await storage.save();
  closeModals();
  render();
};

const confirmDeleteModule = (id) => {
  const m = state.modules.find(x => x.id === id);
  if (!m) return;
  document.getElementById('confirmMessage').textContent =
    `Delete module "${m.name}"? Test cases within this module will not be deleted; they will be moved to the project root level.`;
  confirmCallback = () => deleteModule(id);
  showModal('confirmModal');
};

const deleteModule = async (id) => {
  const m = state.modules.find(x => x.id === id);
  if (!m) return;

  // Detach test cases from module
  state.testCases.forEach(tc => {
    if (tc.moduleId === id) {
      tc.moduleId = '';
    }
  });

  state.modules = state.modules.filter(x => x.id !== id);
  logActivity(`Deleted module "${m.name}"`, 'delete');

  if (state.activeTestCaseModuleId === id) {
    state.activeTestCaseModuleId = null;
  }

  await storage.save();
  closeModals();
  render();
  showToast('Module deleted');
};

// ─── Excel Import Simulator ──────────────────────────────────
const openExcelImportModal = () => {
  const modal = document.getElementById('excelImportModal');

  // Populate target project dropdown
  const projSel = document.getElementById('excelImportProject');
  projSel.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  projSel.value = state.activeTestCaseProjectId || (state.projects[0] ? state.projects[0].id : '');

  // Populate target module dropdown based on selected project
  updateExcelImportModuleDropdown(projSel.value);

  // Set project change listener in import modal
  projSel.onchange = (e) => {
    updateExcelImportModuleDropdown(e.target.value);
    renderImportPreview();
  };

  // Set module change listener in import modal
  const modSel = document.getElementById('excelImportModule');
  if (modSel) {
    modSel.onchange = () => {
      renderImportPreview();
    };
  }

  // Reset file input and preview styles
  document.getElementById('excelFileInput').value = '';
  document.getElementById('excelPreviewSection').style.display = 'none';
  document.getElementById('excelLoadingSection').style.display = 'none';
  document.getElementById('saveExcelImport').style.display = 'none';
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  if (replaceDupesCheckbox) replaceDupesCheckbox.checked = false;

  const dupesSec = document.getElementById('excelImportDuplicatesSection');
  if (dupesSec) dupesSec.style.display = 'none';

  const dropzone = document.getElementById('excelDropzone');
  dropzone.style.display = 'flex';

  showModal('excelImportModal');
};

const updateExcelImportModuleDropdown = (projectId) => {
  const modSel = document.getElementById('excelImportModule');
  if (!modSel) return;
  const projModules = state.modules.filter(m => m.projectId === projectId);
  modSel.innerHTML = `<option value="">-- Let Excel determine module --</option>` +
    `<option value="root_only">-- Root Level (No Module) --</option>` +
    projModules.map(m => `<option value="${m.id}">Into module: ${m.name}</option>`).join('');
};

let pendingImportData = null;

const parseCSVText = (text, delimiter = ',') => {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter) {
      if (insideQuote) {
        row[row.length - 1] += delimiter;
      } else {
        row.push("");
      }
    } else if (char === '\r' || char === '\n') {
      if (insideQuote) {
        row[row.length - 1] += char;
      } else {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      }
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }

  return lines.filter(r => r.some(cell => cell.trim() !== ""));
};

const mapHeaders = (headers) => {
  const mapping = {};
  const addMapping = (key, index) => {
    if (!mapping[key]) {
      mapping[key] = [];
    }
    mapping[key].push(index);
  };

  headers.forEach((h, index) => {
    const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. TestCase ID
    if (clean === 'testcaseid' || clean === 'id' || clean === 'tcid' || clean.includes('srno') || clean === 'no' || clean === 'testcasesrno' || clean === 'sr') {
      addMapping('id', index);
    }
    // 2. Test Type
    else if (clean.includes('testtype') || clean === 'type') {
      addMapping('type', index);
    }
    // 3. Simplified Test Scenario — must be checked before the generic
    // "scenario" rule below, since "simplifiedscenario" also contains the
    // substring "scenario" and would otherwise be swallowed by it.
    else if (clean === 'simplifiedtestscenario' || clean === 'simplifiedscenario') {
      addMapping('simplifiedScenario', index);
    }
    // 4. Test Scenario & Description
    else if (clean === 'testscenario' || clean === 'scenario' || clean === 'title' || clean === 'name' || clean.includes('description') || clean.includes('scenario')) {
      addMapping('scenario', index);
      if (clean.includes('description') || clean === 'desc') {
        addMapping('description', index);
      }
    }
    else if (clean.includes('description') || clean === 'desc') {
      addMapping('description', index);
      addMapping('scenario', index); // fallback
    }
    // 5. Test Steps
    else if (clean === 'teststeps' || clean === 'steps') {
      addMapping('steps', index);
    }
    // 6. Expected Result
    else if (clean.includes('expected') || clean.includes('validationpoint')) {
      addMapping('expected', index);
    }
    // 7. Actual Result
    else if (clean.includes('actual')) {
      addMapping('actual', index);
    }
    // 8. Priority
    else if (clean === 'priority') {
      addMapping('priority', index);
    }
    // 9. Severity
    else if (clean === 'severity') {
      addMapping('severity', index);
    }
    // 10. Status
    else if (clean.includes('status')) {
      addMapping('status', index);
    }
    // 11. Tested By
    else if (clean.includes('testedby') || clean.includes('tester') || clean === 'assignee') {
      addMapping('assignee', index);
    }
    // 12. Execution Date
    else if (clean.includes('testingdate') || clean === 'executiondate' || clean === 'date') {
      addMapping('executionDate', index);
    }
    // 13. Defect ID
    else if (clean.includes('defectid') || clean.includes('bugid') || clean.includes('bugno') || clean === 'defect') {
      addMapping('defectId', index);
    }
    // 14. Comments
    else if (clean.includes('comment') || clean === 'comments' || clean === 'notes' || clean === 'runnotes') {
      addMapping('comments', index);
    }
    // 15. Module
    else if (clean.includes('module') || clean.includes('folder') || clean.includes('component') || clean.includes('functionality')) {
      addMapping('module', index);
    }
  });

  return mapping;
};

const normalizePriority = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.includes('critical')) return 'Critical';
  if (clean.includes('high')) return 'High';
  if (clean.includes('low')) return 'Low';
  if (clean.includes('medium')) return 'Medium';
  return 'Medium'; // default
};

const normalizeSeverity = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.includes('s1') || clean.includes('blocker')) return 'S1 - Blocker';
  if (clean.includes('s2') || clean.includes('critical')) return 'S2 - Critical';
  if (clean.includes('s4') || clean.includes('minor')) return 'S4 - Minor';
  if (clean.includes('s3') || clean.includes('major')) return 'S3 - Major';
  return 'S3 - Major'; // default
};

const normalizeStatus = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.startsWith('pass')) return 'Passed';
  if (clean.startsWith('fail')) return 'Failed';
  if (clean.startsWith('block')) return 'Blocked';
  if (clean.startsWith('untest')) return 'Untested';
  return 'Untested'; // default
};

const normalizeType = (val) => {
  const clean = String(val || '').trim().toLowerCase();
  if (clean.includes('auto')) return 'Automated';
  if (clean.includes('api')) return 'API';
  if (clean.includes('security') || clean.includes('sec')) return 'Security';
  if (clean.includes('performance') || clean.includes('perf')) return 'Performance';
  if (clean.includes('regression') || clean.includes('reg')) return 'Regression';
  if (clean.includes('manual')) return 'Manual';
  return 'Manual'; // default
};

const parseAndFormatImportDate = (val) => {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      return val.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }
  const str = String(val).trim();
  if (!str) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return d.toISOString().split('T')[0];
    } catch (e) {
      return str;
    }
  }
  return str;
};

const hasDiff = (existing, row, activeMapping, projectId) => {
  const getVal = (key) => {
    const idxs = activeMapping[key];
    if (idxs === undefined) return "";
    if (Array.isArray(idxs)) {
      for (let i = idxs.length - 1; i >= 0; i--) {
        const val = String(row[idxs[i]] || '').trim();
        if (val !== "") return row[idxs[i]];
      }
      return row[idxs[0]] || "";
    }
    return (row[idxs] !== undefined) ? row[idxs] : "";
  };

  const getCleanStr = (key) => {
    const raw = getVal(key);
    return raw instanceof Date ? parseAndFormatImportDate(raw) : String(raw || '').trim();
  };

  for (const key in activeMapping) {
    if (activeMapping[key] === undefined) continue;

    if (key === 'scenario') {
      const val = getCleanStr('scenario');
      if ((existing.scenario || existing.title || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'simplifiedScenario') {
      const val = getCleanStr('simplifiedScenario');
      if ((existing.simplifiedScenario || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'steps') {
      const val = getCleanStr('steps');
      if ((existing.steps || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'expected') {
      const val = getCleanStr('expected');
      if ((existing.expected || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'actual') {
      const val = getCleanStr('actual');
      if ((existing.actual || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'priority') {
      const val = normalizePriority(getVal('priority'));
      if (existing.priority !== val) {
        return true;
      }
    }
    else if (key === 'severity') {
      const val = normalizeSeverity(getVal('severity'));
      if (existing.severity !== val) {
        return true;
      }
    }
    else if (key === 'status') {
      const val = normalizeStatus(getVal('status'));
      if (existing.status !== val) {
        return true;
      }
    }
    else if (key === 'type') {
      const val = normalizeType(getVal('type'));
      if (existing.type !== val) {
        return true;
      }
    }
    else if (key === 'assignee') {
      const val = getCleanStr('assignee');
      if ((existing.assignee || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'executionDate') {
      const val = parseAndFormatImportDate(getVal('executionDate'));
      if (existing.executionDate !== val) {
        return true;
      }
    }
    else if (key === 'defectId') {
      const val = getCleanStr('defectId');
      if ((existing.defectId || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'comments') {
      const val = getCleanStr('comments');
      if ((existing.comments || '').trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
    else if (key === 'module') {
      const val = getCleanStr('module');
      const existingModuleName = existing.moduleId ? (state.modules.find(m => m.id === existing.moduleId)?.name || '') : '';
      if (existingModuleName.trim().toLowerCase() !== val.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
};

const detectHeaderRowIndex = (rows) => {
  const maxSearchRows = Math.min(rows.length, 30);
  let bestRowIndex = 0;
  let maxMatchCount = 0;

  const standardTerms = new Set([
    'testcaseid', 'id', 'tcid', 'testcase',
    'testtype', 'type',
    'testscenario', 'scenario', 'title', 'name',
    'simplifiedtestscenario', 'simplifiedscenario',
    'teststeps', 'steps',
    'expectedresult', 'expected',
    'actualresult', 'actual',
    'priority',
    'severity',
    'status', 'runstatus',
    'testedby', 'assignee',
    'executiondate', 'date',
    'defectid', 'bugid', 'defect',
    'comments', 'notes', 'runnotes',
    'module', 'modulename', 'folder', 'component'
  ]);

  for (let i = 0; i < maxSearchRows; i++) {
    const row = rows[i];
    if (!row) continue;

    let matchCount = 0;
    row.forEach(cell => {
      const clean = String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean && standardTerms.has(clean)) {
        matchCount++;
      }
    });

    if (matchCount > maxMatchCount && matchCount >= 2) {
      maxMatchCount = matchCount;
      bestRowIndex = i;
    }
  }

  return { index: bestRowIndex, matchCount: maxMatchCount };
};

const processPendingImportFile = (file) => {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
  const reader = new FileReader();

  if (isExcel) {
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (typeof XLSX === 'undefined') {
          showToast('Excel parser library (SheetJS) is not loaded', 'error');
          return;
        }
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (rows.length < 2) {
          showToast('Spreadsheet has no data rows', 'error');
          return;
        }

        const headerDetection = detectHeaderRowIndex(rows);
        const headerIndex = headerDetection.matchCount >= 2 ? headerDetection.index : 0;

        if (rows.length <= headerIndex + 1) {
          showToast('Spreadsheet has no data rows', 'error');
          return;
        }

        // Detect if there's a double header (grouped header above)
        let isDoubleHeader = false;
        if (headerIndex > 0) {
          const parentRow = rows[headerIndex - 1];
          let nonEmptyCount = 0;
          parentRow.forEach(cell => {
            if (String(cell || '').trim() !== '') nonEmptyCount++;
          });
          if (nonEmptyCount >= 2) {
            isDoubleHeader = true;
          }
        }

        let headers = [];
        if (isDoubleHeader) {
          const parentRow = rows[headerIndex - 1];
          const childRow = rows[headerIndex];
          let currentParent = "";
          const maxLength = Math.max(parentRow.length, childRow.length);
          for (let j = 0; j < maxLength; j++) {
            const pCell = String(parentRow[j] || '').trim();
            if (pCell !== "") {
              currentParent = pCell;
            }
            const cCell = String(childRow[j] || '').trim();
            if (currentParent !== "") {
              if (cCell !== "") {
                headers.push(`${currentParent} ${cCell}`);
              } else {
                headers.push(currentParent);
              }
            } else {
              headers.push(cCell);
            }
          }
        } else {
          headers = rows[headerIndex].map(h => String(h || '').trim());
        }

        const dataRows = rows.slice(headerIndex + 1).map(r => r.map(cell => {
          if (cell instanceof Date) return cell;
          return String(cell !== undefined && cell !== null ? cell : '').trim();
        }));
        const mapping = mapHeaders(headers);

        pendingImportData = {
          filename: file.name,
          headers: headers,
          dataRows: dataRows,
          mapping: mapping
        };

        renderImportPreview();
      } catch (err) {
        console.error(err);
        showToast('Failed to parse Excel file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let delimiter = ',';
        const firstLine = text.split(/\r?\n/)[0];
        if (firstLine.includes(';') && !firstLine.includes(',')) {
          delimiter = ';';
        } else if (firstLine.includes('\t')) {
          delimiter = '\t';
        }

        const rows = parseCSVText(text, delimiter);
        if (rows.length < 2) {
          showToast('File has no data rows', 'error');
          return;
        }

        const headerDetection = detectHeaderRowIndex(rows);
        const headerIndex = headerDetection.matchCount >= 2 ? headerDetection.index : 0;

        if (rows.length <= headerIndex + 1) {
          showToast('File has no data rows', 'error');
          return;
        }

        // Detect if there's a double header (grouped header above)
        let isDoubleHeader = false;
        if (headerIndex > 0) {
          const parentRow = rows[headerIndex - 1];
          let nonEmptyCount = 0;
          parentRow.forEach(cell => {
            if (String(cell || '').trim() !== '') nonEmptyCount++;
          });
          if (nonEmptyCount >= 2) {
            isDoubleHeader = true;
          }
        }

        let headers = [];
        if (isDoubleHeader) {
          const parentRow = rows[headerIndex - 1];
          const childRow = rows[headerIndex];
          let currentParent = "";
          const maxLength = Math.max(parentRow.length, childRow.length);
          for (let j = 0; j < maxLength; j++) {
            const pCell = String(parentRow[j] || '').trim();
            if (pCell !== "") {
              currentParent = pCell;
            }
            const cCell = String(childRow[j] || '').trim();
            if (currentParent !== "") {
              if (cCell !== "") {
                headers.push(`${currentParent} ${cCell}`);
              } else {
                headers.push(currentParent);
              }
            } else {
              headers.push(cCell);
            }
          }
        } else {
          headers = rows[headerIndex].map(h => String(h || '').trim());
        }

        const dataRows = rows.slice(headerIndex + 1).map(r => r.map(cell => String(cell || '').trim()));
        const mapping = mapHeaders(headers);

        pendingImportData = {
          filename: file.name,
          headers: headers,
          dataRows: dataRows,
          mapping: mapping
        };

        renderImportPreview();
      } catch (err) {
        console.error(err);
        showToast('Failed to parse CSV file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }
};

const renderImportPreview = () => {
  const data = pendingImportData;
  if (!data) return;

  const dropzone = document.getElementById('excelDropzone');
  dropzone.style.display = 'none';

  const preview = document.getElementById('excelPreviewSection');
  const badge = document.getElementById('excelFileBadge');
  const saveBtn = document.getElementById('saveExcelImport');

  badge.textContent = data.filename;
  preview.style.display = 'block';
  saveBtn.style.display = 'inline-block';

  // Calculate stats (duplicates check)
  const projectId = document.getElementById('excelImportProject').value;
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  const replaceDupes = replaceDupesCheckbox ? replaceDupesCheckbox.checked : false;

  let newCount = 0;
  let dupCount = 0;
  const duplicateCases = [];
  const duplicateIds = new Set();

  const scenarioIdx = data.mapping.scenario;
  const idIdx = data.mapping.id;

  const seenIds = new Set();
  const seenScenarios = new Set();

  const modalModuleId = document.getElementById('excelImportModule').value;
  const tempModuleCache = {};

  data.dataRows.forEach(row => {
    const getVal = (key) => {
      const idxs = data.mapping[key];
      if (idxs === undefined) return "";
      if (Array.isArray(idxs)) {
        for (let i = idxs.length - 1; i >= 0; i--) {
          const val = String(row[idxs[i]] || '').trim();
          if (val !== "") return row[idxs[i]];
        }
        return row[idxs[0]] || "";
      }
      return (row[idxs] !== undefined) ? row[idxs] : "";
    };

    const scenarioRaw = getVal('scenario');
    const scenario = scenarioRaw instanceof Date ? parseAndFormatImportDate(scenarioRaw) : String(scenarioRaw).trim();
    if (!scenario) return;

    const customIdRaw = getVal('id');
    const customId = String(customIdRaw || '').trim();

    // Determine module FIRST
    let targetModuleId = '';
    if (modalModuleId === 'root_only') {
      targetModuleId = '';
    } else if (modalModuleId !== '') {
      targetModuleId = modalModuleId;
    } else {
      const csvModuleNameRaw = getVal('module');
      const csvModuleName = String(csvModuleNameRaw || '').trim();
      if (csvModuleName) {
        const cleanName = csvModuleName.toLowerCase();
        if (tempModuleCache[cleanName]) {
          targetModuleId = tempModuleCache[cleanName];
        } else {
          const existingMod = state.modules.find(m => m.projectId === projectId && m.name.toLowerCase() === cleanName);
          if (existingMod) {
            targetModuleId = existingMod.id;
            tempModuleCache[cleanName] = targetModuleId;
          } else {
            const tempId = 'temp-mod-' + cleanName;
            tempModuleCache[cleanName] = tempId;
            targetModuleId = tempId;
          }
        }
      } else {
        const defaultMod = state.modules.find(m => m.projectId === projectId);
        targetModuleId = defaultMod ? defaultMod.id : '';
      }
    }

    // Check if it matches an existing system test case IN THE SAME TARGET MODULE
    let existing = null;
    if (customId) {
      existing = state.testCases.find(tc => tc.projectId === projectId && tc.moduleId === targetModuleId && tc.id.toLowerCase() === customId.toLowerCase());
    }
    if (!existing && scenario) {
      existing = state.testCases.find(tc => tc.projectId === projectId && tc.moduleId === targetModuleId && (tc.scenario || tc.title || '').trim().toLowerCase() === scenario.toLowerCase());
    }

    // Check duplicate within the same file (scoped to target module)
    const fileIdKey = targetModuleId + "|||" + customId.toLowerCase();
    const fileScenarioKey = targetModuleId + "|||" + scenario.toLowerCase();
    let isFileDup = false;
    if (customId && seenIds.has(fileIdKey)) isFileDup = true;
    if (!isFileDup && seenScenarios.has(fileScenarioKey)) isFileDup = true;

    let isSystemDup = false;
    let isUpdated = false;

    if (existing) {
      if (!duplicateIds.has(existing.id)) {
        duplicateIds.add(existing.id);
        duplicateCases.push(existing);
      }
      if (hasDiff(existing, row, data.mapping, projectId)) {
        isUpdated = true;
      } else {
        isSystemDup = true;
      }
    }

    if (isFileDup || isSystemDup) {
      if (isUpdated) {
        newCount++;
      } else {
        dupCount++;
      }
    } else {
      newCount++;
    }

    // Add to seen sets
    if (customId) seenIds.add(fileIdKey);
    seenScenarios.add(fileScenarioKey);
  });

  // Re-write preview section info
  const mappingGrid = document.querySelector('#excelPreviewSection .mapping-grid');

  const fields = [
    { label: 'Test Case ID (Override)', key: 'id' },
    { label: 'Test Scenario (Required)', key: 'scenario' },
    { label: 'Simplified Test Scenario', key: 'simplifiedScenario' },
    { label: 'Test Steps', key: 'steps' },
    { label: 'Expected Result', key: 'expected' },
    { label: 'Actual Result', key: 'actual' },
    { label: 'Priority', key: 'priority' },
    { label: 'Severity', key: 'severity' },
    { label: 'Status', key: 'status' },
    { label: 'Tested By', key: 'assignee' },
    { label: 'Execution Date', key: 'executionDate' },
    { label: 'Defect ID', key: 'defectId' },
    { label: 'Comments / Run Notes', key: 'comments' },
    { label: 'Module / Folder Name', key: 'module' },
    { label: 'Test Type', key: 'type' }
  ];

  let gridHtml = '';
  fields.forEach(f => {
    const selectedIdx = Array.isArray(data.mapping[f.key]) ? data.mapping[f.key][data.mapping[f.key].length - 1] : data.mapping[f.key];
    const optionsHtml = `<option value="">— Leave Blank / Unmapped —</option>` +
      data.headers.map((h, idx) => `<option value="${idx}" ${selectedIdx === idx ? 'selected' : ''}>Col: ${h}</option>`).join('');

    gridHtml += `
      <div class="mapping-item" style="background:var(--surface-2); padding:6px 10px; border-radius:var(--radius-sm); border:1px solid var(--border); display:flex; flex-direction:column; gap:2px; font-size:11.5px;">
        <span style="font-weight:600; color:var(--text-secondary);">${f.label}</span>
        <select class="mapping-field-select" data-field-key="${f.key}" style="width:100%; border:1px solid var(--border); border-radius:4px; padding:2px; background:#fff; font-size:11px; height:22px; outline:none;">
          ${optionsHtml}
        </select>
      </div>
    `;
  });

  mappingGrid.innerHTML = gridHtml;

  // Render or update summary block
  let summaryCard = document.getElementById('excelImportSummaryCard');
  if (!summaryCard) {
    summaryCard = document.createElement('div');
    summaryCard.id = 'excelImportSummaryCard';
    summaryCard.style.cssText = 'background:var(--accent-light); border:1px solid rgba(45,106,79,0.15); padding:10px 14px; border-radius:var(--radius-sm); margin-bottom:12px; font-size:12.5px; line-height:1.5; color:var(--accent);';
    preview.insertBefore(summaryCard, preview.firstChild.nextSibling);
  }

  summaryCard.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px;">File parsed successfully!</div>
    <div style="display:flex; justify-content:space-between; margin-top:2px;">
      <span>Total Rows Found:</span> <strong>${data.dataRows.length}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; color:#27ae60;">
      <span>New / Updated Test Cases:</span> <strong>${newCount}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; color:${dupCount > 0 ? (replaceDupes ? '#e67e22' : 'var(--danger)') : 'var(--text-muted)'};">
      <span>${replaceDupes ? 'Duplicates to Overwrite:' : 'Ignored duplicates (Already exist):'}</span> 
      <div>
        <strong>${dupCount}</strong>
        ${dupCount > 0 ? `<a href="#" id="viewExcelDupesLink" style="font-size:11px; margin-left:8px; text-decoration:underline; font-weight:600; color:inherit; cursor:pointer;">View / Clean</a>` : ''}
      </div>
    </div>
  `;

  // Render the duplicates list
  const dupesContainer = document.getElementById('excelDupesListContainer');
  const dupesSection = document.getElementById('excelImportDuplicatesSection');
  const dupesCountEl = document.getElementById('excelImportDupesCount');

  if (dupesSection && dupesContainer) {
    if (duplicateCases.length > 0) {
      dupesCountEl.textContent = `${duplicateCases.length} duplicate${duplicateCases.length !== 1 ? 's' : ''} found`;
      dupesContainer.innerHTML = duplicateCases.map(tc => {
        const mod = state.modules.find(m => m.id === tc.moduleId);
        const moduleName = mod ? mod.name : 'Root / Unassigned';
        return `
          <div class="dupe-item" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; gap: 8px; margin-bottom: 4px;">
            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
              <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <span class="status-pill planned" style="font-size: 10px; padding: 1px 4px; font-family: var(--font-mono); margin: 0;">${tc.id}</span>
                <span style="color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(tc.scenario || tc.title)}">${escapeHtml(tc.scenario || tc.title)}</span>
              </div>
              <span style="font-size: 10.5px; color: var(--text-muted);">Module: ${escapeHtml(moduleName)}</span>
            </div>
            <button class="icon-btn danger delete-dupe-btn" data-tc-id="${tc.id}" aria-label="Delete from system" title="Delete from system" style="padding: 0; width: 24px; height: 24px; flex-shrink: 0; border: 1px solid var(--border); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; background: none; cursor: pointer; transition: all 0.2s;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; color: var(--danger);"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        `;
      }).join('');
    } else {
      dupesSection.style.display = 'none';
      dupesContainer.innerHTML = '';
      const toggleLink = document.getElementById('viewExcelDupesLink');
      if (toggleLink) toggleLink.textContent = 'View / Clean';
    }
  }
};

const deleteTestCaseFromImport = async (id) => {
  if (confirm(`Delete test case "${id}" from the system? This action cannot be undone.`)) {
    state.testCases = state.testCases.filter(tc => tc.id !== id);
    logActivity(`Deleted testcase "${id}" during Excel import`, 'delete');
    await storage.save();
    showToast(`Test case ${id} deleted.`);

    // Re-render import preview
    renderImportPreview();

    // Re-render main UI in background
    render();
    updateStorageInfo();
  }
};

const handleExcelImport = async () => {
  const projectId = document.getElementById('excelImportProject').value;
  const modalModuleId = document.getElementById('excelImportModule').value;

  if (!projectId) { showToast('Project selection is required', 'error'); return; }
  if (!pendingImportData) { showToast('No file data available', 'error'); return; }

  // Read mappings dynamically
  const data = pendingImportData;
  const activeMapping = {};
  const selectDropdowns = document.querySelectorAll('.mapping-field-select');
  selectDropdowns.forEach(sel => {
    const key = sel.dataset.fieldKey;
    const val = sel.value;
    if (val !== "") {
      const idxVal = parseInt(val, 10);
      const originalVal = data.mapping[key];
      if (Array.isArray(originalVal) && originalVal.includes(idxVal)) {
        activeMapping[key] = originalVal;
      } else {
        activeMapping[key] = [idxVal];
      }
    }
  });

  if (activeMapping.scenario === undefined) {
    showToast('Please map the required field "Test Scenario"', 'error');
    return;
  }

  // Read replace preference
  const replaceDupesCheckbox = document.getElementById('excelImportReplaceDupes');
  const replaceDupes = replaceDupesCheckbox ? replaceDupesCheckbox.checked : false;

  // Hide the import save button during processing to prevent double-triggering
  const saveBtn = document.getElementById('saveExcelImport');
  if (saveBtn) saveBtn.style.display = 'none';

  // Show loading spinner
  document.getElementById('excelPreviewSection').style.display = 'none';
  document.getElementById('excelLoadingSection').style.display = 'flex';
  document.getElementById('excelLoadingText').textContent = 'Importing test cases and avoiding duplicates...';

  // Process rows after short delay for loading render
  setTimeout(async () => {
    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    // Get max TC ID number
    let lastIdNum = state.testCases.reduce((max, tc) => {
      const match = tc.id.match(/^TC-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 100);

    const moduleCache = {};
    state.modules.forEach(m => {
      if (m.projectId === projectId) {
        moduleCache[m.name.toLowerCase()] = m.id;
      }
    });
    const defaultMod = state.modules.find(m => m.projectId === projectId);
    const defaultModId = defaultMod ? defaultMod.id : '';

    const existingIdsSet = new Set(state.testCases.map(tc => tc.id.toLowerCase()));
    const existingIdMap = new Map();
    const existingScenarioMap = new Map();
    state.testCases.forEach(tc => {
      const pId = tc.projectId;
      const mId = tc.moduleId || '';
      if (tc.id) {
        existingIdMap.set(pId + "|||" + mId + "|||" + tc.id.toLowerCase(), tc);
      }
      const scenarioVal = (tc.scenario || tc.title || '').trim().toLowerCase();
      if (scenarioVal) {
        existingScenarioMap.set(pId + "|||" + mId + "|||" + scenarioVal, tc);
      }
    });

    const seenIds = new Set();
    const seenScenarios = new Set();

    data.dataRows.forEach(row => {
      const getVal = (key) => {
        const idxs = activeMapping[key];
        if (idxs === undefined) return "";
        if (Array.isArray(idxs)) {
          for (let i = idxs.length - 1; i >= 0; i--) {
            const val = String(row[idxs[i]] || '').trim();
            if (val !== "") return row[idxs[i]];
          }
          return row[idxs[0]] || "";
        }
        return (row[idxs] !== undefined) ? row[idxs] : "";
      };

      const scenarioRaw = getVal('scenario');
      const scenario = scenarioRaw instanceof Date ? parseAndFormatImportDate(scenarioRaw) : String(scenarioRaw).trim();
      if (!scenario) return; // skip rows without scenario

      const customIdRaw = getVal('id');
      const customId = String(customIdRaw || '').trim();

      // Determine module FIRST
      let targetModuleId = '';
      if (modalModuleId === 'root_only') {
        targetModuleId = '';
      } else if (modalModuleId !== '') {
        targetModuleId = modalModuleId;
      } else {
        const csvModuleNameRaw = getVal('module');
        const csvModuleName = String(csvModuleNameRaw || '').trim();
        if (csvModuleName) {
          const cleanName = csvModuleName.toLowerCase();
          if (moduleCache[cleanName]) {
            targetModuleId = moduleCache[cleanName];
          } else {
            const newModId = 'mod-' + uid();
            state.modules.push({
              id: newModId,
              projectId: projectId,
              name: csvModuleName,
              description: 'Auto-created during import'
            });
            targetModuleId = newModId;
            moduleCache[cleanName] = targetModuleId;
          }
        } else {
          targetModuleId = defaultModId;
        }
      }

      // Check if it matches an existing system test case IN THE SAME TARGET MODULE
      let existing = null;
      if (customId) {
        existing = existingIdMap.get(projectId + "|||" + targetModuleId + "|||" + customId.toLowerCase()) || null;
      }
      if (!existing && scenario) {
        existing = existingScenarioMap.get(projectId + "|||" + targetModuleId + "|||" + scenario.toLowerCase()) || null;
      }

      // Check duplicate within the same file (scoped to target module)
      const fileIdKey = targetModuleId + "|||" + customId.toLowerCase();
      const fileScenarioKey = targetModuleId + "|||" + scenario.toLowerCase();
      let isFileDup = false;
      if (customId && seenIds.has(fileIdKey)) isFileDup = true;
      if (!isFileDup && seenScenarios.has(fileScenarioKey)) isFileDup = true;

      let isUpdated = false;
      if (existing) {
        isUpdated = hasDiff(existing, row, activeMapping, projectId);
      }

      if (isFileDup) {
        skipped++;
        return; // skip duplicate row inside file
      }

      // Mark as seen in file
      if (customId) seenIds.add(fileIdKey);
      seenScenarios.add(fileScenarioKey);

      if (existing) {
        if (isUpdated || replaceDupes) {
          // Overwrite in place
          existing.scenario = scenario;
          existing.title = scenario; // compatibility
          existing.simplifiedScenario = String(getVal('simplifiedScenario') || '').trim();
          existing.description = String(getVal('description') || '').trim();
          existing.steps = String(getVal('steps') || '').trim();
          existing.expected = String(getVal('expected') || '').trim();
          existing.actual = String(getVal('actual') || '').trim();
          existing.priority = normalizePriority(getVal('priority'));
          existing.severity = normalizeSeverity(getVal('severity'));
          existing.status = normalizeStatus(getVal('status'));
          existing.type = normalizeType(getVal('type'));
          existing.assignee = String(getVal('assignee') || '').trim();
          existing.executionDate = parseAndFormatImportDate(getVal('executionDate'));
          existing.defectId = String(getVal('defectId') || '').trim();
          existing.comments = String(getVal('comments') || '').trim();
          existing.updatedAt = now;
          existing.moduleId = targetModuleId;
          imported++;
        } else {
          skipped++;
        }
        return;
      }

      // Generate ID (ensure globally unique)
      let finalId = customId;
      const idExistsGlobally = (id) => existingIdsSet.has(id.toLowerCase());

      if (!finalId || idExistsGlobally(finalId)) {
        lastIdNum += 1;
        while (idExistsGlobally(`TC-${lastIdNum}`)) {
          lastIdNum += 1;
        }
        finalId = `TC-${lastIdNum}`;
      }

      // Insert test case matching standard 14-field schema
      const newTestCase = {
        id: finalId,
        projectId: projectId,
        moduleId: targetModuleId,
        title: scenario, // compatibility
        scenario: scenario,
        simplifiedScenario: String(getVal('simplifiedScenario') || '').trim(),
        description: String(getVal('description') || '').trim(),
        steps: String(getVal('steps') || '').trim(),
        expected: String(getVal('expected') || '').trim(),
        actual: String(getVal('actual') || '').trim(),
        priority: normalizePriority(getVal('priority')),
        severity: normalizeSeverity(getVal('severity')),
        status: normalizeStatus(getVal('status')),
        type: normalizeType(getVal('type')),
        assignee: String(getVal('assignee') || '').trim(),
        executionDate: parseAndFormatImportDate(getVal('executionDate')),
        defectId: String(getVal('defectId') || '').trim(),
        comments: String(getVal('comments') || '').trim(),
        createdAt: now,
        updatedAt: now
      };

      state.testCases.push(newTestCase);
      existingIdsSet.add(finalId.toLowerCase());
      existingIdMap.set(projectId + "|||" + targetModuleId + "|||" + finalId.toLowerCase(), newTestCase);
      existingScenarioMap.set(projectId + "|||" + targetModuleId + "|||" + scenario.toLowerCase(), newTestCase);

      imported++;
    });

    logActivity(`Imported/Updated ${imported} test cases from Excel/CSV (skipped ${skipped} duplicates)`, 'task');
    await storage.save();
    closeModals();
    render();
    updateStorageInfo();
    showToast(`Successfully imported/updated ${imported} test cases. Skipped ${skipped} duplicates.`);
    pendingImportData = null;
  }, 1400);
};

const handleModuleCheckboxChange = (cb) => {
  if (!state.selectedTestCaseIds) {
    state.selectedTestCaseIds = new Set();
  }

  const moduleId = cb.dataset.moduleId;
  const checked = cb.checked;

  let mCases;
  if (moduleId === 'all') {
    mCases = state.testCases.filter(tc => tc.projectId === state.activeTestCaseProjectId);
  } else {
    mCases = state.testCases.filter(tc => tc.projectId === state.activeTestCaseProjectId && tc.moduleId === moduleId);
  }

  mCases.forEach(tc => {
    if (checked) {
      state.selectedTestCaseIds.add(tc.id);
    } else {
      state.selectedTestCaseIds.delete(tc.id);
    }
  });

  if (checked && mCases.length > 0) {
    state.testCaseSelectionMode = true;
  }

  render();
};

const handleTestCaseCheckboxChange = (cb) => {
  if (!state.selectedTestCaseIds) {
    state.selectedTestCaseIds = new Set();
  }

  const tcId = cb.dataset.id;
  const checked = cb.checked;

  if (checked) {
    state.selectedTestCaseIds.add(tcId);
  } else {
    state.selectedTestCaseIds.delete(tcId);
  }

  render();
};

const confirmBulkDeleteTestCases = () => {
  const count = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  if (count === 0) return;
  document.getElementById('confirmMessage').textContent =
    `Delete ${count} selected test cases? This action cannot be undone.`;
  confirmCallback = () => bulkDeleteTestCases();
  showModal('confirmModal');
};

const bulkDeleteTestCases = async () => {
  const count = state.selectedTestCaseIds ? state.selectedTestCaseIds.size : 0;
  if (count === 0) return;

  state.testCases = state.testCases.filter(tc => !state.selectedTestCaseIds.has(tc.id));
  logActivity(`Bulk deleted ${count} test cases`, 'delete');
  state.selectedTestCaseIds.clear();
  state.testCaseSelectionMode = false;
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast(`Successfully deleted ${count} test cases.`);
};

const openBulkUpdateModal = () => {
  const modal = document.getElementById('bulkUpdateModal');
  const infoCard = document.getElementById('bulkUpdateInfoCard');

  const targetCases = state.lastFilteredCases || [];
  if (targetCases.length === 0) {
    showToast('No test cases in view to bulk update', 'error');
    return;
  }

  const activeProj = state.projects.find(p => p.id === state.activeTestCaseProjectId);
  const projName = activeProj ? activeProj.name : '';

  infoCard.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px;">Bulk Update Target</div>
    This will update <strong>${targetCases.length}</strong> test cases currently in view under project <strong>${projName}</strong>.
  `;

  document.getElementById('bulkUpdateField').value = '';
  document.getElementById('bulkUpdateValueGroup').style.display = 'none';
  document.getElementById('saveBulkUpdate').style.display = 'none';
  document.getElementById('bulkUpdateValueInputContainer').innerHTML = '';

  showModal('bulkUpdateModal');
};

const handleBulkUpdateFieldChange = () => {
  const field = document.getElementById('bulkUpdateField').value;
  const valGroup = document.getElementById('bulkUpdateValueGroup');
  const saveBtn = document.getElementById('saveBulkUpdate');
  const container = document.getElementById('bulkUpdateValueInputContainer');
  const label = document.getElementById('bulkUpdateValueLabel');

  if (!field) {
    valGroup.style.display = 'none';
    saveBtn.style.display = 'none';
    return;
  }

  valGroup.style.display = 'block';
  saveBtn.style.display = 'inline-block';

  const fieldOption = document.querySelector(`#bulkUpdateField option[value="${field}"]`);
  const fieldName = fieldOption ? fieldOption.textContent : 'Value';
  label.textContent = `New ${fieldName} Value`;

  let html = '';
  if (field === 'priority') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="Critical">Critical</option>
        <option value="High" selected>High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
    `;
  } else if (field === 'severity') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="S1 - Blocker">S1 - Blocker</option>
        <option value="S2 - Critical">S2 - Critical</option>
        <option value="S3 - Major" selected>S3 - Major</option>
        <option value="S4 - Minor">S4 - Minor</option>
      </select>
    `;
  } else if (field === 'status') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="Untested" selected>Untested</option>
        <option value="Passed">Passed</option>
        <option value="Failed">Failed</option>
        <option value="Blocked">Blocked</option>
      </select>
    `;
  } else if (field === 'type') {
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="Manual" selected>Manual</option>
        <option value="Automated">Automated</option>
        <option value="API">API</option>
        <option value="Security">Security</option>
        <option value="Performance">Performance</option>
        <option value="Regression">Regression</option>
      </select>
    `;
  } else if (field === 'assignee') {
    const devOptions = state.developers.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="">— Unassigned —</option>
        ${devOptions}
      </select>
    `;
  } else if (field === 'module') {
    const projModules = state.modules.filter(m => m.projectId === state.activeTestCaseProjectId);
    const modOptions = projModules.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    html = `
      <select id="bulkUpdateValueSelect" style="background:var(--surface);">
        <option value="">— None (Directly in Project) —</option>
        ${modOptions}
      </select>
    `;
  } else if (field === 'executionDate') {
    html = `<input type="date" id="bulkUpdateValueInput" style="background:var(--surface);" />`;
  } else if (field === 'defectId') {
    html = `<input type="text" id="bulkUpdateValueInput" placeholder="e.g. BUG-824" style="background:var(--surface);" />`;
  } else if (field === 'comments') {
    html = `<textarea id="bulkUpdateValueInput" placeholder="Add comments…" rows="3" style="background:var(--surface);"></textarea>`;
  }

  container.innerHTML = html;
};

const saveBulkUpdate = async () => {
  const field = document.getElementById('bulkUpdateField').value;
  if (!field) return;

  const selectEl = document.getElementById('bulkUpdateValueSelect');
  const inputEl = document.getElementById('bulkUpdateValueInput');
  const val = selectEl ? selectEl.value : (inputEl ? inputEl.value.trim() : '');

  const targetCases = state.lastFilteredCases || [];
  if (targetCases.length === 0) return;

  const now = new Date().toISOString();
  let updatedCount = 0;

  targetCases.forEach(tc => {
    const masterTc = state.testCases.find(x => x.id === tc.id);
    if (masterTc) {
      if (field === 'module') {
        masterTc.moduleId = val;
      } else {
        masterTc[field] = val;
      }
      masterTc.updatedAt = now;
      updatedCount++;
    }
  });

  logActivity(`Bulk updated ${updatedCount} test cases: field "${field}" to "${val}"`, 'task');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast(`Successfully updated ${updatedCount} test cases.`);
};

const initExcelUploadSimulator = () => {
  const dropzone = document.getElementById('excelDropzone');
  const fileInput = document.getElementById('excelFileInput');
  const selectBtn = document.getElementById('selectExcelFileBtn');

  if (!dropzone || !fileInput || !selectBtn) return;

  selectBtn.onclick = (e) => {
    e.stopPropagation();
    fileInput.click();
  };

  fileInput.onchange = (e) => {
    if (e.target.files.length) {
      processPendingImportFile(e.target.files[0]);
    }
  };

  dropzone.onclick = () => {
    fileInput.click();
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  };

  dropzone.ondragleave = () => {
    dropzone.classList.remove('dragover');
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      processPendingImportFile(e.dataTransfer.files[0]);
    }
  };
};

const updateReleaseVersionDropdown = (projectId, selectedVersionValue = '') => {
  const verSel = document.getElementById('releaseVersion');
  if (!verSel) return;
  if (!projectId) {
    verSel.innerHTML = `<option value="">— Select Version —</option>`;
    return;
  }

  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) {
    verSel.innerHTML = `<option value="">— Select Version —</option>`;
    return;
  }

  let versions = [];
  if (proj.projectType === 'app') {
    if (proj.androidUpcomingVersion) versions.push({ val: proj.androidUpcomingVersion, label: `${proj.androidUpcomingVersion} (Android Upcoming)` });
    if (proj.androidPreviousVersion) versions.push({ val: proj.androidPreviousVersion, label: `${proj.androidPreviousVersion} (Android Previous)` });
    if (proj.iosUpcomingVersion) versions.push({ val: proj.iosUpcomingVersion, label: `${proj.iosUpcomingVersion} (iOS Upcoming)` });
    if (proj.iosPreviousVersion) versions.push({ val: proj.iosPreviousVersion, label: `${proj.iosPreviousVersion} (iOS Previous)` });
  } else {
    if (proj.upcomingVersion) versions.push({ val: proj.upcomingVersion, label: `${proj.upcomingVersion} (Upcoming)` });
    if (proj.previousVersion) versions.push({ val: proj.previousVersion, label: `${proj.previousVersion} (Previous)` });
  }

  // Fallback: If no versions configured, show a helpful placeholder or allow custom
  if (versions.length === 0) {
    verSel.innerHTML = `<option value="">— No versions configured —</option>`;
    return;
  }

  verSel.innerHTML = `<option value="">— Select Version —</option>` +
    versions.map(v => `<option value="${v.val}" ${selectedVersionValue === v.val ? 'selected' : ''}>${v.label}</option>`).join('');
};

const getReleaseVersionOptions = (project) => {
  if (!project) return [];
  if (project.projectType === 'app') {
    const opts = [];
    if (project.androidPreviousVersion) opts.push({ value: project.androidPreviousVersion, label: `Android ${project.androidPreviousVersion} (Prev)` });
    if (project.androidUpcomingVersion) opts.push({ value: project.androidUpcomingVersion, label: `Android ${project.androidUpcomingVersion} (Up)` });
    if (project.iosPreviousVersion) opts.push({ value: project.iosPreviousVersion, label: `iOS ${project.iosPreviousVersion} (Prev)` });
    if (project.iosUpcomingVersion) opts.push({ value: project.iosUpcomingVersion, label: `iOS ${project.iosUpcomingVersion} (Up)` });
    return opts;
  }
  const opts = [];
  if (project.previousVersion) opts.push({ value: project.previousVersion, label: `${project.previousVersion} (Prev)` });
  if (project.upcomingVersion) opts.push({ value: project.upcomingVersion, label: `${project.upcomingVersion} (Up)` });
  return opts;
};

const loadReleaseProjectsList = (selectedProjectIds = []) => {
  const container = document.getElementById('releaseProjectChecklist');
  if (!container) return;
  container.innerHTML = state.projects.map(p => `
    <label class="dev-project-label">
      <input type="checkbox" name="releaseProjectCheck" value="${p.id}" ${selectedProjectIds.includes(p.id) ? 'checked' : ''} />
      <span>${p.name}</span>
    </label>
  `).join('') || emptyNote('No projects added yet.');

  container.querySelectorAll('input[name="releaseProjectCheck"]').forEach(cb => {
    cb.onchange = () => {
      const checkedIds = Array.from(container.querySelectorAll('input[name="releaseProjectCheck"]:checked')).map(c => c.value);
      loadReleaseVersionsList(checkedIds);
    };
  });
};

const loadReleaseVersionsList = (projectIds, selectedVersions = []) => {
  const container = document.getElementById('releaseVersionChecklist');
  if (!container) return;
  if (!projectIds || projectIds.length === 0) {
    container.innerHTML = emptyNote('Select project(s) first.');
    return;
  }
  let html = '';
  projectIds.forEach(pid => {
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    const opts = getReleaseVersionOptions(proj);
    if (opts.length > 0) {
      html += `<div style="font-weight:600;font-size:11.5px;color:var(--text-secondary);width:100%;margin-top:8px;margin-bottom:4px;border-bottom:1px dashed var(--border);padding-bottom:2px;">${proj.name}</div>`;
      html += opts.map(o => `
        <label class="rp-version-checkbox-label">
          <input type="checkbox" name="releaseVersionCheck" value="${o.value}" ${selectedVersions.includes(o.value) ? 'checked' : ''} />
          ${o.label}
        </label>
      `).join('');
    }
  });
  container.innerHTML = html || emptyNote('No versions configured for the selected project(s).');
};

const openReleaseModal = (id = null) => {
  const modal = document.getElementById('releaseModal');
  const title = document.getElementById('releaseModalTitle');

  // Populate Release Manager dropdown with devs and ensure Dwip Pandya is a default choice
  const mgrSel = document.getElementById('releaseManager');
  let mgrOptions = state.developers.map(d => d.name);
  if (!mgrOptions.includes('Dwip Pandya')) {
    mgrOptions.unshift('Dwip Pandya');
  }
  mgrSel.innerHTML = `<option value="">— Select Manager —</option>` +
    mgrOptions.map(name => `<option value="${name}">${name}</option>`).join('');

  // Populate Product Developers checklist with devs
  const checklist = document.getElementById('releaseDevChecklist');
  checklist.innerHTML = state.developers.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="releaseDevCheck" value="${d.id}" />
      <span>${d.name}</span>
    </label>
  `).join('') || emptyNote('No developers added in Settings.');

  if (id) {
    const r = state.releases.find(x => x.id === id);
    if (!r) return;
    title.textContent = 'Edit Release';
    document.getElementById('releaseId').value = r.id;
    document.getElementById('releaseName').value = r.name;
    document.getElementById('releaseDate').value = r.releaseDate || '';
    document.getElementById('releaseDesc').value = r.description || '';
    document.getElementById('releaseManager').value = r.managerName || '';
    document.getElementById('releaseStatus').value = r.status || 'Draft';
    document.getElementById('releaseWorkItems').value = r.workItems || '';
    document.getElementById('releaseNotes').value = r.notes || '';

    // Multi-project checklist — support legacy single projectId
    const projectIds = r.projectIds || (r.projectId ? [r.projectId] : []);
    loadReleaseProjectsList(projectIds);
    // Multi-version checklist — support legacy single version
    const versions = r.versions || (r.version ? [r.version] : []);
    loadReleaseVersionsList(projectIds, versions);

    // Check dev checkboxes
    document.querySelectorAll('input[name="releaseDevCheck"]').forEach(cb => {
      cb.checked = (r.developerIds || []).includes(cb.value);
    });
  } else {
    title.textContent = 'New Release';
    document.getElementById('releaseId').value = '';
    document.getElementById('releaseName').value = '';
    document.getElementById('releaseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('releaseDesc').value = '';
    document.getElementById('releaseManager').value = 'Dwip Pandya';
    document.getElementById('releaseStatus').value = 'Released';
    document.getElementById('releaseWorkItems').value = '';
    document.getElementById('releaseNotes').value = '';

    loadReleaseProjectsList([]);
    loadReleaseVersionsList([]);
  }

  showModal('releaseModal');
};

const saveRelease = async () => {
  const id = document.getElementById('releaseId').value;
  const name = document.getElementById('releaseName').value.trim();
  const releaseDate = document.getElementById('releaseDate').value;
  const description = document.getElementById('releaseDesc').value.trim();
  const managerName = document.getElementById('releaseManager').value;
  const status = document.getElementById('releaseStatus').value;
  const workItems = document.getElementById('releaseWorkItems').value.trim();
  const notes = document.getElementById('releaseNotes').value.trim();

  // Multi-project + multi-version
  const projectIds = Array.from(document.querySelectorAll('input[name="releaseProjectCheck"]:checked')).map(cb => cb.value);
  const versions = Array.from(document.querySelectorAll('input[name="releaseVersionCheck"]:checked')).map(cb => cb.value);
  // Backward-compat single fields (for display code that still reads projectId / version)
  const projectId = projectIds[0] || '';
  const version = versions[0] || '';

  if (projectIds.length === 0) { showToast('Select at least one project', 'error'); return; }
  if (!name) { showToast('Release name is required', 'error'); return; }

  // Get selected developers
  const developerIds = Array.from(document.querySelectorAll('input[name="releaseDevCheck"]:checked')).map(cb => cb.value);

  const now = new Date().toISOString();
  const versionSummary = versions.length > 0 ? versions.join(', ') : '—';

  if (id) {
    const idx = state.releases.findIndex(r => r.id === id);
    if (idx === -1) return;
    state.releases[idx] = {
      ...state.releases[idx],
      name, projectId, projectIds, version, versions, description, managerName, status, workItems, notes, developerIds, releaseDate,
      updatedAt: now
    };
    logActivity(`Updated release "${name}" (${versionSummary}) [${status}]`, 'project');
    showToast('Release updated');
  } else {
    state.releases.unshift({
      id: 'rel-' + uid(),
      name, projectId, projectIds, version, versions, description, managerName, status, workItems, notes, developerIds, releaseDate,
      createdAt: now, updatedAt: now
    });
    logActivity(`Created release "${name}" (${versionSummary}) [${status}]`, 'project');
    showToast('Release created');
  }

  syncProjectReleaseDates();

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteRelease = (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;
  const vStr = (r.versions && r.versions.length ? r.versions : (r.version ? [r.version] : [])).join(', ') || '—';
  document.getElementById('confirmMessage').textContent =
    `Delete release "${r.name}" (${vStr})? This action cannot be undone.`;
  confirmCallback = () => deleteRelease(id);
  showModal('confirmModal');
};

const deleteRelease = async (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;
  state.releases = state.releases.filter(x => x.id !== id);
  logActivity(`Deleted release "${r.name}" version ${r.version}`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Release deleted');
};

const triggerNotesMailGeneration = () => {
  const name = document.getElementById('releaseName').value.trim() || '[Release Name]';
  const releaseDate = document.getElementById('releaseDate').value;
  const dateStr = releaseDate ? fmtDate(releaseDate) : '[Release Date]';
  const description = document.getElementById('releaseDesc').value.trim() || '[No description provided]';
  const managerName = document.getElementById('releaseManager').value || '[No Release Manager assigned]';
  const status = document.getElementById('releaseStatus').value || 'Draft';
  const workItems = document.getElementById('releaseWorkItems').value.trim() || '[No work items linked]';

  const selectedProjectIds = Array.from(document.querySelectorAll('input[name="releaseProjectCheck"]:checked')).map(cb => cb.value);
  const selectedVersions = Array.from(document.querySelectorAll('input[name="releaseVersionCheck"]:checked')).map(cb => cb.value);
  const projNames = selectedProjectIds.map(pid => { const p = state.projects.find(x => x.id === pid); return p ? p.name : null; }).filter(Boolean);
  const projName = projNames.length ? projNames.join(', ') : '[Project Name]';
  const version = selectedVersions.length ? selectedVersions.join(', ') : '[Version]';

  // Get selected devs
  const checkboxes = document.querySelectorAll('input[name="releaseDevCheck"]:checked');
  const developerNames = Array.from(checkboxes).map(cb => {
    const dev = state.developers.find(d => d.id === cb.value);
    return dev ? dev.name : null;
  }).filter(Boolean);
  const devsStr = developerNames.length ? developerNames.join(', ') : '[No developers linked]';

  const notesText = `Subject: [RELEASE] ${projName} - ${name} (${version}) - Status: ${status}

Hi Team,

We are excited to share the release details for "${name}" (${version}) on project "${projName}"!

=======================================================
RELEASE BRIEF
=======================================================
• Project         : ${projName}
• Release Date    : ${dateStr}
• Release Manager : ${managerName}
• Current Status  : ${status}
• Product Devs    : ${devsStr}

=======================================================
DESCRIPTION
=======================================================
${description}

=======================================================
WORK ITEMS / TICKETS INCLUDED
=======================================================
${workItems}

Best Regards,
${managerName === '[No Release Manager assigned]' ? 'The Engineering Team' : managerName}`;

  document.getElementById('releaseNotes').value = notesText;
  showToast('Email release notes generated!');
};

const copyReleaseNotesToClipboard = (id) => {
  const r = state.releases.find(x => x.id === id);
  if (!r) return;

  let finalNotes = r.notes;
  if (!finalNotes) {
    // Generate inline
    const devsList = (r.developerIds || []).map(id => {
      const dev = state.developers.find(d => d.id === id);
      return dev ? dev.name : null;
    }).filter(Boolean);
    const devsStr = devsList.length ? devsList.join(', ') : '[No developers linked]';

    const proj = r.projectId ? state.projects.find(p => p.id === r.projectId) : null;
    const projName = proj ? proj.name : '[Project Name]';
    const dateStr = r.releaseDate ? fmtDate(r.releaseDate) : '[Release Date]';

    finalNotes = `Subject: [RELEASE] ${projName} - ${r.name} (${r.version}) - Status: ${r.status || 'Draft'}

Hi Team,

We are excited to share the release details for "${r.name}" (${r.version}) on project "${projName}"!

=======================================================
RELEASE BRIEF
=======================================================
• Project         : ${projName}
• Release Date    : ${dateStr}
• Release Manager : ${r.managerName || '[No Release Manager assigned]'}
• Current Status  : ${r.status || 'Draft'}
• Product Devs    : ${devsStr}

=======================================================
DESCRIPTION
=======================================================
${r.description || '[No description provided]'}

=======================================================
WORK ITEMS / TICKETS INCLUDED
=======================================================
${r.workItems || '[No work items linked]'}

Best Regards,
${(r.managerName && r.managerName !== '— Select Manager —') ? r.managerName : 'The Engineering Team'}`;
  }

  navigator.clipboard.writeText(finalNotes).then(() => {
    logActivity(`Copied email release notes for "${r.name}" version ${r.version}`, 'task');
    showToast('Release notes copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
};
