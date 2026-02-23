/**
 * Task Dashboard Frontend
 * Handles UI logic and API calls
 */

let currentEditingId = null;
let tasks = [];
let categories = [];
let activeTimers = {};
let timerIntervals = {};
let selectMode = false;
let selectedIds = new Set();
let currentSort = 'priority';
let currentOrder = 'desc';
let currentView = 'list';
let focusedTaskIndex = -1;
let lastRenderedTasks = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadTasks();
  loadStats();
  loadActiveTimers();
  loadWipLimits();
  loadDueSummary().then(() => setTimeout(showOverdueToast, 1000));

  document.getElementById('search').addEventListener('input', filterAndRender);
  document.getElementById('filter-status').addEventListener('change', filterAndRender);
  document.getElementById('filter-category').addEventListener('change', filterAndRender);
  document.getElementById('filter-priority').addEventListener('change', filterAndRender);

  setInterval(() => {
    loadTasks();
    loadStats();
  }, 10000);

  document.getElementById('new-subtask-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }
  });
  document.getElementById('new-category-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
  });
  document.getElementById('new-note-content').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addNote(); }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
    }
  });
});

// ==================== API CALLS ====================

async function loadTasks() {
  try {
    const params = new URLSearchParams();
    if (currentSort) params.set('sort', currentSort);
    if (currentOrder) params.set('order', currentOrder);
    const response = await fetch(`/api/tasks?${params}`);
    tasks = await response.json();
    filterAndRender();
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    const stats = await response.json();
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-backlog').textContent = stats.backlog || 0;
    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-completed').textContent = stats.completed;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadCategories() {
  try {
    const response = await fetch('/api/categories');
    categories = await response.json();
    populateCategorySelects();
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function populateCategorySelects() {
  const filterCat = document.getElementById('filter-category');
  const currentFilter = filterCat.value;
  filterCat.innerHTML = '<option value="">All Categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = cat.name;
    filterCat.appendChild(opt);
  });
  filterCat.value = currentFilter;

  const taskCat = document.getElementById('task-category');
  const currentVal = taskCat.value;
  taskCat.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = cat.name;
    taskCat.appendChild(opt);
  });
  if (currentVal && [...taskCat.options].some(o => o.value === currentVal)) {
    taskCat.value = currentVal;
  }
}

async function loadActiveTimers() {
  try {
    const response = await fetch('/api/timer/active');
    const active = await response.json();
    active.forEach(timer => {
      activeTimers[timer.taskId] = { startTime: timer.startTime, logId: timer.id };
      startTimerDisplay(timer.taskId, timer.startTime);
    });
  } catch (err) {
    console.error('Error loading active timers:', err);
  }
}

async function updateTask(id, updates) {
  try {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update task');
    await loadTasks();
    await loadStats();
  } catch (err) {
    alert('Error updating task: ' + err.message);
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete task');
    stopTimerDisplay(id);
    delete activeTimers[id];
    await loadTasks();
    await loadStats();
  } catch (err) {
    alert('Error deleting task: ' + err.message);
  }
}

async function saveTask(taskData) {
  try {
    let response;
    if (currentEditingId) {
      response = await fetch(`/api/tasks/${currentEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
    } else {
      response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
    }
    if (!response.ok) throw new Error('Failed to save task');

    const savedTask = await response.json();
    const taskId = currentEditingId || savedTask.id;

    const recurringVal = document.getElementById('task-recurring').value;
    if (recurringVal) {
      await fetch(`/api/tasks/${taskId}/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: recurringVal })
      });
    } else if (currentEditingId) {
      await fetch(`/api/tasks/${taskId}/recurring`, { method: 'DELETE' });
    }

    closeModal();
    await loadTasks();
    await loadStats();
  } catch (err) {
    alert('Error saving task: ' + err.message);
  }
}

// ==================== TIME TRACKING ====================

async function startTimer(taskId) {
  try {
    const response = await fetch(`/api/tasks/${taskId}/timer/start`, { method: 'POST' });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error); }
    const data = await response.json();
    activeTimers[taskId] = { startTime: data.startTime };
    startTimerDisplay(taskId, data.startTime);
    filterAndRender();
  } catch (err) {
    alert('Error starting timer: ' + err.message);
  }
}

async function stopTimer(taskId) {
  try {
    const response = await fetch(`/api/tasks/${taskId}/timer/stop`, { method: 'POST' });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error); }
    stopTimerDisplay(taskId);
    delete activeTimers[taskId];
    await loadTasks();
  } catch (err) {
    alert('Error stopping timer: ' + err.message);
  }
}

function startTimerDisplay(taskId, startTime) {
  stopTimerDisplay(taskId);
  const update = () => {
    const el = document.getElementById(`timer-${taskId}`);
    if (el) {
      const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      el.textContent = formatDuration(elapsed);
    }
  };
  update();
  timerIntervals[taskId] = setInterval(update, 1000);
}

