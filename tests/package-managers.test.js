const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import('../tools/package-managers.mjs');
const docs = path.join(__dirname, '../docs/distribution');
const hash = 'ab'.repeat(32);

test('the Scoop manifest unpacks the release installer and lets Scoop update it', async () => {
  const { scoopManifest } = await load();
  const m = scoopManifest({ version: '1.6.0', sha256: hash.toUpperCase() });
  assert.equal(m.architecture['64bit'].url, 'https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v1.6.0/Remember-Me-Setup-1.6.0-x64.exe#/dl.7z');
  assert.equal(m.architecture['64bit'].hash, hash, 'Lower-case SHA-256');
  assert.match(m.architecture['64bit'].pre_install, /\$PLUGINSDIR\\app-64\.7z/);
  assert.match(m.post_install, /Uninstall\*\.exe/, 'Without the uninstaller the app leaves updating to Scoop');
  assert.deepEqual(m.shortcuts, [['Remember Me.exe', 'Remember Me']]);
  assert.equal(m.license, 'MIT');
  assert.ok(!('persist' in m), 'Data lives in %APPDATA%, outside the Scoop folder');
  assert.deepEqual(m.autoupdate.hash, { url: '$baseurl/SHA256SUMS.txt', regex: '$sha256\\s+$basename' });
  assert.deepEqual(Object.keys(m), ['version', 'description', 'homepage', 'license', 'notes', 'architecture', 'post_install', 'shortcuts', 'checkver', 'autoupdate'], "Extras' field order");
});

test('the Chocolatey package downloads the checked installer and uninstalls through Apps & features', async () => {
  const { chocolateyPackage } = await load();
  const files = chocolateyPackage({ version: '1.6.0', sha256: hash });
  assert.deepEqual(Object.keys(files), ['remember-me.nuspec', 'tools/chocolateyinstall.ps1', 'tools/chocolateyuninstall.ps1']);
  const install = files['tools/chocolateyinstall.ps1'];
  assert.match(install, /url64bit\s+= 'https:\/\/github\.com\/sarmadiq9090-coder\/Remember-Me\/releases\/download\/v1\.6\.0\/Remember-Me-Setup-1\.6\.0-x64\.exe'/);
  assert.match(install, new RegExp(`checksum64\\s+= '${hash}'`));
  assert.match(install, /silentArgs\s+= '\/S'/);
  assert.match(files['tools/chocolateyuninstall.ps1'], /Get-UninstallRegistryKey -SoftwareName 'Remember Me'/);
  const nuspec = files['remember-me.nuspec'];
  for (const tag of ['id>remember-me<', 'version>1.6.0<', 'packageSourceUrl>', 'docsUrl>', 'bugTrackerUrl>', 'projectSourceUrl>', 'releaseNotes>', 'iconUrl>https://raw.githubusercontent.com/sarmadiq9090-coder/Remember-Me/v1.6.0/assets/icon.png<']) assert.ok(nuspec.includes(tag), tag);
  assert.ok(!/<description>([^]*?)<\/description>/.exec(nuspec)[1].includes('<'), 'The Markdown description is XML-escaped');
});

test('docs/distribution holds the generated v1.5.0 files', async () => {
  const { packageFiles } = await load();
  const sha256 = JSON.parse(fs.readFileSync(path.join(docs, 'scoop/remember-me.json'), 'utf8')).architecture['64bit'].hash;
  for (const [name, text] of Object.entries(packageFiles({ version: '1.5.0', sha256 }))) {
    assert.equal(fs.readFileSync(path.join(docs, name), 'utf8').replace(/\r\n/g, '\n'), text, `Run: node tools/package-managers.mjs --sums SHA256SUMS.txt --version 1.5.0 --out docs/distribution (${name})`);
  }
});
