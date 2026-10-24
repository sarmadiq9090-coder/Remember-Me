'use strict';
const { UserError } = require('../core/errors');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const BACKUP_INFO = 'backup.json';
const { MAX_FILE_SIZE, MAX_ATTACHMENTS, idPattern, attachmentIds, validateAttachment } = require('../core/records');
// Files Windows would run or install (directly, through an interpreter, or by mounting) are shown
// in Explorer instead of being launched. Matching uses the final extension, so "report.pdf.exe" counts.
const programExtensions = new Set(('exe com bat cmd ps1 psm1 psd1 ps1xml ps2 ps2xml psc1 psc2 msh msh1 msh2 mshxml msh1xml msh2xml ' +
  'vb vbs vbe js jse jar wsf wsh wsc ws sct hta msi msp mst msc cpl pif scr lnk url website scf shb shs reg inf ins isp ' +
  'application appref-ms gadget xbap jnlp chm hlp settingcontent-ms diagcab diagcfg diagpkg appx appxbundle msix msixbundle ' +
  'appinstaller library-ms search-ms searchconnector-ms iso img vhd vhdx wsb rdp dll ocx sys drv xll xlam ppam ade adp mde accde ' +
  'py pyw pyz pyzw pyc msu vsix vsto ' +
  // Windows applies a theme as soon as it is opened, and its image and sound paths can point at a
  // network share (leaking the user's NTLM credentials), so themes are not opened either.
  'theme themepack deskthemepack desktopthemepackfile msstyles').split(' '));
