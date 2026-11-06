const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_QUICK_ADD_SHORTCUT, normalizeAccelerator, acceleratorFromKey, quickAddDueAt } = require('../ui/lib/quickadd');
const { createQuickAdd } = require('../src/main/quick-add');
const { quickAddBounds } = require('../src/core/placement');
const { checkRequest, QUICK_ADD_ACTIONS } = require('../src/main/ipc');
const { createHandlers } = require('../src/main/handlers');
const { initialState, validateState } = require('../src/core/tasks');
const { MACHINE_SETTINGS } = require('../src/data/backups');

test('a quick-add shortcut needs two of Ctrl, Alt and Shift and a letter, digit, F1-F12 or Space', () => {
  assert.equal(DEFAULT_QUICK_ADD_SHORTCUT, 'Ctrl+Alt+R');
  for (const [given, saved] of [['Ctrl+Alt+R', 'Ctrl+Alt+R'], ['alt+ctrl+r', 'Ctrl+Alt+R'], ['Control+Shift+5', 'Ctrl+Shift+5'], ['Shift+Alt+F12', 'Alt+Shift+F12'],
    ['Ctrl+Alt+space', 'Ctrl+Alt+Space'], ['Ctrl+Alt+Shift+Q', 'Ctrl+Alt+Shift+Q']]) assert.equal(normalizeAccelerator(given), saved, given);
  // One modifier would take Ctrl+R or Alt+F from every app; Shift alone types capitals; this app's Ctrl+N and Ctrl+K stay free.
  for (const bad of ['R', 'Ctrl+R', 'Alt+F4', 'Ctrl+N', 'Ctrl+K', 'Shift+R', 'Ctrl+Ctrl+R', 'Ctrl+Alt+F13', 'Ctrl+Alt+Enter', 'Ctrl+Alt+Tab', 'Ctrl+Alt+',
    'Super+Alt+R', 'CommandOrControl+Alt+R', 'Ctrl+Alt+RR', '', null, 5, {}, 'Ctrl+Alt+R'.repeat(5)]) assert.equal(normalizeAccelerator(bad), null, String(bad));
});

