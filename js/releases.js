// Clair — js/releases.js: Release Management.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Release Management ──────────────────────────────────
const RELEASE_STATUS_OPTIONS = ['Draft', 'Planned', 'In Progress', 'Testing', 'Approved', 'Released', 'Rolled Back'];

// ─── Release Management ──────────────────────────────────
// Status pipeline (click a stage to filter), toolbar, then releases grouped into
// In flight / Released (by month) / Rolled back as compact rows. A row opens the
// release details; notes, edit and delete are icon actions.
const RELEASE_STATUS_COLOR = {
  'Draft': 'var(--status-planned)', 'Planned': 'var(--indigo)', 'In Progress': 'var(--info)', 'Testing': 'var(--warning)',
  'Approved': 'var(--violet)', 'Released': 'var(--accent)', 'Rolled Back': 'var(--danger)'
};
const releaseProjectIds = (r) => r.projectIds || (r.projectId ? [r.projectId] : []);
const releaseVersions = (r) => r.versions || (r.version ? [r.version] : []);
const releaseTime = (v) => {
  if (!v) return 0;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) { const [y, m, d] = v.slice(0, 10).split('-'); return new Date(+y, +m - 1, +d).getTime(); }
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
};

const renderReleases = () => {
  const all = state.releases || [];
  const q = (state.releaseSearch || '').toLowerCase();
  const f = state.releaseFilters || (state.releaseFilters = { status: '' });
  const countBy = (st) => all.filter(r => (r.status || 'Draft') === st).length;
  const releasedCount = countBy('Released');
  const rolledBackCount = countBy('Rolled Back');
  const inFlightCount = all.length - releasedCount - rolledBackCount;
  const releasedPct = all.length ? Math.round(releasedCount / all.length * 100) : 0;

  const projName = (pid) => { const p = state.projects.find(x => x.id === pid); return p ? p.name : ''; };
  let list = all.filter(r => {
    if (f.status && (r.status || 'Draft') !== f.status) return false;
    if (f.project && !releaseProjectIds(r).includes(f.project)) return false;
    if (!q) return true;
    return [r.name, r.description, r.workItems, r.managerName, ...releaseVersions(r), ...releaseProjectIds(r).map(projName)]
      .some(v => String(v || '').toLowerCase().includes(q));
  });
  list.sort((x, y) => (releaseTime(y.releaseDate) || releaseTime(y.createdAt)) - (releaseTime(x.releaseDate) || releaseTime(x.createdAt)) || releaseTime(y.createdAt) - releaseTime(x.createdAt));

  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"/><polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"/></svg>`,
    title: 'Release Management',
    subtitle: 'Plan and track every product release from draft to deployment.',
    stats: [
      { label: 'Total', value: all.length },
      { label: 'In flight', value: inFlightCount, color: '#fbbf24' },
      { label: 'Released', value: releasedCount, color: '#4ade80' },
      { label: 'Rolled back', value: rolledBackCount, color: rolledBackCount ? '#f87171' : undefined }
    ],
    progressBar: { pct: releasedPct, label: `${releasedCount}/${all.length} released` }
  });

  const stage = (st) => `
    <button type="button" class="rl-stage ${f.status === st ? 'active' : ''}" style="--c:${RELEASE_STATUS_COLOR[st]}" data-action="release-status" data-status="${st}" aria-pressed="${f.status === st}">
      <strong>${countBy(st)}</strong><span>${st}</span>
    </button>`;
  const pipeline = `
    <div class="rl-pipeline" role="group" aria-label="Filter by status">
      ${['Draft', 'Planned', 'In Progress', 'Testing', 'Approved', 'Released'].map(stage).join('<span class="rl-arrow" aria-hidden="true">›</span>')}
      <span class="rl-pipeline-sep" aria-hidden="true"></span>
      ${stage('Rolled Back')}
    </div>`;

  const filtered = !!(q || f.status || f.project);
  const toolbar = `
    <div class="filters-bar tk-toolbar std-toolbar">
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="releaseSearchInput" placeholder="Search name, version, project, work items…" value="${escapeHtml(state.releaseSearch || '')}" />
        ${state.releaseSearch ? `<button class="page-search-clear" id="clearReleaseSearch">✕</button>` : ''}
      </div>
      <select class="filter-select" data-releasefilter="project" aria-label="Project">
        <option value="">All projects</option>
        ${state.projects.filter(p => all.some(r => releaseProjectIds(r).includes(p.id))).map(p => `<option value="${p.id}" ${f.project === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      ${filtered ? `<button class="btn-ghost" id="clearReleaseFilters" style="font-size:12px;padding:6px 10px">Clear filters</button>` : ''}
      <span class="rpa-showing tk-showing">${filtered ? `${list.length} of ${all.length} releases` : `${all.length} releases`}</span>
      <button type="button" class="btn-primary st-btn tb-new" data-action="new-release"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Release</button>
    </div>`;

  if (!list.length) {
    return `${hero}${pipeline}${toolbar}${emptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"/></svg>',
      filtered ? 'No releases match' : 'No releases yet',
      filtered ? 'Try another search or clear the filters.' : 'Click "Add Release" at the top to plan your first release.'
    )}`;
  }

  // Groups: in flight, released by month, rolled back.
  const groups = [];
  const inFlight = list.filter(r => !['Released', 'Rolled Back'].includes(r.status || 'Draft'));
  if (inFlight.length) groups.push({ title: 'In flight', note: 'Draft to Approved', items: inFlight });
  const byMonth = new Map();
  list.filter(r => r.status === 'Released').forEach(r => {
    const t = releaseTime(r.releaseDate) || releaseTime(r.createdAt);
    const key = t ? new Date(t).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'No release date';
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(r);
  });
  byMonth.forEach((items, key) => groups.push({ title: key, note: 'Released', items }));
  const rolled = list.filter(r => r.status === 'Rolled Back');
  if (rolled.length) groups.push({ title: 'Rolled back', items: rolled });

  return `
    ${hero}
    ${pipeline}
    ${toolbar}
    <div class="rl-groups">
      ${groups.map(g => `
        <section class="rl-group">
          <h3 class="rl-group-title">${escapeHtml(g.title)}<span class="rpa-group-count">${g.items.length}</span>${g.note ? `<em>${g.note}</em>` : ''}</h3>
          <div class="rl-list">${g.items.map(r => renderReleaseRow(r, q)).join('')}</div>
        </section>`).join('')}
    </div>
  `;
};

const renderReleaseRow = (r, q = '') => {
  const st = r.status || 'Draft';
  const hl = (v) => highlight(escapeHtml(v), q);
  const projects = releaseProjectIds(r).map(pid => (state.projects.find(x => x.id === pid) || {}).name).filter(Boolean);
  const versions = releaseVersions(r);
  const devs = (r.developerIds || []).map(id => state.developers.find(d => d.id === id)).filter(Boolean);
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const date = r.releaseDate ? fmtDate(r.releaseDate) : '';
  return `
    <div class="rl-row" style="--c:${RELEASE_STATUS_COLOR[st] || 'var(--status-planned)'}" data-action="view-release" data-id="${r.id}" tabindex="0" role="button" aria-label="Open release ${escapeHtml(r.name)}">
      <div class="rl-main">
        <div class="rl-title-line">
          <span class="rl-name">${hl(r.name)}</span>
          <span class="rl-status">${st}</span>
        </div>
        <div class="rl-meta">
          ${projects.length ? projects.map(n => `<span class="rl-proj">${hl(n)}</span>`).join('') : '<span class="rl-proj none">No project</span>'}
          ${versions.map(v => `<span class="rl-ver">${hl(v)}</span>`).join('')}
        </div>
        ${r.description ? `<div class="rl-desc">${hl(r.description)}</div>` : ''}
      </div>
      <div class="rl-facts">
        <div class="rl-fact"><span>${st === 'Released' ? 'Released' : 'Target date'}</span><strong>${date || '—'}</strong></div>
        <div class="rl-fact"><span>Manager</span><strong>${r.managerName ? hl(r.managerName) : '—'}</strong></div>
        <div class="rl-fact rl-work"><span>Work items</span><strong title="${escapeHtml(r.workItems || '')}">${r.workItems ? hl(r.workItems) : '—'}</strong></div>
      </div>
      <div class="rl-side">
        <div class="rl-devs" title="${escapeHtml(devs.map(d => d.name).join(', ') || 'No developers linked')}">
          ${devs.slice(0, 4).map(d => `<span class="rl-avatar">${initials(d.name)}</span>`).join('')}${devs.length > 4 ? `<span class="rl-avatar more">+${devs.length - 4}</span>` : ''}
        </div>
        <div class="rl-actions">
          ${r.notes ? `<button type="button" class="icon-btn" data-action="copy-notes" data-id="${r.id}" aria-label="Copy release notes email" title="Copy release notes email">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>` : ''}
          <button type="button" class="icon-btn" data-action="edit-release" data-id="${r.id}" aria-label="Edit" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" class="icon-btn danger" data-action="delete-release" data-id="${r.id}" aria-label="Delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    </div>`;
};
