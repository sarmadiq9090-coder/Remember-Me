'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { matchesExpected } = require('./update-feed.js');
// New versions come from the update mirror on Cloudflare when it is trusted (update-feed.js,
// docs/specs/update-manifest.md), otherwise from this repository's GitHub Releases, over HTTPS only.
// tools/package.mjs writes the GitHub feed into resources/app-update.yml, which electron-updater
// also reads, and the installer's latest.yml is made for it.
const FEED = { provider: 'github', owner: 'sarmadiq9090-coder', repo: 'Remember-Me', protocol: 'https' };
const UPDATER_CACHE = 'remember-me-updater';
const PROGRESS_STEP = 10;
const FIRST_CHECK = 30 * 1000, CHECK_EVERY = 24 * 60 * 60 * 1000, TICK = 60 * 60 * 1000, BACKUP_LIMIT = 2 * 60 * 1000;

// electron-updater updates by running the NSIS installer, which suits only installed copies. A copy
// without the installer's uninstaller next to its exe (the portable build, or one Scoop unpacked)
// is kept up to date by whatever put it there, so it offers no updates of its own.
const UNINSTALLER = 'Uninstall Remember Me.exe';
function installedByInstaller(execPath, exists = fs.existsSync) { return exists(path.join(path.dirname(execPath), UNINSTALLER)); }
// Where this copy's new versions come from:
// - 'store': a Microsoft Store (MSIX) package (Electron sets process.windowsStore). The Store updates
//   it, and Store policy forbids an app updating itself, so electron-updater is never loaded.
// - 'github': installed by the NSIS installer, or a development build (where electron-updater does nothing).
// - 'elsewhere': the portable build or one Scoop unpacked, kept up to date by whatever put it there.
function updateSource({ windowsStore, packaged, execPath, exists = fs.existsSync }) {
  if (windowsStore === true) return 'store';
  return !packaged || installedByInstaller(execPath, exists) ? 'github' : 'elsewhere';
}
// Stands in for electron-updater where the app must not update itself: it never contacts GitHub.
function offlineUpdater() {
  return Object.assign(new (require('node:events'))(), { checkForUpdates: async () => null, quitAndInstall() {} });
}
// electron-updater's autoUpdater for 'github' copies only. `load` requires electron-updater, so a
// Store package or a test run never even loads it.
function createUpdater({ source, testMode = false, load = () => require('electron-updater').autoUpdater }) {
  return testMode || source !== 'github' ? offlineUpdater() : configure(load());
}

