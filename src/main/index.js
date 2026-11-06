'use strict';
const { app, nativeImage, ipcMain, screen, powerMonitor, shell, dialog, session, nativeTheme, clipboard, globalShortcut } = require('electron');
const path = require('node:path');
const { Store } = require('../core/store');
const { createPreviewService } = require('../data/image-preview');
const { DriveBackup } = require('../data/drive-backup');
const { safetyBackup } = require('../data/backups');
const { createLogger } = require('../platform/logger');
const { Updates, updateSource, createUpdater } = require('../platform/updates');
const { migrateDataFolder, storeDataFolder } = require('../platform/data-folder');
const { setLoginItem, refreshLoginItem, appUserModelId, STARTUP_SETTINGS } = require('../platform/login-item');
const { createPause } = require('../core/pause');
const { registerHandlers } = require('./handlers');
const { createI18n, systemLanguage, systemRegion, startupControlsLocale } = require('./i18n');
const { createWindows } = require('./windows');
const { createTray } = require('./tray');
const { createScheduler } = require('./scheduler');
const { createProblems } = require('./problems');
const { createQuickAdd } = require('./quick-add');
const { secureContents, httpsShell } = require('./web-security');
const { isStoreUrl } = require('../platform/about');
const testMode = process.env.WAQT_TEST === '1';
// True in the Microsoft Store (MSIX) package: the Store updates it, Windows runs its startup task,
// and its data lives in the package's own folder (see docs/distribution/microsoft-store.md).
const windowsStore = process.windowsStore === true;
// Lets the desktop tests read early notifications without showing them.
if (testMode) globalThis.waqtTest = { get early() { return ctx.scheduler.earlyLog; } };
app.setName('Remember Me');
// Runs before anything (including the single-instance lock) creates files in the data folder.
const dataFolder = testMode && process.env.WAQT_DATA_DIR ? { folder: process.env.WAQT_DATA_DIR, migrated: 'none' }
  : windowsStore ? storeDataFolder(app.getPath('appData'), { localAppData: process.env.LOCALAPPDATA, execPath: process.execPath })
    : migrateDataFolder(app.getPath('appData'));
if (dataFolder.error) console.error('Could not move the data folder; using the old one:', dataFolder.error);
app.setPath('userData', dataFolder.folder);
// A fresh install (no data.json yet) starts in Windows' preferred language when the app has it, else
// English. A saved language is always kept. This matters most for the Store version, which has no
// installer page to ask.
const firstRunLanguage = systemLanguage(app);
// Native date, time and number fields follow the app's language rather than Windows'. Chromium reads
// this only before ready, so a new language reaches them after a restart (see the settings action).
const controlsLocale = startupControlsLocale(dataFolder.folder, firstRunLanguage);
app.commandLine.appendSwitch('lang', controlsLocale);
// The installer version keeps the ID from v1.4.0; the Store package uses the one its identity gives it.
const userModelId = appUserModelId({ windowsStore });
if (userModelId) app.setAppUserModelId(userModelId);
// Local log for bug reports: ids, counts and outcomes only, never task or note content or paths.
const log = createLogger(app.getPath('userData'));
if (dataFolder.migrated !== 'none') log.info('data-folder-migrated', { result: dataFolder.migrated });
if (dataFolder.error) log.warn('data-folder-migration-failed', dataFolder.error);
let interval, backupInterval;

// Shared by the main-process modules and the IPC handlers. store, pause, driveBackup and updates are
// set in start(); quitting lets windows close for real.
// shell.openExternal opens only https:// addresses.
const ctx = { app, log, testMode, electron: { dialog, shell: httpsShell(shell), clipboard }, UNDO_MS: 6000, imagePreview: createPreviewService(nativeImage),
  quitting: false, store: null, pause: null, driveBackup: null, updates: null, setLogin, controlsLocale, windowsStore,
  // The Store version just copied the installer version's data: the page suggests uninstalling that one.
  importedFromInstaller: dataFolder.migrated === 'imported',
  // Windows' own Startup apps page: the Store version's start with Windows is a startup task the user turns on there.
  openStartupSettings: () => shell.openExternal(STARTUP_SETTINGS) };
// Before the data is read (a start error), the fresh-install language is the best guess.
Object.assign(ctx, createI18n(() => ctx.store?.state?.settings?.language || firstRunLanguage,
  () => ({ months: ctx.store?.state?.settings?.arabicMonths, region: ctx.region })));
// Crashes and uncaught errors go to the log; after one, or after repeated errors, the user is offered a pre-filled GitHub issue.
ctx.problems = createProblems(ctx);
ctx.problems.install();
ctx.windows = createWindows(ctx);
ctx.tray = createTray(ctx);
ctx.scheduler = createScheduler(ctx);
ctx.quickAdd = createQuickAdd(ctx, globalShortcut);
// Microsoft Store pages (the rating request, "More from FastKiwi"): only ms-windows-store: addresses from about.js.
ctx.openStoreLink = async url => { if (!isStoreUrl(url)) throw new Error('only Microsoft Store pages open here'); await shell.openExternal(url); };
// The flat names the handlers use.
const { windows, tray, scheduler } = ctx;
Object.assign(ctx, { activeAlerts: scheduler.activeAlerts, openInMain: windows.openInMain, takeOpenRequest: windows.takeOpenRequest,
  rebuildTrayMenu: tray.rebuildTrayMenu, placeAlert: windows.placeAlert, applyTheme: windows.applyTheme });
