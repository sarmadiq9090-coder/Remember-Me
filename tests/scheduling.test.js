const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initialState, saveTask, completeTask, snoozeTask, dueTasks, Store } = require('../src/core');
// node --test runs each file in its own process, so changing TZ here does not leak into other tests.
const originalTZ = process.env.TZ;
after(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; });

test('daily and weekly repeats keep their local hour across DST changes', () => {
  // [zone, day before the change] for spring-forward and fall-back in two regions.
  for (const [zone, y, m, d] of [['America/New_York', 2026, 2, 7], ['America/New_York', 2026, 9, 31], ['Europe/Berlin', 2026, 2, 28], ['Europe/Berlin', 2026, 9, 24]]) {
    process.env.TZ = zone;
    const s = initialState();
    const daily = saveTask(s, { title: 'daily', dueAt: new Date(y, m, d, 9).toISOString(), repeat: 'daily' });
    completeTask(s, daily.id, new Date(y, m, d, 9, 5));
    const next = new Date(daily.dueAt);
    assert.deepEqual([next.getDate(), next.getHours(), next.getMinutes()], [new Date(y, m, d + 1).getDate(), 9, 0], `${zone} daily`);
    const weekly = saveTask(s, { title: 'weekly', dueAt: new Date(y, m, d - 3, 9).toISOString(), repeat: 'weekly' });
    completeTask(s, weekly.id, new Date(y, m, d + 2, 9, 5));
    const week = new Date(weekly.dueAt);
    assert.deepEqual([week.getDate(), week.getDay(), week.getHours()], [new Date(y, m, d + 4).getDate(), new Date(y, m, d - 3).getDay(), 9], `${zone} weekly`);
  }
});

test('a daily repeat missed for days across a DST change alerts once and resumes at the same local time', () => {
  process.env.TZ = 'Europe/Berlin';
  const s = initialState();
  const t = saveTask(s, { title: 'دواء', dueAt: new Date(2026, 9, 20, 8, 30).toISOString(), repeat: 'daily' });
  const back = new Date(2026, 9, 30, 12);
  assert.equal(dueTasks(s, back).length, 1, 'Ten missed days produce one alert, not ten');
  completeTask(s, t.id, back);
  const next = new Date(t.dueAt);
  assert.deepEqual([next.getDate(), next.getHours(), next.getMinutes()], [31, 8, 30]);
  assert.equal(dueTasks(s, back).length, 0);
});

test('one-time reminders are fixed instants: a time-zone change or a clock set backwards never loses them', () => {
  process.env.TZ = 'Asia/Baghdad';
  const s = initialState();
  const t = saveTask(s, { title: 'اجتماع', dueAt: new Date(2026, 9, 24, 15).toISOString() });
  const instant = Date.parse(t.dueAt);
  process.env.TZ = 'Asia/Dubai';
  assert.equal(new Date(t.dueAt).getHours(), 16, 'Shown in the new local time');
  assert.equal(dueTasks(s, new Date(instant - 1)).length, 0);
  assert.equal(dueTasks(s, new Date(instant)).length, 1);
  // The user corrects a clock that ran an hour fast: the alert waits for the real time instead of vanishing.
  assert.equal(dueTasks(s, new Date(instant - 3600000)).length, 0);
  assert.equal(dueTasks(s, new Date(instant + 1)).length, 1);
});

