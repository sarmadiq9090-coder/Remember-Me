'use strict';
const { UserError } = require('./errors');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { attachmentIds, validateAttachment } = require('./attachments');
const { LOCALES, DEFAULT: DEFAULT_LOCALE } = require('../ui/translate');

function initialState() {
  return { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: DEFAULT_LOCALE, weekStart: 6, theme: 'system', autoUpdate: null } };
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
function repeatRule(input, repeat, dueAt) {
  if (repeat === 'interval') return { repeatEvery: Number.isInteger(input.repeatEvery) ? Math.min(365, Math.max(2, input.repeatEvery)) : 2 };
  if (repeat === 'days') {
    const days = Array.isArray(input.repeatDays) ? [...new Set(input.repeatDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return { repeatDays: days.length ? days : [new Date(dueAt).getDay()] };
  }
  if (repeat === 'monthly' || repeat === 'yearly') { let from = null; try { from = date(input.repeatFrom); } catch { /* reset below */ } return { repeatFrom: from || dueAt }; }
  return {};
}
// Keeps only the rule fields the task's repeat mode uses.
function applyRule(task, rule) { for (const key of RULE_FIELDS) delete task[key]; Object.assign(task, rule); }
function taskInput(input) {
  const dueAt = date(input.dueAt);
  const repeat = REPEATS.includes(input.repeat) ? input.repeat : 'none';
  if (repeat !== 'none' && !dueAt) throw new Error('Set a time for a repeating task.');
  return { title: title(input.title), body: String(input.body || '').slice(0, 20000),
    priority: ['normal', 'medium', 'high'].includes(input.priority) ? input.priority : 'normal',
    category: ['personal', 'work', 'study'].includes(input.category) ? input.category : 'personal', dueAt, repeat, rule: repeat === 'none' ? {} : repeatRule(input, repeat, dueAt) };
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
    if (outdated && (!input.timeEdited || task.completedAt)) {
      const { title, body, priority, category, attachments } = fields;
      Object.assign(task, { title, body, priority, category, attachments, updatedAt: now.toISOString() });
      setTags(task, input.tags ?? task.tags);
      setChecklist(task, input.checklist ?? task.checklist);
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
    if (onlyThisTime) { if ('repeatFrom' in rule && task.repeatFrom) rule.repeatFrom = task.repeatFrom; if (changed) task.snoozedAt = null; }
    // A new time or a new repeat mode restarts monthly/yearly counting from the new due date.
    else if ('repeatFrom' in rule && (changed || fields.repeat !== task.repeat)) rule.repeatFrom = fields.dueAt;
    Object.assign(task, fields, { updatedAt: now.toISOString() });
    applyRule(task, rule);
    setEarly(task, input.remindBefore);
    setTags(task, input.tags ?? task.tags);
    setChecklist(task, input.checklist ?? task.checklist);
    if (anchor) { task.scheduleAt = fields.dueAt; task.snoozedAt = null; delete task.snoozeCount; }
  } else {
    if ('repeatFrom' in rule) rule.repeatFrom = fields.dueAt;
    task = { ...fields, ...rule, id: randomUUID(), scheduleAt: fields.dueAt, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: null, snoozedAt: null };
    setEarly(task, input.remindBefore);
    setTags(task, input.tags);
    setChecklist(task, input.checklist);
    state.tasks.push(task);
  }
  return task;
}
const DAY = 86400000;
function monthsLater(start, months) {
  const next = new Date(start.getFullYear(), start.getMonth() + months, 1, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  next.setDate(Math.min(start.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}
// The first occurrence after both `value` (the current one) and `now`, in local time.
function nextOccurrence(value, repeat, now, rule = {}) {
  const current = new Date(value);
  if (repeat === 'monthly' || repeat === 'yearly') {
    const start = new Date(rule.repeatFrom || value), step = repeat === 'yearly' ? 12 : 1;
    const elapsed = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
    const behind = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
    let months = Math.max(Math.floor(elapsed / step) * step + step, Math.floor((behind - 1) / step) * step);
    let next = monthsLater(start, months);
    while (next <= now || next <= current) next = monthsLater(start, months += step);
    return next.toISOString();
  }
  if (repeat === 'days') {
    const days = rule.repeatDays?.length ? rule.repeatDays : [current.getDay()];
    let next = new Date(current);
    // After a long gap, restart from yesterday at the same local time instead of walking every day.
    if (now - next > 8 * DAY) next = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
    do next.setDate(next.getDate() + 1); while (!days.includes(next.getDay()) || next <= now);
    return next.toISOString();
  }
  const next = new Date(value);
  const step = repeat === 'weekly' ? 7 : repeat === 'interval' ? rule.repeatEvery || 2 : 1;
  next.setDate(next.getDate() + step);
  const days = Math.max(0, Math.floor((now.getTime() - next.getTime()) / 86400000));
  next.setDate(next.getDate() + Math.floor(days / step) * step);
  while (next <= now) next.setDate(next.getDate() + step);
  return next.toISOString();
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
  state.tasks = state.tasks.filter(t => t !== copy);
}
// Deleted tasks and notes stay in a trash for TRASH_DAYS before they are removed for good.
const TRASH_DAYS = 30;
function list(state, kind) { if (kind !== 'tasks' && kind !== 'notes') throw new Error('invalid kind'); return state[kind]; }
function trashItem(state, kind, id, now = new Date()) { const item = list(state, kind).find(i => i.id === id); if (item && !item.deletedAt) item.deletedAt = now.toISOString(); }
function restoreItem(state, kind, id) { const item = list(state, kind).find(i => i.id === id); if (item) item.deletedAt = null; }
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
function upcomingTasks(state, now = new Date()) {
  return state.tasks.filter(t => !t.completedAt && !t.deletedAt && t.remindBefore && t.dueAt && Date.parse(t.dueAt) > now.getTime() && Date.parse(t.dueAt) - t.remindBefore * 60000 <= now.getTime());
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
    const { body, priority, category, dueAt, repeat, rule } = taskInput(task);
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
    if (!['cream', 'green', 'blue', 'pink'].includes(note.color)) note.color = 'cream';
  }
  const defaults = initialState().settings;
  const saved = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : {};
  data.settings = { ...defaults, ...saved };
  // The Hijri date and digit style options were removed; data saved while they existed drops the fields.
  delete data.settings.hijri;
  delete data.settings.digits;
  for (const key of ['sound', 'startAtLogin']) if (typeof data.settings[key] !== 'boolean') data.settings[key] = defaults[key];
  if (!['system', 'light', 'dark'].includes(data.settings.theme)) data.settings.theme = 'system';
  // Saturday is the first weekday unless Sunday or Monday was chosen (older data has no value).
  if (![0, 1, 6].includes(data.settings.weekStart)) data.settings.weekStart = 6;
  data.settings.alertSide = data.settings.alertSide === 'left' ? 'left' : 'right';
  // Saved choices are kept. Settings written before the language option existed were Arabic.
  if (!('language' in saved) && Object.keys(saved).length) data.settings.language = 'ar';
  if (!LOCALES.some(l => l.code === data.settings.language)) data.settings.language = DEFAULT_LOCALE;
  if (data.settings.remindAgain !== undefined && !REMIND_AGAIN.includes(data.settings.remindAgain)) data.settings.remindAgain = 0;
  // null until the user answers the one-time question about automatic updates.
  if (data.settings.autoUpdate !== true && data.settings.autoUpdate !== false) data.settings.autoUpdate = null;
  return data;
}
// Antivirus scanners, the search indexer and sync clients briefly lock new files on Windows.
const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);
function renameWithRetry(from, to, attempts = 10) {
  for (let i = 1; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (error) {
      if (!LOCKED.has(error.code) || i >= attempts) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * i);
    }
  }
}
function writeDurable(file, text) {
  const temporary = file + '.tmp';
  const fd = fs.openSync(temporary, 'w');
  try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  renameWithRetry(temporary, file);
}
function copyDurable(from, to) {
  fs.copyFileSync(from, to);
  const fd = fs.openSync(to, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
class Store {
  constructor(directory) {
    this.file = path.join(directory, 'data.json');
    fs.mkdirSync(directory, { recursive: true });
    this.recovered = false;
    if (!fs.existsSync(this.file)) { this.state = initialState(); return; }
    try { this.state = validateState(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (err) {
      try {
        this.state = validateState(JSON.parse(fs.readFileSync(this.file + '.bak', 'utf8')));
        fs.copyFileSync(this.file, this.file + '.damaged-' + Date.now());
        writeDurable(this.file, JSON.stringify(this.state, null, 2));
        this.recovered = true;
      } catch { throw new UserError('Could not read the data or its backup. The files were left unchanged in: {folder}', { folder: directory }); }
    }
  }
  change(fn) {
    const draft = structuredClone(this.state);
    const result = fn(draft);
    this.commit(draft);
    return result;
  }
  // Swaps in a complete state, such as one restored from a backup.
  replace(next) { this.commit(structuredClone(next)); }
  commit(draft) {
    validateState(draft);
    if (fs.existsSync(this.file)) copyDurable(this.file, this.file + '.bak');
    writeDurable(this.file, JSON.stringify(draft, null, 2));
    this.state = draft;
  }
}
module.exports = { importTasks, normalizeChecklist, toggleStep, normalizeTags, EARLY, upcomingTasks, TRASH_DAYS, undoComplete, trashItem, restoreItem, purgeItem, purgeTrash, initialState, saveTask, completeTask, snoozeTask, dueTasks, alertQueue, nextOccurrence, validateState, Store, writeDurable, renameWithRetry, REMIND_AGAIN, skipOccurrence };
