const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TEXT_SIZES, DEFAULT_TEXT_SIZE, normalizeTextSize, stepTextSize, textSizeStep, scaledSize } = require('../ui/lib/text-size');
const { alertBounds, QUICK_ADD_SIZE } = require('../src/core/placement');
const { createHandlers } = require('../src/main/handlers');
const { initialState, validateState } = require('../src/core/tasks');
const { LOCALES } = require('../ui/lib/translate');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('text sizes are 100, 115, 130 and 150 percent, and anything else means 100', () => {
  assert.deepEqual(TEXT_SIZES, [100, 115, 130, 150]);
  assert.equal(DEFAULT_TEXT_SIZE, 100);
  for (const size of TEXT_SIZES) assert.equal(normalizeTextSize(size), size);
  for (const bad of [undefined, null, 0, 120, '115', 200, -1, NaN, {}]) assert.equal(normalizeTextSize(bad), 100, String(bad));
});

test('Ctrl+= and Ctrl+- step through the sizes and stop at the ends; Ctrl+0 resets', () => {
  assert.equal(stepTextSize(100, 1), 115);
  assert.equal(stepTextSize(115, 1), 130);
  assert.equal(stepTextSize(150, 1), 150);
  assert.equal(stepTextSize(130, -1), 115);
  assert.equal(stepTextSize(100, -1), 100);
  assert.equal(stepTextSize(150, 0), 100);
  assert.equal(stepTextSize('bad', 1), 115, 'A broken saved size steps from 100');
});

test('the shortcut keys are read from Electron input and from page key events, on the main and number-pad keys', () => {
  const key = (key, code, more = {}) => ({ type: 'keyDown', control: true, alt: false, meta: false, shift: false, key, code, ...more });
  assert.equal(textSizeStep(key('=', 'Equal')), 1);
  assert.equal(textSizeStep(key('+', 'Equal', { shift: true })), 1, 'Ctrl+Shift+= types +');
  assert.equal(textSizeStep(key('+', 'NumpadAdd')), 1);
  assert.equal(textSizeStep(key('-', 'Minus')), -1);
  assert.equal(textSizeStep(key('-', 'NumpadSubtract')), -1);
  assert.equal(textSizeStep(key('0', 'Digit0')), 0);
  assert.equal(textSizeStep(key('0', 'Numpad0')), 0);
  assert.equal(textSizeStep({ ctrlKey: true, key: '=', code: 'Equal' }), 1, 'A keydown event works too');
  // Other layouts: the physical key still counts.
  assert.equal(textSizeStep(key('ز', 'Equal')), 1);
  for (const other of [key('=', 'Equal', { control: false }), key('=', 'Equal', { alt: true }), key('=', 'Equal', { meta: true }),
    key('=', 'Equal', { type: 'keyUp' }), key('n', 'KeyN'), key('9', 'Digit9')]) assert.equal(textSizeStep(other), null, JSON.stringify(other));
});

test('the alert and quick-add windows grow with the text and stay inside the screen', () => {
  assert.deepEqual(scaledSize({ width: 410, height: 570 }, 100), { width: 410, height: 570 });
  assert.deepEqual(scaledSize({ width: 410, height: 570 }, 150), { width: 615, height: 855 });
  assert.deepEqual(scaledSize({ width: 460, height: 168 }, 130), { width: 598, height: 218 });
  assert.deepEqual(scaledSize(QUICK_ADD_SIZE, 150), { width: 690, height: 309 }, 'The taller quick-add window (date chip line) grows with the text');
  const display = { bounds: { x: 0, y: 0, width: 1366, height: 768 }, workArea: { x: 0, y: 0, width: 1366, height: 728 } };
  const bounds = alertBounds(display, 'right', scaledSize({ width: 410, height: 570 }, 150));
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 728, 'A small screen keeps the whole alert visible');
  assert.equal(bounds.width, 615);
  const windows = read('src/main/windows.js');
  assert.match(windows, /alertBounds\(screen\.getPrimaryDisplay\(\), [^;]*, alertSize\(\)\)/, 'The alert is placed at its scaled size');
  assert.match(windows, /quickAddBounds\(display, scaledSize\(QUICK_ADD_SIZE, ctx\.store\.state\.settings\.textSize\)\)/, 'The quick-add window opens at its scaled size, date chip line included');
  assert.equal(windows.match(/textSizeKeys\(\w+\);/g).length, 3, 'All three windows take the shortcut keys');
});

