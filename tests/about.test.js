const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LINKS, SUPPORT_EMAIL, linkUrl, windowsVersion, diagnostics } = require('../src/platform/about');
const SUPPORT_IDS = ['email', 'support', 'supportAr'];

test('every About link is an exact https address on the project’s GitHub, apart from Support', () => {
  assert.deepEqual([...LINKS.keys()].sort(), ['email', 'github', 'issues', 'license', 'privacy', 'releases', 'repo', 'support', 'supportAr']);
  for (const [id, url] of LINKS) {
    if (SUPPORT_IDS.includes(id)) continue;
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.host, 'github.com');
    assert.match(parsed.pathname, /^\/sarmadiq9090-coder(\/Remember-Me(\/|$)|$)/);
  }
  assert.equal(linkUrl('issues'), 'https://github.com/sarmadiq9090-coder/Remember-Me/issues/new/choose');
  assert.equal(linkUrl('privacy'), 'https://github.com/sarmadiq9090-coder/Remember-Me#privacy');
  for (const id of ['__proto__', 'constructor', 'https://example.com', undefined, 1]) assert.throws(() => linkUrl(id), /Unknown link/);
});

test('Support opens fastkiwi.app\'s support page, in Arabic for the Arabic interface, or an e-mail to support', () => {
  assert.equal(linkUrl('support'), 'https://fastkiwi.app/support/');
  assert.equal(linkUrl('supportAr'), 'https://fastkiwi.app/ar/support/');
  assert.equal(linkUrl('email'), 'mailto:support@fastkiwi.app');
  assert.equal(SUPPORT_EMAIL, linkUrl('email'));
  // The About card lists both, and sends supportAr in the Arabic interface.
  const fs = require('node:fs'), path = require('node:path');
  const card = fs.readFileSync(path.join(__dirname, '../ui/main/settings-cards.js'), 'utf8');
  for (const id of SUPPORT_IDS) assert.ok(card.includes(`'${id}'`), id);
});

test('diagnostic info names versions and display settings, nothing about the user’s data', () => {
  const text = diagnostics({ version: '1.5.0', packaged: true, versions: { electron: '45.0.0', chrome: '142.0.0.0', node: '24.0.0' }, windows: '10.0.26200', arch: 'x64', language: 'ar', theme: 'dark' });
  assert.equal(text, 'Remember Me 1.5.0\nElectron 45.0.0 • Chromium 142.0.0.0 • Node 24.0.0\nWindows 11 (10.0.26200) x64\nUI language: ar\nTheme: dark');
  assert.equal(windowsVersion('10.0.19045'), '10 (10.0.19045)');
  assert.equal(windowsVersion('10.0.22000'), '11 (10.0.22000)');
  assert.equal(windowsVersion('6.3.9600'), '6.3 (6.3.9600)');
  assert.match(diagnostics({ version: '1.5.0', packaged: false, versions: {}, windows: '', arch: '', language: 'en', theme: 'system' }), /development build/);
});
