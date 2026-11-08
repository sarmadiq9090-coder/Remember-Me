const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const feed = require('../src/platform/update-feed');
const { chooseFallback, fetcher, verifyMinisign, blake2b512, parseLatestYml, parseManifest, matchesExpected, isNewer, expectedComment, TRUSTED_PUBLIC_KEYS, MANIFEST_URL, GITLAB_RELEASES } = feed;

// TEST-ONLY fixtures: a fake v9.9.9 release (tests/fixtures/update-manifest/regen.sh).
const dir = path.join(__dirname, 'fixtures', 'update-manifest');
const fixture = name => fs.readFileSync(path.join(dir, name));
const MANIFEST = fixture('manifest.json'), LATEST_YML = fixture('latest.yml').toString('utf8');
const sig = name => fixture(`manifest.json${name}.minisig`).toString('utf8');
const keyLine = name => fixture(`${name}.pub`).toString('utf8').split(/\r?\n/)[1].trim();
const KEYS = [keyLine('test-primary'), keyLine('test-backup')];
const EXPECT = parseLatestYml(LATEST_YML);
// The GitLab copy of v9.9.9 that the fixture manifest names (the fallback feed).
const GITLAB_FEED = { provider: 'generic', url: 'https://gitlab.com/fastkiwi1/Remember-Me/-/releases/v9.9.9/downloads/' };

