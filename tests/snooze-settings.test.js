const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../src/main/handlers');
const { checkRequest } = require('../src/main/ipc');
const { initialState, validateState } = require('../src/core/tasks');
const { DEFAULT_SNOOZE_PRESETS } = require('../ui/lib/alert-format');
// Configurable snooze choices (issue #20): stored in settings, checked on save, sent to the alert,
// and the alert's Reschedule opening the task's date and time in the main window.

function context() {
  const ctx = { electron: {}, tr: text => text, language: () => 'en', setLogin() {}, rebuildTrayMenu() {}, placeAlert() {}, applyTheme() {}, controlsLocale: 'en-US' };
  ctx.store = { state: initialState(), change(fn) { const draft = structuredClone(this.state); const result = fn(draft); this.state = validateState(draft); return result; } };
  return ctx;
}
const custom = [{ kind: 'in', minutes: 5 }, { kind: 'in', minutes: 90 }, { kind: 'today', time: '12:00' }, { kind: 'tomorrow', time: '08:30' }, { kind: 'in', minutes: 2880 }, { kind: 'pick' }];

test('new installs and older data files get the v1.5.0 snooze choices', () => {
  assert.deepEqual(initialState().settings.snoozePresets, DEFAULT_SNOOZE_PRESETS);
  assert.notEqual(initialState().settings.snoozePresets[0], DEFAULT_SNOOZE_PRESETS[0], 'A copy the store can change');
  const v150 = { version: 1, tasks: [], notes: [], settings: { sound: true, language: 'en' } };
  assert.deepEqual(validateState(v150).settings.snoozePresets, DEFAULT_SNOOZE_PRESETS);
  const saved = validateState({ ...initialState(), settings: { snoozePresets: custom } });
  assert.deepEqual(saved.settings.snoozePresets, custom, 'Saved choices are kept');
  const broken = validateState({ ...initialState(), settings: { snoozePresets: [...custom.slice(0, 5), { kind: 'in', minutes: -3 }] } });
  assert.deepEqual(broken.settings.snoozePresets, [...custom.slice(0, 5), { kind: 'pick' }], 'One broken slot does not hide the file or the other choices');
});

test('Settings saves valid snooze choices, rejects invalid ones and keeps them when left out', () => {
  const ctx = context(), { settings, language } = createHandlers(ctx);
  const base = () => ({ ...ctx.store.state.settings });
  settings.run({ ...base(), snoozePresets: custom });
  assert.deepEqual(ctx.store.state.settings.snoozePresets, custom);
  assert.deepEqual(language.run({}).snoozePresets, custom, 'The alert reads the saved choices');
  for (const bad of [[], custom.slice(0, 5), [...custom.slice(0, 5), { kind: 'in', minutes: 0 }], [...custom.slice(0, 5), { kind: 'later' }], 'pick', [, , , , , { kind: 'pick' }]]) { // eslint-disable-line no-sparse-arrays
    assert.throws(() => settings.run({ ...base(), snoozePresets: bad }), /Each snooze choice needs a valid time/, JSON.stringify(bad));
    assert.deepEqual(ctx.store.state.settings.snoozePresets, custom, 'Nothing changes on a rejected save');
  }
  const { snoozePresets, ...withoutChoices } = base();
  assert.ok(snoozePresets);
  settings.run({ ...withoutChoices, sound: false });
  assert.deepEqual(ctx.store.state.settings.snoozePresets, custom, 'Other settings keep the saved choices');
  settings.run({ ...base(), snoozePresets: [...custom.slice(0, 5), { kind: 'week', extra: 'x' }] });
  assert.deepEqual(ctx.store.state.settings.snoozePresets.at(-1), { kind: 'week' }, 'Stored without unknown fields');
});

test('Reschedule asks the main window for the editor with its date and time focused', () => {
  assert.deepEqual(checkRequest('open', { id: 'a', field: 'due' }, { fromAlert: true }), { id: 'a', field: 'due' });
  assert.doesNotThrow(() => checkRequest('open', { id: 'a' }, { fromAlert: true }));
  for (const field of ['title', 1, null]) assert.throws(() => checkRequest('open', { id: 'a', field }, { fromAlert: true }), /Invalid request data/);
  const ctx = context(), requests = [];
  ctx.openInMain = (...args) => requests.push(args);
  ctx.store.state.tasks.push({ id: 'a', title: 'Call', dueAt: null, repeat: 'none', attachments: [] });
  const { open } = createHandlers(ctx);
  open.run({ id: 'a', field: 'due' }); open.run({ id: 'a' }); open.run({ id: 'gone', field: 'due' });
  assert.deepEqual(requests, [['a', 'due'], ['a', undefined], [null, 'due']]);
});
