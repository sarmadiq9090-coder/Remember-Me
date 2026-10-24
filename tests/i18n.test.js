const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LOCALES, DEFAULT, findLocale, translate } = require('../ui/lib/translate');
const { collectKeys, loadLocale } = require('../tools/i18n-keys.cjs');
const { initialState, validateState } = require('../src/core/tasks');
const en = loadLocale('en');
const placeholders = value => [...new Set(JSON.stringify(value).match(/\{\w+\}/g) || [])].sort();
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

test('English is the source: every key the app uses has an English text, and nothing is left unused', () => {
  const used = collectKeys();
  assert.deepEqual(used.filter(key => !(key in en)), [], 'Keys missing from ui/locales/en.json');
  assert.deepEqual(Object.keys(en).filter(key => !used.includes(key)), [], 'Keys in en.json that the app no longer uses');
  for (const [key, value] of Object.entries(en)) if (typeof value === 'object') assert.ok(value.one && value.other, key);
});

test('the locale registry lists each language once, by its own name, with a file and a direction', () => {
  assert.equal(DEFAULT, 'en');
  assert.equal(new Set(LOCALES.map(l => l.code)).size, LOCALES.length);
  assert.deepEqual(LOCALES.map(l => l.code), ['en', 'ar', 'es', 'fr', 'de', 'pt-BR', 'ru', 'zh-CN', 'ja', 'tr', 'hi', 'id']);
  for (const locale of LOCALES) {
    assert.ok(fs.existsSync(path.join(__dirname, '../ui/locales', locale.code + '.json')), locale.code);
    assert.ok(['ltr', 'rtl'].includes(locale.dir) && locale.name && locale.intl && locale.chromium && [0, 1, 6].includes(locale.weekStart), locale.code);
    assert.doesNotThrow(() => new Intl.PluralRules(locale.intl));
  }
  assert.deepEqual(LOCALES.filter(l => l.dir === 'rtl').map(l => l.code), ['ar']);
  assert.equal(findLocale('xx').code, 'en', 'Unknown codes fall back to English');
});

test('Arabic is complete and every translation keeps the placeholders and plural forms of the English text', () => {
  for (const { code } of LOCALES.slice(1)) {
    const messages = loadLocale(code);
    const missing = Object.keys(en).filter(key => !(key in messages));
    if (code === 'ar') assert.deepEqual(missing, [], 'Arabic must be complete');
    else if (missing.length) test.diagnostic?.(`${code}: ${missing.length} keys fall back to English`);
    for (const [key, value] of Object.entries(messages)) {
      assert.ok(key in en, `${code}: "${key}" is not an English key`);
      // No invented placeholders; plain strings keep every value, plural forms may leave out {count}.
      const own = placeholders(value), english = placeholders(en[key]);
      assert.deepEqual(own.filter(p => !english.includes(p)), [], `${code}: unknown placeholder in "${key}"`);
      assert.deepEqual(english.filter(p => !own.includes(p) && !(typeof value === 'object' && p === '{count}')), [], `${code}: "${key}" drops a value`);
      if (typeof value === 'object') {
        assert.ok(value.other, `${code}: "${key}" needs an "other" form`);
        assert.deepEqual(Object.keys(value).filter(f => !FORMS.includes(f)), [], `${code}: plural forms of "${key}"`);
      } else assert.equal(typeof value, 'string', `${code}: "${key}"`);
    }
  }
});

