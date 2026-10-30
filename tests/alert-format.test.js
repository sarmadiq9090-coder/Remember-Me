const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SNOOZE_PRESETS, checkSnoozePreset, normalizeSnoozePresets, snoozeTime, snoozeCutoff, durationText, snoozePreview, isOverdue, overdueAge, overdueFor, dueWhen, isShortcut, createInteractionGuard } = require('../ui/lib/alert-format');
// The default choices by their v1.5.0 names.
const [TEN, HOUR, EVENING, TOMORROW, WEEK, PICK] = DEFAULT_SNOOZE_PRESETS;
const WESTERN = /^[^٠-٩۰-۹०-९]*$/u;
const originalTZ = process.env.TZ;
after(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; });

test('snooze presets land on the expected local times, and this evening is unavailable after 17:00', () => {
  process.env.TZ = 'Asia/Baghdad';
  assert.deepEqual(DEFAULT_SNOOZE_PRESETS, [{ kind: 'in', minutes: 10 }, { kind: 'in', minutes: 60 }, { kind: 'today', time: '18:00' }, { kind: 'tomorrow', time: '09:00' }, { kind: 'week' }, { kind: 'pick' }], 'The v1.5.0 choices');
  assert.ok(Object.isFrozen(DEFAULT_SNOOZE_PRESETS) && Object.isFrozen(TEN));
  const noon = new Date(2026, 9, 24, 12, 30);
  assert.equal(snoozeTime(TEN, noon).getTime(), noon.getTime() + 600000);
  assert.equal(snoozeTime(HOUR, noon).getTime(), noon.getTime() + 3600000);
  assert.deepEqual([snoozeTime(EVENING, noon).getDate(), snoozeTime(EVENING, noon).getHours()], [24, 18]);
  assert.equal(snoozeTime(EVENING, new Date(2026, 9, 24, 16, 59)).getHours(), 18);
  assert.equal(snoozeTime(EVENING, new Date(2026, 9, 24, 17, 0)), null, 'Too close to the evening');
  assert.equal(snoozeTime(EVENING, new Date(2026, 9, 24, 23, 30)), null);
  assert.deepEqual([snoozeCutoff(EVENING, noon).getHours(), snoozeCutoff(EVENING, noon).getMinutes()], [17, 0], 'Named in the tooltip once it is off');
  const late = new Date(2026, 9, 24, 23, 30);
  assert.deepEqual([snoozeTime(TOMORROW, late).getDate(), snoozeTime(TOMORROW, late).getHours(), snoozeTime(TOMORROW, late).getMinutes()], [25, 9, 0], 'Tomorrow 9 AM even late at night');
  const month = new Date(2026, 9, 31, 8);
  assert.deepEqual([snoozeTime(TOMORROW, month).getMonth(), snoozeTime(TOMORROW, month).getDate()], [10, 1], 'Across the end of the month');
  assert.equal(snoozeTime(WEEK, noon).getDate(), 31);
  assert.equal(snoozeTime(PICK, noon), null);
  assert.equal(snoozeTime(undefined, noon), null);
});

test('custom snooze choices: lengths, other times of day and whole days', () => {
  process.env.TZ = 'Asia/Baghdad';
  const noon = new Date(2026, 9, 24, 12, 30);
  assert.equal(snoozeTime({ kind: 'in', minutes: 45 }, noon).getTime(), noon.getTime() + 45 * 60000);
  assert.equal(snoozeTime({ kind: 'in', minutes: 180 }, noon).getTime(), noon.getTime() + 3 * 3600000);
  const lunch = snoozeTime({ kind: 'today', time: '13:45' }, noon);
  assert.deepEqual([lunch.getDate(), lunch.getHours(), lunch.getMinutes()], [24, 13, 45]);
  assert.equal(snoozeTime({ kind: 'today', time: '13:15' }, noon), null, 'Less than an hour away');
  assert.equal(snoozeTime({ kind: 'today', time: '08:00' }, noon), null, 'Already past');
  const early = snoozeTime({ kind: 'tomorrow', time: '06:30' }, noon);
  assert.deepEqual([early.getDate(), early.getHours(), early.getMinutes()], [25, 6, 30]);
  process.env.TZ = 'Europe/Berlin';
  const before = new Date(2026, 9, 24, 20, 15); // clocks go back on 25 October
  const twoDays = snoozeTime({ kind: 'in', minutes: 2 * 1440 }, before);
  assert.deepEqual([twoDays.getDate(), twoDays.getHours(), twoDays.getMinutes()], [26, 20, 15], 'Whole days keep the wall-clock time');
  assert.equal(snoozeTime({ kind: 'in', minutes: 1500 }, before).getTime(), before.getTime() + 1500 * 60000, 'Other lengths are exact');
});