function stopTimerDisplay(taskId) {
  if (timerIntervals[taskId]) {
    clearInterval(timerIntervals[taskId]);
    delete timerIntervals[taskId];
  }
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ==================== SUBTASKS ====================

async function loadSubtasks(taskId) {
  try {
    const response = await fetch(`/api/tasks/${taskId}/subtasks`);
    return await response.json();
  } catch (err) { return []; }
}

async function addSubtask() {
  if (!currentEditingId) return;
  const input = document.getElementById('new-subtask-name');
  const name = input.value.trim();
  if (!name) return;
  try {
    await fetch(`/api/tasks/${currentEditingId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    input.value = '';
    renderSubtaskList(await loadSubtasks(currentEditingId));
  } catch (err) { alert('Error adding subtask: ' + err.message); }
}

async function toggleSubtask(subtaskId, completed) {
  try {
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
    if (currentEditingId) renderSubtaskList(await loadSubtasks(currentEditingId));
  } catch (err) { alert('Error updating subtask: ' + err.message); }
}

async function deleteSubtask(subtaskId) {
  try {
    await fetch(`/api/subtasks/${subtaskId}`, { method: 'DELETE' });
    if (currentEditingId) renderSubtaskList(await loadSubtasks(currentEditingId));
  } catch (err) { alert('Error deleting subtask: ' + err.message); }
}

function renderSubtaskList(subtasks) {
  const list = document.getElementById('subtask-list');
  list.innerHTML = subtasks.map(st => `
    <li class="subtask-item">
      <input type="checkbox" ${st.completed ? 'checked' : ''} onchange="toggleSubtask(${st.id}, this.checked)">
      <span class="subtask-name ${st.completed ? 'done' : ''}">${escapeHtml(st.name)}</span>
      <button type="button" class="delete-subtask" onclick="deleteSubtask(${st.id})">✕</button>
    </li>
  `).join('');
}

// ==================== NOTES ====================

async function loadNotes(taskId) {
  try {
    const response = await fetch(`/api/tasks/${taskId}/notes`);
    return await response.json();
  } catch (err) { return []; }
}

async function addNote() {
  if (!currentEditingId) return;
  const input = document.getElementById('new-note-content');
  const content = input.value.trim();
  if (!content) return;
  try {
    await fetch(`/api/tasks/${currentEditingId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    input.value = '';
    renderNotesList(await loadNotes(currentEditingId));
  } catch (err) { alert('Error adding note: ' + err.message); }
}

async function deleteNote(noteId) {
  try {
    await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (currentEditingId) renderNotesList(await loadNotes(currentEditingId));
  } catch (err) { alert('Error deleting note: ' + err.message); }
}

function renderNotesList(notes) {
  const list = document.getElementById('notes-list');
  list.innerHTML = notes.map(note => {
    const time = new Date(note.createdAt).toLocaleString();
    const isEvent = note.type === 'event';
    return `
      <li class="note-item ${isEvent ? 'event' : ''}">
        <div class="note-header">
          <span class="note-time">${time}</span>
          ${!isEvent ? `<button type="button" class="delete-note" onclick="deleteNote(${note.id})">✕</button>` : ''}
        </div>
        <div class="note-content">${escapeHtml(note.content)}</div>
      </li>
    `;
  }).join('');
}

// ==================== DUE DATE WARNINGS ====================

let dueSummary = null;

async function loadDueSummary() {
  try {
    const response = await fetch('/api/due-summary');
    dueSummary = await response.json();
    renderDueBanner();
  } catch (err) { console.error('Error loading due summary:', err); }
}

function renderDueBanner() {
  const banner = document.getElementById('due-warning-banner');
  if (!dueSummary) return;
  const parts = [];
  if (dueSummary.overdue.count > 0) parts.push(`${dueSummary.overdue.count} overdue`);
  if (dueSummary.dueToday.count > 0) parts.push(`${dueSummary.dueToday.count} due today`);
  if (dueSummary.dueTomorrow.count > 0) parts.push(`${dueSummary.dueTomorrow.count} due tomorrow`);
  if (parts.length === 0) { banner.classList.remove('active'); return; }
  document.getElementById('due-warning-text').textContent = parts.join(' | ');
  banner.classList.add('active');
}

function showOverdueToast() {
  if (!dueSummary || dueSummary.overdue.count === 0) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = `You have ${dueSummary.overdue.count} overdue task(s)!`;
  toast.onclick = () => { toast.remove(); filterOverdue(); };
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

function filterOverdue() {
  document.getElementById('filter-status').value = 'pending';
  document.getElementById('search').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-priority').value = '';
  currentSort = 'dueDate';
  currentOrder = 'asc';
  updateSortButtons();
  loadTasks();
}

function dismissBanner() {
  document.getElementById('due-warning-banner').classList.remove('active');
}

// ==================== CATEGORIES MODAL ====================

async function openCategoriesModal() {
  await loadCategories();
  renderCategoryList();
  document.getElementById('categories-modal').classList.add('active');
}

function closeCategoriesModal() {
  document.getElementById('categories-modal').classList.remove('active');
  loadCategories();
  loadTasks();
}

function renderCategoryList() {
  const list = document.getElementById('category-list');
  list.innerHTML = categories.map(cat => `
    <li class="category-list-item">
      <input type="color" value="${cat.color || '#64748b'}" onchange="updateCategoryColor(${cat.id}, this.value)">
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <button class="danger" onclick="deleteCategory(${cat.id})">Delete</button>
    </li>
  `).join('');
}

async function addCategory() {
  const nameInput = document.getElementById('new-category-name');
  const colorInput = document.getElementById('new-category-color');
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: colorInput.value })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error); }
    nameInput.value = '';
    colorInput.value = '#64748b';
    await loadCategories();
    renderCategoryList();
  } catch (err) { alert('Error adding category: ' + err.message); }
}

async function updateCategoryColor(id, color) {
  try {
    await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color })
    });
    const cat = categories.find(c => c.id === id);
    if (cat) cat.color = color;
  } catch (err) { alert('Error updating category: ' + err.message); }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? Tasks will be moved to "general".')) return;
  try {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    await loadCategories();
    renderCategoryList();
  } catch (err) { alert('Error deleting category: ' + err.message); }
}

function getCategoryColor(name) {
  const cat = categories.find(c => c.name === name);
  return cat ? cat.color : '#64748b';
}

// ==================== SORT CONTROLS ====================

function setSort(field) {
  if (currentSort === field) {
    currentOrder = currentOrder === 'desc' ? 'asc' : 'desc';
  } else {
    currentSort = field;
    currentOrder = field === 'name' ? 'asc' : 'desc';
  }
  updateSortButtons();
  loadTasks();
}