test('lookups fall back to English, then to the key, and choose plural forms by language', () => {
  const ar = loadLocale('ar');
  assert.equal(translate(ar, en, 'ar-IQ', 'Settings'), 'الإعدادات');
  assert.equal(translate({}, en, 'fr-FR', 'Settings'), 'Settings', 'Missing translations use English');
  assert.equal(translate(ar, en, 'ar-IQ', 'Not a key'), 'Not a key');
  assert.equal(translate(ar, en, 'ar-IQ', 'Today@nav'), 'يومي', 'Context keys have their own text');
  assert.equal(translate({}, en, 'en-US', 'Today@nav'), 'Today');
  const key = 'Remember Me • {count} reminders waiting';
  assert.equal(translate({}, en, 'en-US', key, { count: 1 }), 'Remember Me • 1 reminder waiting');
  assert.equal(translate({}, en, 'en-US', key, { count: 3 }), 'Remember Me • 3 reminders waiting');
  assert.deepEqual([1, 2, 3, 11, 100].map(count => translate(ar, en, 'ar-IQ', key, { count })), ['ذكرني • تذكير واحد بانتظارك', 'ذكرني • تذكيران بانتظارك', 'ذكرني • 3 تذكيرات بانتظارك', 'ذكرني • 11 تذكيرًا بانتظارك', 'ذكرني • 100 تذكير بانتظارك']);
  assert.equal(translate(ar, en, 'ar-IQ', key, { count: 3 }, n => n.toLocaleString('ar-IQ')), 'ذكرني • ٣ تذكيرات بانتظارك', 'Numbers follow the chosen digits');
  const ru = loadLocale('ru');
  assert.deepEqual([1, 3, 5, 21].map(count => translate(ru, en, 'ru-RU', key, { count })), ['Remember Me • 1 напоминание ждёт', 'Remember Me • 3 напоминания ждут', 'Remember Me • 5 напоминаний ждут', 'Remember Me • 21 напоминание ждёт']);
  assert.equal(translate({}, en, 'en-US', 'Choose {name}', { other: 1 }), 'Choose {name}', 'Unknown placeholders stay visible');
});

test('new installs start in English, saved languages are kept and unknown ones fall back to English', () => {
  assert.equal(initialState().settings.language, 'en');
  const v140 = { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: 'ar' } };
  assert.equal(validateState(structuredClone(v140)).settings.language, 'ar', 'A v1.4.0 file keeps Arabic');
  for (const code of ['en', 'fr', 'zh-CN', 'pt-BR']) assert.equal(validateState({ ...structuredClone(v140), settings: { ...v140.settings, language: code } }).settings.language, code);
  for (const code of ['xx', 'EN', 'ku', 5, null]) assert.equal(validateState({ ...structuredClone(v140), settings: { ...v140.settings, language: code } }).settings.language, 'en', String(code));
  const older = { ...v140.settings }; delete older.language;
  assert.equal(validateState({ ...structuredClone(v140), settings: older }).settings.language, 'ar', 'Settings from before the language option were Arabic');
  assert.equal(validateState({ ...structuredClone(v140), settings: 'broken' }).settings.language, 'en');
});
test('errors thrown by the updater safety backup are collected and translated', () => {
  const key = 'The safety backup took too long.';
  assert.ok(collectKeys().includes(key));
  for (const { code } of LOCALES) assert.ok(key in loadLocale(code), code);
});

test('native date, time and number fields start in the saved language, always with digits 0-9', () => {
  const os = require('node:os');
  const { startupControlsLocale } = require('../src/main/i18n');
  // Chromium's ar shows Arabic-Indic digits in native fields (Node's ICU does not, so this cannot be
  // checked with Intl here); the release QA suite checks the packaged app.
  assert.ok(LOCALES.every(l => !/^(?:ar|fa|ur|bn|mr|ne)\b/.test(l.chromium)), 'No Chromium locale whose native fields use other digits');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-controls-'));
  const save = (name, settings) => fs.writeFileSync(path.join(dir, name), JSON.stringify({ version: 1, tasks: [], notes: [], settings }));
  assert.equal(startupControlsLocale(dir), 'en-US', 'No data yet: the default language');
  save('data.json', { language: 'fr' });
  assert.equal(startupControlsLocale(dir), 'fr');
  save('data.json', { language: 'ar' });
  assert.equal(startupControlsLocale(dir), 'en-GB', 'Arabic uses a Chromium locale with digits 0-9');
  save('data.json', { sound: true });
  assert.equal(startupControlsLocale(dir), 'en-GB', 'Settings from before the language option were Arabic');
  fs.writeFileSync(path.join(dir, 'data.json'), '{ damaged');
  save('data.json.bak', { language: 'de' });
  assert.equal(startupControlsLocale(dir), 'de', 'The backup is read when the data file is damaged');
});