function opensAsProgram(name) {
  // Bidirectional overrides can disguise an extension on screen ("gpj.exe" shown as "exe.jpg").
  if (/[\u202a-\u202e\u2066-\u2069]/.test(name)) return true;
  const dot = name.lastIndexOf('.');
  return dot >= 0 && programExtensions.has(name.slice(dot + 1).toLowerCase());
}
function attachmentPath(directory, record) {
  validateAttachment(record);
  return path.join(directory, 'attachments', record.id, record.name);
}
async function importFiles(directory, files) {
  if (!Array.isArray(files) || files.length > MAX_ATTACHMENTS) throw new Error('Choose up to 20 files at a time.');
  const selected = [];
  // Validate the entire selection before copying, so an error never partially attaches files.
  for (const file of files) {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('Choose files only.');
    if (stat.size > MAX_FILE_SIZE) throw new UserError('The file "{name}" is larger than 50 MB.', { name: path.basename(file) });
    selected.push({ source: file, record: validateAttachment({ id: randomUUID(), name: path.basename(file), size: stat.size, addedAt: new Date().toISOString() }) });
  }
  const copied = [];
  try {
    for (const { source, record } of selected) {
      const target = attachmentPath(directory, record);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      copied.push(record);
      await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL);
      const actual = await fsp.stat(target);
      if (actual.size !== record.size) throw new UserError('The file "{name}" changed while it was being copied. Try again.', { name: record.name });
    }
    return copied;
  } catch (error) {
    for (const record of copied) await fsp.unlink(attachmentPath(directory, record)).catch(() => {});
    throw error;
  }
}
function resolveAttachment(state, directory, id) {
  const record = state.attachments.find(a => a.id === id);
  if (!record) throw new Error('The attachment does not exist.');
  const file = attachmentPath(directory, record);
  let stat;
  try { stat = fs.lstatSync(file); } catch { throw new UserError('The file "{name}" is missing from the Remember Me data folder. Restore it from your backup.', { name: record.name }); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid attachment path.');
  return { file, record };
}
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function fileMissing(directory, record) {
  try { fs.lstatSync(attachmentPath(directory, record)); return false; }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return true; throw error; }
}
// kind is 'automatic' for copies the app makes on its own; only those may ever be rotated away.
// An attachment whose file is gone is left out instead of blocking every backup: it is dropped from
// the copied data.json so the backup stays restorable, and reported in `skipped` (if given) and backup.json.
async function exportBackup(state, directory, destination, { kind = 'manual', prefix = 'RememberMe-backup-', skipped = [] } = {}) {
  const snapshot = structuredClone(state);
  const items = [...snapshot.tasks, ...snapshot.notes];
  const used = new Set(items.flatMap(item => item.attachments || []));
  snapshot.attachments = snapshot.attachments.filter(a => used.has(a.id));
  const absent = snapshot.attachments.filter(a => fileMissing(directory, a))
    .map(a => ({ id: a.id, name: a.name, itemTitle: items.find(item => item.attachments?.includes(a.id))?.title || '' }));
  const missing = new Set(absent.map(a => a.id));
  skipped.push(...absent);
  if (missing.size) {
    snapshot.attachments = snapshot.attachments.filter(a => !missing.has(a.id));
    for (const item of items) if (item.attachments) item.attachments = item.attachments.filter(id => !missing.has(id));
  }
  // Path checks still throw: a traversal or a link is never silently skipped.
  const sources = snapshot.attachments.map(a => resolveAttachment(snapshot, directory, a.id));
  const createdAt = new Date().toISOString();
  const folder = path.join(destination, prefix + createdAt.replace(/[:.]/g, '-'));
  await fsp.mkdir(folder, { recursive: false });
  const files = {};
  for (const { file, record } of sources) {
    const target = attachmentPath(folder, record);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(file, target, fs.constants.COPYFILE_EXCL);
    files[`attachments/${record.id}/${record.name}`] = await hashFile(target);
  }
  const text = JSON.stringify(snapshot, null, 2);
  files['data.json'] = createHash('sha256').update(text, 'utf8').digest('hex');
  await fsp.writeFile(path.join(folder, BACKUP_INFO), JSON.stringify({ app: 'Remember Me', kind, createdAt, algorithm: 'sha256', files, ...(absent.length ? { skipped: absent } : {}) }, null, 2), { encoding: 'utf8', flag: 'wx' });
  // Write the manifest last: a successful backup always has all referenced files.
  await fsp.writeFile(path.join(folder, 'data.json'), text, { encoding: 'utf8', flag: 'wx' });
  return folder;
}
async function folderSize(folder) {
  let total = 0;
  for (const entry of await fsp.readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const item = path.join(folder, entry.name);
    if (entry.isDirectory()) total += await folderSize(item);
    else if (entry.isFile()) total += (await fsp.stat(item)).size;
  }
  return total;
}
// Attachment records no task or note uses (removed from an item, or added to a draft that was
// never saved), and attachment folders with no record at all. Backups hold their own copies.
async function findOrphans(state, directory) {
  const used = new Set([...state.tasks, ...state.notes].flatMap(item => item.attachments || []));
  const known = new Set(state.attachments.map(a => a.id));
  const records = state.attachments.filter(a => !used.has(a.id));
  const root = path.join(directory, 'attachments');
  const strays = (await fsp.readdir(root, { withFileTypes: true }).catch(() => [])).filter(e => e.isDirectory() && idPattern.test(e.name) && !known.has(e.name)).map(e => e.name);
  let bytes = 0;
  for (const id of [...records.map(a => a.id), ...strays]) bytes += await folderSize(path.join(root, id));
  return { records: records.map(a => a.id), strays, count: records.length + strays.length, bytes };
}
async function storageUsage(state, directory) {
  const orphans = await findOrphans(state, directory);
  return { attachments: await folderSize(path.join(directory, 'attachments')), backups: await folderSize(path.join(directory, 'backups')), orphans: orphans.count, orphanBytes: orphans.bytes };
}
// Drops unused records first, so data.json never points at a deleted file, then deletes the folders.
async function removeOrphans(store, directory) {
  const orphans = await findOrphans(store.state, directory);
  let removed = [];
  if (orphans.records.length) store.change(s => {
    // Re-check against the state being saved, in case an item started using a file meanwhile.
    const used = new Set([...s.tasks, ...s.notes].flatMap(item => item.attachments || []));
    removed = orphans.records.filter(id => !used.has(id));
    s.attachments = s.attachments.filter(a => !removed.includes(a.id));
  });
  for (const id of [...removed, ...orphans.strays]) {
    if (store.state.attachments.some(a => a.id === id)) continue;
    await fsp.rm(path.join(directory, 'attachments', id), { recursive: true, force: true });
  }
  return orphans;
}
module.exports = { findOrphans, storageUsage, removeOrphans, MAX_ATTACHMENTS, BACKUP_INFO, attachmentIds, opensAsProgram, hashFile, validateAttachment, attachmentPath, importFiles, resolveAttachment, exportBackup };
