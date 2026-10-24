'use strict';
const { shell, Notification } = require('electron');
const path = require('node:path');
const { alertQueue, upcomingTasks, purgeTrash, TRASH_DAYS } = require('../core/tasks');
const { createRepeatBeep } = require('../core/repeat-beep');
const { shownAlerts } = require('../core/pause');
const { createEarlyNotices } = require('../core/early-notices');
const icon = path.join(__dirname, '../../assets/icon.png');

// The reminder loop: what is due, the sticky alert, sounds, early notices, the preview alert and the
// short undo window after Done in the alert.
function createScheduler(ctx) {
  const { tr, localeTag, log, testMode } = ctx;
  let preview = null, previousDue = new Set();
  // The task just completed from the alert, which can be undone for a few seconds.
  let undoable = null;
  const repeatBeep = createRepeatBeep(() => shell.beep());
  const earlyLog = [];
  // "Coming up" notifications, each occurrence once. While paused they are only recorded.
  const earlyNotices = createEarlyNotices({ show: task => {
    const time = new Date(task.dueAt).toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' });
    const message = { title: tr("Coming up: {title}", { title: task.title }), body: tr("Due at {time}", { time }) };
    if (testMode) { earlyLog.push(message); return null; }
    if (!Notification.isSupported()) return null;
    const notification = new Notification({ ...message, icon, silent: !ctx.store.state.settings.sound });
    notification.on('click', () => ctx.windows.showMain());
    notification.show();
    return notification;
  } });
  function announceUpcoming(paused) { earlyNotices.announce(upcomingTasks(ctx.store.state), { silent: paused }); }
  function activeAlerts() { const queue = alertQueue(ctx.store.state, preview); preview = queue.preview; return queue.alerts; }
  // The scheduler must survive any single failure; an exception here would otherwise repeat every second.
  // A failure that repeats every second is logged once, then again only if it changes or every 10 minutes.
  let lastScanError = { message: '', at: 0 };
  function scan() {
    try { scanNow(); }
    catch (error) {
      console.error('Reminder scan failed:', error);
      if (error?.message !== lastScanError.message || Date.now() - lastScanError.at > 600000) { lastScanError = { message: error?.message, at: Date.now() }; log.error('scan-failed', error); }
    }
  }
  function scanNow() {
    const { store, windows } = ctx;
    // While paused nothing pops up or beeps; due reminders stay queued and appear when it ends.
    const paused = ctx.pause.check();
    announceUpcoming(paused);
    const queue = activeAlerts(), tasks = shownAlerts(queue, paused);
    const current = new Set(tasks.map(t => t.id));
    const newlyDue = tasks.some(t => !previousDue.has(t.id));
    previousDue = current;
    if (tasks.length) {
      windows.showAlert();
      if (newlyDue && store.state.settings.sound && !testMode) shell.beep();
      repeatBeep(store.state.settings.sound && !testMode && tasks[0].id !== '__preview' ? tasks[0].id : null, store.state.settings.remindAgain || 0);
    } else { repeatBeep(null, 0); if (windows.alertWindow && !(undoable && undoable.until > Date.now())) windows.closeAlert(); }
    if (newlyDue) windows.notifyViews();
    ctx.tray.showStatus({ paused, queue, tasks });
  }
  function purgeExpiredTrash() {
    const { store } = ctx;
    const limit = Date.now() - TRASH_DAYS * 86400000;
    if (![...store.state.tasks, ...store.state.notes].some(i => i.deletedAt && Date.parse(i.deletedAt) <= limit)) return;
    log.info('trash-purged', { count: store.change(s => purgeTrash(s)) });
    // An open Trash view still lists what was just removed.
    ctx.windows.notifyViews();
  }
  return {
    activeAlerts, scan, purgeExpiredTrash, earlyLog,
    get preview() { return preview; }, set preview(value) { preview = value; },
    get undoable() { return undoable; }, set undoable(value) { undoable = value; },
  };
}
module.exports = { createScheduler };
