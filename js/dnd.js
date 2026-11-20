// Clair — js/dnd.js: Drag and drop.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Drag and Drop ───────────────────────────────────────
window.allowDrop = (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};

window.handleDragLeave = (e) => {
  e.currentTarget.classList.remove('drag-over');
};

window.dropTask = async (taskId, newStatus) => {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || task.status === newStatus) return;
  const oldStatus = task.status || 'To-Do';
  task.status = newStatus;
  if (newStatus !== 'Done') {
    task.completedDate = null;
    task.updatedAt = new Date().toISOString();
    logActivity(`Moved task "${task.title}" from ${oldStatus} to ${newStatus}`, 'task');
    await storage.save();
    render();
    showToast(`Task moved to ${newStatus}`);
  } else {
    // Show completion date picker before saving
    const todayIso = new Date().toISOString().split('T')[0];
    document.getElementById('completionTaskId').value = taskId;
    document.getElementById('completionDateInput').value = todayIso;
    // Temporarily store the old/new status for the modal callback
    document.getElementById('completionDateModal').dataset.oldStatus = oldStatus;
    showModal('completionDateModal');
  }
};


const renderTaskCard = (t, q = '') => {
  const projNames = getTaskProjectNames(t);
  const maxVisibleProjTags = 2;
  const visibleProjNames = projNames.slice(0, maxVisibleProjTags);
  const extraProjCount = projNames.length - visibleProjNames.length;
  const alerts = getTaskAlert(t.endDate, t.status);
  const stage = getTaskStage(t);
  const stageClass = `stage-${stage}`;

  return `
    <div class="task-card ${stageClass} ${alerts.card}" data-id="${t.id}" draggable="true">
      <!-- Top header row for Project Tag and Priority Badge -->
      <div class="task-card-header-row">
        <span class="task-project-tags-wrap" ${projNames.length ? `title="${projNames.join(', ')}"` : ''}>
          ${visibleProjNames.map(name => `<span class="task-project-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:10px;height:10px;margin-right:4px;"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>${name}</span>`).join('')}
          ${extraProjCount > 0 ? `<span class="task-project-tag task-project-tag-more">+${extraProjCount}</span>` : ''}
        </span>
        <span class="priority-pill ${String(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
      </div>

      <!-- Title row containing Checkbox and Title -->
      <div class="task-title-row">
        <div class="task-check" title="Mark done" data-action="complete-task"></div>
        <div class="task-title">${highlight(t.title, q)}</div>
      </div>

      <!-- Indented section for Description, Tags, and Footer Meta -->
      <div class="task-indented-content">
        ${t.description ? `<div class="task-desc">${highlight(formatCardDescription(t.description), q)}</div>` : ''}
        ${t.workDone ? `<div class="task-desc task-work-done"><strong>Work done:</strong> ${highlight(formatCardDescription(t.workDone), q)}</div>` : ''}

        ${(t.tags && t.tags.length) ? `
          <div class="task-tags">
            ${t.tags.map(tag => `<span class="tag-pill ${getTagClass(tag)}">${highlight(tag, q)}</span>`).join('')}
          </div>
        ` : ''}

        <!-- Footer metadata rows -->
        <div class="task-meta-footer">
          <div class="task-meta-row">
            ${(t.developerIds && t.developerIds.length) ? `
              <span class="task-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                ${highlight(getTaskDevNames(t).join(', '), q)}
              </span>
            ` : `<span class="task-meta-item"></span>`}
            <span class="task-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${timeAgo(t.updatedAt || t.createdAt)}
            </span>
          </div>
          ${(t.startDate || t.endDate) ? `
            <div class="task-meta-row">
              <span class="task-meta-item ${alerts.text}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                ${t.startDate ? fmtDate(t.startDate) : '–'} ${t.endDate ? `→ ${fmtDate(t.endDate)}` : ''}
              </span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Actions (Edit/Delete) floating overlay -->
      <div class="task-actions">
        <button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="Edit" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-task" data-id="${t.id}" aria-label="Delete" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  `;
};

window.dragTask = (e) => {
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
  e.currentTarget.classList.add('dragging');
};

document.addEventListener('dragend', e => {
  if (e.target.classList && e.target.classList.contains('task-card')) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  }
});

window.completeTask = async (id) => {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    const oldStatus = task.status || 'To-Do';
    if (oldStatus === 'Done') return; // Already done
    task.status = 'Done';
    task.completedDate = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    logActivity(`Completed task "${task.title}"`, 'task');
    await storage.save();
    render();
    showToast('Task marked as Done');
  }
};