function updateSortButtons() {
  document.querySelectorAll('.sort-btn[data-sort]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === currentSort);
    const label = btn.dataset.sort.charAt(0).toUpperCase() +
      btn.dataset.sort.slice(1).replace('Date', ' Date');
    btn.textContent = btn.dataset.sort === currentSort
      ? label + (currentOrder === 'asc' ? ' ↑' : ' ↓')
      : label;
  });
}

// ==================== VIEW TOGGLE (List / Kanban) ====================

function setView(view) {
  currentView = view;
  document.getElementById('view-list-btn').classList.toggle('active', view === 'list');
  document.getElementById('view-kanban-btn').classList.toggle('active', view === 'kanban');
  document.getElementById('kanban-group').style.display = view === 'kanban' ? '' : 'none';

  if (view === 'list') {
    document.getElementById('tasks-list').style.display = '';
    document.getElementById('kanban-board').classList.remove('active');
    filterAndRender();
  } else {
    document.getElementById('tasks-list').style.display = 'none';
    document.getElementById('kanban-board').classList.add('active');
    renderKanban();
  }
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  const groupBy = document.getElementById('kanban-group').value;

  // Apply current filters
  const search = document.getElementById('search').value.toLowerCase();
  const statusFilter = document.getElementById('filter-status').value;
  const categoryFilter = document.getElementById('filter-category').value;
  const priorityFilter = document.getElementById('filter-priority').value;

  let filtered = tasks.filter(task => {
    const matchesSearch = !search || task.name.toLowerCase().includes(search) ||
      (task.description && task.description.toLowerCase().includes(search));
    const matchesStatus = !statusFilter || task.status === statusFilter;
    const matchesCategory = !categoryFilter || task.category === categoryFilter;
    const matchesPriority = !priorityFilter || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  let columns;
  if (groupBy === 'status') {
    columns = [
      { key: 'backlog', label: 'Backlog' },
      { key: 'pending', label: 'Pending' },
      { key: 'completed', label: 'Completed' },
      { key: 'archived', label: 'Archived' }
    ];
  } else {
    const catNames = [...new Set(filtered.map(t => t.category))].sort();
    columns = catNames.map(name => ({ key: name, label: name }));
  }

  // Load WIP limits
  const wipLimits = window._wipLimits || {};

  board.innerHTML = columns.map(col => {
    const colTasks = filtered.filter(t => groupBy === 'status' ? t.status === col.key : t.category === col.key);
    const catColor = groupBy === 'category' ? getCategoryColor(col.key) : null;
    const headerStyle = catColor ? `border-bottom-color: ${catColor}` : '';
    const colClass = groupBy === 'status' ? `col-${col.key}` : '';
    const wipLimit = wipLimits[col.key];
    const wipExceeded = wipLimit && colTasks.length > wipLimit;
    const wipHtml = groupBy === 'status' ? `<span class="wip-indicator" onclick="setWipLimit('${col.key}')" title="Click to set WIP limit">${wipLimit ? `(${wipLimit})` : ''}</span>` : '';

    return `
      <div class="kanban-column" data-column="${col.key}"
        ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)"
        ondrop="handleDrop(event, '${col.key}', '${groupBy}')">
        <div class="kanban-column-header ${colClass} ${wipExceeded ? 'wip-exceeded' : ''}" style="${headerStyle}">
          <span>${escapeHtml(col.label)}${wipHtml}</span>
          <span class="kanban-column-count">${colTasks.length}</span>
        </div>
        ${colTasks.map(task => {
          const catColor = getCategoryColor(task.category);
          const priorityIcon = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
          let subtaskHtml = '';
          if (task.subtaskTotal > 0) {
            const pct = Math.round((task.subtaskDone / task.subtaskTotal) * 100);
            subtaskHtml = `<span class="badge subtask-progress"><span class="progress-bar"><span class="progress-fill" style="width:${pct}%"></span></span>${task.subtaskDone}/${task.subtaskTotal}</span>`;
          }
          const dueDate = task.dueDate ? formatDate(new Date(task.dueDate)) : '';

          // Age indicator
          const ageDays = Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 86400000);
          let ageStr = '';
          let ageClass = 'kanban-card-age';
          if (task.status !== 'completed' && task.status !== 'archived') {
            if (ageDays > 30) { ageStr = `${Math.floor(ageDays / 7)}w old`; ageClass += ' very-stale'; }
            else if (ageDays > 14) { ageStr = `${Math.floor(ageDays / 7)}w old`; ageClass += ' stale'; }
            else if (ageDays > 3) { ageStr = `${ageDays}d old`; }
          }

          return `
            <div class="kanban-card" draggable="true"
              ondragstart="handleDragStart(event, ${task.id})"
              ondragend="handleDragEnd(event)"
              ondblclick="openEditModal(${task.id})">
              <div class="kanban-card-name">${escapeHtml(task.name)}</div>
              <div class="kanban-card-meta">
                <span class="badge priority-${task.priority}">${priorityIcon}</span>
                <span class="badge category-badge"><span class="category-dot" style="background:${catColor}"></span>${escapeHtml(task.category)}</span>
                ${dueDate ? `<span class="badge due-date">${dueDate}</span>` : ''}
                ${task.recurring ? `<span class="badge recurring-badge">🔁</span>` : ''}
                ${subtaskHtml}
              </div>
              ${ageStr ? `<div class="${ageClass}">${ageStr}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}

function handleDragStart(e, taskId) {
  e.dataTransfer.setData('text/plain', taskId);
  e.target.classList.add('dragging');
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, targetValue, groupBy) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const taskId = parseInt(e.dataTransfer.getData('text/plain'));
  const update = groupBy === 'status' ? { status: targetValue } : { category: targetValue };
  await updateTask(taskId, update);
  renderKanban();
}

// ==================== BULK OPERATIONS ====================

function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  const tasksList = document.getElementById('tasks-list');
  const bulkBar = document.getElementById('bulk-bar');
  const toggleBtn = document.getElementById('select-mode-toggle');
  tasksList.classList.toggle('select-mode', selectMode);
  bulkBar.classList.toggle('active', selectMode);
  toggleBtn.classList.toggle('active', selectMode);
  toggleBtn.textContent = selectMode ? '☑ Select' : '☐ Select';
  updateSelectedCount();
  filterAndRender();
}

function toggleTaskSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateSelectedCount();
  const checkbox = document.querySelector(`#bulk-cb-${id}`);
  if (checkbox) checkbox.checked = selectedIds.has(id);
  const taskEl = document.querySelector(`[data-task-id="${id}"]`);
  if (taskEl) taskEl.classList.toggle('selected', selectedIds.has(id));
}

function updateSelectedCount() {
  document.getElementById('selected-count').textContent = `${selectedIds.size} selected`;
}

async function bulkComplete() {
  if (selectedIds.size === 0) return;
  try {
    await fetch('/api/tasks/bulk/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] })
    });
    selectedIds.clear(); updateSelectedCount();
    await loadTasks(); await loadStats();
  } catch (err) { alert('Error: ' + err.message); }
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  if (!confirm(`Delete ${selectedIds.size} tasks?`)) return;
  try {
    await fetch('/api/tasks/bulk/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] })
    });
    selectedIds.forEach(id => { stopTimerDisplay(id); delete activeTimers[id]; });
    selectedIds.clear(); updateSelectedCount();
    await loadTasks(); await loadStats();
  } catch (err) { alert('Error: ' + err.message); }
}

async function bulkSetPriority() {
  if (selectedIds.size === 0) return;
  const priority = prompt('Set priority (low, medium, high):');
  if (!priority || !['low', 'medium', 'high'].includes(priority)) return;
  try {
    await fetch('/api/tasks/bulk/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds], updates: { priority } })
    });
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
}

// ==================== EXPORT / IMPORT ====================

function toggleDropdown(id) {
  const el = document.getElementById(id);
  el.classList.toggle('show');
}

function exportTasks(format) {
  window.location.href = `/api/export?format=${format}`;
  document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
}

function importTasks() {
  document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm(`Import ${data.tasks?.length || 0} tasks?`)) return;
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text
      });
      const result = await response.json();
      alert(result.message);
      loadTasks(); loadStats(); loadCategories();
    } catch (err) { alert('Error importing: ' + err.message); }
  };
  input.click();
}

