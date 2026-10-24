'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const ACTIONS = new Set(['state', 'alerts', 'language', 'saveTask', 'complete', 'snooze', 'reopen', 'deleteTask', 'saveNote', 'deleteNote',
  'attachFiles', 'openAttachment', 'imagePreview', 'chooseDriveFolder', 'driveBackupNow', 'driveAutomatic', 'driveHelp', 'openDriveFolder',
  'settings', 'preview', 'export', 'restore', 'dataFolder', 'open']);
// The always-on-top alert only needs to read its queue and act on the reminder it shows.
const ALERT_ACTIONS = new Set(['alerts', 'language', 'complete', 'snooze', 'open', 'openAttachment', 'imagePreview']);
const ID_ACTIONS = new Set(['complete', 'snooze', 'reopen', 'deleteTask', 'deleteNote', 'openAttachment', 'imagePreview']);
const arabic = ar => ar;
function isId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 100; }
// Returns the payload as a plain object, or throws before any action runs.
function checkRequest(action, payload, { fromAlert = false, text = arabic } = {}) {
  if (typeof action !== 'string' || !ACTIONS.has(action)) throw new Error(text('إجراء غير معروف.', 'Unknown action.'));
  if (fromAlert && !ALERT_ACTIONS.has(action)) throw new Error(text('طلب غير مسموح.', 'Request not allowed.'));
  if (payload === undefined || payload === null) payload = {};
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error(text('بيانات الطلب غير صالحة.', 'Invalid request data.'));
  if (ID_ACTIONS.has(action) ? !isId(payload.id) : payload.id !== undefined && !isId(payload.id)) throw new Error(text('معرّف العنصر غير صالح.', 'Invalid item ID.'));
  return payload;
}
// True only when the request comes from the top-level page the window was created with.
function fromPage(frameUrl, file) {
  try {
    const url = new URL(frameUrl);
    if (url.protocol !== 'file:') return false;
    return path.resolve(fileURLToPath(url)).toLowerCase() === path.resolve(file).toLowerCase();
  } catch { return false; }
}
module.exports = { ACTIONS, ALERT_ACTIONS, checkRequest, fromPage };