test('text size is a setting: 100% by default, kept by older files and other callers, and checked when saved', () => {
  assert.equal(initialState().settings.textSize, 100);
  const old = initialState(); delete old.settings.textSize;
  assert.equal(validateState(old).settings.textSize, 100, 'Data from older versions shows 100%');
  const odd = initialState(); odd.settings.textSize = 999;
  assert.equal(validateState(odd).settings.textSize, 100);
  const kept = initialState(); kept.settings.textSize = 130;
  assert.equal(validateState(kept).settings.textSize, 130);

  const ctx = { electron: {}, tr: text => text, store: { state: initialState(), change(fn) { return fn(this.state); } },
    setLogin() {}, rebuildTrayMenu() {}, placeAlert() { this.placed = (this.placed || 0) + 1; }, applyTheme() {}, controlsLocale: 'en-US',
    language: () => 'en', quickAdd: { apply: () => ({ conflict: false }) } };
  const handlers = createHandlers(ctx), { textSize, ...others } = ctx.store.state.settings;
  assert.equal(textSize, 100);
  handlers.settings.run({ ...others, textSize: 150 });
  assert.equal(ctx.store.state.settings.textSize, 150);
  assert.ok(ctx.placed >= 1, 'The alert window is placed again at its new size');
  handlers.settings.run({ ...others, sound: false });
  assert.equal(ctx.store.state.settings.textSize, 150, 'Saving other settings keeps the text size');
  handlers.settings.run({ ...others, textSize: 'huge' });
  assert.equal(ctx.store.state.settings.textSize, 100, 'A bad size is saved as 100%');
  ctx.store.state.settings.textSize = 115;
  assert.equal(handlers.language.run().textSize, 115, 'The alert and quick-add windows read it with the language');
});

test('every font size in the stylesheets follows the text size, and none is below 12 px', () => {
  const styles = read('ui/styles/styles.css');
  assert.match(styles, /:root\{[^}]*--text-scale:1[;}]/);
  for (const size of TEXT_SIZES.slice(1)) assert.match(styles, new RegExp(`\\[data-text-size="${size}"\\]\\{--text-scale:${size / 100}\\}`), String(size));
  for (const file of ['ui/styles/styles.css', 'ui/styles/alert.css', 'ui/styles/quickadd.css']) {
    const css = read(file);
    for (const [, value] of css.matchAll(/font-size:([^;}]+)/g)) {
      // Only the large app name in the sidebar keeps its size, so it still fits the sidebar.
      if (value === '34px') continue;
      const match = /^calc\((\d+(?:\.\d+)?)px\*var\(--text-scale\)\)$/.exec(value);
      assert.ok(match, `${file}: font-size:${value} must be calc(<px>*var(--text-scale))`);
      assert.ok(Number(match[1]) >= 12, `${file}: font-size:${value} is below 12 px`);
    }
    for (const [, value] of css.matchAll(/[{;]font:([^;}]+)/g)) {
      if (value === 'inherit' || !/\dpx/.test(value)) continue;
      const match = /calc\((\d+)px\*var\(--text-scale\)\)/.exec(value);
      assert.ok(match && Number(match[1]) >= 12, `${file}: font:${value}`);
    }
  }
});

test('every page loads the text size script before the scripts that apply it', () => {
  for (const [page, script] of [['ui/index.html', 'main/state.js'], ['ui/alert.html', 'alert/alert.js'], ['ui/quickadd.html', 'quickadd/quickadd.js']]) {
    const html = read(page), lib = html.indexOf('<script src="lib/text-size.js">');
    assert.ok(lib > 0 && lib < html.indexOf(`<script src="${script}">`), page);
  }
  assert.match(read('src/main/preload.js'), /flag\('text-size'\)/, 'The first paint already uses the saved size');
});

test('the text size setting is translated into all 12 languages', () => {
  const keys = ['Text size', 'Makes all text larger. Ctrl+= and Ctrl+- also change it, and Ctrl+0 brings it back to 100%.'];
  assert.equal(LOCALES.length, 12);
  for (const { code } of LOCALES) {
    const strings = JSON.parse(read(`ui/locales/${code}.json`));
    for (const key of keys) assert.ok(typeof strings[key] === 'string' && strings[key].trim(), `${code}: ${key}`);
    if (code !== 'en') assert.notEqual(strings[keys[0]], keys[0], `${code} has its own word for "Text size"`);
    for (const shortcut of ['Ctrl+=', 'Ctrl+-', 'Ctrl+0']) assert.ok(strings[keys[1]].includes(shortcut), `${code} names ${shortcut}`);
  }
});
