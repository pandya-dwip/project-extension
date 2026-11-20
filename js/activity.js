// Clair — js/activity.js: Activity timeline.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Activity ────────────────────────────────────────────
const ACTIVITY_TYPES = [
  { key: 'task', label: 'Tasks' },
  { key: 'project', label: 'Projects' },
  { key: 'delete', label: 'Deletions' }
];
const renderActivity = () => {
  const all = state.activity || [];
  const now = new Date();
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = dayKey(now);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const weekAgo = now.getTime() - 7 * 86400000;
  const todayEvents = all.filter(x => dayKey(new Date(x.at)) === todayKey).length;
  const weekEvents = all.filter(x => new Date(x.at).getTime() >= weekAgo).length;
  const count = (k) => all.filter(x => x.type === k).length;
  const hero = buildPageHero({
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    title: 'Activity',
    subtitle: 'Every change made in Clair, newest first (last 200 events).',
    stats: [
      { label: 'Events', value: all.length },
      { label: 'Today', value: todayEvents, color: '#4ade80' },
      { label: 'Last 7 days', value: weekEvents },
      { label: 'Task changes', value: count('task') },
      { label: 'Project changes', value: count('project') },
      { label: 'Deletions', value: count('delete'), color: count('delete') ? '#f87171' : undefined }
    ]
  });
  if (!all.length) {
    return `${hero}${emptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
      'No activity yet',
      'Start creating projects and tasks — every action will be tracked here.'
    )}`;
  }
  const f = state.activityFilter || '';
  const q = (state.activitySearch || '').trim().toLowerCase();
  const list = all.filter(x => (!f || x.type === f) && (!q || String(x.text || '').toLowerCase().includes(q)));
  const groups = [];
  list.forEach(x => {
    const d = new Date(x.at);
    const k = dayKey(d);
    let g = groups[groups.length - 1];
    if (!g || g.k !== k) {
      const label = k === todayKey ? 'Today' : k === dayKey(yest) ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
      g = { k, label, items: [] };
      groups.push(g);
    }
    g.items.push(x);
  });
  const ICON = {
    task: '<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
    project: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
    delete: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>'
  };
  const chip = (k, l, n) => `<button type="button" class="rpa-chip ${f === k ? 'active' : ''}" data-action="activity-filter" data-filter="${k}">${l} <span>${n}</span></button>`;
  return `
    ${hero}
    <div class="filters-bar tk-toolbar std-toolbar">
      <div class="page-search-wrap">
        <svg class="page-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="page-search-input" id="activitySearchInput" placeholder="Search activity…" value="${escapeHtml(state.activitySearch || '')}" />
      </div>
      <div class="act-chips">${chip('', 'All', all.length)}${ACTIVITY_TYPES.map(t => chip(t.key, t.label, count(t.key))).join('')}</div>
      <span class="rpa-showing tk-showing">${list.length === all.length ? `${all.length} events` : `${list.length} of ${all.length} events`}</span>
    </div>
    ${groups.length ? `<div class="act-timeline">${groups.map(g => `
      <section class="act-day">
        <h3 class="act-day-title">${g.label}<span class="rpa-group-count">${g.items.length}</span></h3>
        <div class="act-items">
          ${g.items.map(x => `
            <div class="act-item act-${escapeHtml(x.type || 'task')}">
              <span class="act-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICON[x.type] || ICON.task}</svg></span>
              <span class="act-text">${highlight(escapeHtml(x.text || ''), q)}</span>
              <time class="act-time" datetime="${escapeHtml(x.at || '')}">${fmtTime(x.at)}</time>
            </div>`).join('')}
        </div>
      </section>`).join('')}</div>` : '<div class="rpa-empty"><h3>No matching activity</h3><p>Try a different search or type.</p></div>'}
  `;
};
