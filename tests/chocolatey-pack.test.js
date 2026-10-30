const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import('../tools/chocolatey-pack.mjs');
const source = path.join(__dirname, '../docs/distribution/chocolatey');

test('the .nupkg has the Open Packaging Conventions layout choco pack writes', async () => {
  const { packFolder, unzip } = await load();
  const { name, bytes } = packFolder(source);
  const version = /<version>([^<]+)<\/version>/.exec(fs.readFileSync(path.join(source, 'remember-me.nuspec'), 'utf8'))[1];
  assert.equal(name, `remember-me.${version}.nupkg`);
  const entries = unzip(bytes), names = entries.map(e => e.name);
  const psmdcp = names.find(n => /^package\/services\/metadata\/core-properties\/[0-9a-f]{32}\.psmdcp$/.test(n));
  assert.ok(psmdcp, 'Core properties part');
  assert.deepEqual(names, ['_rels/.rels', 'remember-me.nuspec', 'tools/chocolateyinstall.ps1', 'tools/chocolateyuninstall.ps1', psmdcp, '[Content_Types].xml']);
  const text = n => entries.find(e => e.name === n).data.toString('utf8');
  const types = text('[Content_Types].xml');
  for (const ext of ['rels', 'nuspec', 'ps1', 'psmdcp']) assert.match(types, new RegExp(`<Default Extension="${ext}" ContentType="[^"]+" />`), `A content type for .${ext}`);
  const rels = text('_rels/.rels');
  assert.match(rels, /Type="http:\/\/schemas\.microsoft\.com\/packaging\/2010\/07\/manifest" Target="\/remember-me\.nuspec"/);
  assert.ok(rels.includes(`Target="/${psmdcp}"`));
  const nuspec = text('remember-me.nuspec');
  assert.match(nuspec, /<id>remember-me<\/id>/);
  assert.ok(!nuspec.includes('<files>'), 'The packed manifest has no <files> list');
  assert.ok(text(psmdcp).includes(`<dc:identifier>remember-me</dc:identifier><version>${version}</version>`), 'Core properties id and version');
  assert.match(text('tools/chocolateyinstall.ps1'), /Install-ChocolateyPackage @packageArgs/);
});

test('the same source always gives the same package, and entries round-trip with their CRCs', async () => {
  const { packFolder, zip, unzip, crc32 } = await load();
  assert.deepEqual(packFolder(source).bytes, packFolder(source).bytes);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'The standard CRC-32 check value');
  const data = Buffer.from('ذكرني '.repeat(500), 'utf8');
  assert.deepEqual(unzip(zip([['a/b.txt', data]])), [{ name: 'a/b.txt', data }]);
});

test('a nuspec without a valid id or version is refused', async () => {
  const { nupkgEntries } = await load();
  assert.throws(() => nupkgEntries({ nuspec: '<package><metadata><id>Remember Me</id><version>1.5.0</version></metadata></package>', files: {} }), /lower-case id/);
  assert.throws(() => nupkgEntries({ nuspec: '<package><metadata><id>remember-me</id><version>latest</version></metadata></package>', files: {} }), /numeric version/);
});
