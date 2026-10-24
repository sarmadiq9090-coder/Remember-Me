const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initialState, saveTask, completeTask, snoozeTask, dueTasks, Store } = require('../src/core');
test('reminders remain due until completed or snoozed, including after a long sleep', () => {
  const s = initialState();
  const t = saveTask(s, { title: 'تذكير', dueAt: '2026-10-23T10:00:00Z' });
  assert.equal(dueTasks(s, new Date('2026-10-23T09:59:59Z')).length, 0);
  assert.equal(dueTasks(s, new Date('2026-10-25T10:00:00Z')).length, 1);
  snoozeTask(s, t.id, '2026-10-25T11:00:00Z', new Date('2026-10-25T10:00:00Z'));
  assert.equal(dueTasks(s, new Date('2026-10-25T10:59:59Z')).length, 0);
  assert.equal(dueTasks(s, new Date('2026-10-25T11:00:00Z')).length, 1);
  completeTask(s, t.id);
  assert.equal(dueTasks(s, new Date('2026-10-26T11:00:00Z')).length, 0);
});
test('snooze rejects past dates without changing a task', () => {
  const s = initialState(); const t = saveTask(s, { title: 'test', dueAt: '2026-10-23T10:00:00Z' });
  const before = structuredClone(t);
  assert.throws(() => snoozeTask(s, t.id, '2026-10-23T09:00:00Z', new Date('2026-10-23T10:00:00Z')));
  assert.deepEqual(t, before);
});
test('daily repeats preserve original local schedule after snoozing and create completion history', () => {
  const s = initialState(); const original = new Date(2026, 9, 23, 9, 0);
  const t = saveTask(s, { title: 'يومي', dueAt: original.toISOString(), repeat: 'daily' });
  snoozeTask(s, t.id, new Date(2026, 9, 23, 14).toISOString(), new Date(2026, 9, 23, 9));
  completeTask(s, t.id, new Date(2026, 9, 23, 14, 1));
  assert.equal(new Date(t.dueAt).getHours(), 9);
  assert.equal(new Date(t.dueAt).getDate(), 24);
  assert.equal(s.tasks.filter(t => t.completedAt).length, 1);
  assert.equal(dueTasks(s, new Date(2026, 9, 23, 15)).length, 0);
});
test('weekly repeats skip missed weeks and never schedule in the past', () => {
  const s = initialState(); const first = new Date(2026, 9, 2, 9);
  const t = saveTask(s, { title: 'weekly', dueAt: first.toISOString(), repeat: 'weekly' });
  const now = new Date(2026, 9, 23, 10);
  completeTask(s, t.id, now);
  assert.ok(Date.parse(t.dueAt) > now.getTime());
  assert.equal(new Date(t.dueAt).getDay(), first.getDay());
  assert.equal(new Date(t.dueAt).getHours(), first.getHours());
});
test('completing a recurring task early advances beyond its scheduled occurrence', () => {
  const s = initialState();
  const t = saveTask(s, { title: 'early', dueAt: new Date(2026, 9, 24, 9).toISOString(), repeat: 'daily' });
  completeTask(s, t.id, new Date(2026, 9, 23, 14));
  assert.equal(new Date(t.dueAt).getDate(), 25);
});
test('editing reminder updates recurrence anchor, invalid inputs are rejected', () => {
  const s = initialState(); const t = saveTask(s, { title: 'test', dueAt: '2026-10-23T10:00:00Z', repeat: 'daily' });
  saveTask(s, { ...t, dueAt: '2026-10-23T12:00:00Z' });
  assert.equal(t.scheduleAt, '2026-10-23T12:00:00.000Z');
  assert.throws(() => saveTask(s, { title: ' ', repeat: 'none' }));
  assert.throws(() => saveTask(s, { title: 'test', repeat: 'daily' }));
  assert.throws(() => saveTask(s, { title: 'test', dueAt: 'not-a-date' }));
});
test('atomic persistence survives restart and recovers a corrupted file from backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-core-'));
  try {
    const store = new Store(dir);
    store.change(s => saveTask(s, { title: 'محفوظة' }));
    store.change(s => saveTask(s, { title: 'ثانية' }));
    assert.equal(new Store(dir).state.tasks.length, 2);
    fs.writeFileSync(path.join(dir, 'data.json'), '{broken');
    const recovered = new Store(dir);
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.state.tasks[0].title, 'محفوظة');
    assert.equal(new Store(dir).state.tasks[0].title, 'محفوظة');
    recovered.change(s => saveTask(s, { title: 'بعد الاستعادة' }));
    assert.equal(new Store(dir).state.tasks.length, 2);
    assert.ok(fs.readdirSync(dir).some(n => n.startsWith('data.json.damaged-')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('failed mutation cannot corrupt saved or in-memory state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-core-'));
  try { const store = new Store(dir); store.change(s => saveTask(s, { title: 'keep' }));
    assert.throws(() => store.change(s => { s.tasks.length = 0; throw new Error('fail'); }));
    assert.equal(store.state.tasks.length, 1); assert.equal(new Store(dir).state.tasks.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('multiple overdue tasks are queued in time order and unscheduled tasks never notify', () => {
  const s = initialState();
  saveTask(s, { title: 'later', dueAt: '2026-10-23T11:00:00Z' });
  saveTask(s, { title: 'earlier', dueAt: '2026-10-23T10:00:00Z' });
  saveTask(s, { title: 'unscheduled' });
  assert.deepEqual(dueTasks(s, new Date('2026-10-23T12:00:00Z')).map(t => t.title), ['earlier', 'later']);
});
test('saving retries a rename blocked briefly by antivirus or indexing, and keeps a durable backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-core-'));
  const rename = fs.renameSync;
  try {
    const store = new Store(dir);
    store.change(s => saveTask(s, { title: 'أولى' }));
    let blocked = 0;
    fs.renameSync = (...args) => { if (blocked++ < 2) throw Object.assign(new Error('locked'), { code: 'EPERM' }); return rename(...args); };
    store.change(s => saveTask(s, { title: 'ثانية' }));
    assert.equal(blocked, 3);
    assert.equal(new Store(dir).state.tasks.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data.json.bak'), 'utf8')).tasks.length, 1);
    fs.renameSync = () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); };
    assert.throws(() => store.change(s => saveTask(s, { title: 'ثالثة' })), /locked/);
    fs.renameSync = rename;
    assert.equal(store.state.tasks.length, 2, 'A failed save must not change in-memory state');
    assert.equal(new Store(dir).state.tasks.length, 2);
  } finally { fs.renameSync = rename; fs.rmSync(dir, { recursive: true, force: true }); }
});
test('loading normalizes out-of-range fields instead of rejecting the file, and leaves valid v1.4.0 data unchanged', () => {
  const { validateState } = require('../src/core');
  const valid = initialState();
  const daily = saveTask(valid, { title: 'يومية', dueAt: '2026-10-23T06:00:00.000Z', repeat: 'daily' });
  completeTask(valid, daily.id, new Date('2026-10-23T07:00:00Z'));
  snoozeTask(valid, daily.id, '2026-10-25T06:00:00.000Z', new Date('2026-10-24T07:00:00Z'));
  valid.notes.push({ id: 'n1', title: 'ملاحظة', body: 'نص', attachments: [], color: 'green', createdAt: '2026-10-23T06:00:00.000Z', updatedAt: '2026-10-23T06:00:00.000Z' });
  valid.settings = { sound: false, startAtLogin: true, alertSide: 'left', language: 'en' };
  const before = JSON.parse(JSON.stringify(valid));
  const loaded = validateState(JSON.parse(JSON.stringify(valid)));
  assert.deepEqual({ ...loaded, settings: null }, { ...before, settings: null });
  assert.deepEqual(loaded.settings, { ...initialState().settings, ...before.settings }, 'Old settings are kept; newer options get their defaults');

  const odd = JSON.parse(JSON.stringify(valid));
  Object.assign(odd.tasks[0], { priority: 'urgent', category: 42, repeat: 'fortnightly', snoozedAt: 'yesterday' });
  odd.tasks.push({ ...odd.tasks[0], id: 'legacy', repeat: 'weekly', scheduleAt: null });
  odd.notes[0].color = 'neon';
  odd.settings = 'broken';
  const fixed = validateState(odd);
  assert.deepEqual([fixed.tasks[0].priority, fixed.tasks[0].category, fixed.tasks[0].repeat, fixed.tasks[0].snoozedAt], ['normal', 'personal', 'none', null]);
  assert.equal(fixed.tasks[2].scheduleAt, fixed.tasks[2].dueAt, 'A recurring task always keeps its recurrence anchor');
  assert.equal(fixed.notes[0].color, 'cream');
  assert.deepEqual(fixed.settings, initialState().settings);
  assert.throws(() => validateState({ ...before, tasks: [null] }), /المهام/);
  assert.throws(() => validateState({ ...before, version: 2 }), /غير صالح/);
});
test('undoing Done restores a one-time task, and a repeat to the occurrence that was completed', () => {
  const { undoComplete } = require('../src/core');
  const s = initialState();
  const once = saveTask(s, { title: 'مرة', dueAt: '2026-10-24T09:00:00.000Z' });
  const r1 = completeTask(s, once.id, new Date('2026-10-24T09:01:00Z'));
  undoComplete(s, r1.id, r1.copyId);
  assert.equal(once.completedAt, null);
  assert.equal(dueTasks(s, new Date('2026-10-24T09:02:00Z')).length, 1, 'It is due again');
  completeTask(s, once.id);
  const daily = saveTask(s, { title: 'يومي', dueAt: '2026-10-24T09:00:00.000Z', repeat: 'daily' });
  snoozeTask(s, daily.id, '2026-10-24T10:00:00.000Z', new Date('2026-10-24T09:00:00Z'));
  const before = structuredClone(daily);
  const r2 = completeTask(s, daily.id, new Date('2026-10-24T10:01:00Z'));
  assert.notEqual(daily.dueAt, before.dueAt);
  undoComplete(s, r2.id, r2.copyId);
  assert.deepEqual([daily.dueAt, daily.scheduleAt, daily.snoozedAt], [before.dueAt, before.scheduleAt, before.snoozedAt]);
  assert.equal(s.tasks.filter(t => t.sourceId === daily.id).length, 0, 'The history copy is removed');
  assert.equal(completeTask(s, 'missing'), null);
});

