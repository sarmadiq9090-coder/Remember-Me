let state, trash = [], view = 'today', filter = 'all', query = '', pendingDelete, toastTimer;
let taskAttachments = [], noteAttachments = [];
let originalTaskDue = null, originalTaskDueValue = '', originalTaskUpdatedAt, originalTaskRepeat = 'none', originalTaskRule = '';
// The repeat details the editor shows, compared on save to tell whether the schedule was edited.
const repeatRuleKey = () => JSON.stringify([repeatDays, $('task-every').value, $('task-before').value]);
const $ = id => document.getElementById(id);
// Marks a message key for tools/i18n-keys.cjs without translating it yet.
const msg = key => key;
// Breadcrumb, title, description and list heading of each view, as message keys.
const views = {
  today: [msg("Today@nav"), msg("Your day, at your pace"), msg("One small step at a time. Set your priorities and leave the reminders to us."), msg("Today's tasks")],
  upcoming: [msg("Upcoming"), msg("Plan what comes next"), msg("Give each task its time. We will remind you when it is due."), msg("Upcoming tasks")],
  all: [msg("All tasks"), msg("Everything on your mind"), msg("One place for your tasks, from idea to completion."), msg("All tasks")],
  completed: [msg("Completed"), msg("Steps worth celebrating"), msg("These small things made a difference in your day."), msg("Completed tasks")],
  notes: [msg("My notes"), msg("Your ideas, in their place"), msg("Write an idea, keep a detail, or clear your mind."), ""],
  trash: [msg("Trash"), msg("Recently deleted"), msg("Deleted items stay here for 30 days, then are removed for good."), ""],
  settings: [msg("Settings"), msg("Remember Me, your way"), msg("Small details that make the space feel yours."), ""],
};
// An optional undo callback adds an Undo button and keeps the message up a little longer.
function toast(message, undo) {
  const el = $('toast'); el.textContent = message;
  if (undo) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'toast-action'; button.textContent = tr("Undo");
    button.addEventListener('click', async () => { el.hidden = true; try { await undo(); await refresh(); } catch (e) { toast(e.message); } }, { once: true });
    el.append(' ', button);
  }
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, undo ? 7000 : 4500);
}
async function refresh() {
  try {
    state = await api('state');
    // Deleted items only appear in the trash view; every other view works on the rest.
    trash = [...state.tasks.filter(t => t.deletedAt).map(item => ({ kind: 'Task', item })), ...state.notes.filter(n => n.deletedAt).map(item => ({ kind: 'Note', item }))].sort((a, b) => Date.parse(b.item.deletedAt) - Date.parse(a.item.deletedAt));
    state.tasks = state.tasks.filter(t => !t.deletedAt); state.notes = state.notes.filter(n => !n.deletedAt);
    await setLanguage(state.settings.language); render();
    // The tray's New task, or Open task in the alert, asked for an editor.
    if (state.openTask && !document.querySelector('dialog[open]')) {
      const task = state.openTask === 'new' ? null : state.tasks.find(t => t.id === state.openTask);
      if (state.openTask === 'new' || (task && !task.completedAt)) openTaskEditor(task || undefined);
    }
  } catch (e) { toast(e.message); }
}
function todayEnd() { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
function todayTasks() { return state.tasks.filter(t => !t.completedAt && (!t.dueAt || Date.parse(t.dueAt) <= todayEnd())); }
function setView(next) {
  view = next; filter = 'all'; query = ''; $('search').value = ''; render();
  if (next === 'settings') loadStorage();
}
let storage = null;
async function loadStorage() { try { storage = await api('storage'); } catch { storage = null; } renderStorage(); }
function renderStorage() {
  $('storage-usage').textContent = storage ? `${tr("Attachments")}: ${fileSize(storage.attachments)} • ${tr("Local backups")}: ${fileSize(storage.backups)}` : '';
  $('clean-orphans').hidden = !storage?.orphans;
  if (storage?.orphans) $('clean-orphans').textContent = tr("Clean up {count} unused attachments ({value})", { count: storage.orphans, value: fileSize(storage.orphanBytes) });
}
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
    $('setting-theme').value = state.settings.theme;
    $('setting-week').value = String(state.settings.weekStart);
    $('data-path').textContent = state.dataPath;
    renderStorage();
    renderDriveBackup();
    renderUpdatesCard();
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
// Reminders only fire while the app runs, so warn when it will not start with Windows but reminders are
// still to come: a card in Settings, and a banner elsewhere until it is dismissed for good.
function startupNotice(dismissible) {
  const card = document.createElement('div');
  card.className = 'settings-card startup-warning'; card.hidden = true;
  card.innerHTML = `<h2></h2><p></p><div class="dialog-footer"><button type="button" class="primary" data-enable></button>${dismissible ? '<button type="button" class="text-button" data-dismiss></button>' : ''}</div>`;
  card.querySelector('[data-enable]').addEventListener('click', async e => {
    e.target.disabled = true;
    try { await api('settings', { ...state.settings, startAtLogin: true }); await refresh(); toast(tr("Remember Me will now start with Windows.")); }
    catch (err) { toast(err.message); } finally { e.target.disabled = false; }
  });
  card.querySelector('[data-dismiss]')?.addEventListener('click', () => { try { localStorage.setItem('startupBannerDismissed', '1'); } catch {} card.hidden = true; });
  return card;
}
const startupCard = startupNotice(false), startupBanner = startupNotice(true);
$('settings-section').prepend(startupCard);
document.querySelector('.page-heading').after(startupBanner);
function bannerDismissed() { try { return localStorage.getItem('startupBannerDismissed') === '1'; } catch { return false; } }
function renderStartupWarning() {
  const needed = !state.settings.startAtLogin && state.tasks.some(t => !t.completedAt && t.dueAt && Date.parse(t.dueAt) > Date.now());
  startupCard.hidden = !needed || view !== 'settings';
  startupBanner.hidden = !needed || view === 'settings' || bannerDismissed();
  for (const card of [startupCard, startupBanner]) {
    card.querySelector('h2').textContent = tr("Reminders only work while Remember Me is running");
    card.querySelector('p').textContent = tr("You have upcoming reminders, but Start with Windows is off. Turn it on so a restart does not make you miss one.");
    card.querySelector('[data-enable]').textContent = tr("Turn on Start with Windows");
    const dismiss = card.querySelector('[data-dismiss]');
    if (dismiss) dismiss.textContent = tr("Dismiss");
  }
}
function attachmentChips(ids = []) {
  const records = ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean);
  return records.filter(isImageFile).map(photoMarkup).join('') + records.filter(a => !isImageFile(a)).map(a => `<button type="button" class="file-chip" data-file-id="${esc(a.id)}" title="${tr('Open')} ${esc(a.name)}">${icon('paperclip')}<bdi>${esc(a.name)}</bdi></button>`).join('');
}
function taskCard(t) {
  const overdue = t.dueAt && Date.parse(t.dueAt) <= Date.now() && !t.completedAt;
  const due = t.dueAt ? `<span class="${overdue ? 'overdue' : ''}">${icon('clock')}${esc(dateLabel(t.dueAt))}${overdue ? ` • ${tr("Due now")}` : ''}</span>` : `<span>${tr("No due date")}</span>`;
  return `<article class="task-row ${t.completedAt ? 'completed' : ''}" data-id="${esc(t.id)}">
    <button class="task-check" data-action="${t.completedAt ? 'reopen' : 'complete'}" aria-label="${t.completedAt ? tr("Reopen") : tr("Complete")} ${esc(t.title)}" title="${t.completedAt ? tr("Reopen without due date") : tr("Mark complete")}">${t.completedAt ? icon('check') : ''}</button>
    <div class="task-info"><div ${!t.completedAt ? 'data-action="edit" tabindex="0" role="button" class="task-edit-target"' : ''}><div class="task-name" dir="auto">${esc(t.title)}</div>${t.body ? `<p class="task-body" dir="auto">${esc(t.body)}</p>` : ''}<div class="task-meta">${due}${t.repeat !== 'none' ? `<span>${icon('repeat')}${esc(repeatLabel(t, state.settings.weekStart))}</span>` : ''}${(t.tags || []).map(tag => `<span class="tag-chip"><bdi>#${esc(tag)}</bdi></span>`).join('')}${t.remindBefore && !t.completedAt ? `<span title="${tr("Early notice")}">${icon('bell')}${esc($('task-before').querySelector(`option[value="${t.remindBefore}"]`)?.textContent || '')}</span>` : ''}${t.snoozedAt && !t.completedAt ? `<span>${tr("Snoozed")}</span>` : ''}</div></div>${stepsMarkup(t)}${t.attachments?.length ? `<div class="file-chips">${attachmentChips(t.attachments)}</div>` : ''}</div>
    ${t.priority !== 'normal' ? `<span class="priority ${t.priority}">${t.priority === 'high' ? tr("High priority") : tr("Medium")}</span>` : ''}<div class="task-actions">${!t.completedAt && t.repeat !== 'none' ? `<button class="icon-button" data-action="skip" title="${tr("Skip this time")}" aria-label="${tr("Skip this time")}: ${esc(t.title)}">${icon('skip')}</button>` : ''}${!t.completedAt ? `<button class="icon-button" data-action="edit" title="${tr("Edit task")}" aria-label="${tr("Edit task")}">${icon('edit')}</button>` : ''}<button class="icon-button" data-action="delete" title="${tr("Delete task")}" aria-label="${tr("Delete task")}">${icon('trash')}</button></div></article>`;
}
function renderNotes() {
  const notes = state.notes.filter(n => matchesSearch(n, query)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  $('notes-list').innerHTML = notes.map(n => `<article class="note-card ${esc(n.color)}" data-id="${esc(n.id)}"><div class="note-edit-target" tabindex="0" role="button" aria-label="${tr("Edit")} ${esc(n.title)}"><h3 dir="auto">${esc(n.title)}</h3><p dir="auto">${esc(n.body)}</p></div>${n.attachments?.length ? `<div class="file-chips">${attachmentChips(n.attachments)}</div>` : ''}<footer><span>${new Date(n.updatedAt).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}</span><button class="icon-button" data-action="delete" aria-label="${tr("Delete note")}">${icon('trash')}</button></footer></article>`).join('');
  $('notes-empty').hidden = !!notes.length;
  $('notes-empty').querySelector('h3').textContent = query ? tr("No matching notes") : tr("Your ideas deserve a place");
}
function openTaskEditor(task) {
  $('task-form').reset(); $('task-error').textContent = '';
  $('task-id').value = task?.id || '';
  $('task-title').value = task?.title || '';
  $('task-body').value = task?.body || '';
  $('task-priority').value = task?.priority || 'normal';
  $('task-reminder').checked = !!task?.dueAt;
  $('task-due').value = localDateValue(task?.dueAt || Date.now() + 3600000);
  originalTaskDue = task?.dueAt || null; originalTaskDueValue = $('task-due').value;
  $('task-repeat').value = originalTaskRepeat = task?.repeat || 'none';
  originalTaskUpdatedAt = task?.updatedAt;
  repeatDays = [...(task?.repeatDays || [new Date(task?.dueAt || Date.now() + 3600000).getDay()])];
  $('task-every').value = task?.repeatEvery || 2;
  $('task-before').value = String(task?.remindBefore || 0);
  $('task-tags').value = (task?.tags || []).join(tr(", "));
  steps = (task?.checklist || []).map(s => ({ ...s })); renderSteps();
  originalTaskRule = repeatRuleKey();
  toggleRepeat();
  taskAttachments = [...(task?.attachments || [])]; renderEditorFiles('task');
  editingSeries = task?.repeat && task.repeat !== 'none' && task.scheduleAt ? task.scheduleAt : null;
  if (editingSeries) $('task-only-once-label').textContent = tr("Only this time (keep the series at {value})", { value: timeLabel(editingSeries) });
  $('task-dialog-title').textContent = task?.id ? tr("Task details") : tr("Space for a new task");
  toggleReminder();
  $('task-dialog').showModal(); $('task-title').focus();
}
// 'Only this time' moves one occurrence of a repeating task and keeps the series at its usual time.
let editingSeries = null;
const onlyOnce = document.createElement('label');
onlyOnce.className = 'hint only-once'; onlyOnce.hidden = true;
onlyOnce.innerHTML = '<input type="checkbox" id="task-only-once"> <span id="task-only-once-label"></span>';
$('task-due').closest('label').after(onlyOnce);
function toggleOnlyOnce() { onlyOnce.hidden = !(editingSeries && $('task-reminder').checked && $('task-repeat').value === originalTaskRepeat); }
$('task-repeat').addEventListener('change', toggleOnlyOnce);
// Week order follows the interface: Saturday first in Arabic, Sunday first in English.
let repeatDays = [];
let steps = [];
// Steps keep their ids while editing so ticks survive renaming or reordering.
function renderSteps() {
  $('task-steps').innerHTML = steps.map((step, i) => `<li><input type="checkbox" data-step-done="${i}" ${step.done ? 'checked' : ''} aria-label="${tr("Done")}"><input type="text" dir="auto" maxlength="200" data-step-text="${i}" value="${esc(step.text)}" placeholder="${tr("Step")} ${i + 1}"><button type="button" class="icon-button" data-step-remove="${i}" aria-label="${tr("Remove step")}">${icon('x')}</button></li>`).join('');
}
function stepsMarkup(t) {
  if (!t.checklist?.length) return '';
  const done = t.checklist.filter(s => s.done).length;
  return `<ul class="step-list" aria-label="${tr("Steps")} ${num(done)}/${num(t.checklist.length)}">${t.checklist.map(s => `<li><label><input type="checkbox" data-toggle-step="${esc(s.id)}" ${s.done ? 'checked' : ''} ${t.completedAt ? 'disabled' : ''}><span dir="auto" class="${s.done ? 'step-done' : ''}">${esc(s.text)}</span></label></li>`).join('')}</ul>`;
}
function renderRepeatDays() {
  $('repeat-days').innerHTML = weekOrder(state.settings.weekStart).map(d => `<button type="button" data-day="${d}" aria-pressed="${repeatDays.includes(d)}" title="${esc(weekdayName(d, 'long'))}">${esc(weekdayName(d))}</button>`).join('');
}
function toggleRepeat() {
  $('repeat-days-field').hidden = $('task-repeat').value !== 'days';
  $('repeat-every-field').hidden = $('task-repeat').value !== 'interval';
  renderRepeatDays();
}
function toggleReminder() { $('reminder-fields').hidden = !$('task-reminder').checked; $('task-due').required = $('task-reminder').checked; toggleOnlyOnce(); }
function openNoteEditor(note) {
  $('note-form').reset(); $('note-error').textContent = '';
  $('note-id').value = note?.id || ''; $('note-title').value = note?.title || ''; $('note-body').value = note?.body || '';
  $('note-color').value = note?.color || 'cream'; $('note-dialog-title').textContent = note ? tr("Note details") : tr("New note");
  noteAttachments = [...(note?.attachments || [])]; renderEditorFiles('note');
  $('note-dialog').showModal(); $('note-title').focus();
}
function askPurge(action, id) {
  pendingDelete = { action, id };
  $('confirm-title').textContent = action === 'emptyTrash' ? tr("Empty the trash?") : tr("Delete permanently?");
  $('confirm-text').textContent = action === 'emptyTrash' ? (tr("{count} items will be removed for good. This cannot be undone.", { count: trash.length })) : tr("This item will be removed from the trash for good. This cannot be undone.");
  $('confirm-dialog').showModal();
}
async function moveToTrash(kind, id) {
  try { await api('delete' + kind, { id }); await refresh(); toast(kind === 'Task' ? tr("Task moved to the trash.") : tr("Note moved to the trash."), () => api('restore' + kind, { id })); }
  catch (err) { toast(err.message); }
}
function renderTrash() {
  const items = trash.filter(({ item }) => matchesSearch(item, query));
  $('trash-count').textContent = num(items.length);
  $('empty-trash').hidden = !trash.length;
  $('trash-list').innerHTML = items.map(({ kind, item }) => {
    const left = Math.max(1, 30 - Math.floor((Date.now() - Date.parse(item.deletedAt)) / 86400000));
    const values = { date: dateLabel(item.deletedAt), count: left };
    const when = kind === 'Task' ? tr('Task • deleted {date} • removed in {count} days', values) : tr('Note • deleted {date} • removed in {count} days', values);
    return `<article class="task-row" data-kind="${kind}" data-id="${esc(item.id)}"><div class="task-info"><div class="task-name" dir="auto">${esc(item.title)}</div><div class="task-meta"><span>${icon('trash')}${esc(when)}</span></div></div><div class="task-actions"><button class="soft-button" data-trash="restore">${icon('undo')} ${tr("Restore")}</button><button class="icon-button" data-trash="purge" title="${tr("Delete permanently")}" aria-label="${tr("Delete permanently")} ${esc(item.title)}">${icon('x')}</button></div></article>`;
  }).join('');
  $('trash-empty').hidden = !!items.length;
}
function renderEditorFiles(type) {
  const ids = type === 'task' ? taskAttachments : noteAttachments;
  $(type + '-files').innerHTML = ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean).map(a => fileMarkup(a, true)).join('');
  $(type + '-file-count').textContent = `${ids.length} / 20`;
  hydratePreviews($(type + '-files'));
}
function renderDriveBackup() {
  const backup = state.driveBackup;
  if (!backup) return;
  $('drive-folder').textContent = backup.folder || tr("No sync folder selected yet");
  $('drive-automatic').checked = backup.automatic;
  $('drive-automatic').disabled = !backup.folder || backup.busy;
  $('drive-keep').value = String(backup.keep || 0);
  $('drive-keep').disabled = !backup.folder || backup.busy;
  $('choose-drive-folder').disabled = backup.busy;
  $('drive-now').disabled = !backup.folder || backup.busy;
  $('drive-now-label').textContent = backup.busy ? tr("Preparing and copying files…") : backup.pending ? tr("Retry backup") : tr("Back up now");
  $('drive-open').hidden = !backup.folder;
  const last = backup.lastCopiedAt ? dateLabel(backup.lastCopiedAt) : tr("never");
  // When a retried copy reused an earlier snapshot, say when its data is from.
  const snapshot = backup.snapshotAt && backup.lastCopiedAt && Date.parse(backup.lastCopiedAt) - Date.parse(backup.snapshotAt) > 60000 ? dateLabel(backup.snapshotAt) : '';
  const stale = backup.stale ? tr("The Google Drive folder has been unavailable for over a day; no new backups have reached your account since {last}. Open Google Drive and sign in.", { last }) : '';
  $('drive-status').textContent = stale || backup.error || (backup.busy ? tr("Saving a local copy, then copying it to the Drive folder…") : backup.lastCopiedAt ? tr('Last copy to the sync folder: {last}{snapshot}. Check the Google Drive icon to confirm the upload finished.', { last, snapshot: snapshot ? tr(' (data from {date})', { date: snapshot }) : '' }) : tr("Install Google Drive and sign in, then choose a folder inside it. Google Drive uploads the copies when you are online."));
  if (!stale && !backup.error && backup.skipped?.length) $('drive-status').textContent += ' ' + skippedText(backup.skipped);
  $('drive-status').classList.toggle('backup-error', !!(stale || backup.error || backup.skipped?.length));
  $('drive-local').textContent = backup.lastLocalPath ? tr("A local copy is also kept on your PC.") : '';
}
// Rebuilds a block only when its content changes, so focus and clicks are not lost on refresh.
function setMarkup(el, html) { if (el.dataset.markup !== html) { el.dataset.markup = html; el.innerHTML = html; hydrateIcons(el); } }
function renderUpdateNotice() {
  const updates = state.updates, notice = $('update-notice');
  if (updates?.banner) setMarkup(notice, `<span data-icon="download"></span><p>${esc(tr("Version {next} is ready. Restart to update", { next: updates.next }))}</p><button class="primary" data-update="installUpdate">${tr("Restart now")}</button><button class="text-button" data-update="dismissUpdate">${tr("Later")}</button>`);
  else if (state.settings.autoUpdate === null) setMarkup(notice, `<span data-icon="info"></span><p>${tr("Remember Me can check GitHub for new versions and install them when you restart. Nothing else is sent.")}</p><button class="primary" data-update="allow">${tr("Allow")}</button><button class="text-button" data-update="decline">${tr("Not now")}</button>`);
  notice.hidden = !updates?.banner && state.settings.autoUpdate !== null;
}
function updateStatus(updates) {
  const next = updates.next, checked = updates.checkedAt ? dateLabel(updates.checkedAt) : '';
  switch (updates.state) {
    case 'checking': return tr("Checking for a new version…");
    case 'downloading': return tr("Downloading version {next}… {percent}%", { next, percent: updates.percent });
    case 'ready': return tr("Version {next} is ready and installs when you restart.", { next });
    case 'installing': return tr("Saving a safety copy of your data, then installing the update…");
    case 'latest': return tr("You have the latest version ({version}). Last checked: {checked}", { version: updates.version, checked });
    case 'error': return tr("Couldn't check for updates. Check your internet connection.");
    case 'unavailable': return tr("Updates work in the installed app only.");
    default: return tr("Current version {version}.", { version: updates.version });
  }
}
function renderUpdatesCard() {
  const updates = state.updates, busy = ['checking', 'downloading', 'installing'].includes(updates.state);
  setMarkup($('updates-card'), `<h2>${tr("Updates")}</h2><label class="setting-row"><div><strong>${tr("Check for updates automatically")}</strong><p>${tr("Checks GitHub once a day and downloads new versions in the background. Nothing else is sent.")}</p></div><input class="switch" id="setting-updates" type="checkbox"></label><div class="setting-row"><p id="update-status">${esc(updateStatus(updates))}</p><button class="soft-button" data-update="checkUpdates"${busy ? ' disabled' : ''}>${tr("Check now")}</button></div>`);
  $('setting-updates').checked = state.settings.autoUpdate === true;
}
async function openFile(id) { try { await api('openAttachment', { id }); } catch (error) { toast(error.message); } }
for (const type of ['task', 'note']) {
  $(type + '-attach').addEventListener('click', async () => {
    const fields = $(type + '-form').querySelectorAll('button, input, select, textarea');
    fields.forEach(el => el.disabled = true);
    $(type + '-error').textContent = '';
    try {
      const ids = type === 'task' ? taskAttachments : noteAttachments;
      const records = await api('attachFiles', { remaining: 20 - ids.length });
      ids.push(...records.map(a => a.id));
      await refresh(); renderEditorFiles(type);
    } catch (error) { $(type + '-error').textContent = error.message; }
    finally { fields.forEach(el => el.disabled = false); }
  });
  $(type + '-files').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-file]');
    if (remove) {
      if (type === 'task') taskAttachments = taskAttachments.filter(id => id !== remove.dataset.removeFile);
      else noteAttachments = noteAttachments.filter(id => id !== remove.dataset.removeFile);
      renderEditorFiles(type); return;
    }
    const file = e.target.closest('[data-file-id]');
    if (file) api('openAttachment', { id: file.dataset.fileId }).catch(error => $(type + '-error').textContent = error.message);
  });
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) { filter = b.dataset.filter; render(); } });
['new-task', 'hero-add', 'empty-add'].forEach(id => $(id).addEventListener('click', () => openTaskEditor()));
$('page-add').addEventListener('click', () => view === 'notes' ? openNoteEditor() : openTaskEditor());
$('empty-note').addEventListener('click', () => openNoteEditor());
$('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });
$('sort').addEventListener('change', render);
$('task-reminder').addEventListener('change', toggleReminder);
$('task-repeat').addEventListener('change', toggleRepeat);
$('repeat-days').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (!b) return; const d = Number(b.dataset.day); repeatDays = repeatDays.includes(d) ? repeatDays.filter(x => x !== d) : [...repeatDays, d]; if (!repeatDays.length) repeatDays = [d]; renderRepeatDays(); });
document.querySelectorAll('[data-workdays]').forEach(b => b.addEventListener('click', () => { repeatDays = b.dataset.workdays.split(',').map(Number); renderRepeatDays(); }));
document.querySelectorAll('[data-delay]').forEach(b => b.addEventListener('click', () => $('task-due').value = localDateValue(Date.now() + Number(b.dataset.delay) * 60000)));
document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('task-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = e.submitter; submit.disabled = true;
  try {
    const id = $('task-id').value || undefined, reminder = $('task-reminder').checked;
    // Tells the main process whether to keep a snooze or Done made in the alert while this editor was open.
    const timeEdited = reminder !== !!originalTaskDue || (reminder && ($('task-due').value !== originalTaskDueValue || $('task-repeat').value !== originalTaskRepeat || repeatRuleKey() !== originalTaskRule));
    await api('saveTask', { id, title: $('task-title').value, body: $('task-body').value, attachments: taskAttachments, category: state.tasks.find(t => t.id === $('task-id').value)?.category || 'personal', priority: $('task-priority').value,
      dueAt: reminder ? (originalTaskDue && $('task-due').value === originalTaskDueValue ? originalTaskDue : new Date($('task-due').value).toISOString()) : null, repeat: reminder ? $('task-repeat').value : 'none',
      repeatDays, repeatEvery: Number($('task-every').value), remindBefore: reminder ? Number($('task-before').value) : 0, tags: parseTags($('task-tags').value), checklist: steps.filter(s => s.text.trim()),
      ...(id ? { updatedAt: originalTaskUpdatedAt, timeEdited, onlyThisTime: !onlyOnce.hidden && $('task-only-once').checked } : {}) });
    $('task-dialog').close(); await refresh();
    const saved = id && state.tasks.find(t => t.id === id);
    toast(saved?.completedAt ? tr("Your text was saved. The task had already been completed from the alert.")
      : saved && !timeEdited && saved.dueAt !== originalTaskDue ? tr("Your text was saved, and the time chosen from the alert was kept.")
      : tr("Task saved. Your next step is in place."));
  } catch (err) { $('task-error').textContent = err.message; } finally { submit.disabled = false; }
});
let quickBusy = false;
$('quick-form').addEventListener('submit', async e => {
  e.preventDefault(); const input = $('quick-title');
  // A second Enter while the first add is still saving would create the task twice.
  if (quickBusy) return; quickBusy = true; if (e.submitter) e.submitter.disabled = true;
  try { await api('saveTask', { title: input.value }); input.value = ''; if (view === 'upcoming') view = 'all'; await refresh(); toast(tr("Task added. Open it to add a due time.")); } catch (err) { toast(err.message); }
  finally { quickBusy = false; if (e.submitter) e.submitter.disabled = false; }
});
$('add-step').addEventListener('click', () => { steps.push({ text: '', done: false }); renderSteps(); $('task-steps').querySelector('li:last-child input[type=text]').focus(); });
$('task-steps').addEventListener('input', e => { if (e.target.dataset.stepText) steps[e.target.dataset.stepText].text = e.target.value; });
$('task-steps').addEventListener('change', e => { if (e.target.dataset.stepDone) steps[e.target.dataset.stepDone].done = e.target.checked; });
$('task-steps').addEventListener('click', e => { const b = e.target.closest('[data-step-remove]'); if (b) { steps.splice(Number(b.dataset.stepRemove), 1); renderSteps(); } });
$('task-steps').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.stepText) { e.preventDefault(); $('add-step').click(); } });
$('task-list').addEventListener('change', async e => {
  const box = e.target.closest('[data-toggle-step]'), row = e.target.closest('[data-id]'); if (!box || !row) return;
  try { await api('toggleStep', { id: row.dataset.id, stepId: box.dataset.toggleStep }); await refresh(); } catch (err) { toast(err.message); }
});
const busyRows = new Set();
$('task-list').addEventListener('click', async e => {
  if (e.target.closest('.step-list')) return;
  const file = e.target.closest('[data-file-id]'); if (file) return openFile(file.dataset.fileId);
  const button = e.target.closest('[data-action]'), row = e.target.closest('[data-id]'); if (!button || !row) return;
  const id = row.dataset.id, action = button.dataset.action;
  if (action === 'edit') return openTaskEditor(state.tasks.find(t => t.id === id));
  if (action === 'delete') return moveToTrash('Task', id);
  // One request per row at a time; the due time lets the main process ignore a repeat for the same occurrence.
  if (busyRows.has(id)) return; busyRows.add(id); button.disabled = true;
  try {
    // For 'complete', done is null when the occurrence was already handled; skip returns false then. No toast either way.
    const done = await api(action, action === 'reopen' ? { id } : { id, expectedDueAt: state.tasks.find(t => t.id === id)?.dueAt ?? null }); await refresh();
    const next = state.tasks.find(t => t.id === id)?.dueAt;
    if (action === 'reopen' || done) toast(action === 'complete' ? tr("Task completed. Well done—every step counts!") : action === 'skip' ? tr("Skipped this time. Next: {value}", { value: dateLabel(next) }) : tr("Task reopened without a due date. Open it to set a reminder."), action === 'complete' && done ? () => api('undoComplete', done) : undefined);
  } catch (err) { toast(err.message); } finally { busyRows.delete(id); button.disabled = false; }
});
$('task-list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('task-edit-target')) { e.preventDefault(); e.target.click(); } });
$('note-form').addEventListener('submit', async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try { await api('saveNote', { id: $('note-id').value || undefined, title: $('note-title').value, body: $('note-body').value, color: $('note-color').value, attachments: noteAttachments }); $('note-dialog').close(); await refresh(); toast(tr("Note saved.")); }
  catch (err) { $('note-error').textContent = err.message; } finally { e.submitter.disabled = false; }
});
$('notes-list').addEventListener('click', e => { const file = e.target.closest('[data-file-id]'); if (file) return openFile(file.dataset.fileId); const card = e.target.closest('[data-id]'); if (!card) return; if (e.target.closest('[data-action="delete"]')) return moveToTrash('Note', card.dataset.id); openNoteEditor(state.notes.find(n => n.id === card.dataset.id)); });
$('notes-list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('note-edit-target')) { e.preventDefault(); e.target.click(); } });
$('cancel-delete').addEventListener('click', () => $('confirm-dialog').close());
$('confirm-delete').addEventListener('click', async () => { if (!pendingDelete) return; try { await api(pendingDelete.action, pendingDelete.id ? { id: pendingDelete.id } : undefined); pendingDelete = null; $('confirm-dialog').close(); await refresh(); toast(tr("Deleted permanently.")); } catch (err) { toast(err.message); } });
$('trash-list').addEventListener('click', async e => {
  const button = e.target.closest('[data-trash]'), row = e.target.closest('[data-id]'); if (!button || !row) return;
  const { kind, id } = row.dataset;
  if (button.dataset.trash === 'purge') return askPurge('purge' + kind, id);
  try { await api('restore' + kind, { id }); await refresh(); toast(kind === 'Task' ? tr("Task restored.") : tr("Note restored.")); } catch (err) { toast(err.message); }
});
$('empty-trash').addEventListener('click', () => askPurge('emptyTrash'));
for (const id of ['preview-alert', 'settings-preview']) $(id).addEventListener('click', async () => { try { await api('preview'); toast(tr("The alert appeared above the taskbar.")); } catch (err) { toast(err.message); } });
// 'Remind me again every' row, built here (with tr()) so index.html and the i18n dictionary stay untouched.
const remindAgainRow = document.createElement('label');
remindAgainRow.className = 'setting-row';
remindAgainRow.innerHTML = '<div><strong></strong><p></p></div><select id="setting-remind-again"><option value="0"></option><option value="2"></option><option value="5"></option><option value="15"></option></select>';
$('setting-sound').closest('.setting-row').after(remindAgainRow);
function renderRemindAgain() {
  remindAgainRow.querySelector('strong').textContent = tr("Remind me again every");
  remindAgainRow.querySelector('p').textContent = tr("While an alert is unanswered, up to 6 times.");
  for (const option of $('setting-remind-again').options) option.textContent = { 0: tr("Off"), 2: tr("2 minutes"), 5: tr("5 minutes"), 15: tr("15 minutes") }[option.value];
  $('setting-remind-again').value = String(state.settings.remindAgain || 0);
}
function settingsPayload() {
  return { sound: $('setting-sound').checked, startAtLogin: $('setting-startup').checked, alertSide: $('setting-side').value, language: $('setting-language').value, weekStart: Number($('setting-week').value), theme: $('setting-theme').value, remindAgain: Number($('setting-remind-again').value) };
}
for (const id of ['setting-sound', 'setting-startup', 'setting-side', 'setting-language', 'setting-week', 'setting-theme', 'setting-remind-again']) $(id).addEventListener('change', async () => {
  try { await api('settings', settingsPayload()); await refresh(); toast(tr("Settings saved.")); }
  catch (err) { toast(err.message); } await refresh();
});
// Names the attachments a backup had to leave out because their files are missing, with the task or note each belongs to.
function skippedText(skipped = []) {
  if (!skipped.length) return '';
  const list = skipped.map(s => s.itemTitle ? `${s.name} (${s.itemTitle})` : s.name).join(tr(", "));
  return tr("{count} attachments were left out because their files are missing: {list}", { count: skipped.length, list });
}
$('export-data').addEventListener('click', async () => {
  $('export-data').disabled = true;
  try { const result = await api('export'); if (result) toast(result.skipped?.length ? `${tr("The backup folder was saved.")} ${skippedText(result.skipped)}` : tr("The backup folder was saved with all attachments.")); }
  catch (err) { toast(err.message); } finally { $('export-data').disabled = false; }
});
$('restore-data').addEventListener('click', async () => {
  $('restore-data').disabled = true;
  try { if (await api('restore')) { await refresh(); toast(tr("Backup restored. Your previous data was saved in the backups folder.")); } }
  catch (err) { toast(err.message); } finally { $('restore-data').disabled = false; }
});
$('clean-orphans').addEventListener('click', async () => {
  $('clean-orphans').disabled = true;
  try { const before = storage?.orphans; const usage = await api('cleanOrphans'); if (usage) { storage = usage; renderStorage(); if (usage.orphans < before) toast(tr("Unused attachments were deleted.")); } }
  catch (err) { toast(err.message); } finally { $('clean-orphans').disabled = false; }
});
$('open-data').addEventListener('click', async () => { try { await api('dataFolder'); } catch (err) { toast(err.message); } });
async function driveAction(action, payload) { try { const value = await api(action, payload); await refresh(); return value; } catch (error) { toast(error.message); await refresh(); } }
$('choose-drive-folder').addEventListener('click', () => driveAction('chooseDriveFolder'));
document.addEventListener('click', async e => {
  const button = e.target.closest('[data-update]');
  if (!button) return;
  const action = button.dataset.update;
  button.disabled = true;
  try {
    if (action === 'allow' || action === 'decline') await api('updateConsent', { enabled: action === 'allow' });
    else await api(action);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; await refresh(); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'setting-updates') return;
  try { await api('updateConsent', { enabled: e.target.checked }); toast(tr("Settings saved.")); } catch (error) { toast(error.message); }
  await refresh();
});
$('drive-now').addEventListener('click', async () => { $('drive-now').disabled = true; const status = await driveAction('driveBackupNow'); if (status) toast(`${tr("Saved locally and to the Drive folder. Google Drive finishes the upload.")} ${skippedText(status.skipped)}`.trim()); });
$('drive-automatic').addEventListener('change', () => driveAction('driveAutomatic', { enabled: $('drive-automatic').checked }));
$('drive-keep').addEventListener('change', () => driveAction('driveKeep', { keep: Number($('drive-keep').value) }));
$('drive-install').addEventListener('click', () => driveAction('driveHelp'));
$('drive-open').addEventListener('click', () => driveAction('openDriveFolder'));
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); view === 'notes' ? openNoteEditor() : openTaskEditor(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('search').focus(); }
});
window.waqt.onUpdate(refresh);
refresh().then(() => {
  if (state?.recovered) toast(tr("Your data was restored from backup after the original file could not be read."));
  else if (state?.driveBackup?.stale) toast(tr("Backups to Google Drive have been stalled for over a day. Open Settings for details."));
});
setInterval(() => { if (!document.querySelector('dialog[open]')) render(); }, 30000);
