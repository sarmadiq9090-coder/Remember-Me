const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { refreshLoginItem } = require('../src/login-item');
const dir = 'C:\\Users\\me\\AppData\\Local\\Programs\\ذكرني - Remember Me';
const exe = path.join(dir, 'Remember Me.exe'), old = path.join(dir, 'Waqt.exe');

// The HKCU Run key and Task Manager's StartupApproved flags, as Electron reads and writes them on Windows.
function fakeApp(entries) {
  const run = new Map(entries.map(e => [e.name, { path: e.path, args: e.args || ['--background'], enabled: e.enabled ?? true }]));
  return {
    run,
    getLoginItemSettings({ path: lookup }) {
      const launchItems = [...run].filter(([, v]) => v.path.toLowerCase() === lookup.toLowerCase()).map(([name, v]) => ({ name, ...v, scope: 'user' }));
      return { openAtLogin: launchItems.length > 0, launchItems };
    },
    setLoginItemSettings({ openAtLogin, path: target, args = [], name = 'com.waqt.reminder', enabled = true }) {
      if (openAtLogin) run.set(name, { path: target, args, enabled });
      else run.delete(name);
    },
  };
}

test('start with Windows moves from Waqt.exe to Remember Me.exe', () => {
  const app = fakeApp([{ name: 'com.waqt.reminder', path: old }, { name: 'OneDrive', path: 'C:\\OneDrive.exe', args: ['/background'] }]);
  refreshLoginItem(app, exe);
  assert.deepEqual(Object.fromEntries(app.run), {
    'com.waqt.reminder': { path: exe, args: ['--background'], enabled: true },
    OneDrive: { path: 'C:\\OneDrive.exe', args: ['/background'], enabled: true },
  });
});

test('a stale Waqt.exe entry under another name is removed, and a disabled entry stays disabled', () => {
  const app = fakeApp([{ name: 'electron.app.ذكرني', path: old, enabled: false }]);
  refreshLoginItem(app, exe);
  assert.deepEqual(Object.fromEntries(app.run), { 'com.waqt.reminder': { path: exe, args: ['--background'], enabled: false } });
});

test('re-registering an up-to-date entry changes nothing', () => {
  const app = fakeApp([{ name: 'com.waqt.reminder', path: exe }]);
  refreshLoginItem(app, exe);
  refreshLoginItem(app, exe);
  assert.deepEqual(Object.fromEntries(app.run), { 'com.waqt.reminder': { path: exe, args: ['--background'], enabled: true } });
});