// A local stand-in for fastkiwi.app and GitHub: path -> body, or a number for an HTTP error status.
async function server(routes) {
  const srv = http.createServer((req, res) => {
    const body = routes[req.url];
    if (body === undefined || typeof body === 'number') { res.writeHead(body || 404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(body);
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise(resolve => srv.close(resolve)) };
}
const fetch = fetcher(globalThis.fetch, { timeout: 5000 });
const otherYml = (version, sha512 = EXPECT.sha512) => LATEST_YML.replaceAll('9.9.9', version).replace(EXPECT.sha512, sha512).replace(EXPECT.sha512, sha512);

test('BLAKE2b-512 matches Node.js for every length around the block size', () => {
  for (const n of [0, 1, 3, 64, 127, 128, 129, 255, 256, 257, 1000, 4096]) {
    const data = crypto.randomBytes(n);
    assert.deepEqual(blake2b512(data), crypto.createHash('blake2b512').update(data).digest(), `${n} bytes`);
  }
});

test('the manifest signature: right key and comment only, never legacy or altered', () => {
  const want = expectedComment('9.9.9');
  assert.equal(want, 'remember-me update-manifest v9.9.9');
  verifyMinisign(MANIFEST, sig(''), KEYS, want);
  verifyMinisign(MANIFEST, sig('.backup'), KEYS, want);
  verifyMinisign(MANIFEST, sig('').replace(/\n/g, '\r\n'), KEYS, want);
  assert.throws(() => verifyMinisign(MANIFEST, sig('.backup'), KEYS.slice(0, 1), want), /trusted key/);
  assert.throws(() => verifyMinisign(MANIFEST, sig('.other-key'), KEYS, want), /trusted key/);
  assert.throws(() => verifyMinisign(MANIFEST, sig('.wrong-version'), KEYS, want), /v9\.9\.8/);
  assert.throws(() => verifyMinisign(MANIFEST, sig('.wrong-app'), KEYS, want), /instafind update-manifest/);
  assert.throws(() => verifyMinisign(MANIFEST, sig('.legacy'), KEYS, want), /legacy/);
  const changed = Buffer.from(MANIFEST.toString('utf8').replace('9.9.9', '9.9.10'));
  assert.throws(() => verifyMinisign(changed, sig(''), KEYS, want), /altered/);
  const edited = sig('.wrong-version').replace('v9.9.8', 'v9.9.9');
  assert.throws(() => verifyMinisign(MANIFEST, edited, KEYS, want), /altered/);
  for (const bad of ['', 'nope', 'untrusted comment: x\nRW\ntrusted comment: x\nAA==']) assert.throws(() => verifyMinisign(MANIFEST, bad, KEYS, want));
  assert.throws(() => verifyMinisign(MANIFEST, sig(''), [], want), /trusted key/);
  assert.throws(() => verifyMinisign(MANIFEST, sig(''), ['', 'RWnope', '!!!'], want), /trusted key/);
});

test('the production key list holds no test key, and every entry is a minisign key', () => {
  for (const name of ['test-primary', 'test-backup', 'test-other']) assert.ok(!TRUSTED_PUBLIC_KEYS.includes(keyLine(name)), name);
  for (const key of TRUSTED_PUBLIC_KEYS) assert.match(key, /^RW[A-Za-z0-9+/]{54}$/);
  assert.equal(MANIFEST_URL, 'https://fastkiwi.app/updates/remember-me/latest.json');
  assert.equal(GITLAB_RELEASES, 'https://gitlab.com/fastkiwi1/Remember-Me/-/releases/');
});

test('latest.yml, versions and what electron-updater read', () => {
  assert.deepEqual(EXPECT, { version: '9.9.9', path: 'Remember-Me-Setup-9.9.9-x64.exe', sha512: JSON.parse(MANIFEST).assets.x64.sha512 });
  for (const bad of ['', 'version: 9.9.9-beta\npath: a.exe\nsha512: x', LATEST_YML.replace(/^path: .*$/m, 'path: ../evil.exe'), LATEST_YML.replace(/^sha512: .*$/m, 'sha512: short')]) assert.throws(() => parseLatestYml(bad));
  assert.ok(isNewer('9.9.10', '9.9.9') && isNewer('10.0.0', '9.9.9') && !isNewer('9.9.9', '9.9.9') && !isNewer('9.9.8', '9.9.9') && !isNewer('9.9.10-rc.1', '9.9.9'));
  const info = { version: '9.9.9', files: [{ url: EXPECT.path, sha512: EXPECT.sha512, size: 61 }] };
  assert.ok(matchesExpected(info, EXPECT));
  for (const bad of [{ ...info, version: '9.9.10' }, { ...info, files: [] }, { version: '9.9.9' }, { ...info, files: [{ ...info.files[0], sha512: 'x' }] }, { ...info, files: [...info.files, { url: 'evil.exe', sha512: EXPECT.sha512 }] }]) assert.ok(!matchesExpected(bad, EXPECT));
});

test('latest.json: this app, a release version, an installer, and only its own GitLab copy as the feed', () => {
  assert.deepEqual(parseManifest(MANIFEST), { ...EXPECT, feed: GITLAB_FEED.url });
  const m = JSON.parse(MANIFEST);
  const edit = change => { const c = JSON.parse(JSON.stringify(m)); change(c); return Buffer.from(JSON.stringify(c)); };
  for (const [what, bad] of [
    ['other app', edit(c => { c.app = 'instafind'; })],
    ['schema', edit(c => { c.schema = 2; })],
    ['pre-release', edit(c => { c.version = '9.9.9-rc.1'; c.tag = 'v9.9.9-rc.1'; })],
    ['tag', edit(c => { c.tag = 'v9.9.8'; })],
    ['no installer', edit(c => { delete c.assets.x64; })],
    ['bad name', edit(c => { c.assets.x64.name = '../evil.exe'; })],
    ['bad sha512', edit(c => { c.assets.x64.sha512 = 'short'; })],
    ['not json', Buffer.from('<html>')],
    ['too big', Buffer.alloc(70 * 1024, 32)],
  ]) assert.throws(() => parseManifest(bad), undefined, what);
  // Only exactly <GITLAB_RELEASES>v<version>/downloads/<installer> gives a feed.
  const gl = m.assets.x64.urls[1];
  for (const other of [
    'https://gitlab.com/evil/Remember-Me/-/releases/v9.9.9/downloads/Remember-Me-Setup-9.9.9-x64.exe',
    'https://gitlab.com/fastkiwi1/Remember-Me/-/releases/v9.9.8/downloads/Remember-Me-Setup-9.9.9-x64.exe',
    'https://gitlab.com/fastkiwi1/Remember-Me/-/releases/v9.9.9/downloads/other.exe',
    'http://gitlab.com/fastkiwi1/Remember-Me/-/releases/v9.9.9/downloads/Remember-Me-Setup-9.9.9-x64.exe',
    'https://updates.fastkiwi.app/remember-me/Remember-Me-Setup-9.9.9-x64.exe',
  ]) assert.equal(parseManifest(edit(c => { c.assets.x64.urls = [c.assets.x64.urls[0], other]; })).feed, null, other);
  assert.equal(parseManifest(edit(c => { c.assets.x64.urls = [c.assets.x64.urls[0]]; })).feed, null, 'GitHub only');
  assert.equal(parseManifest(edit(c => { c.assets.x64.urls = [gl]; })).feed, GITLAB_FEED.url);
});

test('with keys, the signed manifest names the GitLab copy even while GitHub is down', async () => {
  const s = await server({ '/m/latest.json': MANIFEST, '/m/latest.json.minisig': sig(''), '/b/latest.json': MANIFEST, '/b/latest.json.minisig': sig('.backup'), '/gh/latest.yml': 404 });
  try {
    for (const m of ['/m/', '/b/']) {
      const choice = await chooseFallback({ fetch, current: '9.9.8', keys: KEYS, manifest: `${s.base}${m}latest.json`, githubYml: `${s.base}/gh/latest.yml` });
      assert.deepEqual(choice, { feed: GITLAB_FEED, expect: EXPECT }, m);
    }
  } finally { await s.close(); }
});

test('with keys, an unsigned, foreign, replayed, invalid or GitLab-less manifest is not used', async () => {
  const noGitLab = JSON.parse(MANIFEST);
  noGitLab.assets.x64.urls = noGitLab.assets.x64.urls.slice(0, 1);
  const s = await server({
    '/nosig/latest.json': MANIFEST,
    '/other/latest.json': MANIFEST, '/other/latest.json.minisig': sig('.other-key'),
    '/replay/latest.json': MANIFEST, '/replay/latest.json.minisig': sig('.wrong-version'),
    '/app/latest.json': MANIFEST, '/app/latest.json.minisig': sig('.wrong-app'),
    '/legacy/latest.json': MANIFEST, '/legacy/latest.json.minisig': sig('.legacy'),
    '/changed/latest.json': MANIFEST.toString('utf8').replace('"notes": ""', '"notes": "x"'), '/changed/latest.json.minisig': sig(''),
    '/nogitlab/latest.json': JSON.stringify(noGitLab), '/nogitlab/latest.json.minisig': sig(''),
    '/down/latest.json': 503, '/html/latest.json': '<html>',
  });
  try {
    for (const m of ['/nosig/', '/other/', '/replay/', '/app/', '/legacy/', '/changed/', '/nogitlab/', '/down/', '/html/', '/missing/']) {
      const reasons = [];
      const choice = await chooseFallback({ fetch, current: '9.9.8', keys: KEYS, manifest: `${s.base}${m}latest.json`, githubYml: `${s.base}/gh`, log: r => reasons.push(r) });
      assert.equal(choice, null, m);
      assert.equal(reasons.length, 1, m);
      assert.ok(!reasons[0].includes('http'), 'reasons hold no URLs');
    }
    // Nothing listening at all.
    assert.equal(await chooseFallback({ fetch, current: '9.9.8', keys: KEYS, manifest: 'http://127.0.0.1:1/latest.json', githubYml: 'http://127.0.0.1:1/x' }), null);
  } finally { await s.close(); }
});

test('without keys (today) the manifest is used only when GitHub names the same installer', async () => {
  const s = await server({
    '/m/latest.json': MANIFEST,
    '/gh-same/latest.yml': LATEST_YML,
    '/gh-sha/latest.yml': otherYml('9.9.9', 'B'.repeat(86) + '=='),
    '/gh-newer/latest.yml': otherYml('9.9.10'),
    '/gh-down/latest.yml': 403,
  });
  const run = (gh, current = '9.9.8') => chooseFallback({ fetch, current, keys: [], manifest: `${s.base}/m/latest.json`, githubYml: `${s.base}${gh}/latest.yml` });
  try {
    assert.deepEqual(await run('/gh-same'), { feed: GITLAB_FEED, expect: EXPECT });
    // GitHub fully down: nothing confirms the manifest (fail closed).
    for (const gh of ['/gh-sha', '/gh-newer', '/gh-down']) assert.equal(await run(gh), null, gh);
  } finally { await s.close(); }
});

test('only a strictly newer release is ever offered (never a downgrade)', async () => {
  const s = await server({ '/m/latest.json': MANIFEST, '/m/latest.json.minisig': sig(''), '/gh/latest.yml': LATEST_YML });
  const run = current => {
    const reasons = [];
    return chooseFallback({ fetch, current, keys: KEYS, manifest: `${s.base}/m/latest.json`, githubYml: `${s.base}/gh/latest.yml`, log: r => reasons.push(r) }).then(choice => ({ choice, reasons }));
  };
  try {
    assert.ok((await run('9.9.8')).choice);
    for (const current of ['9.9.9', '10.0.0']) assert.deepEqual(await run(current), { choice: null, reasons: ['manifest-not-newer'] }, current);
  } finally { await s.close(); }
});

test('the fetcher refuses errors and oversized answers', async () => {
  const s = await server({ '/ok': 'fine', '/big': 'x'.repeat(70 * 1024), '/gone': 410 });
  try {
    assert.equal((await fetch(`${s.base}/ok`)).toString(), 'fine');
    await assert.rejects(fetch(`${s.base}/big`), /too large/);
    await assert.rejects(fetch(`${s.base}/gone`), /HTTP 410/);
  } finally { await s.close(); }
});