Object.defineProperties(ctx, {
  mainWindow: { get: () => windows.mainWindow }, alertWindow: { get: () => windows.alertWindow }, quickAddWindow: { get: () => windows.quickAddWindow },
  preview: { get: () => scheduler.preview, set: value => { scheduler.preview = value; } },
  undoable: { get: () => scheduler.undoable, set: value => { scheduler.undoable = value; } },
});
const PAGES = { main: path.join(__dirname, '../../ui/index.html'), alert: path.join(__dirname, '../../ui/alert.html'), quickAdd: path.join(__dirname, '../../ui/quickadd.html') };

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => windows.showMain());
  app.whenReady().then(start).catch(error => { log.error('start-failed', error); dialog.showErrorBox(ctx.tr('Remember Me could not start'), ctx.errorText(error)); app.quit(); });
}
function setLogin(enabled) {
  if (testMode) return;
  if (!app.isPackaged) { if (enabled) throw new Error(ctx.tr('Use the installed version of the app to start it with Windows.')); return; }
  setLoginItem(app, enabled, process.execPath, { windowsStore });
}
function createUpdates() {
  // Test runs never contact GitHub, and neither do the Microsoft Store package (the Store updates it) or
  // copies the installer didn't put there (portable or Scoop); electron-updater itself does nothing in
  // development builds.
  const source = updateSource({ windowsStore, packaged: app.isPackaged, execPath: process.execPath });
  const updater = createUpdater({ source, testMode });
  // Logs each change of update state with versions only; electron-updater's messages can hold paths and URLs.
  let loggedState = 'idle';
  const onChange = () => {
    const { updates } = ctx;
    if (updates && updates.state !== loggedState) { loggedState = updates.state; log.info('update', { state: updates.state, version: app.getVersion(), ...(updates.next ? { next: String(updates.next).slice(0, 40) } : {}) }); }
    windows.notifyMain();
  };
  return new Updates({ updater, source, available: testMode || source === 'github', version: app.getVersion(), consent: () => ctx.store.state.settings.autoUpdate, onChange,
    backup: () => safetyBackup(app.getPath('userData'), ctx.store.state, 'RememberMe-before-update-'),
    prepareQuit: () => { ctx.quitting = true; }, quit: () => app.quit() });
}
async function start() {
  // The UI needs no camera, microphone, notifications, location or other browser permissions.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // No spellchecker, so Chromium never downloads dictionaries (the windows also set spellcheck: false).
  session.defaultSession.setSpellCheckerEnabled(false);
  const store = ctx.store = new Store(app.getPath('userData'), { language: firstRunLanguage });
  // For the Arabic month names: Iraq and the Levant say «تشرين الثاني», elsewhere «نوفمبر».
  ctx.region = systemRegion(app);
  log.info('start', { version: app.getVersion(), packaged: app.isPackaged, windowsStore, ...(windowsStore ? { dataFolder: dataFolder.store } : {}), tasks: store.state.tasks.length, notes: store.state.notes.length, attachments: store.state.attachments.length });
  if (store.recovered) log.warn('data-recovered-from-bak');
  ctx.pause = createPause({ read: () => store.state.settings.pausedUntil, write: value => { store.change(s => { s.settings.pausedUntil = value; }); tray.rebuildTrayMenu(); windows.notifyViews(); } });
  nativeTheme.themeSource = store.state.settings.theme;
  nativeTheme.on('updated', windows.applyTheme);
  const driveBackup = ctx.driveBackup = new DriveBackup(app.getPath('userData'), () => store.state, windows.notifyViews, { log });
  // After an upgrade the entry may still point at the old Waqt.exe, or at an old install folder.
  // The Store version's startup task belongs to Windows, so there is no entry to refresh.
  if (store.state.settings.startAtLogin && app.isPackaged && !testMode && !windowsStore) {
    try { refreshLoginItem(app, process.execPath); } catch (error) { console.error('Could not update start with Windows:', error); log.warn('login-item-refresh-failed', error); }
  }
  const updates = ctx.updates = createUpdates();
  windows.createMain();
  tray.create();
  registerHandlers(ctx, { ipcMain, scan: scheduler.scan, notifyViews: windows.notifyViews, pages: PAGES });
  // Quick add from anywhere: the global shortcut, when it is turned on in Settings.
  ctx.quickAdd.apply();
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
// Every page, in every window: no new windows, no navigation away from it, no webviews.
app.on('web-contents-created', (event, contents) => secureContents(contents));
app.on('activate', () => windows.showMain());
app.on('window-all-closed', () => {});
app.on('will-quit', () => ctx.quickAdd.stop());
app.on('before-quit', event => {
  log.info('quit');
  ctx.quitting = true; clearInterval(interval); clearInterval(backupInterval);
  // With a downloaded update this waits for a safety backup, then installs it.
  ctx.updates?.beforeQuit(event);
});
