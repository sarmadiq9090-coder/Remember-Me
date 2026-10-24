const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initialState, saveTask, completeTask, snoozeTask, dueTasks } = require('../src/core/tasks');
const { Store } = require('../src/core/store');
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
  const { createRepeatBeep, MAX_REPEATS } = require('../src/core/repeat-beep');
  const { validateState } = require('../src/core/tasks');
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
  const { validateState } = require('../src/core/tasks');
  process.env.TZ = 'Europe/Berlin';
  const s = initialState();
  const t = saveTask(s, { title: 'r', dueAt: new Date(2026, 2, 15, 9).toISOString(), repeat: 'monthly' });
  assert.equal(t.repeatFrom, t.dueAt);
  saveTask(s, { ...t, dueAt: new Date(2026, 2, 20, 9).toISOString() });
  assert.equal(t.repeatFrom, t.dueAt, 'A new date restarts the monthly count');
  saveTask(s, { ...t, repeat: 'daily' });
  assert.ok(!('repeatDays' in t) && !('repeatEvery' in t), 'Daily tasks carry no monthly, weekday or interval fields');
  assert.equal(t.repeatFrom, t.dueAt, 'Every repeat keeps the anchor its time of day comes from');
  saveTask(s, { ...t, repeat: 'monthly' });
  completeTask(s, t.id, new Date(2026, 2, 20, 9, 30));
  const history = s.tasks.find(x => x.completedAt);
  assert.ok(!('repeatFrom' in history), 'History copies are plain one-time tasks');
  assert.equal(new Date(t.dueAt).getHours(), 9, 'Monthly keeps the hour across the March DST change');
  const loaded = validateState(JSON.parse(JSON.stringify({ ...s, tasks: [{ ...t, repeat: 'days', repeatDays: [] }, { ...t, id: 'b', repeat: 'interval', repeatEvery: 'x' }] })));
  assert.deepEqual(loaded.tasks[0].repeatDays, [new Date(t.dueAt).getDay()]);
  assert.equal(loaded.tasks[0].repeatFrom, t.repeatFrom, 'A valid anchor is kept when the mode changes on load');
  assert.equal(loaded.tasks[1].repeatEvery, 2);
});

test('early notifications start at the chosen lead time and stop at the due time', () => {
  const { upcomingTasks, validateState } = require('../src/core/tasks');
  process.env.TZ = 'Asia/Baghdad';
  const s = initialState();
  const t = saveTask(s, { title: 'اجتماع', dueAt: '2026-10-24T10:00:00.000Z', remindBefore: 10 }, new Date('2026-10-24T08:00:00Z'));
  assert.equal(t.remindBefore, 10);
  assert.equal(upcomingTasks(s, new Date('2026-10-24T09:49:59Z')).length, 0);
  assert.equal(upcomingTasks(s, new Date('2026-10-24T09:50:00Z')).length, 1);
  assert.equal(upcomingTasks(s, new Date('2026-10-24T10:00:00Z')).length, 0, 'At the due time the sticky alert takes over');
  assert.ok(!('remindBefore' in saveTask(s, { title: 'بلا', dueAt: '2026-10-24T10:00:00.000Z', remindBefore: 7 })), 'Only offered lead times are kept');
  assert.ok(!('remindBefore' in saveTask(s, { title: 'بلا موعد', remindBefore: 10 })), 'No due time, no early notification');
  saveTask(s, { ...t, remindBefore: 0 });
  assert.ok(!('remindBefore' in t));
  const daily = saveTask(s, { title: 'يومي', dueAt: '2026-10-24T10:00:00.000Z', repeat: 'daily', remindBefore: 60 });
  completeTask(s, daily.id, new Date('2026-10-24T10:05:00Z'));
  assert.equal(upcomingTasks(s, new Date('2026-10-25T09:00:00Z')).map(x => x.title).join(), 'يومي', 'The next occurrence keeps its lead time');
  assert.ok(!('remindBefore' in validateState({ ...initialState(), tasks: [{ ...t, remindBefore: 'soon' }] }).tasks[0]));
});

