'use strict';
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { attachmentIds, validateAttachment } = require('./attachments');

function initialState() {
  return { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: 'ar' } };
}
// Minutes between repeated alert sounds; 0 is off. Data from before the setting has no value, meaning off.
const REMIND_AGAIN = [0, 2, 5, 15];
function title(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new Error('اكتب عنوانًا من 1 إلى 200 حرف.');
  return value.trim();
}
function date(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('موعد غير صالح.');
  return new Date(value).toISOString();
}
function taskInput(input) {
  const dueAt = date(input.dueAt);
  const repeat = ['none', 'daily', 'weekly'].includes(input.repeat) ? input.repeat : 'none';
  if (repeat !== 'none' && !dueAt) throw new Error('حدّد موعدًا للمهمة المتكررة.');
  return { title: title(input.title), body: String(input.body || '').slice(0, 20000),
    priority: ['normal', 'medium', 'high'].includes(input.priority) ? input.priority : 'normal',
    category: ['personal', 'work', 'study'].includes(input.category) ? input.category : 'personal', dueAt, repeat };
}
function saveTask(state, input, now = new Date()) {
  const fields = taskInput(input);
  let task = input.id ? state.tasks.find(t => t.id === input.id) : null;
  fields.attachments = attachmentIds(input.attachments ?? task?.attachments ?? []);
  if (input.id && !task) throw new Error('المهمة لم تعد موجودة.');
  if (task) {
    // The editor sends the updatedAt it opened with and whether its reminder fields (on/off, time,
    // repeat) were edited. If the alert snoozed or completed the task meanwhile, only the text is
    // applied so the editor's old time cannot undo that; older callers send neither field.
    const outdated = typeof input.timeEdited === 'boolean' && input.updatedAt !== task.updatedAt;
    if (outdated && (!input.timeEdited || task.completedAt)) {
      const { title, body, priority, category, attachments } = fields;
      Object.assign(task, { title, body, priority, category, attachments, updatedAt: now.toISOString() });
      return task;
    }
    if (task.completedAt) throw new Error('أعد فتح المهمة قبل تعديلها.');
    // A new time, or a repeat switched on or changed, anchors the series at the time the editor shows,
    // which for a snoozed task is the snoozed time rather than the original one.
    const repeatChanged = fields.repeat !== 'none' && fields.repeat !== task.repeat;
    // onlyThisTime moves one occurrence of an unchanged series and keeps its anchor, as a snooze does.
    const onlyThisTime = input.onlyThisTime === true && fields.repeat !== 'none' && !repeatChanged && !!task.scheduleAt;
    const anchor = !onlyThisTime && (fields.dueAt !== task.dueAt || repeatChanged);
    if (onlyThisTime && fields.dueAt !== task.dueAt) task.snoozedAt = null;
    Object.assign(task, fields, { updatedAt: now.toISOString() });
    if (anchor) { task.scheduleAt = fields.dueAt; task.snoozedAt = null; }
  } else {
    task = { ...fields, id: randomUUID(), scheduleAt: fields.dueAt, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: null, snoozedAt: null };
    state.tasks.push(task);
  }
  return task;
}
function nextOccurrence(value, repeat, now) {
  const next = new Date(value);
  const step = repeat === 'weekly' ? 7 : 1;
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
// Returns false when the call was ignored.
function completeTask(state, id, now = new Date(), { expectedDueAt } = {}) {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.completedAt || stale(task, expectedDueAt)) return false;
  if (task.repeat !== 'none' && task.scheduleAt) {
    state.tasks.push({ ...task, id: randomUUID(), repeat: 'none', sourceId: task.id, completedAt: now.toISOString() });
    task.dueAt = nextOccurrence(task.scheduleAt, task.repeat, now);
    task.scheduleAt = task.dueAt;
    task.snoozedAt = null;
    task.updatedAt = now.toISOString();
  } else { task.completedAt = now.toISOString(); task.updatedAt = now.toISOString(); }
  return true;
}
// Moves a repeating task to its next occurrence without recording a completion.
// Returns false when expectedDueAt shows the occurrence was already handled.
function skipOccurrence(state, id, expectedDueAt, now = new Date()) {
  const task = state.tasks.find(t => t.id === id && !t.completedAt);
  if (!task || task.repeat === 'none' || !task.scheduleAt) throw new Error('يمكن تخطي المهام المتكررة النشطة فقط.');
  if (stale(task, expectedDueAt)) return false;
  task.dueAt = nextOccurrence(task.scheduleAt, task.repeat, now);
  task.scheduleAt = task.dueAt;
  task.snoozedAt = null;
  task.updatedAt = now.toISOString();
  return true;
}
// Returns false when expectedDueAt shows the reminder was already handled.
function snoozeTask(state, id, until, now = new Date(), { expectedDueAt } = {}) {
  const task = state.tasks.find(t => t.id === id && !t.completedAt);
  if (!task) { if (expectedDueAt !== undefined) return false; throw new Error('هذا التذكير لم يعد نشطًا.'); }
  if (stale(task, expectedDueAt)) return false;
  const next = date(until);
  if (!next || Date.parse(next) <= now.getTime()) throw new Error('اختر وقتًا لاحقًا للتذكير.');
  task.dueAt = next;
  task.snoozedAt = now.toISOString();
  task.updatedAt = now.toISOString();
  return true;
}
function dueTasks(state, now = new Date()) {
  return state.tasks.filter(t => !t.completedAt && t.dueAt && Date.parse(t.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
// The preview alert only shows while no real reminder is due. A real reminder drops it for good,
// so it never appears later, out of context, after the real one is done.
function alertQueue(state, preview, now = new Date()) {
  const due = dueTasks(state, now);
  return due.length ? { alerts: due, preview: null } : { alerts: preview ? [preview] : [], preview };
}
function validateState(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.notes)) throw new Error('ملف البيانات غير صالح.');
  data.attachments ??= [];
  if (!Array.isArray(data.attachments)) throw new Error('قائمة المرفقات غير صالحة.');
  const attachmentMap = new Set();
  for (const record of data.attachments) {
    validateAttachment(record);
    if (attachmentMap.has(record.id)) throw new Error('معرّف مرفق مكرر.');
    attachmentMap.add(record.id);
  }
  for (const item of [...data.tasks, ...data.notes]) {
    if (!item || typeof item !== 'object') throw new Error('بيانات المهام أو الملاحظات غير صالحة.');
    item.attachments = attachmentIds(item.attachments);
    if (item.attachments.some(id => !attachmentMap.has(id))) throw new Error('مرجع المرفق غير موجود.');
  }
  const ids = new Set();
  for (const task of data.tasks) {
    // Out-of-range fields are normalized rather than rejected, so one odd value never hides the whole file.
    const { body, priority, category, dueAt, repeat } = taskInput(task);
    Object.assign(task, { body, priority, category, dueAt, repeat });
    if (typeof task.id !== 'string' || ids.has(task.id)) throw new Error('بيانات المهام غير صالحة.');
    ids.add(task.id);
    task.scheduleAt = date(task.scheduleAt); task.completedAt = date(task.completedAt);
    if (task.repeat !== 'none' && !task.scheduleAt) task.scheduleAt = task.dueAt;
    try { task.snoozedAt = date(task.snoozedAt); } catch { task.snoozedAt = null; }
  }
  for (const note of data.notes) {
    title(note.title);
    if (typeof note.id !== 'string' || typeof note.body !== 'string') throw new Error('بيانات الملاحظات غير صالحة.');
    if (!['cream', 'green', 'blue', 'pink'].includes(note.color)) note.color = 'cream';
  }
  const defaults = initialState().settings;
  const saved = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : {};
  data.settings = { ...defaults, ...saved };
  for (const key of ['sound', 'startAtLogin']) if (typeof data.settings[key] !== 'boolean') data.settings[key] = defaults[key];
  data.settings.alertSide = data.settings.alertSide === 'left' ? 'left' : 'right';
  data.settings.language = data.settings.language === 'en' ? 'en' : 'ar';
  if (data.settings.remindAgain !== undefined && !REMIND_AGAIN.includes(data.settings.remindAgain)) data.settings.remindAgain = 0;
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
      } catch { throw new Error('تعذّر قراءة البيانات والنسخة الاحتياطية. احتفظنا بالملفات دون تغيير في: ' + directory); }
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
module.exports = { REMIND_AGAIN, initialState, saveTask, completeTask, skipOccurrence, snoozeTask, dueTasks, alertQueue, nextOccurrence, validateState, Store, writeDurable, renameWithRetry };