test('saved snooze choices are validated: always six, and a bad slot gets its default', () => {
  assert.deepEqual(normalizeSnoozePresets(), DEFAULT_SNOOZE_PRESETS);
  for (const bad of [null, 'presets', {}, [], DEFAULT_SNOOZE_PRESETS.slice(0, 5), [...DEFAULT_SNOOZE_PRESETS, { kind: 'week' }]]) assert.deepEqual(normalizeSnoozePresets(bad), DEFAULT_SNOOZE_PRESETS, JSON.stringify(bad));
  const custom = [{ kind: 'in', minutes: 5 }, { kind: 'in', minutes: 120 }, { kind: 'today', time: '12:30' }, { kind: 'tomorrow', time: '07:00' }, { kind: 'in', minutes: 4320 }, { kind: 'pick' }];
  assert.deepEqual(normalizeSnoozePresets(custom), custom);
  assert.notEqual(normalizeSnoozePresets(custom)[0], custom[0], 'Copies, not the caller\'s objects');
  assert.deepEqual(normalizeSnoozePresets([{ kind: 'pick' }, { kind: 'pick' }, { kind: 'week' }, { kind: 'week' }, { kind: 'in', minutes: 1 }, { kind: 'in', minutes: 43200 }]).map(p => p.kind), ['pick', 'pick', 'week', 'week', 'in', 'in'], 'Repeats are allowed');
  const mixed = normalizeSnoozePresets([{ kind: 'in', minutes: 0 }, { kind: 'in', minutes: 43201 }, { kind: 'today', time: '24:00' }, { kind: 'tomorrow', time: '9:00' }, { kind: 'never' }, 'pick']);
  assert.deepEqual(mixed, DEFAULT_SNOOZE_PRESETS, 'Each invalid slot falls back to its own default');
  assert.deepEqual(normalizeSnoozePresets([, , , , , { kind: 'week' }]).map(p => p.kind), ['in', 'in', 'today', 'tomorrow', 'week', 'week'], 'Holes are invalid slots'); // eslint-disable-line no-sparse-arrays
  for (const bad of [{ kind: 'in', minutes: 2.5 }, { kind: 'in', minutes: '10' }, { kind: 'in' }, { kind: 'today' }, { kind: 'today', time: 1800 }, { kind: 'tomorrow', time: '09:60' }, { kind: 'toString' }, null, 7]) assert.equal(checkSnoozePreset(bad), null, JSON.stringify(bad));
  assert.deepEqual(checkSnoozePreset({ kind: 'week', minutes: 5, extra: true }), { kind: 'week' }, 'Unknown fields are dropped');
  assert.deepEqual(checkSnoozePreset({ kind: 'today', time: '23:59', minutes: 3 }), { kind: 'today', time: '23:59' });
});

