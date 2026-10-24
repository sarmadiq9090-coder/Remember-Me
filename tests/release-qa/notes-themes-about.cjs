// Notes with colours and styles, tags and checklists, trash with Undo, all palettes in light and
// dark, the palette after a restart, the brand mark, the About links and Check for updates.
const { launch, check, sleep, bad } = require('./harness.cjs');
async function run() {
  let s = await launch();
  const state = () => s.value('state');
  await check('notes', 'a note saved from the editor keeps its colour and style', async () => {
    await s.page.locator('[data-view="notes"]').click();
    await s.page.locator('#page-add').click();
    await s.page.locator('#note-dialog[open]').waitFor();
    await s.page.locator('#note-title').fill('Shopping'); await s.page.locator('#note-body').fill('Milk, bread');
    await s.page.locator('#note-look input[name="note-color"][value="blue"]').check({ force: true });
    await s.page.locator('#note-look input[name="note-style"][value="lined"]').check({ force: true });
    const preview = await s.page.locator('#note-look .note-preview').evaluate(p => [p.dataset.paper, p.dataset.noteStyle, p.querySelector('strong').textContent]);
    await s.page.locator('#note-form button[type="submit"]').click(); await sleep(600);
    const note = (await state()).notes.find(n => n.title === 'Shopping');
    const card = await s.page.locator('.note-card').first().evaluate(c => [c.dataset.paper, c.dataset.noteStyle]);
    return note && note.color === 'blue' && note.style === 'lined' && card.join() === 'blue,lined' && preview.join() === 'blue,lined,Shopping' ? `preview ${preview}, card ${card}` : bad(`note ${JSON.stringify(note)}, card ${card}, preview ${preview}`);
  });
  await check('tags & steps', 'the task editor saves tags and checklist steps; the list shows and ticks them', async () => {
    await s.page.locator('[data-view="all"]').click();
    await s.page.locator('#page-add').click();
    await s.page.locator('#task-dialog[open]').waitFor();
    await s.page.locator('#task-title').fill('Trip');
    await s.page.locator('#task-tags').fill('travel, #Family, travel');
    for (const text of ['Book hotel', 'Pack']) { await s.page.locator('#add-step').click(); await s.page.locator('#task-steps li:last-child input[type="text"]').fill(text); }
    await s.page.locator('#task-form button[type="submit"]').click(); await sleep(700);
    const t = (await state()).tasks.find(x => x.title === 'Trip');
    const row = s.page.locator('.task-row', { hasText: 'Trip' });
    const text = await row.innerText();
    await row.locator('[data-toggle-step]').first().check(); await sleep(600);
    const after = (await state()).tasks.find(x => x.title === 'Trip');
    const filters = await s.page.locator('#filters').innerText();
    return t.tags.join() === 'travel,Family' && t.checklist.map(c => c.text).join() === 'Book hotel,Pack' && /#travel/.test(text) && after.checklist[0].done && /#Family/.test(filters) ? `tags ${t.tags}, steps ${t.checklist.length}` : bad(`tags ${t.tags} steps ${JSON.stringify(t.checklist)} row ${text} filters ${filters}`);
  });
  await check('tags & steps', 'a tag filter shows only tasks with that tag, in any letter case', async () => {
    await s.value('saveTask', { title: 'Untagged' });
    await s.value('saveTask', { title: 'Picnic', tags: ['family'] });
    await s.page.locator('#filters [data-filter="tag:family" i]').click(); await sleep(300);
    const rows = await s.page.locator('.task-row .task-name').allInnerTexts();
    await s.page.locator('#filters [data-filter="all"]').click();
    return rows.sort().join() === 'Picnic,Trip' ? true : bad(rows.join());
  });
  await check('trash', 'deleting a task offers Undo, which restores it', async () => {
    const row = s.page.locator('.task-row', { hasText: 'Untagged' });
    await row.locator('[data-action="delete"]').click(); await sleep(500);
    const toast = await s.page.locator('#toast').innerText();
    const trashed = (await state()).tasks.find(t => t.title === 'Untagged').deletedAt;
    await s.page.locator('#toast .toast-action').click(); await sleep(700);
    const back = (await state()).tasks.find(t => t.title === 'Untagged').deletedAt;
    return trashed && !back ? toast.replace(/\s+/g, ' ') : bad(`deleted ${trashed}, after undo ${back}`);
  });
  await check('trash', 'trash lists deleted items; restore and delete permanently work', async () => {
    await s.page.locator('.task-row', { hasText: 'Untagged' }).locator('[data-action="delete"]').click(); await sleep(400);
    await s.page.locator('[data-view="notes"]').click();
    await s.page.locator('.note-card [data-action="delete"]').first().click(); await sleep(400);
    await s.page.locator('[data-view="trash"]').click(); await sleep(300);
    const listed = await s.page.locator('#trash-list .task-name').allInnerTexts();
    await s.page.locator('#trash-list .task-row', { hasText: 'Shopping' }).locator('[data-trash="restore"]').click(); await sleep(500);
    await s.page.locator('#trash-list .task-row', { hasText: 'Untagged' }).locator('[data-trash="purge"]').click();
    await s.page.locator('#confirm-dialog[open]').waitFor(); await s.page.locator('#confirm-delete').click(); await sleep(500);
    const st = await state();
    return listed.sort().join() === 'Shopping,Untagged' && st.notes.find(n => n.title === 'Shopping' && !n.deletedAt) && !st.tasks.some(t => t.title === 'Untagged') ? true : bad(`listed ${listed}`);
  });
  // Themes: every palette in light and dark; the main window background follows.
  const palettes = ['lavender', 'ocean', 'forest', 'sunset', 'graphite', 'contrast'];
  await check('themes', 'all 6 palettes in light and dark change the page and window colours', async () => {
    await s.page.locator('[data-view="settings"]').click(); await sleep(300);
    const seen = new Set(), report = [];
    for (const mode of ['light', 'dark']) {
      await s.page.locator(`#appearance-card input[name="theme-mode"][value="${mode}"]`).check({ force: true }); await sleep(500);
      for (const palette of palettes) {
        await s.page.locator(`#appearance-card input[name="palette"][value="${palette}"]`).check({ force: true }); await sleep(450);
        const page = await s.page.evaluate(() => [document.documentElement.dataset.palette, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()]);
        const win = await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.getBackgroundColor()).join(' '));
        if (page[0] !== palette) bad(`${mode}/${palette}: page shows ${page[0]}`);
        seen.add(`${page[1]}|${page[2]}`); report.push(`${mode}/${palette}:${page[2]}:${win}`);
      }
    }
    return seen.size >= 10 ? `${seen.size} distinct looks` : bad(`only ${seen.size} distinct: ${report.join(' ')}`);
  });
  await check('themes', 'no page errors while switching', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
  await check('themes', 'the brand mark is drawn in the sidebar and About', async () => {
    const marks = await s.page.evaluate(() => document.querySelectorAll('svg').length);
    const about = await s.page.locator('#about-card .about-icon svg').count();
    return about === 1 && marks > 5 ? `about mark ${about}` : bad(`about mark ${about}, svgs ${marks}`);
  });
  // About links must go through the allowlist, without opening a browser.
  await s.app.evaluate(({ shell }) => { globalThis.qaOpened = []; shell.openExternal = async url => { globalThis.qaOpened.push(url); }; shell.openPath = async target => { globalThis.qaOpened.push('path:' + target); return ''; }; });
  await check('about', 'each About link opens its fixed https URL (stubbed, no browser)', async () => {
    const ids = await s.page.locator('#about-card [data-link]').evaluateAll(bs => bs.map(b => b.dataset.link));
    for (const id of ids) { await s.page.locator(`#about-card [data-link="${id}"]`).click(); await sleep(150); }
    const opened = await s.app.evaluate(() => globalThis.qaOpened);
    return opened.length === ids.length && opened.every(u => u.startsWith('https://github.com/sarmadiq9090-coder')) ? `${ids.length} links: ${opened.map(u => u.replace('https://github.com/sarmadiq9090-coder', '…')).join(' ')}` : bad(`${ids} → ${opened}`);
  });
  await check('about', 'an unknown link id is refused by the main process', async () => {
    const r = await s.call('openLink', { link: 'https://evil.example' });
    return !r.ok ? r.error : bad('accepted');
  });
  await check('about', 'Copy diagnostic info and Open log folder', async () => {
    await s.page.locator('#copy-diagnostics').click(); await sleep(300);
    const text = await s.app.evaluate(({ clipboard }) => clipboard.readText());
    await s.page.locator('#open-logs').click(); await sleep(300);
    const opened = await s.app.evaluate(() => globalThis.qaOpened.filter(u => u.startsWith('path:')));
    return /Remember Me/.test(text) && !/Trip|Shopping/.test(text) && opened.some(p => /logs$/.test(p)) ? text.split('\n').slice(0, 2).join(' / ') : bad(`clipboard ${text}, opened ${opened}`);
  });
  await check('updates', 'Check for updates in a test build says unavailable, not an error', async () => {
    await s.page.locator('#updates-card [data-update="checkUpdates"]').click(); await sleep(1500);
    const status = await s.page.locator('#update-status').innerText();
    return /installed app only/.test(status) ? status : bad(status);
  });
  await check('about', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
  // The palette and mode survive a restart.
  const dataDir = s.dataDir;
  await s.page.locator('#appearance-card input[name="palette"][value="forest"]').check({ force: true }); await sleep(500);
  await s.close();
  s = await launch({ dataDir });
  await check('themes', 'the palette and mode are the same after a restart', async () => {
    const v = await s.page.evaluate(() => document.documentElement.dataset.palette);
    const st = (await s.value('state')).settings;
    return v === 'forest' && st.theme === 'dark' ? `${v}/${st.theme}` : bad(`${v}/${st.theme}`);
  });
  await s.close();
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
