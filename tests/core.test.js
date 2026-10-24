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
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(valid))), before);

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
test('a repeated Done or snooze for an occurrence that already moved on changes nothing', () => {
  const s = initialState();
  const t = saveTask(s, { title: 'daily', dueAt: new Date(2026, 9, 23, 9).toISOString(), repeat: 'daily' });
  const seen = t.dueAt, now = new Date(2026, 9, 23, 9, 5);
  assert.equal(completeTask(s, t.id, now, { expectedDueAt: seen }), true);
  assert.equal(completeTask(s, t.id, now, { expectedDueAt: seen }), false, 'A double click is a no-op');
  assert.equal(s.tasks.filter(x => x.completedAt).length, 1, 'Exactly one completed copy');
  assert.deepEqual([new Date(t.dueAt).getDate(), new Date(t.dueAt).getHours()], [24, 9], 'The due time advanced by exactly one day');
  const next = t.dueAt;
  assert.equal(snoozeTask(s, t.id, new Date(2026, 9, 23, 12).toISOString(), now, { expectedDueAt: seen }), false);
  assert.equal(t.dueAt, next);
  assert.equal(snoozeTask(s, t.id, new Date(2026, 9, 24, 12).toISOString(), now, { expectedDueAt: next }), true);
  assert.equal(completeTask(s, t.id, now, { expectedDueAt: next }), false, 'Done for the snoozed-away time is stale');
  // Older callers send no expected time and keep working.
  assert.equal(completeTask(s, t.id, now), true);
  assert.equal(s.tasks.filter(x => x.completedAt).length, 2);
  const once = saveTask(s, { title: 'once', dueAt: '2026-10-23T08:00:00Z' });
  assert.equal(completeTask(s, once.id, now, { expectedDueAt: '2026-10-23T08:00:00.000Z' }), true);
  assert.equal(snoozeTask(s, once.id, '2026-10-30T08:00:00Z', now, { expectedDueAt: '2026-10-23T08:00:00.000Z' }), false, 'A snooze queued behind Done is ignored');
  assert.throws(() => snoozeTask(s, once.id, '2026-10-30T08:00:00Z', now), /نشطًا/);
  const undated = saveTask(s, { title: 'undated' });
  assert.equal(completeTask(s, undated.id, now, { expectedDueAt: null }), true);
});
test('turning on or changing a repeat anchors it to the snoozed time the editor shows', () => {
  const s = initialState();
  const once = saveTask(s, { title: 'once', dueAt: new Date(2026, 9, 23, 9).toISOString() });
  snoozeTask(s, once.id, new Date(2026, 9, 23, 14).toISOString(), new Date(2026, 9, 23, 9));
  saveTask(s, { ...once, repeat: 'daily' });
  assert.equal(once.scheduleAt, new Date(2026, 9, 23, 14).toISOString());
  assert.equal(once.snoozedAt, null);
  completeTask(s, once.id, new Date(2026, 9, 23, 14, 1));
  assert.deepEqual([new Date(once.dueAt).getDate(), new Date(once.dueAt).getHours()], [24, 14]);

  const daily = saveTask(s, { title: 'daily', dueAt: new Date(2026, 9, 23, 9).toISOString(), repeat: 'daily' });
  snoozeTask(s, daily.id, new Date(2026, 9, 23, 11).toISOString(), new Date(2026, 9, 23, 9));
  saveTask(s, { ...daily, body: 'only the text' });
  assert.equal(daily.scheduleAt, new Date(2026, 9, 23, 9).toISOString(), 'A body edit keeps the anchor');
  assert.ok(daily.snoozedAt);
  saveTask(s, { ...daily, repeat: 'weekly' });
  assert.equal(daily.scheduleAt, new Date(2026, 9, 23, 11).toISOString(), 'A new repeat type re-anchors');
  completeTask(s, daily.id, new Date(2026, 9, 23, 11, 1));
  assert.deepEqual([new Date(daily.dueAt).getDate(), new Date(daily.dueAt).getHours()], [30, 11]);
});
test('saving an editor opened before a snooze or Done in the alert keeps the new time and applies the text', () => {
  const s = initialState(), at = (d, h, m = 0) => new Date(2026, 9, d, h, m);
  const t = saveTask(s, { title: 'once', dueAt: at(23, 9).toISOString() }, at(22, 8));
  const editor = { ...t }; // what the editor opened with
  snoozeTask(s, t.id, at(23, 9, 15).toISOString(), at(23, 9));
  saveTask(s, { ...editor, body: 'edited in the editor', timeEdited: false }, at(23, 9, 1));
  assert.deepEqual([t.dueAt, t.body], [at(23, 9, 15).toISOString(), 'edited in the editor']);
  assert.ok(t.snoozedAt, 'The snooze is kept');
  assert.equal(t.scheduleAt, at(23, 9).toISOString());

  const daily = saveTask(s, { title: 'daily', dueAt: at(23, 9).toISOString(), repeat: 'daily' }, at(22, 8));
  const opened = { ...daily };
  completeTask(s, daily.id, at(23, 9, 5));
  saveTask(s, { ...opened, title: 'daily, renamed', timeEdited: false }, at(23, 9, 6));
  assert.equal(new Date(daily.dueAt).getDate(), 24, 'Stays on tomorrow’s occurrence');
  assert.equal(daily.title, 'daily, renamed');
  assert.equal(s.tasks.filter(x => x.sourceId === daily.id).length, 1, 'No second completion');

  const done = saveTask(s, { title: 'one-time', dueAt: at(23, 10).toISOString() }, at(22, 8));
  const before = { ...done };
  completeTask(s, done.id, at(23, 10, 1));
  saveTask(s, { ...before, body: 'not lost', timeEdited: true, dueAt: at(23, 12).toISOString() }, at(23, 10, 2));
  assert.equal(done.body, 'not lost', 'Text edits land on the completed record');
  assert.ok(done.completedAt);
  assert.equal(done.dueAt, at(23, 10).toISOString());
  assert.throws(() => saveTask(s, { ...done, body: 'x' }), /أعد فتح/, 'Older callers still cannot edit a completed task');

  // An edit that does change the time still moves the task and its anchor, even after a snooze.
  const moved = saveTask(s, { title: 'moved', dueAt: at(23, 9).toISOString(), repeat: 'daily' }, at(22, 8));
  const seen = { ...moved };
  snoozeTask(s, moved.id, at(23, 9, 30).toISOString(), at(23, 9));
  saveTask(s, { ...seen, dueAt: at(23, 11).toISOString(), timeEdited: true }, at(23, 9, 1));
  assert.deepEqual([moved.dueAt, moved.scheduleAt, moved.snoozedAt], [at(23, 11).toISOString(), at(23, 11).toISOString(), null]);
  // Saved without anything happening in between, the time is applied as before.
  saveTask(s, { ...moved, dueAt: at(23, 12).toISOString(), timeEdited: true }, at(23, 9, 2));
  assert.equal(moved.scheduleAt, at(23, 12).toISOString());
});