test('the recorder reads the physical key, so it works in any keyboard layout', () => {
  const key = (code, mods = {}) => acceleratorFromKey({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  assert.equal(key('KeyR', { ctrlKey: true, altKey: true }), 'Ctrl+Alt+R', 'Arabic or Russian layouts still give R');
  assert.equal(key('Digit3', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+3');
  assert.equal(key('F9', { altKey: true, shiftKey: true }), 'Alt+Shift+F9');
  assert.equal(key('Space', { ctrlKey: true, altKey: true }), 'Ctrl+Alt+Space');
  for (const [code, mods] of [['KeyR', { ctrlKey: true }], ['ControlLeft', { ctrlKey: true, altKey: true }], ['Enter', { ctrlKey: true, altKey: true }],
    ['Numpad5', { ctrlKey: true, altKey: true }], ['KeyR', { ctrlKey: true, altKey: true, metaKey: true }], ['KeyR', { shiftKey: true }]]) assert.equal(key(code, mods), null, `${code} ${JSON.stringify(mods)}`);
  assert.equal(acceleratorFromKey(null), null);
});

test('a typed time is due today, or tomorrow once it has passed; no time means no due time', () => {
  const now = new Date(2026, 10, 3, 14, 20);
  assert.equal(quickAddDueAt('17:30', now), new Date(2026, 10, 3, 17, 30).toISOString());
  assert.equal(quickAddDueAt('09:00', now), new Date(2026, 10, 4, 9, 0).toISOString());
  assert.equal(quickAddDueAt('14:20', now), new Date(2026, 10, 4, 14, 20).toISOString(), 'Now is already past');
  assert.equal(quickAddDueAt('23:59', new Date(2026, 11, 31, 23, 59, 30)), new Date(2027, 0, 1, 23, 59).toISOString(), 'Across the new year');
  for (const time of ['', undefined, null, '24:00', '12:60', '9:00', 'noon']) assert.equal(quickAddDueAt(time, now), null, String(time));
});

// A main-process context with a fake globalShortcut that refuses shortcuts another app holds.
function fakeShortcuts(taken = []) {
  const held = new Map(), calls = [];
  return { held, calls,
    register(accelerator, callback) { calls.push(['register', accelerator]); if (taken.includes(accelerator)) return false; held.set(accelerator, callback); return true; },
    unregister(accelerator) { calls.push(['unregister', accelerator]); held.delete(accelerator); } };
}
function quickContext(settings = {}) {
  const warnings = [], shown = [];
  const ctx = { store: { state: { settings: { ...initialState().settings, ...settings } } }, log: { warn: (event, error, details) => warnings.push([event, details]) },
    windows: { showQuickAdd: () => shown.push('quick-add') } };
  return { ctx, warnings, shown };
}

test('the shortcut is registered only while quick add is on, and re-registered when it changes', () => {
  const shortcuts = fakeShortcuts(), { ctx, shown } = quickContext();
  const quick = createQuickAdd(ctx, shortcuts);
  assert.deepEqual(quick.apply(), { enabled: false, shortcut: 'Ctrl+Alt+R', active: false, conflict: false }, 'Off by default');
  assert.deepEqual(shortcuts.calls, []);
  ctx.store.state.settings.quickAdd = true;
  assert.equal(quick.apply().active, true);
  shortcuts.held.get('Ctrl+Alt+R')();
  assert.deepEqual(shown, ['quick-add'], 'The shortcut opens the quick-add window');
  quick.apply(); quick.apply();
  assert.equal(shortcuts.calls.length, 1, 'Nothing changed, nothing re-registered');
  ctx.store.state.settings.quickAddShortcut = 'Ctrl+Shift+Space';
  quick.apply();
  assert.deepEqual([...shortcuts.held.keys()], ['Ctrl+Shift+Space'], 'The old shortcut is let go');
  ctx.store.state.settings.quickAdd = false;
  assert.equal(quick.apply().active, false);
  assert.deepEqual([...shortcuts.held.keys()], []);
  ctx.store.state.settings.quickAdd = true; quick.apply(); quick.stop();
  assert.deepEqual([...shortcuts.held.keys()], [], 'Quitting lets the shortcut go');
});

test('a shortcut another app holds is reported and logged once, not retried', () => {
  const shortcuts = fakeShortcuts(['Ctrl+Alt+R']), { ctx, warnings } = quickContext({ quickAdd: true });
  const quick = createQuickAdd(ctx, shortcuts);
  assert.deepEqual(quick.apply(), { enabled: true, shortcut: 'Ctrl+Alt+R', active: false, conflict: true });
  assert.deepEqual(quick.apply(), quick.status());
  assert.deepEqual(warnings, [['quick-add-shortcut-unavailable', { shortcut: 'Ctrl+Alt+R' }]]);
  assert.equal(shortcuts.calls.filter(([kind]) => kind === 'register').length, 1);
  ctx.store.state.settings.quickAddShortcut = 'Ctrl+Alt+T';
  assert.deepEqual(quick.apply(), { enabled: true, shortcut: 'Ctrl+Alt+T', active: true, conflict: false }, 'Another shortcut clears the conflict');
  const throwing = createQuickAdd(quickContext({ quickAdd: true }).ctx, { register: () => { throw new Error('bad accelerator'); }, unregister() {} });
  assert.equal(throwing.apply().conflict, true, 'An accelerator Electron rejects counts as unavailable');
});

test('the quick-add window sits centered above the taskbar, or below a taskbar at the top', () => {
  const bottom = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  assert.deepEqual(quickAddBounds(bottom), { x: 730, y: 822, width: 460, height: 206 });
  const top = { bounds: { x: 1920, y: 0, width: 1280, height: 720 }, workArea: { x: 1920, y: 40, width: 1280, height: 680 } };
  assert.deepEqual(quickAddBounds(top), { x: 2330, y: 52, width: 460, height: 206 });
  const tiny = { bounds: { x: 0, y: 0, width: 400, height: 300 }, workArea: { x: 0, y: 0, width: 400, height: 260 } };
  const fit = quickAddBounds(tiny);
  assert.ok(fit.x >= 0 && fit.width <= 400 - 24 && fit.y + fit.height <= 260, JSON.stringify(fit));
});

test('the quick-add window may only read its language, read a typed date, and add one task with a title and an optional time', () => {
  assert.deepEqual([...QUICK_ADD_ACTIONS].sort(), ['language', 'locale', 'parseWhen', 'quickAdd']);
  for (const action of ['state', 'saveTask', 'deleteTask', 'settings', 'complete', 'snooze', 'open', 'attachFiles', 'export', 'openLink']) assert.throws(() => checkRequest(action, { id: 'a' }, { fromQuickAdd: true }), /Request not allowed/, action);
  assert.deepEqual(checkRequest('quickAdd', { title: 'Call Sami' }, { fromQuickAdd: true }), { title: 'Call Sami' });
  assert.doesNotThrow(() => checkRequest('quickAdd', { title: 'x', dueAt: '2026-11-03T17:30:00.000Z' }, { fromQuickAdd: true }));
  assert.doesNotThrow(() => checkRequest('quickAdd', { title: 'x', dueAt: null }, { fromQuickAdd: true }));
  // A typed phrase can carry a repeat («كل يوم 7 الصبح»): only the task editor's repeat modes and rules, nothing else.
  for (const payload of [{ title: 'x', dueAt: null, repeat: 'daily' }, { title: 'x', repeat: 'days', repeatDays: [0, 4] }, { title: 'x', repeat: 'interval', repeatEvery: 3 }]) assert.doesNotThrow(() => checkRequest('quickAdd', payload, { fromQuickAdd: true }), JSON.stringify(payload));
  for (const payload of [{}, { title: 5 }, { title: 'x', repeat: 'hourly' }, { title: 'x', repeatDays: [7] }, { title: 'x', repeatDays: [] }, { title: 'x', repeatDays: '1' }, { title: 'x', repeatEvery: 1 }, { title: 'x', repeatEvery: 2.5 },
    { title: 'x', attachments: ['a'] }, { title: 'x', id: 'a' }, { title: 'x', priority: 'high' }]) assert.throws(() => checkRequest('quickAdd', payload, { fromQuickAdd: true }), /Invalid/, JSON.stringify(payload));
  assert.deepEqual(checkRequest('parseWhen', { text: 'بكرة 5 العصر' }, { fromQuickAdd: true }), { text: 'بكرة 5 العصر' });
  for (const payload of [{}, { text: 5 }, { text: 'x'.repeat(201) }, { text: 'x', now: 1 }]) assert.throws(() => checkRequest('parseWhen', payload, { fromQuickAdd: true }), /Invalid/, JSON.stringify(payload));
  assert.throws(() => checkRequest('quickAdd', { title: 'x', dueAt: 'tomorrow' }, { fromQuickAdd: true }), /Invalid time/);
  assert.throws(() => checkRequest('quickAdd', { title: 'x' }, { fromAlert: true }), /Request not allowed/);
});

function liveContext() {
  const applied = [];
  const ctx = { electron: {}, tr: text => text, store: { state: initialState(), change(fn) { return fn(this.state); } },
    setLogin() {}, rebuildTrayMenu() {}, placeAlert() {}, applyTheme() {}, controlsLocale: 'en-US',
    quickAdd: { apply: () => { applied.push({ ...ctx.store.state.settings }); return { conflict: false }; } } };
  return { ctx, applied };
}

test('quickAdd saves a new task through the data layer, with or without a due time', () => {
  const { ctx } = liveContext(), handlers = createHandlers(ctx);
  handlers.quickAdd.run({ title: '  Call Sami  ' });
  handlers.quickAdd.run({ title: 'Pay rent', dueAt: '2026-11-03T17:30:00.000Z' });
  const [first, second] = ctx.store.state.tasks;
  assert.equal(first.title, 'Call Sami'); assert.equal(first.dueAt, null); assert.equal(first.repeat, 'none');
  assert.equal(second.dueAt, '2026-11-03T17:30:00.000Z'); assert.equal(second.priority, 'normal');
  assert.throws(() => handlers.quickAdd.run({ title: '   ' }));
  assert.equal(ctx.store.state.tasks.length, 2);
});

test('Settings turns quick add on and off and changes the shortcut; other callers keep both', () => {
  const { ctx, applied } = liveContext(), handlers = createHandlers(ctx), base = { ...ctx.store.state.settings };
  assert.deepEqual(handlers.settings.run({ ...base, quickAdd: true, quickAddShortcut: 'shift+ctrl+q' }), { restart: false });
  assert.equal(ctx.store.state.settings.quickAdd, true);
  assert.equal(ctx.store.state.settings.quickAddShortcut, 'Ctrl+Shift+Q');
  const { quickAdd, quickAddShortcut, ...others } = base;
  assert.ok(quickAdd === false && quickAddShortcut === 'Ctrl+Alt+R');
  handlers.settings.run({ ...others, sound: false });
  assert.equal(ctx.store.state.settings.quickAdd, true, 'Saving other settings keeps quick add');
  assert.equal(ctx.store.state.settings.quickAddShortcut, 'Ctrl+Shift+Q');
  assert.throws(() => handlers.settings.run({ ...others, quickAddShortcut: 'Ctrl+R' }), /Use two of Ctrl, Alt and Shift/);
  assert.equal(ctx.store.state.settings.quickAddShortcut, 'Ctrl+Shift+Q', 'A refused shortcut changes nothing');
  assert.equal(applied.length, 2, 'Every saved change re-applies the shortcut');
});

test('older data gets quick add off with the default shortcut, and a restore keeps this PC’s choice', () => {
  const v161 = { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, language: 'en' } };
  const loaded = validateState(structuredClone(v161)).settings;
  assert.equal(loaded.quickAdd, false);
  assert.equal(loaded.quickAddShortcut, 'Ctrl+Alt+R');
  const odd = validateState({ ...structuredClone(v161), settings: { ...v161.settings, quickAdd: 'yes', quickAddShortcut: 'Ctrl+R' } }).settings;
  assert.deepEqual([odd.quickAdd, odd.quickAddShortcut], [false, 'Ctrl+Alt+R']);
  const kept = validateState({ ...structuredClone(v161), settings: { ...v161.settings, quickAdd: true, quickAddShortcut: 'alt+shift+k' } }).settings;
  assert.deepEqual([kept.quickAdd, kept.quickAddShortcut], [true, 'Alt+Shift+K']);
  assert.ok(MACHINE_SETTINGS.includes('quickAdd') && MACHINE_SETTINGS.includes('quickAddShortcut'), 'Other apps on this PC decide which shortcut is free');
});
