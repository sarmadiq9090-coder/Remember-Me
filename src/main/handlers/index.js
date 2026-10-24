'use strict';
const { ACTIONS, checkRequest, fromPage } = require('../ipc');
// One file per area. Each exports (ctx) => ({ action: { run(payload, request), readOnly } }).
// readOnly actions change no data, so the scheduler does not rescan and the windows are not told to refresh.
const AREAS = ['app', 'tasks', 'notes', 'trash', 'attachments', 'backups', 'settings', 'updates', 'about'].map(name => require('./' + name));

// Every action in the allowlist has exactly one handler, and every handler is allowlisted.
function createHandlers(ctx) {
  const handlers = {};
  for (const area of AREAS) {
    for (const [action, handler] of Object.entries(area(ctx))) {
      if (handlers[action]) throw new Error(`Two handlers for ${action}`);
      handlers[action] = handler;
    }
  }
  const missing = [...ACTIONS].filter(action => !handlers[action]);
  const extra = Object.keys(handlers).filter(action => !ACTIONS.has(action));
  if (missing.length || extra.length) throw new Error(`IPC handlers do not match the allowlist: missing ${missing.join(', ') || 'none'}, extra ${extra.join(', ') || 'none'}`);
  return handlers;
}

// The single IPC entry point. Requests are accepted only from the main window or the alert window,
// and only from the page that window was created with; ipc.js validates the action and payload.
function registerHandlers(ctx, { ipcMain, scan, notifyViews, pages }) {
  const handlers = createHandlers(ctx);
  ipcMain.handle('waqt:action', async (event, action, payload) => {
    try {
      const fromAlert = !!ctx.alertWindow && event.sender === ctx.alertWindow.webContents;
      const page = fromAlert ? pages.alert : pages.main;
      if ((!fromAlert && event.sender !== ctx.mainWindow?.webContents) || !fromPage(event.senderFrame?.url, page)) throw new Error(ctx.tr("Request not allowed."));
      payload = checkRequest(action, payload, { fromAlert });
      const handler = handlers[action];
      if (!handler) throw new Error(ctx.tr('Unknown action.'));
      const value = await handler.run(payload, { event, fromAlert });
      if (!handler.readOnly) { scan(); notifyViews(); }
      return { ok: true, value };
    } catch (error) { ctx.log.warn('action-failed', error, { action: typeof action === 'string' ? action.slice(0, 40) : typeof action }); return { ok: false, error: ctx.errorText(error) }; }
  });
  return handlers;
}
module.exports = { createHandlers, registerHandlers };