// Applies the app's update policy to electron-updater's autoUpdater.
function configure(updater) {
  updater.setFeedURL(FEED);
  // Updates.check starts the download itself, once it has checked what the mirror answered.
  updater.autoDownload = false;
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
  // available: false for a copy that gets its updates elsewhere; the window then doesn't ask for consent.
  // source 'store': Microsoft Store updates this copy, so nothing is ever checked, downloaded or
  // installed here, and the window says updates come from the Store.
  // chooseFeed: resolves to { feed, expect } to read the update mirror (update-feed.js chooseFeed), or
  // null for the GitHub feed. The default never asks the mirror.
  constructor({ updater, consent, version, backup, prepareQuit, quit, available = true, source = 'github', onChange = () => {}, clock = () => Date.now(), timers = globalThis, chooseFeed = async () => null, githubFeed = FEED }) {
    if (source === 'store') available = false;
    Object.assign(this, { updater, consent, version, backup, prepareQuit, quit, available, source, onChange, clock, timers, chooseFeed, githubFeed });
    this.state = 'idle';
    // True while a failure would only mean "try GitHub instead": no 'error' state for it.
    this.quiet = false;
    this.next = null; this.percent = 0; this.checkedAt = null; this.dismissed = false;
    this.running = null; this.timeout = null; this.interval = null;
    updater.on('update-available', info => this.set({ state: 'downloading', next: info.version, percent: 0 }));
    // electron-updater reports progress about once a second; the window only hears of whole 10% steps.
    updater.on('download-progress', progress => {
      const percent = Math.min(100, Math.floor((progress.percent || 0) / PROGRESS_STEP) * PROGRESS_STEP);
      if (this.state === 'downloading' && percent !== this.percent) this.set({ percent });
    });
    updater.on('update-downloaded', info => this.set({ state: 'ready', next: info.version, dismissed: false }));
    updater.on('error', () => {
      if (this.quiet) return;
      if (['checking', 'downloading'].includes(this.state)) this.set({ state: 'error' });
      // The installer could not be started after the app began quitting: finish quitting.
      else if (this.state === 'installing') { this.set({ state: 'error' }); this.quit(); }
    });
  }
  set(fields) { Object.assign(this, fields); this.onChange(); }
  status() {
    return { state: this.state, version: this.version, next: this.next, percent: this.percent, checkedAt: this.checkedAt, banner: this.state === 'ready' && !this.dismissed, available: this.available, source: this.source };
  }
  start() {
    this.stop();
    if (this.source === 'store') return;
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
    if (this.source === 'store') return Promise.resolve(this.status());
    if (this.running) return this.running;
    if (['downloading', 'ready', 'installing'].includes(this.state)) return Promise.resolve(this.status());
    this.set({ state: 'checking' });
    this.running = (async () => {
      try {
        const { result, mirror } = await this.find();
        this.checkedAt = this.clock();
        // null: not an installed build, so electron-updater does nothing.
        if (!result) this.set({ state: 'unavailable' });
        else if (!result.isUpdateAvailable) this.set({ state: 'latest' });
        else {
          if (this.state === 'checking') this.set({ state: 'downloading', next: result.updateInfo.version });
          this.download(mirror);
        }
      } catch { this.checkedAt = this.clock(); this.set({ state: 'error' }); }
      finally { this.running = null; }
      return this.status();
    })();
    return this.running;
  }
  // electron-updater's answer: from the mirror when chooseFeed trusts it and electron-updater read
  // exactly what was checked, otherwise from GitHub.
  async find() {
    let choice;
    try { choice = await this.chooseFeed(); } catch { choice = null; }
    if (choice) {
      this.updater.setFeedURL(choice.feed);
      this.quiet = true;
      try {
        const result = await this.updater.checkForUpdates();
        if (!result?.isUpdateAvailable || matchesExpected(result.updateInfo, choice.expect)) return { result, mirror: true };
      } catch { /* the mirror failed: GitHub below */ }
      finally { this.quiet = false; }
      this.updater.setFeedURL(this.githubFeed);
    }
    return { result: await this.updater.checkForUpdates(), mirror: false };
  }
  // A download from the mirror that fails is tried once more from GitHub; electron-updater checks
  // each download against the SHA-512 of the latest.yml it read.
  download(mirror) {
    this.quiet = mirror;
    Promise.resolve().then(() => this.updater.downloadUpdate()).then(() => { this.quiet = false; }, async () => {
      this.quiet = false;
      if (!mirror) return; // the 'error' event already showed it
      this.updater.setFeedURL(this.githubFeed);
      try {
        const result = await this.updater.checkForUpdates();
        if (result?.isUpdateAvailable) this.download(false); else this.set({ state: 'error' });
      } catch { this.set({ state: 'error' }); }
    });
  }
  dismiss() { this.set({ dismissed: true }); }
  async safetyBackup() {
    let timer;
    const limit = new Promise((resolve, reject) => { timer = this.timers.setTimeout(() => reject(new Error('The safety backup took too long.')), BACKUP_LIMIT); });
    try { await Promise.race([this.backup(), limit]); } finally { this.timers.clearTimeout(timer); }
  }
  // "Restart now": the only way the app restarts for an update, even while a reminder is showing.
  async restart() {
    if (this.state !== 'ready' || this.source === 'store') return false;
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
    if (this.state !== 'ready' || this.source === 'store') return false;
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
module.exports = { FEED, UPDATER_CACHE, FIRST_CHECK, CHECK_EVERY, UNINSTALLER, installedByInstaller, updateSource, createUpdater, configure, Updates };
