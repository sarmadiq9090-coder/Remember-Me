// Event wiring: editor attachments, navigation, the task and note editors and lists, trash, preview.
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
  // On failure the box goes back by hand: an unchanged list is not rebuilt by the next refresh.
  try { await api('toggleStep', { id: row.dataset.id, stepId: box.dataset.toggleStep }); await refresh(); } catch (err) { box.checked = !box.checked; toast(err.message); }
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
  if (busyRows.has(id)) return; busyRows.add(id);
  const mark = focusMark(); button.disabled = true;
  try {
    // For 'complete', done is null when the occurrence was already handled; skip returns false then. No toast either way.
    const done = await api(action, action === 'reopen' ? { id } : { id, expectedDueAt: state.tasks.find(t => t.id === id)?.dueAt ?? null }); await refresh();
    const next = state.tasks.find(t => t.id === id)?.dueAt;
    if (action === 'reopen' || done) toast(action === 'complete' ? tr("Task completed. Well done—every step counts!") : action === 'skip' ? tr("Skipped this time. Next: {value}", { value: dateLabel(next) }) : tr("Task reopened without a due date. Open it to set a reminder."), action === 'complete' && done ? () => api('undoComplete', done) : undefined, mark);
  } catch (err) { toast(err.message); } finally { busyRows.delete(id); button.disabled = false; restoreFocus(mark); }
});
$('task-list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('task-edit-target')) { e.preventDefault(); e.target.click(); } });
$('note-form').addEventListener('submit', async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try { await api('saveNote', { id: $('note-id').value || undefined, title: $('note-title').value, body: $('note-body').value, color: checked('note-color', 'cream'), style: checked('note-style', 'plain'), attachments: noteAttachments }); $('note-dialog').close(); await refresh(); toast(tr('Note saved.')); }
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
