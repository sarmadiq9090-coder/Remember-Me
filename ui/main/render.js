// Renders the current view: counts, header, task list and tag filters.
function render() {
  if (!state) return;
  const active = state.tasks.filter(t => !t.completedAt), today = todayTasks();
  const complete = state.tasks.filter(t => t.completedAt);
  const upcoming = active.filter(t => t.dueAt && Date.parse(t.dueAt) > todayEnd());
  for (const [key, value] of Object.entries({ today: today.length, all: active.length, upcoming: upcoming.length, notes: state.notes.length, completed: complete.length, trash: trash.length })) $('count-' + key).textContent = num(value);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelector('.nav-item[data-view="settings"]').classList.toggle('needs-attention', !!state.driveBackup?.stale);
  renderTagFilters();
  renderUpdateNotice();
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  const names = views[view].map(key => (key ? tr(key) : ''));
  $('breadcrumb').textContent = names[0];
  $('page-title').innerHTML = `${names[1]}<span class="title-dot">.</span>`;
  $('page-description').textContent = names[2];
  $('date-label').textContent = new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('dashboard').hidden = view !== 'today';
  $('tasks-section').hidden = ['notes', 'settings', 'trash'].includes(view);
  $('trash-section').hidden = view !== 'trash';
  $('notes-section').hidden = view !== 'notes';
  $('settings-section').hidden = view !== 'settings';
  $('page-add').hidden = ['settings', 'completed', 'trash'].includes(view);
  $('page-add-label').textContent = view === 'notes' ? tr("New note") : tr("Add task");
  $('stat-active').textContent = num(today.length);
  const doneToday = complete.filter(t => isToday(t.completedAt)).length;
  $('stat-done').textContent = num(doneToday);
  const next = active.filter(t => t.dueAt).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  $('stat-next').textContent = next ? (Date.parse(next.dueAt) <= Date.now() ? tr("Due now") : timeLabel(next.dueAt)) : tr("None");
  $('stat-next').title = next ? dateLabel(next.dueAt) : '';
  $('next-title').textContent = next ? next.title : tr("Room for new plans");
  $('hero-title').textContent = doneToday ? tr('You completed {count} tasks. Keep going at your pace.', { count: doneToday }) : tr("Everything starts with one step.");
  $('hero-description').textContent = today.length ? tr('You have {count} tasks waiting. Choose one and begin there.', { count: today.length }) : tr("Add what matters and set its time. We will remind you.");
  if (view === 'notes') renderNotes();
  else if (view === 'trash') renderTrash();
  else if (view === 'settings') {
    $('setting-sound').checked = state.settings.sound;
    $('setting-startup').checked = state.settings.startAtLogin;
    $('setting-side').value = state.settings.alertSide;
    // Each language is listed in its own script, whatever the interface language.
    if (!$('setting-language').options.length) $('setting-language').innerHTML = LOCALES.map(l => `<option value="${l.code}" lang="${l.code}" dir="${l.dir}">${esc(l.name)}</option>`).join('');
    $('setting-language').value = state.settings.language;
    renderRemindAgain();
    renderAppearance();
    $('setting-week').value = String(state.settings.weekStart);
    $('data-path').textContent = state.dataPath;
    renderStorage();
    renderDriveBackup();
    renderUpdatesCard();
    renderAboutCard();
  } else {
    let tasks = view === 'today' ? today : view === 'upcoming' ? upcoming : view === 'completed' ? complete : active;
    if (filter === 'high') tasks = tasks.filter(t => t.priority === 'high');
    else if (filter.startsWith('tag:')) tasks = tasks.filter(t => (t.tags || []).includes(filter.slice(4)));
    if (query) tasks = tasks.filter(t => matchesSearch(t, query));
    const rank = { high: 0, medium: 1, normal: 2 };
    tasks = [...tasks].sort((a, b) => $('sort').value === 'priority' ? rank[a.priority] - rank[b.priority] : $('sort').value === 'newest' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : $('sort').value === 'title' ? a.title.localeCompare(b.title, locale()) : (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity));
    $('list-title').innerHTML = `${names[3]} <span id="list-count">${num(tasks.length)}</span>`;
    $('quick-form').hidden = view === 'completed';
    $('task-list').innerHTML = tasks.map(task => taskCard(task)).join('');
    $('task-empty').hidden = !!tasks.length;
    const emptyTitle = $('task-empty').querySelector('h3'), emptyText = $('task-empty').querySelector('p');
    emptyTitle.textContent = query || filter !== 'all' ? tr("No matching tasks") : view === 'completed' ? tr("Every achievement will appear here") : view === 'upcoming' ? tr("The coming days await your plans") : tr("A fresh space for a gentle start");
    emptyText.textContent = query || filter !== 'all' ? tr("Try another word or choose a different list.") : view === 'completed' ? tr("Complete any task to see it in this list.") : tr("Write a small task, an idea, or anything you don't want to forget.");
    $('empty-add').hidden = view === 'completed' || !!query || filter !== 'all';
  }
  renderStartupWarning();
  hydratePreviews();
}
function allTags() { const tags = new Map(); for (const t of state.tasks) for (const tag of t.tags || []) tags.set(tag.toLowerCase(), tag); return [...tags.values()].sort((a, b) => a.localeCompare(b, locale())); }
// One filter button per tag in use, after All and High priority.
function renderTagFilters() {
  const tags = allTags();
  if (filter.startsWith('tag:') && !tags.includes(filter.slice(4))) filter = 'all';
  $('filters').querySelectorAll('[data-filter^="tag:"]').forEach(b => b.remove());
  $('filters').insertAdjacentHTML('beforeend', tags.map(tag => `<button class="filter" data-filter="tag:${esc(tag)}"><bdi>#${esc(tag)}</bdi></button>`).join(''));
  $('tag-options').innerHTML = tags.map(tag => `<option value="${esc(tag)}">`).join('');
}
function parseTags(text) { return text.split(/[,،;؛]/).map(t => t.trim()).filter(Boolean); }
