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
  for (const action of ['saveTask', 'deleteTask', 'settings', 'export', 'attachFiles', 'dataFolder', 'updateConsent', 'checkUpdates', 'installUpdate']) assert.throws(() => checkRequest(action, { id: 'a' }, { fromAlert: true }), /غير مسموح/);
  assert.throws(() => checkRequest('saveTask', {}, { fromAlert: true, text: (ar, en) => en }), /Request not allowed/);
});

test('payloads must be plain objects and item IDs short strings', () => {
  for (const payload of ['text', 7, true, [1]]) assert.throws(() => checkRequest('settings', payload), /بيانات الطلب/);
  for (const id of [undefined, '', 5, { toString: () => 'x' }, 'x'.repeat(101)]) assert.throws(() => checkRequest('deleteTask', { id }), /معرّف/);
  assert.doesNotThrow(() => checkRequest('complete', { id: '__preview' }));
  assert.doesNotThrow(() => checkRequest('saveNote', { title: 'new note' }), 'Creating an item needs no ID');
  assert.throws(() => checkRequest('saveNote', { id: 9, title: 'x' }), /معرّف/);
  assert.doesNotThrow(() => checkRequest('updateConsent', { enabled: false }));
  for (const enabled of [undefined, null, 'true', 1]) assert.throws(() => checkRequest('updateConsent', { enabled }), /بيانات الطلب/);
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
    assert.throws(() => checkRequest('complete', { id: 'a', expectedDueAt }), /موعد/, String(expectedDueAt));
    assert.throws(() => checkRequest('snooze', { id: 'a', expectedDueAt }, { text: (ar, en) => en }), /Invalid time/);
  }
});

test('skip is allowed from the alert, needs an ID and validates the expected time', () => {
  assert.ok(ALERT_ACTIONS.has('skip'));
  assert.doesNotThrow(() => checkRequest('skip', { id: 'a', expectedDueAt: '2026-10-23T09:00:00.000Z' }, { fromAlert: true }));
  assert.throws(() => checkRequest('skip', {}, { fromAlert: true }), /معرّف/);
  assert.throws(() => checkRequest('skip', { id: 'a', expectedDueAt: 'later' }), /موعد/);
});

test('openLink takes a link ID from the fixed list, never a URL, and not from the alert', () => {
  for (const link of ['github', 'repo', 'releases', 'issues', 'privacy', 'license']) assert.deepEqual(checkRequest('openLink', { link }), { link });
  for (const link of [undefined, null, '', 'https://github.com/sarmadiq9090-coder', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', '__proto__', 'constructor', 'toString', 'GITHUB', ['github'], { toString: () => 'github' }, 7]) {
    assert.throws(() => checkRequest('openLink', { link }), /رابط غير معروف/, String(link));
  }
  assert.throws(() => checkRequest('openLink', { link: 'mailto:x' }, { text: (ar, en) => en }), /Unknown link/);
  assert.throws(() => checkRequest('openLink', { link: 'github' }, { fromAlert: true }), /غير مسموح/);
  assert.throws(() => checkRequest('copyDiagnostics', {}, { fromAlert: true }), /غير مسموح/);
});
