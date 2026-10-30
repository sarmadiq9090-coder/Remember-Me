'use strict';
const { app, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('node:path');
const { UNTIL_RESUMED, isPaused } = require('../core/pause');
// 16 px tray images; nativeImage also loads their @1.5x and @2x files for scaled displays.
const trayIcon = waiting => path.join(__dirname, '../../assets', waiting ? 'tray-waiting.png' : 'tray.png');

// The notification-area icon: its menu, the dotted variant while reminders wait, and the tooltip.
function createTray(ctx) {
  let tray;
  // The tray shows a dotted variant while real reminders are waiting; trayWaiting avoids calling setImage every second.
  let trayWaiting = false;
  const { tr, localeTag } = ctx;
  const windows = () => ctx.windows;
  // The tray menu, top to bottom. Each feature adds its item here and builds it in its own function.
  function trayMenuItems() {
    return [
      { label: tr("Open Remember Me"), click: () => windows().showMain() },
      { label: tr("New task"), click: () => windows().openInMain('new') },
      pauseMenuItem(),
      aboutMenuItem(),
      { label: tr("Report a problem"), click: () => ctx.problems.openReport().catch(error => ctx.log.warn('problem-report-failed', error)) },
      { type: 'separator' },
      exitMenuItem(),
    ];
  }
  function rebuildTrayMenu() {
    if (tray) tray.setContextMenu(Menu.buildFromTemplate(trayMenuItems()));
  }
  function pauseMenuItem() {
    if (isPaused(ctx.store?.state?.settings?.pausedUntil)) return { label: tr("Resume reminders"), click: () => { ctx.pause.resume(); ctx.scheduler.scan(); } };
    return { label: tr("Pause reminders"), submenu: [
      { label: tr("For 1 hour"), click: () => pauseFor('hour') },
      { label: tr("Until tomorrow, {time}", { time: new Date(2026, 0, 1, 8).toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' }) }), click: () => pauseFor('tomorrow') },
      { label: tr("Until I resume"), click: () => pauseFor('manual') },
    ] };
  }
  function pauseFor(choice) { ctx.pause.pause(choice); ctx.scheduler.scan(); }
  function aboutMenuItem() { return { label: tr("About Remember Me"), click: () => windows().showSection('about') }; }
  function exitMenuItem() {
    return { label: tr("Exit and stop reminders"), click: async () => {
      const { response } = await dialog.showMessageBox(windows().mainWindow, { type: 'question', title: tr("Close Remember Me"), message: tr("Reminders will stop until you open the app again."), buttons: [tr("Keep running"), tr("Exit")], defaultId: 0, cancelId: 0 });
      if (response === 1) { ctx.quitting = true; app.quit(); }
    } };
  }
  // "until 11:15", or with the weekday when the pause ends on another day.
  function pauseText(pausedUntil) {
    if (pausedUntil === UNTIL_RESUMED) return tr("until you resume");
    const end = new Date(pausedUntil), sameDay = end.toDateString() === new Date().toDateString();
    const time = end.toLocaleString(localeTag(), sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    return tr("until {time}", { time });
  }
  function create() {
    tray = new Tray(nativeImage.createFromPath(trayIcon(false)));
    rebuildTrayMenu();
    tray.on('double-click', () => windows().showMain());
    tray.on('click', () => windows().showMain());
  }
  // After each scan: the dotted icon while real reminders wait, and a tooltip with the count or the pause.
  function showStatus({ paused, queue, tasks }) {
    const waiting = tasks.length > 0 && tasks[0].id !== '__preview';
    if (tray && waiting !== trayWaiting) { trayWaiting = waiting; tray.setImage(nativeImage.createFromPath(trayIcon(waiting))); }
    if (tray) tray.setToolTip(paused ? (queue.length ? tr("Remember Me • Reminders paused {until} • {count} waiting", { until: pauseText(ctx.store.state.settings.pausedUntil), count: queue.length }) : tr("Remember Me • Reminders paused {until}", { until: pauseText(ctx.store.state.settings.pausedUntil) }))
      : tasks.length ? tr("Remember Me • {count} reminders waiting", { count: tasks.length }) : tr("Remember Me • Your tasks on time"));
  }
  return { create, rebuildTrayMenu, showStatus };
}
module.exports = { createTray };
