// Untranslated text: walks every view, both editors, the confirm dialog and the alert in Russian
// and Arabic, and lists visible text and labels that still contain English words.
const { launch, check, sleep, iso, bad } = require('./harness.cjs');
const collect = () => {
  const out = new Set();
  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node; while ((node = walker.nextNode())) {
    const el = node.parentElement; if (!el || el.closest('[translate="no"], script, style') || !visible(el)) continue;
    const text = node.nodeValue.trim(); if (/[A-Za-z]{3,}/.test(text)) out.add(text);
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
    if (el.closest('[translate="no"]')) continue;
    for (const attr of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(attr); if (v && /[A-Za-z]{3,}/.test(v)) out.add(`@${attr}: ${v}`); }
  }
  return [...out];
};
async function run() {
  for (const language of ['ru', 'ar']) {
    const s = await launch();
    const st = (await s.value('state')).settings;
    await s.value('settings', { ...st, language });
    await s.value('saveTask', { title: 'x1', dueAt: iso(Date.now() + 864e5), repeat: 'weekly', tags: ['tag'], checklist: [{ text: 'step' }], priority: 'high', remindBefore: 10 });
    await s.value('saveNote', { title: 'n1', body: 'b', color: 'yellow', style: 'sticky' });
    await s.value('saveTask', { title: 'gone' }); await s.value('deleteTask', { id: (await s.value('state')).tasks.find(t => t.title === 'gone').id });
    await sleep(800);
    const found = new Map();
    const take = async (where, page = s.page) => { for (const t of await page.evaluate(collect)) { const rest = t.replace(/^@[a-z-]+: /, '').replace(/Remember Me|Google Drive|Google|Drive|GitHub|PDF|Excel|Electron|Chromium|Windows|MIT|Sarmad|Ctrl|#\w+/g, ''); if (/[A-Za-z]{3,}/.test(rest)) found.set(t, where); } };
    for (const view of ['today', 'upcoming', 'all', 'completed', 'notes', 'trash', 'settings']) { await s.page.locator(`[data-view="${view}"]`).first().click(); await sleep(300); await take(view); }
    await s.page.locator('[data-view="all"]').first().click(); await s.page.locator('.task-row [data-action="edit"]').first().click(); await s.page.locator('#task-dialog[open]').waitFor();
    for (const repeat of ['days', 'interval', 'monthly']) { await s.page.selectOption('#task-repeat', repeat); await sleep(150); await take('task editor ' + repeat); }
    await s.page.locator('#task-dialog .close-dialog').first().click();
    await s.page.locator('[data-view="notes"]').first().click(); await s.page.locator('.note-card .note-edit-target').first().click(); await s.page.locator('#note-dialog[open]').waitFor(); await take('note editor');
    await s.page.locator('#note-dialog .close-dialog').first().click();
    await s.page.locator('[data-view="trash"]').first().click(); await s.page.locator('#empty-trash').click(); await s.page.locator('#confirm-dialog[open]').waitFor(); await take('confirm'); await s.page.locator('#cancel-delete').click();
    await s.value('saveTask', { title: 'due', dueAt: iso(Date.now() - 60e3), repeat: 'daily', priority: 'medium' });
    await s.value('saveTask', { title: 'due2', body: 'note', dueAt: iso(Date.now() - 30e3) });
    const alert = await s.alertPage(); await sleep(800); await take('alert', alert);
    // Web addresses stay as they are.
    const left = [...found].filter(([text]) => !/github\.com/.test(text));
    await check('translations', `${language}: no English left in the views, editors, confirm dialog and alert`, async () => left.length ? bad(left.map(([text, where]) => `[${where}] ${text.slice(0, 80)}`).join(' | ')) : true);
    await check('translations', `${language}: no page errors`, async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
    await s.close();
  }
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
