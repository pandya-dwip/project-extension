// Clair — js/release-points.js: Release Points (accordion, version modal, checklist, form).
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// =======================================================
// ─── Release Points ──────────────────────────────────
// =======================================================

const getProjectVersions = (project) => {
  if (!project) return [];
  if (project.projectType === 'app') {
    const versions = [];
    if (project.androidPreviousVersion) versions.push(`Android ${project.androidPreviousVersion} (Prev)`);
    if (project.androidUpcomingVersion) versions.push(`Android ${project.androidUpcomingVersion} (Up)`);
    if (project.iosPreviousVersion) versions.push(`iOS ${project.iosPreviousVersion} (Prev)`);
    if (project.iosUpcomingVersion) versions.push(`iOS ${project.iosUpcomingVersion} (Up)`);
    return versions;
  }
  const versions = [];
  if (project.previousVersion) versions.push(`${project.previousVersion} (Prev)`);
  if (project.upcomingVersion) versions.push(`${project.upcomingVersion} (Up)`);
  return versions;
};

// ─── Release Points (accordion) ──────────────────────────
// One collapsible row per Release Point, grouped into In progress / Completed.
// Open rows live in state.rpExpanded (a Set) so they survive re-renders; the first
// render opens every incomplete Release Point. Checklist rows keep the
// .rp-checklist-item markup that the toggle / inline-edit handlers rely on.
const rpProjectIdsOf = (rp) => rp.projectIds || (rp.projectId ? [rp.projectId] : []);
const rpStats = (rp) => {
  const items = rp.checklistItems || [];
  const done = items.filter(i => i.done).length;
  const complete = !!rp.isCompleted || (items.length > 0 && done === items.length);
  return { items, done, total: items.length, pct: items.length ? Math.round(done / items.length * 100) : 0, complete };
};
const rpMiniRing = (pct, complete) => {
  const r = 15, c = 2 * Math.PI * r;
  return `
    <span class="rpa-ring ${complete ? 'complete' : ''}" data-rpa="ring">
      <svg viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="${r}"/><circle class="fill" cx="18" cy="18" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}"/></svg>
      <span class="rpa-ring-icon">${complete ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : `${pct}`}</span>
    </span>`;
};

