'use strict';
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { attachmentIds, validateAttachment } = require('./attachments');

function initialState() {
  return { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: 'ar' } };
}
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
    if (task.completedAt) throw new Error('أعد فتح المهمة قبل تعديلها.');
    const changed = fields.dueAt !== task.dueAt;
    Object.assign(task, fields, { updatedAt: now.toISOString() });
    if (changed) { task.scheduleAt = fields.dueAt; task.snoozedAt = null; }
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
function completeTask(state, id, now = new Date()) {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.completedAt) return;
  if (task.repeat !== 'none' && task.scheduleAt) {
    state.tasks.push({ ...task, id: randomUUID(), repeat: 'none', sourceId: task.id, completedAt: now.toISOString() });
    task.dueAt = nextOccurrence(task.scheduleAt, task.repeat, now);
    task.scheduleAt = task.dueAt;
    task.snoozedAt = null;
    task.updatedAt = now.toISOString();
  } else task.completedAt = now.toISOString();
}
function snoozeTask(state, id, until, now = new Date()) {
  const task = state.tasks.find(t => t.id === id && !t.completedAt);
  if (!task) throw new Error('هذا التذكير لم يعد نشطًا.');
  const next = date(until);
  if (!next || Date.parse(next) <= now.getTime()) throw new Error('اختر وقتًا لاحقًا للتذكير.');
  task.dueAt = next;
  task.snoozedAt = now.toISOString();
  task.updatedAt = now.toISOString();
}
function dueTasks(state, now = new Date()) {
  return state.tasks.filter(t => !t.completedAt && t.dueAt && Date.parse(t.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
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
    item.attachments = attachmentIds(item.attachments);
    if (item.attachments.some(id => !attachmentMap.has(id))) throw new Error('مرجع المرفق غير موجود.');
  }
  const ids = new Set();
  for (const task of data.tasks) {
    taskInput(task);
    if (typeof task.id !== 'string' || ids.has(task.id)) throw new Error('بيانات المهام غير صالحة.');
    ids.add(task.id);
    date(task.scheduleAt); date(task.completedAt);
  }
  for (const note of data.notes) {
    title(note.title);
    if (typeof note.id !== 'string' || typeof note.body !== 'string') throw new Error('بيانات الملاحظات غير صالحة.');
  }
  data.settings = { ...initialState().settings, ...data.settings };
  data.settings.language = data.settings.language === 'en' ? 'en' : 'ar';
  return data;
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
        fs.writeFileSync(this.file + '.recovered', JSON.stringify(this.state, null, 2), 'utf8');
        fs.renameSync(this.file + '.recovered', this.file);
        this.recovered = true;
      } catch { throw new Error('تعذّر قراءة البيانات والنسخة الاحتياطية. احتفظنا بالملفات دون تغيير في: ' + directory); }
    }
  }
  change(fn) {
    const draft = structuredClone(this.state);
    const result = fn(draft);
    validateState(draft);
    const temporary = this.file + '.tmp';
    const fd = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(draft, null, 2), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
    fs.renameSync(temporary, this.file);
    this.state = draft;
    return result;
  }
}
module.exports = { initialState, saveTask, completeTask, snoozeTask, dueTasks, nextOccurrence, validateState, Store };