test('deleted items wait 30 days in the trash, out of every list and alert, and can be restored', () => {
  const { trashItem, restoreItem, purgeItem, purgeTrash, validateState } = require('../src/core');
  const s = initialState();
  const t = saveTask(s, { title: 'محذوفة', dueAt: '2026-10-01T09:00:00.000Z' });
  s.notes.push({ id: 'n1', title: 'ملاحظة', body: '', attachments: [], color: 'cream' });
  trashItem(s, 'tasks', t.id, new Date('2026-10-01T10:00:00Z')); trashItem(s, 'notes', 'n1', new Date('2026-10-20T10:00:00Z'));
  assert.equal(dueTasks(s, new Date('2026-10-02T00:00:00Z')).length, 0, 'A deleted reminder never alerts');
  assert.throws(() => snoozeTask(s, t.id, '2026-10-03T00:00:00Z', new Date('2026-10-02T00:00:00Z')));
  assert.equal(completeTask(s, t.id), null);
  restoreItem(s, 'tasks', t.id);
  assert.equal(dueTasks(s, new Date('2026-10-02T00:00:00Z')).length, 1);
  trashItem(s, 'tasks', t.id, new Date('2026-10-01T10:00:00Z'));
  assert.equal(purgeTrash(s, new Date('2026-10-30T09:00:00Z')), 0, 'Still inside 30 days');
  assert.equal(purgeTrash(s, new Date('2026-11-01T09:00:00Z')), 1, 'Only the task deleted over 30 days ago goes');
  assert.deepEqual(s.notes.map(n => n.id), ['n1']);
  purgeItem(s, 'notes', 'n1');
  assert.equal(s.notes.length, 0);
  const loaded = validateState({ ...initialState(), tasks: [{ ...t, deletedAt: 'garbage' }] });
  assert.equal(loaded.tasks[0].deletedAt, null, 'A malformed deletion date restores the task rather than hiding it');
  assert.throws(() => trashItem(s, 'settings', 'x'));
});
test('digit style, first weekday and Hijri settings default to the previous behaviour and reject unknown values', () => {
  const { validateState } = require('../src/core');
  const base = initialState();
  assert.deepEqual([base.settings.digits, base.settings.weekStart, base.settings.hijri], ['auto', 'auto', false]);
  const ok = validateState({ ...base, settings: { ...base.settings, digits: 'latn', weekStart: 1, hijri: true } }).settings;
  assert.deepEqual([ok.digits, ok.weekStart, ok.hijri], ['latn', 1, true]);
  const bad = validateState({ ...base, settings: { ...base.settings, digits: 'roman', weekStart: 3, hijri: 'yes' } }).settings;
  assert.deepEqual([bad.digits, bad.weekStart, bad.hijri], ['auto', 'auto', false]);
});
test('tags are trimmed, de-duplicated, limited and kept through edits, repeats and loading', () => {
  const { normalizeTags, validateState } = require('../src/core');
  assert.deepEqual(normalizeTags(['#عمل', ' عمل ', 'Home', 'home', '  ', 7, 'x'.repeat(40)]), ['عمل', 'Home', 'x'.repeat(30)]);
  assert.equal(normalizeTags(Array.from({ length: 15 }, (_, i) => 't' + i)).length, 10);
  const s = initialState();
  const t = saveTask(s, { title: 'موسوم', tags: ['عمل'], dueAt: '2026-10-24T09:00:00.000Z', repeat: 'daily' });
  assert.deepEqual(t.tags, ['عمل']);
  saveTask(s, { id: t.id, title: 'موسوم', dueAt: t.dueAt, repeat: 'daily' });
  assert.deepEqual(t.tags, ['عمل'], 'Saving without tags keeps them');
  completeTask(s, t.id, new Date('2026-10-24T10:00:00Z'));
  assert.deepEqual(s.tasks.find(x => x.completedAt).tags, ['عمل'], 'History keeps the tags');
  saveTask(s, { ...t, tags: [] });
  assert.ok(!('tags' in t));
  assert.ok(!('tags' in saveTask(s, { title: 'بلا وسوم' })));
  assert.deepEqual(validateState({ ...initialState(), tasks: [{ ...t, tags: ['a', 'A', 3] }] }).tasks[0].tags, ['a']);
});
test('checklist steps are validated, ticked one by one and reset on the next occurrence', () => {
  const { normalizeChecklist, toggleStep, validateState } = require('../src/core');
  const steps = normalizeChecklist([{ text: ' شراء الخبز ' }, { text: '' }, { id: 'a', text: 'غسل', done: true }, { id: 'a', text: 'مكرر' }, null, { text: 'x'.repeat(300) }]);
  assert.deepEqual(steps.map(s => s.text), ['شراء الخبز', 'غسل', 'مكرر', 'x'.repeat(200)]);
  assert.equal(new Set(steps.map(s => s.id)).size, 4, 'Duplicate ids are replaced');
  assert.equal(normalizeChecklist(Array.from({ length: 60 }, (_, i) => ({ text: 's' + i }))).length, 50);
  const s = initialState();
  const t = saveTask(s, { title: 'روتين', dueAt: '2026-10-24T09:00:00.000Z', repeat: 'daily', checklist: [{ text: 'أ' }, { text: 'ب' }] });
  toggleStep(s, t.id, t.checklist[0].id);
  assert.deepEqual(t.checklist.map(x => x.done), [true, false]);
  saveTask(s, { id: t.id, title: 'روتين', dueAt: t.dueAt, repeat: 'daily' });
  assert.equal(t.checklist.length, 2, 'Saving without steps keeps them');
  completeTask(s, t.id, new Date('2026-10-24T10:00:00Z'));
  assert.deepEqual(s.tasks.find(x => x.completedAt).checklist.map(x => x.done), [true, false], 'History keeps the ticks');
  assert.deepEqual(t.checklist.map(x => x.done), [false, false], 'The next occurrence starts unticked');
  assert.throws(() => toggleStep(s, t.id, 'missing'), /الخطوة/);
  assert.ok(!('checklist' in saveTask(s, { title: 'بلا خطوات', checklist: [{ text: '  ' }] })));
  assert.equal(validateState({ ...initialState(), tasks: [{ ...t, checklist: [{ text: 'ok', done: 'yes' }] }] }).tasks[0].checklist[0].done, false);
});
