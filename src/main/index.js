'use strict';
const { app, nativeImage, ipcMain, screen, powerMonitor, shell, dialog, session, nativeTheme, clipboard } = require('electron');
const path = require('node:path');
const { Store } = require('../core/store');
const { createPreviewService } = require('../data/image-preview');
const { DriveBackup } = require('../data/drive-backup');
const { safetyBackup } = require('../data/backups');
const { createLogger } = require('../platform/logger');
const { Updates, configure: configureUpdater, installedByInstaller } = require('../platform/updates');
const { migrateDataFolder } = require('../platform/data-folder');
const { setLoginItem, refreshLoginItem } = require('../platform/login-item');
const { createPause } = require('../core/pause');
const { registerHandlers } = require('./handlers');
const { createI18n, startupControlsLocale } = require('./i18n');
const { createWindows } = require('./windows');
const { createTray } = require('./tray');
const { createScheduler } = require('./scheduler');
const testMode = process.env.WAQT_TEST === '1';
// Lets the desktop tests read early notifications without showing them.
if (testMode) globalThis.waqtTest = { get early() { return ctx.scheduler.earlyLog; } };
app.setName('Remember Me');
// Runs before anything (including the single-instance lock) creates files in the data folder.
const dataFolder = testMode && process.env.WAQT_DATA_DIR ? { folder: process.env.WAQT_DATA_DIR, migrated: 'none' } : migrateDataFolder(app.getPath('appData'));
if (dataFolder.error) console.error('Could not move the data folder; using the old one:', dataFolder.error);
app.setPath('userData', dataFolder.folder);
// Native date, time and number fields follow the app's language rather than Windows'. Chromium reads
// this only before ready, so a new language reaches them after a restart (see the settings action).
const controlsLocale = startupControlsLocale(dataFolder.folder);
app.commandLine.appendSwitch('lang', controlsLocale);
// The ID predates the Remember Me name. Keep it: it names the start-with-Windows entry and taskbar
// group of v1.4.0, and the installer's appId must stay the same for upgrades and updates.
app.setAppUserModelId('com.waqt.reminder');
// Local log for bug reports: ids, counts and outcomes only, never task or note content or paths.
const log = createLogger(app.getPath('userData'));
if (dataFolder.migrated !== 'none') log.info('data-folder-migrated', { result: dataFolder.migrated });
if (dataFolder.error) log.warn('data-folder-migration-failed', dataFolder.error);
let interval, backupInterval;

// Shared by the main-process modules and the IPC handlers. store, pause, driveBackup and updates are
// set in start(); quitting lets windows close for real.
const ctx = { app, log, testMode, electron: { dialog, shell, clipboard }, UNDO_MS: 6000, imagePreview: createPreviewService(nativeImage),
  quitting: false, store: null, pause: null, driveBackup: null, updates: null, setLogin, controlsLocale };
Object.assign(ctx, createI18n(() => ctx.store?.state?.settings?.language));
ctx.windows = createWindows(ctx);
ctx.tray = createTray(ctx);
ctx.scheduler = createScheduler(ctx);
// The flat names the handlers use.
const { windows, tray, scheduler } = ctx;
Object.assign(ctx, { activeAlerts: scheduler.activeAlerts, openInMain: windows.openInMain, takeOpenRequest: windows.takeOpenRequest,
  rebuildTrayMenu: tray.rebuildTrayMenu, placeAlert: windows.placeAlert, applyTheme: windows.applyTheme });
