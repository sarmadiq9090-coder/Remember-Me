'use strict';
const { BrowserWindow, screen, nativeTheme } = require('electron');
const path = require('node:path');
const { alertBounds } = require('../core/placement');
const { windowColors } = require('../platform/themes');
const { findLocale } = require('../../ui/lib/translate');
// Windows picks the matching size from the ICO for the title bar, taskbar and Alt+Tab.
const windowIcon = path.join(__dirname, '../../assets/icon.ico');

// The main window and the sticky alert window. ctx.quitting lets them close for real.
function createWindows(ctx) {
  let mainWindow, alertWindow;
  const { tr } = ctx;
  // Window backgrounds match the page's palette and mode (ui/styles/theme.css), so opening a window never flashes another theme.
  function background(kind) { return windowColors(ctx.store.state.settings.palette, nativeTheme.shouldUseDarkColors)[kind]; }
  function applyTheme() {
    nativeTheme.themeSource = ctx.store.state.settings.theme;
    for (const [win, kind] of [[mainWindow, 'main'], [alertWindow, 'alert']]) if (win && !win.isDestroyed()) win.setBackgroundColor(background(kind));
  }
  // The preload hands the saved palette, language and direction to the page so its first paint already uses
  // them; later changes arrive with waqt:update. Page URLs stay plain file paths: the desktop tests and fromPage() match on them.
  function options() {
    const { store } = ctx, locale = findLocale(store.state.settings.language);
    return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: [`--waqt-palette=${store.state.settings.palette}`, `--waqt-language=${locale.code}`, `--waqt-dir=${locale.dir}`] };
  }
  function secure(win) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
  }
  function createMain(visible = !process.argv.includes('--background')) {
    const win = mainWindow = new BrowserWindow({ width: 1250, height: 850, minWidth: 900, minHeight: 650,
      title: tr('Remember Me • Your day'), icon: windowIcon, show: false, backgroundColor: background('main'), autoHideMenuBar: true, webPreferences: options() });
    win.setMenu(null);
    secure(win);
    win.loadFile(path.join(__dirname, '../../ui/index.html'));
    win.on('session-end', () => { ctx.quitting = true; });
    win.on('close', e => { if (!ctx.quitting) { e.preventDefault(); win.hide(); } });
    // A page-initiated window.close() destroys the window without a cancelable close; rebuild it on demand.
    win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
    win.once('ready-to-show', () => { if (visible) win.show(); });
  }
  // The main window opens a task's editor (or a new one) on its next state read, which also
  // covers a window that is still being created.
  let openRequest = null;
  function takeOpenRequest() { const request = openRequest; openRequest = null; return request; }
  function openInMain(request) { openRequest = request; showMain(); notifyViews(); }
  function showMain() {
    if (!mainWindow) { if (!ctx.quitting) createMain(true); return; }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
  // Opens the main window on a part of it, such as the About card, once its page has loaded.
  function showSection(section) {
    showMain();
    const contents = mainWindow?.webContents;
    if (!contents) return;
    if (contents.isLoading()) contents.once('did-finish-load', () => contents.send('waqt:show', section));
    else contents.send('waqt:show', section);
  }
  function placeAlert() {
    if (!alertWindow || alertWindow.isDestroyed()) return;
    alertWindow.setBounds(alertBounds(screen.getPrimaryDisplay(), ctx.store.state.settings.alertSide));
  }
  function notifyViews() {
    for (const win of [mainWindow, alertWindow]) if (win && !win.isDestroyed()) win.webContents.send('waqt:update');
  }
  // Only the main window shows update status; the alert window is never refreshed for it.
  function notifyMain() { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('waqt:update'); }
  // Creates the alert window, or shows it again, while reminders are due.
  function showAlert() {
    if (!alertWindow || alertWindow.isDestroyed()) {
      const activeAlerts = () => ctx.scheduler.activeAlerts();
      alertWindow = new BrowserWindow({ width: 410, height: 570, frame: false, resizable: false, minimizable: false,
        maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: background('alert'), icon: windowIcon, webPreferences: options() });
      secure(alertWindow);
      alertWindow.setAlwaysOnTop(true, 'pop-up-menu');
      placeAlert();
      alertWindow.loadFile(path.join(__dirname, '../../ui/alert.html'));
      alertWindow.once('ready-to-show', () => { if (alertWindow && activeAlerts().length) alertWindow.showInactive(); });
      alertWindow.on('session-end', () => { ctx.quitting = true; });
      alertWindow.on('close', event => { if (!ctx.quitting && activeAlerts().length) event.preventDefault(); });
      alertWindow.on('closed', () => { alertWindow = null; });
    } else if (!alertWindow.isVisible()) alertWindow.showInactive();
  }
  function closeAlert() { if (alertWindow) { alertWindow.destroy(); alertWindow = null; } }
  return {
    get mainWindow() { return mainWindow; }, get alertWindow() { return alertWindow; },
    background, applyTheme, createMain, showMain, showSection, openInMain, takeOpenRequest, placeAlert, notifyViews, notifyMain, showAlert, closeAlert,
  };
}
module.exports = { createWindows };
