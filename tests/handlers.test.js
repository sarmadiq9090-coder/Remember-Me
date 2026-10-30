const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../src/main/handlers');
const { ACTIONS, ALERT_ACTIONS } = require('../src/main/ipc');
const { DEFAULT_SNOOZE_PRESETS } = require('../ui/lib/alert-format');

// The handlers only read the context when an action runs, so a bare stub is enough to build them.
const stub = { electron: {}, tr: text => text };

test('every allowed IPC action has exactly one handler', () => {
  const handlers = createHandlers(stub);
  assert.deepEqual(Object.keys(handlers).sort(), [...ACTIONS].sort());
  for (const action of ALERT_ACTIONS) assert.ok(handlers[action], action);
  for (const [action, handler] of Object.entries(handlers)) assert.equal(typeof handler.run, 'function', action);
});

test('only actions that change nothing skip the rescan', () => {
  const readOnly = Object.entries(createHandlers(stub)).filter(([, handler]) => handler.readOnly).map(([action]) => action).sort();
  assert.deepEqual(readOnly, ['alerts', 'checkUpdates', 'copyDiagnostics', 'dataFolder', 'dismissUpdate', 'driveHelp', 'export', 'imagePreview', 'installUpdate',
    'language', 'locale', 'open', 'openAttachment', 'openDriveFolder', 'openLink', 'openLogs', 'relaunch', 'reportProblem', 'state', 'storage', 'undoable']);
});

// A context with a real state and a store whose change() applies the function, as Store does.
function liveContext() {
  const { initialState } = require('../src/core/tasks');
  const ctx = { ...stub, UNDO_MS: 6000, undoable: null, notified: 0, log: { info() {}, warn() {} } };
  ctx.store = { state: initialState(), change(fn) { return fn(this.state); } };
  ctx.windows = { notifyViews: () => { ctx.notified++; } };
  return ctx;
}

test("undoing another task from the main window keeps the alert's Undo working", () => {
  const { saveTask } = require('../src/core/tasks');
  const ctx = liveContext(), handlers = createHandlers(ctx);
  const a = saveTask(ctx.store.state, { title: 'A', dueAt: new Date(Date.now() - 60000).toISOString() });
  const b = saveTask(ctx.store.state, { title: 'B', dueAt: new Date(Date.now() - 60000).toISOString() });
  const doneA = handlers.complete.run({ id: a.id }, { fromAlert: true });
  const doneB = handlers.complete.run({ id: b.id }, { fromAlert: false });
  handlers.undoComplete.run(doneB, { fromAlert: false });
  assert.equal(ctx.undoable?.id, a.id, 'The alert can still undo A');
  handlers.undoComplete.run(doneA, { fromAlert: true });
  assert.equal(ctx.undoable, null);
  assert.ok(!a.completedAt && !b.completedAt);
  assert.throws(() => handlers.undoComplete.run(doneA, { fromAlert: true }), /too late/);
});

test('restoring an item the 30-day purge removed fails clearly, and the purge refreshes the windows', () => {
  const { saveTask, trashItem } = require('../src/core/tasks');
  const { createScheduler } = require('../src/main/scheduler');
  const ctx = liveContext(), handlers = createHandlers(ctx);
  const t = saveTask(ctx.store.state, { title: 'old' });
  trashItem(ctx.store.state, 'tasks', t.id, new Date(Date.now() - 31 * 86400000));
  createScheduler(ctx).purgeExpiredTrash();
  assert.equal(ctx.store.state.tasks.length, 0);
  assert.equal(ctx.notified, 1, 'An open Trash view is told to refresh');
  assert.throws(() => handlers.restoreTask.run({ id: t.id }), /no longer in the trash/);
  createScheduler(ctx).purgeExpiredTrash();
  assert.equal(ctx.notified, 1, 'Nothing to purge, nothing to refresh');
});

test('changing the language asks for a restart only when the native fields would change', () => {
  const ctx = liveContext();
  Object.assign(ctx, { controlsLocale: 'en-US', setLogin() {}, rebuildTrayMenu() {}, placeAlert() {}, applyTheme() {} });
  const { settings } = createHandlers(ctx);
  const save = language => settings.run({ ...ctx.store.state.settings, language });
  assert.deepEqual(save('fr'), { restart: true });
  assert.deepEqual(save('fr'), { restart: false }, 'Nothing changed');
  assert.deepEqual(save('en'), { restart: false }, 'Back to the locale the app started with');
  ctx.controlsLocale = 'en-GB';
  assert.deepEqual(save('ar'), { restart: false }, 'Arabic uses en-GB, already running');
});

test('the alert learns the first day of the week, so its repeat labels match the main window', () => {
  const ctx = { ...stub, language: () => 'en', store: { state: { settings: { palette: 'ocean', weekStart: 1 } } } };
  assert.deepEqual(createHandlers(ctx).language.run({}), { language: 'en', palette: 'ocean', weekStart: 1, snoozePresets: DEFAULT_SNOOZE_PRESETS });
});
