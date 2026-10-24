const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FILE, parseTheme, windowColors } = require('../src/platform/themes');
const { PALETTES, NOTE_COLORS, NOTE_STYLES, noteLook, initialState, validateState } = require('../src/core/tasks');

const css = fs.readFileSync(FILE, 'utf8');
const palettes = parseTheme(css);
const papers = parseTheme(css, 'data-paper');
const MODES = ['light', 'dark'];
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  assert.match(a, /^#[0-9a-f]{6}$/i); assert.match(b, /^#[0-9a-f]{6}$/i);
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// [text or mark, background, minimum ratio]: 4.5:1 for text, 3:1 for focus rings, icons and controls.
const PAIRS = [
  ['ink', 'bg', 4.5], ['ink', 'surface', 4.5], ['ink-2', 'surface', 4.5], ['ink-2', 'bg', 4.5],
  ['muted', 'surface', 4.5], ['muted', 'bg', 4.5], ['muted', 'surface-2', 4.5], ['muted', 'hover', 4.5], ['muted', 'accent-soft', 4.5],
  ['faint', 'surface', 3], ['faint', 'bg', 3],
  ['on-accent', 'accent', 4.5], ['on-accent', 'accent-hover', 4.5],
  ['accent-ink', 'surface', 4.5], ['accent-ink', 'bg', 4.5], ['accent-ink', 'accent-soft', 4.5], ['accent-ink', 'accent-soft-2', 4.5],
  ['accent', 'surface', 3], ['focus', 'surface', 3], ['focus', 'bg', 3],
  ['on-danger', 'danger', 4.5], ['danger', 'surface', 4.5], ['danger', 'danger-soft', 4.5],
  ['success', 'surface', 3], ['success-ink', 'success-soft', 4.5], ['warning-ink', 'warning-soft', 4.5],
  ['hero-ink', 'hero-bg', 4.5], ['hero-muted', 'hero-bg', 4.5], ['hero-accent', 'hero-bg', 4.5], ['toast-ink', 'toast-bg', 4.5],
];

test('every palette defines the same tokens in light and dark', () => {
  assert.deepEqual(Object.keys(palettes).filter(id => id !== '*').sort(), [...PALETTES].sort());
  const names = Object.keys(palettes.lavender.light).sort();
  assert.ok(names.length >= 30);
  for (const id of PALETTES) for (const mode of MODES) assert.deepEqual(Object.keys(palettes[id][mode]).sort(), names, `${id} ${mode}`);
});

test('text, buttons and focus rings meet WCAG contrast in every palette and mode', () => {
  const failures = [];
  for (const id of PALETTES) for (const mode of MODES) for (const [fg, bg, min] of PAIRS) {
    const tokens = palettes[id][mode], ratio = contrast(tokens[fg], tokens[bg]);
    if (ratio < min) failures.push(`${id} ${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
  assert.deepEqual(failures, []);
});

test('the brand mark stands out from its tile in every palette and mode', () => {
  // ui/styles/theme.css: light marks put --on-accent on an accent tile, dark marks put --accent on an accent-soft tile.
  const failures = [];
  for (const id of PALETTES) for (const mode of MODES) {
    const t = palettes[id][mode];
    const pairs = mode === 'light' ? [['on-accent', 'accent-hover']] : [['accent', 'accent-soft-2'], ['accent', 'accent-soft']];
    // The 16 px glyph draws a surface-colored check on a solid success dot.
    for (const [fg, bg] of [...pairs, ['surface', 'success'], ['success-ink', 'success-soft']]) if (contrast(t[fg], t[bg]) < 3) failures.push(`${id} ${mode}: ${fg} on ${bg}`);
  }
  assert.deepEqual(failures, []);
  const shared = fs.readFileSync(path.join(__dirname, '../ui/lib/shared.js'), 'utf8');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(shared.slice(shared.indexOf('function brandMark'), shared.indexOf('function hydrateBrandMarks'))), 'The mark uses tokens, not fixed colors');
});

test('light and dark variants are actually light and dark', () => {
  for (const id of PALETTES) {
    assert.ok(luminance(palettes[id].light.bg) > 0.8 && luminance(palettes[id].light.ink) < 0.05, `${id} light`);
    assert.ok(luminance(palettes[id].dark.bg) < 0.03 && luminance(palettes[id].dark.ink) > 0.6, `${id} dark`);
  }
});

test('every note color has a light and a dark paper with readable ink', () => {
  assert.deepEqual(Object.keys(papers).filter(id => id !== '*').sort(), [...NOTE_COLORS].sort());
  for (const mode of MODES) for (const id of NOTE_COLORS) for (const ink of ['paper-ink', 'paper-muted']) {
    const ratio = contrast(papers['*'][mode][ink], papers[id][mode].paper);
    assert.ok(ratio >= 4.5, `${id} ${mode}: ${ink} ${ratio.toFixed(2)}:1`);
  }
  // Red must read as red: its light paper is clearly warmer than cream and pink.
  const [r, g, b] = [1, 3, 5].map(i => parseInt(papers.red.light.paper.slice(i, i + 2), 16));
  assert.ok(r - g > 30 && r - b > 30, 'Red paper is visibly red');
});

test('stylesheets take their colors from the theme tokens', () => {
  // Neutral shadows, the photo caption overlay and the fixed illustration colors are the only literals left.
  const allowed = new Set(['#0001', '#0002', '#0003', '#30293b99', 'white', '#c5dfbd', '#54774f']);
  for (const name of ['styles.css', 'alert.css']) {
    const source = fs.readFileSync(path.join(__dirname, '../ui/styles', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const literals = (source.match(/#[0-9a-f]{3,8}\b|\b(?:white|black)\b|rgba?\([^)]*\)/gi) || []).filter(c => !allowed.has(c.toLowerCase()));
    assert.deepEqual(literals, [], `${name} has hard-coded colors; add a token to ui/styles/theme.css instead`);
  }
});

test('window backgrounds follow the palette and mode', () => {
  assert.deepEqual(windowColors('ocean', false), { main: palettes.ocean.light.bg, alert: palettes.ocean.light.surface });
  assert.deepEqual(windowColors('contrast', true), { main: palettes.contrast.dark.bg, alert: palettes.contrast.dark.surface });
  assert.deepEqual(windowColors('neon', true), windowColors('lavender', true), 'Unknown palettes use Lavender');
});

test('windows get the palette through the preload and keep plain page URLs', () => {
  // The desktop tests (and fromPage) find windows by URLs ending in /index.html and /alert.html,
  // so a query string such as ?palette= hid the main window from them (PR #35).
  // The main process source, however it is split into files.
  const mainDir = path.join(__dirname, '../src/main');
  const main = fs.readdirSync(mainDir, { recursive: true }).map(String).filter(name => name.endsWith('.js')).map(name => fs.readFileSync(path.join(mainDir, name), 'utf8')).join('\n');
  const loads = [...main.matchAll(/loadFile\(([^;]*)\);/g)].map(m => m[1]);
  assert.ok(loads.length >= 2);
  for (const args of loads) assert.match(args, /^path\.join\(__dirname, '\.\.\/\.\.\/ui\/\w+\.html'\)$/, `loadFile(${args}) adds nothing to the URL`);
  assert.match(main, /additionalArguments: \[`--waqt-palette=\$\{store\.state\.settings\.palette\}`\]/);
  const run = argv => {
    let exposed;
    const electron = { contextBridge: { exposeInMainWorld: (name, api) => { exposed = api; } }, ipcRenderer: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8'), { require: () => electron, process: { argv } });
    return exposed.palette;
  };
  assert.equal(run(['electron.exe', '--type=renderer', '--waqt-palette=forest']), 'forest');
  assert.equal(run(['electron.exe', '--type=renderer']), '', 'No flag: the page falls back to Lavender');
});

test('settings keep the theme mode and fall back to Lavender for unknown palettes', () => {
  assert.equal(initialState().settings.palette, 'lavender');
  const load = settings => validateState({ ...initialState(), settings }).settings;
  for (const palette of PALETTES) assert.equal(load({ palette }).palette, palette);
  for (const palette of ['neon', '', null, 3, 'Ocean']) assert.equal(load({ palette }).palette, 'lavender', String(palette));
  assert.equal(load({ sound: true, startAtLogin: false, alertSide: 'right', language: 'en' }).palette, 'lavender', 'v1.4.0 settings have no palette');
  for (const theme of ['system', 'light', 'dark']) assert.equal(load({ theme, palette: 'forest' }).theme, theme);
  assert.equal(load({ theme: 'sepia' }).theme, 'system');
});

test('note colors and styles validate, with cream and plain as fallbacks', () => {
  assert.deepEqual(NOTE_COLORS.slice(0, 1), ['cream']);
  for (const id of ['cream', 'green', 'blue', 'pink']) assert.ok(NOTE_COLORS.includes(id), `v1.4.0 color ${id} is kept`);
  for (const id of ['yellow', 'orange', 'red', 'purple', 'gray', 'white']) assert.ok(NOTE_COLORS.includes(id), id);
  assert.deepEqual(NOTE_STYLES, ['plain', 'sticky', 'lined']);
  assert.deepEqual(noteLook({ color: 'red', style: 'sticky' }), { color: 'red', style: 'sticky' });
  assert.deepEqual(noteLook({ color: 'neon', style: 'curly' }), { color: 'cream', style: 'plain' });
  assert.deepEqual(noteLook(), { color: 'cream', style: 'plain' });
  const note = (extra) => ({ id: 'n1', title: 'Note', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', color: 'green', ...extra });
  const load = n => validateState({ ...initialState(), notes: [n] }).notes[0];
  const old = note({});
  assert.deepEqual(load(JSON.parse(JSON.stringify(old))), { ...old, attachments: [] }, 'A v1.4.0 note loads unchanged, with no style added');
  assert.deepEqual([load(note({ color: 'red', style: 'lined' })).color, load(note({ color: 'red', style: 'lined' })).style], ['red', 'lined']);
  assert.equal(load(note({ style: 'curly' })).style, 'plain');
  assert.equal(load(note({ color: 'neon' })).color, 'cream');
});

test('the note editor offers every color and style', () => {
  // The main window's scripts, however they are split into files.
  const appDir = path.join(__dirname, '../ui/main');
  const app = fs.readdirSync(appDir, { recursive: true }).map(String).filter(name => name.endsWith('.js')).map(name => fs.readFileSync(path.join(appDir, name), 'utf8')).join('\n');
  const listed = name => [...(app.match(new RegExp(`const ${name} = \\[(.*)\\];`)) || ['', ''])[1].matchAll(/\['(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(listed('NOTE_COLORS'), NOTE_COLORS);
  assert.deepEqual(listed('NOTE_STYLES'), NOTE_STYLES);
  assert.deepEqual(listed('PALETTE_NAMES'), PALETTES);
  const shared = fs.readFileSync(path.join(__dirname, '../ui/lib/shared.js'), 'utf8');
  assert.deepEqual([...shared.match(/const PALETTES = \[(.*)\];/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]), PALETTES);
});
