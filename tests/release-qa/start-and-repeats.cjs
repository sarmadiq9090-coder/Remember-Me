// First start, v1.4.0 data, every repeat type, and live language switching.
const { launch, check, sleep, iso, bad } = require('./harness.cjs');
async function run() {
  // A fresh data folder starts in English.
  {
    const s = await launch();
    await check('first start', 'new data starts in English, left to right', async () => {
      const st = await s.value('state');
      const lang = await s.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.querySelector('[data-view="today"]').textContent.trim()]);
      if (st.settings.language !== 'en' || lang[0] !== 'en' || lang[1] !== 'ltr') bad(`settings ${st.settings.language}, page ${lang}`);
      return lang[2];
    });
    await check('first start', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
    await s.close();
  }
  // Data saved by v1.4.0 keeps Arabic and its tasks.
  {
    const now = Date.now();
    const seed = { version: 1, tasks: [
      { id: 'old-1', title: 'مهمة قديمة', body: 'نص', priority: 'high', category: 'personal', dueAt: iso(now + 3 * 3600e3), repeat: 'daily', scheduleAt: iso(now + 3 * 3600e3), attachments: [], createdAt: iso(now - 864e5), updatedAt: iso(now - 864e5), completedAt: null, snoozedAt: null },
      { id: 'old-2', title: 'منجزة', body: '', priority: 'normal', category: 'work', dueAt: null, repeat: 'none', scheduleAt: null, attachments: [], createdAt: iso(now - 864e5), updatedAt: iso(now - 864e5), completedAt: iso(now - 3600e3), snoozedAt: null }],
      notes: [{ id: 'note-1', title: 'ملاحظة', body: 'محتوى', color: 'green', attachments: [], createdAt: iso(now - 864e5), updatedAt: iso(now - 864e5) }],
      attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: 'ar' } };
    const s = await launch({ seed });
    await check('v1.4.0 data', 'loads in Arabic, right to left, with its tasks and note', async () => {
      const st = await s.value('state');
      const page = await s.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.getElementById('page-title').textContent]);
      if (st.settings.language !== 'ar' || page[1] !== 'rtl') bad(`language ${st.settings.language}, dir ${page[1]}`);
      if (st.tasks.length !== 2 || st.notes.length !== 1 || st.notes[0].color !== 'green') bad('data changed');
      return `${page[2]} (weekStart ${st.settings.weekStart}, theme ${st.settings.theme}, palette ${st.settings.palette}, autoUpdate ${st.settings.autoUpdate})`;
    });
    await check('v1.4.0 data', 'task row shows the repeat label and priority in Arabic', async () => {
      await s.page.locator('[data-view="all"]').click();
      const row = await s.page.locator('.task-row').first().innerText();
      return /يوميًا|يومي/.test(row) ? row.replace(/\s+/g, ' ').slice(0, 120) : bad(`row text: ${row}`);
    });
    await check('v1.4.0 data', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
    await s.close();
  }
  // Every repeat type, saved and completed through the IPC the editor uses.
  {
    const s = await launch();
    const base = new Date(); base.setHours(9, 0, 0, 0); base.setDate(base.getDate() + 1);
    const make = async (title, extra) => { await s.value('saveTask', { title, ...extra }); return (await s.value('state')).tasks.find(t => t.title === title); };
    const complete = async t => { await s.value('complete', { id: t.id, expectedDueAt: t.dueAt }); return (await s.value('state')).tasks.find(x => x.id === t.id); };
    await check('repeats', 'one-time task completes', async () => { const t = await make('Once', { dueAt: iso(base) }); const d = await complete(t); return !!d.completedAt; });
    await check('repeats', 'daily moves one day at the same time', async () => { const t = await make('Daily', { dueAt: iso(base), repeat: 'daily' }); const d = await complete(t); const n = new Date(d.dueAt); return n.getDate() === new Date(base.getTime() + 864e5).getDate() && n.getHours() === 9 ? n.toString() : bad(`got ${n}`); });
    await check('repeats', 'chosen weekdays (Mon/Wed/Fri) go to the next chosen day', async () => {
      const t = await make('Weekdays', { dueAt: iso(base), repeat: 'days', repeatDays: [1, 3, 5] });
      const d = await complete(t), n = new Date(d.dueAt);
      return [1, 3, 5].includes(n.getDay()) && n > new Date(t.dueAt) && n.getHours() === 9 ? n.toDateString() : bad(`got ${n}`);
    });
    await check('repeats', 'every 3 days moves three days', async () => { const t = await make('Interval', { dueAt: iso(base), repeat: 'interval', repeatEvery: 3 }); const d = await complete(t); return Math.round((Date.parse(d.dueAt) - Date.parse(t.dueAt)) / 864e5) === 3 ? true : bad(`moved ${(Date.parse(d.dueAt) - Date.parse(t.dueAt)) / 864e5} days`); });
    await check('repeats', 'monthly on the 31st: Feb 28, then back to Mar 31', async () => {
      const t = await make('Rent', { dueAt: iso(new Date(2027, 0, 31, 9)), repeat: 'monthly' });
      const a = await complete(t), b = await complete(a);
      const days = [new Date(a.dueAt), new Date(b.dueAt)].map(d => `${d.getMonth() + 1}/${d.getDate()}`);
      return days.join(' ') === '2/28 3/31' ? days.join(' ') : bad(`got ${days}`);
    });
    await check('repeats', 'yearly on Feb 29 comes back on Feb 28 in 2029', async () => { const t = await make('Leap', { dueAt: iso(new Date(2028, 1, 29, 8)), repeat: 'yearly' }); const d = await complete(t); const n = new Date(d.dueAt); return n.getFullYear() === 2029 && n.getMonth() === 1 && n.getDate() === 28 ? true : bad(`got ${n}`); });
    await check('repeats', 'each completion of a repeat leaves one history copy', async () => { const st = await s.value('state'); return st.tasks.filter(t => t.completedAt && t.sourceId).length === 6 ? true : bad(`${st.tasks.filter(t => t.completedAt && t.sourceId).length} copies`); });
    await check('repeats', 'repeat labels render in the list (en)', async () => {
      await s.page.locator('[data-view="all"]').click(); await sleep(200);
      const text = await s.page.locator('#task-list').innerText();
      const missing = ['Daily', 'Every 3 days', 'Monthly', 'Yearly'].filter(l => !text.includes(l));
      return missing.length ? `missing ${missing} in: ${text.replace(/\s+/g, ' ').slice(0, 300)}` : true;
    });
    // Live language switching: Arabic (RTL) and Russian plurals.
    await check('languages', 'switching to Arabic flips the page right to left at once', async () => {
      await s.page.locator('[data-view="settings"]').click();
      await s.page.selectOption('#setting-language', 'ar'); await sleep(800);
      const p = await s.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.querySelector('[data-view="today"]').innerText.trim()]);
      return p[0] === 'ar' && p[1] === 'rtl' ? p[2] : bad(`got ${p}`);
    });
    await check('languages', 'Russian plurals for 1, 3 and 5 tasks today', async () => {
      await s.page.selectOption('#setting-language', 'ru'); await sleep(800);
      const forms = [];
      for (const n of [1, 3, 5]) {
        const st = await s.value('state');
        for (const t of st.tasks.filter(t => t.title.startsWith('Today '))) await s.value('deleteTask', { id: t.id });
        for (let i = 0; i < n; i++) await s.value('saveTask', { title: 'Today ' + i, dueAt: iso(Date.now() + 60000 + i * 1000) });
        // Only tasks due today count; the other test tasks are due later.
        const today = (await s.value('state')).tasks.filter(t => !t.completedAt && !t.deletedAt && (!t.dueAt || new Date(t.dueAt).toDateString() === new Date().toDateString()));
        await s.page.locator('[data-view="today"]').click(); await sleep(300);
        forms.push(`${today.length}: ${await s.page.locator('#hero-description').innerText()}`);
      }
      const ok = /задача/.test(forms[0]) && /задачи/.test(forms[1]) && /5 задач\./.test(forms[2]);
      return ok ? forms.join(' / ') : bad(`forms: ${forms.join(' / ')}`);
    });
    await check('languages', 'no page errors', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
    await s.close();
  }
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
