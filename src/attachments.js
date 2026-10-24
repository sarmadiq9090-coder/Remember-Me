'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function attachmentIds(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS || value.some(id => typeof id !== 'string' || !idPattern.test(id))) throw new Error('المرفقات غير صالحة. يمكنك إضافة 20 ملفًا لكل عنصر.');
  return [...new Set(value)];
}
function validateAttachment(record) {
  if (!record || !idPattern.test(record.id) || typeof record.name !== 'string' || !record.name || record.name.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(record.name) || record.name === '.' || record.name === '..' || /[. ]$/.test(record.name) || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > MAX_FILE_SIZE) throw new Error('بيانات المرفق غير صالحة.');
  return record;
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
async function exportBackup(state, directory, destination) {
  const snapshot = structuredClone(state);
  const used = new Set([...snapshot.tasks, ...snapshot.notes].flatMap(item => item.attachments || []));
  snapshot.attachments = snapshot.attachments.filter(a => used.has(a.id));
  const sources = snapshot.attachments.map(a => resolveAttachment(snapshot, directory, a.id));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = path.join(destination, 'Waqt-backup-' + timestamp);
  await fsp.mkdir(folder, { recursive: false });
  for (const { file, record } of sources) {
    const target = attachmentPath(folder, record);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(file, target, fs.constants.COPYFILE_EXCL);
  }
  // Write the manifest last: a successful backup always has all referenced files.
  await fsp.writeFile(path.join(folder, 'data.json'), JSON.stringify(snapshot, null, 2), { encoding: 'utf8', flag: 'wx' });
  return folder;
}
module.exports = { MAX_ATTACHMENTS, attachmentIds, validateAttachment, attachmentPath, importFiles, resolveAttachment, exportBackup };
