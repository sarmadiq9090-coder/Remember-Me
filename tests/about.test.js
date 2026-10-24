const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LINKS, linkUrl, windowsVersion, diagnostics } = require('../src/about');

test('every About link is an exact https address on the project’s GitHub', () => {
  assert.deepEqual([...LINKS.keys()].sort(), ['github', 'issues', 'license', 'privacy', 'releases', 'repo']);
  for (const url of LINKS.values()) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.host, 'github.com');
    assert.match(parsed.pathname, /^\/sarmadiq9090-coder(\/Remember-Me(\/|$)|$)/);
  }
  assert.equal(linkUrl('issues'), 'https://github.com/sarmadiq9090-coder/Remember-Me/issues/new/choose');
  assert.equal(linkUrl('privacy'), 'https://github.com/sarmadiq9090-coder/Remember-Me#privacy');
  for (const id of ['__proto__', 'constructor', 'https://example.com', undefined, 1]) assert.throws(() => linkUrl(id), /Unknown link/);
});

test('diagnostic info names versions and display settings, nothing about the user’s data', () => {
  const text = diagnostics({ version: '1.5.0', packaged: true, versions: { electron: '45.0.0', chrome: '142.0.0.0', node: '24.0.0' }, windows: '10.0.26200', arch: 'x64', language: 'ar', theme: 'dark' });
  assert.equal(text, 'Remember Me 1.5.0\nElectron 45.0.0 • Chromium 142.0.0.0 • Node 24.0.0\nWindows 11 (10.0.26200) x64\nUI language: ar\nTheme: dark');
  assert.equal(windowsVersion('10.0.19045'), '10 (10.0.19045)');
  assert.equal(windowsVersion('10.0.22000'), '11 (10.0.22000)');
  assert.equal(windowsVersion('6.3.9600'), '6.3 (6.3.9600)');
  assert.match(diagnostics({ version: '1.5.0', packaged: false, versions: {}, windows: '', arch: '', language: 'en', theme: 'system' }), /development build/);
});
