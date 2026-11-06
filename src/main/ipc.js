'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { ABOUT_LINK_IDS } = require('../platform/about');
const ACTIONS = new Set(['state', 'alerts', 'language', 'saveTask', 'complete', 'skip', 'snooze', 'reopen', 'deleteTask', 'saveNote', 'deleteNote',
  'attachFiles', 'openAttachment', 'imagePreview', 'chooseDriveFolder', 'driveBackupNow', 'driveAutomatic', 'driveKeep', 'driveHelp', 'openDriveFolder',
  'undoComplete', 'undoable', 'toggleStep', 'restoreTask', 'restoreNote', 'purgeTask', 'purgeNote', 'emptyTrash',
  'locale', 'settings', 'preview', 'export', 'restore', 'storage', 'cleanOrphans', 'dataFolder', 'open',
  'updateConsent', 'checkUpdates', 'installUpdate', 'dismissUpdate', 'openLink', 'copyDiagnostics', 'reportProblem', 'openLogs', 'relaunch', 'openStartupSettings', 'quickAdd', 'ratingPrompt', 'parseWhen']);
// The always-on-top alert only needs to read its queue and act on the reminder it shows.
const ALERT_ACTIONS = new Set(['alerts', 'language', 'locale', 'complete', 'skip', 'undoComplete', 'undoable', 'snooze', 'open', 'openAttachment', 'imagePreview']);
// The quick-add window (global shortcut) only reads its language, reads a typed date, and adds one task.
const QUICK_ADD_ACTIONS = new Set(['language', 'locale', 'quickAdd', 'parseWhen']);
const QUICK_ADD_FIELDS = ['title', 'dueAt', 'repeat', 'repeatDays', 'repeatEvery'];
const QUICK_REPEATS = ['none', 'daily', 'weekly', 'days', 'interval', 'monthly', 'yearly'];
const ID_ACTIONS = new Set(['toggleStep', 'complete', 'skip', 'undoComplete', 'snooze', 'reopen', 'deleteTask', 'deleteNote', 'restoreTask', 'restoreNote', 'purgeTask', 'purgeNote', 'openAttachment', 'imagePreview']);
const DUE_ACTIONS = new Set(['complete', 'skip', 'snooze']);
function isId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 100; }
function isDate(value) { return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)); }
// Returns the payload as a plain object, or throws before any action runs.
function checkRequest(action, payload, { fromAlert = false, fromQuickAdd = false } = {}) {
  if (typeof action !== 'string' || !ACTIONS.has(action)) throw new Error('Unknown action.');
  if (fromAlert && !ALERT_ACTIONS.has(action)) throw new Error('Request not allowed.');
  if (fromQuickAdd && !QUICK_ADD_ACTIONS.has(action)) throw new Error('Request not allowed.');
  if (payload === undefined || payload === null) payload = {};
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid request data.');
  if (ID_ACTIONS.has(action) ? !isId(payload.id) : payload.id !== undefined && !isId(payload.id)) throw new Error('Invalid item ID.');
  // The due time the user saw: null for an undated task, left out by older callers.
  if (DUE_ACTIONS.has(action) && payload.expectedDueAt !== undefined && payload.expectedDueAt !== null && !isDate(payload.expectedDueAt)) throw new Error('Invalid time.');
  if (action === 'open' && payload.field !== undefined && payload.field !== 'due') throw new Error('Invalid request data.');
  if (action === 'updateConsent' && typeof payload.enabled !== 'boolean') throw new Error('Invalid request data.');
  // Quick add sends a title, an optional due time and the repeat a typed phrase gave («كل يوم 7 الصبح»), nothing else.
  if (action === 'quickAdd') {
    if (typeof payload.title !== 'string' || Object.keys(payload).some(key => !QUICK_ADD_FIELDS.includes(key))) throw new Error('Invalid request data.');
    if (payload.dueAt !== undefined && payload.dueAt !== null && !isDate(payload.dueAt)) throw new Error('Invalid time.');
    if (payload.repeat !== undefined && !QUICK_REPEATS.includes(payload.repeat)) throw new Error('Invalid request data.');
    if (payload.repeatDays !== undefined && !(Array.isArray(payload.repeatDays) && payload.repeatDays.length >= 1 && payload.repeatDays.length <= 7 && payload.repeatDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6))) throw new Error('Invalid request data.');
    if (payload.repeatEvery !== undefined && !(Number.isInteger(payload.repeatEvery) && payload.repeatEvery >= 2 && payload.repeatEvery <= 365)) throw new Error('Invalid request data.');
  }
  // A typed title to read a date from: a short string only.
  if (action === 'parseWhen' && (typeof payload.text !== 'string' || payload.text.length > 200 || Object.keys(payload).some(key => key !== 'text'))) throw new Error('Invalid request data.');
  // A link ID from the About card's fixed list; the main process picks the URL.
  if (action === 'openLink' && (typeof payload.link !== 'string' || !ABOUT_LINK_IDS.has(payload.link))) throw new Error('Unknown link.');
  // The Store rating request's answer: rate now, or not now (never asked again either way).
  if (action === 'ratingPrompt' && !['rate', 'later'].includes(payload.choice)) throw new Error('Invalid request data.');
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
module.exports = { ACTIONS, ALERT_ACTIONS, QUICK_ADD_ACTIONS, checkRequest, fromPage };
