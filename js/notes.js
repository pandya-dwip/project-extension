// Clair — js/notes.js: Notes.
// Part of the former app.js, loaded in order by index.html (classic scripts share one global scope).

// ─── Notes Module ─────────────────────────────────────────

const isTableSeparator = (str) => {
  const t = str.trim();
  if (!t.includes('-')) return false;
  return /^\|?(\s*:?-{2,}:?\s*\|)+(\s*:?-{2,}:?\s*\|?)$/.test(t) ||
         /^\|(\s*:?-{2,}:?\s*)\|$/.test(t);
};

const parseRowCells = (rowStr) => {
  let s = rowStr.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  s = s.replace(/\\\|/g, '__ESCAPED_PIPE__');
  return s.split('|').map(c => c.replace(/__ESCAPED_PIPE__/g, '|').trim());
};

const parseMarkdown = (md) => {
  if (!md) return '<p style="color:var(--text-muted);font-style:italic;">Empty note</p>';

  const codeBlocks = [];
  let html = md.replace(/```([\s\S]*?)```/g, (match, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const lines = code.split('\n');
    let body = code;
    if (lines.length > 0 && lines[0].trim() && !lines[0].includes(' ')) {
      body = lines.slice(1).join('\n');
    }
    const escapedCode = escapeHtml(body.trim());
    codeBlocks.push(`<pre><code>${escapedCode}</code></pre>`);
    return placeholder;
  });

  const inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  html = escapeHtml(html);

  const lines = html.split('\n');
  const resultLines = [];
  let inList = false;
  let listType = null;

  const closeList = () => {
    if (inList) {
      resultLines.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
    }
  };

  const usedSlugs = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('__CODE_BLOCK_')) {
      closeList();
      resultLines.push(trimmed);
      continue;
    }

    // Markdown Table: header line containing pipes followed by a separator line
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const headerRow = lines[i];
      const sepRow = lines[i + 1];

      const headerCells = parseRowCells(headerRow);
      const aligns = parseRowCells(sepRow).map(col => {
        const c = col.trim();
        const left = c.startsWith(':');
        const right = c.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
      });

      let tableHtml = '<div class="notes-table-wrap"><table class="notes-table"><thead><tr>';
      headerCells.forEach((cell, idx) => {
        const align = aligns[idx] ? ` style="text-align:${aligns[idx]};"` : '';
        tableHtml += `<th${align}>${parseInlineMarkdown(cell)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      i += 2; // advance past header & separator
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|') || isTableSeparator(rowLine)) {
          i--;
          break;
        }
        const cells = parseRowCells(rowLine);
        tableHtml += '<tr>';
        cells.forEach((cell, idx) => {
          const align = aligns[idx] ? ` style="text-align:${aligns[idx]};"` : '';
          tableHtml += `<td${align}>${parseInlineMarkdown(cell)}</td>`;
        });
        tableHtml += '</tr>';
        i++;
      }

      tableHtml += '</tbody></table></div>';
      resultLines.push(tableHtml);
      continue;
    }

    // Horizontal Rule: ---, ***, ___, etc.
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      closeList();
      resultLines.push('<hr class="notes-hr" />');
      continue;
    }

    // Headings: # to ###### with automatic slug IDs for TOC anchor navigation
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const parsedText = parseInlineMarkdown(headingText);
      const rawText = headingText.replace(/<[^>]+>/g, '').trim();
      const baseSlug = rawText
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s/g, '-');
      let slug = baseSlug;
      let count = 1;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${count++}`;
      }
      usedSlugs.add(slug);
      resultLines.push(`<h${level} id="${slug}">${parsedText}</h${level}>`);
      continue;
    }

    // Blockquotes: > quote text (groups consecutive lines)
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      closeList();
      const bqLines = [];
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        if (curTrim.startsWith('&gt;') || curTrim.startsWith('>')) {
          let text = curTrim.startsWith('&gt;') ? curTrim.slice(4) : curTrim.slice(1);
          if (text.startsWith(' ')) text = text.slice(1);
          bqLines.push(parseInlineMarkdown(text));
          i++;
        } else {
          i--;
          break;
        }
      }
      resultLines.push(`<blockquote>${bqLines.join('<br>')}</blockquote>`);
      continue;
    }

    // Checklist / Task list items
    const checkMatch = trimmed.match(/^- \[(x|X| )\] (.*)$/);
    if (checkMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        resultLines.push('<ul class="notes-task-list" style="list-style:none;padding-left:0;">');
        inList = true;
        listType = 'ul';
      }
      const checked = checkMatch[1].toLowerCase() === 'x' ? 'checked' : '';
      const text = parseInlineMarkdown(checkMatch[2]);
      resultLines.push(`<li class="task-list-item"><input type="checkbox" ${checked} disabled /> <span>${text}</span></li>`);
      continue;
    }

    // Bullet lists with indentation support
    const bulletMatch = trimmed.match(/^[-*] (.*)$/);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        resultLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const indent = line.search(/\S/);
      const indentStyle = indent >= 4 ? ' style="margin-left:36px;"' : (indent >= 2 ? ' style="margin-left:20px;"' : '');
      resultLines.push(`<li${indentStyle}>${parseInlineMarkdown(bulletMatch[1])}</li>`);
      continue;
    }

    // Numbered lists with indentation support
    const numMatch = trimmed.match(/^(\d+)\. (.*)$/);
    if (numMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        resultLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const indent = line.search(/\S/);
      const indentStyle = indent >= 4 ? ' style="margin-left:36px;"' : (indent >= 2 ? ' style="margin-left:20px;"' : '');
      resultLines.push(`<li${indentStyle}>${parseInlineMarkdown(numMatch[2])}</li>`);
      continue;
    }

    // Blank line
    if (!trimmed) {
      closeList();
      if (i > 0 && !lines[i - 1].trim()) {
        resultLines.push('<br>');
      }
      continue;
    }

    closeList();
    resultLines.push(`<p>${parseInlineMarkdown(trimmed)}</p>`);
  }

  closeList();

  let finalHtml = resultLines.join('\n');

  inlineCodes.forEach((codeHtml, i) => {
    finalHtml = finalHtml.replace(`__INLINE_CODE_${i}__`, codeHtml);
  });

  codeBlocks.forEach((codeHtml, i) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${i}__`, codeHtml);
  });

  return finalHtml;
};

const parseInlineMarkdown = (text) => {
  if (!text) return '';
  let str = text;
  // Bold + Italic: ***text*** or ___text___
  str = str.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  str = str.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/(^|[\s(])_([^_]+)_([\s).,;:!?]|$)/g, '$1<em>$2</em>$3');

  // Strikethrough: ~~text~~
  str = str.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Links & Anchors: [text](url)
  str = str.replace(/\[(.*?)\]\((.*?)\)/g, (match, txt, href) => {
    const isAnchor = href.startsWith('#');
    if (isAnchor) return `<a href="${href}">${txt}</a>`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
  });

  return str;
};

const insertMarkdownSyntax = (type) => {
  const textarea = document.getElementById('noteContentInput');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selectedText = val.substring(start, end);

  let replacement = '';
  let cursorOffset = 0;

  switch (type) {
    case 'bold':
      replacement = `**${selectedText || 'bold text'}**`;
      cursorOffset = selectedText ? replacement.length : 2;
      break;
    case 'italic':
      replacement = `*${selectedText || 'italic text'}*`;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    case 'h1':
      replacement = `# ${selectedText || 'Heading 1'}`;
      cursorOffset = replacement.length;
      break;
    case 'h2':
      replacement = `## ${selectedText || 'Heading 2'}`;
      cursorOffset = replacement.length;
      break;
    case 'bullet':
      replacement = `- ${selectedText || 'List item'}`;
      cursorOffset = replacement.length;
      break;
    case 'number':
      replacement = `1. ${selectedText || 'List item'}`;
      cursorOffset = replacement.length;
      break;
    case 'checklist':
      replacement = `- [ ] ${selectedText || 'Task item'}`;
      cursorOffset = replacement.length;
      break;
    case 'quote':
      replacement = `> ${selectedText || 'Quote text'}`;
      cursorOffset = replacement.length;
      break;
    case 'table':
      replacement = `| Column 1 | Column 2 |\n|---|---|\n| Data 1 | Data 2 |`;
      cursorOffset = replacement.length;
      break;
    case 'hr':
      replacement = `\n---\n`;
      cursorOffset = replacement.length;
      break;
    case 'code':
      replacement = `\`${selectedText || 'code'}\``;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    case 'codeblock':
      replacement = `\`\`\`\n${selectedText || 'code block'}\n\`\`\``;
      cursorOffset = selectedText ? replacement.length : 4;
      break;
    case 'link':
      replacement = `[${selectedText || 'Link Title'}](https://example.com)`;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
  }

  textarea.value = val.substring(0, start) + replacement + val.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);

  if (state.activeNoteId) {
    const note = (state.notes || []).find(n => n.id === state.activeNoteId);
    if (note) {
      note.content = textarea.value;
      note.updatedAt = new Date().toISOString();
    }
  }
};

