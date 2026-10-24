const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require(process.env.WAQT_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-desktop-test-'));
const executablePath = process.env.WAQT_EXECUTABLE || require('electron');
const errors = [];
let app;
async function launch() {
  app = await electron.launch({ executablePath, args: process.env.WAQT_EXECUTABLE ? [] : [root], env: { ...process.env, WAQT_TEST: '1', WAQT_DATA_DIR: dataDir }, timeout: 60000 });
  await app.firstWindow();
  let page;
  for (let i = 0; i < 100; i++) {
    page = app.windows().find(p => p.url().endsWith('/index.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(page, 'Main window exists');
  page.on('pageerror', err => errors.push(err.message));
  await page.waitForFunction(() => document.getElementById('date-label')?.textContent);
  return page;
}
async function call(page, action, payload) {
  const result = await page.evaluate(async ({action, payload}) => window.waqt.call(action, payload), { action, payload });
  assert.equal(result.ok, true, result.error); return result.value;
}
async function alertPage() {
  for (let i = 0; i < 50; i++) {
    const found = app.windows().find(p => p.url().endsWith('/alert.html'));
    if (found) { await found.waitForFunction(() => document.getElementById('alert-title')?.textContent); return found; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Reminder window did not appear');
}
(async () => {
  try {
    let page = await launch();
    // A new install starts in English, left to right.
    assert.ok((await page.title()).includes('Remember Me'));
    assert.equal(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir].join()), 'en,ltr');
    assert.equal(await page.locator('.local-label').count(), 0);
    assert.equal(await page.locator('[data-category], #task-category, [data-filter="work"], [data-filter="study"], [data-filter="personal"]').count(), 0);
    await page.locator('.brand-mark').waitFor();
    await page.locator('[data-view="settings"]').click();
    assert.equal(await page.locator('#setting-language').inputValue(), 'en');
    // No Arabic is left in the English interface, apart from the language's own name and the digit sample.
    const arabicLeft = await page.evaluate(() => {
      const found = [], allowed = /^(العربية|Arabic-Indic ١٢٣)$/;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode())) { const text = node.nodeValue.trim(); if (/[؀-ۿ]/.test(text) && !allowed.test(text)) found.push(text); }
      for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) if (/[؀-ۿ]/.test(el.getAttribute(attr) || '')) found.push(attr + ': ' + el.getAttribute(attr));
      return found;
    });
    assert.deepEqual(arabicLeft, [], 'Arabic text in the English interface');
    const languages = await page.locator('#setting-language option').allTextContents();
    assert.deepEqual(languages, require('../ui/lib/translate').LOCALES.map(l => l.name), 'Languages are listed by their own names');
    assert.deepEqual(languages.slice(0, 2), ['English', 'العربية']);
    assert.ok((await page.locator('.brand').textContent()).includes('Remember Me'));
    assert.ok((await page.locator('#settings-section').textContent()).includes('Language'));
    await page.locator('#settings-preview').click();
    let languageAlert = await alertPage();
    assert.match(await languageAlert.locator('[data-preset="tomorrow"] span').textContent(), /^Tomorrow \d/);
    assert.equal(await languageAlert.locator('#alert-complete').evaluate(el => el === document.activeElement), true, 'Done has the focus');
    assert.equal(await languageAlert.locator('[role=alertdialog]').count(), 1);
    await languageAlert.screenshot({ path: path.join(root, 'screenshots/reminder-en.png') });
    await languageAlert.locator('#alert-complete').click();
    await page.locator('#setting-language').selectOption('ar');
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    await page.locator('[data-view="today"]').click();
    await page.locator('#new-task').click();
    await page.locator('#task-title').fill('مراجعة خطة الأسبوع');
    await page.locator('#task-body').fill('تحديد ثلاث أولويات والعمل على أهمها أولًا.');
    await page.locator('#task-priority').selectOption('high');
    await page.locator('#task-form button[type=submit]').click();
    await page.getByText('مراجعة خطة الأسبوع', { exact: true }).waitFor();
    await page.locator('#quick-title').fill('قراءة عشر صفحات');
    await page.locator('#quick-form button').click();
    await page.getByText('قراءة عشر صفحات', { exact: true }).waitFor();
    const due = new Date(Date.now() + 3600000).toISOString();
    await call(page, 'saveTask', { title: 'وقت لاستراحة قصيرة', dueAt: due, category: 'personal' });
    await call(page, 'saveTask', { title: 'مراجعة مفردات اللغة', body: 'عشر دقائق تكفي لبناء عادة جميلة.', category: 'study', priority: 'medium', dueAt: due, repeat: 'daily' });
    await page.locator('[data-view="notes"]').click();
    await page.locator('#page-add').click();
    await page.locator('#note-title').fill('أفكار للأسبوع القادم');
    await page.locator('#note-body').fill('أخصص وقتًا للقراءة.\nأرتب مساحة العمل.\nأجعل البداية بسيطة.');
    await page.locator('.swatch:has(input[value=green])').click();
    await page.locator('.style-tile:has(input[value=sticky])').click();
    await page.locator('#note-form button[type=submit]').click();
    await page.locator('.note-card[data-paper=green][data-note-style=sticky]').waitFor();
    await page.locator('.note-card').click();
    await page.locator('#note-body').fill('ملاحظة معدلة ومحفوظة بعد إعادة التشغيل.');
    await page.locator('#note-form button[type=submit]').click();
    await page.locator('[data-view="today"]').click();
    await page.locator('#search').fill('خطة');
    assert.equal(await page.locator('.task-row').count(), 1);
    await page.locator('#search').fill('');
    // Rebuilding the list keeps keyboard focus on the same control of the same task (QC R24).
    const ids = await page.locator('#task-list .task-row').evaluateAll(rows => rows.map(r => r.dataset.id));
    await page.locator(`#task-list [data-id="${ids[0]}"] [data-action="delete"]`).focus();
    const kept = await page.evaluate(() => { const list = document.getElementById('task-list'); window.replaceMarkup(list, list.innerHTML); window.render(); const a = document.activeElement; return [a.closest('[data-id]')?.dataset.id, a.dataset.action]; });
    assert.deepEqual(kept, [ids[0], 'delete'], 'Focus survives a rebuild');
    // Deleting with the keyboard moves focus to the next task's Delete, and Ctrl+Z undoes it (QC R29).
    await page.keyboard.press('Enter');
    await page.locator('#toast .toast-action').waitFor();
    assert.deepEqual(await page.evaluate(() => { const a = document.activeElement; return [a.closest('[data-id]')?.dataset.id, a.dataset.action]; }), [ids[1], 'delete'], 'Focus moves to the next task');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(count => document.querySelectorAll('#task-list .task-row').length === count, ids.length);
    assert.equal(await page.locator('#toast').isHidden(), true);
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'screenshots/main.png') });
    // A real scheduled reminder, not the preview. It must trigger without the main UI open.
    await call(page, 'saveTask', { title: 'اختبار التنبيه الفعلي', body: 'يبقى هذا التنبيه حتى الإنجاز أو التأجيل.', dueAt: new Date(Date.now() + 1800).toISOString() });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle().includes('مساحة')).close());
    let alert = await alertPage();
    const native = await app.evaluate(({ BrowserWindow, screen }) => {
      const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'));
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/alert.html'));
      return { hidden: !main.isVisible(), top: win.isAlwaysOnTop(), bounds: win.getBounds(), area: screen.getPrimaryDisplay().workArea };
    });
    assert.ok(native.hidden, 'Main window should close to tray');
    assert.ok(native.top, 'Reminder should be always on top');
    assert.equal(native.bounds.y + native.bounds.height, native.area.y + native.area.height - 12);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/alert.html')).close());
    assert.ok(!alert.isClosed(), 'Closing a pending reminder must not dismiss it');
    await new Promise(r => setTimeout(r, 2200));
    assert.equal(await alert.locator('#alert-title').textContent(), 'اختبار التنبيه الفعلي');
    assert.match(await alert.locator('[data-preset="tomorrow"] span').textContent(), /^غدًا \d/);
    await alert.screenshot({ path: path.join(root, 'screenshots/reminder.png') });
    await alert.locator('[data-preset="tomorrow"]').click();
    await page.waitForTimeout(250);
    let saved = await call(page, 'state');
    let task = saved.tasks.find(t => t.title === 'اختبار التنبيه الفعلي');
    const morning = new Date(); morning.setDate(morning.getDate() + 1); morning.setHours(9, 0, 0, 0);
    assert.equal(Date.parse(task.dueAt), morning.getTime(), 'Tomorrow 9 AM snooze must persist');
    // Accelerate the persisted snooze so the actual scheduler can be verified again.
    await call(page, 'saveTask', { ...task, dueAt: new Date(Date.now() + 1000).toISOString() });
    alert = await alertPage();
    await alert.locator('[data-preset="pick"]').click();
    await alert.locator('#snooze-until').fill('2020-01-01T10:00');
    await alert.locator('#snooze-form button').click();
    await alert.locator('#alert-error').filter({ hasText: 'لاحقًا' }).waitFor();
    const custom = new Date(Date.now() + 7200000);
    const local = new Date(custom.getTime() - custom.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await alert.locator('#snooze-until').fill(local);
    await alert.locator('#snooze-form button').click();
    await page.waitForTimeout(250);
    saved = await call(page, 'state'); task = saved.tasks.find(t => t.id === task.id);
    assert.ok(Date.parse(task.dueAt) > Date.now() + 7000000, 'Custom snooze must persist');
    // Leave two overdue reminders on disk and relaunch to test catch-up and queue.
    await call(page, 'saveTask', { ...task, dueAt: new Date(Date.now() - 27 * 3600000).toISOString() });
    await call(page, 'saveTask', { title: 'التنبيه الثاني مع عنوان طويل جدًا يمتد على أكثر من سطر حتى يظهر القص في نافذة التنبيه', body: 'ملاحظة قصيرة.', priority: 'high', dueAt: new Date(Date.now() - 26 * 3600000).toISOString() });
    await app.close();
    page = await launch();
    assert.equal((await call(page, 'state')).notes[0].body, 'ملاحظة معدلة ومحفوظة بعد إعادة التشغيل.');
    alert = await alertPage();
    assert.ok((await alert.locator('#alert-position').textContent()).includes('2'));
    assert.equal(await alert.locator('#alert-shell.overdue').count(), 1, 'Overdue reminders are marked');
    await alert.screenshot({ path: path.join(root, 'screenshots/reminder-queue.png') });
    await alert.locator('#alert-complete').click();
    await alert.getByRole('heading', { name: /^التنبيه الثاني/ }).waitFor();
    await alert.screenshot({ path: path.join(root, 'screenshots/reminder-long.png') });
    await alert.locator('#alert-complete').click();
    // The alert stays for the 6-second undo window after the last Done, then closes.
    for (let i = 0; i < 100 && app.windows().some(p => p.url().endsWith('/alert.html')); i++) await page.waitForTimeout(100);
    assert.equal(app.windows().filter(p => p.url().endsWith('/alert.html')).length, 0);
    saved = await call(page, 'state');
    assert.equal(saved.tasks.filter(t => t.completedAt).length, 2);
    await page.locator('[data-view="completed"]').click();
    assert.equal(await page.locator('.task-row').count(), 2);
    // Deleting moves the task to the trash at once, with Undo instead of a confirmation.
    await page.locator('.task-row').first().locator('[data-action="delete"]').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#tasks-section .task-row').count(), 1);
    await page.locator('[data-view="trash"]').click();
    assert.equal(await page.locator('#trash-list .task-row').count(), 1);
    assert.deepEqual(errors, [], 'No renderer errors');
    console.log('PASS: Arabic task/note CRUD, search, persistence, native tray behavior, scheduler, sticky alert, quick/custom snooze, overdue recovery, queue, completion, deletion.');
    console.log('Screenshots: screenshots/main.png and screenshots/reminder.png');
  } finally {
    if (app) await app.close().catch(() => {});
    console.log('Isolated test data:', dataDir);
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
