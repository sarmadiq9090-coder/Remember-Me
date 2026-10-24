'use strict';
const { UserError } = require('./core/errors');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateState } = require('./core/tasks');
const { BACKUP_INFO, attachmentPath, exportBackup, hashFile } = require('./attachments');
// Folder names of the app's own backups. Versions up to 1.4 used the old internal name, Waqt.
const BACKUP_PREFIXES = ['RememberMe-backup-', 'Waqt-backup-'];
// Settings that belong to this PC rather than to the data; a restore keeps the current values.
const MACHINE_SETTINGS = ['autoUpdate', 'startAtLogin', 'pausedUntil'];

// Reads a backup folder and checks it completely before anything is restored from it.
// Backups made before v1.5 have no backup.json: they are accepted when every file is present
// with its recorded size, and reported as unverified.
async function readBackup(folder) {
  let raw;
  try { raw = await fsp.readFile(path.join(folder, 'data.json'), 'utf8'); }
  catch { throw new Error('This folder does not contain a Remember Me backup.'); }
  let state;
  try { state = validateState(JSON.parse(raw)); }
  catch { throw new Error('The backup data file is invalid.'); }
  let info = null;
  try { info = JSON.parse(await fsp.readFile(path.join(folder, BACKUP_INFO), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('The backup checksum file is invalid.', { cause: error }); }
  if (info && (info.algorithm !== 'sha256' || !info.files || typeof info.files !== 'object')) throw new Error('The backup checksum file is invalid.');
  const damaged = name => new UserError("The backup is damaged: \"{name}\" does not match its saved checksum.", { name: name });
  if (info && createHash('sha256').update(raw, 'utf8').digest('hex') !== info.files['data.json']) throw damaged('data.json');
  for (const record of state.attachments) {
    const file = attachmentPath(folder, record);
    let stat;
    try { stat = await fsp.lstat(file); } catch { stat = null; }
    if (!stat || !stat.isFile() || stat.size !== record.size) throw new UserError("The backup is incomplete: \"{name}\" is missing or changed size.", { name: record.name });
    if (info && info.files[`attachments/${record.id}/${record.name}`] !== await hashFile(file)) throw damaged(record.name);
  }
  return { folder, state, verified: !!info, kind: info?.kind || 'unknown', createdAt: info?.createdAt || null };
}

// A complete copy of the current data in the backups folder, taken before a restore or an
// update. Safety copies are never rotated away.
async function safetyBackup(directory, state, prefix) {
  const parent = path.join(directory, 'backups');
  await fsp.mkdir(parent, { recursive: true });
  return exportBackup(state, directory, parent, { kind: 'safety', prefix });
}
// Replaces the current data with a backup read by readBackup. The current data is exported
// first, so a restore can always be undone from the backups folder.
async function restoreBackup(directory, store, backup) {
  const safety = await safetyBackup(directory, store.state, 'RememberMe-before-restore-');
  for (const record of backup.state.attachments) {
    const source = attachmentPath(backup.folder, record), target = attachmentPath(directory, record);
    const existing = await fsp.lstat(target).catch(() => null);
    if (existing && existing.isFile() && existing.size === record.size && await hashFile(target) === await hashFile(source)) continue;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target + '.restoring');
    await fsp.rename(target + '.restoring', target);
  }
  // Choices about this PC are not part of the data: a backup must not turn update checks back on
  // without consent, flip start with Windows without updating the Windows entry, or end a pause.
  const settings = { ...backup.state.settings };
  for (const key of MACHINE_SETTINGS) {
    if (key in store.state.settings) settings[key] = store.state.settings[key];
    else delete settings[key];
  }
  store.replace({ ...backup.state, settings });
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
    if (!entry.isDirectory() || !BACKUP_PREFIXES.some(prefix => entry.name.startsWith(prefix))) continue;
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
module.exports = { BACKUP_PREFIXES, MACHINE_SETTINGS, validKeep, readBackup, safetyBackup, restoreBackup, expiredBackups, rotateBackups };