// ==================== ANALYTICS ====================

async function openAnalyticsModal() {
  document.getElementById('analytics-modal').classList.add('active');
  try {
    const [summary, timeByCategory, completions, flow, cumulativeFlow, velocity] = await Promise.all([
      fetch('/api/analytics/summary').then(r => r.json()),
      fetch('/api/analytics/time-by-category').then(r => r.json()),
      fetch('/api/analytics/completions').then(r => r.json()),
      fetch('/api/analytics/flow').then(r => r.json()),
      fetch('/api/analytics/cumulative-flow').then(r => r.json()),
      fetch('/api/analytics/velocity').then(r => r.json())
    ]);
    renderAnalyticsSummary(summary, velocity);
    renderTimeByCategoryChart(timeByCategory);
    renderCompletionsChart(completions);
    renderFlowChart(flow);
    renderCumulativeFlow(cumulativeFlow);
    renderVelocityChart(velocity);
  } catch (err) { console.error('Error loading analytics:', err); }
}

function closeAnalyticsModal() {
  document.getElementById('analytics-modal').classList.remove('active');
}

function renderAnalyticsSummary(summary, velocity) {
  const cycleSeconds = velocity && velocity.cycleTime ? velocity.cycleTime.avgSeconds : 0;
  const cycleDays = cycleSeconds > 0 ? (cycleSeconds / 86400).toFixed(1) : '—';

  document.getElementById('analytics-summary').innerHTML = `
    <div class="analytics-card">
      <div class="value">${summary.overdue}</div>
      <div class="label">Overdue</div>
    </div>
    <div class="analytics-card">
      <div class="value">${summary.completionRate}%</div>
      <div class="label">Completion Rate</div>
    </div>
    <div class="analytics-card">
      <div class="value">${formatDuration(summary.avgCompletionTime)}</div>
      <div class="label">Avg Time</div>
    </div>
    <div class="analytics-card">
      <div class="value">${formatDuration(summary.totalTimeTracked)}</div>
      <div class="label">Total Tracked</div>
    </div>
    <div class="analytics-card">
      <div class="value">${cycleDays}${cycleDays !== '—' ? 'd' : ''}</div>
      <div class="label">Cycle Time</div>
    </div>
  `;
}

