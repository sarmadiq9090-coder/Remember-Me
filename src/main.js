'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor, shell, dialog } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Store, saveTask, completeTask, snoozeTask, dueTasks } = require('./core');
const { attachmentIds, opensAsProgram, importFiles, resolveAttachment, exportBackup, MAX_ATTACHMENTS } = require('./attachments');
const { createPreviewService } = require('./image-preview');
const { DriveBackup } = require('./drive-backup');
const testMode = process.env.WAQT_TEST === '1';
app.setName('ذكرني');
app.setPath('userData', testMode && process.env.WAQT_DATA_DIR ? process.env.WAQT_DATA_DIR : path.join(app.getPath('appData'), 'Waqt'));
app.setAppUserModelId('com.waqt.reminder');
let mainWindow, alertWindow, tray, store, quitting = false, interval, preview = null, driveBackup, backupInterval;
const imagePreview = createPreviewService(nativeImage);
let previousDue = new Set();
const icon = path.join(__dirname, '../assets/icon.png');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('تعذّر تشغيل ذكرني', error.message); app.quit(); });
}
function options() { return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }; }
function secure(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}
function createMain() {
  mainWindow = new BrowserWindow({ width: 1250, height: 850, minWidth: 900, minHeight: 650,
    title: 'ذكرني • مساحة ليومك', icon, show: false, backgroundColor: '#f7f8fa', autoHideMenuBar: true, webPreferences: options() });
  mainWindow.setMenu(null);
  secure(mainWindow);
  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));
  mainWindow.on('session-end', () => { quitting = true; });
  mainWindow.on('close', e => { if (!quitting) { e.preventDefault(); mainWindow.hide(); } });
  mainWindow.once('ready-to-show', () => { if (!process.argv.includes('--background')) mainWindow.show(); });
}
function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
function placeAlert() {
  if (!alertWindow || alertWindow.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(410, area.width - 24), height = Math.min(570, area.height - 24);
  alertWindow.setBounds({ x: store.state.settings.alertSide === 'left' ? area.x + 16 : area.x + area.width - width - 16,
    y: area.y + area.height - height - 12, width, height });
}
function notifyViews() {
  for (const win of [mainWindow, alertWindow]) if (win && !win.isDestroyed()) win.webContents.send('waqt:update');
}
function language() { return store?.state?.settings?.language === 'en' ? 'en' : 'ar'; }
function nativeText(ar, en) { return language() === 'en' ? en : ar; }
function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nativeText('فتح ذكرني', 'Open Remember Me'), click: showMain },
    { label: nativeText('مهمة جديدة', 'New task'), click: () => { showMain(); mainWindow.webContents.send('waqt:update'); mainWindow.webContents.executeJavaScript('window.openTaskEditor?.()'); } },
    { type: 'separator' },
    { label: nativeText('خروج وإيقاف التذكيرات', 'Exit and stop reminders'), click: async () => {
      const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: nativeText('إغلاق ذكرني', 'Close Remember Me'), message: nativeText('ستتوقف التذكيرات حتى تفتح البرنامج مجددًا.', 'Reminders will stop until you open the app again.'), buttons: [nativeText('البقاء في الخلفية', 'Keep running'), nativeText('خروج', 'Exit')], defaultId: 0, cancelId: 0 });
      if (response === 1) { quitting = true; app.quit(); }
    } }
  ]));
}
function activeAlerts() { const tasks = dueTasks(store.state); return tasks.length ? tasks : (preview ? [preview] : []); }
// The scheduler must survive any single failure; an exception here would otherwise repeat every second.
function scan() { try { scanNow(); } catch (error) { console.error('Reminder scan failed:', error); } }
function scanNow() {
  const tasks = activeAlerts();
  const current = new Set(tasks.map(t => t.id));
  const newlyDue = tasks.some(t => !previousDue.has(t.id));
  previousDue = current;
  if (tasks.length) {
    if (!alertWindow || alertWindow.isDestroyed()) {
      alertWindow = new BrowserWindow({ width: 410, height: 570, frame: false, resizable: false, minimizable: false,
        maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#ffffff', icon, webPreferences: options() });
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
  } else if (alertWindow) { alertWindow.destroy(); alertWindow = null; }
  if (newlyDue) notifyViews();
  if (tray) tray.setToolTip(tasks.length ? (language() === 'en' ? `Remember Me • ${tasks.length} reminders waiting` : `ذكرني • ${tasks.length} تذكير بانتظارك`) : nativeText('ذكرني • مهامك في وقتها', 'Remember Me • Your tasks on time'));
}
function setLogin(enabled) {
  if (testMode) return;
  if (!app.isPackaged) { if (enabled) throw new Error('شغّل نسخة البرنامج الجاهزة لتفعيل التشغيل مع ويندوز.'); return; }
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--background'] });
}
async function start() {
  store = new Store(app.getPath('userData'));
  driveBackup = new DriveBackup(app.getPath('userData'), () => store.state, notifyViews);
  createMain();
  tray = new Tray(nativeImage.createFromPath(icon));
  rebuildTrayMenu();
  tray.on('double-click', showMain);
  tray.on('click', showMain);
  ipcMain.handle('waqt:action', async (event, action, payload) => {
    try {
      if (![mainWindow?.webContents, alertWindow?.webContents].includes(event.sender)) throw new Error('طلب غير مسموح.');
      if (event.sender === alertWindow?.webContents && !['alerts', 'language', 'complete', 'snooze', 'open', 'openAttachment', 'imagePreview'].includes(action)) throw new Error('طلب غير مسموح.');
      let value;
      switch (action) {
        case 'state': value = { ...store.state, dataPath: app.getPath('userData'), packaged: app.isPackaged, recovered: store.recovered, driveBackup: driveBackup.status() }; break;
        case 'alerts': value = activeAlerts().map(t => ({ ...t, files: (t.attachments || []).map(id => store.state.attachments.find(a => a.id === id)).filter(Boolean) })); break;
        case 'language': value = language(); break;
        case 'saveTask': store.change(s => saveTask(s, payload)); break;
        case 'complete':
          if (payload.id === '__preview') preview = null;
          else store.change(s => completeTask(s, payload.id));
          break;
        case 'snooze':
          if (payload.id === '__preview') { if (!payload.until || Date.parse(payload.until) <= Date.now()) throw new Error('اختر وقتًا لاحقًا.'); preview = null; }
          else store.change(s => snoozeTask(s, payload.id, payload.until));
          break;
        case 'reopen': store.change(s => { const t = s.tasks.find(t => t.id === payload.id); if (t) { t.completedAt = null; t.dueAt = null; t.scheduleAt = null; t.repeat = 'none'; t.snoozedAt = null; } }); break;
        case 'deleteTask': store.change(s => { s.tasks = s.tasks.filter(t => t.id !== payload.id); }); break;
        case 'saveNote': store.change(s => {
          const title = String(payload.title || '').trim();
          if (!title || title.length > 200) throw new Error('أضف عنوانًا للملاحظة، حتى 200 حرف.');
          let note = s.notes.find(n => n.id === payload.id);
          if (!note) { note = { id: randomUUID(), createdAt: new Date().toISOString() }; s.notes.push(note); }
          Object.assign(note, { title, body: String(payload.body || '').slice(0, 50000), attachments: attachmentIds(payload.attachments ?? note.attachments ?? []), color: ['cream', 'green', 'blue', 'pink'].includes(payload.color) ? payload.color : 'cream', updatedAt: new Date().toISOString() });
        }); break;
        case 'deleteNote': store.change(s => { s.notes = s.notes.filter(n => n.id !== payload.id); }); break;
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
          const result = await dialog.showOpenDialog(mainWindow, { title: 'اختر مجلدًا متزامنًا داخل Google Drive', properties: ['openDirectory', 'createDirectory'], defaultPath: driveBackup.status().folder || undefined });
          if (!result.canceled) { await driveBackup.configure(result.filePaths[0]); value = driveBackup.status(); }
          break;
        }
        case 'driveBackupNow': value = await driveBackup.run(); break;
        case 'driveAutomatic': driveBackup.setAutomatic(payload.enabled); break;
        case 'driveHelp': await shell.openExternal('https://www.google.com/drive/download/'); break;
        case 'openDriveFolder': {
          const folder = driveBackup.status().folder;
          if (!folder) throw new Error('اختر مجلد Google Drive أولًا.');
          const error = await shell.openPath(folder);
          if (error) throw new Error('مجلد Google Drive غير متاح حاليًا.');
          break;
        }
        case 'settings': {
          const old = store.state.settings;
          const settings = { sound: !!payload.sound, startAtLogin: !!payload.startAtLogin, alertSide: payload.alertSide === 'left' ? 'left' : 'right', language: payload.language === 'en' ? 'en' : 'ar' };
          if (old.startAtLogin !== settings.startAtLogin) setLogin(settings.startAtLogin);
          try { store.change(s => { s.settings = settings; }); }
          catch (err) { if (old.startAtLogin !== settings.startAtLogin) setLogin(old.startAtLogin); throw err; }
          rebuildTrayMenu(); placeAlert(); break;
        }
        case 'preview': preview = { id: '__preview', title: nativeText('حان وقت استراحة صغيرة ☕', 'Time for a short break ☕'), body: nativeText('هذا تنبيه تجريبي. يبقى ظاهرًا حتى تختار «تم» أو «ذكّرني لاحقًا». التأجيل هنا يغلق المعاينة فقط.', 'This is a preview alert. It stays visible until you choose Done or Snooze. Snoozing here only closes the preview.'), dueAt: new Date().toISOString(), priority: 'normal', category: 'personal' }; break;
        case 'export': {
          const result = await dialog.showOpenDialog(mainWindow, { title: 'اختر مكان حفظ النسخة الاحتياطية مع المرفقات', properties: ['openDirectory', 'createDirectory'] });
          if (!result.canceled) value = await exportBackup(store.state, app.getPath('userData'), result.filePaths[0]);
          break;
        }
        case 'dataFolder': await shell.openPath(app.getPath('userData')); break;
        case 'open': showMain(); break;
        default: throw new Error('إجراء غير معروف.');
      }
      if (!['state', 'alerts', 'language', 'open', 'openAttachment', 'imagePreview', 'dataFolder', 'export', 'driveHelp', 'openDriveFolder'].includes(action)) { scan(); notifyViews(); }
      return { ok: true, value };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  interval = setInterval(scan, 1000);
  backupInterval = setInterval(() => driveBackup.tick(), 60000);
  if (!testMode) driveBackup.tick();
  powerMonitor.on('resume', scan);
  powerMonitor.on('unlock-screen', scan);
  screen.on('display-metrics-changed', placeAlert);
  screen.on('display-removed', placeAlert);
  scan();
}
app.on('activate', showMain);
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; clearInterval(interval); clearInterval(backupInterval); });
