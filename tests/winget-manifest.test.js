const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import('../tools/winget-manifest.mjs');
const docs = path.join(__dirname, '../docs/distribution/winget/1.5.0');

test('the installer hash comes from the matching SHA256SUMS.txt line', async () => {
  const { sha256From } = await load();
  const hash = 'ab'.repeat(32);
  const sums = `${'cd'.repeat(32)}  Remember-Me-Setup-1.4.0-x64.exe\n${hash}  Remember-Me-Setup-1.5.0-x64.exe\n`;
  assert.equal(sha256From(sums, '1.5.0'), hash.toUpperCase());
  assert.equal(sha256From(`${hash} *Remember-Me-Setup-1.5.0-x64.exe\r\n`, '1.5.0'), hash.toUpperCase(), 'Binary-mode and CRLF lines also count');
  assert.throws(() => sha256From(sums, '1.6.0'), /no line for Remember-Me-Setup-1\.6\.0-x64\.exe/);
});

test('the manifests point at the release installer as a per-user NSIS package', async () => {
  const { manifests, IDENTIFIER, PRODUCT_CODE } = await load();
  const files = manifests({ version: '1.5.0', sha256: 'AB'.repeat(32), releaseDate: '2026-11-01' });
  assert.deepEqual(Object.keys(files).sort(), [`${IDENTIFIER}.installer.yaml`, `${IDENTIFIER}.locale.en-US.yaml`, `${IDENTIFIER}.yaml`]);
  const installer = files[`${IDENTIFIER}.installer.yaml`];
  for (const line of ['InstallerType: nullsoft', 'Scope: user', 'ReleaseDate: 2026-11-01', `InstallerSha256: ${'AB'.repeat(32)}`,
    'InstallerUrl: https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v1.5.0/Remember-Me-Setup-1.5.0-x64.exe',
    `ProductCode: ${PRODUCT_CODE}`, "DefaultInstallLocation: '%LocalAppData%\\Programs\\Remember Me'"]) assert.ok(installer.includes(line), line);
  assert.match(files[`${IDENTIFIER}.yaml`], /DefaultLocale: en-US\nManifestType: version\n/);
  assert.match(files[`${IDENTIFIER}.locale.en-US.yaml`], /License: MIT\n/);
  for (const text of Object.values(files)) assert.match(text, /^PackageVersion: 1\.5\.0$/m);
});

test('the Apps & features key matches what electron-builder derives from the appId', async () => {
  const { PRODUCT_CODE } = await load();
  // UUID v5 in electron-builder's namespace, as app-builder-lib's NsisTarget computes it.
  const { createHash } = require('node:crypto');
  const namespace = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
  const bytes = createHash('sha1').update(Buffer.concat([namespace, Buffer.from('com.waqt.reminder')])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  assert.equal(PRODUCT_CODE, `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
});

test('docs/distribution/winget/1.5.0 is the generator output with a placeholder hash', async () => {
  const { manifests, PLACEHOLDER } = await load();
  for (const [name, text] of Object.entries(manifests({ version: '1.5.0' }))) {
    assert.equal(fs.readFileSync(path.join(docs, name), 'utf8').replace(/\r\n/g, '\n'), text, `Run: node tools/winget-manifest.mjs --version 1.5.0 --out docs/distribution/winget/1.5.0 (${name})`);
  }
  assert.ok(fs.readFileSync(path.join(docs, 'Sarmad.RememberMe.installer.yaml'), 'utf8').includes(PLACEHOLDER));
});
