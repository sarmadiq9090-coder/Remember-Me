'use strict';
// What data.json may hold about an attachment: ids, file names and sizes. No file access.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function attachmentIds(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS || value.some(id => typeof id !== 'string' || !idPattern.test(id))) throw new Error('Invalid attachments. You can add up to 20 files per item.');
  return [...new Set(value)];
}
function validateAttachment(record) {
  // Windows forbids control characters in file names, so the pattern has to match them.
  // eslint-disable-next-line no-control-regex
  if (!record || !idPattern.test(record.id) || typeof record.name !== 'string' || !record.name || record.name.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(record.name) || record.name === '.' || record.name === '..' || /[. ]$/.test(record.name) || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > MAX_FILE_SIZE) throw new Error('Invalid attachment data.');
  return record;
}
module.exports = { MAX_FILE_SIZE, MAX_ATTACHMENTS, idPattern, attachmentIds, validateAttachment };