function renderTimeByCategoryChart(data) {
  const container = document.getElementById('chart-time-by-category');
  if (data.length === 0) {
    container.innerHTML = '<div style="color:#64748b;padding:20px;">No time data yet</div>';
    return;
  }
  const maxTime = Math.max(...data.map(d => d.totalTime), 1);
  container.innerHTML = data.map(d => {
    const pct = Math.round((d.totalTime / maxTime) * 100);
    const color = getCategoryColor(d.category);
    return `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(d.category)}</span>
        <div class="bar-container" style="display:flex;align-items:center;">
          <div class="bar" style="width:${pct}%;background:${color};"></div>
          <span class="bar-value">${formatDuration(d.totalTime)} (${d.taskCount} tasks)</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderCompletionsChart(data) {
  const svg = document.getElementById('completions-svg');
  if (data.length === 0) {
    svg.innerHTML = '<text x="50%" y="100" text-anchor="middle" fill="#64748b" font-size="14">No completions in last 30 days</text>';
    return;
  }

  const width = svg.parentElement.clientWidth || 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(...data.map(d => d.count), 1);

  svg.setAttribute('width', width);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.count / maxCount) * chartHeight;
    return { x, y, ...d };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Fill area
  const areaPoints = [
    `${padding.left},${padding.top + chartHeight}`,
    ...points.map(p => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${padding.top + chartHeight}`
  ].join(' ');

  // Y axis labels
  const yLabels = [0, Math.ceil(maxCount / 2), maxCount].map((val, i) => {
    const y = padding.top + chartHeight - (val / maxCount) * chartHeight;
    return `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${val}</text>
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
  }).join('');

  // X axis labels (show first, middle, last)
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(i => {
      if (!points[i]) return '';
      const label = data[i].date.substring(5); // MM-DD
      return `<text x="${points[i].x}" y="${height - 8}" text-anchor="middle" fill="#64748b" font-size="11">${label}</text>`;
    }).join('');

  svg.innerHTML = `
    ${yLabels}
    ${xLabels}
    <polygon points="${areaPoints}" fill="rgba(59,130,246,0.1)"/>
    <polyline points="${polyline}" fill="none" stroke="#3b82f6" stroke-width="2"/>
    ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#3b82f6"/>`).join('')}
  `;
}

// ==================== FLOW ANALYTICS CHARTS ====================

function renderFlowChart(data) {
  const container = document.getElementById('chart-task-flow');
  if (!data.chartData || data.chartData.length === 0) {
    container.innerHTML = '<div style="color:#64748b;padding:20px;">No flow data yet. Move tasks between kanban columns to generate flow data.</div>';
    return;
  }

  const maxVal = Math.max(...data.chartData.map(d => Math.max(d.progressions, d.regressions)), 1);

  let html = `
    <div class="flow-legend">
      <span><span class="flow-legend-dot" style="background:#22c55e;"></span> Progression (forward)</span>
      <span><span class="flow-legend-dot" style="background:#ef4444;"></span> Regression (backward)</span>
      <span style="margin-left:auto;">Total: ${data.summary.totalProgressions} fwd / ${data.summary.totalRegressions} back</span>
    </div>
  `;

  html += data.chartData.map(d => {
    const pPct = Math.round((d.progressions / maxVal) * 100);
    const rPct = Math.round((d.regressions / maxVal) * 100);
    const dateLabel = d.date.substring(5); // MM-DD
    return `
      <div class="flow-row">
        <span class="flow-label">${dateLabel}</span>
        <div class="flow-bar-container">
          <div class="flow-bar-progress" style="width:${pPct}%;" title="${d.progressions} progressions"></div>
          ${d.progressions > 0 ? `<span class="flow-bar-value" style="color:#22c55e;">${d.progressions}</span>` : ''}
        </div>
        <div class="flow-bar-container" style="flex-direction:row-reverse;">
          <div class="flow-bar-regress" style="width:${rPct}%;" title="${d.regressions} regressions"></div>
          ${d.regressions > 0 ? `<span class="flow-bar-value" style="color:#ef4444;margin-left:0;margin-right:4px;">${d.regressions}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Transition matrix summary
  if (Object.keys(data.matrix).length > 0) {
    html += '<div style="margin-top:12px;font-size:12px;color:#94a3b8;">';
    html += '<strong>Transition breakdown:</strong> ';
    html += Object.entries(data.matrix)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${key} (${count})`)
      .join(', ');
    html += '</div>';
  }

  container.innerHTML = html;
}

function renderCumulativeFlow(snapshots) {
  const svg = document.getElementById('cumulative-flow-svg');
  if (!snapshots || snapshots.length === 0) {
    svg.innerHTML = '<text x="50%" y="100" text-anchor="middle" fill="#64748b" font-size="14">No data</text>';
    return;
  }

  const width = svg.parentElement.clientWidth || 600;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 50, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  svg.setAttribute('width', width);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const statuses = ['archived', 'completed', 'pending', 'backlog']; // bottom to top stacking
  const colors = { backlog: '#64748b', pending: '#3b82f6', completed: '#22c55e', archived: '#475569' };

  // Compute max total
  const maxTotal = Math.max(...snapshots.map(s => s.backlog + s.pending + s.completed + s.archived), 1);

  // Build stacked areas
  const n = snapshots.length;
  let svgContent = '';

  // Y axis labels
  const yTicks = [0, Math.ceil(maxTotal / 2), maxTotal];
  svgContent += yTicks.map(val => {
    const y = padding.top + chartHeight - (val / maxTotal) * chartHeight;
    return `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${val}</text>
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
  }).join('');

  // Draw stacked areas (bottom to top)
  let prevY = snapshots.map(() => padding.top + chartHeight); // baseline

  for (const status of statuses) {
    const points = [];
    const newPrevY = [];
    for (let i = 0; i < n; i++) {
      const x = padding.left + (i / Math.max(n - 1, 1)) * chartWidth;
      const cumVal = statuses.slice(0, statuses.indexOf(status) + 1).reduce((sum, s) => sum + (snapshots[i][s] || 0), 0);
      const y = padding.top + chartHeight - (cumVal / maxTotal) * chartHeight;
      points.push({ x, y });
      newPrevY.push(y);
    }

    // Create area polygon: top line + reversed bottom line
    const topLine = points.map(p => `${p.x},${p.y}`).join(' ');
    const bottomLine = prevY.map((y, i) => {
      const x = padding.left + (i / Math.max(n - 1, 1)) * chartWidth;
      return `${x},${y}`;
    }).reverse().join(' ');

    svgContent += `<polygon points="${topLine} ${bottomLine}" fill="${colors[status]}" opacity="0.7"/>`;
    prevY = newPrevY;
  }

  // X axis labels
  const labelIndexes = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1]
    .filter((v, i, a) => a.indexOf(v) === i && v < n);
  svgContent += labelIndexes.map(i => {
    const x = padding.left + (i / Math.max(n - 1, 1)) * chartWidth;
    return `<text x="${x}" y="${height - 8}" text-anchor="middle" fill="#64748b" font-size="11">${snapshots[i].date.substring(5)}</text>`;
  }).join('');

  svg.innerHTML = svgContent;

  // Add legend below SVG
  const legendContainer = svg.parentElement.querySelector('.cfd-legend');
  if (!legendContainer) {
    const leg = document.createElement('div');
    leg.className = 'cfd-legend';
    leg.innerHTML = ['backlog', 'pending', 'completed', 'archived'].map(s =>
      `<span><span class="flow-legend-dot" style="background:${colors[s]};"></span>${s}</span>`
    ).join('');
    svg.parentElement.appendChild(leg);
  }
}

function renderVelocityChart(data) {
  const container = document.getElementById('chart-velocity');
  if (!data.byStatus || data.byStatus.length === 0) {
    container.innerHTML = '<div style="color:#64748b;padding:20px;">No velocity data yet. Move tasks through statuses to generate cycle time data.</div>';
    return;
  }

  const colors = { backlog: '#64748b', pending: '#3b82f6', completed: '#22c55e', archived: '#475569' };
  const maxSeconds = Math.max(...data.byStatus.map(v => v.avgSeconds), 1);

  container.innerHTML = data.byStatus.map(v => {
    const pct = Math.round((v.avgSeconds / maxSeconds) * 100);
    const color = colors[v.status] || '#64748b';
    const timeStr = v.avgSeconds >= 86400
      ? `${(v.avgSeconds / 86400).toFixed(1)}d`
      : v.avgSeconds >= 3600
        ? `${Math.round(v.avgSeconds / 3600)}h`
        : `${Math.round(v.avgSeconds / 60)}m`;
    return `
      <div class="bar-row">
        <span class="bar-label">${v.status}</span>
        <div class="bar-container" style="display:flex;align-items:center;">
          <div class="bar" style="width:${pct}%;background:${color};"></div>
          <span class="bar-value">avg ${timeStr} (${v.transitionCount} transitions)</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== AI INSIGHTS ====================

async function openInsightsModal() {
  const modal = document.getElementById('insights-modal');
  const body = document.getElementById('insights-body');
  const refreshBtn = document.getElementById('insights-refresh-btn');

  modal.classList.add('active');
  refreshBtn.style.display = 'none';
  body.innerHTML = `
    <div class="insights-loading">
      <div class="spinner"></div>
      <div>Analyzing your task system with AI...</div>
    </div>
  `;

  try {
    const response = await fetch('/api/insights', { method: 'POST' });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error);
    }
    const data = await response.json();

    // Simple markdown-to-HTML rendering
    let html = data.insights
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.+)$/gm, '<h4 style="color:#60a5fa;margin-top:16px;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="color:#60a5fa;margin-top:20px;">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 style="color:#60a5fa;margin-top:20px;">$1</h2>')
      .replace(/^- (.+)$/gm, '<div style="padding-left:16px;">• $1</div>')
      .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:16px;">$1. $2</div>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');

    const cachedNote = data.cached ? '<div style="font-size:11px;color:#64748b;margin-bottom:12px;">Cached result — click Refresh for new analysis</div>' : '';
    body.innerHTML = `${cachedNote}<div class="insights-body">${html}</div>`;
    refreshBtn.style.display = '';
  } catch (err) {
    body.innerHTML = `<div style="color:#fca5a5;padding:20px;">Error: ${escapeHtml(err.message)}</div>`;
    refreshBtn.style.display = '';
  }
}

function closeInsightsModal() {
  document.getElementById('insights-modal').classList.remove('active');
}

// ==================== WIP LIMITS ====================

async function loadWipLimits() {
  try {
    const response = await fetch('/api/settings/wip-limits');
    window._wipLimits = await response.json();
  } catch (err) {
    window._wipLimits = {};
  }
}

async function setWipLimit(column) {
  const current = (window._wipLimits || {})[column];
  const input = prompt(`Set WIP limit for "${column}" (leave empty to remove):`, current || '');
  if (input === null) return; // cancelled

  const limits = window._wipLimits || {};
  limits[column] = input ? parseInt(input) || null : null;

  try {
    await fetch('/api/settings/wip-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(limits)
    });
    window._wipLimits = limits;
    renderKanban();
  } catch (err) {
    alert('Error saving WIP limits: ' + err.message);
  }
}

