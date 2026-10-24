'use strict';
// New versions come from this repository's GitHub Releases, over HTTPS only. tools/package.mjs
// writes the same feed into resources/app-update.yml, which electron-updater also reads.
const FEED = { provider: 'github', owner: 'sarmadiq9090-coder', repo: 'Remember-Me', protocol: 'https' };
const UPDATER_CACHE = 'remember-me-updater';
const FIRST_CHECK = 30 * 1000, CHECK_EVERY = 24 * 60 * 60 * 1000, TICK = 60 * 60 * 1000, BACKUP_LIMIT = 2 * 60 * 1000;

// Applies the app's update policy to electron-updater's autoUpdater.
function configure(updater) {
  updater.setFeedURL(FEED);
  updater.autoDownload = true;
  // Installing on quit is done by Updates.beforeQuit, after a safety backup.
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  // CODE SIGNING: once releases are signed, add `publisherName` to app-update.yml in
  // tools/package.mjs. electron-updater then checks each downloaded installer's signature with
  // updater.verifyUpdateCodeSignature and refuses one signed by anyone else. Until then a
  // download is only checked against the SHA-512 in the release's latest.yml.
  return updater;
}

// Background checks run only with consent (settings.autoUpdate === true): about 30 seconds after
// start, then once a day. "Check now" works either way. A downloaded update installs when the
// user chooses Restart now, or on the next normal quit; the app never restarts on its own.
class Updates {
  constructor({ updater, consent, version, backup, prepareQuit, quit, onChange = () => {}, clock = () => Date.now(), timers = globalThis }) {
    Object.assign(this, { updater, consent, version, backup, prepareQuit, quit, onChange, clock, timers });
    this.state = 'idle';
    this.next = null; this.percent = 0; this.checkedAt = null; this.dismissed = false;
    this.running = null; this.timeout = null; this.interval = null;
    updater.on('update-available', info => this.set({ state: 'downloading', next: info.version, percent: 0 }));
    updater.on('download-progress', progress => { if (this.state === 'downloading') this.set({ percent: Math.floor(progress.percent || 0) }); });
    updater.on('update-downloaded', info => this.set({ state: 'ready', next: info.version, dismissed: false }));
    updater.on('error', () => {
      if (['checking', 'downloading'].includes(this.state)) this.set({ state: 'error' });
      // The installer could not be started after the app began quitting: finish quitting.
      else if (this.state === 'installing') { this.set({ state: 'error' }); this.quit(); }
    });
  }
  set(fields) { Object.assign(this, fields); this.onChange(); }
  status() {
    return { state: this.state, version: this.version, next: this.next, percent: this.percent, checkedAt: this.checkedAt, banner: this.state === 'ready' && !this.dismissed };
  }
  start() {
    this.stop();
    this.timeout = this.timers.setTimeout(() => { this.interval = this.timers.setInterval(() => this.tick(), TICK); return this.tick(); }, FIRST_CHECK);
  }
  stop() { this.timers.clearTimeout(this.timeout); this.timers.clearInterval(this.interval); this.timeout = this.interval = null; }
  // Call after settings.autoUpdate changes; turning it on checks soon, as at start.
  consentChanged() { if (this.consent() === true) this.start(); }
  tick() {
    if (this.consent() !== true) return;
    if (this.checkedAt && this.clock() - this.checkedAt < CHECK_EVERY) return;
    return this.check();
  }
  // Offline and other failures only show as the 'error' state in Settings.
  check() {
    if (this.running) return this.running;
    if (['downloading', 'ready', 'installing'].includes(this.state)) return Promise.resolve(this.status());
    this.set({ state: 'checking' });
    this.running = (async () => {
      try {
        const result = await this.updater.checkForUpdates();
        this.checkedAt = this.clock();
        // null: not an installed build, so electron-updater does nothing.
        if (!result) this.set({ state: 'unavailable' });
        else if (!result.isUpdateAvailable) this.set({ state: 'latest' });
        else {
          result.downloadPromise?.catch(() => {});
          if (this.state === 'checking') this.set({ state: 'downloading', next: result.updateInfo.version });
        }
      } catch { this.checkedAt = this.clock(); this.set({ state: 'error' }); }
      finally { this.running = null; }
      return this.status();
    })();
    return this.running;
  }
  dismiss() { this.set({ dismissed: true }); }
  async safetyBackup() {
    let timer;
    const limit = new Promise((resolve, reject) => { timer = this.timers.setTimeout(() => reject(new Error('The safety backup took too long.')), BACKUP_LIMIT); });
    try { await Promise.race([this.backup(), limit]); } finally { this.timers.clearTimeout(timer); }
  }
  // "Restart now": the only way the app restarts for an update, even while a reminder is showing.
  async restart() {
    if (this.state !== 'ready') return false;
    this.set({ state: 'installing' });
    try { await this.safetyBackup(); }
    catch (error) { this.set({ state: 'ready' }); throw error; }
    this.install(true);
    return true;
  }
  install(runAfter) {
    this.stop();
    // The windows only allow closing once the app is quitting; without this the installer waits forever.
    this.prepareQuit();
    this.updater.quitAndInstall(true, runAfter);
  }
  // From app 'before-quit'. With an update ready, the quit waits for a safety backup, then installs
  // without starting the app again. If the backup fails the app just quits and offers it next time.
  beforeQuit(event) {
    if (this.state !== 'ready') return false;
    event.preventDefault();
    this.set({ state: 'installing' });
    this.safetyBackup().then(() => this.install(false), error => {
      console.error('Update not installed: the safety backup failed.', error);
      this.set({ state: 'error' });
      this.prepareQuit();
      this.quit();
    });
    return true;
  }
}
module.exports = { FEED, UPDATER_CACHE, FIRST_CHECK, CHECK_EVERY, configure, Updates };
