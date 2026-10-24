const { test } = require('node:test');
const assert = require('node:assert/strict');
const { UNTIL_RESUMED, pauseEnd, isPaused, shownAlerts, createPause } = require('../src/pause');
const { initialState, validateState } = require('../src/core');

// A pause controller over a fake settings store and clock.
function setup(start, saved = null) {
  let now = Date.parse(start), value = saved, writes = 0;
  const pause = createPause({ read: () => value, write: next => { value = next; writes++; }, clock: () => now });
  return { pause, advance: ms => { now += ms; }, get value() { return value; }, get writes() { return writes; } };
}

test('pausing for an hour holds reminders back until the hour is over, then clears itself', () => {
  const s = setup('2026-10-25T10:15:00.000Z');
  assert.equal(s.pause.check(), false, 'Not paused to begin with');
  s.pause.pause('hour');
  assert.equal(s.value, '2026-10-25T11:15:00.000Z');
  s.advance(3600000 - 1);
  assert.equal(s.pause.check(), true);
  s.advance(1);
  assert.equal(s.pause.check(), false);
  assert.equal(s.value, null, 'The ended pause is cleared from settings');
  const writes = s.writes;
  s.pause.check(); s.pause.resume();
  assert.equal(s.writes, writes, 'Nothing is saved again once it is cleared');
});

test('"until tomorrow" ends at 8:00 local time on the next day, also at month end', () => {
  const local = (y, m, d, h, min = 0) => new Date(y, m, d, h, min);
  assert.equal(pauseEnd('tomorrow', local(2026, 9, 25, 22, 30)), local(2026, 9, 26, 8).toISOString());
  assert.equal(pauseEnd('tomorrow', local(2026, 9, 31, 7, 0)), local(2026, 10, 1, 8).toISOString(), 'October 31 to November 1');
  assert.equal(pauseEnd('tomorrow', local(2026, 11, 31, 23, 59)), local(2027, 0, 1, 8).toISOString(), 'Across the new year');
  assert.throws(() => pauseEnd('forever'), /Unknown pause/);
});

test('a pause until resumed lasts until Resume, whatever the clock does', () => {
  const s = setup('2026-10-25T10:00:00.000Z');
  s.pause.pause('manual');
  assert.equal(s.value, UNTIL_RESUMED);
  s.advance(30 * 86400000);
  assert.equal(s.pause.check(), true);
  s.pause.resume();
  assert.equal(s.value, null);
  assert.equal(s.pause.check(), false);
});

test('a saved pause survives a restart, and one that ended while the app was closed is cleared', () => {
  const restarted = setup('2026-10-25T10:30:00.000Z', '2026-10-25T11:00:00.000Z');
  assert.equal(restarted.pause.check(), true);
  const late = setup('2026-10-25T12:00:00.000Z', '2026-10-25T11:00:00.000Z');
  assert.equal(late.pause.check(), false);
  assert.equal(late.value, null);
});

test('while paused no reminder alert is shown, but a preview the user asks for is', () => {
  const due = [{ id: 'a' }, { id: 'b' }], preview = [{ id: '__preview' }];
  assert.deepEqual(shownAlerts(due, true), []);
  assert.deepEqual(shownAlerts(due, false), due, 'They are still due and appear when the pause ends');
  assert.deepEqual(shownAlerts(preview, true), preview);
  assert.equal(isPaused(null), false);
  assert.equal(isPaused('2026-10-25T11:00:00.000Z', Date.parse('2026-10-25T10:00:00.000Z')), true);
});

test('settings.pausedUntil is null, an ISO time or "manual"; anything else means no pause', () => {
  assert.equal(initialState().settings.pausedUntil, null);
  const saved = pausedUntil => validateState({ ...initialState(), settings: { pausedUntil } }).settings.pausedUntil;
  assert.equal(saved(undefined), null, 'Data from before the pause existed');
  assert.equal(saved('manual'), 'manual');
  assert.equal(saved('2026-10-25T11:00:00Z'), '2026-10-25T11:00:00.000Z');
  for (const value of ['tomorrow', 'not a date', 42, true, {}, []]) assert.equal(saved(value), null, String(value));
});
