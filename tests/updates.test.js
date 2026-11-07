const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { Updates, configure, FIRST_CHECK, CHECK_EVERY } = require('../src/platform/updates');
const { initialState, validateState } = require('../src/core/tasks');

// Timers that only move when the test says so.
function fakeTimers() {
  let now = 0, id = 0;
  const pending = new Map();
  const add = (fn, ms, every) => { pending.set(++id, { fn, at: now + ms, every }); return id; };
  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms), setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: key => pending.delete(key), clearInterval: key => pending.delete(key),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const [key, timer] = [...pending].sort((a, b) => a[1].at - b[1].at)[0] || [];
        if (!timer || timer.at > end) break;
        now = timer.at;
        if (timer.every) timer.at += timer.every; else pending.delete(key);
        await timer.fn();
      }
      now = end;
    },
  };
}
// Stands in for electron-updater's autoUpdater.
class FakeUpdater extends EventEmitter {
  constructor() { super(); this.checks = 0; this.downloads = 0; this.feeds = []; this.result = { isUpdateAvailable: false, updateInfo: { version: '1.5.0' } }; this.installs = []; }
  setFeedURL(feed) { this.feed = feed; this.feeds.push(feed.provider); }
  async checkForUpdates() {
    this.checks++;
    const result = typeof this.result === 'function' ? this.result(this.feed) : this.result;
    if (this.offline || result instanceof Error) { const error = result instanceof Error ? result : new Error('net::ERR_INTERNET_DISCONNECTED'); this.emit('error', error); throw error; }
    if (result?.isUpdateAvailable) this.emit('update-available', result.updateInfo);
    return result;
  }
  async downloadUpdate() {
    this.downloads++;
    if (this.failDownloadFrom && this.failDownloadFrom === this.feed?.provider) { const error = new Error('net::ERR_CONNECTION_RESET'); this.emit('error', error); throw error; }
    return [];
  }
  quitAndInstall(isSilent, runAfter) { this.installs.push({ isSilent, runAfter, quitting: this.app.quitting, backups: this.app.backups }); }
}
function setup({ consent = null, backup, chooseFeed } = {}) {
  const timers = fakeTimers(), updater = new FakeUpdater();
  const app = { consent, quitting: false, backups: 0, quits: 0, changes: 0, states: [] };
  updater.app = app;
  const updates = new Updates({ updater, timers, clock: timers.now, version: '1.5.0', consent: () => app.consent, chooseFeed,
    backup: backup || (async () => { app.backups++; }), prepareQuit: () => { app.quitting = true; }, quit: () => { app.quits++; }, onChange: () => { app.changes++; app.states.push(updates.state); } });
  return { timers, updater, app, updates };
}
const available = { isUpdateAvailable: true, updateInfo: { version: '1.6.0' }, downloadPromise: Promise.resolve([]) };

test('without consent (not asked yet, or declined) nothing is checked in the background', async () => {
  for (const consent of [null, false]) {
    const { timers, updater, updates } = setup({ consent });
    updates.start();
    await timers.advance(3 * CHECK_EVERY);
    assert.equal(updater.checks, 0);
    assert.equal(updates.status().state, 'idle');
  }
});

test('with consent the first check runs 30 seconds after start, then once a day', async () => {
  const { timers, updater, updates } = setup({ consent: true });
  updates.start();
  await timers.advance(FIRST_CHECK - 1);
  assert.equal(updater.checks, 0);
  await timers.advance(1);
  assert.equal(updater.checks, 1);
  assert.equal(updates.status().state, 'latest');
  await timers.advance(CHECK_EVERY - 1);
  assert.equal(updater.checks, 1);
  await timers.advance(60 * 60 * 1000);
  assert.equal(updater.checks, 2);
  updates.stop();
  await timers.advance(3 * CHECK_EVERY);
  assert.equal(updater.checks, 2);
});

test('allowing updates later starts checking; turning them off stops it', async () => {
  const { timers, updater, updates, app } = setup({ consent: null });
  updates.start();
  await timers.advance(FIRST_CHECK);
  app.consent = true; updates.consentChanged();
  await timers.advance(FIRST_CHECK);
  assert.equal(updater.checks, 1);
  app.consent = false; updates.consentChanged();
  await timers.advance(3 * CHECK_EVERY);
  assert.equal(updater.checks, 1);
});

test('Check now works whatever the switch says, and being offline only changes the status', async () => {
  const { updater, updates } = setup({ consent: false });
  assert.equal((await updates.check()).state, 'latest');
  updater.offline = true;
  const status = await updates.check();
  assert.equal(status.state, 'error');
  assert.equal(status.banner, false);
  assert.equal(updater.checks, 2);
  updater.result = null; updater.offline = false;
  assert.equal((await updates.check()).state, 'unavailable', 'Development builds cannot update');
});

