let state, view = 'today', filter = 'all', query = '', pendingDelete, toastTimer;
let taskAttachments = [], noteAttachments = [];
let originalTaskDue = null, originalTaskDueValue = '', originalTaskUpdatedAt, originalTaskRepeat = 'none';
const $ = id => document.getElementById(id);
const views = {
  today: [['يومي','Today'], ['يومك، على مهل','Your day, at your pace'], ['خطوة صغيرة كل مرة. رتّب أولوياتك واترك التذكير علينا.','One small step at a time. Set your priorities and leave the reminders to us.'], ['مهام اليوم',"Today's tasks"]],
  upcoming: [['القادمة','Upcoming'], ['خطط لما هو قادم','Plan what comes next'], ['امنح كل مهمة وقتها. نذكّرك حين يحين الموعد.','Give each task its time. We will remind you when it is due.'], ['المهام القادمة','Upcoming tasks']],
  all: [['كل المهام','All tasks'], ['كل ما يشغل بالك','Everything on your mind'], ['مكان واحد لمهامك، من الفكرة حتى الإنجاز.','One place for your tasks, from idea to completion.'], ['كل المهام','All tasks']],
  completed: [['المكتملة','Completed'], ['خطوات تستحق التقدير','Steps worth celebrating'], ['هذه الأشياء الصغيرة صنعت فرقًا في يومك.','These small things made a difference in your day.'], ['المهام المكتملة','Completed tasks']],
  notes: [['ملاحظاتي','My notes'], ['أفكارك، في مكانها','Your ideas, in their place'], ['اكتب فكرة، احتفظ بتفصيل، أو أفرغ ما يدور في بالك.','Write an idea, keep a detail, or clear your mind.'], ['','']],
  settings: [['الإعدادات','Settings'], ['ذكرني، على طريقتك','Remember Me, your way'], ['تفاصيل بسيطة تجعل مساحتك أقرب إليك.','Small details that make the space feel yours.'], ['','']],
};
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
async function refresh() { try { state = await api('state'); setLanguage(state.settings.language); render(); } catch (e) { toast(e.message); } }
function todayEnd() { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
function todayTasks() { return state.tasks.filter(t => !t.completedAt && (!t.dueAt || Date.parse(t.dueAt) <= todayEnd())); }
function setView(next) {
  view = next; filter = 'all'; query = ''; $('search').value = ''; render();
  if (next === 'settings') loadStorage();
}
let storage = null;
async function loadStorage() { try { storage = await api('storage'); } catch { storage = null; } renderStorage(); }
function renderStorage() {
  $('storage-usage').textContent = storage ? `${tr('المرفقات', 'Attachments')}: ${fileSize(storage.attachments)} • ${tr('النسخ الاحتياطية المحلية', 'Local backups')}: ${fileSize(storage.backups)}` : '';
  $('clean-orphans').hidden = !storage?.orphans;
  if (storage?.orphans) $('clean-orphans').textContent = uiLanguage === 'en' ? `Clean up ${storage.orphans} unused attachments (${fileSize(storage.orphanBytes)})` : `تنظيف ${storage.orphans} من المرفقات غير المستخدمة (${fileSize(storage.orphanBytes)})`;
}
function render() {
  if (!state) return;
  const active = state.tasks.filter(t => !t.completedAt), today = todayTasks();
  const complete = state.tasks.filter(t => t.completedAt);
  const upcoming = active.filter(t => t.dueAt && Date.parse(t.dueAt) > todayEnd());
  for (const [key, value] of Object.entries({ today: today.length, all: active.length, upcoming: upcoming.length, notes: state.notes.length, completed: complete.length })) $('count-' + key).textContent = value;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelector('.nav-item[data-view="settings"]').classList.toggle('needs-attention', !!state.driveBackup?.stale);
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  const names = views[view].map(([ar, en]) => tr(ar, en));
  $('breadcrumb').textContent = names[0];
  $('page-title').innerHTML = `${names[1]}<span class="title-dot">.</span>`;
  $('page-description').textContent = names[2];
  $('date-label').textContent = new Date().toLocaleDateString(uiLanguage === 'en' ? 'en-US' : 'ar-IQ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('dashboard').hidden = view !== 'today';
  $('tasks-section').hidden = ['notes', 'settings'].includes(view);
  $('notes-section').hidden = view !== 'notes';
  $('settings-section').hidden = view !== 'settings';
  $('page-add').hidden = view === 'settings' || view === 'completed';
  $('page-add-label').textContent = view === 'notes' ? tr('ملاحظة جديدة','New note') : tr('إضافة مهمة','Add task');
  $('stat-active').textContent = today.length;
  const doneToday = complete.filter(t => isToday(t.completedAt)).length;
  $('stat-done').textContent = doneToday;
  const next = active.filter(t => t.dueAt).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  $('stat-next').textContent = next ? (Date.parse(next.dueAt) <= Date.now() ? tr('حان الآن','Due now') : timeLabel(next.dueAt)) : tr('لا يوجد','None');
  $('stat-next').title = next ? dateLabel(next.dueAt) : '';
  $('next-title').textContent = next ? next.title : tr('مساحة لخطط جديدة','Room for new plans');
  $('hero-title').textContent = doneToday ? (uiLanguage === 'en' ? `You completed ${doneToday} ${doneToday === 1 ? 'task. A beautiful start!' : 'tasks. Keep going at your pace.'}` : `أنجزت ${doneToday} ${doneToday === 1 ? 'مهمة. بداية جميلة!' : 'مهام. واصل على مهلك.'}`) : tr('كل شيء يبدأ بخطوة.','Everything starts with one step.');
  $('hero-description').textContent = today.length ? (uiLanguage === 'en' ? `You have ${today.length} ${today.length === 1 ? 'task' : 'tasks'} waiting. Choose one and begin there.` : `لديك ${today.length} ${today.length === 1 ? 'مهمة بانتظارك' : 'مهام بانتظارك'}. اختر واحدة، وابدأ من هناك.`) : tr('أضف ما يشغلك، وحدّد وقته. نحن هنا لنذكّرك.','Add what matters and set its time. We will remind you.');
  if (view === 'notes') renderNotes();
  else if (view === 'settings') {
    $('setting-sound').checked = state.settings.sound;
    $('setting-startup').checked = state.settings.startAtLogin;
    $('setting-side').value = state.settings.alertSide;
    $('setting-language').value = state.settings.language;
    $('data-path').textContent = state.dataPath;
    renderStorage();
    renderDriveBackup();
  } else {
    let tasks = view === 'today' ? today : view === 'upcoming' ? upcoming : view === 'completed' ? complete : active;
    if (filter === 'high') tasks = tasks.filter(t => t.priority === 'high');
    if (query) tasks = tasks.filter(t => matchesSearch(t, query));
    const rank = { high: 0, medium: 1, normal: 2 };
    tasks = [...tasks].sort((a, b) => $('sort').value === 'priority' ? rank[a.priority] - rank[b.priority] : $('sort').value === 'newest' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity));
    $('list-title').innerHTML = `${names[3]} <span id="list-count">${tasks.length}</span>`;
    $('quick-form').hidden = view === 'completed';
    $('task-list').innerHTML = tasks.map(task => taskCard(task)).join('');
    $('task-empty').hidden = !!tasks.length;
    const emptyTitle = $('task-empty').querySelector('h3'), emptyText = $('task-empty').querySelector('p');
    emptyTitle.textContent = query || filter !== 'all' ? tr('لا توجد مهام مطابقة','No matching tasks') : view === 'completed' ? tr('كل إنجاز سيجد مكانه هنا','Every achievement will appear here') : view === 'upcoming' ? tr('الأيام القادمة بانتظار خططك','The coming days await your plans') : tr('مساحة جديدة لبداية لطيفة','A fresh space for a gentle start');
    emptyText.textContent = query || filter !== 'all' ? tr('جرّب كلمة أخرى أو اختر قائمة مختلفة.','Try another word or choose a different list.') : view === 'completed' ? tr('اضغط علامة الإنجاز بجانب أي مهمة لتظهر في هذه القائمة.','Complete any task to see it in this list.') : tr('اكتب مهمة صغيرة، فكرة مهمة، أو شيئًا لا تريد نسيانه.',"Write a small task, an idea, or anything you don't want to forget.");
    $('empty-add').hidden = view === 'completed' || !!query || filter !== 'all';
  }
  hydratePreviews();
}
function attachmentChips(ids = []) {
  const records = ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean);
  return records.filter(isImageFile).map(photoMarkup).join('') + records.filter(a => !isImageFile(a)).map(a => `<button type="button" class="file-chip" data-file-id="${esc(a.id)}" title="فتح ${esc(a.name)}">${icon('paperclip')}<bdi>${esc(a.name)}</bdi></button>`).join('');
}
function taskCard(t) {
  const overdue = t.dueAt && Date.parse(t.dueAt) <= Date.now() && !t.completedAt;
  const due = t.dueAt ? `<span class="${overdue ? 'overdue' : ''}">${icon('clock')}${esc(dateLabel(t.dueAt))}${overdue ? ` • ${tr('حان الموعد','Due now')}` : ''}</span>` : `<span>${tr('دون موعد','No due date')}</span>`;
  return `<article class="task-row ${t.completedAt ? 'completed' : ''}" data-id="${esc(t.id)}">
    <button class="task-check" data-action="${t.completedAt ? 'reopen' : 'complete'}" aria-label="${t.completedAt ? tr('إعادة فتح','Reopen') : tr('إكمال','Complete')} ${esc(t.title)}" title="${t.completedAt ? tr('إعادة فتح دون موعد','Reopen without due date') : tr('تم الإنجاز','Mark complete')}">${t.completedAt ? icon('check') : ''}</button>
    <div class="task-info"><div ${!t.completedAt ? 'data-action="edit" tabindex="0" role="button" class="task-edit-target"' : ''}><div class="task-name" dir="auto">${esc(t.title)}</div>${t.body ? `<p class="task-body" dir="auto">${esc(t.body)}</p>` : ''}<div class="task-meta">${due}${t.repeat !== 'none' ? `<span>${icon('repeat')}${t.repeat === 'daily' ? tr('يوميًا','Daily') : tr('أسبوعيًا','Weekly')}</span>` : ''}${t.snoozedAt && !t.completedAt ? `<span>${tr('مؤجّلة','Snoozed')}</span>` : ''}</div></div>${t.attachments?.length ? `<div class="file-chips">${attachmentChips(t.attachments)}</div>` : ''}</div>
    ${t.priority !== 'normal' ? `<span class="priority ${t.priority}">${t.priority === 'high' ? tr('أولوية عالية','High priority') : tr('متوسطة','Medium')}</span>` : ''}<div class="task-actions">${!t.completedAt ? `<button class="icon-button" data-action="edit" title="${tr('تعديل المهمة','Edit task')}" aria-label="${tr('تعديل المهمة','Edit task')}">${icon('edit')}</button>` : ''}<button class="icon-button" data-action="delete" title="${tr('حذف المهمة','Delete task')}" aria-label="${tr('حذف المهمة','Delete task')}">${icon('trash')}</button></div></article>`;
}
function renderNotes() {
  const notes = state.notes.filter(n => matchesSearch(n, query)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  $('notes-list').innerHTML = notes.map(n => `<article class="note-card ${esc(n.color)}" data-id="${esc(n.id)}"><div class="note-edit-target" tabindex="0" role="button" aria-label="${tr('تعديل','Edit')} ${esc(n.title)}"><h3 dir="auto">${esc(n.title)}</h3><p dir="auto">${esc(n.body)}</p></div>${n.attachments?.length ? `<div class="file-chips">${attachmentChips(n.attachments)}</div>` : ''}<footer><span>${new Date(n.updatedAt).toLocaleDateString(uiLanguage === 'en' ? 'en-US' : 'ar-IQ', { day: 'numeric', month: 'long' })}</span><button class="icon-button" data-action="delete" aria-label="${tr('حذف الملاحظة','Delete note')}">${icon('trash')}</button></footer></article>`).join('');
  $('notes-empty').hidden = !!notes.length;
  $('notes-empty').querySelector('h3').textContent = query ? tr('لا توجد ملاحظات مطابقة','No matching notes') : tr('أفكارك تستحق مكانًا','Your ideas deserve a place');
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
  taskAttachments = [...(task?.attachments || [])]; renderEditorFiles('task');
  $('task-dialog-title').textContent = task?.id ? tr('تفاصيل المهمة','Task details') : tr('مساحة لمهمة جديدة','Space for a new task');
  toggleReminder();
  $('task-dialog').showModal(); $('task-title').focus();
}
window.openTaskEditor = openTaskEditor;
function toggleReminder() { $('reminder-fields').hidden = !$('task-reminder').checked; $('task-due').required = $('task-reminder').checked; }
function openNoteEditor(note) {
  $('note-form').reset(); $('note-error').textContent = '';
  $('note-id').value = note?.id || ''; $('note-title').value = note?.title || ''; $('note-body').value = note?.body || '';
  $('note-color').value = note?.color || 'cream'; $('note-dialog-title').textContent = note ? tr('تفاصيل الملاحظة','Note details') : tr('ملاحظة جديدة','New note');
  noteAttachments = [...(note?.attachments || [])]; renderEditorFiles('note');
  $('note-dialog').showModal(); $('note-title').focus();
}
function askDelete(type, id) { pendingDelete = { type, id }; $('confirm-dialog').showModal(); }
function renderEditorFiles(type) {
  const ids = type === 'task' ? taskAttachments : noteAttachments;
  $(type + '-files').innerHTML = ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean).map(a => fileMarkup(a, true)).join('');
  $(type + '-file-count').textContent = `${ids.length} / 20`;
  hydratePreviews($(type + '-files'));
}
function renderDriveBackup() {
  const backup = state.driveBackup;
  if (!backup) return;
  $('drive-folder').textContent = backup.folder || tr('لم يُحدَّد مجلد المزامنة بعد','No sync folder selected yet');
  $('drive-automatic').checked = backup.automatic;
  $('drive-automatic').disabled = !backup.folder || backup.busy;
  $('drive-keep').value = String(backup.keep || 0);
  $('drive-keep').disabled = !backup.folder || backup.busy;
  $('choose-drive-folder').disabled = backup.busy;
  $('drive-now').disabled = !backup.folder || backup.busy;
  $('drive-now-label').textContent = backup.busy ? tr('جارٍ تجهيز ونسخ الملفات…','Preparing and copying files…') : backup.pending ? tr('إعادة محاولة النسخ','Retry backup') : tr('نسخ احتياطي الآن','Back up now');
  $('drive-open').hidden = !backup.folder;
  const last = backup.lastCopiedAt ? dateLabel(backup.lastCopiedAt) : tr('لم تُنسخ بعد', 'never');
  // When a retried copy reused an earlier snapshot, say when its data is from.
  const snapshot = backup.snapshotAt && backup.lastCopiedAt && Date.parse(backup.lastCopiedAt) - Date.parse(backup.snapshotAt) > 60000 ? dateLabel(backup.snapshotAt) : '';
  const stale = backup.stale ? tr(`مجلد Google Drive غير متاح منذ أكثر من يوم، ولم تصل نسخ جديدة إلى حسابك منذ ${last}. افتح Google Drive وسجّل الدخول.`, `The Google Drive folder has been unavailable for over a day; no new backups have reached your account since ${last}. Open Google Drive and sign in.`) : '';
  $('drive-status').textContent = stale || backup.error || (backup.busy ? tr('جارٍ حفظ نسخة محلية ثم نسخها إلى مجلد Drive…', 'Saving a local copy, then copying it to the Drive folder…') : backup.lastCopiedAt ? tr(`آخر نسخة إلى مجلد المزامنة: ${last}${snapshot ? ` (بيانات ${snapshot})` : ''}. تحقّق من أيقونة Google Drive لتأكيد اكتمال الرفع.`, `Last copy to the sync folder: ${last}${snapshot ? ` (data from ${snapshot})` : ''}. Check the Google Drive icon to confirm the upload finished.`) : tr('ثبّت Google Drive وسجّل الدخول، ثم اختر مجلدًا داخله. يتولى Google Drive رفع النسخ عند توفر الاتصال.', 'Install Google Drive and sign in, then choose a folder inside it. Google Drive uploads the copies when you are online.'));
  if (!stale && !backup.error && backup.skipped?.length) $('drive-status').textContent += ' ' + skippedText(backup.skipped);
  $('drive-status').classList.toggle('backup-error', !!(stale || backup.error || backup.skipped?.length));
  $('drive-local').textContent = backup.lastLocalPath ? tr('النسخة المحلية محفوظة أيضًا على جهازك.', 'A local copy is also kept on your PC.') : '';
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
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
['new-task', 'hero-add', 'empty-add'].forEach(id => $(id).addEventListener('click', () => openTaskEditor()));
$('page-add').addEventListener('click', () => view === 'notes' ? openNoteEditor() : openTaskEditor());
$('empty-note').addEventListener('click', () => openNoteEditor());
$('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });
$('sort').addEventListener('change', render);
$('task-reminder').addEventListener('change', toggleReminder);
document.querySelectorAll('[data-delay]').forEach(b => b.addEventListener('click', () => $('task-due').value = localDateValue(Date.now() + Number(b.dataset.delay) * 60000)));
document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('task-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = e.submitter; submit.disabled = true;
  try {
    const id = $('task-id').value || undefined, reminder = $('task-reminder').checked;
    // Tells the main process whether to keep a snooze or Done made in the alert while this editor was open.
    const timeEdited = reminder !== !!originalTaskDue || (reminder && ($('task-due').value !== originalTaskDueValue || $('task-repeat').value !== originalTaskRepeat));
    await api('saveTask', { id, title: $('task-title').value, body: $('task-body').value, attachments: taskAttachments, category: state.tasks.find(t => t.id === $('task-id').value)?.category || 'personal', priority: $('task-priority').value,
      dueAt: reminder ? (originalTaskDue && $('task-due').value === originalTaskDueValue ? originalTaskDue : new Date($('task-due').value).toISOString()) : null, repeat: reminder ? $('task-repeat').value : 'none',
      ...(id ? { updatedAt: originalTaskUpdatedAt, timeEdited } : {}) });
    $('task-dialog').close(); await refresh();
    const saved = id && state.tasks.find(t => t.id === id);
    toast(saved?.completedAt ? tr('حُفظ النص. كانت المهمة قد اكتملت من نافذة التنبيه.', 'Your text was saved. The task had already been completed from the alert.')
      : saved && !timeEdited && saved.dueAt !== originalTaskDue ? tr('حُفظ النص، وبقي الموعد الذي اخترته من نافذة التنبيه.', 'Your text was saved, and the time chosen from the alert was kept.')
      : tr('حُفظت المهمة. خطوة جديدة في مكانها.','Task saved. Your next step is in place.'));
  } catch (err) { $('task-error').textContent = err.message; } finally { submit.disabled = false; }
});
let quickBusy = false;
$('quick-form').addEventListener('submit', async e => {
  e.preventDefault(); const input = $('quick-title');
  // A second Enter while the first add is still saving would create the task twice.
  if (quickBusy) return; quickBusy = true; if (e.submitter) e.submitter.disabled = true;
  try { await api('saveTask', { title: input.value }); input.value = ''; if (view === 'upcoming') view = 'all'; await refresh(); toast(tr('أُضيفت المهمة. يمكنك فتحها لإضافة موعد.','Task added. Open it to add a due time.')); } catch (err) { toast(err.message); }
  finally { quickBusy = false; if (e.submitter) e.submitter.disabled = false; }
});
const busyRows = new Set();
$('task-list').addEventListener('click', async e => {
  const file = e.target.closest('[data-file-id]'); if (file) return openFile(file.dataset.fileId);
  const button = e.target.closest('[data-action]'), row = e.target.closest('[data-id]'); if (!button || !row) return;
  const id = row.dataset.id, action = button.dataset.action;
  if (action === 'edit') return openTaskEditor(state.tasks.find(t => t.id === id));
  if (action === 'delete') return askDelete('Task', id);
  // One request per row at a time; the due time lets the main process ignore a repeat for the same occurrence.
  if (busyRows.has(id)) return; busyRows.add(id); button.disabled = true;
  try {
    const applied = await api(action, action === 'complete' ? { id, expectedDueAt: state.tasks.find(t => t.id === id)?.dueAt ?? null } : { id }); await refresh();
    if (applied !== false) toast(action === 'complete' ? tr('تمت المهمة. أحسنت، كل خطوة تُحسب!','Task completed. Well done—every step counts!') : tr('أُعيدت المهمة دون موعد. افتحها لتعيين تذكير جديد.','Task reopened without a due date. Open it to set a reminder.'));
  } catch (err) { toast(err.message); } finally { busyRows.delete(id); button.disabled = false; }
});
$('task-list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('task-edit-target')) { e.preventDefault(); e.target.click(); } });
$('note-form').addEventListener('submit', async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try { await api('saveNote', { id: $('note-id').value || undefined, title: $('note-title').value, body: $('note-body').value, color: $('note-color').value, attachments: noteAttachments }); $('note-dialog').close(); await refresh(); toast(tr('حُفظت ملاحظتك.','Note saved.')); }
  catch (err) { $('note-error').textContent = err.message; } finally { e.submitter.disabled = false; }
});
$('notes-list').addEventListener('click', e => { const file = e.target.closest('[data-file-id]'); if (file) return openFile(file.dataset.fileId); const card = e.target.closest('[data-id]'); if (!card) return; if (e.target.closest('[data-action="delete"]')) return askDelete('Note', card.dataset.id); openNoteEditor(state.notes.find(n => n.id === card.dataset.id)); });
$('notes-list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('note-edit-target')) { e.preventDefault(); e.target.click(); } });
$('cancel-delete').addEventListener('click', () => $('confirm-dialog').close());
$('confirm-delete').addEventListener('click', async () => { if (!pendingDelete) return; try { await api('delete' + pendingDelete.type, { id: pendingDelete.id }); pendingDelete = null; $('confirm-dialog').close(); await refresh(); toast(tr('تم الحذف.','Deleted.')); } catch (err) { toast(err.message); } });
for (const id of ['preview-alert', 'settings-preview']) $(id).addEventListener('click', async () => { try { await api('preview'); toast(tr('ظهر التنبيه فوق شريط المهام.','The alert appeared above the taskbar.')); } catch (err) { toast(err.message); } });
for (const id of ['setting-sound', 'setting-startup', 'setting-side', 'setting-language']) $(id).addEventListener('change', async () => {
  try { await api('settings', { sound: $('setting-sound').checked, startAtLogin: $('setting-startup').checked, alertSide: $('setting-side').value, language: $('setting-language').value }); await refresh(); toast(tr('حُفظت الإعدادات.','Settings saved.')); }
  catch (err) { toast(err.message); } await refresh();
});
// Names the attachments a backup had to leave out because their files are missing, with the task or note each belongs to.
function skippedText(skipped = []) {
  if (!skipped.length) return '';
  const list = skipped.map(s => s.itemTitle ? `${s.name} (${s.itemTitle})` : s.name).join(tr('، ', ', '));
  return tr(`لم تُنسخ ${skipped.length} من المرفقات لأن ملفاتها مفقودة: ${list}`, `${skipped.length} attachments were left out because their files are missing: ${list}`);
}
$('export-data').addEventListener('click', async () => {
  $('export-data').disabled = true;
  try { const result = await api('export'); if (result) toast(result.skipped?.length ? `${tr('حُفظ مجلد النسخة الاحتياطية.', 'The backup folder was saved.')} ${skippedText(result.skipped)}` : tr('حُفظ مجلد النسخة الاحتياطية مع جميع المرفقات.', 'The backup folder was saved with all attachments.')); }
  catch (err) { toast(err.message); } finally { $('export-data').disabled = false; }
});
$('restore-data').addEventListener('click', async () => {
  $('restore-data').disabled = true;
  try { if (await api('restore')) { await refresh(); toast(tr('استُعيدت النسخة الاحتياطية. حُفظت بياناتك السابقة في مجلد النسخ.', 'Backup restored. Your previous data was saved in the backups folder.')); } }
  catch (err) { toast(err.message); } finally { $('restore-data').disabled = false; }
});
$('clean-orphans').addEventListener('click', async () => {
  $('clean-orphans').disabled = true;
  try { const before = storage?.orphans; const usage = await api('cleanOrphans'); if (usage) { storage = usage; renderStorage(); if (usage.orphans < before) toast(tr('حُذفت المرفقات غير المستخدمة.', 'Unused attachments were deleted.')); } }
  catch (err) { toast(err.message); } finally { $('clean-orphans').disabled = false; }
});
$('open-data').addEventListener('click', async () => { try { await api('dataFolder'); } catch (err) { toast(err.message); } });
async function driveAction(action, payload) { try { const value = await api(action, payload); await refresh(); return value; } catch (error) { toast(error.message); await refresh(); } }
$('choose-drive-folder').addEventListener('click', () => driveAction('chooseDriveFolder'));
$('drive-now').addEventListener('click', async () => { $('drive-now').disabled = true; const status = await driveAction('driveBackupNow'); if (status) toast(`${tr('حُفظت النسخة محليًا وفي مجلد Drive. يتولى Google Drive إكمال الرفع.', 'Saved locally and to the Drive folder. Google Drive finishes the upload.')} ${skippedText(status.skipped)}`.trim()); });
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
  if (state?.recovered) toast(tr('استُعيدت بياناتك من النسخة الاحتياطية بعد تعذّر قراءة الملف الأصلي.','Your data was restored from backup after the original file could not be read.'));
  else if (state?.driveBackup?.stale) toast(tr('النسخ إلى Google Drive متوقف منذ أكثر من يوم. افتح الإعدادات للتفاصيل.', 'Backups to Google Drive have been stalled for over a day. Open Settings for details.'));
});
setInterval(() => { if (!document.querySelector('dialog[open]')) render(); }, 30000);
