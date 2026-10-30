'use strict';
const os = require('node:os');
const { buildReport, readLogTail } = require('../platform/problem-report');
// Repeated errors: this many logged errors within WINDOW_MS offer a report, as a crash does at once.
const REPEATED = 3, WINDOW_MS = 10 * 60000;
// Renderer and helper processes that end for these reasons crashed; 'clean-exit' and 'killed' did not.
const CRASHES = new Set(['crashed', 'oom', 'launch-failed', 'integrity-failure', 'abnormal-exit']);

// Catches crashes and uncaught errors in the main process, logs them through the redacting log, and
// after a crash or repeated errors offers "Report this problem". A report only opens a pre-filled
// GitHub issue in the browser; nothing is sent unless the user submits it there.
function createProblems(ctx, { processEvents = process, now = () => Date.now() } = {}) {
  const { app, log } = ctx;
  let errors = [], offered = false, asking = false;
  // Every logged error counts towards "repeated errors", including the ones other modules log.
  const logError = log.error;
  log.error = (event, error, details) => { logError(event, error, details); noteError(); };
  function noteError() {
    const time = now();
    errors = [...errors.filter(at => time - at < WINDOW_MS), time];
    if (errors.length >= REPEATED) offer('errors', 'repeated errors');
  }
  function report(kind = 'manual', cause = '') {
    const settings = ctx.store?.state?.settings || {};
    return buildReport({ version: app.getVersion(), packaged: app.isPackaged, windows: os.release(), arch: process.arch,
      language: ctx.language(), theme: settings.theme || 'system', kind, cause, lines: readLogTail(log.file),
      folders: [[app.getPath('userData'), '<data folder>'], [os.homedir(), '<user folder>']] });
  }
  async function openReport(kind = 'manual', cause = '') {
    const { url, truncated, lines } = report(kind, cause);
    log.info('problem-report-opened', { kind, lines, truncated });
    await ctx.electron.shell.openExternal(url);
  }
  // Asks once per run; test runs never show the dialog.
  async function offer(kind, cause) {
    if (offered || asking || ctx.testMode || ctx.quitting) return;
    if (!app.isReady()) { app.whenReady().then(() => offer(kind, cause)); return; }
    asking = true;
    try {
      const { tr } = ctx, win = ctx.mainWindow && !ctx.mainWindow.isDestroyed() ? ctx.mainWindow : undefined;
      const { response } = await ctx.electron.dialog.showMessageBox(win, { type: 'warning', title: tr("Remember Me ran into a problem"),
        message: kind === 'crash' ? tr("Part of Remember Me stopped unexpectedly.") : tr("Remember Me ran into several errors."),
        detail: tr("You can report it on GitHub. A pre-filled issue opens in your browser with versions, settings and recent log lines, without your tasks, notes, files or paths. Nothing is sent until you submit it."),
        buttons: [tr("Report this problem"), tr("Not now")], defaultId: 0, cancelId: 1, noLink: true });
      offered = true;
      if (response === 0) await openReport(kind, cause);
    } catch (error) { logError('problem-offer-failed', error); }
    finally { asking = false; }
  }
  function crashed(event, error, details) {
    logError(event, error, details);
    offer('crash', details?.reason ? `${event}: ${details.reason}` : event);
  }
  function install() {
    processEvents.on('uncaughtException', error => crashed('uncaught-exception', error));
    processEvents.on('unhandledRejection', reason => { log.error('unhandled-rejection', reason instanceof Error ? reason : new Error(String(reason))); });
    app.on('render-process-gone', (event, contents, details) => {
      const info = { reason: String(details?.reason), exitCode: details?.exitCode };
      if (CRASHES.has(info.reason)) crashed('render-process-gone', null, info);
      else log.warn('render-process-gone', null, info);
    });
    app.on('child-process-gone', (event, details) => {
      const info = { type: String(details?.type), reason: String(details?.reason), exitCode: details?.exitCode, ...(details?.serviceName ? { service: String(details.serviceName).slice(0, 60) } : {}) };
      if (CRASHES.has(info.reason)) crashed('child-process-gone', null, info);
      else log.warn('child-process-gone', null, info);
    });
  }
  return { install, report, openReport, offer };
}
module.exports = { createProblems, REPEATED, WINDOW_MS };