const renderRpChecklistItems = (rp) => {
  const renderTicketInline = (ticket) => {
    if (!ticket) return '';
    const t = ticket.trim();
    const isUrl = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(t);
    if (!isUrl) return `<span class="rp-item-ticket text" title="Ticket: ${escapeHtml(t)}"><span>${escapeHtml(t)}</span></span>`;
    const href = t.startsWith('www.') ? 'https://' + t : t;
    let display = t;
    try {
      // Show the last path segment (e.g. the Jira key "CIMTRACK-123" of a /browse/ link).
      const url = new URL(href);
      const segments = url.pathname.split('/').filter(Boolean);
      display = segments.length ? decodeURIComponent(segments[segments.length - 1]) : url.hostname.replace('www.', '');
    } catch (e) { /* keep raw */ }
    return `
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="rp-item-ticket link" title="View Ticket: ${escapeHtml(t)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        <span>${escapeHtml(display)}</span>
      </a>`;
  };

  return (rp.checklistItems || []).map(item => {
    if (state.inlineEditing && state.inlineEditing.rpId === rp.id && state.inlineEditing.itemId === item.id) {
      return `
        <div class="rp-checklist-item editing" data-rp-id="${rp.id}" data-item-id="${item.id}">
          <input type="text" class="rp-inline-edit-text" value="${escapeHtml(item.text)}" placeholder="Item text..." />
          <div class="rp-inline-edit-row">
            <input type="text" class="rp-inline-edit-ticket" value="${escapeHtml(item.ticket || '')}" placeholder="Ticket / Link..." />
            <select class="rp-inline-edit-dev">
              <option value="">Unassigned</option>
              ${state.developers.map(d => `<option value="${d.id}" ${item.developerId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
            </select>
          </div>
          <div class="rp-inline-edit-actions">
            <button class="rp-inline-save-btn" data-action="save-checklist-item-inline" data-rp-id="${rp.id}" data-item-id="${item.id}" aria-label="Save" title="Save">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Save</span>
            </button>
            <button class="rp-inline-cancel-btn" data-action="cancel-checklist-item-inline" aria-label="Cancel" title="Cancel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Cancel</span>
            </button>
          </div>
        </div>`;
    }
    const dev = item.developerId ? state.developers.find(d => d.id === item.developerId) : null;
    // A Clair developer wins; otherwise show the Jira assignee of an imported ticket.
    const assigneeName = dev ? dev.name : (item.jiraAssignee || '');
    const ticketHtml = item.ticket ? renderTicketInline(item.ticket) : '';
    const devHtml = assigneeName ? `
      <span class="rp-item-dev" title="${dev ? 'Assigned to' : 'Jira assignee:'} ${escapeHtml(assigneeName)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        <span>${escapeHtml(assigneeName)}</span>
      </span>` : '';
    return `
      <div class="rp-checklist-item ${item.done ? 'done' : ''}" data-action="toggle-checklist-item" data-rp-id="${rp.id}" data-item-id="${item.id}" role="checkbox" aria-checked="${item.done ? 'true' : 'false'}" tabindex="0">
        <div class="rp-check-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="rp-checklist-item-content">
          <span class="rp-checklist-item-text">${escapeHtml(item.text)}</span>
          ${(ticketHtml || devHtml) ? `<div class="rp-checklist-item-meta">${ticketHtml}${devHtml}</div>` : ''}
        </div>
        <button class="rp-item-edit-btn" data-action="edit-checklist-item-inline" data-rp-id="${rp.id}" data-item-id="${item.id}" aria-label="Edit item" title="Edit item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>`;
  }).join('');
};

const renderReleasePtAccordion = (rp, q = '', forceOpen = false) => {
  const s = rpStats(rp);
  const open = forceOpen || state.rpExpanded.has(rp.id);
  const projects = rpProjectIdsOf(rp).map(pid => state.projects.find(p => p.id === pid)).filter(Boolean);
  const linkedRelease = rp.releaseId ? state.releases.find(r => r.id === rp.releaseId) : null;
  // Each version once: the release's "v1.7.0" and the point's own "v1.7.0 (Up)" are the same version.
  const versions = rpVersionLabels(rp, linkedRelease);
  const belongsTo = releaseForPoint(rp);
  // People: Release Point developers plus anyone assigned to an item.
  const people = [...new Set([...(rp.developerIds || []), ...s.items.map(i => i.developerId).filter(Boolean)])]
    .map(id => state.developers.find(d => d.id === id)).filter(Boolean);
  const avatars = people.slice(0, 4).map(d => {
    const initials = (d.name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'DV';
    return `<span class="rpa-avatar" style="background:${getAvatarGradient(d.name)}" title="${escapeHtml(d.name)}">${escapeHtml(initials)}</span>`;
  }).join('') + (people.length > 4 ? `<span class="rpa-avatar more" title="${escapeHtml(people.slice(4).map(d => d.name).join(', '))}">+${people.length - 4}</span>` : '');
  const bodyId = `rpa-body-${rp.id}`;

  return `
    <article class="rpa-item ${open ? 'open' : ''} ${s.complete ? 'is-complete' : ''}" data-id="${rp.id}">
      <div class="rpa-head">
        <button type="button" class="rpa-summary" data-action="rpa-toggle" data-id="${rp.id}" aria-expanded="${open}" aria-controls="${bodyId}">
          <span class="rpa-chev" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 18l6-6-6-6"/></svg></span>
          ${rpMiniRing(s.pct, s.complete)}
          <span class="rpa-main">
            <span class="rpa-title">${highlight(escapeHtml(rp.title), q)}</span>
            <span class="rpa-tags">
              ${projects.map(p => `<span class="rpa-proj">${highlight(escapeHtml(p.name), q)}</span>`).join('') || '<span class="rpa-proj none">No project</span>'}
              <span class="rpa-type ${rp.releaseType === 'released' ? 'released' : 'upcoming'}">${rp.releaseType === 'released' ? 'Released' : 'Upcoming'}</span>
              ${versions.map(v => `<span class="rpa-ver">${highlight(escapeHtml(v), q)}</span>`).join('')}
              ${belongsTo ? `<span class="rpa-rel ${belongsTo.matched}" title="${belongsTo.matched === 'link' ? 'Linked release' : 'Matched to this release by project and version (no Linked Release set)'}">${DB_ICONS.rocket}${escapeHtml(belongsTo.release.name || 'Release')}</span>` : ''}
            </span>
          </span>
          <span class="rpa-progress">
            <span class="rpa-bar"><span data-rpa="bar" style="width:${s.pct}%"></span></span>
            <span class="rpa-count" data-rpa="count">${s.done}/${s.total}</span>
          </span>
          <span class="rpa-people">${avatars}</span>
          <span class="rpa-updated">${timeAgo(rp.updatedAt || rp.createdAt)}</span>
        </button>
        <div class="rpa-actions">
          <button class="icon-btn" data-action="edit-release-pt" data-id="${rp.id}" aria-label="Edit release point" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-release-pt" data-id="${rp.id}" aria-label="Delete release point" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
      <div class="rpa-body" id="${bodyId}" role="region" aria-label="${escapeHtml(rp.title)} checklist">
        <div class="rpa-body-inner">
          <div class="rpa-meta">
            ${linkedRelease ? `<span><em>Linked release</em>${escapeHtml(linkedRelease.name || '')}</span>` : ''}
            ${people.length ? `<span><em>Developers</em>${escapeHtml(people.map(d => d.name).join(', '))}</span>` : ''}
            <span><em>Progress</em><span data-rpa="summary">${s.complete ? 'All checks passed' : s.total ? `${s.total - s.done} of ${s.total} remaining` : 'No checklist items yet'}</span></span>
            <span><em>Updated</em>${fmtDate(rp.updatedAt || rp.createdAt)}</span>
          </div>
          ${s.total ? `<div class="rpa-checklist">${renderRpChecklistItems(rp)}</div>`
            : `<div class="rpa-noitems">No checklist items yet. <button type="button" class="rpa-link" data-action="edit-release-pt" data-id="${rp.id}">Add items</button></div>`}
        </div>
      </div>
    </article>`;
};

const renderReleasePoints = () => {
  const rps = state.releasePoints || [];
  if (!state.rpExpanded) state.rpExpanded = new Set(rps.filter(rp => !rpStats(rp).complete).map(rp => rp.id));
  const q = (state.releasePtSearch || '').toLowerCase().trim();
  const f = state.releasePtFilters;

  // Overall stats (before filtering)
  const stats = rps.map(rpStats);
  const total = rps.length;
  const completed = stats.filter(s => s.complete).length;
  const upcoming = rps.filter(r => r.releaseType !== 'released').length;
  const totalChecks = stats.reduce((a, s) => a + s.total, 0);
  const doneChecks = stats.reduce((a, s) => a + s.done, 0);
  const overallPct = totalChecks ? Math.round(doneChecks / totalChecks * 100) : 0;

  // Filters. Search also looks inside checklist items (text, ticket, Jira key) and opens matches.
  const itemMatches = (rp) => (rp.checklistItems || []).some(i =>
    (i.text || '').toLowerCase().includes(q) || (i.ticket || '').toLowerCase().includes(q) || (i.jiraKey || '').toLowerCase().includes(q));
  let list = rps.filter(rp => {
    if (q && !(
      (rp.title || '').toLowerCase().includes(q) ||
      rpProjectIdsOf(rp).some(pid => ((state.projects.find(p => p.id === pid) || {}).name || '').toLowerCase().includes(q)) ||
      (rp.versions || []).some(v => (v || '').toLowerCase().includes(q)) ||
      itemMatches(rp))) return false;
    if (f.project && !rpProjectIdsOf(rp).includes(f.project)) return false;
    if (f.releaseType && (rp.releaseType || 'upcoming') !== f.releaseType) return false;
    const c = rpStats(rp).complete;
    if (f.completion === 'completed' && !c) return false;
    if (f.completion === 'incomplete' && c) return false;
    return true;
  });
  const active = list.filter(rp => !rpStats(rp).complete);
  const done = list.filter(rp => rpStats(rp).complete);

  // Project chips: projects that have Release Points, with done/total.
  const chipData = state.projects.map(p => {
    const mine = rps.filter(rp => rpProjectIdsOf(rp).includes(p.id));
    return mine.length ? { p, total: mine.length, done: mine.filter(rp => rpStats(rp).complete).length } : null;
  }).filter(Boolean);
  const chips = `
    <div class="rpa-chips" role="toolbar" aria-label="Filter by project">
      <button type="button" class="rpa-chip ${!f.project ? 'active' : ''}" data-action="rp-project-chip" data-pid="">All projects <span>${total}</span></button>
      ${chipData.map(c => `
        <button type="button" class="rpa-chip ${f.project === c.p.id ? 'active' : ''}" data-action="rp-project-chip" data-pid="${c.p.id}">
          ${escapeHtml(c.p.name)} <span>${c.done}/${c.total}</span>
        </button>`).join('')}
    </div>`;

  const group = (title, items, cls) => items.length ? `
    <section class="rpa-group ${cls}">
      <div class="rpa-group-head"><span class="rpa-group-dot"></span>${title}<span class="rpa-group-count">${items.length}</span></div>
      <div class="rpa-list">${items.map(rp => renderReleasePtAccordion(rp, q, !!q && itemMatches(rp))).join('')}</div>
    </section>` : '';

  const filtersActive = !!(q || f.project || f.releaseType || f.completion);
  const ringR = 26, ringC = 2 * Math.PI * ringR;

  return `
    <div class="rpa-page">
      <section class="rpa-hero">
        <div class="rpa-hero-main">
          <span class="rpa-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></span>
          <div>
            <h2 class="rpa-hero-title">Release Points</h2>
            <p class="rpa-hero-sub">Release readiness checklists for your projects and versions.</p>
          </div>
        </div>
        <div class="rpa-hero-stats">
          <div class="rpa-hstat"><strong>${total}</strong><span>Total</span></div>
          <div class="rpa-hstat"><strong class="warn">${total - completed}</strong><span>In progress</span></div>
          <div class="rpa-hstat"><strong class="ok">${completed}</strong><span>Completed</span></div>
          <div class="rpa-hstat"><strong>${upcoming}</strong><span>Upcoming</span></div>
          <div class="rpa-hero-ring" title="${doneChecks} of ${totalChecks} checks done">
            <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${ringR}"/><circle class="fill" cx="32" cy="32" r="${ringR}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${(ringC * (1 - overallPct / 100)).toFixed(2)}"/></svg>
            <span><strong>${overallPct}%</strong><em>${doneChecks}/${totalChecks} checks</em></span>
          </div>
        </div>
      </section>

      <div class="rpa-toolbar">
        <div class="page-search-wrap rpa-search">
          <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="page-search-input" id="releasePtSearchInput" placeholder="Search titles, items, tickets…" value="${escapeHtml(state.releasePtSearch || '')}" />
          ${state.releasePtSearch ? `<button class="page-search-clear" id="clearReleasePtSearch" aria-label="Clear search">✕</button>` : ''}
        </div>
        <select class="filter-select" data-rptfilter="releaseType" aria-label="Release type">
          <option value="">All types</option>
          <option value="upcoming" ${f.releaseType === 'upcoming' ? 'selected' : ''}>Upcoming</option>
          <option value="released" ${f.releaseType === 'released' ? 'selected' : ''}>Released</option>
        </select>
        <select class="filter-select" data-rptfilter="completion" aria-label="Completion">
          <option value="">All statuses</option>
          <option value="incomplete" ${f.completion === 'incomplete' ? 'selected' : ''}>In progress</option>
          <option value="completed" ${f.completion === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
        ${filtersActive ? `<button class="btn-ghost rpa-tool-btn" id="clearReleasePtFilters">Clear filters</button>` : ''}
        <div class="rpa-toolbar-right">
          <span class="rpa-showing">${list.length} of ${total}</span>
          <div class="rpa-expand-group">
            <button type="button" class="rpa-tool-btn" data-action="rpa-expand-all" title="Expand all">Expand all</button>
            <button type="button" class="rpa-tool-btn" data-action="rpa-collapse-all" title="Collapse all">Collapse all</button>
          </div>
          <button type="button" class="btn-primary rpa-new" data-action="new-release-pt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            New Release Point
          </button>
        </div>
      </div>
      ${chipData.length ? chips : ''}

      ${list.length ? group('In progress', active, 'active') + group('Completed', done, 'done') : `
        <div class="rpa-empty">
          <span class="rpa-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></span>
          <h3>${filtersActive ? 'No release points match' : 'No release points yet'}</h3>
          <p>${filtersActive ? 'Try a different search or clear the filters.' : 'Create a release readiness checklist for an upcoming version.'}</p>
          ${filtersActive ? '' : `<button type="button" class="btn-primary" data-action="new-release-pt" style="margin-top:14px;">New Release Point</button>`}
        </div>`}
    </div>`;
};

// Expand/collapse without re-rendering (keeps scroll position and focus).
const toggleRpAccordion = (id, open) => {
  if (!state.rpExpanded) state.rpExpanded = new Set();
  const el = document.querySelector(`.rpa-item[data-id="${id}"]`);
  const isOpen = el ? el.classList.contains('open') : state.rpExpanded.has(id);
  const next = open === undefined ? !isOpen : open;
  if (next) state.rpExpanded.add(id); else state.rpExpanded.delete(id);
  if (el) {
    el.classList.toggle('open', next);
    const btn = el.querySelector('.rpa-summary');
    if (btn) btn.setAttribute('aria-expanded', String(next));
  }
};

// Jump from elsewhere (e.g. the Dashboard) to one Release Point, opened and visible.
const openReleasePointOnPage = (id) => {
  if (!(state.releasePoints || []).some(rp => rp.id === id)) return;
  if (!state.rpExpanded) state.rpExpanded = new Set();
  state.rpExpanded.add(id);
  state.releasePtSearch = '';
  state.releasePtFilters = { project: '', releaseType: '', completion: '' };
  setView('releasepoints');
  const el = document.querySelector(`.rpa-item[data-id="${id}"]`);
  if (el) { el.scrollIntoView({ block: 'start', behavior: 'instant' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
};

// In-place update after ticking a checklist item (no re-render, so the row stays
// where it is even when it becomes complete; it moves group on the next render).
const patchReleasePtCard = (rp) => {
  const el = document.querySelector(`.rpa-item[data-id="${rp.id}"]`);
  if (!el) { render(); return; }
  const s = rpStats(rp);
  (rp.checklistItems || []).forEach(item => {
    const itemEl = el.querySelector(`.rp-checklist-item[data-item-id="${item.id}"]`);
    if (itemEl) { itemEl.classList.toggle('done', !!item.done); itemEl.setAttribute('aria-checked', item.done ? 'true' : 'false'); }
  });
  el.classList.toggle('is-complete', s.complete);
  const ring = el.querySelector('[data-rpa="ring"]');
  if (ring) ring.outerHTML = rpMiniRing(s.pct, s.complete);
  const bar = el.querySelector('[data-rpa="bar"]');
  if (bar) bar.style.width = `${s.pct}%`;
  const count = el.querySelector('[data-rpa="count"]');
  if (count) count.textContent = `${s.done}/${s.total}`;
  const summary = el.querySelector('[data-rpa="summary"]');
  if (summary) summary.textContent = s.complete ? 'All checks passed' : s.total ? `${s.total - s.done} of ${s.total} remaining` : 'No checklist items yet';
};

// ─── Release Project Version Modal & Automation ─────────────
const openReleaseVersionModal = (projectId, platform) => {
  const p = state.projects.find(proj => proj.id === projectId);
  if (!p) return;

  const formatVersionLabel = (v) => {
    if (!v) return '';
    return v.toLowerCase().startsWith('v') ? v : 'v' + v;
  };

  let prevVer = '';
  let upVer = '';

  if (platform === 'android') {
    prevVer = p.androidPreviousVersion || '';
    upVer = p.androidUpcomingVersion || '';
  } else if (platform === 'ios') {
    prevVer = p.iosPreviousVersion || '';
    upVer = p.iosUpcomingVersion || '';
  } else {
    prevVer = p.previousVersion || '';
    upVer = p.upcomingVersion || p.version || '';
  }

  // The current (upcoming) version is what gets released now; the dialog asks for the
  // version after it, with Patch / Minor / Major worked out from the one being released.
  const releasingVer = upVer || (prevVer ? incrementVersion(prevVer) : '1.0.0');

  const platformName = platform === 'android' ? 'Android' : (platform === 'ios' ? 'iOS' : 'Web');

  const pIdInput = document.getElementById('releaseVersionProjectId');
  const platInput = document.getElementById('releaseVersionPlatform');
  const pNameEl = document.getElementById('releaseVersionProjectName');
  const pBadgeEl = document.getElementById('releaseVersionPlatformBadge');
  const prevValEl = document.getElementById('releaseVersionPrevVal');
  const nextInput = document.getElementById('nextReleaseVersionInput');

  if (pIdInput) pIdInput.value = projectId;
  if (platInput) platInput.value = platform;
  if (pNameEl) pNameEl.textContent = p.name;
  if (pBadgeEl) pBadgeEl.textContent = platformName;
  if (prevValEl) prevValEl.textContent = prevVer ? formatVersionLabel(prevVer) : 'None (first release)';
  const curInput = document.getElementById('releaseVersionCurrent');
  const curValEl = document.getElementById('releaseVersionCurrentVal');
  if (curInput) curInput.value = releasingVer;
  if (curValEl) curValEl.textContent = formatVersionLabel(releasingVer);

  // Suggestions for the next version, from the version being released.
  const suggestions = getSemverSuggestions(releasingVer);
  const patchEl = document.getElementById('presetPatchVer');
  const minorEl = document.getElementById('presetMinorVer');
  const majorEl = document.getElementById('presetMajorVer');

  if (patchEl) patchEl.textContent = suggestions.patch;
  if (minorEl) minorEl.textContent = suggestions.minor;
  if (majorEl) majorEl.textContent = suggestions.major;

  // Patch is preselected; Minor / Major or a custom version can be chosen instead.
  const selectedVer = suggestions.patch;
  const activePresetType = 'patch';

  document.querySelectorAll('#releaseVersionPresets .ver-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === activePresetType);
  });

  if (nextInput) {
    nextInput.value = selectedVer;
    setTimeout(() => {
      nextInput.focus();
      nextInput.select();
    }, 50);
  }

  showModal('releaseVersionModal');
};

const confirmReleaseVersion = async () => {
  const projectId = document.getElementById('releaseVersionProjectId')?.value;
  const platform = document.getElementById('releaseVersionPlatform')?.value;
  const nextInput = document.getElementById('nextReleaseVersionInput');
  const releaseVer = (document.getElementById('releaseVersionCurrent')?.value || '').trim();
  const nextVer = (nextInput?.value || '').trim();

  if (!nextVer) {
    showToast('Please choose the next version');
    if (nextInput) nextInput.focus();
    return;
  }
  const norm = (v) => v.toLowerCase().replace(/^v/, '').trim();
  if (releaseVer && norm(nextVer) === norm(releaseVer)) {
    showToast('The next version must be different from the version being released', 'error');
    if (nextInput) nextInput.focus();
    return;
  }

  closeModals();
  await releaseProjectVersion(projectId, platform, releaseVer || null, nextVer);
};

// Marks releaseVer (default: the current upcoming version) as released and sets the
// project's current version to nextVer (default: a patch bump of the released version).
const releaseProjectVersion = async (projectId, platform, releaseVer = null, nextVer = null) => {
  const p = state.projects.find(proj => proj.id === projectId);
  if (!p) return;
  const now = new Date().toISOString();

  const formatVersionLabel = (v) => {
    if (!v) return '';
    return v.toLowerCase().startsWith('v') ? v : 'v' + v;
  };

  let releasedVersion = releaseVer;

  if (platform === 'android') {
    if (!releasedVersion) {
      releasedVersion = p.androidUpcomingVersion || incrementVersion(p.androidPreviousVersion || '1.0.0');
    }
    p.androidPreviousVersion = releasedVersion;
    p.androidUpcomingVersion = nextVer || incrementVersion(releasedVersion);
    p.lastReleaseLog = `Android ${formatVersionLabel(releasedVersion)} released`;
  } else if (platform === 'ios') {
    if (!releasedVersion) {
      releasedVersion = p.iosUpcomingVersion || incrementVersion(p.iosPreviousVersion || '1.0.0');
    }
    p.iosPreviousVersion = releasedVersion;
    p.iosUpcomingVersion = nextVer || incrementVersion(releasedVersion);
    p.lastReleaseLog = `iOS ${formatVersionLabel(releasedVersion)} released`;
  } else {
    // web
    if (!releasedVersion) {
      releasedVersion = p.upcomingVersion || p.version || incrementVersion(p.previousVersion || '1.0.0');
    }
    p.previousVersion = releasedVersion;
    p.upcomingVersion = nextVer || incrementVersion(releasedVersion);
    p.lastReleaseLog = `${formatVersionLabel(releasedVersion)} released`;
  }

  // Check if a release exists in Release Management for this project and version
  const vNorm = releasedVersion.toLowerCase().replace(/^v/, '').trim();
  const matchingRelease = (state.releases || []).find(r => {
    const projIds = r.projectIds || (r.projectId ? [r.projectId] : []);
    const vers = r.versions || (r.version ? [r.version] : []);
    const pMatch = projIds.includes(projectId);
    const vMatch = vers.some(v => (v || '').toLowerCase().replace(/^v/, '').trim() === vNorm);
    return pMatch && (vMatch || vers.length === 0);
  });

  const effectiveReleaseDate = (matchingRelease && matchingRelease.releaseDate) ? matchingRelease.releaseDate : now;

  p.lastReleaseAt = effectiveReleaseDate;
  p.updatedAt = now;

  p.releaseHistory = p.releaseHistory || [];
  p.releaseHistory.unshift({
    version: releasedVersion,
    platform: platform.toUpperCase(),
    releasedAt: effectiveReleaseDate,
    log: p.lastReleaseLog
  });
  if (p.releaseHistory.length > 10) {
    p.releaseHistory = p.releaseHistory.slice(0, 10);
  }

  // Log activity
  const nextTargetVer = (platform === 'android' ? p.androidUpcomingVersion : (platform === 'ios' ? p.iosUpcomingVersion : p.upcomingVersion));
  logActivity(`Project "${p.name}" version ${releasedVersion} (${platform.toUpperCase()}) was marked as released! 🚀 Next upcoming version set to ${nextTargetVer}`, 'project');
  showToast(`🚀 Version ${releasedVersion} released!`);

  await storage.save();
  render();
};

// ─── Toggle Checklist Item ────────────────────────────────
const toggleReleasePtChecklistItem = async (rpId, itemId) => {
  const rp = (state.releasePoints || []).find(r => r.id === rpId);
  if (!rp) return;
  const item = (rp.checklistItems || []).find(i => i.id === itemId);
  if (!item) return;
  item.done = !item.done;
  rp.isCompleted = rp.checklistItems.length > 0 && rp.checklistItems.every(i => i.done);
  rp.updatedAt = new Date().toISOString();
  if (rp.isCompleted) {
    logActivity(`Release point "${rp.title}" marked as completed! 🎉`, 'project');
    showToast('🎉 All items complete – Release Point completed!');
  }
  await storage.save();
  patchReleasePtCard(rp);
};

// ─── Release Points Modal ─────────────────────────────────
let rpChecklistItems = []; // local checklist buffer

const populateReleasePtVersions = (projectIdOrIds, selectedVersions = []) => {
  const container = document.getElementById('releasePtVersions');
  if (!container) return;
  const pids = Array.isArray(projectIdOrIds) ? projectIdOrIds : (projectIdOrIds ? [projectIdOrIds] : []);
  if (pids.length === 0) {
    container.innerHTML = emptyNote('Select project(s) first.');
    return;
  }
  let html = '';
  pids.forEach(pid => {
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    const versions = getProjectVersions(proj);
    if (versions.length > 0) {
      html += `<div style="font-weight:600; font-size:11.5px; color:var(--text-secondary); width:100%; margin-top:8px; margin-bottom:4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">${proj.name}</div>`;
      html += versions.map(v => `
        <label class="rp-version-checkbox-label">
          <input type="checkbox" name="rpVersionCheck" value="${v}" ${selectedVersions.includes(v) ? 'checked' : ''} />
          ${v}
        </label>
      `).join('');
    }
  });
  if (!html) {
    container.innerHTML = emptyNote('No versions configured for the selected project(s).');
  } else {
    container.innerHTML = html;
  }
};

const populateReleasePtReleases = (projectIdOrIds, selectedReleaseId = '') => {
  const select = document.getElementById('releasePtRelease');
  if (!select) return;
  const pids = Array.isArray(projectIdOrIds) ? projectIdOrIds : (projectIdOrIds ? [projectIdOrIds] : []);
  if (pids.length === 0) {
    select.innerHTML = `<option value="">— Select Release —</option>`;
    return;
  }
  // Any release that includes one of the selected projects (not just its first project).
  const projectReleases = (state.releases || []).filter(r => releaseProjectIdsOf(r).some(id => pids.includes(id)));
  select.innerHTML = `<option value="">— Select Release —</option>` +
    projectReleases.map(r => {
      const proj = state.projects.find(p => p.id === releaseProjectIdsOf(r).find(id => pids.includes(id)));
      const prefix = proj ? `${proj.name}: ` : '';
      const vers = releaseVersionsOf(r).join(', ');
      return `<option value="${r.id}" ${selectedReleaseId === r.id ? 'selected' : ''}>${escapeHtml(prefix + (r.name || 'Untitled release') + (vers ? ` (${vers})` : ''))}</option>`;
    }).join('');
};

const populateReleasePtDevs = (projectIdOrIds, selectedDevIds = []) => {
  const container = document.getElementById('releasePtDevChecklist');
  if (!container) return;
  const pids = Array.isArray(projectIdOrIds) ? projectIdOrIds : (projectIdOrIds ? [projectIdOrIds] : []);
  if (pids.length === 0) {
    container.innerHTML = emptyNote('Select project(s) first.');
    return;
  }
  const devs = state.developers.filter(d =>
    (d.projectIds || []).some(pid => pids.includes(pid))
  );
  if (devs.length === 0) {
    container.innerHTML = emptyNote('No developers for the selected project(s).');
    return;
  }
  container.innerHTML = devs.map(d => `
    <label class="dev-project-label">
      <input type="checkbox" name="rpDevCheck" value="${d.id}" ${selectedDevIds.includes(d.id) ? 'checked' : ''} />
      <span>${d.name}</span>
    </label>
  `).join('');
};

const syncChecklistItemsFromDOM = () => {
  document.querySelectorAll('.rp-checklist-row').forEach(row => {
    const idx = parseInt(row.dataset.clIdx);
    if (rpChecklistItems[idx]) {
      const textInp = row.querySelector('.rp-cl-text');
      const ticketInp = row.querySelector('.rp-cl-ticket');
      const devSel = row.querySelector('.rp-cl-developer');
      if (textInp) rpChecklistItems[idx].text = textInp.value;
      if (ticketInp) rpChecklistItems[idx].ticket = ticketInp.value;
      if (devSel) rpChecklistItems[idx].developerId = devSel.value;
    }
  });
};

const renderChecklistEditor = () => {
  const container = document.getElementById('checklistItemsContainer');
  if (!container) return;
  if (rpChecklistItems.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;font-style:italic;text-align:center;padding:8px 0;">Click "Add Item" to add checklist items.</div>';
    return;
  }

  // Get currently selected projects in the modal to filter developers
  const projectChecks = document.querySelectorAll('input[name="rpProjectCheck"]:checked');
  const projectIds = Array.from(projectChecks).map(cb => cb.value);
  let filteredDevs = state.developers;
  if (projectIds.length > 0) {
    filteredDevs = state.developers.filter(d =>
      (d.projectIds || []).some(pid => projectIds.includes(pid))
    );
  }

  container.innerHTML = rpChecklistItems.map((item, idx) => {
    const devOptions = `<option value="">${item.jiraAssignee ? `Jira: ${escapeHtml(item.jiraAssignee)}` : '— Assignee —'}</option>` +
      filteredDevs.map(d => `<option value="${d.id}" ${item.developerId === d.id ? 'selected' : ''}>${d.name}</option>`).join('');

    return `
      <div class="rp-checklist-row" data-cl-idx="${idx}">
        <div class="rp-cl-fields">
          <input type="text" class="rp-cl-text" data-idx="${idx}" value="${item.text.replace(/"/g, '&quot;')}" placeholder="e.g. QA sign-off received" />
          <div class="rp-cl-row-bottom">
            <input type="text" class="rp-cl-ticket" data-idx="${idx}" value="${(item.ticket || '').replace(/"/g, '&quot;')}" placeholder="Ticket # or full URL (e.g. https://…)" />
            <select class="rp-cl-developer" data-idx="${idx}">
              ${devOptions}
            </select>
          </div>
        </div>
        <button type="button" class="rp-checklist-remove-btn" data-idx="${idx}" aria-label="Remove item" title="Remove item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    `;
  }).join('');

  // Wire delete buttons directly (they are inside the modal, not mainContent)
  container.querySelectorAll('.rp-checklist-remove-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      syncChecklistItemsFromDOM();
      const idx = parseInt(btn.dataset.idx);
      rpChecklistItems.splice(idx, 1);
      renderChecklistEditor();
      showToast('Checklist item removed');
    };
  });
};

const loadReleasePtProjectsList = (selectedProjectIds = []) => {
  const container = document.getElementById('releasePtProjects');
  if (!container) return;
  container.innerHTML = state.projects.map(p => `
    <label class="dev-project-label">
      <input type="checkbox" name="rpProjectCheck" value="${p.id}" ${selectedProjectIds.includes(p.id) ? 'checked' : ''} />
      <span>${p.name}</span>
    </label>
  `).join('');

  // Wire checkbox change to reload lists
  container.querySelectorAll('input[name="rpProjectCheck"]').forEach(cb => {
    cb.onchange = () => {
      syncChecklistItemsFromDOM();
      const checkedIds = Array.from(container.querySelectorAll('input[name="rpProjectCheck"]:checked')).map(c => c.value);
      populateReleasePtVersions(checkedIds);
      populateReleasePtReleases(checkedIds);
      populateReleasePtDevs(checkedIds);
      renderChecklistEditor();
      updateJiraImportButton();
    };
  });
};

const openReleasePtModal = (id = null) => {
  document.getElementById('releasePtModalTitle').textContent = id ? 'Edit Release Point' : 'New Release Point';
  document.getElementById('releasePtId').value = '';

  if (id) {
    const rp = (state.releasePoints || []).find(r => r.id === id);
    if (!rp) return;
    document.getElementById('releasePtId').value = rp.id;
    document.getElementById('releasePtTitle').value = rp.title;
    document.getElementById('releasePtType').value = rp.releaseType || 'upcoming';

    // Set type toggle UI
    document.querySelectorAll('.rp-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rtype === (rp.releaseType || 'upcoming'));
    });

    const projectIds = rp.projectIds || (rp.projectId ? [rp.projectId] : []);
    loadReleasePtProjectsList(projectIds);
    populateReleasePtVersions(projectIds, rp.versions || []);
    populateReleasePtReleases(projectIds, rp.releaseId || '');
    populateReleasePtDevs(projectIds, rp.developerIds || []);

    rpChecklistItems = (rp.checklistItems || []).map(i => ({ ...i }));
  } else {
    document.getElementById('releasePtTitle').value = '';
    document.getElementById('releasePtRelease').innerHTML = `<option value="">— Select Release —</option>`;
    document.getElementById('releasePtType').value = 'upcoming';
    document.querySelectorAll('.rp-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rtype === 'upcoming');
    });
    loadReleasePtProjectsList([]);
    populateReleasePtVersions([]);
    populateReleasePtDevs([]);
    rpChecklistItems = [];
  }

  // Reset panels to hidden state
  document.getElementById('bulkAddPanel').style.display = 'none';
  document.getElementById('bulkAssignPanel').style.display = 'none';
  closeJiraImportPanel();
  wireJiraImportPanel();
  updateJiraImportButton();
  document.getElementById('jiraImportToggleBtn').onclick = () => {
    if (jiraImport || document.getElementById('jiraImportPanel').style.display !== 'none') { closeJiraImportPanel(); return; }
    syncChecklistItemsFromDOM(); // so duplicate detection sees unsaved edits
    openJiraImportPanel();
  };

  renderChecklistEditor();

  // Wire type toggle
  document.querySelectorAll('.rp-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.rp-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('releasePtType').value = btn.dataset.rtype;
    };
  });

  // Wire add checklist item button
  document.getElementById('addChecklistItemBtn').onclick = () => {
    syncChecklistItemsFromDOM();
    rpChecklistItems.push({ id: uid(), text: '', ticket: '', developerId: '', done: false });
    renderChecklistEditor();
    const inputs = document.querySelectorAll('.rp-cl-text');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };

  // Wire bulk add panel
  const bulkAddPanel = document.getElementById('bulkAddPanel');
  document.getElementById('bulkAddToggleBtn').onclick = () => {
    const visible = bulkAddPanel.style.display !== 'none';
    bulkAddPanel.style.display = visible ? 'none' : 'block';
    document.getElementById('bulkAssignPanel').style.display = 'none';
    if (!visible) document.getElementById('bulkCountInput').focus();
  };
  document.getElementById('bulkCountDecBtn').onclick = () => {
    const inp = document.getElementById('bulkCountInput');
    inp.value = Math.max(1, parseInt(inp.value || '3') - 1);
  };
  document.getElementById('bulkCountIncBtn').onclick = () => {
    const inp = document.getElementById('bulkCountInput');
    inp.value = Math.min(50, parseInt(inp.value || '3') + 1);
  };
  document.getElementById('bulkAddConfirmBtn').onclick = () => {
    const count = Math.max(1, Math.min(50, parseInt(document.getElementById('bulkCountInput').value) || 3));
    syncChecklistItemsFromDOM();
    for (let i = 0; i < count; i++) {
      rpChecklistItems.push({ id: uid(), text: '', ticket: '', developerId: '', done: false });
    }
    bulkAddPanel.style.display = 'none';
    renderChecklistEditor();
    const inputs = document.querySelectorAll('.rp-cl-text');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };

  // Wire bulk assign panel
  const bulkAssignPanel = document.getElementById('bulkAssignPanel');
  document.getElementById('bulkAssignToggleBtn').onclick = () => {
    const visible = bulkAssignPanel.style.display !== 'none';
    bulkAssignPanel.style.display = visible ? 'none' : 'block';
    bulkAddPanel.style.display = 'none';
    if (!visible) {
      const projectChecks = document.querySelectorAll('input[name="rpProjectCheck"]:checked');
      const projectIds = Array.from(projectChecks).map(cb => cb.value);
      let devs = state.developers;
      if (projectIds.length > 0) {
        devs = state.developers.filter(d => (d.projectIds || []).some(pid => projectIds.includes(pid)));
      }
      const sel = document.getElementById('bulkAssignDevSelect');
      sel.innerHTML = '<option value="">— Select Developer —</option>' +
        devs.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    }
  };
  document.getElementById('bulkAssignConfirmBtn').onclick = () => {
    const devId = document.getElementById('bulkAssignDevSelect').value;
    if (!devId) { showToast('Please select a developer first', 'error'); return; }
    syncChecklistItemsFromDOM();
    rpChecklistItems.forEach(item => { item.developerId = devId; });
    bulkAssignPanel.style.display = 'none';
    renderChecklistEditor();
    showToast('Developer assigned to all items');
  };

  showModal('releasePtModal');
};