test('no early notice for a time just moved into the lead window by a snooze, a late Done or an edit', () => {
  const { upcomingTasks, snoozeTask, skipOccurrence } = require('../src/core/tasks');
  const s = initialState();
  const at = iso => new Date(iso);
  const t = saveTask(s, { title: 'Call', dueAt: '2026-10-24T10:00:00.000Z', remindBefore: 15 }, at('2026-10-24T08:00:00Z'));
  assert.equal(upcomingTasks(s, at('2026-10-24T09:45:00Z')).length, 1, 'The notice still comes at its time');
  assert.equal(upcomingTasks(s, at('2026-10-24T09:58:00Z')).length, 1, 'and on a start inside the lead window');
  // At 10:00 the alert appears; snoozing 5 minutes moves it to 10:05, inside the 15-minute window.
  snoozeTask(s, t.id, '2026-10-24T10:05:00.000Z', at('2026-10-24T10:00:01Z'));
  assert.equal(upcomingTasks(s, at('2026-10-24T10:00:02Z')).length, 0, 'No "Coming up" right after the snooze');
  // A snooze longer than the lead time gets its notice again.
  snoozeTask(s, t.id, '2026-10-24T11:00:00.000Z', at('2026-10-24T10:05:01Z'));
  assert.equal(upcomingTasks(s, at('2026-10-24T10:44:59Z')).length, 0);
  assert.equal(upcomingTasks(s, at('2026-10-24T10:45:00Z')).length, 1);
  // A daily task with a 1-day notice, completed late: tomorrow's notice moment has already passed.
  const daily = saveTask(s, { title: 'Daily', dueAt: '2026-10-24T10:00:00.000Z', repeat: 'daily', remindBefore: 1440 }, at('2026-10-23T08:00:00Z'));
  completeTask(s, daily.id, at('2026-10-24T11:00:00Z'));
  assert.ok(!upcomingTasks(s, at('2026-10-24T11:00:01Z')).some(x => x.id === daily.id));
  skipOccurrence(s, daily.id, daily.dueAt, at('2026-10-24T12:00:00Z'));
  assert.ok(!upcomingTasks(s, at('2026-10-24T12:00:01Z')).some(x => x.id === daily.id), 'Skipping one occurrence neither');
  // An edit that moves the time into the window.
  const edited = saveTask(s, { title: 'Moved', dueAt: '2026-10-24T15:00:00.000Z', remindBefore: 30 }, at('2026-10-24T08:00:00Z'));
  saveTask(s, { ...edited, dueAt: '2026-10-24T14:10:00.000Z' }, at('2026-10-24T14:00:00Z'));
  assert.ok(!upcomingTasks(s, at('2026-10-24T14:00:01Z')).some(x => x.id === edited.id));
});

