// The task editor (repeat, steps, only this time) and opening the note editor.
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
  renderNoteLook(); setNoteLook(note?.color || 'cream', note?.style || 'plain'); $('note-dialog-title').textContent = note ? tr('Note details') : tr('New note');
  noteAttachments = [...(note?.attachments || [])]; renderEditorFiles('note');
  $('note-dialog').showModal(); $('note-title').focus();
}
