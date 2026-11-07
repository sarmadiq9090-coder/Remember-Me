const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const feed = require('../src/platform/update-feed');
const { chooseFeed, fetcher, verifyMinisign, blake2b512, parseLatestYml, matchesExpected, isNewer, expectedComment, TRUSTED_PUBLIC_KEYS, MIRROR_URL } = feed;

// TEST-ONLY fixtures: a fake v9.9.9 release (tests/fixtures/update-manifest/regen.sh).
const dir = path.join(__dirname, 'fixtures', 'update-manifest');
const fixture = name => fs.readFileSync(path.join(dir, name));
const MANIFEST = fixture('manifest.json'), LATEST_YML = fixture('latest.yml').toString('utf8');
const sig = name => fixture(`manifest.json${name}.minisig`).toString('utf8');
const keyLine = name => fixture(`${name}.pub`).toString('utf8').split(/\r?\n/)[1].trim();
const KEYS = [keyLine('test-primary'), keyLine('test-backup')];
const EXPECT = parseLatestYml(LATEST_YML);

// A local stand-in for the mirror and GitHub: path -> body, or a number for an HTTP error status.
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
  assert.equal(MIRROR_URL, 'https://updates.fastkiwi.app/remember-me/');
});

test('latest.yml, versions and what electron-updater read', () => {
  assert.deepEqual(EXPECT, { version: '9.9.9', path: 'Remember-Me-Setup-9.9.9-x64.exe', sha512: JSON.parse(MANIFEST).assets.x64.sha512 });
  for (const bad of ['', 'version: 9.9.9-beta\npath: a.exe\nsha512: x', LATEST_YML.replace(/^path: .*$/m, 'path: ../evil.exe'), LATEST_YML.replace(/^sha512: .*$/m, 'sha512: short')]) assert.throws(() => parseLatestYml(bad));
  assert.ok(isNewer('9.9.10', '9.9.9') && isNewer('10.0.0', '9.9.9') && !isNewer('9.9.9', '9.9.9') && !isNewer('9.9.8', '9.9.9') && !isNewer('9.9.10-rc.1', '9.9.9'));
  const info = { version: '9.9.9', files: [{ url: EXPECT.path, sha512: EXPECT.sha512, size: 61 }] };
  assert.ok(matchesExpected(info, EXPECT));
  for (const bad of [{ ...info, version: '9.9.10' }, { ...info, files: [] }, { version: '9.9.9' }, { ...info, files: [{ ...info.files[0], sha512: 'x' }] }, { ...info, files: [...info.files, { url: 'evil.exe', sha512: EXPECT.sha512 }] }]) assert.ok(!matchesExpected(bad, EXPECT));
});

test('with keys, a signed mirror is used even while GitHub is down', async () => {
  const s = await server({ '/m/latest.yml': LATEST_YML, '/m/latest.json': MANIFEST, '/m/latest.json.minisig': sig(''), '/b/latest.yml': LATEST_YML, '/b/latest.json': MANIFEST, '/b/latest.json.minisig': sig('.backup'), '/gh/latest.yml': 404 });
  try {
    for (const m of ['/m/', '/b/']) {
      const choice = await chooseFeed({ fetch, current: '9.9.8', keys: KEYS, mirror: `${s.base}${m}`, githubYml: `${s.base}/gh/latest.yml` });
      assert.deepEqual(choice, { feed: { provider: 'generic', url: `${s.base}${m}` }, expect: EXPECT }, m);
    }
  } finally { await s.close(); }
});

test('with keys, an unsigned, foreign, replayed or mismatched mirror is not used', async () => {
  const yml910 = otherYml('9.9.10');
  const s = await server({
    '/nosig/latest.yml': LATEST_YML, '/nosig/latest.json': MANIFEST,
    '/other/latest.yml': LATEST_YML, '/other/latest.json': MANIFEST, '/other/latest.json.minisig': sig('.other-key'),
    '/replay/latest.yml': LATEST_YML, '/replay/latest.json': MANIFEST, '/replay/latest.json.minisig': sig('.wrong-version'),
    '/newer-yml/latest.yml': yml910, '/newer-yml/latest.json': MANIFEST, '/newer-yml/latest.json.minisig': sig(''),
    '/sha/latest.yml': otherYml('9.9.9', 'A'.repeat(86) + '=='), '/sha/latest.json': MANIFEST, '/sha/latest.json.minisig': sig(''),
    '/down/latest.yml': 503, '/html/latest.yml': '<html>',
  });
  try {
    for (const m of ['/nosig/', '/other/', '/replay/', '/newer-yml/', '/sha/', '/down/', '/html/', '/missing/']) {
      const reasons = [];
      const choice = await chooseFeed({ fetch, current: '9.9.8', keys: KEYS, mirror: `${s.base}${m}`, githubYml: `${s.base}/gh`, log: r => reasons.push(r) });
      assert.equal(choice, null, m);
      assert.equal(reasons.length, 1, m);
      assert.ok(!reasons[0].includes('http'), 'reasons hold no URLs');
    }
    // Nothing listening at all.
    assert.equal(await chooseFeed({ fetch, current: '9.9.8', keys: KEYS, mirror: 'http://127.0.0.1:1/', githubYml: 'http://127.0.0.1:1/x' }), null);
  } finally { await s.close(); }
});

test('without keys (today) the mirror is used only when GitHub names the same installer', async () => {
  const s = await server({
    '/m/latest.yml': LATEST_YML,
    '/gh-same/latest.yml': LATEST_YML,
    '/gh-sha/latest.yml': otherYml('9.9.9', 'B'.repeat(86) + '=='),
    '/gh-newer/latest.yml': otherYml('9.9.10'),
    '/gh-down/latest.yml': 403,
  });
  const mirror = `${s.base}/m/`;
  const run = (gh, current = '9.9.8') => chooseFeed({ fetch, current, keys: [], mirror, githubYml: `${s.base}${gh}/latest.yml` });
  try {
    assert.deepEqual(await run('/gh-same'), { feed: { provider: 'generic', url: mirror }, expect: EXPECT });
    for (const gh of ['/gh-sha', '/gh-newer', '/gh-down']) assert.equal(await run(gh), null, gh);
    // Up to date on a confirmed mirror: the mirror (electron-updater then says "latest").
    assert.ok(await run('/gh-same', '9.9.9'));
  } finally { await s.close(); }
});

test('a mirror that is not newer defers to a newer GitHub release (a stale mirror)', async () => {
  const s = await server({ '/m/latest.yml': LATEST_YML, '/m/latest.json': MANIFEST, '/m/latest.json.minisig': sig(''), '/gh-newer/latest.yml': otherYml('9.9.10'), '/gh-same/latest.yml': LATEST_YML });
  const run = (gh, current) => chooseFeed({ fetch, current, keys: KEYS, mirror: `${s.base}/m/`, githubYml: `${s.base}${gh}` });
  try {
    assert.equal(await run('/gh-newer/latest.yml', '9.9.9'), null);
    assert.ok(await run('/gh-same/latest.yml', '9.9.9'));
    assert.ok(await run('/gh-down', '9.9.9'), 'GitHub down: the signed mirror says up to date');
    // A newer running version is never offered the mirror's older one: electron-updater has
    // allowDowngrade off, and chooseFeed does not look for anything older either.
    assert.ok(await run('/gh-down', '10.0.0'));
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