test('skip and only-this-time follow every repeat mode, and skip ignores trashed tasks', () => {
  const { skipOccurrence, trashItem } = require('../src/core/tasks');
  process.env.TZ = 'Asia/Baghdad';
  const s = initialState();
  const rent = saveTask(s, { title: 'rent', dueAt: new Date(2027, 0, 31, 9).toISOString(), repeat: 'monthly' });
  assert.equal(skipOccurrence(s, rent.id, rent.dueAt, new Date(2027, 0, 31, 8)), true);
  assert.equal(new Date(rent.dueAt).toDateString(), new Date(2027, 1, 28).toDateString(), 'January 31 skips to February 28');
  skipOccurrence(s, rent.id, rent.dueAt, new Date(2027, 1, 28, 8));
  assert.equal(new Date(rent.dueAt).toDateString(), new Date(2027, 2, 31).toDateString(), 'and back to the 31st, without drifting');
  assert.equal(s.tasks.filter(t => t.completedAt).length, 0);
  const work = saveTask(s, { title: 'work', dueAt: new Date(2026, 9, 22, 9).toISOString(), repeat: 'days', repeatDays: [0, 1, 2, 3, 4] });
  skipOccurrence(s, work.id, work.dueAt, new Date(2026, 9, 22, 8)); // Thursday
  assert.deepEqual([new Date(work.dueAt).getDay(), new Date(work.dueAt).getDate()], [0, 25], 'Thursday skips to Sunday');
  const water = saveTask(s, { title: 'water', dueAt: new Date(2026, 9, 1, 7).toISOString(), repeat: 'interval', repeatEvery: 3 });
  skipOccurrence(s, water.id, water.dueAt, new Date(2026, 9, 1, 6));
  assert.equal(new Date(water.dueAt).getDate(), 4);
  trashItem(s, 'tasks', water.id, new Date(2026, 9, 2));
  assert.throws(() => skipOccurrence(s, water.id, undefined, new Date(2026, 9, 2)), /repeating/, 'A trashed task cannot be skipped');

  // Moving one monthly occurrence keeps the series on its day and its monthly count.
  const bill = saveTask(s, { title: 'bill', dueAt: new Date(2027, 0, 31, 9).toISOString(), repeat: 'monthly' });
  saveTask(s, { ...bill, dueAt: new Date(2027, 1, 2, 9).toISOString(), onlyThisTime: true });
  assert.deepEqual([bill.dueAt, bill.scheduleAt, bill.repeatFrom], [new Date(2027, 1, 2, 9).toISOString(), new Date(2027, 0, 31, 9).toISOString(), new Date(2027, 0, 31, 9).toISOString()]);
  completeTask(s, bill.id, new Date(2027, 1, 2, 9, 5));
  assert.equal(new Date(bill.dueAt).toDateString(), new Date(2027, 1, 28).toDateString(), 'The next occurrence is the usual end-of-month one');
});

test('editing only the text of a monthly or yearly task keeps its anchor, even after a snooze', () => {
  process.env.TZ = 'Asia/Baghdad';
  const s = initialState();
  const editorSave = (task, changes) => saveTask(s, { id: task.id, title: task.title, body: task.body, priority: task.priority, dueAt: task.dueAt, repeat: task.repeat, attachments: task.attachments, ...changes });
  const rent = saveTask(s, { title: 'rent', dueAt: new Date(2027, 0, 31, 9).toISOString(), repeat: 'monthly' });
  completeTask(s, rent.id, new Date(2027, 0, 31, 9, 5));
  assert.equal(new Date(rent.dueAt).toDateString(), new Date(2027, 1, 28).toDateString());
  editorSave(rent, { title: 'rent, renamed in February' });
  assert.equal(rent.repeatFrom, new Date(2027, 0, 31, 9).toISOString());
  completeTask(s, rent.id, new Date(2027, 1, 28, 9, 5));
  assert.equal(new Date(rent.dueAt).toDateString(), new Date(2027, 2, 31).toDateString(), 'Back on the 31st, not the 28th');

  const bill = saveTask(s, { title: 'bill', dueAt: new Date(2027, 2, 15, 9).toISOString(), repeat: 'monthly' });
  snoozeTask(s, bill.id, new Date(2027, 2, 16, 10).toISOString(), new Date(2027, 2, 15, 9));
  editorSave(bill, { title: 'bill, typo fixed' });
  assert.equal(bill.repeatFrom, new Date(2027, 2, 15, 9).toISOString(), 'Not the snooze time');
  completeTask(s, bill.id, new Date(2027, 2, 16, 10, 5));
  assert.deepEqual([new Date(bill.dueAt).getDate(), new Date(bill.dueAt).getHours()], [15, 9]);

  const birthday = saveTask(s, { title: 'birthday', dueAt: new Date(2028, 1, 29, 8).toISOString(), repeat: 'yearly' });
  editorSave(birthday, { body: 'buy a gift' });
  const years = [];
  for (let i = 0; i < 4; i++) { completeTask(s, birthday.id, new Date(birthday.dueAt)); years.push(new Date(birthday.dueAt).getDate()); }
  assert.deepEqual(years, [28, 28, 28, 29], 'Feb 29 comes back in 2032');

  // A loaded monthly task without a valid repeatFrom counts from its series anchor, not a snoozed due time.
  const { validateState } = require('../src/core/tasks');
  const loaded = validateState(JSON.parse(JSON.stringify({ ...s, tasks: [{ ...bill, repeatFrom: 'broken', dueAt: new Date(2027, 3, 16, 10).toISOString() }] })));
  assert.equal(loaded.tasks[0].repeatFrom, bill.scheduleAt);
});

