const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PAGE_PREFERENCES, secureContents, isHttpsUrl, httpsShell } = require('../src/main/web-security');
const root = path.join(__dirname, '..');

test('every page denies new windows, navigation in any frame, redirects and webviews', () => {
  const contents = new EventEmitter();
  contents.setWindowOpenHandler = handler => { contents.openHandler = handler; };
  secureContents(contents);
  assert.deepEqual(contents.openHandler({ url: 'https://example.com' }), { action: 'deny' });
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    let prevented = false;
    contents.emit(name, { preventDefault: () => { prevented = true; } }, 'https://example.com');
    assert.ok(prevented, name);
  }
  // Applied to each webContents as it is created, so every window, now or added later, is covered.
  const index = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8');
  assert.match(index, /app\.on\('web-contents-created', \(event, contents\) => secureContents\(contents\)\)/);
});

test('every window stays sandboxed and context-isolated, with the strict CSP in its page', () => {
  const windows = fs.readFileSync(path.join(root, 'src/main/windows.js'), 'utf8');
  assert.deepEqual({ ...PAGE_PREFERENCES }, { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false });
  assert.ok(Object.isFrozen(PAGE_PREFERENCES));
  assert.match(windows, /preload: path\.join\(__dirname, 'preload\.js'\), \.\.\.PAGE_PREFERENCES,/);
  assert.doesNotMatch(windows, /spellcheck: true|contextIsolation: false|sandbox: false|nodeIntegration: true/);
  const created = [...windows.matchAll(/new BrowserWindow\(\{[\s\S]*?\}\);/g)].map(m => m[0]);
  assert.ok(created.length >= 2);
  for (const call of created) assert.match(call, /webPreferences: options\(\)/);
  for (const page of fs.readdirSync(path.join(root, 'ui')).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, 'ui', page), 'utf8');
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"/, page);
  }
});

test('spellcheck is off, so Chromium never downloads Hunspell dictionaries from Google', () => {
  assert.equal(PAGE_PREFERENCES.spellcheck, false);
  const index = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8');
  assert.match(index, /session\.defaultSession\.setSpellCheckerEnabled\(false\)/);
});

test('only https:// addresses open in the browser', async () => {
  for (const url of ['https://github.com/sarmadiq9090-coder/Remember-Me', 'https://www.google.com/drive/download/']) assert.ok(isHttpsUrl(url), url);
  for (const url of ['http://example.com', 'file:///C:/Windows/System32/calc.exe', 'ms-settings:', '\\\\server\\share', 'github.com', '', undefined, 5]) assert.equal(isHttpsUrl(url), false, String(url));
  const opened = [], paths = [];
  const shell = httpsShell({ openExternal: async url => { opened.push(url); }, openPath: async target => { paths.push(target); return ''; }, showItemInFolder: target => paths.push('show:' + target) });
  await shell.openExternal('https://github.com/');
  await assert.rejects(shell.openExternal('file:///C:/evil.exe'), /only https/);
  await assert.rejects(shell.openExternal('http://github.com/'), /only https/);
  assert.deepEqual(opened, ['https://github.com/']);
  assert.equal(await shell.openPath('C:\\data'), '');
  shell.showItemInFolder('C:\\data\\a.exe');
  assert.deepEqual(paths, ['C:\\data', 'show:C:\\data\\a.exe']);
});
