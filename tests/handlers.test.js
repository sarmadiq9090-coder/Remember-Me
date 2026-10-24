const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../src/main/handlers');
const { ACTIONS, ALERT_ACTIONS } = require('../src/main/ipc');

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
    'language', 'locale', 'open', 'openAttachment', 'openDriveFolder', 'openLink', 'openLogs', 'state', 'storage', 'undoable']);
});
