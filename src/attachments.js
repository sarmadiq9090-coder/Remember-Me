'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const BACKUP_INFO = 'backup.json';
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function attachmentIds(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS || value.some(id => typeof id !== 'string' || !idPattern.test(id))) throw new Error('المرفقات غير صالحة. يمكنك إضافة 20 ملفًا لكل عنصر.');
  return [...new Set(value)];
}
function validateAttachment(record) {
  if (!record || !idPattern.test(record.id) || typeof record.name !== 'string' || !record.name || record.name.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(record.name) || record.name === '.' || record.name === '..' || /[. ]$/.test(record.name) || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > MAX_FILE_SIZE) throw new Error('بيانات المرفق غير صالحة.');
  return record;
}
// Files Windows would run or install (directly, through an interpreter, or by mounting) are shown
// in Explorer instead of being launched. Matching uses the final extension, so "report.pdf.exe" counts.
const programExtensions = new Set(('exe com bat cmd ps1 psm1 psd1 ps1xml ps2 ps2xml psc1 psc2 msh msh1 msh2 mshxml msh1xml msh2xml ' +
  'vb vbs vbe js jse jar wsf wsh wsc ws sct hta msi msp mst msc cpl pif scr lnk url website scf shb shs reg inf ins isp ' +
  'application appref-ms gadget xbap jnlp chm hlp settingcontent-ms diagcab diagcfg diagpkg appx appxbundle msix msixbundle ' +
  'appinstaller library-ms search-ms searchconnector-ms iso img vhd vhdx wsb rdp dll ocx sys drv xll xlam ppam ade adp mde accde ' +
  'py pyw pyz pyc').split(' '));
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
  if (!Array.isArray(files) || files.length > MAX_ATTACHMENTS) throw new Error('اختر حتى 20 ملفًا في المرة الواحدة.');
  const selected = [];
  // Validate the entire selection before copying, so an error never partially attaches files.
  for (const file of files) {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('اختر ملفات فقط.');
    if (stat.size > MAX_FILE_SIZE) throw new Error(`الملف «${path.basename(file)}» أكبر من 50 ميغابايت.`);
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
      if (actual.size !== record.size) throw new Error(`تغيّر الملف «${record.name}» أثناء النسخ. حاول مجددًا.`);
    }
    return copied;
  } catch (error) {
    for (const record of copied) await fsp.unlink(attachmentPath(directory, record)).catch(() => {});
    throw error;
  }
}
function resolveAttachment(state, directory, id) {
  const record = state.attachments.find(a => a.id === id);
  if (!record) throw new Error('المرفق غير موجود.');
  const file = attachmentPath(directory, record);
  let stat;
  try { stat = fs.lstatSync(file); } catch { throw new Error(`ملف «${record.name}» غير موجود في مجلد بيانات وقت. استعده من نسختك الاحتياطية.`); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('مسار المرفق غير صالح.');
  return { file, record };
}
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
// kind is 'automatic' for copies the app makes on its own; only those may ever be rotated away.
async function exportBackup(state, directory, destination, { kind = 'manual', prefix = 'Waqt-backup-' } = {}) {
  const snapshot = structuredClone(state);
  const used = new Set([...snapshot.tasks, ...snapshot.notes].flatMap(item => item.attachments || []));
  snapshot.attachments = snapshot.attachments.filter(a => used.has(a.id));
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
  await fsp.writeFile(path.join(folder, BACKUP_INFO), JSON.stringify({ app: 'Remember Me', kind, createdAt, algorithm: 'sha256', files }, null, 2), { encoding: 'utf8', flag: 'wx' });
  // Write the manifest last: a successful backup always has all referenced files.
  await fsp.writeFile(path.join(folder, 'data.json'), text, { encoding: 'utf8', flag: 'wx' });
  return folder;
}
module.exports = { MAX_ATTACHMENTS, BACKUP_INFO, attachmentIds, opensAsProgram, hashFile, validateAttachment, attachmentPath, importFiles, resolveAttachment, exportBackup };
