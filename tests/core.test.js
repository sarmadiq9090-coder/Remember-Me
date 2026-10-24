const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initialState, saveTask, completeTask, snoozeTask, dueTasks, Store } = require('../src/core/tasks');
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
  const { validateState } = require('../src/core/tasks');
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
  assert.throws(() => validateState({ ...before, tasks: [null] }), /task/);
  assert.throws(() => validateState({ ...before, version: 2 }), /invalid/);
});
test('undoing Done restores a one-time task, and a repeat to the occurrence that was completed', () => {
  const { undoComplete } = require('../src/core/tasks');
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
  const { trashItem, restoreItem, purgeItem, purgeTrash, validateState } = require('../src/core/tasks');
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
test('the week starts on Saturday unless Sunday or Monday was chosen', () => {
  const { validateState } = require('../src/core/tasks');
  const base = initialState();
  assert.equal(base.settings.weekStart, 6);
  assert.equal(validateState({ ...base, settings: { ...base.settings, weekStart: 1 } }).settings.weekStart, 1);
  assert.equal(validateState({ ...base, settings: { ...base.settings, weekStart: 0 } }).settings.weekStart, 0);
  for (const weekStart of [3, 'auto', '6', null]) assert.equal(validateState({ ...base, settings: { ...base.settings, weekStart } }).settings.weekStart, 6, String(weekStart));
  assert.equal(validateState({ ...base, settings: { sound: true, startAtLogin: false, alertSide: 'right', language: 'en' } }).settings.weekStart, 6, 'v1.4.0 data has no weekStart and gets Saturday');
});
test('data saved with the removed Hijri date and digit style options still loads, without those fields', () => {
  const { validateState } = require('../src/core/tasks');
  const old = JSON.parse(JSON.stringify({ ...initialState(), settings: { ...initialState().settings, hijri: true, digits: 'arab' } }));
  saveTask(old, { title: 'kept' });
  const loaded = validateState(old);
  assert.ok(!('hijri' in loaded.settings) && !('digits' in loaded.settings));
  assert.equal(loaded.tasks[0].title, 'kept');
  const odd = validateState({ ...initialState(), settings: { hijri: 'yes', digits: 'roman' } }).settings;
  assert.ok(!('hijri' in odd) && !('digits' in odd));
});
test('tags are trimmed, de-duplicated, limited and kept through edits, repeats and loading', () => {
  const { normalizeTags, validateState } = require('../src/core/tasks');
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
  const { normalizeChecklist, toggleStep, validateState } = require('../src/core/tasks');
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
  assert.throws(() => toggleStep(s, t.id, 'missing'), /step/);
  assert.ok(!('checklist' in saveTask(s, { title: 'بلا خطوات', checklist: [{ text: '  ' }] })));
  assert.equal(validateState({ ...initialState(), tasks: [{ ...t, checklist: [{ text: 'ok', done: 'yes' }] }] }).tasks[0].checklist[0].done, false);
});
test('a repeated Done or snooze for an occurrence that already moved on changes nothing', () => {
  const s = initialState();
  const t = saveTask(s, { title: 'daily', dueAt: new Date(2026, 9, 23, 9).toISOString(), repeat: 'daily' });
  const seen = t.dueAt, now = new Date(2026, 9, 23, 9, 5);
  assert.ok(completeTask(s, t.id, now, { expectedDueAt: seen }));
  assert.equal(completeTask(s, t.id, now, { expectedDueAt: seen }), null, 'A double click is a no-op');
  assert.equal(s.tasks.filter(x => x.completedAt).length, 1, 'Exactly one completed copy');
  assert.deepEqual([new Date(t.dueAt).getDate(), new Date(t.dueAt).getHours()], [24, 9], 'The due time advanced by exactly one day');
  const next = t.dueAt;
  assert.equal(snoozeTask(s, t.id, new Date(2026, 9, 23, 12).toISOString(), now, { expectedDueAt: seen }), false);
  assert.equal(t.dueAt, next);
  assert.equal(snoozeTask(s, t.id, new Date(2026, 9, 24, 12).toISOString(), now, { expectedDueAt: next }), true);
  assert.equal(completeTask(s, t.id, now, { expectedDueAt: next }), null, 'Done for the snoozed-away time is stale');
  // Older callers send no expected time and keep working.
  assert.ok(completeTask(s, t.id, now));
  assert.equal(s.tasks.filter(x => x.completedAt).length, 2);
  const once = saveTask(s, { title: 'once', dueAt: '2026-10-23T08:00:00Z' });
  assert.ok(completeTask(s, once.id, now, { expectedDueAt: '2026-10-23T08:00:00.000Z' }));
  assert.equal(snoozeTask(s, once.id, '2026-10-30T08:00:00Z', now, { expectedDueAt: '2026-10-23T08:00:00.000Z' }), false, 'A snooze queued behind Done is ignored');
  assert.throws(() => snoozeTask(s, once.id, '2026-10-30T08:00:00Z', now), /no longer active/);
  const undated = saveTask(s, { title: 'undated' });
  assert.ok(completeTask(s, undated.id, now, { expectedDueAt: null }));
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
  assert.throws(() => saveTask(s, { ...done, body: 'x' }), /Reopen/, 'Older callers still cannot edit a completed task');

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
test('the preview alert shows only on its own and never comes back after a real reminder', () => {
  const { alertQueue } = require('../src/core/tasks');
  const s = initialState(), now = new Date('2026-10-23T10:00:00Z');
  const preview = { id: '__preview', title: 'preview', dueAt: now.toISOString() };
  assert.deepEqual(alertQueue(s, preview, now), { alerts: [preview], preview }, 'With no real reminder the preview shows as before');
  assert.deepEqual(alertQueue(s, null, now), { alerts: [], preview: null });
  const real = saveTask(s, { title: 'real', dueAt: '2026-10-23T09:00:00Z' });
  const queue = alertQueue(s, preview, now);
  assert.deepEqual([queue.alerts.map(t => t.id), queue.preview], [[real.id], null], 'A real reminder replaces the preview and clears it');
  completeTask(s, real.id, now);
  assert.deepEqual(alertQueue(s, queue.preview, now).alerts, [], 'After Done the alert closes; the preview does not appear late');
});
test('skipping an occurrence moves a repeating task on without recording a completion', () => {
  const { skipOccurrence } = require('../src/core/tasks');
  const s = initialState(), now = new Date(2026, 9, 23, 8);
  const t = saveTask(s, { title: 'daily', dueAt: new Date(2026, 9, 23, 9).toISOString(), repeat: 'daily' });
  const seen = t.dueAt;
  assert.equal(skipOccurrence(s, t.id, seen, now), true);
  assert.equal(t.dueAt, new Date(2026, 9, 24, 9).toISOString());
  assert.equal(t.scheduleAt, t.dueAt);
  assert.equal(s.tasks.filter(x => x.completedAt).length, 0, 'No completed copy');
  assert.equal(skipOccurrence(s, t.id, seen, now), false, 'A stale expected time is a no-op');
  assert.equal(t.dueAt, new Date(2026, 9, 24, 9).toISOString());
  snoozeTask(s, t.id, new Date(2026, 9, 24, 11).toISOString(), new Date(2026, 9, 24, 9));
  assert.equal(skipOccurrence(s, t.id, t.dueAt, new Date(2026, 9, 24, 9, 1)), true);
  assert.deepEqual([t.dueAt, t.snoozedAt], [new Date(2026, 9, 25, 9).toISOString(), null], 'A snoozed occurrence skips to the series time');
  const once = saveTask(s, { title: 'once', dueAt: new Date(2026, 9, 23, 9).toISOString() });
  assert.throws(() => skipOccurrence(s, once.id, once.dueAt, now), /repeating/);
  completeTask(s, once.id, now);
  assert.throws(() => skipOccurrence(s, once.id, undefined, now), /repeating/);
});
test('moving one occurrence with onlyThisTime keeps the series at its usual time', () => {
  const s = initialState();
  const monday = new Date(2026, 9, 26, 9); // Monday 09:00
  const t = saveTask(s, { title: 'weekly meeting', dueAt: monday.toISOString(), repeat: 'weekly' });
  saveTask(s, { ...t, dueAt: new Date(2026, 9, 26, 11).toISOString(), onlyThisTime: true });
  assert.deepEqual([t.dueAt, t.scheduleAt], [new Date(2026, 9, 26, 11).toISOString(), monday.toISOString()]);
  completeTask(s, t.id, new Date(2026, 9, 26, 11, 5));
  assert.equal(t.dueAt, new Date(2026, 10, 2, 9).toISOString(), 'The following Monday at 09:00');
  saveTask(s, { ...t, dueAt: new Date(2026, 10, 2, 11).toISOString() });
  assert.equal(t.scheduleAt, new Date(2026, 10, 2, 11).toISOString(), 'Without the flag the series moves');
  saveTask(s, { ...t, dueAt: new Date(2026, 10, 2, 12).toISOString(), repeat: 'daily', onlyThisTime: true });
  assert.equal(t.scheduleAt, new Date(2026, 10, 2, 12).toISOString(), 'A changed repeat re-anchors whatever the flag says');
  const once = saveTask(s, { title: 'once', dueAt: monday.toISOString() });
  saveTask(s, { ...once, dueAt: new Date(2026, 9, 26, 11).toISOString(), onlyThisTime: true });
  assert.equal(once.scheduleAt, once.dueAt, 'The flag means nothing for a one-time task');
});
test('snoozes are counted until the occurrence is done, skipped or moved, and Undo restores the count', () => {
  const { undoComplete, skipOccurrence, validateState } = require('../src/core/tasks');
  const s = initialState(), now = new Date('2026-10-24T09:00:00Z');
  const t = saveTask(s, { title: 'مؤجلة', dueAt: '2026-10-24T09:00:00.000Z', repeat: 'daily' });
  for (const hour of [10, 11, 12]) snoozeTask(s, t.id, `2026-10-24T${hour}:00:00.000Z`, now);
  assert.equal(t.snoozeCount, 3);
  const done = completeTask(s, t.id, new Date('2026-10-24T12:05:00Z'));
  assert.ok(!('snoozeCount' in t), 'The next occurrence starts afresh');
  undoComplete(s, done.id, done.copyId);
  assert.equal(t.snoozeCount, 3, 'Undo brings the count back');
  skipOccurrence(s, t.id, t.dueAt, new Date('2026-10-24T12:10:00Z'));
  assert.ok(!('snoozeCount' in t));
  snoozeTask(s, t.id, '2026-10-26T10:00:00.000Z', new Date('2026-10-25T09:00:00Z'));
  saveTask(s, { ...t, dueAt: '2026-10-27T08:00:00.000Z' });
  assert.ok(!('snoozeCount' in t), 'Choosing a new time resets it');
  assert.ok(!('snoozeCount' in validateState({ ...initialState(), tasks: [{ ...t, snoozeCount: 'many' }] }).tasks[0]));
  assert.ok(!('snoozeCount' in saveTask(s, { title: 'جديدة' })), 'Old and new tasks without snoozes have no field');
});
test('ARCHITECTURE.md describes every default setting of data.json', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'ARCHITECTURE.md'), 'utf8');
  const shape = doc.slice(doc.indexOf('settings: {'), doc.indexOf('```', doc.indexOf('settings: {')));
  const missing = Object.keys(initialState().settings).filter(key => !new RegExp(`\\b${key}\\??:`).test(shape));
  assert.deepEqual(missing, [], 'Add these settings to the data.json shape in ARCHITECTURE.md');
});
