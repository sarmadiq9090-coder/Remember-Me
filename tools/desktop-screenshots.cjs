// Regenerates docs/screenshots with made-up sample data, so no personal data ever reaches the
// repository. It runs the app from the sources in test mode with a temporary data folder:
//   pnpm run screenshots
// Needs Playwright (a devDependency). Set WAQT_PLAYWRIGHT to use another copy, and
// ELECTRON_OVERRIDE_DIST_PATH to use an Electron outside node_modules.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require(process.env.WAQT_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');

const SAMPLES = {
  en: {
    tasks: [
      ['Join the team call', 'Agenda: release plan and next steps.', 'high', -2],
      ['Send the project update', 'Include the new timeline.', 'high', 90],
      ['Water the plants', '', 'normal', 240, 'daily'],
      ['Pay the electricity bill', '', 'medium', 60 * 24],
      ['Weekly planning', 'Review last week and pick three goals.', 'normal', 60 * 24 * 3, 'weekly'],
      ['Book a dentist appointment', '', 'normal', null],
      ['Morning walk', '', 'normal', 'done'],
    ],
    notes: [
      ['Ideas for the weekend', 'Picnic by the lake\nVisit the new museum\nTry the bakery downtown', 'yellow', 'sticky'],
      ['Shopping list', 'Milk\nBread\nTomatoes\nCoffee beans', 'green', 'lined'],
      ['Books to read', 'Atomic Habits\nThe Little Prince', 'blue', 'plain'],
      ['Gift ideas', 'A good pen\nA plant for the office', 'pink', 'sticky'],
    ],
  },
  ar: {
    tasks: [
      ['الانضمام إلى اجتماع الفريق', 'جدول الأعمال: خطة الإصدار والخطوات التالية.', 'high', -2],
      ['إرسال تحديث المشروع', 'أضف الجدول الزمني الجديد.', 'high', 90],
      ['سقي النباتات', '', 'normal', 240, 'daily'],
      ['دفع فاتورة الكهرباء', '', 'medium', 60 * 24],
      ['التخطيط الأسبوعي', 'راجع الأسبوع الماضي واختر ثلاثة أهداف.', 'normal', 60 * 24 * 3, 'weekly'],
      ['حجز موعد عند طبيب الأسنان', '', 'normal', null],
      ['المشي الصباحي', '', 'normal', 'done'],
    ],
    notes: [
      ['أفكار لعطلة نهاية الأسبوع', 'نزهة عند البحيرة\nزيارة المتحف الجديد\nتجربة المخبز في وسط المدينة', 'yellow', 'sticky'],
      ['قائمة التسوق', 'حليب\nخبز\nطماطم\nبن', 'green', 'lined'],
      ['كتب للقراءة', 'العادات الذرية\nالأمير الصغير', 'blue', 'plain'],
      ['أفكار للهدايا', 'قلم جيد\nنبتة للمكتب', 'pink', 'sticky'],
    ],
  },
};

// data.json for one language: times are relative to now, so "today" is always today.
function sampleData(language) {
  const now = Date.now(), iso = ms => new Date(ms).toISOString();
  const tasks = SAMPLES[language].tasks.map(([title, body, priority, minutes, repeat = 'none'], i) => {
    const done = minutes === 'done', due = typeof minutes === 'number' ? iso(now + minutes * 60000) : null;
    return { id: `sample-task-${i}`, title, body, priority, category: 'personal', dueAt: due, scheduleAt: due, repeat,
      ...(repeat !== 'none' ? { repeatFrom: due } : {}), snoozedAt: null, completedAt: done ? iso(now - 3 * 3600000) : null,
      attachments: [], createdAt: iso(now - 86400000), updatedAt: iso(now - 3600000) };
  });
  const notes = SAMPLES[language].notes.map(([title, body, color, style], i) => ({ id: `sample-note-${i}`, title, body, color, style, attachments: [],
    createdAt: iso(now - 86400000 * (i + 1)), updatedAt: iso(now - 3600000 * (i + 1)) }));
  return { version: 1, tasks, notes, attachments: [], settings: { sound: false, startAtLogin: true, alertSide: 'right', language, weekStart: 6,
    theme: 'light', palette: 'lavender', autoUpdate: false, pausedUntil: null, remindAgain: 0 } };
}

async function waitFor(app, page) {
  for (let i = 0; i < 100; i++) {
    const found = app.windows().find(p => p.url().split(/[?#]/)[0].endsWith('/' + page));
    if (found) { await found.waitForLoadState(); return found; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${page} did not open`);
}
const settle = page => page.evaluate(() => new Promise(resolve => setTimeout(() => {
  document.getElementById('toast')?.setAttribute('hidden', '');
  document.activeElement?.blur();
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}, 700)));
async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(out, name) });
  console.log('Wrote docs/screenshots/' + name);
}

// When this script itself runs under Electron's Node, the app must not inherit that switch.
const { ELECTRON_RUN_AS_NODE, ...environment } = process.env; // eslint-disable-line no-unused-vars
async function run(language) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-screenshots-'));
  fs.writeFileSync(path.join(data, 'data.json'), JSON.stringify(sampleData(language), null, 2));
  const app = await electron.launch({ executablePath: require('electron'), args: [root, '--force-device-scale-factor=1', '--disable-features=CalculateNativeWinOcclusion'],
    // colorScheme null: let the app's own theme setting decide, instead of Playwright's light default.
    colorScheme: null, env: { ...environment, WAQT_TEST: '1', WAQT_DATA_DIR: data }, timeout: 60000 });
  try {
    const main = await waitFor(app, 'index.html');
    await main.waitForFunction(() => document.getElementById('date-label')?.textContent);
    await shot(main, `main-${language}.png`);
    await shot(await waitFor(app, 'alert.html'), `alert-${language}.png`);
    if (language === 'en') {
      await main.evaluate(() => globalThis.setView('notes'));
      await shot(main, 'notes-en.png');
      await main.evaluate(async () => {
        const state = await globalThis.waqt.call('state');
        await globalThis.waqt.call('settings', { ...state.value.settings, theme: 'dark', palette: 'ocean' });
        globalThis.setView('today');
      });
      await shot(main, 'dark-en.png');
    }
  } finally {
    await app.close();
    fs.rmSync(data, { recursive: true, force: true });
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const language of ['en', 'ar']) await run(language);
})().catch(error => { console.error(error); process.exitCode = 1; });
