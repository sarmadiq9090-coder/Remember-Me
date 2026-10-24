const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { SNOOZE_PRESETS, snoozeTime, isOverdue, overdueAge, dueWhen, isShortcut, createInteractionGuard } = require('../ui/alert-format');
const originalTZ = process.env.TZ;
after(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; });

test('snooze presets land on the expected local times, and this evening is unavailable after 17:00', () => {
  process.env.TZ = 'Asia/Baghdad';
  assert.deepEqual(SNOOZE_PRESETS, ['10m', '1h', 'evening', 'tomorrow', 'week', 'pick']);
  const noon = new Date(2026, 9, 24, 12, 30);
  assert.equal(snoozeTime('10m', noon).getTime(), noon.getTime() + 600000);
  assert.equal(snoozeTime('1h', noon).getTime(), noon.getTime() + 3600000);
  assert.deepEqual([snoozeTime('evening', noon).getDate(), snoozeTime('evening', noon).getHours()], [24, 18]);
  assert.equal(snoozeTime('evening', new Date(2026, 9, 24, 16, 59)).getHours(), 18);
  assert.equal(snoozeTime('evening', new Date(2026, 9, 24, 17, 0)), null, 'Too close to the evening');
  assert.equal(snoozeTime('evening', new Date(2026, 9, 24, 23, 30)), null);
  const late = new Date(2026, 9, 24, 23, 30);
  assert.deepEqual([snoozeTime('tomorrow', late).getDate(), snoozeTime('tomorrow', late).getHours(), snoozeTime('tomorrow', late).getMinutes()], [25, 9, 0], 'Tomorrow 9 AM even late at night');
  const month = new Date(2026, 9, 31, 8);
  assert.deepEqual([snoozeTime('tomorrow', month).getMonth(), snoozeTime('tomorrow', month).getDate()], [10, 1], 'Across the end of the month');
  assert.equal(snoozeTime('week', noon).getDate(), 31);
  assert.equal(snoozeTime('pick', noon), null);
});

test('presets keep the wall-clock time across daylight-saving changes', () => {
  process.env.TZ = 'Europe/Berlin';
  const before = new Date(2026, 9, 24, 20, 15); // Saturday before clocks go back on 25 October
  const week = snoozeTime('week', before);
  assert.deepEqual([week.getDate(), week.getHours(), week.getMinutes()], [31, 20, 15]);
  assert.equal(week.getTime() - before.getTime(), 7 * 86400000 + 3600000, 'The week is an hour longer in real time');
  const tomorrow = snoozeTime('tomorrow', before);
  assert.deepEqual([tomorrow.getDate(), tomorrow.getHours()], [25, 9]);
  process.env.TZ = 'America/New_York';
  const spring = snoozeTime('tomorrow', new Date(2026, 2, 7, 22)); // clocks go forward on 8 March
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
  guard.key(key('Tab', 'Tab', true));
  assert.equal(guard.allows(enter), false, 'Nor does a held key');
  guard.key(key('Alt', 'AltLeft'));
  assert.equal(guard.allows(enter), true, 'Releasing Alt after Alt+Tab counts as the user arriving');
  assert.equal(guard.allows(key('Enter', 'Enter', true)), false, 'A held Enter never acts');
  guard.reset();
  assert.equal(guard.allows(enter), false, 'Losing focus starts over');
  guard.pointer();
  assert.equal(guard.allows(key('1', 'Digit1')), true, 'A click in the window engages it');
});