// ==================== SETTINGS ====================

async function openSettingsModal() {
  document.getElementById('settings-modal').classList.add('active');
  document.getElementById('settings-api-key').value = '';
  const statusEl = document.getElementById('settings-key-status');
  statusEl.innerHTML = '<span class="field-status info">Loading...</span>';

  try {
    const response = await fetch('/api/settings');
    const data = await response.json();
    const input = document.getElementById('settings-api-key');

    if (data.gemini_api_key.configured) {
      input.placeholder = data.gemini_api_key.masked + ' (saved)';
      statusEl.innerHTML = `<div class="field-status success">Key configured: ${escapeHtml(data.gemini_api_key.masked)}</div>`;
    } else if (data.env_key_present) {
      input.placeholder = 'Using environment variable';
      statusEl.innerHTML = '<div class="field-status info">Using GEMINI_API_KEY environment variable</div>';
    } else {
      input.placeholder = 'AIza...';
      statusEl.innerHTML = '<div class="field-status error">No API key configured</div>';
    }
  } catch (err) {
    statusEl.innerHTML = `<div class="field-status error">Error loading settings: ${escapeHtml(err.message)}</div>`;
  }
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

function toggleKeyVisibility() {
  const input = document.getElementById('settings-api-key');
  const btn = input.nextElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

async function saveSettings() {
  const key = document.getElementById('settings-api-key').value.trim();
  const statusEl = document.getElementById('settings-key-status');

  if (!key) {
    statusEl.innerHTML = '<div class="field-status error">Enter an API key to save</div>';
    return;
  }

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_api_key: key })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    document.getElementById('settings-api-key').value = '';
    document.getElementById('settings-api-key').placeholder = data.masked + ' (saved)';
    statusEl.innerHTML = `<div class="field-status success">Key saved and encrypted: ${escapeHtml(data.masked)}</div>`;
  } catch (err) {
    statusEl.innerHTML = `<div class="field-status error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

async function testApiKey() {
  const statusEl = document.getElementById('settings-key-status');
  statusEl.innerHTML = '<div class="field-status info">Testing API key...</div>';

  // If there's a key in the input, save it first
  const inputKey = document.getElementById('settings-api-key').value.trim();
  if (inputKey) {
    try {
      const saveResp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: inputKey })
      });
      if (!saveResp.ok) {
        const err = await saveResp.json();
        throw new Error(err.error);
      }
      document.getElementById('settings-api-key').value = '';
    } catch (err) {
      statusEl.innerHTML = `<div class="field-status error">Error saving key: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  try {
    const response = await fetch('/api/settings/test-key', { method: 'POST' });
    const data = await response.json();
    if (data.valid) {
      statusEl.innerHTML = '<div class="field-status success">API key is valid!</div>';
    } else {
      statusEl.innerHTML = `<div class="field-status error">${escapeHtml(data.message)}</div>`;
    }
  } catch (err) {
    statusEl.innerHTML = `<div class="field-status error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

async function removeApiKey() {
  if (!confirm('Remove the stored API key?')) return;
  const statusEl = document.getElementById('settings-key-status');

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_api_key: '' })
    });
    if (!response.ok) throw new Error((await response.json()).error);

    document.getElementById('settings-api-key').value = '';
    document.getElementById('settings-api-key').placeholder = 'AIza...';
    statusEl.innerHTML = '<div class="field-status info">API key removed</div>';
  } catch (err) {
    statusEl.innerHTML = `<div class="field-status error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ==================== KEYBOARD SHORTCUTS ====================

function toggleShortcutsHelp() {
  document.getElementById('shortcuts-modal').classList.toggle('active');
}

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    closeModal();
    closeCategoriesModal();
    closeAnalyticsModal();
    closeInsightsModal();
    closeSettingsModal();
    document.getElementById('shortcuts-modal').classList.remove('active');
    if (isInput) e.target.blur();
    return;
  }

  if (isInput) return;

  switch (e.key) {
    case 'n':
      e.preventDefault();
      openAddModal();
      break;
    case '/':
      e.preventDefault();
      document.getElementById('search').focus();
      break;
    case '?':
      e.preventDefault();
      toggleShortcutsHelp();
      break;
    case 'j':
      e.preventDefault();
      moveFocus(1);
      break;
    case 'k':
      e.preventDefault();
      moveFocus(-1);
      break;
    case 'x':
      e.preventDefault();
      if (focusedTaskIndex >= 0 && lastRenderedTasks[focusedTaskIndex]) {
        if (!selectMode) toggleSelectMode();
        toggleTaskSelection(lastRenderedTasks[focusedTaskIndex].id);
      }
      break;
    case 'Enter':
      e.preventDefault();
      if (focusedTaskIndex >= 0 && lastRenderedTasks[focusedTaskIndex]) {
        openEditModal(lastRenderedTasks[focusedTaskIndex].id);
      }
      break;
  }
});