Object.defineProperties(ctx, {
  mainWindow: { get: () => windows.mainWindow }, alertWindow: { get: () => windows.alertWindow },
  preview: { get: () => scheduler.preview, set: value => { scheduler.preview = value; } },
  undoable: { get: () => scheduler.undoable, set: value => { scheduler.undoable = value; } },
});
const PAGES = { main: path.join(__dirname, '../../ui/index.html'), alert: path.join(__dirname, '../../ui/alert.html') };

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => windows.showMain());
  app.whenReady().then(start).catch(error => { log.error('start-failed', error); dialog.showErrorBox(ctx.tr('Remember Me could not start'), ctx.errorText(error)); app.quit(); });
}
function setLogin(enabled) {
  if (testMode) return;
  if (!app.isPackaged) { if (enabled) throw new Error(ctx.tr('Use the installed version of the app to start it with Windows.')); return; }
  setLoginItem(app, enabled, process.execPath);
}
function createUpdates() {
  // Test runs never contact GitHub, and neither do copies the installer didn't put there (portable or
  // Scoop); electron-updater itself does nothing in development builds.
  const available = !testMode && (!app.isPackaged || installedByInstaller(process.execPath));
  const updater = !available ? Object.assign(new (require('node:events'))(), { checkForUpdates: async () => null, quitAndInstall() {} })
    : configureUpdater(require('electron-updater').autoUpdater);
  // Logs each change of update state with versions only; electron-updater's messages can hold paths and URLs.
  let loggedState = 'idle';
  const onChange = () => {
    const { updates } = ctx;
    if (updates && updates.state !== loggedState) { loggedState = updates.state; log.info('update', { state: updates.state, version: app.getVersion(), ...(updates.next ? { next: String(updates.next).slice(0, 40) } : {}) }); }
    windows.notifyMain();
  };
  return new Updates({ updater, available: available || testMode, version: app.getVersion(), consent: () => ctx.store.state.settings.autoUpdate, onChange,
    backup: () => safetyBackup(app.getPath('userData'), ctx.store.state, 'RememberMe-before-update-'),
    prepareQuit: () => { ctx.quitting = true; }, quit: () => app.quit() });
}
async function start() {
  // The UI needs no camera, microphone, notifications, location or other browser permissions.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const store = ctx.store = new Store(app.getPath('userData'));
  log.info('start', { version: app.getVersion(), packaged: app.isPackaged, tasks: store.state.tasks.length, notes: store.state.notes.length, attachments: store.state.attachments.length });
  if (store.recovered) log.warn('data-recovered-from-bak');
  ctx.pause = createPause({ read: () => store.state.settings.pausedUntil, write: value => { store.change(s => { s.settings.pausedUntil = value; }); tray.rebuildTrayMenu(); windows.notifyViews(); } });
  nativeTheme.themeSource = store.state.settings.theme;
  nativeTheme.on('updated', windows.applyTheme);
  const driveBackup = ctx.driveBackup = new DriveBackup(app.getPath('userData'), () => store.state, windows.notifyViews, { log });
  // After an upgrade the entry may still point at the old Waqt.exe, or at an old install folder.
  if (store.state.settings.startAtLogin && app.isPackaged && !testMode) {
    try { refreshLoginItem(app, process.execPath); } catch (error) { console.error('Could not update start with Windows:', error); log.warn('login-item-refresh-failed', error); }
  }
  const updates = ctx.updates = createUpdates();
  windows.createMain();
  tray.create();
  registerHandlers(ctx, { ipcMain, scan: scheduler.scan, notifyViews: windows.notifyViews, pages: PAGES });
  interval = setInterval(scheduler.scan, 1000);
  scheduler.purgeExpiredTrash();
  backupInterval = setInterval(() => { driveBackup.tick(); try { scheduler.purgeExpiredTrash(); } catch (error) { console.error('Trash purge failed:', error); log.error('trash-purge-failed', error); } }, 60000);
  if (!testMode) driveBackup.tick();
  updates.start();
  powerMonitor.on('resume', () => { log.info('resume'); scheduler.scan(); });
  powerMonitor.on('unlock-screen', scheduler.scan);
  screen.on('display-metrics-changed', windows.placeAlert);
  screen.on('display-removed', windows.placeAlert);
  screen.on('display-added', windows.placeAlert);
  scheduler.scan();
}
app.on('web-contents-created', (event, contents) => contents.on('will-attach-webview', e => e.preventDefault()));
app.on('activate', () => windows.showMain());
app.on('window-all-closed', () => {});
app.on('before-quit', event => {
  log.info('quit');
  ctx.quitting = true; clearInterval(interval); clearInterval(backupInterval);
  // With a downloaded update this waits for a safety backup, then installs it.
  ctx.updates?.beforeQuit(event);
});
