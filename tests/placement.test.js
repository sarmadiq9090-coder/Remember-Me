const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taskbarEdge, alertBounds } = require('../src/core/placement');
const display = (bounds, workArea) => ({ bounds, workArea });
const full = { x: 0, y: 0, width: 1920, height: 1080 };

test('the alert sits beside the taskbar wherever it is docked, on the chosen side', () => {
  const bottom = display(full, { x: 0, y: 0, width: 1920, height: 1032 });
  assert.equal(taskbarEdge(bottom), 'bottom');
  assert.deepEqual(alertBounds(bottom, 'right'), { x: 1494, y: 450, width: 410, height: 570 }, 'Same place as before for the usual taskbar');
  assert.deepEqual(alertBounds(bottom, 'left'), { x: 16, y: 450, width: 410, height: 570 });
  const top = display(full, { x: 0, y: 48, width: 1920, height: 1032 });
  assert.equal(taskbarEdge(top), 'top');
  assert.equal(alertBounds(top, 'right').y, 60, 'Just under a top taskbar');
  const left = display(full, { x: 62, y: 0, width: 1858, height: 1080 });
  assert.equal(taskbarEdge(left), 'left');
  assert.equal(alertBounds(left, 'left').x, 78, 'Never under a left taskbar');
  assert.equal(taskbarEdge(display(full, { x: 0, y: 0, width: 1858, height: 1080 })), 'right');
  assert.equal(taskbarEdge(display(full, full)), 'bottom', 'Auto-hidden taskbar');
});

test('secondary displays, negative coordinates, scaling and small screens stay inside the work area', () => {
  const secondary = display({ x: -1280, y: -200, width: 1280, height: 1024 }, { x: -1280, y: -200, width: 1280, height: 984 });
  const b = alertBounds(secondary, 'right');
  assert.ok(b.x >= -1280 && b.x + b.width <= 0 && b.y >= -200 && b.y + b.height <= 784);
  const scaled = display({ x: 0, y: 0, width: 1280, height: 720 }, { x: 0, y: 0, width: 1280, height: 672 });  // 1920x1080 at 150%
  assert.deepEqual(alertBounds(scaled, 'right'), { x: 854, y: 90, width: 410, height: 570 });
  const tiny = display({ x: 0, y: 0, width: 400, height: 500 }, { x: 0, y: 0, width: 400, height: 460 });
  const t = alertBounds(tiny, 'right');
  assert.ok(t.width <= 376 && t.height <= 436 && t.x >= 0 && t.y >= 0, JSON.stringify(t));
});

test('a fresh install on Arabic Windows puts the alert at the bottom left, by the clock; saved sides are kept', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { initialState, validateState } = require('../src/core/tasks');
  const { Store } = require('../src/core/store');
  const { systemAlertSide } = require('../src/main/i18n');
  const side = tags => systemAlertSide({ getPreferredSystemLanguages: () => tags });
  assert.equal(side(['ar-IQ', 'en-US']), 'left', 'Arabic Windows has its clock on the left');
  for (const tags of [['ar'], ['AR_sa'], ['he-IL', 'en-US'], ['fa-IR'], ['ur-PK'], ['ku-Arab-IQ'], ['ckb-IQ']]) assert.equal(side(tags), 'left', String(tags) + ': right-to-left, even without that language in the app');
  for (const tags of [['en-US', 'ar-IQ'], ['fr-FR'], ['ku-Latn-TR'], ['zh-Hans-CN'], [], [null], 'ar']) assert.equal(side(tags), 'right', String(tags));
  assert.equal(systemAlertSide({ getPreferredSystemLanguages: () => { throw new Error('unavailable'); } }), 'right');
  assert.equal(systemAlertSide({}), 'right');
  assert.equal(initialState('en', 'left').settings.alertSide, 'left', 'Hebrew Windows: English interface, clock on the left');
  assert.equal(initialState('ar', 'right').settings.alertSide, 'right');
  assert.equal(initialState('ar').settings.alertSide, 'left', 'Without a system side, an Arabic interface means the left');
  for (const code of ['en', 'fr', 'de', 'zh-CN', 'hi', undefined, 'xx']) assert.equal(initialState(code, 'middle').settings.alertSide, 'right', String(code));
  // Saved data keeps its side, whatever its language; data without one stays on the right, where it always was.
  const saved = side => validateState({ version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: side, language: 'ar' } }).settings.alertSide;
  assert.equal(saved('right'), 'right', 'An Arabic user who chose the right keeps it');
  assert.equal(saved('left'), 'left');
  assert.equal(saved(undefined), 'right', 'Older Arabic data without a side keeps the right');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-alert-side-'));
  try {
    assert.equal(new Store(dir, { language: 'en', alertSide: 'left' }).state.settings.alertSide, 'left', 'A fresh data folder takes the system side');
    const store = new Store(dir, { language: 'ar', alertSide: 'left' });
    assert.equal(store.state.settings.alertSide, 'left');
    store.change(state => { state.settings.alertSide = 'right'; });
    assert.equal(new Store(dir, { language: 'ar', alertSide: 'left' }).state.settings.alertSide, 'right', 'A choice made in Settings is never replaced');
    const index = fs.readFileSync(path.join(__dirname, '../src/main/index.js'), 'utf8');
    assert.match(index, /new Store\(.*alertSide: firstRunAlertSide \}\)/, 'The app passes the system side to a fresh data folder');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