test('a downloaded update shows the banner; Later hides it but keeps the update ready', async () => {
  const { updater, updates } = setup({ consent: true });
  updater.result = available;
  const checking = updates.check();
  assert.equal(updates.check(), checking, 'A second click joins the running check');
  assert.equal((await checking).state, 'downloading');
  updater.emit('download-progress', { percent: 42.7 });
  assert.equal(updates.status().percent, 40, 'Progress is shown in 10% steps');
  assert.equal(updates.status().banner, false);
  updater.emit('update-downloaded', { version: '1.6.0' });
  assert.deepEqual([updates.status().state, updates.status().next, updates.status().banner], ['ready', '1.6.0', true]);
  assert.equal((await updates.check()).state, 'ready', 'No second download');
  assert.equal(updater.checks, 1);
  updates.dismiss();
  assert.deepEqual([updates.status().state, updates.status().banner], ['ready', false]);
});

test('Restart now backs up the data, sets quitting, then installs and starts the new version', async () => {
  const { updater, updates } = setup({ consent: true });
  assert.equal(await updates.restart(), false, 'Nothing to install yet');
  updater.emit('update-downloaded', { version: '1.6.0' });
  assert.equal(await updates.restart(), true);
  assert.deepEqual(updater.installs, [{ isSilent: true, runAfter: true, quitting: true, backups: 1 }]);
  assert.equal(updates.status().state, 'installing');
});

test('a failed safety backup cancels Restart now and keeps the update for later', async () => {
  const { updater, updates, app } = setup({ backup: async () => { throw new Error('disk full'); } });
  updater.emit('update-downloaded', { version: '1.6.0' });
  await assert.rejects(updates.restart(), /disk full/);
  assert.deepEqual(updater.installs, []);
  assert.equal(app.quitting, false);
  assert.equal(updates.status().state, 'ready');
});

test('a normal quit installs a downloaded update after a safety backup, without restarting', async () => {
  const { updater, updates } = setup({ consent: true });
  const quit = { prevented: false, preventDefault() { this.prevented = true; } };
  assert.equal(updates.beforeQuit(quit), false, 'Without an update the app quits as usual');
  assert.equal(quit.prevented, false);
  updater.emit('update-downloaded', { version: '1.6.0' });
  assert.equal(updates.beforeQuit(quit), true);
  assert.equal(quit.prevented, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updater.installs, [{ isSilent: true, runAfter: false, quitting: true, backups: 1 }]);
  assert.equal(updates.beforeQuit({ preventDefault() { assert.fail('The installer quit must go through'); } }), false);
});

test('if the safety backup fails on quit, the app still quits and installs nothing', async () => {
  const { updater, updates, app } = setup({ backup: async () => { throw new Error('locked'); } });
  updater.emit('update-downloaded', { version: '1.6.0' });
  const original = console.error; console.error = () => {};
  try {
    assert.equal(updates.beforeQuit({ preventDefault() {} }), true);
    await new Promise(resolve => setImmediate(resolve));
  } finally { console.error = original; }
  assert.deepEqual(updater.installs, []);
  assert.deepEqual([app.quitting, app.quits], [true, 1]);
});

test('the updater is set up for stable GitHub releases over HTTPS, never downgrading', () => {
  const updater = configure(new FakeUpdater());
  assert.deepEqual(updater.feed, { provider: 'github', owner: 'sarmadiq9090-coder', repo: 'Remember-Me', protocol: 'https' });
  // autoDownload is off: Updates.check starts the download once it has checked the mirror's answer.
  assert.deepEqual([updater.autoDownload, updater.autoInstallOnAppQuit, updater.allowPrerelease, updater.allowDowngrade], [false, false, false, false]);
});

// ---------------------------------------------------------------- update mirror (update-feed.js)
const MIRROR = { feed: { provider: 'generic', url: 'https://updates.fastkiwi.app/remember-me/' }, expect: { version: '9.9.9', path: 'Remember-Me-Setup-9.9.9-x64.exe', sha512: 'S'.repeat(86) + '==' } };
const offer = (version = '9.9.9', file = { url: MIRROR.expect.path, sha512: MIRROR.expect.sha512 }) => ({ isUpdateAvailable: true, updateInfo: { version, files: [file] } });

test('a trusted mirror is read first, and the download starts only after its answer was checked', async () => {
  const { updater, updates } = setup({ consent: true, chooseFeed: async () => MIRROR });
  updater.result = () => offer();
  assert.equal((await updates.check()).state, 'downloading');
  assert.deepEqual(updater.feeds, ['generic'], 'GitHub is not asked');
  assert.equal(updater.downloads, 1);
  // Without the mirror (unreachable or not trusted) it is GitHub, as before.
  const plain = setup({ consent: true });
  plain.updater.result = () => offer();
  await plain.updates.check();
  assert.deepEqual(plain.updater.feeds, []);
  assert.equal(plain.updater.downloads, 1);
});