test('snooze previews name the day and time each choice leads to, with Western digits', () => {
  process.env.TZ = 'Asia/Baghdad';
  const noon = new Date(2026, 9, 24, 12, 30); // Saturday
  const evening = snoozePreview(EVENING, noon, 'en-US');
  assert.equal(evening.day, 'Today');
  assert.match(evening.time, /^6:00\s+PM$/u);
  assert.equal(snoozePreview(TOMORROW, noon, 'en-US').day, 'Tomorrow', 'Capitalized: it starts the phrase');
  assert.equal(snoozePreview(EVENING, noon, 'en-GB').time, '18:00', '24-hour clock where the locale uses it');
  assert.equal(snoozePreview(TEN, noon, 'en-GB').time, '12:40');
  assert.equal(snoozePreview(TEN, new Date(2026, 9, 24, 23, 55), 'en-US').day, 'Tomorrow', 'Ten minutes before midnight lands tomorrow');
  assert.equal(snoozePreview(WEEK, noon, 'en-US').day, 'Sat, Oct 31');
  assert.equal(snoozePreview(PICK, noon, 'en-US'), null);
  assert.equal(snoozePreview(EVENING, new Date(2026, 9, 24, 17, 30), 'en-US'), null, 'No preview while unavailable');
  for (const intl of ['ar-IQ-u-nu-latn', 'hi-IN-u-nu-latn', 'fr-FR-u-nu-latn', 'zh-CN-u-nu-latn']) {
    const { day, time } = snoozePreview(EVENING, noon, intl);
    assert.ok(day && WESTERN.test(day + time) && /\d/.test(time), `${intl}: ${day} ${time}`);
  }
  assert.equal(snoozePreview(EVENING, noon, 'ar-IQ-u-nu-latn').day, 'اليوم');
  assert.equal(snoozePreview(EVENING, noon, 'fr-FR-u-nu-latn').day, 'Aujourd’hui');
});

test('lengths of time read naturally for snooze labels and overdue task rows', () => {
  process.env.TZ = 'Asia/Baghdad';
  assert.deepEqual([10, 60, 90, 120, 1440, 4320].map(m => durationText(m, 'en-US')), ['10 minutes', '1 hour', '90 minutes', '2 hours', '1 day', '3 days']);
  assert.equal(durationText(120, 'ar-IQ-u-nu-latn'), 'ساعتان');
  assert.match(durationText(10, 'ar-IQ-u-nu-latn'), /^10 /);
  const now = new Date(2026, 9, 24, 21, 0);
  const ago = minutes => new Date(now.getTime() - minutes * 60000).toISOString();
  assert.equal(overdueFor(ago(0.5), now, 'en-US'), '1 minute', 'Never "0 minutes"');
  assert.equal(overdueFor(ago(5), now, 'en-US'), '5 minutes');
  assert.equal(overdueFor(ago(59), now, 'en-US'), '59 minutes');
  assert.equal(overdueFor(ago(60), now, 'en-US'), '1 hour');
  assert.equal(overdueFor(ago(125), now, 'en-US'), '2 hours');
  assert.equal(overdueFor(ago(47 * 60), now, 'en-US'), '47 hours', 'Hours until two days');
  assert.equal(overdueFor(ago(4 * 24 * 60), now, 'en-US'), '4 days');
  assert.equal(overdueFor(new Date(now.getTime() + 60000).toISOString(), now, 'en-US'), '1 minute', 'Not yet due still reads sensibly');
  for (const intl of ['ar-IQ-u-nu-latn', 'hi-IN-u-nu-latn', 'ru-RU-u-nu-latn', 'ja-JP-u-nu-latn']) {
    const text = overdueFor(ago(26 * 60), now, intl);
    assert.ok(WESTERN.test(text) && text.includes('26'), `${intl}: ${text}`);
  }
});

test('presets keep the wall-clock time across daylight-saving changes', () => {
  process.env.TZ = 'Europe/Berlin';
  const before = new Date(2026, 9, 24, 20, 15); // Saturday before clocks go back on 25 October
  const week = snoozeTime(WEEK, before);
  assert.deepEqual([week.getDate(), week.getHours(), week.getMinutes()], [31, 20, 15]);
  assert.equal(week.getTime() - before.getTime(), 7 * 86400000 + 3600000, 'The week is an hour longer in real time');
  const tomorrow = snoozeTime(TOMORROW, before);
  assert.deepEqual([tomorrow.getDate(), tomorrow.getHours()], [25, 9]);
  process.env.TZ = 'America/New_York';
  const spring = snoozeTime(TOMORROW, new Date(2026, 2, 7, 22)); // clocks go forward on 8 March
  assert.deepEqual([spring.getDate(), spring.getHours()], [8, 9]);
});

