'use strict';
const { randomUUID } = require('node:crypto');
const { attachmentIds, validateAttachment } = require('./records');
const { nextOccurrence } = require('./repeat');
const { LOCALES, DEFAULT: DEFAULT_LOCALE } = require('../../ui/lib/translate');
const { validPause } = require('./pause');

function initialState() {
  return { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: DEFAULT_LOCALE, weekStart: 6, theme: 'system', palette: 'lavender', autoUpdate: null, pausedUntil: null } };
}
// Interface palettes in ui/styles/theme.css; anything else shows Lavender.
const PALETTES = ['lavender', 'ocean', 'forest', 'sunset', 'graphite', 'contrast'];
// Note paper colors (ui/styles/theme.css) and styles. Notes saved before styles existed have none and show as plain.
const NOTE_COLORS = ['cream', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'gray', 'white'];
const NOTE_STYLES = ['plain', 'sticky', 'lined'];
function noteLook({ color, style } = {}) {
  return { color: NOTE_COLORS.includes(color) ? color : 'cream', style: NOTE_STYLES.includes(style) ? style : 'plain' };
}
// Minutes between repeated alert sounds; 0 is off. Data from before the setting has no value, meaning off.
const REMIND_AGAIN = [0, 2, 5, 15];
function title(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new Error('Write a title of 1 to 200 characters.');
  return value.trim();
}
function date(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid time.');
  return new Date(value).toISOString();
}
// daily and weekly follow the previous occurrence; days repeats on chosen weekdays (0 = Sunday),
// interval every N days, and monthly/yearly count from repeatFrom so the 31st never drifts.
const REPEATS = ['none', 'daily', 'weekly', 'days', 'interval', 'monthly', 'yearly'];
const RULE_FIELDS = ['repeatEvery', 'repeatDays', 'repeatFrom'];
// Minutes before the due time for an optional, quieter early notification.
const EARLY = [5, 10, 15, 30, 60, 1440];
function early(value, dueAt) { return dueAt && EARLY.includes(value) ? value : 0; }
// repeatFrom anchors a series: monthly/yearly count from its date, and every mode takes its time of
// day from it, so an occurrence pushed forward by a DST gap does not move the ones after it. Data from
// before v1.5 may lack it for the other modes; they then keep the time of their current occurrence.
function repeatRule(input, repeat, dueAt, anchor) {
  let from = null;
  try { from = date(input.repeatFrom); } catch { /* reset below */ }
  const kept = from ? { repeatFrom: from } : {};
  if (repeat === 'interval') return { ...kept, repeatEvery: Number.isInteger(input.repeatEvery) ? Math.min(365, Math.max(2, input.repeatEvery)) : 2 };
  if (repeat === 'days') {
    const days = Array.isArray(input.repeatDays) ? [...new Set(input.repeatDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return { ...kept, repeatDays: days.length ? days : [new Date(dueAt).getDay()] };
  }
  if (repeat === 'monthly' || repeat === 'yearly') return { repeatFrom: from || anchor || dueAt };
  return kept;
}
// Keeps only the rule fields the task's repeat mode uses.
function applyRule(task, rule) { for (const key of RULE_FIELDS) delete task[key]; Object.assign(task, rule); }
// anchor is where a monthly/yearly series counts from when no valid repeatFrom is given.
function taskInput(input, anchor) {
  const dueAt = date(input.dueAt);
  const repeat = REPEATS.includes(input.repeat) ? input.repeat : 'none';
  if (repeat !== 'none' && !dueAt) throw new Error('Set a time for a repeating task.');
  return { title: title(input.title), body: String(input.body || '').slice(0, 20000),
    priority: ['normal', 'medium', 'high'].includes(input.priority) ? input.priority : 'normal',
    category: ['personal', 'work', 'study'].includes(input.category) ? input.category : 'personal', dueAt, repeat, rule: repeat === 'none' ? {} : repeatRule(input, repeat, dueAt, anchor) };
}
// Up to 10 tags of up to 30 characters; "#" prefixes, extra spaces and case duplicates are dropped.
function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(), out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (tag && !seen.has(tag.toLowerCase()) && out.length < 10) { seen.add(tag.toLowerCase()); out.push(tag); }
  }
  return out;
}
// Up to 50 checklist steps of up to 200 characters, each with a stable id.
function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(step => step && typeof step.text === 'string' && step.text.trim()).slice(0, 50).map(step => {
    let id = typeof step.id === 'string' && /^[\w-]{1,40}$/.test(step.id) && !seen.has(step.id) ? step.id : randomUUID();
    seen.add(id);
    return { id, text: step.text.trim().slice(0, 200), done: step.done === true };
  });
}
function setChecklist(task, value) { const steps = normalizeChecklist(value); if (steps.length) task.checklist = steps; else delete task.checklist; }
// Applies the editor's steps but keeps the stored ticks: used when a repeat was completed while the
// editor was open, so the ticks it shows belong to the occurrence that is now in the history.
function setChecklistKeepingTicks(task, value) {
  const stored = new Map((task.checklist || []).map(step => [step.id, step.done]));
  setChecklist(task, value);
  for (const step of task.checklist || []) step.done = stored.get(step.id) === true;
}
// True when a repeat's occurrence was completed after the editor opened with updatedAt.
function completedSince(state, task, updatedAt) {
  const opened = Date.parse(updatedAt);
  return Number.isFinite(opened) && state.tasks.some(t => t.sourceId === task.id && t.completedAt && Date.parse(t.completedAt) > opened);
}
function toggleStep(state, taskId, stepId) {
  const step = state.tasks.find(t => t.id === taskId && !t.completedAt && !t.deletedAt)?.checklist?.find(s => s.id === stepId);
  if (!step) throw new Error('This step no longer exists.');
  step.done = !step.done;
}
function setTags(task, value) { const tags = normalizeTags(value); if (tags.length) task.tags = tags; else delete task.tags; }
function setEarly(task, minutes) { const value = early(minutes, task.dueAt); if (value) task.remindBefore = value; else delete task.remindBefore; }
function saveTask(state, input, now = new Date()) {
  const { rule, ...fields } = taskInput(input);
  let task = input.id ? state.tasks.find(t => t.id === input.id) : null;
  fields.attachments = attachmentIds(input.attachments ?? task?.attachments ?? []);
  if (input.id && !task) throw new Error('This task no longer exists.');
  if (task) {
    // The editor sends the updatedAt it opened with and whether its reminder fields (on/off, time,
    // repeat) were edited. If the alert snoozed or completed the task meanwhile, only the text is
    // applied so the editor's old time cannot undo that; older callers send neither field.
    const outdated = typeof input.timeEdited === 'boolean' && input.updatedAt !== task.updatedAt;
    const applySteps = outdated && completedSince(state, task, input.updatedAt) ? setChecklistKeepingTicks : setChecklist;
    if (outdated && (!input.timeEdited || task.completedAt)) {
      const { title, body, priority, category, attachments } = fields;
      Object.assign(task, { title, body, priority, category, attachments, updatedAt: now.toISOString() });
      setTags(task, input.tags ?? task.tags);
      applySteps(task, input.checklist ?? task.checklist);
      return task;
    }
    if (task.completedAt) throw new Error('Reopen the task before editing it.');
    const changed = fields.dueAt !== task.dueAt;
    // A new time, or a repeat switched on or changed, anchors the series at the time the editor shows,
    // which for a snoozed task is the snoozed time rather than the original one.
    const repeatChanged = fields.repeat !== 'none' && fields.repeat !== task.repeat;
    // onlyThisTime moves one occurrence of an unchanged series and keeps its anchor and rule, as a snooze does.
    const onlyThisTime = input.onlyThisTime === true && fields.repeat !== 'none' && !repeatChanged && !!task.scheduleAt;
    const anchor = !onlyThisTime && (changed || repeatChanged);
    if (onlyThisTime && changed) task.snoozedAt = null;
    // The editor never sends repeatFrom. A new time or repeat mode restarts the series at the new due
    // time; anything else (a text edit, "only this time", a snoozed task) keeps the stored anchor.
    if (fields.repeat !== 'none') rule.repeatFrom = !onlyThisTime && (changed || fields.repeat !== task.repeat) ? fields.dueAt : task.repeatFrom || task.scheduleAt || fields.dueAt;
    Object.assign(task, fields, { updatedAt: now.toISOString() });
    applyRule(task, rule);
    setEarly(task, input.remindBefore);
    setTags(task, input.tags ?? task.tags);
    applySteps(task, input.checklist ?? task.checklist);
    if (anchor) { task.scheduleAt = fields.dueAt; task.snoozedAt = null; delete task.snoozeCount; }
  } else {
    if (fields.repeat !== 'none') rule.repeatFrom = fields.dueAt;
    task = { ...fields, ...rule, id: randomUUID(), scheduleAt: fields.dueAt, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: null, snoozedAt: null };
    setEarly(task, input.remindBefore);
    setTags(task, input.tags);
    setChecklist(task, input.checklist);
    state.tasks.push(task);
  }
  return task;
}
// expectedDueAt is the due time the user saw when acting. A call made for an occurrence that has
// already moved on (a double click, two windows) changes nothing. Leaving it out skips the check.
function stale(task, expectedDueAt) {
  if (expectedDueAt === undefined) return false;
  return (expectedDueAt === null ? null : date(expectedDueAt)) !== task.dueAt;
}
// Returns null when the call was ignored, otherwise what undoComplete needs: the history copy for
// repeats, or the task itself.
function completeTask(state, id, now = new Date(), { expectedDueAt } = {}) {
  const task = state.tasks.find(t => t.id === id && !t.deletedAt);
  if (!task || task.completedAt || stale(task, expectedDueAt)) return null;
  if (task.repeat !== 'none' && task.scheduleAt) {
    const done = { ...task, id: randomUUID(), repeat: 'none', sourceId: task.id, completedAt: now.toISOString() };
    applyRule(done, {});
    if (done.checklist) done.checklist = done.checklist.map(step => ({ ...step }));
    state.tasks.push(done);
    // The next occurrence starts with every step unticked; the history copy keeps what was done.
    if (task.checklist) task.checklist = task.checklist.map(step => ({ ...step, done: false }));
    task.dueAt = nextOccurrence(task.scheduleAt, task.repeat, now, task);
    task.scheduleAt = task.dueAt;
    task.snoozedAt = null; delete task.snoozeCount;
    task.updatedAt = now.toISOString();
    return { id, copyId: done.id };
  }
  task.completedAt = now.toISOString();
  task.updatedAt = now.toISOString();
  return { id, copyId: id };
}
// Puts a just-completed task back exactly as it was: a repeat returns to the occurrence that was
// completed and loses the history copy that completing it created.
function undoComplete(state, id, copyId, now = new Date()) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) throw new Error('This task no longer exists.');
  if (copyId === id) { if (task.completedAt) Object.assign(task, { completedAt: null, updatedAt: now.toISOString() }); return; }
  const copy = state.tasks.find(t => t.id === copyId && t.sourceId === id && t.completedAt);
  if (!copy) return;
  Object.assign(task, { dueAt: copy.dueAt, scheduleAt: copy.scheduleAt, snoozedAt: copy.snoozedAt, updatedAt: now.toISOString() });
  if (copy.snoozeCount) task.snoozeCount = copy.snoozeCount; else delete task.snoozeCount;
  // The ticks of the occurrence come back from the copy, matched by step id.
  const ticks = new Map((copy.checklist || []).map(step => [step.id, step.done]));
  for (const step of task.checklist || []) if (ticks.has(step.id)) step.done = ticks.get(step.id);
  state.tasks = state.tasks.filter(t => t !== copy);
}
// Deleted tasks and notes stay in a trash for TRASH_DAYS before they are removed for good.
const TRASH_DAYS = 30;
function list(state, kind) { if (kind !== 'tasks' && kind !== 'notes') throw new Error('invalid kind'); return state[kind]; }
function trashItem(state, kind, id, now = new Date()) { const item = list(state, kind).find(i => i.id === id); if (item && !item.deletedAt) item.deletedAt = now.toISOString(); }
function restoreItem(state, kind, id) {
  const item = list(state, kind).find(i => i.id === id && i.deletedAt);
  // The 30-day purge may have removed it while the trash was on screen.
  if (!item) throw new Error('This item is no longer in the trash.');
  item.deletedAt = null;
}
function purgeItem(state, kind, id) { state[kind] = list(state, kind).filter(i => !(i.id === id && i.deletedAt)); }
function purgeTrash(state, now = new Date(), all = false) {
  const limit = now.getTime() - TRASH_DAYS * 86400000;
  const keep = i => !i.deletedAt || (!all && Date.parse(i.deletedAt) > limit);
  const before = state.tasks.length + state.notes.length;
  state.tasks = state.tasks.filter(keep); state.notes = state.notes.filter(keep);
  return before - state.tasks.length - state.notes.length;
}
// Moves a repeating task to its next occurrence without recording a completion.
// Returns false when expectedDueAt shows the occurrence was already handled.
function skipOccurrence(state, id, expectedDueAt, now = new Date()) {
  const task = state.tasks.find(t => t.id === id && !t.completedAt && !t.deletedAt);
  if (!task || task.repeat === 'none' || !task.scheduleAt) throw new Error('Only active repeating tasks can be skipped.');
  if (stale(task, expectedDueAt)) return false;
  task.dueAt = nextOccurrence(task.scheduleAt, task.repeat, now, task);
  task.scheduleAt = task.dueAt;
  task.snoozedAt = null; delete task.snoozeCount;
  task.updatedAt = now.toISOString();
  return true;
}
// Returns false when expectedDueAt shows the reminder was already handled.
function snoozeTask(state, id, until, now = new Date(), { expectedDueAt } = {}) {
  const task = state.tasks.find(t => t.id === id && !t.completedAt && !t.deletedAt);
  if (!task) { if (expectedDueAt !== undefined) return false; throw new Error('This reminder is no longer active.'); }
  if (stale(task, expectedDueAt)) return false;
  const next = date(until);
  if (!next || Date.parse(next) <= now.getTime()) throw new Error('Choose a later time for the reminder.');
  task.dueAt = next;
  task.snoozedAt = now.toISOString();
  // Counted so the alert can suggest a better time after repeated snoozes.
  task.snoozeCount = Math.min(999, (task.snoozeCount || 0) + 1);
  task.updatedAt = now.toISOString();
  return true;
}
function dueTasks(state, now = new Date()) {
  return state.tasks.filter(t => !t.completedAt && !t.deletedAt && t.dueAt && Date.parse(t.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
// Adds imported tasks one by one. Invalid rows and past one-time items are skipped, and a past
// repeat resumes at its next occurrence, so importing a calendar never floods the alert queue.
function importTasks(state, inputs, now = new Date()) {
  let added = 0, skipped = 0;
  for (const input of inputs) {
    try {
      const fields = { ...input, id: undefined, attachments: [], title: String(input.title || '').trim().slice(0, 200), body: String(input.body || '').slice(0, 20000) };
      if (fields.dueAt && Date.parse(fields.dueAt) <= now.getTime() && !REPEATS.slice(1).includes(fields.repeat)) { skipped++; continue; }
      const task = saveTask(state, fields, now);
      if (task.repeat !== 'none' && Date.parse(task.dueAt) <= now.getTime()) task.dueAt = task.scheduleAt = nextOccurrence(task.dueAt, task.repeat, now, task);
      added++;
    } catch { skipped++; }
  }
  return { added, skipped };
}
// Open tasks whose early notification time has come but whose due time has not.
// Tasks whose early notice is due now. A notice moment at or before the task's last change is
// skipped: snoozing, completing a repeat late or editing the time into the lead window must not
// announce at once what the user has just seen and moved.
function upcomingTasks(state, now = new Date()) {
  return state.tasks.filter(t => {
    if (t.completedAt || t.deletedAt || !t.remindBefore || !t.dueAt || Date.parse(t.dueAt) <= now.getTime()) return false;
    const noticeAt = Date.parse(t.dueAt) - t.remindBefore * 60000;
    return noticeAt <= now.getTime() && !(noticeAt <= Date.parse(t.updatedAt));
  });
}
// The preview alert only shows while no real reminder is due. A real reminder drops it for good,
// so it never appears later, out of context, after the real one is done.
function alertQueue(state, preview, now = new Date()) {
  const due = dueTasks(state, now);
  return due.length ? { alerts: due, preview: null } : { alerts: preview ? [preview] : [], preview };
}
function validateState(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.notes)) throw new Error('The data file is invalid.');
  data.attachments ??= [];
  if (!Array.isArray(data.attachments)) throw new Error('The attachment list is invalid.');
  const attachmentMap = new Set();
  for (const record of data.attachments) {
    validateAttachment(record);
    if (attachmentMap.has(record.id)) throw new Error('Duplicate attachment ID.');
    attachmentMap.add(record.id);
  }
  for (const item of [...data.tasks, ...data.notes]) {
    if (!item || typeof item !== 'object') throw new Error('Invalid task or note data.');
    item.attachments = attachmentIds(item.attachments);
    if (item.attachments.some(id => !attachmentMap.has(id))) throw new Error('A referenced attachment does not exist.');
  }
  const ids = new Set();
  for (const task of data.tasks) {
    // Out-of-range fields are normalized rather than rejected, so one odd value never hides the whole file.
    // A monthly/yearly task without a valid repeatFrom counts from its series anchor, not from a snoozed due time.
    let anchor = null;
    try { anchor = date(task.scheduleAt); } catch { /* falls back to dueAt */ }
    const { body, priority, category, dueAt, repeat, rule } = taskInput(task, anchor);
    Object.assign(task, { body, priority, category, dueAt, repeat });
    applyRule(task, rule);
    if (typeof task.id !== 'string' || ids.has(task.id)) throw new Error('Invalid task data.');
    ids.add(task.id);
    task.scheduleAt = date(task.scheduleAt); task.completedAt = date(task.completedAt);
    if (task.repeat !== 'none' && !task.scheduleAt) task.scheduleAt = task.dueAt;
    try { task.snoozedAt = date(task.snoozedAt); } catch { task.snoozedAt = null; }
    if ('snoozeCount' in task && !(Number.isInteger(task.snoozeCount) && task.snoozeCount > 0 && task.snoozeCount <= 999)) delete task.snoozeCount;
    if ('remindBefore' in task) setEarly(task, task.remindBefore);
    if ('tags' in task) setTags(task, task.tags);
    if ('checklist' in task) setChecklist(task, task.checklist);
  }
  for (const item of [...data.tasks, ...data.notes]) if ('deletedAt' in item) { try { item.deletedAt = date(item.deletedAt); } catch { item.deletedAt = null; } }
  for (const note of data.notes) {
    title(note.title);
    if (typeof note.id !== 'string' || typeof note.body !== 'string') throw new Error('Invalid note data.');
    if (!NOTE_COLORS.includes(note.color)) note.color = 'cream';
    if (note.style !== undefined && !NOTE_STYLES.includes(note.style)) note.style = 'plain';
  }
  const defaults = initialState().settings;
  const saved = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : {};
  data.settings = { ...defaults, ...saved };
  // The Hijri date and digit style options were removed; data saved while they existed drops the fields.
  delete data.settings.hijri;
  delete data.settings.digits;
  for (const key of ['sound', 'startAtLogin']) if (typeof data.settings[key] !== 'boolean') data.settings[key] = defaults[key];
  if (!['system', 'light', 'dark'].includes(data.settings.theme)) data.settings.theme = 'system';
  if (!PALETTES.includes(data.settings.palette)) data.settings.palette = 'lavender';
  // Saturday is the first weekday unless Sunday or Monday was chosen (older data has no value).
  if (![0, 1, 6].includes(data.settings.weekStart)) data.settings.weekStart = 6;
  data.settings.alertSide = data.settings.alertSide === 'left' ? 'left' : 'right';
  // Saved choices are kept. Settings written before the language option existed were Arabic.
  if (!('language' in saved) && Object.keys(saved).length) data.settings.language = 'ar';
  if (!LOCALES.some(l => l.code === data.settings.language)) data.settings.language = DEFAULT_LOCALE;
  if (data.settings.remindAgain !== undefined && !REMIND_AGAIN.includes(data.settings.remindAgain)) data.settings.remindAgain = 0;
  // null until the user answers the one-time question about automatic updates.
  if (data.settings.autoUpdate !== true && data.settings.autoUpdate !== false) data.settings.autoUpdate = null;
  // A pause from the tray survives a restart; anything that isn't one means no pause.
  data.settings.pausedUntil = validPause(data.settings.pausedUntil);
  return data;
}
module.exports = { importTasks, normalizeChecklist, toggleStep, normalizeTags, PALETTES, NOTE_COLORS, NOTE_STYLES, noteLook, EARLY, upcomingTasks, TRASH_DAYS, undoComplete, trashItem, restoreItem, purgeItem, purgeTrash, initialState, saveTask, completeTask, snoozeTask, dueTasks, alertQueue, validateState, REMIND_AGAIN, skipOccurrence };