const saveReleasePoint = async () => {
  syncChecklistItemsFromDOM();

  const id = document.getElementById('releasePtId').value;
  let savedRpId = id;
  const title = document.getElementById('releasePtTitle').value.trim();
  const projectChecks = document.querySelectorAll('input[name="rpProjectCheck"]:checked');
  const projectIds = Array.from(projectChecks).map(cb => cb.value);
  const projectId = projectIds.length > 0 ? projectIds[0] : '';
  const releaseId = document.getElementById('releasePtRelease').value;
  const releaseType = document.getElementById('releasePtType').value || 'upcoming';

  if (!title) { showToast('Release point title is required', 'error'); return; }
  if (projectIds.length === 0) { showToast('Please select at least one project', 'error'); return; }

  const versionChecks = document.querySelectorAll('input[name="rpVersionCheck"]:checked');
  const versions = Array.from(versionChecks).map(cb => cb.value);

  const devChecks = document.querySelectorAll('input[name="rpDevCheck"]:checked');
  const developerIds = Array.from(devChecks).map(cb => cb.value);

  const checklistItems = rpChecklistItems.filter(i => i.text.trim() !== '');
  if (checklistItems.length === 0) { showToast('Add at least one checklist item', 'error'); return; }

  const isCompleted = checklistItems.length > 0 && checklistItems.every(i => i.done);
  const now = new Date().toISOString();

  if (id) {
    const idx = (state.releasePoints || []).findIndex(r => r.id === id);
    if (idx === -1) return;
    state.releasePoints[idx] = {
      ...state.releasePoints[idx],
      title, projectId, projectIds, releaseId, releaseType, versions, developerIds,
      checklistItems, isCompleted, updatedAt: now
    };
    logActivity(`Updated release point "${title}"`, 'project');
    showToast('Release point updated');
  } else {
    if (!state.releasePoints) state.releasePoints = [];
    const newId = uid();
    state.releasePoints.unshift({
      id: newId, title, projectId, projectIds, releaseId, releaseType, versions,
      developerIds, checklistItems, isCompleted, createdAt: now, updatedAt: now
    });
    logActivity(`Created release point "${title}"`, 'project');
    showToast('Release point created');
    savedRpId = newId;
  }
  // Show what was just saved: keep it open in the Release Points accordion.
  if (!state.rpExpanded) state.rpExpanded = new Set();
  state.rpExpanded.add(savedRpId);

  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
};