const openFolderModal = (folderId = null, projectId = null, parentId = null) => {
  const input = document.getElementById('folderNameInput');
  const idEl = document.getElementById('folderId');
  const projEl = document.getElementById('folderProjectId');
  const parentEl = document.getElementById('folderParentId');
  const titleEl = document.getElementById('folderModalTitle');

  if (folderId) {
    const f = (state.noteFolders || []).find(x => x.id === folderId);
    if (!f) return;
    titleEl.textContent = f.parentId ? 'Rename Subfolder' : 'Rename Folder';
    idEl.value = f.id;
    projEl.value = f.projectId;
    parentEl.value = f.parentId || '';
    input.value = f.name;
  } else {
    titleEl.textContent = parentId ? 'New Subfolder' : 'New Folder';
    idEl.value = '';
    projEl.value = projectId || state.activeNoteProjectId || '';
    parentEl.value = parentId || '';
    input.value = '';
  }
  showModal('folderModal');
  setTimeout(() => input.focus(), 100);
};

const saveFolder = async () => {
  const name = document.getElementById('folderNameInput').value.trim();
  const id = document.getElementById('folderId').value;
  const projectId = document.getElementById('folderProjectId').value;
  const parentId = document.getElementById('folderParentId').value || null;

  if (!name) {
    showToast('Folder name is required', 'error');
    return;
  }
  if (!projectId) {
    showToast('Project is required', 'error');
    return;
  }

  if (parentId) {
    const parentFolder = (state.noteFolders || []).find(f => f.id === parentId);
    if (parentFolder && parentFolder.parentId) {
      showToast('Nested folders beyond one level are not allowed', 'error');
      return;
    }
  }

  const now = new Date().toISOString();
  if (!state.noteFolders) state.noteFolders = [];

  if (id) {
    const f = state.noteFolders.find(x => x.id === id);
    if (f) {
      f.name = name;
      f.updatedAt = now;
      logActivity(`Renamed folder "${name}"`, 'project');
      showToast('Folder renamed');
    }
  } else {
    const newFolder = {
      id: uid(),
      projectId,
      parentId,
      name,
      createdAt: now,
      updatedAt: now
    };
    state.noteFolders.push(newFolder);
    state.expandedNoteFolderIds.add(newFolder.id);
    if (parentId) {
      state.expandedNoteFolderIds.add(parentId);
    }
    logActivity(parentId ? `Created subfolder "${name}"` : `Created folder "${name}"`, 'project');
    showToast(parentId ? 'Subfolder created' : 'Folder created');
  }

  await storage.save();
  closeModals();
  render();
};

