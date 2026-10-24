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
  // Only the update question, which v1.4.0 never asked, is added.
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(valid))), { ...before, settings: { ...before.settings, autoUpdate: null } });

  const odd = JSON.parse(JSON.stringify(valid));
  Object.assign(odd.tasks[0], { priority: 'urgent', category: 42, repeat: 'monthly', snoozedAt: 'yesterday' });
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
