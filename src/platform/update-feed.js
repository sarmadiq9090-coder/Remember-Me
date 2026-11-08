'use strict';
const crypto = require('node:crypto');
// The fallback feed for electron-updater (docs/specs/update-manifest.md). GitHub Releases come first,
// as always. When GitHub cannot be read, or its download fails, the signed update manifest on the
// website (Cloudflare Pages), https://fastkiwi.app/updates/remember-me/latest.json, may point
// electron-updater at the same release on the project's GitLab copy: a "generic" provider at that
// release's downloads/ folder, which holds latest.yml, the installer and its .blockmap. The GitLab
// copy is populated later; until then that feed answers 404 and the update waits for GitHub.
const MANIFEST_URL = 'https://fastkiwi.app/updates/remember-me/latest.json';
// Only this project's GitLab releases are ever used as a feed.
const GITLAB_RELEASES = 'https://gitlab.com/fastkiwi1/Remember-Me/-/releases/';
// What the GitHub feed says the latest release is, for the check below while no key is set.
const GITHUB_LATEST_YML = 'https://github.com/sarmadiq9090-coder/Remember-Me/releases/latest/download/latest.yml';
const MANIFEST_APP = 'remember-me';
const MAX_BYTES = 64 * 1024, TIMEOUT = 15 * 1000;

// TODO(owner): paste Remember Me's minisign public keys here (the second line of each .pub file, the
// base64 key that starts with "RW"; never a secret key), primary first, backup second. Made as in
// arabic-file-search's docs/specs/signing.md, with Remember Me's own key pair; the release workflow
// signs latest.json with MINISIGN_SECRET_KEY in the `release` Environment.
// While this list is EMPTY the manifest is used only when GitHub's latest.yml names the same version
// and installer with the same SHA-512. With keys, latest.json.minisig must verify instead.
const TRUSTED_PUBLIC_KEYS = [];

// The trusted comment latest.json.minisig must carry, e.g. "remember-me update-manifest v1.8.0".
function expectedComment(version) { return `${MANIFEST_APP} update-manifest v${version}`; }

// "1.8.0" only: the updater never offers a pre-release.
function parseVersion(text) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(text));
  return m ? m.slice(1).map(Number) : null;
}
function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// The parts of electron-builder's latest.yml the check needs (its top-level keys).
function parseLatestYml(text) {
  const top = {};
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = /^(version|path|sha512):\s*(.*?)\s*$/.exec(line);
    if (m) top[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!parseVersion(top.version)) throw new Error('latest.yml has no release version');
  if (!/^[\w.-]+\.exe$/.test(top.path || '')) throw new Error('latest.yml names no installer');
  if (!/^[A-Za-z0-9+/]{86}==$/.test(top.sha512 || '')) throw new Error('latest.yml has no SHA-512');
  return { version: top.version, path: top.path, sha512: top.sha512 };
}
const sameRelease = (a, b) => a.version === b.version && a.path === b.path && a.sha512 === b.sha512;

// What electron-updater read from the fallback feed must be what was checked: the same version, and
// only the checked installer with the checked SHA-512.
function matchesExpected(updateInfo, expect) {
  const files = Array.isArray(updateInfo?.files) ? updateInfo.files : [];
  return updateInfo?.version === expect.version && files.length > 0
    && files.every(file => file?.url === expect.path && file?.sha512 === expect.sha512);
}

// ---------------------------------------------------------------- minisign (verify only)

// BLAKE2b-512 (RFC 7693) in plain JavaScript: Electron's BoringSSL has no blake2b512 hash, and
// minisign's pre-hashed signatures sign this digest of the file.
const IV = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
const SIGMA = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4], [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13], [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11], [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5], [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]];
const M64 = (1n << 64n) - 1n;
const rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M64;
function compress(h, block, t, last) {
  const m = Array.from({ length: 16 }, (_, i) => block.readBigUInt64LE(i * 8));
  const v = [...h, ...IV];
  v[12] ^= t & M64; v[13] ^= t >> 64n;
  if (last) v[14] ^= M64;
  const g = (a, b, c, d, x, y) => {
    v[a] = (v[a] + v[b] + x) & M64; v[d] = rotr(v[d] ^ v[a], 32n);
    v[c] = (v[c] + v[d]) & M64; v[b] = rotr(v[b] ^ v[c], 24n);
    v[a] = (v[a] + v[b] + y) & M64; v[d] = rotr(v[d] ^ v[a], 16n);
    v[c] = (v[c] + v[d]) & M64; v[b] = rotr(v[b] ^ v[c], 63n);
  };
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10];
    g(0, 4, 8, 12, m[s[0]], m[s[1]]); g(1, 5, 9, 13, m[s[2]], m[s[3]]);
    g(2, 6, 10, 14, m[s[4]], m[s[5]]); g(3, 7, 11, 15, m[s[6]], m[s[7]]);
    g(0, 5, 10, 15, m[s[8]], m[s[9]]); g(1, 6, 11, 12, m[s[10]], m[s[11]]);
    g(2, 7, 8, 13, m[s[12]], m[s[13]]); g(3, 4, 9, 14, m[s[14]], m[s[15]]);
  }
  for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
}
function blake2b512(data) {
  const h = IV.slice();
  h[0] ^= 0x01010040n; // digest length 64, no key, fanout 1, depth 1
  let offset = 0, t = 0n;
  while (data.length - offset > 128) {
    t += 128n;
    compress(h, data.subarray(offset, offset + 128), t, false);
    offset += 128;
  }
  const block = Buffer.alloc(128);
  data.copy(block, 0, offset);
  compress(h, block, t + BigInt(data.length - offset), true);
  const out = Buffer.alloc(64);
  h.forEach((word, i) => out.writeBigUInt64LE(word, i * 8));
  return out;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
// Checks `data` against the minisign signature file `sigText`: pre-hashed ("ED"; legacy signatures
// are refused), made by one of `keys` (base64 public keys), with the trusted comment `expected`.
function verifyMinisign(data, sigText, keys, expected) {
  const lines = String(sigText).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines[0]?.startsWith('untrusted comment:') || !BASE64.test(lines[1] || '') || !lines[2]?.startsWith('trusted comment: ') || !BASE64.test(lines[3] || '')) throw new Error('the signature file is not valid');
  const sig = Buffer.from(lines[1], 'base64'), global = Buffer.from(lines[3], 'base64');
  if (sig.length !== 74 || global.length !== 64) throw new Error('the signature file is not valid');
  const algorithm = sig.subarray(0, 2).toString('latin1');
  if (algorithm !== 'ED') throw new Error(algorithm === 'Ed' ? 'legacy signatures are not accepted' : 'unknown signature algorithm');
  const keyId = sig.subarray(2, 10), signature = sig.subarray(10), comment = lines[2].slice('trusted comment: '.length);
  for (const text of keys) {
    const raw = BASE64.test(String(text).trim()) ? Buffer.from(String(text).trim(), 'base64') : Buffer.alloc(0);
    if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed' || !raw.subarray(2, 10).equals(keyId)) continue;
    const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI, raw.subarray(10)]), format: 'der', type: 'spki' });
    if (!crypto.verify(null, blake2b512(data), key, signature)) throw new Error('the file or its signature was altered');
    if (!crypto.verify(null, Buffer.concat([signature, Buffer.from(comment, 'utf8')]), key, global)) throw new Error('the trusted comment was altered');
    if (comment !== expected) throw new Error(`the signature is for "${comment}", not "${expected}"`);
    return;
  }
  throw new Error('it was not made by a trusted key');
}