function moveFocus(direction) {
  if (lastRenderedTasks.length === 0) return;
  focusedTaskIndex = Math.max(0, Math.min(lastRenderedTasks.length - 1, focusedTaskIndex + direction));
  updateFocusVisual();
}

function updateFocusVisual() {
  document.querySelectorAll('.task.focused').forEach(el => el.classList.remove('focused'));
  if (focusedTaskIndex >= 0 && lastRenderedTasks[focusedTaskIndex]) {
    const el = document.querySelector(`[data-task-id="${lastRenderedTasks[focusedTaskIndex].id}"]`);
    if (el) {
      el.classList.add('focused');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

// ==================== UI RENDERING ====================

function filterAndRender() {
  const search = document.getElementById('search').value.toLowerCase();
  const statusFilter = document.getElementById('filter-status').value;
  const categoryFilter = document.getElementById('filter-category').value;
  const priorityFilter = document.getElementById('filter-priority').value;

  let filtered = tasks.filter(task => {
    const matchesSearch = !search ||
      task.name.toLowerCase().includes(search) ||
      (task.description && task.description.toLowerCase().includes(search));
    const matchesStatus = !statusFilter || task.status === statusFilter;
    const matchesCategory = !categoryFilter || task.category === categoryFilter;
    const matchesPriority = !priorityFilter || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  lastRenderedTasks = filtered;

  if (currentView === 'list') {
    renderTasks(filtered, search);
  } else {
    renderKanban();
  }
}

function highlightText(text, search) {
  if (!search || !text) return escapeHtml(text || '');
  const escaped = escapeHtml(text);
  const searchEscaped = escapeHtml(search);
  const regex = new RegExp(`(${searchEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function renderTasks(tasksToRender, searchTerm) {
  const list = document.getElementById('tasks-list');

  if (tasksToRender.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📭</div>
        <p>No tasks found</p>
      </div>
    `;
    return;
  }

  list.innerHTML = tasksToRender.map(task => {
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isTimerActive = !!activeTimers[task.id];
    const isSelected = selectedIds.has(task.id);
    const catColor = getCategoryColor(task.category);

    // Due date urgency
    let dueDateClass = 'due-date';
    let dueDateStr = '';
    if (dueDate) {
      const d = new Date(dueDate);
      d.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((d - today) / 86400000);
      if (task.status !== 'completed') {
        if (daysDiff < 0) dueDateClass = 'due-date overdue';
        else if (daysDiff === 0) dueDateClass = 'due-date due-today';
        else if (daysDiff === 1) dueDateClass = 'due-date due-tomorrow';
      }
      dueDateStr = formatDate(dueDate);
    }

    // Subtask progress
    let subtaskHtml = '';
    if (task.subtaskTotal > 0) {
      const pct = Math.round((task.subtaskDone / task.subtaskTotal) * 100);
      subtaskHtml = `<span class="badge subtask-progress"><span class="progress-bar"><span class="progress-fill" style="width:${pct}%"></span></span>${task.subtaskDone}/${task.subtaskTotal}</span>`;
    }

    // Time display
    let timeHtml = '';
    if (task.timeSpent > 0 || isTimerActive) {
      timeHtml = `<span class="badge time-display">⏱ ${formatDuration(task.timeSpent || 0)}</span>`;
    }
    if (isTimerActive) {
      timeHtml += `<span class="badge timer-badge active" id="timer-${task.id}">...</span>`;
    }

    // Description snippet on search match
    let descSnippet = '';
    if (searchTerm && task.description && task.description.toLowerCase().includes(searchTerm)) {
      descSnippet = `<div class="task-description-snippet">${highlightText(task.description.substring(0, 120), searchTerm)}${task.description.length > 120 ? '...' : ''}</div>`;
    }

    const taskName = searchTerm ? highlightText(task.name, searchTerm) : escapeHtml(task.name);

    return `
      <div class="task ${task.status === 'completed' ? 'completed' : ''} ${isSelected ? 'selected' : ''}" data-task-id="${task.id}">
        <div class="task-content">
          <div class="task-header">
            <input type="checkbox" class="bulk-checkbox" id="bulk-cb-${task.id}" ${isSelected ? 'checked' : ''} onclick="toggleTaskSelection(${task.id})">
            <input type="checkbox" class="task-checkbox" ${task.status === 'completed' ? 'checked' : ''}
              onchange="updateTask(${task.id}, {status: this.checked ? 'completed' : 'pending'})">
            <span class="task-name ${task.status === 'completed' ? 'completed' : ''}">${taskName}</span>
          </div>
          ${descSnippet}
          <div class="task-meta">
            <span class="badge priority-${task.priority}">
              ${task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
              ${task.priority}
            </span>
            <span class="badge category-badge">
              <span class="category-dot" style="background:${catColor}"></span>
              ${escapeHtml(task.category)}
            </span>
            ${task.status === 'backlog' ? '<span class="badge backlog-badge">📥 backlog</span>' : ''}
            ${task.dueDate ? `<span class="badge ${dueDateClass}">📅 ${dueDateStr}</span>` : ''}
            ${task.recurring ? `<span class="badge recurring-badge">🔁 ${task.recurring}</span>` : ''}
            ${subtaskHtml}
            ${timeHtml}
          </div>
        </div>
        <div class="task-actions">
          ${isTimerActive
            ? `<button class="timer-btn stop" onclick="stopTimer(${task.id})">⏹ Stop</button>`
            : `<button class="timer-btn" onclick="startTimer(${task.id})">▶ Timer</button>`
          }
          <button class="secondary" onclick="openEditModal(${task.id})">Edit</button>
          <button class="danger" onclick="deleteTask(${task.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  if (selectMode) list.classList.add('select-mode');

  // Restart timer displays
  Object.keys(activeTimers).forEach(taskId => {
    const timer = activeTimers[taskId];
    if (document.getElementById(`timer-${taskId}`)) {
      startTimerDisplay(parseInt(taskId), timer.startTime);
    }
  });

  // Restore focus visual
  if (focusedTaskIndex >= 0) updateFocusVisual();
}

function formatDate(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== MODAL FUNCTIONS ====================

function openAddModal() {
  currentEditingId = null;
  document.getElementById('modal-title').textContent = 'Add Task';
  document.getElementById('task-form').reset();
  document.getElementById('task-category').value = 'general';
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-recurring').value = '';
  document.getElementById('task-status-group').style.display = 'none';
  document.getElementById('subtasks-section').style.display = 'none';
  document.getElementById('subtask-list').innerHTML = '';
  document.getElementById('notes-section').style.display = 'none';
  document.getElementById('notes-list').innerHTML = '';
  document.getElementById('task-modal').classList.add('active');
}

async function openEditModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  currentEditingId = taskId;
  document.getElementById('modal-title').textContent = 'Edit Task';
  document.getElementById('task-name').value = task.name;
  document.getElementById('task-description').value = task.description || '';
  document.getElementById('task-category').value = task.category;
  document.getElementById('task-priority').value = task.priority;
  document.getElementById('task-due-date').value = task.dueDate ? task.dueDate.split('T')[0] : '';
  document.getElementById('task-recurring').value = task.recurring || '';
  document.getElementById('task-status-group').style.display = 'block';
  document.getElementById('task-status').value = task.status;

  // Show subtasks section
  document.getElementById('subtasks-section').style.display = 'block';
  const subtasks = await loadSubtasks(taskId);
  renderSubtaskList(subtasks);

  // Show notes section
  document.getElementById('notes-section').style.display = 'block';
  const notes = await loadNotes(taskId);
  renderNotesList(notes);

  document.getElementById('task-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('task-modal').classList.remove('active');
  currentEditingId = null;
}

function handleSaveTask(e) {
  e.preventDefault();
  const taskData = {
    name: document.getElementById('task-name').value,
    description: document.getElementById('task-description').value || null,
    category: document.getElementById('task-category').value,
    priority: document.getElementById('task-priority').value,
    dueDate: document.getElementById('task-due-date').value || null
  };
  // Include status when editing
  if (currentEditingId) {
    taskData.status = document.getElementById('task-status').value;
  }
  saveTask(taskData);
}

// Close modals on click outside
document.getElementById('task-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('task-modal')) closeModal();
});
document.getElementById('categories-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('categories-modal')) closeCategoriesModal();
});
document.getElementById('analytics-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('analytics-modal')) closeAnalyticsModal();
});
document.getElementById('insights-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('insights-modal')) closeInsightsModal();
});
document.getElementById('settings-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('settings-modal')) closeSettingsModal();
});
document.getElementById('shortcuts-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('shortcuts-modal'))
    document.getElementById('shortcuts-modal').classList.remove('active');
});
