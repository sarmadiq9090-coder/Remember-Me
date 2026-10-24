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

test('monthly and yearly repeats keep their day, clamping to short months without drifting', () => {
  process.env.TZ = 'Asia/Baghdad';
  const s = initialState();
  const monthly = saveTask(s, { title: 'إيجار', dueAt: new Date(2027, 0, 31, 9).toISOString(), repeat: 'monthly' });
  const seen = [];
  for (let i = 0; i < 4; i++) { completeTask(s, monthly.id, new Date(monthly.dueAt)); const d = new Date(monthly.dueAt); seen.push(`${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}`); }
  assert.deepEqual(seen, ['2/28 9', '3/31 9', '4/30 9', '5/31 9']);
  const yearly = saveTask(s, { title: 'ميلاد', dueAt: new Date(2028, 1, 29, 8).toISOString(), repeat: 'yearly' });
  const years = [];
  for (let i = 0; i < 4; i++) { completeTask(s, yearly.id, new Date(yearly.dueAt)); const d = new Date(yearly.dueAt); years.push(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); }
  assert.deepEqual(years, ['2029-2-28', '2030-2-28', '2031-2-28', '2032-2-29']);
  // Fourteen months with the app closed: one alert, then the next 31st-or-last-day after today.
  const late = saveTask(s, { title: 'late', dueAt: new Date(2026, 0, 31, 9).toISOString(), repeat: 'monthly' });
  const back = new Date(2027, 2, 15, 12);
  assert.equal(dueTasks(s, back).filter(t => t.id === late.id).length, 1);
  completeTask(s, late.id, back);
  assert.equal(new Date(late.dueAt).toDateString(), new Date(2027, 2, 31).toDateString());
});

test('chosen weekdays, workdays and every-N-days repeats skip the right days', () => {
  process.env.TZ = 'Asia/Baghdad';
  const s = initialState();
  // Sunday–Thursday working week: Thursday's reminder comes back on Sunday.
  const work = saveTask(s, { title: 'دوام', dueAt: new Date(2026, 9, 22, 9).toISOString(), repeat: 'days', repeatDays: [4, 0, 1, 2, 3, 3, 9] });
  assert.deepEqual(work.repeatDays, [0, 1, 2, 3, 4], 'Days are de-duplicated, validated and sorted');
  completeTask(s, work.id, new Date(2026, 9, 22, 9, 5));
  assert.deepEqual([new Date(work.dueAt).getDay(), new Date(work.dueAt).getDate(), new Date(work.dueAt).getHours()], [0, 25, 9]);
  const gym = saveTask(s, { title: 'رياضة', dueAt: new Date(2026, 0, 5, 18).toISOString(), repeat: 'days', repeatDays: [1, 3] });
  completeTask(s, gym.id, new Date(2026, 9, 24, 12));  // Saturday, months later
  assert.deepEqual([new Date(gym.dueAt).getDay(), new Date(gym.dueAt).getDate(), new Date(gym.dueAt).getHours()], [1, 26, 18]);
  const water = saveTask(s, { title: 'سقي النبات', dueAt: new Date(2026, 9, 1, 7).toISOString(), repeat: 'interval', repeatEvery: 3 });
  completeTask(s, water.id, new Date(2026, 9, 24, 8));
  assert.equal(new Date(water.dueAt).getDate(), 25, 'Oct 1 + 3n: the first after the 24th is the 25th');
  assert.equal(saveTask(s, { title: 'x', dueAt: water.dueAt, repeat: 'interval', repeatEvery: 900 }).repeatEvery, 365);
  assert.equal(saveTask(s, { title: 'y', dueAt: work.dueAt, repeat: 'days', repeatDays: 'bad' }).repeatDays[0], 0, 'Falls back to the due weekday');
});

test('repeat rules stay consistent when a task is edited, completed or loaded', () => {
  const { validateState } = require('../src/core');
  process.env.TZ = 'Europe/Berlin';
  const s = initialState();
  const t = saveTask(s, { title: 'r', dueAt: new Date(2026, 2, 15, 9).toISOString(), repeat: 'monthly' });
  assert.equal(t.repeatFrom, t.dueAt);
  saveTask(s, { ...t, dueAt: new Date(2026, 2, 20, 9).toISOString() });
  assert.equal(t.repeatFrom, t.dueAt, 'A new date restarts the monthly count');
  saveTask(s, { ...t, repeat: 'daily' });
  assert.ok(!('repeatFrom' in t) && !('repeatDays' in t) && !('repeatEvery' in t), 'Daily tasks carry no rule fields');
  saveTask(s, { ...t, repeat: 'monthly' });
  completeTask(s, t.id, new Date(2026, 2, 20, 9, 30));
  const history = s.tasks.find(x => x.completedAt);
  assert.ok(!('repeatFrom' in history), 'History copies are plain one-time tasks');
  assert.equal(new Date(t.dueAt).getHours(), 9, 'Monthly keeps the hour across the March DST change');
  const loaded = validateState(JSON.parse(JSON.stringify({ ...s, tasks: [{ ...t, repeat: 'days', repeatDays: [] }, { ...t, id: 'b', repeat: 'interval', repeatEvery: 'x' }] })));
  assert.deepEqual(loaded.tasks[0].repeatDays, [new Date(t.dueAt).getDay()]);
  assert.ok(!('repeatFrom' in loaded.tasks[0]));
  assert.equal(loaded.tasks[1].repeatEvery, 2);
});