test('twenty reminders in the same minute are all queued, in creation order, and none is dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-burst-'));
  try {
    const store = new Store(dir);
    const due = '2026-10-24T09:00:00.000Z';
    store.change(s => { for (let i = 1; i <= 20; i++) saveTask(s, { title: `تذكير ${i}`, dueAt: due }); });
    const now = new Date('2026-10-24T09:00:30Z');
    assert.deepEqual(dueTasks(store.state, now).map(t => t.title), Array.from({ length: 20 }, (_, i) => `تذكير ${i + 1}`));
    const handled = [];
    for (let left = 20; left > 0; left--) {
      const [first] = dueTasks(store.state, now);
      handled.push(first.title);
      if (left % 2) store.change(s => completeTask(s, first.id, now));
      else store.change(s => snoozeTask(s, first.id, '2026-10-24T10:00:00.000Z', now));
      assert.equal(dueTasks(store.state, now).length, left - 1);
    }
    assert.equal(new Set(handled).size, 20);
    assert.equal(dueTasks(new Store(dir).state, new Date('2026-10-24T10:00:00Z')).length, 10, 'Snoozed reminders return after a restart');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a day with the app closed brings back every missed reminder once, and the scan stays fast with thousands of tasks', () => {
  const s = initialState();
  for (let i = 0; i < 50; i++) saveTask(s, { title: `daily ${i}`, dueAt: new Date(Date.UTC(2026, 9, 23, 6, i)).toISOString(), repeat: 'daily' });
  for (let i = 0; i < 50; i++) saveTask(s, { title: `once ${i}`, dueAt: new Date(Date.UTC(2026, 9, 23, 7, i)).toISOString() });
  for (let i = 0; i < 5000; i++) saveTask(s, { title: `future ${i}`, dueAt: new Date(Date.UTC(2027, 0, 1, 0, i)).toISOString() });
  const next = new Date('2026-10-24T12:00:00Z');
  const started = performance.now();
  for (let i = 0; i < 10; i++) dueTasks(s, next);
  assert.ok(performance.now() - started < 500, 'Ten scans over 5100 tasks must not block the main process');
  const missed = dueTasks(s, next);
  assert.equal(missed.length, 100);
  assert.ok(missed.every((t, i) => !i || Date.parse(missed[i - 1].dueAt) <= Date.parse(t.dueAt)), 'Oldest first');
  for (const t of missed) completeTask(s, t.id, next);
  assert.equal(dueTasks(s, next).length, 0);
  assert.equal(s.tasks.filter(t => t.completedAt).length, 100, 'One history entry per handled reminder');
  assert.ok(s.tasks.filter(t => t.repeat === 'daily').every(t => Date.parse(t.dueAt) > next.getTime()));
});

test('an unanswered alert beeps again on the chosen interval, at most 6 times, and stops once handled', () => {
  const { createRepeatBeep, MAX_REPEATS } = require('../src/repeat-beep');
  const { validateState } = require('../src/core');
  let now = 0, start = 0, beeps = [];
  const update = createRepeatBeep(() => beeps.push((now - start) / 60000), () => now);
  const phase = () => { start = now; beeps = []; };
  const run = (minutes, id = 'a', interval = 2) => { for (let i = 0; i < minutes * 60; i++) { update(id, interval); now += 1000; } };
  run(30);
  assert.deepEqual(beeps, [2, 4, 6, 8, 10, 12], 'Every 2 minutes after the first sound, then silent');
  assert.equal(MAX_REPEATS, 6);
  phase(); update(null, 2); run(5);
  assert.deepEqual(beeps, [2, 4], 'A completed or snoozed alert starts over for the next one');
  phase(); run(5, 'b');
  assert.deepEqual(beeps, [2, 4], 'The next reminder in the queue gets its own count');
  phase(); run(20, 'c', 0);
  assert.deepEqual(beeps, [], 'Off means no repeats');
  phase(); run(3, 'c', 5); update('d', 5); run(6, 'd', 5);
  assert.deepEqual(beeps, [5 + 3], 'Acting on the alert restarts the wait');
  const state = { version: 1, tasks: [], notes: [], settings: { remindAgain: 7 } };
  assert.equal(validateState(state).settings.remindAgain, 0, 'Bad values become Off');
  assert.equal(validateState({ version: 1, tasks: [], notes: [], settings: { remindAgain: 15 } }).settings.remindAgain, 15);
  assert.equal(validateState({ version: 1, tasks: [], notes: [] }).settings.remindAgain, undefined, 'Older data stays as it was and means Off');
});