test('overdue age and the due day read naturally in English and Arabic', () => {
  process.env.TZ = 'Asia/Baghdad';
  const now = new Date(2026, 9, 24, 21, 0);
  assert.equal(isOverdue(new Date(2026, 9, 24, 20, 59, 30).toISOString(), now), false, 'Under a minute late is just due');
  assert.equal(isOverdue(new Date(2026, 9, 24, 20, 59).toISOString(), now), true);
  assert.equal(isOverdue(null, now), false);
  const ago = minutes => new Date(now.getTime() - minutes * 60000).toISOString();
  assert.match(overdueAge(ago(5), now, 'en-US'), /^5 min/);
  assert.match(overdueAge(ago(26 * 60), now, 'en-US'), /^26 hr/);
  assert.equal(overdueAge(ago(4 * 24 * 60), now, 'en-US'), '4 days ago');
  assert.match(overdueAge(ago(26 * 60), now, 'ar-IQ-u-nu-latn'), /26/);
  const yesterday = dueWhen(new Date(2026, 9, 23, 20, 32).toISOString(), now, 'en-US');
  assert.equal(yesterday.day, 'yesterday');
  assert.match(yesterday.time, /^8:32\s+PM$/u);
  assert.equal(dueWhen(new Date(2026, 9, 24, 8, 0).toISOString(), now, 'en-US').day, 'today');
  assert.equal(dueWhen(new Date(2026, 9, 25, 8, 0).toISOString(), now, 'en-US').day, 'tomorrow');
  assert.equal(dueWhen(new Date(2026, 9, 20, 8, 0).toISOString(), now, 'en-US').day, 'Tue, Oct 20');
  assert.equal(dueWhen(new Date(2026, 9, 23, 20, 32).toISOString(), now, 'ar-IQ-u-nu-latn').day, 'أمس');
  assert.doesNotMatch(Object.values(dueWhen(new Date(2026, 9, 23, 20, 32).toISOString(), now, 'ar-IQ-u-nu-latn')).join(' '), /[٠-٩]/, 'Western digits');
});

test('alert shortcuts wait for the user to interact with the window, and held keys never act', () => {
  const key = (k, code = '', repeat = false) => ({ key: k, code, repeat });
  const enter = key('Enter', 'Enter');
  assert.ok(isShortcut(enter) && isShortcut(key(' ', 'Space')) && isShortcut(key('3', 'Digit3')) && isShortcut(key('3', 'Numpad3')) && isShortcut(key('s', 'KeyS')));
  assert.ok(!isShortcut(key('Tab', 'Tab')) && !isShortcut(key('7', 'Digit7')) && !isShortcut(key('ArrowLeft', 'ArrowLeft')) && !isShortcut(key('Alt', 'AltLeft')));
  const guard = createInteractionGuard();
  assert.equal(guard.allows(enter), false, 'Focus alone, as when the window appears, is not enough');
  guard.key(enter); guard.key(key('2', 'Digit2'));
  assert.equal(guard.allows(enter), false, 'Shortcut keys typed into the window do not engage it');
  for (const typed of [key('o', 'KeyO'), key('k', 'KeyK'), key('Shift', 'ShiftLeft'), key('Backspace', 'Backspace'), key('ت', 'KeyJ'), key('7', 'Digit7'), key('Control', 'ControlLeft')]) guard.key(typed);
  assert.equal(guard.allows(enter), false, 'Nor does text typed into it, such as "ok then"');
  guard.key(key('Tab', 'Tab', true));
  assert.equal(guard.allows(enter), false, 'Nor does a held key');
  guard.key(key('Alt', 'AltLeft'));
  assert.equal(guard.allows(enter), true, 'Releasing Alt after Alt+Tab counts as the user arriving');
  assert.equal(guard.allows(key('Enter', 'Enter', true)), false, 'A held Enter never acts');
  guard.reset();
  assert.equal(guard.allows(enter), false, 'Losing focus starts over');
  guard.pointer();
  assert.equal(guard.allows(key('1', 'Digit1')), true, 'A click in the window engages it');
  for (const nav of ['Tab', 'ArrowLeft', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'AltGraph']) {
    guard.reset(); guard.key(key(nav, nav));
    assert.equal(guard.allows(enter), true, nav);
  }
});