test('repeats return to their usual time after a daylight-saving gap', () => {
  const run = (zone, start, repeat, extra, count) => {
    process.env.TZ = zone;
    const s = initialState();
    const t = saveTask(s, { title: repeat, dueAt: start().toISOString(), repeat, ...extra });
    const seen = [];
    for (let i = 0; i < count; i++) { completeTask(s, t.id, new Date(Date.parse(t.dueAt) + 60000)); const d = new Date(t.dueAt); seen.push(`${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`); }
    return seen;
  };
  // Egypt moves from 00:00 to 01:00 on Friday, April 30 2027: 00:30 does not exist that night.
  assert.deepEqual(run('Africa/Cairo', () => new Date(2027, 3, 28, 0, 30), 'daily', {}, 4), ['4/29 0:30', '4/30 1:30', '5/1 0:30', '5/2 0:30']);
  assert.deepEqual(run('Africa/Cairo', () => new Date(2027, 3, 28, 0, 30), 'days', { repeatDays: [0, 1, 2, 3, 4, 5, 6] }, 4), ['4/29 0:30', '4/30 1:30', '5/1 0:30', '5/2 0:30']);
  // New York moves from 02:00 to 03:00 on Sunday, March 14 2027.
  assert.deepEqual(run('America/New_York', () => new Date(2027, 2, 13, 2, 30), 'daily', {}, 3), ['3/14 3:30', '3/15 2:30', '3/16 2:30']);
  assert.deepEqual(run('America/New_York', () => new Date(2027, 2, 7, 2, 30), 'weekly', {}, 2), ['3/14 3:30', '3/21 2:30']);
  assert.deepEqual(run('America/New_York', () => new Date(2027, 2, 12, 2, 30), 'interval', { repeatEvery: 2 }, 3), ['3/14 3:30', '3/16 2:30', '3/18 2:30']);
});

test('repeating tasks saved before v1.5 have no anchor and still repeat at their time', () => {
  const { validateState } = require('../src/core/tasks');
  process.env.TZ = 'Europe/Berlin';
  const old = { ...initialState(), tasks: [{ id: 'old', title: 'old daily', body: '', priority: 'normal', category: 'personal', dueAt: new Date(2026, 9, 20, 7).toISOString(), scheduleAt: new Date(2026, 9, 20, 7).toISOString(), repeat: 'daily', attachments: [], createdAt: new Date(2026, 9, 1).toISOString(), updatedAt: new Date(2026, 9, 1).toISOString(), completedAt: null, snoozedAt: null }] };
  const s = validateState(JSON.parse(JSON.stringify(old)));
  assert.ok(!('repeatFrom' in s.tasks[0]), 'Loading does not add fields');
  completeTask(s, 'old', new Date(2026, 9, 25, 12));
  assert.deepEqual([new Date(s.tasks[0].dueAt).getDate(), new Date(s.tasks[0].dueAt).getHours()], [26, 7]);
  saveTask(s, { ...s.tasks[0], title: 'renamed' });
  assert.equal(s.tasks[0].repeatFrom, s.tasks[0].scheduleAt, 'The first edit anchors it at its series time');
});
