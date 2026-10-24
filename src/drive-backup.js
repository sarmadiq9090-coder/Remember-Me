'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { exportBackup } = require('./attachments');

// Google Drive for desktop owns authentication, upload retries and offline syncing.
// Waqt only reports handing a complete backup to the user-selected sync folder.
class DriveBackup {
  constructor(directory, getState, onChange = () => {}, options = {}) {
    this.directory = directory;
    this.file = path.join(directory, 'drive-backup.json');
    this.getState = getState;
    this.onChange = onChange;
    this.clock = options.clock || (() => Date.now());
    this.exporter = options.exporter || exportBackup;
    this.running = null;
    this.config = { folder: '', automatic: true, lastCopiedAt: null, lastLocalPath: '', lastDrivePath: '', pending: false, error: '', lastAttempt: 0 };
    if (fs.existsSync(this.file)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (typeof data.folder !== 'string' || (data.folder && !path.isAbsolute(data.folder))) throw new Error('invalid');
        Object.assign(this.config, data);
      } catch { this.config.error = 'تعذّرت قراءة إعدادات النسخ إلى Drive. اختر مجلد المزامنة مجددًا.'; }
    }
  }
  status() { return { ...this.config, busy: !!this.running, available: !!this.config.folder && fs.existsSync(this.config.folder) }; }
  save() {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.config, null, 2), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
    this.onChange();
  }
  async configure(folder) {
    if (this.running) throw new Error('انتظر اكتمال النسخة الحالية.');
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || !(await fsp.stat(folder)).isDirectory()) throw new Error('اختر مجلد Google Drive المتزامن.');
    const root = path.resolve(folder), local = path.resolve(this.directory);
    if (root === local || root.startsWith(local + path.sep)) throw new Error('اختر وجهة خارج مجلد بيانات وقت.');
    this.config.folder = root;
    this.config.error = '';
    this.config.lastDrivePath = '';
    this.config.lastCopiedAt = null;
    this.save();
  }
  setAutomatic(value) { this.config.automatic = !!value; this.save(); }
  async copySnapshot(source) {
    const folder = this.config.folder;
    // Never create a missing Drive mount as a normal local folder.
    if (!folder || !fs.existsSync(folder)) throw new Error('مجلد Google Drive غير متاح. افتح Google Drive وسجّل الدخول؛ النسخة المحلية محفوظة وستُعاد المحاولة.');
    const destination = path.join(folder, path.basename(source));
    await fsp.mkdir(destination, { recursive: true });
    const files = path.join(source, 'attachments');
    if (fs.existsSync(files)) await fsp.cp(files, path.join(destination, 'attachments'), { recursive: true });
    // A manifest is the completion marker; write it only after every attachment.
    await fsp.copyFile(path.join(source, 'data.json'), path.join(destination, 'data.json'));
    return destination;
  }
  async perform() {
    try {
      if (!this.config.folder) throw new Error('اختر مجلدًا داخل Google Drive أولًا.');
      this.config.lastAttempt = this.clock();
      if (!this.config.pending || !this.config.lastLocalPath || !fs.existsSync(path.join(this.config.lastLocalPath, 'data.json'))) {
        const parent = path.join(this.directory, 'backups');
        await fsp.mkdir(parent, { recursive: true });
        this.config.lastLocalPath = await this.exporter(this.getState(), this.directory, parent);
        this.config.pending = true;
        this.save();
      }
      this.config.lastDrivePath = await this.copySnapshot(this.config.lastLocalPath);
      this.config.lastCopiedAt = new Date(this.clock()).toISOString();
      this.config.pending = false;
      this.config.error = '';
      this.save();
      return this.status();
    } catch (error) {
      this.config.error = error.message || 'تعذّر نسخ الملفات إلى مجلد Google Drive.';
      this.save();
      throw error;
    }
  }
  run() {
    if (this.running) return this.running;
    this.running = this.perform().finally(() => { this.running = null; this.onChange(); });
    this.onChange();
    return this.running;
  }
  async tick() {
    if (!this.config.automatic || !this.config.folder || this.running) return;
    const now = this.clock();
    const due = this.config.pending || !this.config.lastCopiedAt || now - Date.parse(this.config.lastCopiedAt) >= 86400000;
    if (due && (!this.config.lastAttempt || now - this.config.lastAttempt >= 900000)) await this.run().catch(() => {});
  }
}
module.exports = { DriveBackup };
