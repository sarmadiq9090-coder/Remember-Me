// Release QA harness for the packaged desktop-test build (see run.cjs). Every launch uses WAQT_TEST=1 and a temporary
// WAQT_DATA_DIR; the fused exe is never run with ELECTRON_RUN_AS_NODE.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require(process.env.WAQT_PLAYWRIGHT || 'playwright');
const exe = process.env.WAQT_EXECUTABLE;
if (!exe || !fs.existsSync(exe)) throw new Error('Set WAQT_EXECUTABLE to the packaged test build');
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function tempDir(name) { return fs.mkdtempSync(path.join(os.tmpdir(), `waqt-qa-${name}-`)); }
async function launch({ dataDir = tempDir('data'), seed } = {}) {
  if (seed) fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(seed, null, 2));
  const env = { ...process.env, WAQT_TEST: '1', WAQT_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  // colorScheme null: no Playwright media emulation, so prefers-color-scheme follows the app like for a user.
  const app = await electron.launch({ executablePath: exe, args: [], env, timeout: 60000, colorScheme: null });
  const errors = [];
  let page;
  for (let i = 0; i < 150 && !page; i++) { page = app.windows().find(p => p.url().endsWith('/index.html')); if (!page) await sleep(100); }
  page.on('pageerror', e => errors.push('main: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('main console: ' + m.text()); });
  await page.waitForFunction(() => document.getElementById('date-label')?.textContent);
  const call = (action, payload) => page.evaluate(async ([a, p]) => window.waqt.call(a, p), [action, payload]);
  const value = async (action, payload) => { const r = await call(action, payload); if (!r.ok) throw new Error(`${action}: ${r.error}`); return r.value; };
  async function alertPage(timeout = 8000) {
    for (let i = 0; i < timeout / 100; i++) {
      const found = app.windows().find(p => p.url().endsWith('/alert.html') && !p.isClosed());
      if (found) {
        if (!found.__qa) { found.__qa = true; found.on('pageerror', e => errors.push('alert: ' + e.message)); found.on('console', m => { if (m.type() === 'error') errors.push('alert console: ' + m.text()); }); }
        await found.waitForFunction(() => document.getElementById('alert-title')?.textContent || !document.getElementById('alert-all-done').hidden).catch(() => {});
        return found;
      }
      await sleep(100);
    }
    return null;
  }
  const alertOpen = () => app.windows().some(p => p.url().endsWith('/alert.html') && !p.isClosed());
  return { app, page, call, value, alertPage, alertOpen, errors, dataDir, close: () => app.close().catch(() => {}) };
}
function record(area, ok, detail) { results.push({ area, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} [${area}] ${detail}`); }
async function check(area, detail, fn) {
  try { const r = await fn(); record(area, r !== false, detail + (typeof r === 'string' ? ' — ' + r : '')); }
  catch (e) { record(area, false, `${detail} — ${String(e.message || e).split('\n')[0].slice(0, 300)}`); }
}
const iso = d => new Date(d).toISOString();
// Checks return a detail string (or true) when they pass and call bad() when they do not.
const bad = message => { throw new Error(message); };
module.exports = { launch, check, record, results, sleep, tempDir, iso, bad };
