'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { LINKS } = require('../platform/about');
const ACTIONS = new Set(['state', 'alerts', 'language', 'saveTask', 'complete', 'skip', 'snooze', 'reopen', 'deleteTask', 'saveNote', 'deleteNote',
  'attachFiles', 'openAttachment', 'imagePreview', 'chooseDriveFolder', 'driveBackupNow', 'driveAutomatic', 'driveKeep', 'driveHelp', 'openDriveFolder',
  'undoComplete', 'undoable', 'toggleStep', 'restoreTask', 'restoreNote', 'purgeTask', 'purgeNote', 'emptyTrash',
  'locale', 'settings', 'preview', 'export', 'restore', 'storage', 'cleanOrphans', 'dataFolder', 'open',
  'updateConsent', 'checkUpdates', 'installUpdate', 'dismissUpdate', 'openLink', 'copyDiagnostics', 'openLogs', 'relaunch']);
// The always-on-top alert only needs to read its queue and act on the reminder it shows.
const ALERT_ACTIONS = new Set(['alerts', 'language', 'locale', 'complete', 'skip', 'undoComplete', 'undoable', 'snooze', 'open', 'openAttachment', 'imagePreview']);
const ID_ACTIONS = new Set(['toggleStep', 'complete', 'skip', 'undoComplete', 'snooze', 'reopen', 'deleteTask', 'deleteNote', 'restoreTask', 'restoreNote', 'purgeTask', 'purgeNote', 'openAttachment', 'imagePreview']);
const DUE_ACTIONS = new Set(['complete', 'skip', 'snooze']);
function isId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 100; }
function isDate(value) { return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)); }
// Returns the payload as a plain object, or throws before any action runs.
function checkRequest(action, payload, { fromAlert = false } = {}) {
  if (typeof action !== 'string' || !ACTIONS.has(action)) throw new Error('Unknown action.');
  if (fromAlert && !ALERT_ACTIONS.has(action)) throw new Error('Request not allowed.');
  if (payload === undefined || payload === null) payload = {};
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid request data.');
  if (ID_ACTIONS.has(action) ? !isId(payload.id) : payload.id !== undefined && !isId(payload.id)) throw new Error('Invalid item ID.');
  // The due time the user saw: null for an undated task, left out by older callers.
  if (DUE_ACTIONS.has(action) && payload.expectedDueAt !== undefined && payload.expectedDueAt !== null && !isDate(payload.expectedDueAt)) throw new Error('Invalid time.');
  if (action === 'open' && payload.field !== undefined && payload.field !== 'due') throw new Error('Invalid request data.');
  if (action === 'updateConsent' && typeof payload.enabled !== 'boolean') throw new Error('Invalid request data.');
  // A link ID from the About card's fixed list; the main process picks the URL.
  if (action === 'openLink' && (typeof payload.link !== 'string' || !LINKS.has(payload.link))) throw new Error('Unknown link.');
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
