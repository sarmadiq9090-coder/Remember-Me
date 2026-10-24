// Attachments, export and restore of a backup into temporary folders, storage cleanup, and the
// alert in Arabic. Dialogs are stubbed in the main process so nothing touches real folders.
const fs = require('node:fs');
const path = require('node:path');
const { launch, check, sleep, iso, bad, tempDir } = require('./harness.cjs');
async function run() {
  const s = await launch();
  const files = tempDir('files'), exportTo = tempDir('export');
  fs.writeFileSync(path.join(files, 'report.pdf'), '%PDF-1.4 qa');
  fs.writeFileSync(path.join(files, 'orphan.txt'), 'never saved');
  // Stub the dialogs: the next open-dialog result and message-box answer come from globals.
  await s.app.evaluate(({ dialog, shell }) => {
    globalThis.qaNext = []; globalThis.qaAnswer = 1;
    dialog.showOpenDialog = async () => globalThis.qaNext.shift() || { canceled: true, filePaths: [] };
    dialog.showMessageBox = async () => ({ response: globalThis.qaAnswer });
    shell.openPath = async () => '';
  });
  const nextDialog = paths => s.app.evaluate((electronModule, p) => { globalThis.qaNext.push({ canceled: false, filePaths: p }); }, paths);
  await check('attachments', 'a file attached in the task editor is saved with the task', async () => {
    await s.page.locator('[data-view="all"]').click();
    await s.page.locator('#page-add').click(); await s.page.locator('#task-dialog[open]').waitFor();
    await s.page.locator('#task-title').fill('With file');
    await nextDialog([path.join(files, 'report.pdf')]);
    await s.page.locator('#task-attach').click(); await sleep(800);
    const listed = await s.page.locator('#task-files').innerText();
    await s.page.locator('#task-form button[type="submit"]').click(); await sleep(600);
    const st = await s.value('state'), t = st.tasks.find(x => x.title === 'With file');
    return t.attachments.length === 1 && /report\.pdf/.test(listed) ? listed.replace(/\s+/g, ' ') : bad(`attachments ${t.attachments}, listed ${listed}`);
  });
  await check('attachments', 'an attachment chip opens the file (stubbed)', async () => {
    const r = await s.call('openAttachment', { id: (await s.value('state')).tasks.find(x => x.title === 'With file').attachments[0] });
    return r.ok ? true : bad(r.error);
  });
  await check('storage', 'a file added to an editor but never saved is found and cleaned up', async () => {
    await s.page.locator('#page-add').click(); await s.page.locator('#task-dialog[open]').waitFor();
    await nextDialog([path.join(files, 'orphan.txt')]);
    await s.page.locator('#task-attach').click(); await sleep(800);
    await s.page.locator('#task-dialog .close-dialog').first().click();
    await s.page.locator('[data-view="settings"]').click(); await sleep(800);
    const button = await s.page.locator('#clean-orphans').innerText();
    await s.page.locator('#clean-orphans').click(); await sleep(1000);
    const usage = await s.value('storage');
    const kept = (await s.value('state')).attachments.length;
    return /1/.test(button) && usage.orphans === 0 && kept === 1 ? `${button}; kept ${kept}` : bad(`button "${button}", orphans after ${usage.orphans}, records ${kept}`);
  });
  let exported;
  await check('backup', 'export writes a verified backup folder with the attachment', async () => {
    await nextDialog([exportTo]);
    await s.page.locator('#export-data').click(); await sleep(1500);
    const folders = fs.readdirSync(exportTo);
    if (folders.length !== 1) bad(`folders ${folders}`);
    exported = path.join(exportTo, folders[0]);
    const info = JSON.parse(fs.readFileSync(path.join(exported, 'backup.json'), 'utf8'));
    const data = JSON.parse(fs.readFileSync(path.join(exported, 'data.json'), 'utf8'));
    const toast = await s.page.locator('#toast').innerText();
    return Object.keys(info.files).length === 2 && data.tasks.some(t => t.title === 'With file') ? `${folders[0]}; ${toast}` : bad(JSON.stringify(info.files));
  });
  await check('backup', 'restore puts the backup back and keeps a safety copy first', async () => {
    await s.value('saveTask', { title: 'Added after export' });
    await nextDialog([exported]);
    await s.page.locator('#restore-data').click(); await sleep(2000);
    const st = await s.value('state');
    const safety = fs.readdirSync(path.join(s.dataDir, 'backups')).filter(n => n.startsWith('RememberMe-before-restore-'));
    const toast = await s.page.locator('#toast').innerText();
    return !st.tasks.some(t => t.title === 'Added after export') && st.tasks.some(t => t.title === 'With file') && safety.length === 1 ? toast : bad(`tasks ${st.tasks.map(t => t.title)}, safety ${safety}`);
  });
  await check('backup', 'cancelling the restore confirmation changes nothing', async () => {
    await s.value('saveTask', { title: 'Keep me' });
    await s.app.evaluate(() => { globalThis.qaAnswer = 0; });
    await nextDialog([exported]);
    await s.page.locator('#restore-data').click(); await sleep(1200);
    await s.app.evaluate(() => { globalThis.qaAnswer = 1; });
    return (await s.value('state')).tasks.some(t => t.title === 'Keep me') ? true : bad('restored anyway');
  });
  await check('backup', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
  // The alert in Arabic: right to left, with the arrows mirrored.
  await check('alert (ar)', 'the alert is right to left in Arabic and the arrow keys follow the reading direction', async () => {
    const st = (await s.value('state')).settings;
    await s.value('settings', { ...st, language: 'ar' });
    await s.value('saveTask', { title: 'أولى', dueAt: iso(Date.now() - 2000) });
    await s.value('saveTask', { title: 'ثانية', dueAt: iso(Date.now() - 1000) });
    const alert = await s.alertPage();
    await alert.waitForFunction(() => document.documentElement.dir === 'rtl' && document.getElementById('alert-position').textContent);
    const before = await alert.locator('#alert-title').innerText();
    await alert.locator('#alert-title').click();
    await alert.keyboard.press('ArrowLeft'); await sleep(300);
    const after = await alert.locator('#alert-title').innerText();
    const position = await alert.locator('#alert-position').innerText();
    const done = await alert.locator('#alert-complete').innerText();
    return before === 'أولى' && after === 'ثانية' ? `${position} • ${done.trim()}` : bad(`${before} → ${after}`);
  });
  await check('alert (ar)', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
  await s.close();
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
