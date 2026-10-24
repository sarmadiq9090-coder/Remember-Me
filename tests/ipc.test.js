const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { checkRequest, fromPage, ALERT_ACTIONS } = require('../src/ipc');

test('requests are limited to known actions, the alert window to its own subset', () => {
  assert.deepEqual(checkRequest('state'), {});
  assert.deepEqual(checkRequest('saveTask', { title: 'x' }), { title: 'x' });
  for (const action of [undefined, 42, '__proto__', 'constructor', 'toString', 'deleteEverything']) assert.throws(() => checkRequest(action), /غير معروف/);
  for (const action of ALERT_ACTIONS) assert.doesNotThrow(() => checkRequest(action, { id: 'a' }, { fromAlert: true }));
  for (const action of ['saveTask', 'deleteTask', 'settings', 'export', 'attachFiles', 'dataFolder']) assert.throws(() => checkRequest(action, { id: 'a' }, { fromAlert: true }), /غير مسموح/);
  assert.throws(() => checkRequest('saveTask', {}, { fromAlert: true, text: (ar, en) => en }), /Request not allowed/);
});

test('payloads must be plain objects and item IDs short strings', () => {
  for (const payload of ['text', 7, true, [1]]) assert.throws(() => checkRequest('settings', payload), /بيانات الطلب/);
  for (const id of [undefined, '', 5, { toString: () => 'x' }, 'x'.repeat(101)]) assert.throws(() => checkRequest('deleteTask', { id }), /معرّف/);
  assert.doesNotThrow(() => checkRequest('complete', { id: '__preview' }));
  assert.doesNotThrow(() => checkRequest('saveNote', { title: 'new note' }), 'Creating an item needs no ID');
  assert.throws(() => checkRequest('saveNote', { id: 9, title: 'x' }), /معرّف/);
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