test('the mirror failing, or serving something other than what was checked, falls back to GitHub', async () => {
  const github = { version: '9.9.9', files: [{ url: 'Remember-Me-Setup-9.9.9-x64.exe', sha512: 'G'.repeat(86) + '==' }] };
  for (const [what, fromMirror] of [
    ['mirror error', new Error('HTTP 503')],
    ['another version', offer('9.9.10')],
    ['another file', offer('9.9.9', { url: 'evil.exe', sha512: MIRROR.expect.sha512 })],
    ['another checksum', offer('9.9.9', { url: MIRROR.expect.path, sha512: 'X'.repeat(86) + '==' })],
  ]) {
    const { updater, updates, app } = setup({ consent: true, chooseFeed: async () => MIRROR });
    updater.result = feed => feed.provider === 'generic' ? fromMirror : { isUpdateAvailable: true, updateInfo: github };
    assert.equal((await updates.check()).state, 'downloading', what);
    assert.deepEqual(updater.feeds, ['generic', 'github'], what);
    assert.ok(!app.states.includes('error'), `${what}: the mirror's failure is not shown`);
  }
  // chooseFeed itself failing is the same as no mirror.
  const { updater, updates } = setup({ consent: true, chooseFeed: async () => { throw new Error('boom'); } });
  updater.result = () => offer();
  assert.equal((await updates.check()).state, 'downloading');
  assert.deepEqual(updater.feeds, []);
});

test('a failed download from the mirror is tried again from GitHub', async () => {
  const { updater, updates, app } = setup({ consent: true, chooseFeed: async () => MIRROR });
  updater.result = () => offer();
  updater.failDownloadFrom = 'generic';
  await updates.check();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updater.feeds, ['generic', 'github']);
  assert.equal(updater.downloads, 2);
  assert.ok(!app.states.includes('error'));
  assert.equal(updates.status().state, 'downloading');
  // GitHub failing too is an error, as before.
  const both = setup({ consent: true, chooseFeed: async () => MIRROR });
  both.updater.result = () => offer();
  both.updater.failDownloadFrom = 'generic';
  both.updater.setFeedURL = function (feed) { this.feed = feed; this.feeds.push(feed.provider); this.failDownloadFrom = feed.provider; };
  await both.updates.check();
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(both.updates.status().state, 'error');
});

test('an up-to-date mirror means up to date; nothing older is ever offered', async () => {
  const { updater, updates } = setup({ consent: true, chooseFeed: async () => MIRROR });
  updater.result = () => ({ isUpdateAvailable: false, updateInfo: { version: '1.5.0' } });
  assert.equal((await updates.check()).state, 'latest');
  assert.deepEqual(updater.feeds, ['generic']);
  assert.equal(updater.downloads, 0);
});

test('settings.autoUpdate is null until the user answers, and unknown values become null', () => {
  assert.equal(initialState().settings.autoUpdate, null);
  const saved = settings => validateState({ ...initialState(), settings }).settings.autoUpdate;
  assert.equal(saved({}), null, 'Data from v1.4 has no answer yet');
  assert.equal(saved({ autoUpdate: true }), true);
  assert.equal(saved({ autoUpdate: false }), false);
  for (const value of ['true', 1, 0, {}, [], undefined]) assert.equal(saved({ autoUpdate: value }), null);
});

test('download progress notifies the window only on whole 10% steps', async () => {
  const { updater, updates, app } = setup({ consent: true });
  updater.result = available;
  await updates.check();
  const before = app.changes;
  for (let tenths = 0; tenths <= 1000; tenths++) updater.emit('download-progress', { percent: tenths / 10 });
  assert.equal(app.changes - before, 10, 'From 10% to 100%: ten updates instead of a thousand');
  assert.equal(updates.status().percent, 100);
});

test('only a copy the installer put there updates itself; portable and Scoop copies do not', () => {
  const { installedByInstaller, UNINSTALLER } = require('../src/platform/updates');
  const dir = path.join('C:', 'Users', 'me', 'AppData', 'Local', 'Programs', 'Remember Me');
  const files = new Set([path.join(dir, UNINSTALLER)]);
  const exists = file => files.has(file);
  assert.equal(UNINSTALLER, 'Uninstall Remember Me.exe', "electron-builder's name for the NSIS uninstaller");
  assert.equal(installedByInstaller(path.join(dir, 'Remember Me.exe'), exists), true);
  assert.equal(installedByInstaller(path.join('C:', 'Users', 'me', 'scoop', 'apps', 'remember-me', 'current', 'Remember Me.exe'), exists), false);
  const { updates } = setup({ consent: null });
  assert.equal(updates.status().available, true);
  const managed = new Updates({ updater: new FakeUpdater(), available: false, version: '1.5.0', consent: () => null });
  assert.equal(managed.status().available, false, 'The window then shows no consent card');
});
