const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createEarlyNotices } = require('../src/early-notices');

function setup(start = '2026-10-24T09:50:00Z', limit) {
  let now = Date.parse(start);
  const shown = [];
  const notices = createEarlyNotices({ clock: () => now, limit, show: task => { const n = new EventEmitter(); n.task = task; shown.push(n); return n; } });
  return { notices, shown, advance: ms => { now += ms; } };
}
const task = (id, dueAt) => ({ id, dueAt });

test('each task and due time is announced once, and a new due time is a new notice', () => {
  const { notices, shown } = setup();
  const t = task('a', '2026-10-24T10:00:00.000Z');
  notices.announce([t]); notices.announce([t]);
  assert.equal(shown.length, 1);
  notices.announce([task('a', '2026-10-25T10:00:00.000Z')]);
  assert.equal(shown.length, 2, 'The next occurrence of a repeat');
});

test('while paused notices are recorded but not shown, so resuming brings no burst', () => {
  const { notices, shown } = setup();
  const t = task('a', '2026-10-24T10:00:00.000Z');
  notices.announce([t], { silent: true });
  notices.announce([t]);
  assert.equal(shown.length, 0);
});

test('records and notifications are dropped once the due time has passed', () => {
  const { notices, advance } = setup();
  notices.announce([task('a', '2026-10-24T10:00:00.000Z'), task('b', '2026-10-24T11:00:00.000Z')]);
  assert.deepEqual(notices.size, { announced: 2, live: 2 });
  advance(10 * 60000);
  notices.announce([]);
  assert.deepEqual(notices.size, { announced: 1, live: 1 });
});

test('shown notifications stay referenced until closed or clicked, and at most a few are kept', () => {
  const { notices, shown } = setup('2026-10-24T09:00:00Z', 3);
  notices.announce([task('a', '2026-10-24T10:00:00.000Z'), task('b', '2026-10-24T10:00:00.000Z')]);
  shown[0].emit('click');
  shown[1].emit('close');
  assert.equal(notices.size.live, 0);
  notices.announce(['c', 'd', 'e', 'f', 'g'].map(id => task(id, '2026-10-24T10:00:00.000Z')));
  assert.equal(notices.size.live, 3, 'The oldest are let go beyond the limit');
});