const confirmDeleteFolder = (folderId) => {
  const f = (state.noteFolders || []).find(x => x.id === folderId);
  if (!f) return;
  const isSub = !!f.parentId;
  document.getElementById('confirmMessage').textContent = isSub
    ? `Delete subfolder "${f.name}" and all notes inside it? This cannot be undone.`
    : `Delete folder "${f.name}", its subfolders, and all notes inside them? This cannot be undone.`;
  confirmCallback = () => deleteFolder(folderId);
  showModal('confirmModal');
};

const deleteFolder = async (folderId) => {
  const f = (state.noteFolders || []).find(x => x.id === folderId);
  if (!f) return;

  const isMain = !f.parentId;
  let targetFolderIds = [folderId];

  if (isMain) {
    const subFolderIds = (state.noteFolders || []).filter(sub => sub.parentId === folderId).map(sub => sub.id);
    targetFolderIds = targetFolderIds.concat(subFolderIds);
  }

  state.noteFolders = (state.noteFolders || []).filter(folder => !targetFolderIds.includes(folder.id));
  state.notes = (state.notes || []).filter(n => !targetFolderIds.includes(n.folderId));

  if (targetFolderIds.includes(state.activeNoteFolderId)) {
    state.activeNoteFolderId = null;
  }
  const activeNote = (state.notes || []).find(n => n.id === state.activeNoteId);
  if (!activeNote) {
    state.activeNoteId = null;
  }

  logActivity(`Deleted folder "${f.name}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  showToast('Folder deleted');
};

const createNote = async (projectId, folderId = null) => {
  if (!projectId) {
    showToast('Select a project first', 'error');
    return;
  }
  if (state.activeNoteId) {
    await saveActiveNote(true);
  }
  const now = new Date().toISOString();
  if (!state.notes) state.notes = [];

  const newNote = {
    id: uid(),
    projectId,
    folderId,
    title: 'Untitled Note',
    content: '',
    createdAt: now,
    updatedAt: now
  };

  state.notes.unshift(newNote);
  state.activeNoteId = newNote.id;
  state.activeNoteProjectId = projectId;
  state.activeNoteFolderId = folderId;
  state.noteEditorMode = 'edit';

  logActivity(`Created note "${newNote.title}"`, 'task');
  await storage.save();
  render();
  setTimeout(() => {
    const titleInput = document.getElementById('noteTitleInput');
    if (titleInput) { titleInput.focus(); titleInput.select(); }
  }, 100);
};

const selectNote = async (noteId) => {
  if (state.activeNoteId && state.activeNoteId !== noteId) {
    await saveActiveNote(true);
  }
  const note = (state.notes || []).find(n => n.id === noteId);
  if (!note) return;
  state.activeNoteId = note.id;
  state.activeNoteProjectId = note.projectId;
  state.activeNoteFolderId = note.folderId;
  render();
};

const saveActiveNote = async (silent = false) => {
  if (!state.activeNoteId) return;
  const note = (state.notes || []).find(n => n.id === state.activeNoteId);
  if (!note) return;

  const titleInput = document.getElementById('noteTitleInput');
  const contentInput = document.getElementById('noteContentInput');

  if (titleInput) note.title = titleInput.value.trim() || 'Untitled Note';
  if (contentInput) note.content = contentInput.value;
  note.updatedAt = new Date().toISOString();

  await storage.save();
  if (!silent) {
    logActivity(`Updated note "${note.title}"`, 'task');
    showToast('Note saved');
    render();
  }
};

const confirmDeleteNote = (noteId) => {
  const n = (state.notes || []).find(x => x.id === noteId);
  if (!n) return;
  document.getElementById('confirmMessage').textContent =
    `Delete note "${n.title}"? This action cannot be undone.`;
  confirmCallback = () => deleteNote(noteId);
  showModal('confirmModal');
};

const deleteNote = async (noteId) => {
  const n = (state.notes || []).find(x => x.id === noteId);
  if (!n) return;
  state.notes = (state.notes || []).filter(x => x.id !== noteId);
  if (state.activeNoteId === noteId) {
    state.activeNoteId = null;
  }
  logActivity(`Deleted note "${n.title}"`, 'delete');
  await storage.save();
  closeModals();
  render();
  showToast('Note deleted');
};

const openMoveNoteModal = (noteId) => {
  const n = (state.notes || []).find(x => x.id === noteId);
  if (!n) return;
  document.getElementById('moveNoteId').value = noteId;

  const projSelect = document.getElementById('moveNoteProjectSelect');
  projSelect.innerHTML = (state.projects || []).map(p =>
    `<option value="${p.id}" ${p.id === n.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  updateMoveNoteFolderDropdown(n.projectId, n.folderId);

  projSelect.onchange = (e) => {
    updateMoveNoteFolderDropdown(e.target.value, null);
  };

  showModal('moveNoteModal');
};

const updateMoveNoteFolderDropdown = (projectId, currentFolderId) => {
  const folderSelect = document.getElementById('moveNoteFolderSelect');
  const projFolders = (state.noteFolders || []).filter(f => f.projectId === projectId);
  const mainFolders = projFolders.filter(f => !f.parentId);

  let html = `<option value="">(Project Root - Direct Note)</option>`;
  mainFolders.forEach(mf => {
    html += `<option value="${mf.id}" ${mf.id === currentFolderId ? 'selected' : ''}>📁 ${escapeHtml(mf.name)}</option>`;
    const subFolders = projFolders.filter(sf => sf.parentId === mf.id);
    subFolders.forEach(sf => {
      html += `<option value="${sf.id}" ${sf.id === currentFolderId ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;&nbsp;📂 ${escapeHtml(sf.name)}</option>`;
    });
  });

  folderSelect.innerHTML = html;
};

const saveMoveNote = async () => {
  const noteId = document.getElementById('moveNoteId').value;
  const targetProjectId = document.getElementById('moveNoteProjectSelect').value;
  const targetFolderId = document.getElementById('moveNoteFolderSelect').value || null;

  const note = (state.notes || []).find(n => n.id === noteId);
  if (!note) return;

  note.projectId = targetProjectId;
  note.folderId = targetFolderId;
  note.updatedAt = new Date().toISOString();

  state.activeNoteProjectId = targetProjectId;
  state.activeNoteFolderId = targetFolderId;
  state.activeNoteId = note.id;

  let destName = 'Project root';
  if (targetFolderId) {
    const f = (state.noteFolders || []).find(x => x.id === targetFolderId);
    if (f) destName = f.name;
  }

  logActivity(`Moved note "${note.title}" to "${destName}"`, 'task');
  await storage.save();
  closeModals();
  render();
  showToast('Note moved successfully');
};

const sortNotes = (notesList, sortBy) => {
  if (!notesList) return;
  notesList.sort((a, b) => {
    if (sortBy === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    } else if (sortBy === 'createdAt') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    } else {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    }
  });
};

const renderNotes = () => {
  if (!state.activeNoteProjectId && state.projects.length > 0) {
    state.activeNoteProjectId = state.projects[0].id;
  }

  const activeProject = state.projects.find(p => p.id === state.activeNoteProjectId);

  const projectsHtml = state.projects.length === 0
    ? `<div style="color:var(--text-muted);font-size:12.5px;padding:16px;text-align:center;">No projects created yet</div>`
    : state.projects.map(p => {
      const noteCount = (state.notes || []).filter(n => n.projectId === p.id).length;
      const isActive = p.id === state.activeNoteProjectId;
      return `
          <button class="notes-proj-item ${isActive ? 'active' : ''}" data-action="select-note-project" data-id="${p.id}">
            <svg class="notes-proj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span class="notes-proj-name">${escapeHtml(p.name)}</span>
            <span class="notes-proj-badge">${noteCount}</span>
          </button>
        `;
    }).join('');

  let treeHtml = '';
  const searchQ = (state.noteSearchQuery || '').toLowerCase().trim();

  let selectedFolderIsSubfolder = false;
  if (state.activeNoteFolderId) {
    const selFolder = (state.noteFolders || []).find(f => f.id === state.activeNoteFolderId);
    if (selFolder && selFolder.parentId) {
      selectedFolderIsSubfolder = true;
    }
  }

  if (!activeProject) {
    treeHtml = emptyState(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>`,
      'No Project Selected',
      'Select a project from the left panel to view its notes and folders.'
    );
  } else if (searchQ) {
    const matchingNotes = (state.notes || []).filter(n => {
      const proj = state.projects.find(p => p.id === n.projectId);
      const folder = (state.noteFolders || []).find(f => f.id === n.folderId);
      const projName = proj ? proj.name : '';
      const folderName = folder ? folder.name : '';

      return n.title.toLowerCase().includes(searchQ) ||
        n.content.toLowerCase().includes(searchQ) ||
        projName.toLowerCase().includes(searchQ) ||
        folderName.toLowerCase().includes(searchQ);
    });

    sortNotes(matchingNotes, state.noteSortBy);

    if (matchingNotes.length === 0) {
      treeHtml = `<div style="color:var(--text-muted);font-size:12.5px;padding:32px 16px;text-align:center;font-style:italic;">No notes found matching "${escapeHtml(searchQ)}"</div>`;
    } else {
      treeHtml = matchingNotes.map(n => renderNoteItem(n, searchQ, true)).join('');
    }
  } else {
    const projFolders = (state.noteFolders || []).filter(f => f.projectId === activeProject.id);
    const mainFolders = projFolders.filter(f => !f.parentId);
    const directNotes = (state.notes || []).filter(n => n.projectId === activeProject.id && !n.folderId);
    sortNotes(directNotes, state.noteSortBy);

    let html = '';

    if (directNotes.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:8px 8px 4px 8px;">Direct Notes</div>`;
      html += directNotes.map(n => renderNoteItem(n)).join('');
    }

    if (mainFolders.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 8px 4px 8px;">Folders</div>`;

      mainFolders.forEach(mf => {
        const subFolders = projFolders.filter(sf => sf.parentId === mf.id);
        const folderNotes = (state.notes || []).filter(n => n.folderId === mf.id);
        sortNotes(folderNotes, state.noteSortBy);

        const isExpanded = state.expandedNoteFolderIds.has(mf.id);
        const isFolderActive = state.activeNoteFolderId === mf.id;

        html += `
          <div class="notes-tree-node">
            <div class="notes-folder-row ${isFolderActive ? 'active' : ''}" data-action="select-note-folder" data-id="${mf.id}">
              <svg class="notes-folder-toggle ${isExpanded ? '' : 'collapsed'}" data-action="toggle-note-folder" data-id="${mf.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              <svg class="notes-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              <span class="notes-folder-name">${escapeHtml(mf.name)}</span>
              <div class="notes-folder-actions">
                <button class="icon-btn" data-action="add-subfolder" data-id="${mf.id}" title="New Subfolder" style="padding:2px;width:20px;height:20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="icon-btn" data-action="rename-folder" data-id="${mf.id}" title="Rename Folder" style="padding:2px;width:20px;height:20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn danger" data-action="delete-folder" data-id="${mf.id}" title="Delete Folder" style="padding:2px;width:20px;height:20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                </button>
              </div>
            </div>

            ${isExpanded ? `
              <div class="notes-sub-tree">
                ${folderNotes.map(n => renderNoteItem(n)).join('')}
                ${subFolders.map(sf => {
          const subNotes = (state.notes || []).filter(n => n.folderId === sf.id);
          sortNotes(subNotes, state.noteSortBy);
          const isSubExpanded = state.expandedNoteFolderIds.has(sf.id);
          const isSubActive = state.activeNoteFolderId === sf.id;

          return `
                    <div class="notes-tree-node">
                      <div class="notes-folder-row ${isSubActive ? 'active' : ''}" data-action="select-note-folder" data-id="${sf.id}">
                        <svg class="notes-folder-toggle ${isSubExpanded ? '' : 'collapsed'}" data-action="toggle-note-folder" data-id="${sf.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                        <svg class="notes-subfolder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                        <span class="notes-folder-name">${escapeHtml(sf.name)}</span>
                        <div class="notes-folder-actions">
                          <button class="icon-btn" data-action="rename-folder" data-id="${sf.id}" title="Rename Subfolder" style="padding:2px;width:20px;height:20px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button class="icon-btn danger" data-action="delete-folder" data-id="${sf.id}" title="Delete Subfolder" style="padding:2px;width:20px;height:20px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                          </button>
                        </div>
                      </div>
                      ${isSubExpanded ? `
                        <div class="notes-sub-tree">
                          ${subNotes.map(n => renderNoteItem(n)).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `;
        }).join('')}
              </div>
            ` : ''}
          </div>
        `;
      });
    }

    if (directNotes.length === 0 && mainFolders.length === 0) {
      html = `<div style="color:var(--text-muted);font-size:12.5px;padding:32px 16px;text-align:center;font-style:italic;">No notes or folders in this project yet</div>`;
    }

    treeHtml = html;
  }

  const activeNote = (state.notes || []).find(n => n.id === state.activeNoteId);
  let editorHtml = '';

  if (!activeNote) {
    editorHtml = emptyState(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
      'No Note Selected',
      'Select a note to view or edit, or click "+ New Note" to create one.'
    );
  } else {
    const noteProj = state.projects.find(p => p.id === activeNote.projectId);
    const noteFolder = (state.noteFolders || []).find(f => f.id === activeNote.folderId);
    let breadcrumbPath = noteProj ? escapeHtml(noteProj.name) : 'Project';

    if (noteFolder) {
      if (noteFolder.parentId) {
        const parentFolder = (state.noteFolders || []).find(f => f.id === noteFolder.parentId);
        if (parentFolder) {
          breadcrumbPath += ` / ${escapeHtml(parentFolder.name)}`;
        }
      }
      breadcrumbPath += ` / ${escapeHtml(noteFolder.name)}`;
    }

    const isEditMode = state.noteEditorMode === 'edit';

    editorHtml = `
      <div class="notes-editor-header">
        <div class="notes-editor-top-row">
          <div class="notes-location-breadcrumb">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            <span>${breadcrumbPath}</span>
            <span style="margin: 0 4px;">·</span>
            <span>Updated ${timeAgo(activeNote.updatedAt || activeNote.createdAt)}</span>
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-ghost" data-action="move-active-note" style="padding: 4px 8px; font-size: 11.5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;margin-right:4px;"><path d="M5 9l4-4 4 4"/><path d="M9 5v14"/><path d="M19 15l-4 4-4-4"/><path d="M15 19V5"/></svg>
              Move
            </button>
            <button class="btn-ghost danger" data-action="delete-active-note" style="padding: 4px 8px; font-size: 11.5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Delete
            </button>
            <button class="btn-primary" data-action="save-active-note" style="padding: 4px 12px; font-size: 11.5px;">Save</button>
          </div>
        </div>

        <input type="text" id="noteTitleInput" class="notes-editor-title-input" value="${escapeHtml(activeNote.title)}" placeholder="Note Title..." />
      </div>

      <div class="notes-toolbar-bar">
        <div class="notes-toolbar-group">
          <button class="notes-tb-btn" data-syntax="bold" title="Bold (**text**)"><b>B</b></button>
          <button class="notes-tb-btn" data-syntax="italic" title="Italic (*text*)"><i>I</i></button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="h1" title="Heading 1 (# Heading)">H1</button>
          <button class="notes-tb-btn" data-syntax="h2" title="Heading 2 (## Heading)">H2</button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="bullet" title="Bullet List (- item)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="number" title="Numbered List (1. item)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="checklist" title="Checklist (- [ ] Task)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          </button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="quote" title="Quote (> text)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="table" title="Table (| col | col |)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="hr" title="Horizontal Rule (---)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>
          </button>
          <div class="notes-tb-divider"></div>
          <button class="notes-tb-btn" data-syntax="code" title="Inline Code (\`code\`)">&lt;/&gt;</button>
          <button class="notes-tb-btn" data-syntax="codeblock" title="Code Block (\`\`\` code \`\`\`)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button class="notes-tb-btn" data-syntax="link" title="Link ([title](url))">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </button>
        </div>

        <div class="notes-mode-toggle">
          <button class="notes-mode-btn ${isEditMode ? 'active' : ''}" data-action="set-note-mode" data-mode="edit">Edit</button>
          <button class="notes-mode-btn ${!isEditMode ? 'active' : ''}" data-action="set-note-mode" data-mode="preview">Preview</button>
        </div>
      </div>

      <div class="notes-editor-body">
        ${isEditMode ? `
          <textarea id="noteContentInput" class="notes-textarea" placeholder="Write markdown note here...">${escapeHtml(activeNote.content)}</textarea>
        ` : `
          <div class="notes-preview">${parseMarkdown(activeNote.content)}</div>
        `}
      </div>
    `;
  }

  const allNotes = state.notes || [];
  const weekAgo = Date.now() - 7 * 86400000;
  const updatedWeek = allNotes.filter(n => Date.parse(n.updatedAt || n.createdAt || 0) >= weekAgo).length;
  const projWithNotes = new Set(allNotes.map(n => n.projectId)).size;
  return `
    <div class="rpa-page notes-page">
    <section class="rpa-hero notes-hero">
      <div class="rpa-hero-main">
        <span class="rpa-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg></span>
        <div>
          <h2 class="rpa-hero-title">Notes</h2>
          <p class="rpa-hero-sub">Markdown notes organised by project and folder.</p>
        </div>
      </div>
      <div class="rpa-hero-stats">
        <div class="rpa-hstat"><strong>${allNotes.length}</strong><span>Notes</span></div>
        <div class="rpa-hstat"><strong>${(state.noteFolders || []).length}</strong><span>Folders</span></div>
        <div class="rpa-hstat"><strong>${projWithNotes}</strong><span>Projects with notes</span></div>
        <div class="rpa-hstat"><strong class="ok">${updatedWeek}</strong><span>Updated this week</span></div>
      </div>
    </section>
    <div class="notes-container">
      <div class="notes-panel-projects">
        <div class="notes-projects-header">
          <span>Projects</span>
          <span style="font-size:11px;color:var(--text-muted);">${state.projects.length}</span>
        </div>
        <div class="notes-projects-list">
          ${projectsHtml}
        </div>
      </div>

      <div class="notes-panel-tree">
        <div class="notes-tree-top">
          <div class="notes-tree-actions">
            <div class="notes-new-dropdown-wrap">
              <button class="notes-new-btn" id="notesNewBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>New</span>
              </button>
              <div class="notes-dropdown-menu" id="notesNewDropdownMenu">
                <button class="notes-dropdown-item" data-action="new-note-action">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--accent);"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  New Note
                </button>

                ${selectedFolderIsSubfolder ? '' : `
                  <button class="notes-dropdown-item" data-action="new-folder-action">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--warning);"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                    ${state.activeNoteFolderId ? 'New Subfolder' : 'New Folder'}
                  </button>
                `}
              </div>
            </div>

            <select class="notes-sort-select" id="notesSortSelect">
              <option value="updatedAt" ${state.noteSortBy === 'updatedAt' ? 'selected' : ''}>Recently Updated</option>
              <option value="createdAt" ${state.noteSortBy === 'createdAt' ? 'selected' : ''}>Recently Created</option>
              <option value="title" ${state.noteSortBy === 'title' ? 'selected' : ''}>Title A–Z</option>
            </select>
          </div>

          <div class="notes-search-wrap">
            <svg class="notes-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" id="notesSearchInput" class="notes-search-input" placeholder="Search notes & folders..." value="${escapeHtml(state.noteSearchQuery || '')}" />
          </div>
        </div>

        <div class="notes-tree-content">
          ${treeHtml}
        </div>
      </div>

      <div class="notes-panel-editor">
        ${editorHtml}
      </div>
    </div>
    </div>
  `;
};

const renderNoteItem = (note, query = '', showLocation = false) => {
  const isActive = note.id === state.activeNoteId;
  const snippet = note.content ? trimText(note.content.replace(/[#*`\-[\]]/g, ''), 60) : 'No content';

  let locationStr = '';
  if (showLocation) {
    const proj = state.projects.find(p => p.id === note.projectId);
    const folder = (state.noteFolders || []).find(f => f.id === note.folderId);
    let path = proj ? proj.name : '';
    if (folder) {
      if (folder.parentId) {
        const parentFolder = (state.noteFolders || []).find(f => f.id === folder.parentId);
        if (parentFolder) path += ` / ${parentFolder.name}`;
      }
      path += ` / ${folder.name}`;
    }
    locationStr = `<div class="notes-note-meta">${escapeHtml(path)} · ${timeAgo(note.updatedAt)}</div>`;
  }

  return `
    <button class="notes-note-item ${isActive ? 'active' : ''}" data-action="select-note" data-id="${note.id}">
      <svg class="notes-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <div class="notes-note-info">
        <div class="notes-note-title">${highlight(escapeHtml(note.title), query)}</div>
        <div class="notes-note-snippet">${highlight(escapeHtml(snippet), query)}</div>
        ${locationStr}
      </div>
    </button>
  `;
};
