const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { checkRequest, fromPage, ALERT_ACTIONS } = require('../src/ipc');

test('requests are limited to known actions, the alert window to its own subset', () => {
  assert.deepEqual(checkRequest('state'), {});
  assert.deepEqual(checkRequest('saveTask', { title: 'x' }), { title: 'x' });
  for (const action of [undefined, 42, '__proto__', 'constructor', 'toString', 'deleteEverything']) assert.throws(() => checkRequest(action), /Unknown action/);
  for (const action of ALERT_ACTIONS) assert.doesNotThrow(() => checkRequest(action, { id: 'a' }, { fromAlert: true }));
  for (const action of ['saveTask', 'deleteTask', 'settings', 'export', 'attachFiles', 'dataFolder']) assert.throws(() => checkRequest(action, { id: 'a' }, { fromAlert: true }), /not allowed/);
  assert.throws(() => checkRequest('saveTask', {}, { fromAlert: true}), /Request not allowed/);
});

test('payloads must be plain objects and item IDs short strings', () => {
  for (const payload of ['text', 7, true, [1]]) assert.throws(() => checkRequest('settings', payload), /Invalid request data/);
  for (const id of [undefined, '', 5, { toString: () => 'x' }, 'x'.repeat(101)]) assert.throws(() => checkRequest('deleteTask', { id }), /Invalid item ID/);
  assert.doesNotThrow(() => checkRequest('complete', { id: '__preview' }));
  assert.doesNotThrow(() => checkRequest('saveNote', { title: 'new note' }), 'Creating an item needs no ID');
  assert.throws(() => checkRequest('saveNote', { id: 9, title: 'x' }), /Invalid item ID/);
});

test('only the window’s own bundled page may call the main process', () => {
  const ui = path.join(__dirname, '..', 'ui');
  const index = path.join(ui, 'index.html');
  assert.equal(fromPage(pathToFileURL(index).href, index), true);
  assert.equal(fromPage(pathToFileURL(index).href + '#today', index), true, 'In-page anchors keep the same page');
  assert.equal(fromPage(pathToFileURL(index).href.toUpperCase().replace('FILE:', 'file:'), index), true, 'Windows paths are case-insensitive');
  const unusual = path.join('C:', 'Users', 'سيف محمد', 'Apps', 'ذكرني #1', 'ui', 'index.html');
  assert.equal(fromPage(pathToFileURL(unusual).href, unusual), true, 'Arabic names, spaces and # in the install path');
  assert.equal(fromPage(pathToFileURL(path.join(ui, 'alert.html')).href, index), false);
  for (const url of [undefined, '', 'about:blank', 'https://example.com/ui/index.html', 'devtools://devtools/bundled/index.html', 'not a url']) assert.equal(fromPage(url, index), false, String(url));
});

test('Done and snooze may carry the due time the user saw, and nothing else in its place', () => {
  assert.doesNotThrow(() => checkRequest('complete', { id: 'a', expectedDueAt: '2026-10-23T09:00:00.000Z' }, { fromAlert: true }));
  assert.doesNotThrow(() => checkRequest('snooze', { id: 'a', until: '2026-10-23T10:00:00.000Z', expectedDueAt: null }));
  assert.doesNotThrow(() => checkRequest('complete', { id: 'a' }), 'Older callers send no expected time');
  for (const expectedDueAt of ['soon', 5, {}, [], true, '2026-10-23T09:00:00.000Z'.repeat(3)]) {
    assert.throws(() => checkRequest('complete', { id: 'a', expectedDueAt }), /Invalid time/, String(expectedDueAt));
    assert.throws(() => checkRequest('snooze', { id: 'a', expectedDueAt }, {}), /Invalid time/);
  }
});
