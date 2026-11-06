'use strict';
const { BrowserWindow, screen, nativeTheme } = require('electron');
const path = require('node:path');
const { alertBounds, quickAddBounds, QUICK_ADD_SIZE } = require('../core/placement');
const { windowColors } = require('../platform/themes');
const { findLocale } = require('../../ui/lib/translate');
const { PAGE_PREFERENCES } = require('./web-security');
const { textSizeStep, stepTextSize, scaledSize } = require('../../ui/lib/text-size');
// Windows picks the matching size from the ICO for the title bar, taskbar and Alt+Tab.
const windowIcon = path.join(__dirname, '../../assets/icon.ico');

// The main window, the sticky alert window and the quick-add window. ctx.quitting lets them close for real.
function createWindows(ctx) {
  let mainWindow, alertWindow, quickAddWindow;
  const { tr } = ctx;
  // Window backgrounds match the page's palette and mode (ui/styles/theme.css), so opening a window never flashes another theme.
  function background(kind) { return windowColors(ctx.store.state.settings.palette, nativeTheme.shouldUseDarkColors)[kind]; }
  function applyTheme() {
    nativeTheme.themeSource = ctx.store.state.settings.theme;
    for (const [win, kind] of [[mainWindow, 'main'], [alertWindow, 'alert'], [quickAddWindow, 'alert']]) if (win && !win.isDestroyed()) win.setBackgroundColor(background(kind));
  }
  // The preload hands the saved palette, text size, language and direction to the page so its first paint already uses
  // them; later changes arrive with waqt:update. Page URLs stay plain file paths: the desktop tests and fromPage() match on them.
  function options() {
    const { store } = ctx, locale = findLocale(store.state.settings.language);
    return { preload: path.join(__dirname, 'preload.js'), ...PAGE_PREFERENCES,
      additionalArguments: [`--waqt-palette=${store.state.settings.palette}`, `--waqt-text-size=${store.state.settings.textSize}`, `--waqt-language=${locale.code}`, `--waqt-dir=${locale.dir}`] };
  }
  // Ctrl+= / Ctrl+- / Ctrl+0 change the text size in every window (the windows have no menu, so Chromium's
  // zoom keys do nothing). The size is saved like any setting; the alert window grows with it.
  function textSizeKeys(win) {
    win.webContents.on('before-input-event', (event, input) => {
      const step = textSizeStep(input);
      if (step === null) return;
      event.preventDefault();
      const current = ctx.store.state.settings.textSize, next = stepTextSize(current, step);
      if (next === current) return;
      try { ctx.store.change(s => { s.settings.textSize = next; }); } catch (err) { ctx.log?.warn('text-size-not-saved', err); return; }
      placeAlert(); notifyViews();
    });
  }
  const alertSize = () => scaledSize({ width: 410, height: 570 }, ctx.store.state.settings.textSize);
  // New windows, navigation and webviews are denied for every page in index.js (src/main/web-security.js).
  function createMain(visible = !process.argv.includes('--background')) {
    const win = mainWindow = new BrowserWindow({ width: 1250, height: 850, minWidth: 900, minHeight: 650,
      title: tr('Remember Me • Your day'), icon: windowIcon, show: false, backgroundColor: background('main'), autoHideMenuBar: true, webPreferences: options() });
    win.setMenu(null);
    textSizeKeys(win);
    win.loadFile(path.join(__dirname, '../../ui/index.html'));
    win.on('session-end', () => { ctx.quitting = true; });
    win.on('close', e => { if (!ctx.quitting) { e.preventDefault(); win.hide(); } });
    // A page-initiated window.close() destroys the window without a cancelable close; rebuild it on demand.
    win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
    win.once('ready-to-show', () => { if (visible) win.show(); });
  }
  // The main window opens a task's editor (or a new one) on its next state read, which also
  // covers a window that is still being created. field 'due' focuses the date and time (Reschedule).
  let openRequest = null;
  function takeOpenRequest() { const request = openRequest; openRequest = null; return request; }
  function openInMain(task, field) { openRequest = task ? { task, field: field === 'due' ? 'due' : null } : null; showMain(); notifyViews(); }
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
    alertWindow.setBounds(alertBounds(screen.getPrimaryDisplay(), ctx.store.state.settings.alertSide, alertSize()));
  }
  function notifyViews() {
    for (const win of [mainWindow, alertWindow, quickAddWindow]) if (win && !win.isDestroyed()) win.webContents.send('waqt:update');
  }
  // Only the main window shows update status; the alert window is never refreshed for it.
  function notifyMain() { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('waqt:update'); }
  // Creates the alert window, or shows it again, while reminders are due.
  function showAlert() {
    if (!alertWindow || alertWindow.isDestroyed()) {
      const activeAlerts = () => ctx.scheduler.activeAlerts();
      alertWindow = new BrowserWindow({ ...alertSize(), frame: false, resizable: false, minimizable: false,
        maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: background('alert'), icon: windowIcon, webPreferences: options() });
      alertWindow.setAlwaysOnTop(true, 'pop-up-menu');
      placeAlert();
      textSizeKeys(alertWindow);
      alertWindow.loadFile(path.join(__dirname, '../../ui/alert.html'));
      alertWindow.once('ready-to-show', () => { if (alertWindow && activeAlerts().length) alertWindow.showInactive(); });
      alertWindow.on('session-end', () => { ctx.quitting = true; });
      alertWindow.on('close', event => { if (!ctx.quitting && activeAlerts().length) event.preventDefault(); });
      alertWindow.on('closed', () => { alertWindow = null; });
    } else if (!alertWindow.isVisible()) alertWindow.showInactive();
  }
  function closeAlert() { if (alertWindow) { alertWindow.destroy(); alertWindow = null; } }
  // The quick-add window (global shortcut, issue #82) on the display under the mouse, centered above the
  // taskbar and always on top. Pressing the shortcut again brings back the open one with what was typed.
  function showQuickAdd() {
    if (quickAddWindow && !quickAddWindow.isDestroyed()) { quickAddWindow.show(); quickAddWindow.focus(); return; }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const win = quickAddWindow = new BrowserWindow({ ...quickAddBounds(display, scaledSize(QUICK_ADD_SIZE, ctx.store.state.settings.textSize)), frame: false, resizable: false, minimizable: false, maximizable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, title: tr('Remember Me • Quick add'), backgroundColor: background('alert'), icon: windowIcon, webPreferences: options() });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    textSizeKeys(win);
    win.loadFile(path.join(__dirname, '../../ui/quickadd.html'));
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    win.on('closed', () => { if (quickAddWindow === win) quickAddWindow = null; });
  }
  return {
    get mainWindow() { return mainWindow; }, get alertWindow() { return alertWindow; }, get quickAddWindow() { return quickAddWindow; },
    background, applyTheme, createMain, showMain, showSection, openInMain, takeOpenRequest, placeAlert, notifyViews, notifyMain, showAlert, closeAlert, showQuickAdd,
  };
}
module.exports = { createWindows };
