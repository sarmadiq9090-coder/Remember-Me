// Live changes while the alert is open, and the alert closing after the undo window.
const { launch, check, sleep, iso, bad } = require('./harness.cjs');
async function run() {
  const s = await launch();
  await s.value('saveTask', { title: 'Live', dueAt: iso(Date.now() - 1000) });
  let alert = await s.alertPage();
  await check('alert live', 'switching language and palette in Settings updates the open alert', async () => {
    const st = (await s.value('state')).settings;
    await s.value('settings', { ...st, language: 'ar', palette: 'ocean' }); await sleep(1200);
    const v = await alert.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.documentElement.dataset.palette, document.getElementById('alert-complete').innerText.trim()]);
    await s.value('settings', { ...st, language: 'en' }); await sleep(800);
    return v[0] === 'ar' && v[1] === 'rtl' && v[2] === 'ocean' ? v.join(' ') : bad(v.join(' '));
  });
  await check('alert live', 'after Done on the last reminder the alert shows "all done", offers Undo, then closes', async () => {
    await alert.locator('#alert-title').click();
    await alert.locator('#alert-complete').click(); await sleep(800);
    const allDone = await alert.locator('#alert-all-done').isVisible();
    const undo = await alert.locator('#alert-undo').isVisible();
    for (let i = 0; i < 100 && s.alertOpen(); i++) await sleep(100);
    return allDone && undo && !s.alertOpen() ? true : bad(`all done ${allDone}, undo ${undo}, open ${s.alertOpen()}`);
  });
  await check('alert live', 'with the main window closed by the page, a reminder still alerts and Open task brings the window back with its editor', async () => {
    await s.value('saveTask', { title: 'While closed', dueAt: iso(Date.now() + 4000) });
    await s.page.evaluate(() => window.close()); await sleep(500);
    const gone = !s.app.windows().some(p => p.url().endsWith('/index.html') && !p.isClosed());
    const a = await s.alertPage(15000);
    if (!a) bad('no alert');
    await a.waitForFunction(() => document.getElementById('alert-title').textContent === 'While closed');
    await a.locator('#alert-open').click();
    let main;
    for (let i = 0; i < 80 && !main; i++) { main = s.app.windows().find(p => p.url().endsWith('/index.html') && !p.isClosed()); if (!main) await sleep(100); }
    if (!main) bad('main window not recreated');
    await main.locator('#task-dialog[open]').waitFor({ timeout: 6000 });
    const title = await main.locator('#task-title').inputValue();
    return gone && title === 'While closed' ? 'recreated with the editor open' : bad(`gone ${gone}, editor ${title}`);
  });
  await check('alert live', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
  await s.close();
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
