'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateState } = require('./core');
const { BACKUP_INFO, attachmentPath, exportBackup, hashFile } = require('./attachments');
const arabic = ar => ar;

// Reads a backup folder and checks it completely before anything is restored from it.
// Backups made before v1.5 have no backup.json: they are accepted when every file is present
// with its recorded size, and reported as unverified.
async function readBackup(folder, { text = arabic } = {}) {
  let raw;
  try { raw = await fsp.readFile(path.join(folder, 'data.json'), 'utf8'); }
  catch { throw new Error(text('هذا المجلد لا يحتوي على نسخة احتياطية من ذكرني.', 'This folder does not contain a Remember Me backup.')); }
  let state;
  try { state = validateState(JSON.parse(raw)); }
  catch { throw new Error(text('ملف بيانات النسخة الاحتياطية غير صالح.', 'The backup data file is invalid.')); }
  let info = null;
  try { info = JSON.parse(await fsp.readFile(path.join(folder, BACKUP_INFO), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(text('ملف بصمات النسخة الاحتياطية غير صالح.', 'The backup checksum file is invalid.')); }
  if (info && (info.algorithm !== 'sha256' || !info.files || typeof info.files !== 'object')) throw new Error(text('ملف بصمات النسخة الاحتياطية غير صالح.', 'The backup checksum file is invalid.'));
  const damaged = name => new Error(text(`النسخة الاحتياطية تالفة: «${name}» لا يطابق بصمته المحفوظة.`, `The backup is damaged: "${name}" does not match its saved checksum.`));
  if (info && createHash('sha256').update(raw, 'utf8').digest('hex') !== info.files['data.json']) throw damaged('data.json');
  for (const record of state.attachments) {
    const file = attachmentPath(folder, record);
    let stat;
    try { stat = await fsp.lstat(file); } catch { stat = null; }
    if (!stat || !stat.isFile() || stat.size !== record.size) throw new Error(text(`النسخة الاحتياطية ناقصة: الملف «${record.name}» مفقود أو تغيّر حجمه.`, `The backup is incomplete: "${record.name}" is missing or changed size.`));
    if (info && info.files[`attachments/${record.id}/${record.name}`] !== await hashFile(file)) throw damaged(record.name);
  }
  return { folder, state, verified: !!info, kind: info?.kind || 'unknown', createdAt: info?.createdAt || null };
}

// Replaces the current data with a backup read by readBackup. The current data is exported
// first, so a restore can always be undone from the backups folder.
async function restoreBackup(directory, store, backup) {
  const parent = path.join(directory, 'backups');
  await fsp.mkdir(parent, { recursive: true });
  const safety = await exportBackup(store.state, directory, parent, { kind: 'safety', prefix: 'Waqt-before-restore-' });
  for (const record of backup.state.attachments) {
    const source = attachmentPath(backup.folder, record), target = attachmentPath(directory, record);
    const existing = await fsp.lstat(target).catch(() => null);
    if (existing && existing.isFile() && existing.size === record.size && await hashFile(target) === await hashFile(source)) continue;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target + '.restoring');
    await fsp.rename(target + '.restoring', target);
  }
  store.replace(backup.state);
  return { safety };
}
const validKeep = keep => Number.isInteger(keep) && keep >= 0 && keep <= 100;
// Automatic backups beyond the newest `keep` in `parent`, oldest last. Only folders whose
// backup.json says the app made them on its own are candidates, so manual exports, safety
// copies and backups from before checksums are never removed. 0 keeps everything.
async function expiredBackups(parent, keep, protect = []) {
  if (!keep) return [];
  const kept = new Set(protect.filter(Boolean).map(p => path.resolve(p).toLowerCase()));
  const automatic = [];
  for (const entry of await fsp.readdir(parent, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !entry.name.startsWith('Waqt-backup-')) continue;
    const folder = path.join(parent, entry.name);
    try {
      const info = JSON.parse(await fsp.readFile(path.join(folder, BACKUP_INFO), 'utf8'));
      if (info.kind === 'automatic' && fs.existsSync(path.join(folder, 'data.json'))) automatic.push({ folder, createdAt: Date.parse(info.createdAt) || 0 });
    } catch { /* Not ours or incomplete: leave it alone. */ }
  }
  automatic.sort((a, b) => b.createdAt - a.createdAt);
  return automatic.slice(keep).map(b => b.folder).filter(folder => !kept.has(path.resolve(folder).toLowerCase()));
}
async function rotateBackups(parent, keep, protect) {
  const expired = await expiredBackups(parent, keep, protect);
  for (const folder of expired) await fsp.rm(folder, { recursive: true, force: true });
  return expired;
}
module.exports = { validKeep, readBackup, restoreBackup, expiredBackups, rotateBackups };
