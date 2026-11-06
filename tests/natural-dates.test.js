const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseWhen } = require('../src/core/natural-dates');
const { createHandlers } = require('../src/main/handlers');
const { initialState } = require('../src/core/tasks');

// Monday 9 November 2026, 10:00 local time. Settings' week starts on Saturday (the default).
const MONDAY = new Date(2026, 10, 9, 10, 0);
const FRIDAY = new Date(2026, 10, 13, 10, 0);
const local = iso => { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const read = (text, { now = MONDAY, weekStart = 6 } = {}) => {
  const r = parseWhen(text, { now, weekStart });
  return r && { ...r, due: r.dueAt && local(r.dueAt), choices: r.options.map(local) };
};
// One phrase understood for certain: the title left, the time, and the repeat.
function certain(text, due, { title, repeat = 'none', ...options } = {}) {
  const r = read(text, options);
  assert.ok(r, `${text}: not understood`);
  assert.equal(r.ask, null, `${text}: asked ${r.ask} (${r.choices.join(', ')})`);
  assert.equal(r.due, due, text);
  assert.equal(r.repeat, repeat, `${text}: repeat`);
  if (title !== undefined) assert.equal(r.title, title, `${text}: title`);
  return r;
}
// One phrase that must be asked about, never guessed: no dueAt, and these choices.
function asks(text, ask, choices, options = {}) {
  const r = read(text, options);
  assert.ok(r, `${text}: not understood`);
  assert.equal(r.dueAt, null, `${text}: guessed ${r.due}`);
  assert.equal(r.ask, ask, `${text}: ask`);
  assert.deepEqual(r.choices, choices, text);
  return r;
}

test('Arabic: the phrases people type, in Iraqi, Gulf, Levantine and standard Arabic', () => {
  certain('اتصل بأمي بكرة ٥ العصر', '2026-11-10 17:00', { title: 'اتصل بأمي' });
  certain('اتصل بأمي بكرة 5 العصر', '2026-11-10 17:00', { title: 'اتصل بأمي' });
  certain('باچر الصبح', '2026-11-10 09:00', { title: 'باچر الصبح' });
  certain('باجر الصبح', '2026-11-10 09:00');
  certain('بكرا الضهر', '2026-11-10 12:00');
  certain('باكر العصر', '2026-11-10 16:00');
  certain('غداً ٣ الظهر', '2026-11-10 15:00');
  certain('بُكرة ٧ مساءً', '2026-11-10 19:00');
  certain('بعد ساعتين', '2026-11-09 12:00');
  certain('بعد ساعة', '2026-11-09 11:00');
  certain('بعد نص ساعة', '2026-11-09 10:30');
  certain('بعد ربع ساعة', '2026-11-09 10:15');
  certain('بعد ساعة ونص', '2026-11-09 11:30');
  certain('بعد ٣ ساعات', '2026-11-09 13:00');
  certain('كمان ١٠ دقايق', '2026-11-09 10:10');
  certain('تذكير بعد ٥ دقائق', '2026-11-09 10:05', { title: 'تذكير' });
  certain('بعد بكرة ٩ الصبح', '2026-11-11 09:00');
  certain('عقب باچر العصر', '2026-11-11 16:00');
  certain('بعد غد ٨ صباحاً', '2026-11-11 08:00');
  certain('بعد ٣ أيام', '2026-11-12 10:00');
  certain('بعد يومين ٤ العصر', '2026-11-11 16:00');
  certain('بعد أسبوع', '2026-11-16 10:00');
  certain('بعد شهر', '2026-12-09 10:00');
  certain('اليوم المغرب', '2026-11-09 18:00');
  certain('الليلة', '2026-11-09 21:00');
  certain('هالليلة ١٠', '2026-11-09 22:00');
  certain('اليوم ٥', '2026-11-09 17:00', { title: 'اليوم ٥' });
  certain('الاجتماع الساعة ١٧', '2026-11-09 17:00', { title: 'الاجتماع' });
  certain('عشا مع سامي الجمعة ٧:٣٠ م', '2026-11-13 19:30', { title: 'عشا مع سامي' });
  certain('الساعة خمسة ونص العصر', '2026-11-09 17:30');
  certain('الساعة الخامسة مساءً', '2026-11-09 17:00');
  certain('عالساعة ٤ إلا ربع العصر', '2026-11-09 15:45');
  certain('موعد الطبيب يوم الأربعاء ١١ الصبح', '2026-11-11 11:00', { title: 'موعد الطبيب' });
  certain('هالجمعة ١٠ الصبح', '2026-11-13 10:00');
  certain('الجمعة هذي ١٠ الصبح', '2026-11-13 10:00');
  certain('الخميس من الأسبوع الجاي ٥ العصر', '2026-11-19 17:00');
  certain('بكرة الفجر', '2026-11-10 05:00');
  certain('السبت ٨ بالليل', '2026-11-14 20:00');
  certain('دوا ٩ مساءً', '2026-11-09 21:00', { title: 'دوا' });
});

test('Arabic-Indic, Persian and Western digits all count, and diacritics and letter forms do not matter', () => {
  for (const text of ['بكرة ٥ العصر', 'بكرة ۵ العصر', 'بكرة 5 العصر', 'بُكْرَة ٥ العَصر', 'بكره ٥ العصر', 'بكرة ٥ العـــصر']) certain(text, '2026-11-10 17:00');
  certain('بكرة ١٠:٣٠ الصبح', '2026-11-10 10:30');
  certain('بكرة ١٠٫٣٠ الصبح', '2026-11-10 10:30');
});

test('Arabic repeats: every day, every Thursday, some days of the week, every few days', () => {
  certain('كل يوم ٧ الصبح', '2026-11-10 07:00', { repeat: 'daily', title: 'كل يوم ٧ الصبح' });
  certain('دوا كل يوم الساعة ٢٠:٠٠', '2026-11-09 20:00', { repeat: 'daily', title: 'دوا' });
  certain('رياضة يومياً ٦ المسا', '2026-11-09 18:00', { repeat: 'daily', title: 'رياضة' });
  certain('كل صباح', '2026-11-10 09:00', { repeat: 'daily' });
  certain('كل ليلة ١٠', '2026-11-09 22:00', { repeat: 'daily' });
  certain('كل خميس ٨ بالليل', '2026-11-12 20:00', { repeat: 'weekly' });
  certain('كل يوم جمعة ١١ الصبح', '2026-11-13 11:00', { repeat: 'weekly' });
  certain('كل اثنين ٩ الصبح', '2026-11-16 09:00', { repeat: 'weekly' }); // today's 9:00 has passed
  const days = certain('كل اثنين وخميس ٦ المسا', '2026-11-09 18:00', { repeat: 'days' });
  assert.deepEqual(days.repeatDays, [1, 4]);
  const every = certain('كل ثلاثة أيام ٩ الصبح', '2026-11-10 09:00', { repeat: 'interval' });
  assert.equal(every.repeatEvery, 3, '«ثلاثة» is a count here, not Tuesday («الثلاثاء»)');
  assert.equal(certain('كل يومين ٨ الصبح', '2026-11-10 08:00', { repeat: 'interval' }).repeatEvery, 2);
  certain('كل شهر ١٠ الصبح', '2026-11-10 10:00', { repeat: 'monthly' });
  certain('كل سنة ٩ الصبح', '2026-11-10 09:00', { repeat: 'yearly' });
});

test('Arabic: what could mean two things is asked, never guessed', () => {
  asks('بكرة ٥', 'meridiem', ['2026-11-10 05:00', '2026-11-10 17:00']);
  asks('الاجتماع الساعة ٣', 'meridiem', ['2026-11-09 15:00', '2026-11-10 03:00']);
  asks('بكرة الساعة ١٢', 'meridiem', ['2026-11-10 00:00', '2026-11-10 12:00']);
  // On Monday, with the week starting on Saturday, "next Thursday" can be this Thursday or the one after.
  asks('الخميس الجاي ٨ بالليل', 'day', ['2026-11-12 20:00', '2026-11-19 20:00']);
  asks('الخميس الياي ٨ بالليل', 'day', ['2026-11-12 20:00', '2026-11-19 20:00']);
  // A weekday that is today: today or a week from today.
  asks('الاثنين ٨ المسا', 'day', ['2026-11-09 20:00', '2026-11-16 20:00']);
  // A night hour after a named day: early that morning, or the night after it.
  asks('الأحد ٢ بالليل', 'day', ['2026-11-15 02:00', '2026-11-16 02:00']);
  asks('بكرة نص الليل', 'day', ['2026-11-10 00:00', '2026-11-11 00:00']);
  // A day without a time.
  asks('بعد بكرة', 'time', ['2026-11-11 09:00', '2026-11-11 12:00', '2026-11-11 18:00']);
  asks('الخميس الجاي', 'choose', ['2026-11-12 09:00', '2026-11-12 18:00', '2026-11-19 09:00', '2026-11-19 18:00']);
  const kept = asks('اشتري ٥ كيلو رز بكرة', 'time', ['2026-11-10 09:00', '2026-11-10 12:00', '2026-11-10 18:00']);
  assert.equal(kept.title, 'اشتري ٥ كيلو رز', 'A number that is not a time stays in the title');
  // A time already gone today offers tomorrow instead.
  asks('اليوم ٩ الصبح', 'past', ['2026-11-10 09:00']);
  asks('اليوم المغرب', 'past', ['2026-11-10 18:00'], { now: new Date(2026, 10, 9, 20, 0) });
});

test('Arabic: the first day of the week in Settings decides when "next Thursday" is clear', () => {
  // Friday 13: with Saturday first, next Thursday (the 19th) is in next week, so there is nothing to ask.
  certain('الخميس الجاي ٨ بالليل', '2026-11-19 20:00', { now: FRIDAY, weekStart: 6 });
  // With Sunday or Monday first, Thursday the 19th is still in next week from Friday.
  certain('الخميس الجاي ٨ بالليل', '2026-11-19 20:00', { now: FRIDAY, weekStart: 1 });
  // On Monday, with Sunday first, this Thursday is in the same week: ask.
  asks('الخميس الجاي ٨ بالليل', 'day', ['2026-11-12 20:00', '2026-11-19 20:00'], { weekStart: 0 });
  // Sunday 15, with Monday first: Saturday 21 is in the same week as Sunday 15? No: the week ends on Sunday.
  certain('السبت الجاي ١٠ الصبح', '2026-11-21 10:00', { now: new Date(2026, 10, 15, 10, 0), weekStart: 1 });
  asks('السبت الجاي ١٠ الصبح', 'day', ['2026-11-21 10:00', '2026-11-28 10:00'], { now: new Date(2026, 10, 15, 10, 0), weekStart: 0 });
});

test('Arabic: titles without a date, and past days, are left alone', () => {
  for (const text of ['قراءة عشر صفحات', 'غداء مع العائلة', 'اشتري ٥ كيلو رز', 'مراجعة خطة الأسبوع', 'الخميس الماضي', 'ست الحبايب', 'ساعة يد جديدة', 'اتصل بأحمد']) {
    assert.equal(read(text), null, text);
  }
});

test('English: tomorrow 5pm, in 2 hours, next Thursday 8pm, every day 7am', () => {
  certain('call mom tomorrow 5pm', '2026-11-10 17:00', { title: 'call mom' });
  certain('Call mom tomorrow at 5 pm', '2026-11-10 17:00', { title: 'Call mom' });
  certain('in 2 hours', '2026-11-09 12:00');
  certain('stretch in 30 minutes', '2026-11-09 10:30', { title: 'stretch' });
  certain('next Thursday 8pm', '2026-11-19 20:00', { now: FRIDAY });
  certain('every day 7am', '2026-11-10 07:00', { repeat: 'daily' });
  certain('Take pills daily at 21:00', '2026-11-09 21:00', { repeat: 'daily', title: 'Take pills' });
  certain('at 17:30', '2026-11-09 17:30');
  certain('at 07:30', '2026-11-10 07:30');
  certain('dinner 8 in the evening', '2026-11-09 20:00', { title: 'dinner' });
  certain('tonight', '2026-11-09 21:00');
  certain('tonight at 8', '2026-11-09 20:00');
  certain('tomorrow morning', '2026-11-10 09:00');
  certain('tomorrow noon', '2026-11-10 12:00');
  certain('this thursday 5pm', '2026-11-12 17:00');
  certain('thursday next week 5pm', '2026-11-19 17:00');
  certain('in 3 days', '2026-11-12 10:00');
  certain('in 2 days at 4pm', '2026-11-11 16:00');
  certain('Nov 20 3pm', '2026-11-20 15:00');
  const days = certain('gym every monday and thursday 7pm', '2026-11-09 19:00', { repeat: 'days', title: 'gym' });
  assert.deepEqual(days.repeatDays, [1, 4]);
  assert.deepEqual(certain('standup weekdays 9:30am', '2026-11-10 09:30', { repeat: 'days', title: 'standup' }).repeatDays, [1, 2, 3, 4, 5]);
  certain('every friday 6pm', '2026-11-13 18:00', { repeat: 'weekly' });
  assert.equal(certain('water plants every other day 6pm', '2026-11-09 18:00', { repeat: 'interval' }).repeatEvery, 2);
  assert.equal(certain('every 3 days at 8am', '2026-11-10 08:00', { repeat: 'interval' }).repeatEvery, 3);
  certain('every morning', '2026-11-10 09:00', { repeat: 'daily' });
  certain('monthly at 9am', '2026-11-10 09:00', { repeat: 'monthly' });
});

test('English: AM or PM, this week or next, and a missing time are asked', () => {
  asks('tomorrow at 5', 'meridiem', ['2026-11-10 05:00', '2026-11-10 17:00']);
  asks('at 7:30', 'meridiem', ['2026-11-09 19:30', '2026-11-10 07:30']);
  asks('next Thursday 8pm', 'day', ['2026-11-12 20:00', '2026-11-19 20:00']);
  asks('Thursday', 'time', ['2026-11-12 09:00', '2026-11-12 12:00', '2026-11-12 18:00']);
  const rent = asks('pay rent next week', 'time', ['2026-11-16 09:00', '2026-11-16 12:00', '2026-11-16 18:00']);
  assert.equal(rent.title, 'pay rent');
  asks('meeting on friday', 'time', ['2026-11-13 09:00', '2026-11-13 12:00', '2026-11-13 18:00']);
  asks('today 9am', 'past', ['2026-11-10 09:00']);
  asks('every day', 'time', ['2026-11-09 12:00', '2026-11-09 18:00', '2026-11-10 09:00']);
});

test('English: ordinary words are not dates', () => {
  for (const text of ['I sat down', 'March numbers', 'read chapter 5', 'buy 2 apples', 'may report', 'Wed photos', 'Sun cream', 'now']) assert.equal(read(text), null, text);
});

test('every answer is in the future, in order, and either certain or a question', () => {
  const phrases = ['بكرة ٥', 'بكرة ٥ العصر', 'الخميس الجاي', 'كل يوم', 'اليوم ٩ الصبح', 'بعد ساعتين', 'الأحد ٢ بالليل', 'tomorrow at 5', 'next Thursday', 'every monday', 'tonight', 'at 12'];
  for (const now of [MONDAY, FRIDAY, new Date(2026, 10, 9, 23, 50), new Date(2026, 11, 31, 23, 30)]) {
    for (const text of phrases) {
      const r = parseWhen(text, { now });
      assert.ok(r, text);
      assert.ok(r.options.length >= 1 && r.options.length <= 4, `${text}: ${r.options.length} options`);
      assert.ok(r.options.every(o => Date.parse(o) > now.getTime()), `${text}: an option in the past`);
      assert.deepEqual([...r.options].sort(), r.options, `${text}: options in order`);
      assert.equal(r.ask === null, r.dueAt !== null, `${text}: ask and dueAt`);
      if (r.dueAt) assert.deepEqual(r.options, [r.dueAt]);
    }
  }
});

test('the phrase is cut from the title, with the words left hanging; a title that is only a date stays whole', () => {
  assert.equal(read('Call mom at tomorrow 5pm')?.title, 'Call mom');
  assert.equal(read('موعد الطبيب في بكرة ٥ العصر').title, 'موعد الطبيب');
  assert.equal(read('بكرة ٥ العصر: اجتماع الفريق').title, 'اجتماع الفريق');
  assert.equal(read('اتصل بكرة ٥ العصر بسامي').title, 'اتصل بسامي');
  assert.equal(read('tomorrow 5pm').title, 'tomorrow 5pm');
  assert.equal(parseWhen('', { now: MONDAY }), null);
  assert.equal(parseWhen('   ', { now: MONDAY }), null);
  assert.equal(parseWhen(null, { now: MONDAY }), null);
});

test('the parseWhen action reads with the saved first day of the week, and quickAdd saves the repeat', () => {
  const ctx = { electron: {}, tr: text => text, store: { state: initialState(), change(fn) { return fn(this.state); } } };
  const handlers = createHandlers(ctx);
  assert.equal(handlers.parseWhen.readOnly, true);
  assert.equal(handlers.parseWhen.run({ text: 'buy milk' }), null);
  const when = handlers.parseWhen.run({ text: 'دوا كل يوم الساعة ٢٠:٠٠' });
  assert.equal(when.title, 'دوا'); assert.equal(when.repeat, 'daily'); assert.equal(new Date(when.dueAt).getHours(), 20);
  ctx.store.state.settings.weekStart = 1;
  assert.ok(handlers.parseWhen.run({ text: 'next Thursday 8pm' }).options.length >= 1);
  handlers.quickAdd.run({ title: 'دوا', dueAt: when.dueAt, repeat: 'daily' });
  handlers.quickAdd.run({ title: 'gym', dueAt: '2026-11-09T19:00:00.000Z', repeat: 'days', repeatDays: [1, 4] });
  handlers.quickAdd.run({ title: 'plants', dueAt: '2026-11-09T18:00:00.000Z', repeat: 'interval', repeatEvery: 2 });
  const [pills, gym, plants] = ctx.store.state.tasks;
  assert.equal(pills.repeat, 'daily'); assert.equal(pills.repeatFrom, when.dueAt);
  assert.deepEqual(gym.repeatDays, [1, 4]);
  assert.equal(plants.repeatEvery, 2);
  assert.throws(() => handlers.quickAdd.run({ title: 'x', repeat: 'daily' }), /Set a time/);
});
