'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor, shell, dialog, session, Notification, nativeTheme, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { REMIND_AGAIN, Store, saveTask, completeTask, skipOccurrence, undoComplete, snoozeTask, dueTasks, alertQueue, upcomingTasks, trashItem, restoreItem, purgeItem, purgeTrash, TRASH_DAYS } = require('./core');
const { storageUsage, removeOrphans, attachmentIds, opensAsProgram, importFiles, resolveAttachment, exportBackup, MAX_ATTACHMENTS } = require('./attachments');
const { createPreviewService } = require('./image-preview');
const { DriveBackup } = require('./drive-backup');
const { checkRequest, fromPage } = require('./ipc');
const { alertBounds } = require('./placement');
const { readBackup, safetyBackup, restoreBackup } = require('./backups');
const { createRepeatBeep } = require('./repeat-beep');
const { createLogger } = require('./logger');
const { Updates, configure: configureUpdater } = require('./updates');
const { migrateDataFolder } = require('./data-folder');
const { setLoginItem, refreshLoginItem } = require('./login-item');
const { linkUrl, diagnostics } = require('./about');
const { UNTIL_RESUMED, isPaused, shownAlerts, createPause } = require('./pause');
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
// Early notifications already shown, by task and due time, so each occurrence is announced once.
const announced = new Set();
const earlyLog = [];
function announceUpcoming() {
  for (const task of upcomingTasks(store.state)) {
    const key = task.id + ':' + task.dueAt;
    if (announced.has(key)) continue;
    announced.add(key);
    const time = new Date(task.dueAt).toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' });
    const message = { title: nativeText(`قريبًا: ${task.title}`, `Coming up: ${task.title}`), body: nativeText(`الموعد عند ${time}`, `Due at ${time}`) };
    if (testMode) { earlyLog.push(message); continue; }
    if (!Notification.isSupported()) continue;
    const notification = new Notification({ ...message, icon, silent: !store.state.settings.sound });
    notification.on('click', showMain);
    notification.show();
  }
}
const icon = path.join(__dirname, '../assets/icon.png');
// Windows picks the matching size from the ICO for the title bar, taskbar and Alt+Tab.
const windowIcon = path.join(__dirname, '../assets/icon.ico');
// 16 px tray images; nativeImage also loads their @1.5x and @2x files for scaled displays.
const trayIcon = waiting => path.join(__dirname, '../assets', waiting ? 'tray-waiting.png' : 'tray.png');
// The tray shows a dotted variant while real reminders are waiting; trayWaiting avoids calling setImage every second.
let trayWaiting = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(start).catch(error => { log.error('start-failed', error); dialog.showErrorBox(nativeText('تعذّر تشغيل ذكرني', 'Remember Me could not start'), error.message); app.quit(); });
}
// Window backgrounds match ui/dark.css so opening a window never flashes the other theme.
function background(light, dark) { return nativeTheme.shouldUseDarkColors ? dark : light; }
function applyTheme() {
  nativeTheme.themeSource = store.state.settings.theme;
  for (const [win, light, dark] of [[mainWindow, '#f7f8fa', '#181d27'], [alertWindow, '#ffffff', '#15171e']]) if (win && !win.isDestroyed()) win.setBackgroundColor(background(light, dark));
}
function options() { return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }; }
function secure(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}
function createMain(visible = !process.argv.includes('--background')) {
  const win = mainWindow = new BrowserWindow({ width: 1250, height: 850, minWidth: 900, minHeight: 650,
    title: nativeText('ذكرني • مساحة ليومك', 'Remember Me • Your day'), icon: windowIcon, show: false, backgroundColor: background('#f7f8fa', '#181d27'), autoHideMenuBar: true, webPreferences: options() });
  win.setMenu(null);
  secure(win);
  win.loadFile(path.join(__dirname, '../ui/index.html'));
  win.on('session-end', () => { quitting = true; });
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  // A page-initiated window.close() destroys the window without a cancelable close; rebuild it on demand.
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.once('ready-to-show', () => { if (visible) win.show(); });
}
// Asks the main window to open a new task editor, once its page has loaded if the window is new.
function openTaskEditor() {
  showMain();
  const contents = mainWindow?.webContents;
  if (!contents) return;
  if (contents.isLoading()) contents.once('did-finish-load', () => contents.send('waqt:open-editor'));
  else contents.send('waqt:open-editor');
}
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
function language() { return store?.state?.settings?.language === 'en' ? 'en' : 'ar'; }
// The same locale the windows use, including a chosen digit style.
// Dates and times always use Western digits (0-9), in Arabic too, so the layout never shifts.
function localeTag() { return (language() === 'en' ? 'en-US' : 'ar-IQ') + '-u-nu-latn'; }
function nativeText(ar, en) { return language() === 'en' ? en : ar; }
// The tray menu, top to bottom. Each feature adds its item here and builds it in its own function.
function trayMenuItems() {
  return [
    { label: nativeText('فتح ذكرني', 'Open Remember Me'), click: showMain },
    { label: nativeText('مهمة جديدة', 'New task'), click: openTaskEditor },
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
  if (isPaused(store?.state?.settings?.pausedUntil)) return { label: nativeText('استئناف التذكيرات', 'Resume reminders'), click: () => { pause.resume(); scan(); } };
  return { label: nativeText('إيقاف التذكيرات مؤقتًا', 'Pause reminders'), submenu: [
    { label: nativeText('لمدة ساعة', 'For 1 hour'), click: () => pauseFor('hour') },
    { label: nativeText('حتى الغد الساعة 8:00', 'Until tomorrow, 8:00'), click: () => pauseFor('tomorrow') },
    { label: nativeText('حتى أستأنفها', 'Until I resume'), click: () => pauseFor('manual') },
  ] };
}
function pauseFor(choice) { pause.pause(choice); scan(); }
function aboutMenuItem() { return { label: nativeText('حول ذكرني', 'About Remember Me'), click: () => showSection('about') }; }
function exitMenuItem() {
  return { label: nativeText('خروج وإيقاف التذكيرات', 'Exit and stop reminders'), click: async () => {
    const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: nativeText('إغلاق ذكرني', 'Close Remember Me'), message: nativeText('ستتوقف التذكيرات حتى تفتح البرنامج مجددًا.', 'Reminders will stop until you open the app again.'), buttons: [nativeText('البقاء في الخلفية', 'Keep running'), nativeText('خروج', 'Exit')], defaultId: 0, cancelId: 0 });
    if (response === 1) { quitting = true; app.quit(); }
  } };
}
// "until 11:15", or with the weekday when the pause ends on another day.
function pauseText(pausedUntil) {
  if (pausedUntil === UNTIL_RESUMED) return nativeText('حتى تستأنفها', 'until you resume');
  const end = new Date(pausedUntil), sameDay = end.toDateString() === new Date().toDateString();
  const time = end.toLocaleString(localeTag(), sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return nativeText(`حتى ${time}`, `until ${time}`);
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
  if (!paused) announceUpcoming();
  const queue = activeAlerts(), tasks = shownAlerts(queue, paused);
  const current = new Set(tasks.map(t => t.id));
  const newlyDue = tasks.some(t => !previousDue.has(t.id));
  previousDue = current;
  if (tasks.length) {
    if (!alertWindow || alertWindow.isDestroyed()) {
      alertWindow = new BrowserWindow({ width: 410, height: 570, frame: false, resizable: false, minimizable: false,
        maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: background('#ffffff', '#15171e'), icon: windowIcon, webPreferences: options() });
      secure(alertWindow);
      alertWindow.setAlwaysOnTop(true, 'pop-up-menu');
      placeAlert();
      alertWindow.loadFile(path.join(__dirname, '../ui/alert.html'));
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
  if (tray) tray.setToolTip(paused ? nativeText(`ذكرني • التذكيرات متوقفة ${pauseText(store.state.settings.pausedUntil)}`, `Remember Me • Reminders paused ${pauseText(store.state.settings.pausedUntil)}`) + (queue.length ? nativeText(` • ${queue.length} بانتظارك`, ` • ${queue.length} waiting`) : '')
    : tasks.length ? (language() === 'en' ? `Remember Me • ${tasks.length} reminders waiting` : `ذكرني • ${tasks.length} تذكير بانتظارك`) : nativeText('ذكرني • مهامك في وقتها', 'Remember Me • Your tasks on time'));
}
function purgeExpiredTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  if ([...store.state.tasks, ...store.state.notes].some(i => i.deletedAt && Date.parse(i.deletedAt) <= limit)) log.info('trash-purged', { count: store.change(s => purgeTrash(s)) });
}
function setLogin(enabled) {
  if (testMode) return;
  if (!app.isPackaged) { if (enabled) throw new Error('شغّل نسخة البرنامج الجاهزة لتفعيل التشغيل مع ويندوز.'); return; }
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
    notifyViews();
  };
  return new Updates({ updater, version: app.getVersion(), consent: () => store.state.settings.autoUpdate, onChange,
    backup: () => safetyBackup(app.getPath('userData'), store.state, 'RememberMe-before-update-'),
    prepareQuit: () => { quitting = true; }, quit: () => app.quit() });
}
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
  driveBackup = new DriveBackup(app.getPath('userData'), () => store.state, notifyViews, { text: nativeText, log });
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
  ipcMain.handle('waqt:action', async (event, action, payload) => {
    try {
      const fromAlert = !!alertWindow && event.sender === alertWindow.webContents;
      const page = path.join(__dirname, '../ui', fromAlert ? 'alert.html' : 'index.html');
      if ((!fromAlert && event.sender !== mainWindow?.webContents) || !fromPage(event.senderFrame?.url, page)) throw new Error(nativeText('طلب غير مسموح.', 'Request not allowed.'));
      payload = checkRequest(action, payload, { fromAlert, text: nativeText });
      let value;
      switch (action) {
        case 'state': value = { ...store.state, dataPath: app.getPath('userData'), packaged: app.isPackaged, recovered: store.recovered, driveBackup: driveBackup.status(), updates: updates.status() }; break;
        case 'alerts': value = activeAlerts().map(t => ({ ...t, files: (t.attachments || []).map(id => store.state.attachments.find(a => a.id === id)).filter(Boolean) })); break;
        case 'language': value = { language: language() }; break;
        case 'saveTask': store.change(s => saveTask(s, payload)); break;
        case 'complete':
          if (payload.id === '__preview') preview = null;
          else {
            // done is null when the reminder was already handled (a double click or another window).
            const done = store.change(s => completeTask(s, payload.id, new Date(), { expectedDueAt: payload.expectedDueAt }));
            value = done;
            if (done && fromAlert) undoable = { ...done, title: store.state.tasks.find(t => t.id === done.id)?.title || '', until: Date.now() + UNDO_MS };
          }
          break;
        case 'skip':
          if (payload.id === '__preview') throw new Error(nativeText('المعاينة لا تتكرر.', 'The preview does not repeat.'));
          value = store.change(s => skipOccurrence(s, payload.id, payload.expectedDueAt, new Date()));
          break;
        case 'undoComplete':
          if (fromAlert && (!undoable || undoable.id !== payload.id || undoable.copyId !== payload.copyId)) throw new Error(nativeText('انتهت مهلة التراجع.', 'It is too late to undo.'));
          store.change(s => undoComplete(s, payload.id, String(payload.copyId || '')));
          undoable = null;
          break;
        case 'undoable': value = undoable && undoable.until > Date.now() ? undoable : null; break;
        case 'snooze':
          if (payload.id === '__preview') { if (!payload.until || Date.parse(payload.until) <= Date.now()) throw new Error('اختر وقتًا لاحقًا.'); preview = null; }
          else value = store.change(s => snoozeTask(s, payload.id, payload.until, new Date(), { expectedDueAt: payload.expectedDueAt }));
          break;
        case 'reopen': store.change(s => { const t = s.tasks.find(t => t.id === payload.id); if (t) { t.completedAt = null; t.dueAt = null; t.scheduleAt = null; t.repeat = 'none'; t.snoozedAt = null; } }); break;
        case 'deleteTask': store.change(s => trashItem(s, 'tasks', payload.id)); break;
        case 'restoreTask': store.change(s => restoreItem(s, 'tasks', payload.id)); break;
        case 'purgeTask': store.change(s => purgeItem(s, 'tasks', payload.id)); break;
        case 'saveNote': store.change(s => {
          const title = String(payload.title || '').trim();
          if (!title || title.length > 200) throw new Error('أضف عنوانًا للملاحظة، حتى 200 حرف.');
          let note = s.notes.find(n => n.id === payload.id);
          if (!note) { note = { id: randomUUID(), createdAt: new Date().toISOString() }; s.notes.push(note); }
          Object.assign(note, { title, body: String(payload.body || '').slice(0, 50000), attachments: attachmentIds(payload.attachments ?? note.attachments ?? []), color: ['cream', 'green', 'blue', 'pink'].includes(payload.color) ? payload.color : 'cream', updatedAt: new Date().toISOString() });
        }); break;
        case 'deleteNote': store.change(s => trashItem(s, 'notes', payload.id)); break;
        case 'restoreNote': store.change(s => restoreItem(s, 'notes', payload.id)); break;
        case 'purgeNote': store.change(s => purgeItem(s, 'notes', payload.id)); break;
        case 'emptyTrash': store.change(s => purgeTrash(s, new Date(), true)); break;
        case 'attachFiles': {
          const remaining = Math.min(MAX_ATTACHMENTS, Math.max(0, Number(payload?.remaining) || 0));
          if (!remaining) throw new Error('وصلت إلى الحد الأقصى: 20 مرفقًا.');
          const result = await dialog.showOpenDialog(mainWindow, { title: 'إضافة مرفقات — PDF وExcel وبقية الملفات', properties: ['openFile', 'multiSelections'], filters: [
            { name: 'كل الملفات', extensions: ['*'] }, { name: 'صور', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }, { name: 'PDF', extensions: ['pdf'] }, { name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm', 'csv'] }, { name: 'مستندات', extensions: ['docx', 'doc', 'txt', 'rtf'] }
          ] });
          if (result.canceled) { value = []; break; }
          if (result.filePaths.length > remaining) throw new Error(`يمكنك إضافة ${remaining} ملفات أخرى إلى هذا العنصر.`);
          const records = await importFiles(app.getPath('userData'), result.filePaths);
          store.change(s => { s.attachments.push(...records); });
          value = records; break;
        }
        case 'openAttachment': {
          if (event.sender === alertWindow?.webContents && !activeAlerts().some(t => (t.attachments || []).includes(payload.id))) throw new Error('المرفق لا يتبع تنبيهًا نشطًا.');
          const { file, record } = resolveAttachment(store.state, app.getPath('userData'), payload.id);
          if (opensAsProgram(record.name)) shell.showItemInFolder(file);
          else {
            const error = await shell.openPath(file);
            if (error) throw new Error('تعذّر فتح الملف. تأكد من وجود برنامج مناسب لهذا النوع، مثل قارئ PDF أو Excel.');
          }
          break;
        }
        case 'imagePreview': {
          if (event.sender === alertWindow?.webContents && !activeAlerts().some(t => (t.attachments || []).includes(payload.id))) throw new Error('الصورة لا تتبع تنبيهًا نشطًا.');
          value = await imagePreview(store.state, app.getPath('userData'), payload.id);
          break;
        }
        case 'chooseDriveFolder': {
          const result = await dialog.showOpenDialog(mainWindow, { title: nativeText('اختر مجلدًا متزامنًا داخل Google Drive', 'Choose a synced folder inside Google Drive'), properties: ['openDirectory', 'createDirectory'], defaultPath: driveBackup.status().folder || undefined });
          if (!result.canceled) { await driveBackup.configure(result.filePaths[0]); value = driveBackup.status(); }
          break;
        }
        case 'driveBackupNow': value = await driveBackup.run(); break;
        case 'driveAutomatic': driveBackup.setAutomatic(payload.enabled); break;
        case 'driveKeep': {
          const keep = payload.keep;
          const expired = await driveBackup.expired(keep);
          if (expired.length) {
            const { response } = await dialog.showMessageBox(mainWindow, { type: 'warning', title: nativeText('حذف النسخ القديمة', 'Delete old backups'),
              message: nativeText(`ستُحذف ${expired.length} من النسخ التلقائية الأقدم.`, `${expired.length} older automatic backups will be deleted.`),
              detail: nativeText('تبقى أحدث النسخ والنسخ التي صدّرتها بنفسك. ما يُحذف من مجلد Drive ينتقل إلى سلة محذوفات Google Drive.', 'The newest copies and backups you exported yourself are kept. Copies removed from the Drive folder go to the Google Drive trash.'),
              buttons: [nativeText('إلغاء', 'Cancel'), nativeText('حذف', 'Delete')], defaultId: 0, cancelId: 0 });
            if (response !== 1) break;
          }
          await driveBackup.setKeep(keep);
          break;
        }
        case 'driveHelp': await shell.openExternal('https://www.google.com/drive/download/'); break;
        case 'openDriveFolder': {
          const folder = driveBackup.status().folder;
          if (!folder) throw new Error(nativeText('اختر مجلد Google Drive أولًا.', 'Choose a Google Drive folder first.'));
          const error = await shell.openPath(folder);
          if (error) throw new Error(nativeText('مجلد Google Drive غير متاح حاليًا.', 'The Google Drive folder is not available right now.'));
          break;
        }
        case 'settings': {
          const old = store.state.settings;
          const settings = { sound: !!payload.sound, startAtLogin: !!payload.startAtLogin, alertSide: payload.alertSide === 'left' ? 'left' : 'right', language: payload.language === 'en' ? 'en' : 'ar',
            weekStart: [0, 1, 6].includes(payload.weekStart) ? payload.weekStart : 6, theme: ['light', 'dark'].includes(payload.theme) ? payload.theme : 'system',
            remindAgain: REMIND_AGAIN.includes(payload.remindAgain) ? payload.remindAgain : 0 };
          if (old.startAtLogin !== settings.startAtLogin) setLogin(settings.startAtLogin);
          try { store.change(s => { s.settings = { ...s.settings, ...settings }; }); }
          catch (err) { if (old.startAtLogin !== settings.startAtLogin) setLogin(old.startAtLogin); throw err; }
          rebuildTrayMenu(); placeAlert(); applyTheme(); break;
        }
        case 'preview':
          if (dueTasks(store.state).length) throw new Error(nativeText('يظهر الآن تذكير حقيقي. جرّب المعاينة بعد إنهائه.', 'A real reminder is showing now. Try the preview after you finish it.'));
          preview = { id: '__preview', title: nativeText('حان وقت استراحة صغيرة ☕', 'Time for a short break ☕'), body: nativeText('هذا تنبيه تجريبي. يبقى ظاهرًا حتى تختار «تم» أو «ذكّرني لاحقًا». التأجيل هنا يغلق المعاينة فقط.', 'This is a preview alert. It stays visible until you choose Done or Snooze. Snoozing here only closes the preview.'), dueAt: new Date().toISOString(), priority: 'normal', category: 'personal' }; break;
        case 'export': {
          const result = await dialog.showOpenDialog(mainWindow, { title: nativeText('اختر مكان حفظ النسخة الاحتياطية مع المرفقات', 'Choose where to save the backup with attachments'), properties: ['openDirectory', 'createDirectory'] });
          if (result.canceled) break;
          const skipped = [];
          value = { folder: await exportBackup(store.state, app.getPath('userData'), result.filePaths[0], { skipped }), skipped };
          log.info('export', { attachments: store.state.attachments.length, skipped: skipped.length });
          break;
        }
        case 'restore': {
          const result = await dialog.showOpenDialog(mainWindow, { title: nativeText('اختر مجلد نسخة احتياطية من ذكرني', 'Choose a Remember Me backup folder'), properties: ['openDirectory'], defaultPath: path.join(app.getPath('userData'), 'backups') });
          if (result.canceled) break;
          const backup = await readBackup(result.filePaths[0], { text: nativeText });
          const { tasks, notes, attachments } = backup.state;
          const when = backup.createdAt ? new Date(backup.createdAt).toLocaleString(localeTag()) : nativeText('غير معروف', 'unknown');
          const { response } = await dialog.showMessageBox(mainWindow, { type: 'warning', title: nativeText('استعادة نسخة احتياطية', 'Restore a backup'),
            message: nativeText('ستحل هذه النسخة محل كل مهامك وملاحظاتك الحالية.', 'This backup will replace all your current tasks and notes.'),
            detail: nativeText(`${tasks.length} مهمة، ${notes.length} ملاحظة، ${attachments.length} مرفق • تاريخ النسخة: ${when}
${backup.verified ? 'تحققنا من سلامة كل الملفات.' : 'نسخة أقدم دون بصمات: تحققنا من وجود الملفات وأحجامها فقط.'}
قبل الاستبدال نحفظ نسخة أمان من بياناتك الحالية في مجلد النسخ.`,
              `${tasks.length} tasks, ${notes.length} notes, ${attachments.length} attachments • Backup date: ${when}
${backup.verified ? 'Every file was verified.' : 'Older backup without checksums: only file presence and sizes were checked.'}
A safety copy of your current data is saved in the backups folder first.`),
            buttons: [nativeText('إلغاء', 'Cancel'), nativeText('استعادة', 'Restore')], defaultId: 0, cancelId: 0 });
          if (response !== 1) break;
          preview = null;
          value = await restoreBackup(app.getPath('userData'), store, backup);
          log.info('restore', { tasks: tasks.length, notes: notes.length, attachments: attachments.length, verified: backup.verified });
          break;
        }
        case 'storage': value = await storageUsage(store.state, app.getPath('userData')); break;
        case 'cleanOrphans': {
          const usage = await storageUsage(store.state, app.getPath('userData'));
          if (!usage.orphans) { value = usage; break; }
          const size = (usage.orphanBytes / 1048576).toFixed(1);
          const { response } = await dialog.showMessageBox(mainWindow, { type: 'warning', title: nativeText('تنظيف المرفقات', 'Clean up attachments'),
            message: nativeText(`ستُحذف ${usage.orphans} من المرفقات غير المستخدمة (${size} ميغابايت).`, `${usage.orphans} unused attachments (${size} MB) will be deleted.`),
            detail: nativeText('لا تتبع هذه الملفات أي مهمة أو ملاحظة، بما فيها المهام المكتملة. النسخ الاحتياطية تحتفظ بنسخها الخاصة.', 'No task or note uses these files, including completed tasks. Backups keep their own copies.'),
            buttons: [nativeText('إلغاء', 'Cancel'), nativeText('حذف', 'Delete')], defaultId: 0, cancelId: 0 });
          if (response !== 1) break;
          log.info('clean-orphans', { count: (await removeOrphans(store, app.getPath('userData'))).count });
          value = await storageUsage(store.state, app.getPath('userData'));
          break;
        }
        case 'dataFolder': await shell.openPath(app.getPath('userData')); break;
        case 'updateConsent': store.change(s => { s.settings.autoUpdate = payload.enabled; }); updates.consentChanged(); break;
        case 'checkUpdates': value = await updates.check(); break;
        case 'installUpdate':
          try { value = await updates.restart(); }
          catch (error) { throw new Error(nativeText(`تعذّر حفظ نسخة أمان من بياناتك، فلم يُثبَّت التحديث. ${error.message}`, `Couldn't save a safety copy of your data, so the update was not installed. ${error.message}`), { cause: error }); }
          break;
        case 'dismissUpdate': updates.dismiss(); break;
        case 'openLink': await shell.openExternal(linkUrl(payload.link)); break;
        case 'copyDiagnostics':
          value = diagnostics({ version: app.getVersion(), packaged: app.isPackaged, versions: process.versions, windows: os.release(), arch: process.arch,
            language: language(), theme: store.state.settings.theme });
          clipboard.writeText(value);
          break;
        case 'openLogs': {
          // The folder appears with the first log line; create it so the button always opens something.
          fs.mkdirSync(log.folder, { recursive: true });
          const error = await shell.openPath(log.folder);
          if (error) throw new Error(nativeText('تعذّر فتح مجلد السجل.', "Couldn't open the log folder."));
          break;
        }
        case 'open': showMain(); break;
        default: throw new Error('إجراء غير معروف.');
      }
      if (!['state', 'alerts', 'undoable', 'language', 'open', 'openAttachment', 'imagePreview', 'storage', 'dataFolder', 'export', 'driveHelp', 'openDriveFolder', 'checkUpdates', 'installUpdate', 'dismissUpdate', 'openLink', 'copyDiagnostics', 'openLogs'].includes(action)) { scan(); notifyViews(); }
      return { ok: true, value };
    } catch (error) { log.warn('action-failed', error, { action: typeof action === 'string' ? action.slice(0, 40) : typeof action }); return { ok: false, error: error.message }; }
  });
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
