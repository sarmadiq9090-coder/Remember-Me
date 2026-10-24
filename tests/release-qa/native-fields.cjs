// Native date, time and number fields follow the app's language, with digits 0-9 in Arabic too,
// and a language change offers a restart. Chromium takes its locale at startup, so each language
// is checked in a fresh launch with that language already saved.
const { launch, check, sleep, bad } = require('./harness.cjs');
const seed = language => ({ version: 1, tasks: [], notes: [], attachments: [], settings: { language } });
// The renderer's default locale is the one Chromium started with, which also formats the native fields.
const controls = page => page.evaluate(() => ({ lang: navigator.language, digits: new Intl.NumberFormat().format(1234567890), date: new Date(2026, 9, 25, 21, 5).toLocaleString() }));
async function run() {
  for (const [language, expected] of [['ar', 'en-GB'], ['fr', 'fr'], ['en', 'en-US']]) {
    const s = await launch({ seed: seed(language) });
    await check('native fields', `${language}: Chromium starts in ${expected}, with digits 0-9`, async () => {
      const c = await controls(s.page);
      return c.lang === expected && /^[\d.,\s  ]+$/.test(c.digits) && !/[٠-٩۰-۹]/.test(c.date) ? `${c.lang} ${c.date}` : bad(JSON.stringify(c));
    });
    if (language === 'ar') {
      await check('native fields', 'ar: the task editor shows its time and repeat-every fields', async () => {
        await s.page.locator('[data-view="all"]').first().click();
        await s.page.locator('#page-add').click(); await s.page.locator('#task-dialog[open]').waitFor();
        await s.page.locator('#task-reminder').check(); await s.page.selectOption('#task-repeat', 'interval'); await sleep(200);
        await s.page.locator('#task-due').fill('2026-10-25T21:05'); await s.page.locator('#task-every').fill('12');
        if (process.env.WAQT_QA_SHOTS) await s.page.locator('#task-dialog').screenshot({ path: process.env.WAQT_QA_SHOTS + '/native-fields-ar.png' });
        return (await s.page.locator('#task-due').inputValue()) === '2026-10-25T21:05' ? true : bad('time not set');
      });
      await check('native fields', 'switching to French offers a restart, and back to Arabic does not', async () => {
        await s.page.locator('#task-dialog .close-dialog').first().click();
        await s.page.locator('[data-view="settings"]').first().click();
        await s.page.selectOption('#setting-language', 'fr'); await sleep(800);
        const offered = await s.page.locator('#toast .toast-action').isVisible() && await s.page.locator('#toast .toast-action').innerText();
        await s.page.selectOption('#setting-language', 'ar'); await sleep(800);
        const again = await s.page.locator('#toast .toast-action').count();
        return offered && again === 0 ? `${offered}; none when back to Arabic` : bad(`offered ${offered}, again ${again}`);
      });
    }
    await check('native fields', `${language}: no page errors`, async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
    await s.close();
  }
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
