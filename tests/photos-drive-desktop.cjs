const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require(process.env.WAQT_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-photos-drive-'));
const dataDir = path.join(temp, 'data'), syncDir = path.join(temp, 'Google Drive');
fs.mkdirSync(syncDir);
const errors = [];
let app;
async function launch() {
  app = await electron.launch({ executablePath: process.env.WAQT_EXECUTABLE || require('electron'), args: process.env.WAQT_EXECUTABLE ? [] : [root], env: { ...process.env, WAQT_TEST: '1', WAQT_DATA_DIR: dataDir }, timeout: 60000 });
  await app.firstWindow();
  let page;
  for (let i = 0; i < 80; i++) { page = app.windows().find(p => p.url().endsWith('/index.html')); if (page) break; await new Promise(r => setTimeout(r, 100)); }
  await page.waitForFunction(() => document.getElementById('date-label')?.textContent);
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openPath = async p => { globalThis.__opened.push(p); return ''; }; globalThis.__external = []; shell.openExternal = async p => { globalThis.__external.push(p); }; });
  return page;
}
async function pick(paths) { await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, paths); }
async function call(page, action, payload) {
  const result = await page.evaluate(({ action, payload }) => window.waqt.call(action, payload), { action, payload });
  assert.ok(result.ok, result.error); return result.value;
}
async function photos(page, selector, count) {
  await page.locator(selector).first().waitFor();
  for (let i = 0; i < count; i++) {
    await page.locator(selector).nth(i).scrollIntoViewIfNeeded();
    await page.waitForFunction(({ selector, i }) => { const img = document.querySelectorAll(selector)[i]; return img?.complete && img.naturalWidth > 0; }, { selector, i });
  }
  await page.waitForFunction(({ selector, count }) => { const imgs = [...document.querySelectorAll(selector)]; return imgs.length === count && imgs.every(i => i.complete && i.naturalWidth > 0); }, { selector, count });
}
(async () => {
  try {
    let page = await launch();
    const png = path.join(temp, 'صورة #1 %.png'), jpg = path.join(temp, 'صورة ثانية.jpg');
    fs.copyFileSync(path.join(root, 'assets/icon.png'), png);
    const jpeg = await app.evaluate(({ nativeImage }, image) => nativeImage.createFromPath(image).toJPEG(85).toString('base64'), png);
    fs.writeFileSync(jpg, Buffer.from(jpeg, 'base64'));
    await page.locator('#new-task').click();
    await page.locator('#task-title').fill('راجع الصور مع هذه الملاحظة');
    await page.locator('#task-body').fill('هذه صورة PNG وصورة JPG محفوظتان مع نص التذكير.');
    await pick([png, jpg]); await page.locator('#task-attach').click();
    await photos(page, '#task-files img[data-preview-id]', 2);
    await page.locator('#task-form button[type=submit]').click();
    await photos(page, '.task-row img[data-preview-id]', 2);
    assert.ok((await page.locator('.task-body').textContent()).includes('PNG'));
    await page.locator('[data-view="notes"]').click();
    await page.locator('#page-add').click();
    await page.locator('#note-title').fill('صورة وفكرة في مكان واحد');
    await page.locator('#note-body').fill('تظهر الصور مباشرة بجانب النص، ويمكن فتحها بالحجم الكامل.');
    await pick([png, jpg]); await page.locator('#note-attach').click();
    await photos(page, '#note-files img[data-preview-id]', 2);
    await page.locator('#note-form button[type=submit]').click();
    await photos(page, '.note-card img[data-preview-id]', 2);
    await page.locator('.note-card .inline-photo').first().click();
    assert.equal((await app.evaluate(() => globalThis.__opened)).length, 1);
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'screenshots/notes-photos.png') });
    fs.renameSync(png, png + '.moved'); fs.renameSync(jpg, jpg + '.moved');
    await app.close(); page = await launch();
    await page.locator('[data-view="notes"]').click(); await photos(page, '.note-card img[data-preview-id]', 2);
    let state = await call(page, 'state');
    await call(page, 'saveTask', { ...state.tasks[0], dueAt: new Date(Date.now() - 1000).toISOString() });
    let alert;
    for (let i = 0; i < 80; i++) { alert = app.windows().find(p => p.url().endsWith('/alert.html')); if (alert) break; await new Promise(r => setTimeout(r, 100)); }
    assert.ok(alert); alert.on('pageerror', error => errors.push(error.message));
    await photos(alert, '#alert-files img[data-preview-id]', 2);
    assert.ok((await alert.locator('#alert-note').textContent()).includes('PNG'));
    assert.equal(await alert.evaluate(() => document.getElementById('snooze-until').getBoundingClientRect().bottom < innerHeight), true);
    await alert.screenshot({ path: path.join(root, 'screenshots/reminder-photos.png') });
    await alert.locator('#alert-complete').click();
    await page.locator('[data-view="settings"]').click();
    await page.locator('#drive-install').click();
    assert.deepEqual(await app.evaluate(() => globalThis.__external), ['https://www.google.com/drive/download/']);
    await pick([syncDir]); await page.locator('#choose-drive-folder').click();
    await page.waitForFunction(() => !document.getElementById('drive-now').disabled);
    await page.locator('#drive-now').click();
    await page.waitForFunction(() => document.getElementById('drive-status').textContent.includes('آخر نسخة'));
    state = await call(page, 'state');
    assert.ok(state.driveBackup.lastCopiedAt);
    const cloud = state.driveBackup.lastDrivePath;
    const manifest = JSON.parse(fs.readFileSync(path.join(cloud, 'data.json')));
    assert.equal(manifest.notes[0].body, state.notes[0].body);
    assert.equal(manifest.attachments.length, 4);
    for (const a of manifest.attachments) assert.ok(fs.existsSync(path.join(cloud, 'attachments', a.id, a.name)));
    await page.locator('#drive-automatic').uncheck();
    await page.waitForTimeout(100);
    assert.equal((await call(page, 'state')).driveBackup.automatic, false);
    await page.screenshot({ path: path.join(root, 'screenshots/drive-backup.png') });
    // Missing sync folders must keep a usable local backup and must not claim upload success.
    fs.renameSync(syncDir, syncDir + '.offline');
    const offline = await page.evaluate(() => window.waqt.call('driveBackupNow'));
    assert.equal(offline.ok, false);
    state = await call(page, 'state'); assert.equal(state.driveBackup.pending, true);
    assert.ok(fs.existsSync(path.join(state.driveBackup.lastLocalPath, 'data.json')));
    fs.renameSync(syncDir + '.offline', syncDir);
    await call(page, 'driveBackupNow');
    assert.equal((await call(page, 'state')).driveBackup.pending, false);
    const outside = await page.evaluate(() => window.waqt.call('imagePreview', { id: '../outside' })); assert.equal(outside.ok, false);
    assert.deepEqual(errors, []);
    console.log('PASS: actual Windows PNG/JPEG thumbnails in editors, task, note and reminder; open, persistence after moving originals; reminder controls; Drive settings, complete local/sync-folder backup, offline retry and honest status. Cloud upload itself requires the user to sign into Drive for desktop.');
  } catch (error) {
    if (app) for (const [i, page] of app.windows().entries()) {
      await page.screenshot({ path: path.join(temp, 'failed-' + i + '.png') }).catch(() => {});
      console.log('Failure diagnostics:', await page.evaluate(() => ({ url: location.href, error: document.querySelector('#task-error')?.textContent, imgs: [...document.querySelectorAll('img')].map(i => ({ id: i.dataset.previewId, requested: i.dataset.requested, src: i.src.slice(0, 40), width: i.naturalWidth, box: i.getBoundingClientRect().toJSON() })) })).catch(() => null));
    }
    throw error;
  } finally { if (app) await app.close().catch(() => {}); console.log('Isolated photos/Drive test data:', temp); }
})().catch(error => { console.error(error); process.exitCode = 1; });
