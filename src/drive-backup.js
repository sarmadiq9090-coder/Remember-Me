'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createHash } = require('node:crypto');
const { writeDurable } = require('./core');
const { silent } = require('./logger');
const { exportBackup, BACKUP_INFO } = require('./attachments');
const { validKeep, expiredBackups, rotateBackups } = require('./backups');

// Google Drive for desktop owns authentication, upload retries and offline syncing.
// Remember Me only reports handing a complete backup to the user-selected sync folder.
class DriveBackup {
  constructor(directory, getState, onChange = () => {}, options = {}) {
    this.directory = directory;
    this.file = path.join(directory, 'drive-backup.json');
    this.getState = getState;
    this.onChange = onChange;
    this.clock = options.clock || (() => Date.now());
    this.exporter = options.exporter || exportBackup;
    this.text = options.text || (ar => ar);
    this.log = options.log || silent;
    this.running = null;
    this.config = { folder: '', automatic: true, lastCopiedAt: null, lastLocalPath: '', lastDrivePath: '', pending: false, error: '', lastAttempt: 0, keep: 0, unavailableSince: null, skipped: [], snapshotAt: null, snapshotHash: '' };
    if (fs.existsSync(this.file)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (typeof data.folder !== 'string' || (data.folder && !path.isAbsolute(data.folder))) throw new Error('invalid');
        Object.assign(this.config, data);
        if (!validKeep(this.config.keep)) this.config.keep = 0;
        if (!Array.isArray(this.config.skipped)) this.config.skipped = [];
      } catch { this.config.error = this.text('تعذّرت قراءة إعدادات النسخ إلى Drive. اختر مجلد المزامنة مجددًا.', 'Could not read the Drive backup settings. Choose the sync folder again.'); }
    }
  }
  status() {
    const available = !!this.config.folder && fs.existsSync(this.config.folder);
    // Warn once the sync folder has been missing for over a day, e.g. Drive signed out or not running.
    const stale = !available && !!this.config.unavailableSince && this.clock() - Date.parse(this.config.unavailableSince) > 86400000;
    return { ...this.config, busy: !!this.running, available, stale };
  }
  save() {
    fs.mkdirSync(this.directory, { recursive: true });
    // Retries a rename briefly locked by antivirus or the search indexer, like data.json.
    writeDurable(this.file, JSON.stringify(this.config, null, 2));
    this.onChange();
  }
  async configure(folder) {
    if (this.running) throw new Error(this.text('انتظر اكتمال النسخة الحالية.', 'Wait for the current backup to finish.'));
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || !(await fsp.stat(folder)).isDirectory()) throw new Error(this.text('اختر مجلد Google Drive المتزامن.', 'Choose the synced Google Drive folder.'));
    const root = path.resolve(folder), local = path.resolve(this.directory);
    if (root === local || root.startsWith(local + path.sep)) throw new Error(this.text('اختر وجهة خارج مجلد بيانات ذكرني.', 'Choose a destination outside the Remember Me data folder.'));
    this.config.folder = root;
    this.config.error = '';
    this.config.unavailableSince = null;
    this.config.lastDrivePath = '';
    this.config.lastCopiedAt = null;
    this.save();
  }
  setAutomatic(value) { this.config.automatic = !!value; this.save(); }
  // Where automatic copies live: the local backups folder and, when mounted, the Drive folder.
  rotationTargets() {
    const targets = [[path.join(this.directory, 'backups'), [this.config.lastLocalPath]]];
    if (this.config.folder && fs.existsSync(this.config.folder)) targets.push([this.config.folder, [this.config.lastDrivePath]]);
    return targets;
  }
  async expired(keep = this.config.keep) {
    const lists = await Promise.all(this.rotationTargets().map(([parent, protect]) => expiredBackups(parent, keep, protect)));
    return lists.flat();
  }
  async setKeep(keep) {
    if (!validKeep(keep)) throw new Error('invalid keep');
    this.config.keep = keep; this.save();
    return this.rotate();
  }
  async rotate() {
    const lists = [];
    for (const [parent, protect] of this.rotationTargets()) lists.push(await rotateBackups(parent, this.config.keep, protect));
    return lists.flat();
  }
  async copySnapshot(source) {
    const folder = this.config.folder;
    // Never create a missing Drive mount as a normal local folder.
    if (!folder || !fs.existsSync(folder)) throw new Error(this.text('مجلد Google Drive غير متاح. افتح Google Drive وسجّل الدخول؛ النسخة المحلية محفوظة وستُعاد المحاولة.', 'The Google Drive folder is unavailable. Open Google Drive and sign in; the local copy is saved and the backup will be retried.'));
    const destination = path.join(folder, path.basename(source));
    await fsp.mkdir(destination, { recursive: true });
    const files = path.join(source, 'attachments');
    if (fs.existsSync(files)) await fsp.cp(files, path.join(destination, 'attachments'), { recursive: true });
    if (fs.existsSync(path.join(source, BACKUP_INFO))) await fsp.copyFile(path.join(source, BACKUP_INFO), path.join(destination, BACKUP_INFO));
    // A manifest is the completion marker; write it only after every attachment.
    await fsp.copyFile(path.join(source, 'data.json'), path.join(destination, 'data.json'));
    return destination;
  }
  async perform() {
    try {
      if (!this.config.folder) throw new Error(this.text('اختر مجلدًا داخل Google Drive أولًا.', 'Choose a folder inside Google Drive first.'));
      this.config.lastAttempt = this.clock();
      // A snapshot left pending by a failed copy is reused only while it still matches the data and
      // is under a day old; otherwise a retry days later would upload old data under a new date.
      const state = this.getState();
      const fingerprint = createHash('sha256').update(JSON.stringify(state), 'utf8').digest('hex');
      const reusable = this.config.pending && this.config.lastLocalPath && fs.existsSync(path.join(this.config.lastLocalPath, 'data.json'))
        && this.config.snapshotHash === fingerprint && this.age(this.config.snapshotAt) < 86400000;
      if (!reusable) {
        const parent = path.join(this.directory, 'backups');
        await fsp.mkdir(parent, { recursive: true });
        // Attachments whose files are missing are left out and reported, not allowed to block the backup.
        const skipped = [];
        this.config.lastLocalPath = await this.exporter(state, this.directory, parent, { kind: 'automatic', skipped });
        this.config.skipped = skipped;
        this.config.snapshotAt = new Date(this.clock()).toISOString();
        this.config.snapshotHash = fingerprint;
        this.config.pending = true;
        this.save();
      }
      this.config.lastDrivePath = await this.copySnapshot(this.config.lastLocalPath);
      this.config.lastCopiedAt = new Date(this.clock()).toISOString();
      this.config.pending = false;
      this.config.error = '';
      this.save();
      // Old copies are only removed after a new one is complete; a failure here never fails the backup.
      await this.rotate().catch(error => this.log.warn('backup-rotation-failed', error));
      this.log.info('drive-backup', { reused: !!reusable, skipped: this.config.skipped.length });
      return this.status();
    } catch (error) {
      this.log.warn('drive-backup-failed', error);
      this.config.error = error.message || this.text('تعذّر نسخ الملفات إلى مجلد Google Drive.', 'Could not copy the files to the Google Drive folder.');
      // Report the backup's own failure, not a later one while recording it.
      try { this.save(); } catch { /* the in-memory status still shows the error */ }
      throw error;
    }
  }
  run() {
    if (this.running) return this.running;
    this.running = this.perform().finally(() => { this.running = null; this.onChange(); });
    this.onChange();
    return this.running;
  }
  // Records when the sync folder went missing, so a long outage can be reported.
  watchAvailability() {
    if (!this.config.folder) return;
    const available = fs.existsSync(this.config.folder);
    if (available === !this.config.unavailableSince) return;
    this.config.unavailableSince = available ? null : new Date(this.clock()).toISOString();
    this.save();
  }
  async tick() {
    this.watchAvailability();
    if (!this.config.automatic || !this.config.folder || this.running) return;
    const due = this.config.pending || this.age(this.config.lastCopiedAt) >= 86400000;
    if (due && this.age(this.config.lastAttempt) >= 900000) await this.run().catch(() => {});
  }
  // Milliseconds since a stored time. Missing times, and times in the future (the clock was ahead and
  // has been corrected), count as long ago, so a backup is never held back until the clock catches up.
  age(stamp) {
    const time = typeof stamp === 'number' ? stamp : Date.parse(stamp);
    const now = this.clock();
    return stamp && Number.isFinite(time) && time <= now ? now - time : Infinity;
  }
}
module.exports = { DriveBackup };
