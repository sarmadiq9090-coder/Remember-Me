const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Updates, configure, FIRST_CHECK, CHECK_EVERY } = require('../src/updates');
const { initialState, validateState } = require('../src/core');

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
  constructor() { super(); this.checks = 0; this.result = { isUpdateAvailable: false, updateInfo: { version: '1.5.0' } }; this.installs = []; }
  setFeedURL(feed) { this.feed = feed; }
  async checkForUpdates() {
    this.checks++;
    if (this.offline) { const error = new Error('net::ERR_INTERNET_DISCONNECTED'); this.emit('error', error); throw error; }
    if (this.result?.isUpdateAvailable) this.emit('update-available', this.result.updateInfo);
    return this.result;
  }
  quitAndInstall(isSilent, runAfter) { this.installs.push({ isSilent, runAfter, quitting: this.app.quitting, backups: this.app.backups }); }
}
function setup({ consent = null, backup } = {}) {
  const timers = fakeTimers(), updater = new FakeUpdater();
  const app = { consent, quitting: false, backups: 0, quits: 0, changes: 0 };
  updater.app = app;
  const updates = new Updates({ updater, timers, clock: timers.now, version: '1.5.0', consent: () => app.consent,
    backup: backup || (async () => { app.backups++; }), prepareQuit: () => { app.quitting = true; }, quit: () => { app.quits++; }, onChange: () => { app.changes++; } });
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
  assert.equal(updates.status().percent, 42);
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
  assert.deepEqual([updater.autoDownload, updater.autoInstallOnAppQuit, updater.allowPrerelease, updater.allowDowngrade], [true, false, false, false]);
});

test('settings.autoUpdate is null until the user answers, and unknown values become null', () => {
  assert.equal(initialState().settings.autoUpdate, null);
  const saved = settings => validateState({ ...initialState(), settings }).settings.autoUpdate;
  assert.equal(saved({}), null, 'Data from v1.4 has no answer yet');
  assert.equal(saved({ autoUpdate: true }), true);
  assert.equal(saved({ autoUpdate: false }), false);
  for (const value of ['true', 1, 0, {}, [], undefined]) assert.equal(saved({ autoUpdate: value }), null);
});