// The release latest.json describes ({ version, path, sha512, feed }); throws when it is not valid for
// this app. `feed` is the GitLab downloads/ folder of that release, or null when the manifest lists no
// GitLab copy of the installer (only exactly `<GITLAB_RELEASES>v<version>/downloads/<installer>`).
function parseManifest(data, gitlab = GITLAB_RELEASES) {
  if (data.length > MAX_BYTES) throw new Error('latest.json is too large');
  let manifest;
  try { manifest = JSON.parse(data.toString('utf8')); } catch { throw new Error('latest.json is not JSON'); }
  const version = manifest?.version;
  if (manifest?.schema !== 1 || manifest.app !== MANIFEST_APP || !parseVersion(version) || manifest.tag !== `v${version}`) throw new Error('latest.json is not a Remember Me release');
  const asset = manifest.assets?.x64;
  if (!/^[\w.-]+\.exe$/.test(asset?.name || '') || !/^[A-Za-z0-9+/]{86}==$/.test(asset?.sha512 || '')) throw new Error('latest.json names no installer');
  const folder = `${gitlab}v${version}/downloads/`;
  const urls = Array.isArray(asset.urls) ? asset.urls : [];
  return { version, path: asset.name, sha512: asset.sha512, feed: urls.includes(folder + asset.name) ? folder : null };
}

// GETs a small file with `fetchImpl` (Electron's net.fetch, or fetch in the tests).
function fetcher(fetchImpl, { timeout = TIMEOUT, limit = MAX_BYTES } = {}) {
  return async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeout) });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('the answer is too large');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > limit) throw new Error('the answer is too large');
    return body;
  };
}

// The fallback feed and what it must serve ({ feed, expect }), or null (then the update waits for
// GitHub). Asked only after GitHub failed:
// 1. The manifest on fastkiwi.app; any failure, or no GitLab copy listed, means null.
// 2. With keys, latest.json.minisig must verify ("remember-me update-manifest v<version>"). Without
//    keys (today), GitHub's latest.yml must name the same version and installer with the same SHA-512,
//    so while GitHub is fully down nothing confirms the manifest (fail closed).
// 3. Only a release strictly newer than `current` (never a downgrade; electron-updater's
//    allowDowngrade stays off as well).
// `log(reason)` hears why the fallback was not used: short codes, never URLs.
async function chooseFallback({ fetch, current, keys = TRUSTED_PUBLIC_KEYS, manifest = MANIFEST_URL, gitlab = GITLAB_RELEASES, githubYml = GITHUB_LATEST_YML, log = () => {} }) {
  let data, release;
  try { data = await fetch(manifest); } catch { log('manifest-unreachable'); return null; }
  try { release = parseManifest(data, gitlab); } catch { log('manifest-invalid'); return null; }
  if (!release.feed) { log('manifest-no-fallback'); return null; }
  const expect = { version: release.version, path: release.path, sha512: release.sha512 };
  if (keys.length) {
    try { verifyMinisign(data, (await fetch(`${manifest}.minisig`)).toString('utf8'), keys, expectedComment(release.version)); } catch { log('manifest-signature'); return null; }
  } else {
    let github = null;
    try { github = parseLatestYml(await fetch(githubYml)); } catch { /* GitHub is down: nothing confirms it */ }
    if (!github || !sameRelease(github, expect)) { log('manifest-unconfirmed'); return null; }
  }
  if (!isNewer(release.version, current)) { log('manifest-not-newer'); return null; }
  return { feed: { provider: 'generic', url: release.feed }, expect };
}

module.exports = { MANIFEST_URL, GITLAB_RELEASES, GITHUB_LATEST_YML, MANIFEST_APP, TRUSTED_PUBLIC_KEYS, expectedComment, isNewer, parseLatestYml, parseManifest, matchesExpected, blake2b512, verifyMinisign, fetcher, chooseFallback };