const confirmDeleteReleasePt = (id) => {
  const rp = (state.releasePoints || []).find(r => r.id === id);
  if (!rp) return;
  document.getElementById('confirmMessage').textContent = `Delete release point "${rp.title}"? This cannot be undone.`;
  confirmCallback = () => deleteReleasePt(id);
  showModal('confirmModal');
};

const deleteReleasePt = async (id) => {
  const rp = (state.releasePoints || []).find(r => r.id === id);
  if (!rp) return;
  state.releasePoints = state.releasePoints.filter(r => r.id !== id);
  logActivity(`Deleted release point "${rp.title}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  updateStorageInfo();
  showToast('Release point deleted');
};

// =======================================================
// Test Case Management Core Logic & UI Simulation
// =======================================================

const prepopulateMockData = () => {

  // Ensure default developers exist
  if (!state.developers || state.developers.length === 0) {
    state.developers = [
      { id: 'dev-dwip', name: 'Dwip Pandya', projectIds: [] },
      { id: 'dev-albert', name: 'Albert Einstein', projectIds: [] },
      { id: 'dev-marie', name: 'Marie Curie', projectIds: [] }
    ];
  }

  // Prepopulate projects if empty
  if (!state.projects || state.projects.length === 0) {
    const p1Id = 'proj-clair';
    const p2Id = 'proj-mobile';
    state.projects = [
      {
        id: p1Id,
        name: 'Clair Workspace Portal',
        description: 'Web-based core system for tracking developer productivity, insights, tasks, and test automation coverage.',
        projectType: 'web',
        previousVersion: 'v1.0.0',
        upcomingVersion: 'v1.1.0',
        statuses: ['Stable', 'Testing', 'Automation'],
        createdAt: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: p2Id,
        name: 'Clair iOS & Android App',
        description: 'Mobile clients for real-time task notifications, release checklist signs, and system overview dashboard widgets.',
        projectType: 'app',
        androidPreviousVersion: 'v2.1.0',
        androidUpcomingVersion: 'v2.2.0',
        iosPreviousVersion: 'v2.1.2',
        iosUpcomingVersion: 'v2.2.0',
        statuses: ['Started', 'Testing', 'In Progress'],
        createdAt: new Date(Date.now() - 15 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    // Assign dev projectIds
    state.developers.forEach(d => {
      d.projectIds = [p1Id, p2Id];
    });
  }

  const p1Id = state.projects[0].id;
  const p2Id = state.projects[1] ? state.projects[1].id : p1Id;

  // Prepopulate modules if empty
  if (!state.modules || state.modules.length === 0) {
    state.modules = [
      { id: 'mod-auth', projectId: p1Id, name: 'User Authentication', description: 'Covers login, signup, password resets, and session management.' },
      { id: 'mod-billing', projectId: p1Id, name: 'Billing & Subscriptions', description: 'Stripe integration, invoices, upgrades, and discount codes.' },
      { id: 'mod-notify', projectId: p2Id, name: 'Push Notifications', description: 'FCM setup, deep-linking, background polling, and permission dialogs.' },
      { id: 'mod-sync', projectId: p2Id, name: 'Offline Syncing', description: 'SQLite local caching, background workers, and conflict resolution.' }
    ];
  }

  // Prepopulate test cases if empty
  if (!state.testCases || state.testCases.length === 0) {
    state.testCases = [
      {
        id: 'TC-101',
        projectId: p1Id,
        moduleId: 'mod-auth',
        title: 'Verify login with correct credentials and active session redirect',
        scenario: 'Verify login with correct credentials and active session redirect',
        simplifiedScenario: 'Login with correct credentials',
        description: 'Verify that a user who enters active credentials gets redirected to the dashboard page immediately, and a valid token is set in local storage.',
        steps: '1. Go to the login page.\n2. Enter "user@clair.com" and password "ClairPass123!".\n3. Click the Submit button.',
        expected: 'User is redirected to "/dashboard", and token is stored in localStorage.',
        actual: 'User is successfully redirected and token is stored in localStorage.',
        priority: 'Critical',
        severity: 'S2 - Critical',
        status: 'Passed',
        type: 'Automated',
        assignee: 'Dwip Pandya',
        executionDate: '2026-05-28',
        defectId: '',
        comments: 'Verified automatically via selenium scripts. Flow runs smoothly.',
        createdAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-102',
        projectId: p1Id,
        moduleId: 'mod-auth',
        title: 'Verify password strength validator rejecting common strings',
        scenario: 'Verify password strength validator rejecting common strings',
        simplifiedScenario: 'Password strength validator rejection',
        description: 'Registration form should validate password against a blacklist of common weak passwords (e.g. "password", "12345678", "qwerty").',
        steps: '1. Navigate to Registration page.\n2. Fill valid email.\n3. Input "password" as password.\n4. Attempt registration.',
        expected: 'An inline validation error "Password is too weak" is shown, disabling submit button.',
        actual: 'An inline validation error "Password is too weak" is shown, disabling submit button.',
        priority: 'High',
        severity: 'S3 - Major',
        status: 'Passed',
        type: 'Manual',
        assignee: 'Albert Einstein',
        executionDate: '2026-05-27',
        defectId: '',
        comments: 'Verified manually. Checked common variations like 12345678 and qwerty too.',
        createdAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-103',
        projectId: p1Id,
        moduleId: 'mod-billing',
        title: 'Verify coupon code discount is calculated correctly on checkout',
        scenario: 'Verify coupon code discount is calculated correctly on checkout',
        simplifiedScenario: 'Coupon code discount checkout',
        description: 'Verify that applying a validated 10% coupon correctly deducts the amount and updates total cost.',
        steps: '1. Add "Clair Premium Annual Plan" to checkout.\n2. Apply discount code "CLAIR10".\n3. Click Apply.',
        expected: 'Total displays a 10% deduction. Price changes from $120.00 to $108.00.',
        actual: 'Price remained $120.00. Discount was verified in database log but checkout page did not re-calculate.',
        priority: 'High',
        severity: 'S2 - Critical',
        status: 'Failed',
        type: 'Automated',
        assignee: 'Marie Curie',
        executionDate: '2026-05-28',
        defectId: 'BUG-103',
        comments: 'UI failed to trigger reactive total calculations when coupon applied. API call succeeded.',
        createdAt: new Date(Date.now() - 4 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-104',
        projectId: p1Id,
        moduleId: '',
        title: 'Verify dark mode toggle applies stylesheets instantaneously',
        scenario: 'Verify dark mode toggle applies stylesheets instantaneously',
        simplifiedScenario: 'Dark mode toggle stylesheets',
        description: 'Dark mode selection should change root variables without a page reload or white flash.',
        steps: '1. Navigate to Settings page.\n2. Click the Dark Theme toggle button.',
        expected: 'The interface color theme shifts instantly to dark theme. Value is cached in local preferences.',
        actual: '',
        priority: 'Medium',
        severity: 'S4 - Minor',
        status: 'Blocked',
        type: 'Manual',
        assignee: 'Dwip Pandya',
        executionDate: '',
        defectId: '',
        comments: 'Blocked pending landing page consolidation layout pull request.',
        createdAt: new Date(Date.now() - 4 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-105',
        projectId: p2Id,
        moduleId: 'mod-notify',
        title: 'Verify FCM token registration upon application launch',
        scenario: 'Verify FCM token registration upon application launch',
        simplifiedScenario: 'FCM token registration',
        description: 'Device token should be fetched from Firebase and sent to Clair backend upon notification consent.',
        steps: '1. Install clean build and launch application.\n2. Click Accept on Notification prompt.',
        expected: 'Device registered success payload sent to backend API, token saved in device config.',
        actual: '',
        priority: 'Critical',
        severity: 'S1 - Blocker',
        status: 'Untested',
        type: 'Automated',
        assignee: 'Dwip Pandya',
        executionDate: '',
        defectId: '',
        comments: 'Need Android emulator test accounts configured first.',
        createdAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-106',
        projectId: p2Id,
        moduleId: 'mod-notify',
        title: 'Verify app launch redirection when clicking a push notification',
        scenario: 'Verify app launch redirection when clicking a push notification',
        simplifiedScenario: 'App launch redirect notification',
        description: 'Verify deep-linking path works when clicking notification while app is running in background.',
        steps: '1. Put app in background.\n2. Send push with custom data: url="clair://app/tasks/101".\n3. Click notification toast.',
        expected: 'App opens in foreground and loads Task #101 detail screen immediately.',
        actual: 'App crashed with NullPointerException when attempting to unpack deep-link bundle.',
        priority: 'High',
        severity: 'S2 - Critical',
        status: 'Failed',
        type: 'Manual',
        assignee: 'Albert Einstein',
        executionDate: '2026-05-26',
        defectId: 'BUG-204',
        comments: 'Crash occurs consistently on iOS 16 devices. Android passes.',
        createdAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TC-107',
        projectId: p2Id,
        moduleId: 'mod-sync',
        title: 'Verify SQLite database updates sync to cloud on network reconnect',
        scenario: 'Verify SQLite database updates sync to cloud on network reconnect',
        simplifiedScenario: 'Offline SQLite database sync',
        description: 'Offline created actions should trigger sync worker when connection goes from offline to online.',
        steps: '1. Enable offline mode in app settings.\n2. Complete 2 tasks.\n3. Turn network back online.',
        expected: 'Background sync runs, cloud database updates tasks, SQLite local indicators change to synced.',
        actual: 'Background sync completed after 5 seconds, all items successfully synchronized to cloud.',
        priority: 'High',
        severity: 'S3 - Major',
        status: 'Passed',
        type: 'Automated',
        assignee: 'Marie Curie',
        executionDate: '2026-05-28',
        defectId: '',
        comments: 'Sync verified on both Android and iOS devices. Logs match.',
        createdAt: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }
};
