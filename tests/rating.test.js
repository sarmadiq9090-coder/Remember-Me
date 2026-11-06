const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ratingDue, RATING_REMINDERS } = require('../ui/lib/rating');
const { createHandlers } = require('../src/main/handlers');
const { checkRequest } = require('../src/main/ipc');
const { Store } = require('../src/core/store');
const { initialState, validateState, saveTask, completeTask } = require('../src/core/tasks');
const { MACHINE_SETTINGS } = require('../src/data/backups');

const reminder = (n, extra = {}) => ({ id: 'r' + n, title: 'Task ' + n, dueAt: '2026-11-03T09:00:00.000Z', completedAt: null, ...extra });
const view = (tasks, { windowsStore = true, ratingAsked } = {}) => ({ windowsStore, tasks, settings: ratingAsked === undefined ? {} : { ratingAsked } });

test('the Store version asks for a rating after a first reminder is done, or five are set, and never twice', () => {
  assert.equal(RATING_REMINDERS, 5);
  assert.equal(ratingDue(view([])), false);
  assert.equal(ratingDue(view([reminder(1), reminder(2), reminder(3), reminder(4)])), false, 'Four reminders are not yet a success');
  assert.equal(ratingDue(view([1, 2, 3, 4, 5].map(n => reminder(n)))), true, 'Five reminders set');
  assert.equal(ratingDue(view([reminder(1, { completedAt: '2026-11-03T09:01:00.000Z' })])), true, 'A first reminder done');
  assert.equal(ratingDue(view([1, 2, 3, 4, 5, 6].map(n => ({ ...reminder(n), dueAt: null })))), false, 'Tasks without a reminder do not count');
  assert.equal(ratingDue(view([{ ...reminder(1), dueAt: null, completedAt: '2026-11-03T09:01:00.000Z' }])), false, 'Nor does completing one');
  assert.equal(ratingDue(view([1, 2, 3, 4, 5].map(n => reminder(n, { deletedAt: '2026-11-03T10:00:00.000Z' })))), false, 'Deleted ones do not count');
  assert.equal(ratingDue(view([reminder(1, { completedAt: 'x' })], { windowsStore: false })), false, 'Never outside the Store version');
  assert.equal(ratingDue(view([reminder(1, { completedAt: 'x' })], { ratingAsked: true })), false, 'Asked once: never again');
  assert.equal(ratingDue(null), false);
});

test('either answer is saved, so the request never comes back; only "rate" opens the Store review page', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-rating-'));
  const opened = [];
  const ctx = { electron: {}, tr: text => text, windowsStore: true, store: new Store(dir), openStoreLink: async url => { opened.push(url); } };
  const { ratingPrompt } = createHandlers(ctx);
  assert.equal(ratingPrompt.readOnly, undefined, 'It saves data');
  await ratingPrompt.run({ choice: 'later' });
  assert.equal(ctx.store.state.settings.ratingAsked, true);
  assert.deepEqual(opened, [], 'Not now opens nothing');
  assert.equal(new Store(dir).state.settings.ratingAsked, true, 'Kept after a restart');
  await ratingPrompt.run({ choice: 'rate' });
  assert.deepEqual(opened, ['ms-windows-store://review/?ProductId=9NGB1F7T7JGN']);
  ctx.windowsStore = false;
  await assert.rejects(ratingPrompt.run({ choice: 'rate' }), /only the Microsoft Store version/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the rating answer is checked, comes only from the main window, and survives a restore', () => {
  for (const choice of ['rate', 'later']) assert.deepEqual(checkRequest('ratingPrompt', { choice }), { choice });
  for (const choice of [undefined, 'never', 5, 'ms-windows-store://review/?ProductId=x']) assert.throws(() => checkRequest('ratingPrompt', { choice }), /Invalid request data/, String(choice));
  assert.throws(() => checkRequest('ratingPrompt', { choice: 'rate' }, { fromAlert: true }), /Request not allowed/);
  assert.throws(() => checkRequest('ratingPrompt', { choice: 'rate' }, { fromQuickAdd: true }), /Request not allowed/);
  assert.ok(MACHINE_SETTINGS.includes('ratingAsked'), 'A restored backup does not ask again');
  assert.ok(!('ratingAsked' in initialState().settings), 'Absent until answered');
  assert.equal(validateState({ ...initialState(), settings: { ratingAsked: true } }).settings.ratingAsked, true);
  for (const value of [false, 'yes', 1, null]) assert.ok(!('ratingAsked' in validateState({ ...initialState(), settings: { ratingAsked: value } }).settings), String(value));
  const state = initialState(); const task = saveTask(state, { title: 'Call', dueAt: '2026-11-03T09:00:00.000Z' }); completeTask(state, task.id);
  assert.equal(ratingDue({ windowsStore: true, tasks: state.tasks, settings: state.settings }), true, 'A real completed reminder counts');
});

test('"More from FastKiwi" opens the publisher page in the Store; other About links stay https', async () => {
  const opened = [], browsed = [];
  const ctx = { electron: { shell: { openExternal: async url => { browsed.push(url); } } }, tr: text => text, openStoreLink: async url => { opened.push(url); } };
  const { openLink } = createHandlers(ctx);
  assert.deepEqual(checkRequest('openLink', { link: 'moreApps' }), { link: 'moreApps' });
  assert.throws(() => checkRequest('openLink', { link: 'rate' }), /Unknown link/, 'The rating page opens only through the rating request');
  await openLink.run({ link: 'moreApps' });
  await openLink.run({ link: 'support' });
  assert.deepEqual(opened, ['ms-windows-store://publisher/?name=FastKiwi']);
  assert.deepEqual(browsed, ['https://fastkiwi.app/support/']);
});
