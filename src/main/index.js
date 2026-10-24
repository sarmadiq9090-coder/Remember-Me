'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor, shell, dialog, session, Notification, nativeTheme, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Store, alertQueue, upcomingTasks, purgeTrash, TRASH_DAYS } = require('../core/tasks');
const { createPreviewService } = require('../data/image-preview');
const { DriveBackup } = require('../data/drive-backup');
const { registerHandlers } = require('./handlers');
const { LOCALES, DEFAULT: DEFAULT_LOCALE, findLocale, translate } = require('../../ui/translate');
const { alertBounds } = require('../core/placement');
const { safetyBackup } = require('../data/backups');
const { createRepeatBeep } = require('../core/repeat-beep');
const { createLogger } = require('../platform/logger');
const { Updates, configure: configureUpdater } = require('../platform/updates');
const { migrateDataFolder } = require('../platform/data-folder');
const { setLoginItem, refreshLoginItem } = require('../platform/login-item');
const { windowColors } = require('../platform/themes');
const { UNTIL_RESUMED, isPaused, shownAlerts, createPause } = require('../core/pause');
const { createEarlyNotices } = require('../core/early-notices');
const testMode = process.env.WAQT_TEST === '1';
// Lets the desktop tests read early notifications without showing them.
if (testMode) globalThis.waqtTest = { get early() { return earlyLog; } };
app.setName('Remember Me');
// Runs before anything (including the single-instance lock) creates files in the data folder.
const dataFolder = testMode && process.env.WAQT_DATA_DIR ? { folder: process.env.WAQT_DATA_DIR, migrated: 'none' } : migrateDataFolder(app.getPath('appData'));
if (dataFolder.error) console.error('Could not move the data folder; using the old one:', dataFolder.error);
app.setPath('userData', dataFolder.folder);
// The ID predates the Remember Me name. Keep it: it names the start-with-Windows entry and taskbar
// group of v1.4.0, and the installer's appId must stay the same for upgrades and updates.
app.setAppUserModelId('com.waqt.reminder');
// Local log for bug reports: ids, counts and outcomes only, never task or note content or paths.
const log = createLogger(app.getPath('userData'));
if (dataFolder.migrated !== 'none') log.info('data-folder-migrated', { result: dataFolder.migrated });
if (dataFolder.error) log.warn('data-folder-migration-failed', dataFolder.error);
let mainWindow, alertWindow, tray, store, quitting = false, interval, preview = null, driveBackup, backupInterval, updates, pause;
const imagePreview = createPreviewService(nativeImage);
let previousDue = new Set();
const repeatBeep = createRepeatBeep(() => shell.beep());
// The task just completed from the alert, which can be undone for a few seconds.
let undoable = null;
const UNDO_MS = 6000;
const earlyLog = [];
// "Coming up" notifications, each occurrence once. While paused they are only recorded.
const earlyNotices = createEarlyNotices({ show: task => {
  const time = new Date(task.dueAt).toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' });
  const message = { title: tr("Coming up: {title}", { title: task.title }), body: tr("Due at {time}", { time }) };
  if (testMode) { earlyLog.push(message); return null; }
  if (!Notification.isSupported()) return null;
  const notification = new Notification({ ...message, icon, silent: !store.state.settings.sound });
  notification.on('click', showMain);
  notification.show();
  return notification;
} });
function announceUpcoming(paused) { earlyNotices.announce(upcomingTasks(store.state), { silent: paused }); }
const icon = path.join(__dirname, '../../assets/icon.png');
// Windows picks the matching size from the ICO for the title bar, taskbar and Alt+Tab.
const windowIcon = path.join(__dirname, '../../assets/icon.ico');
// 16 px tray images; nativeImage also loads their @1.5x and @2x files for scaled displays.
const trayIcon = waiting => path.join(__dirname, '../../assets', waiting ? 'tray-waiting.png' : 'tray.png');
// The tray shows a dotted variant while real reminders are waiting; trayWaiting avoids calling setImage every second.
let trayWaiting = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(start).catch(error => { log.error('start-failed', error); dialog.showErrorBox(tr('Remember Me could not start'), errorText(error)); app.quit(); });
}
// Window backgrounds match the page's palette and mode (ui/theme.css), so opening a window never flashes another theme.
function background(kind) { return windowColors(store.state.settings.palette, nativeTheme.shouldUseDarkColors)[kind]; }
function applyTheme() {
  nativeTheme.themeSource = store.state.settings.theme;
  for (const [win, kind] of [[mainWindow, 'main'], [alertWindow, 'alert']]) if (win && !win.isDestroyed()) win.setBackgroundColor(background(kind));
}
// The preload hands the saved palette to the page so its first paint already uses it; later changes arrive
// with waqt:update. Page URLs stay plain file paths: the desktop tests and fromPage() match on them.
function options() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
    additionalArguments: [`--waqt-palette=${store.state.settings.palette}`] };
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
  win.on('session-end', () => { quitting = true; });
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
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
  if (!mainWindow) { if (!quitting) createMain(true); return; }
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
  alertWindow.setBounds(alertBounds(screen.getPrimaryDisplay(), store.state.settings.alertSide));
}
function notifyViews() {
  for (const win of [mainWindow, alertWindow]) if (win && !win.isDestroyed()) win.webContents.send('waqt:update');
}
function language() { const code = store?.state?.settings?.language; return LOCALES.some(l => l.code === code) ? code : DEFAULT_LOCALE; }
// The same locale the windows use, including a chosen digit style.
// Dates and times always use Western digits (0-9), in Arabic too, so the layout never shifts.
function localeTag() { return findLocale(language()).intl + '-u-nu-latn'; }
// Interface text comes from ui/locales/<code>.json, read once per language; English is the fallback.
const messageCache = new Map();
function messages(code) {
  if (!messageCache.has(code)) {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ui/locales', code + '.json'), 'utf8')); } catch (error) { console.error('Locale ' + code + ' could not be read:', error.message); }
    messageCache.set(code, data);
  }
  return messageCache.get(code);
}
function tr(key, params) { const code = language(); return translate(messages(code), messages(DEFAULT_LOCALE), findLocale(code).intl, key, params, n => n.toLocaleString(localeTag())); }
// Errors from the data modules are English; known ones are shown in the interface language.
function errorText(error) { return error?.key ? tr(error.key, error.params) : tr(String(error?.message || error)); }
// The tray menu, top to bottom. Each feature adds its item here and builds it in its own function.
function trayMenuItems() {
  return [
    { label: tr("Open Remember Me"), click: showMain },
    { label: tr("New task"), click: () => openInMain('new') },
    pauseMenuItem(),
    aboutMenuItem(),
    { type: 'separator' },
    exitMenuItem(),
  ];
}
function rebuildTrayMenu() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(trayMenuItems()));
}
function pauseMenuItem() {
  if (isPaused(store?.state?.settings?.pausedUntil)) return { label: tr("Resume reminders"), click: () => { pause.resume(); scan(); } };
  return { label: tr("Pause reminders"), submenu: [
    { label: tr("For 1 hour"), click: () => pauseFor('hour') },
    { label: tr("Until tomorrow, {time}", { time: new Date(2026, 0, 1, 8).toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' }) }), click: () => pauseFor('tomorrow') },
    { label: tr("Until I resume"), click: () => pauseFor('manual') },
  ] };
}
function pauseFor(choice) { pause.pause(choice); scan(); }
function aboutMenuItem() { return { label: tr("About Remember Me"), click: () => showSection('about') }; }
function exitMenuItem() {
  return { label: tr("Exit and stop reminders"), click: async () => {
    const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: tr("Close Remember Me"), message: tr("Reminders will stop until you open the app again."), buttons: [tr("Keep running"), tr("Exit")], defaultId: 0, cancelId: 0 });
    if (response === 1) { quitting = true; app.quit(); }
  } };
}
// "until 11:15", or with the weekday when the pause ends on another day.
function pauseText(pausedUntil) {
  if (pausedUntil === UNTIL_RESUMED) return tr("until you resume");
  const end = new Date(pausedUntil), sameDay = end.toDateString() === new Date().toDateString();
  const time = end.toLocaleString(localeTag(), sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return tr("until {time}", { time });
}
function activeAlerts() { const queue = alertQueue(store.state, preview); preview = queue.preview; return queue.alerts; }
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
  // While paused nothing pops up or beeps; due reminders stay queued and appear when it ends.
  const paused = pause.check();
  announceUpcoming(paused);
  const queue = activeAlerts(), tasks = shownAlerts(queue, paused);
  const current = new Set(tasks.map(t => t.id));
  const newlyDue = tasks.some(t => !previousDue.has(t.id));
  previousDue = current;
  if (tasks.length) {
    if (!alertWindow || alertWindow.isDestroyed()) {
      alertWindow = new BrowserWindow({ width: 410, height: 570, frame: false, resizable: false, minimizable: false,
        maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: background('alert'), icon: windowIcon, webPreferences: options() });
      secure(alertWindow);
      alertWindow.setAlwaysOnTop(true, 'pop-up-menu');
      placeAlert();
      alertWindow.loadFile(path.join(__dirname, '../../ui/alert.html'));
      alertWindow.once('ready-to-show', () => { if (alertWindow && activeAlerts().length) alertWindow.showInactive(); });
      alertWindow.on('session-end', () => { quitting = true; });
      alertWindow.on('close', event => { if (!quitting && activeAlerts().length) event.preventDefault(); });
      alertWindow.on('closed', () => { alertWindow = null; });
    } else if (!alertWindow.isVisible()) alertWindow.showInactive();
    if (newlyDue && store.state.settings.sound && !testMode) shell.beep();
    repeatBeep(store.state.settings.sound && !testMode && tasks[0].id !== '__preview' ? tasks[0].id : null, store.state.settings.remindAgain || 0);
  } else { repeatBeep(null, 0); if (alertWindow && !(undoable && undoable.until > Date.now())) { alertWindow.destroy(); alertWindow = null; } }
  if (newlyDue) notifyViews();
  const waiting = tasks.length > 0 && tasks[0].id !== '__preview';
  if (tray && waiting !== trayWaiting) { trayWaiting = waiting; tray.setImage(nativeImage.createFromPath(trayIcon(waiting))); }
  if (tray) tray.setToolTip(paused ? (queue.length ? tr("Remember Me • Reminders paused {until} • {count} waiting", { until: pauseText(store.state.settings.pausedUntil), count: queue.length }) : tr("Remember Me • Reminders paused {until}", { until: pauseText(store.state.settings.pausedUntil) }))
    : tasks.length ? tr("Remember Me • {count} reminders waiting", { count: tasks.length }) : tr("Remember Me • Your tasks on time"));
}
function purgeExpiredTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  if ([...store.state.tasks, ...store.state.notes].some(i => i.deletedAt && Date.parse(i.deletedAt) <= limit)) log.info('trash-purged', { count: store.change(s => purgeTrash(s)) });
}
function setLogin(enabled) {
  if (testMode) return;
  if (!app.isPackaged) { if (enabled) throw new Error(tr('Use the installed version of the app to start it with Windows.')); return; }
  setLoginItem(app, enabled, process.execPath);
}
function createUpdates() {
  // Test runs never contact GitHub; electron-updater itself does nothing in development builds.
  const updater = testMode ? Object.assign(new (require('node:events'))(), { checkForUpdates: async () => null, quitAndInstall() {} })
    : configureUpdater(require('electron-updater').autoUpdater);
  // Logs each change of update state with versions only; electron-updater's messages can hold paths and URLs.
  let loggedState = 'idle';
  const onChange = () => {
    if (updates && updates.state !== loggedState) { loggedState = updates.state; log.info('update', { state: updates.state, version: app.getVersion(), ...(updates.next ? { next: String(updates.next).slice(0, 40) } : {}) }); }
    // Only the main window shows update status; the alert window is never refreshed for it.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('waqt:update');
  };
  return new Updates({ updater, version: app.getVersion(), consent: () => store.state.settings.autoUpdate, onChange,
    backup: () => safetyBackup(app.getPath('userData'), store.state, 'RememberMe-before-update-'),
    prepareQuit: () => { quitting = true; }, quit: () => app.quit() });
}
// What the IPC handlers (./handlers) need from the main process. Getters, because the store,
// windows and services are created in start() and windows come and go.
const PAGES = { main: path.join(__dirname, '../../ui/index.html'), alert: path.join(__dirname, '../../ui/alert.html') };
const ctx = {
  app, log, electron: { dialog, shell, clipboard }, UNDO_MS, imagePreview,
  tr, errorText, language, localeTag, messages, activeAlerts, openInMain, takeOpenRequest, setLogin, rebuildTrayMenu, placeAlert, applyTheme,
  get store() { return store; }, get mainWindow() { return mainWindow; }, get alertWindow() { return alertWindow; },
  get driveBackup() { return driveBackup; }, get updates() { return updates; },
  get preview() { return preview; }, set preview(value) { preview = value; },
  get undoable() { return undoable; }, set undoable(value) { undoable = value; },
};
async function start() {
  // The UI needs no camera, microphone, notifications, location or other browser permissions.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  store = new Store(app.getPath('userData'));
  log.info('start', { version: app.getVersion(), packaged: app.isPackaged, tasks: store.state.tasks.length, notes: store.state.notes.length, attachments: store.state.attachments.length });
  if (store.recovered) log.warn('data-recovered-from-bak');
  pause = createPause({ read: () => store.state.settings.pausedUntil, write: value => { store.change(s => { s.settings.pausedUntil = value; }); rebuildTrayMenu(); notifyViews(); } });
  nativeTheme.themeSource = store.state.settings.theme;
  nativeTheme.on('updated', applyTheme);
  driveBackup = new DriveBackup(app.getPath('userData'), () => store.state, notifyViews, { log });
  // After an upgrade the entry may still point at the old Waqt.exe, or at an old install folder.
  if (store.state.settings.startAtLogin && app.isPackaged && !testMode) {
    try { refreshLoginItem(app, process.execPath); } catch (error) { console.error('Could not update start with Windows:', error); log.warn('login-item-refresh-failed', error); }
  }
  updates = createUpdates();
  createMain();
  tray = new Tray(nativeImage.createFromPath(trayIcon(false)));
  rebuildTrayMenu();
  tray.on('double-click', showMain);
  tray.on('click', showMain);
  registerHandlers(ctx, { ipcMain, scan, notifyViews, pages: PAGES });
  interval = setInterval(scan, 1000);
  purgeExpiredTrash();
  backupInterval = setInterval(() => { driveBackup.tick(); try { purgeExpiredTrash(); } catch (error) { console.error('Trash purge failed:', error); log.error('trash-purge-failed', error); } }, 60000);
  if (!testMode) driveBackup.tick();
  updates.start();
  powerMonitor.on('resume', () => { log.info('resume'); scan(); });
  powerMonitor.on('unlock-screen', scan);
  screen.on('display-metrics-changed', placeAlert);
  screen.on('display-removed', placeAlert);
  screen.on('display-added', placeAlert);
  scan();
}
app.on('web-contents-created', (event, contents) => contents.on('will-attach-webview', e => e.preventDefault()));
app.on('activate', showMain);
app.on('window-all-closed', () => {});
app.on('before-quit', event => {
  log.info('quit');
  quitting = true; clearInterval(interval); clearInterval(backupInterval);
  // With a downloaded update this waits for a safety backup, then installs it.
  updates?.beforeQuit(event);
});
