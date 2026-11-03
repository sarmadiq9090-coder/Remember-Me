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

// Translations are plain text. The pages escape them (esc(tr(…)), enforced by eslint.config.cjs) or set
// them as textContent, and a < or > is refused here too, so a translation can never carry markup or a
// script. A key that ever needs emphasis goes on this list, and the page builds that markup from nodes
// (like "Due {when}" in the alert).
const MARKUP_KEYS = [];
test('no translation contains < or >, apart from the keys listed in MARKUP_KEYS', () => {
  const found = [];
  for (const { code } of LOCALES) {
    for (const [key, value] of Object.entries(loadLocale(code))) {
      if (MARKUP_KEYS.includes(key)) continue;
      const texts = [key, ...(value && typeof value === 'object' ? Object.values(value) : [value])];
      if (texts.some(text => /[<>]/.test(String(text)))) found.push(`${code}: "${key}"`);
    }
  }
  assert.deepEqual(found, []);
  assert.deepEqual(MARKUP_KEYS.filter(key => !(key in en)), [], 'MARKUP_KEYS lists only keys the app uses');
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
  assert.equal(initialState('ar').settings.language, 'ar', 'A fresh install can start in the system language');
  for (const code of ['xx', 'EN', 'ar-IQ', 5, null]) assert.equal(initialState(code).settings.language, 'en', String(code));
  const v140 = { version: 1, tasks: [], notes: [], attachments: [], settings: { sound: true, startAtLogin: false, alertSide: 'right', language: 'ar' } };
  assert.equal(validateState(structuredClone(v140)).settings.language, 'ar', 'A v1.4.0 file keeps Arabic');
  for (const code of ['en', 'fr', 'zh-CN', 'pt-BR']) assert.equal(validateState({ ...structuredClone(v140), settings: { ...v140.settings, language: code } }).settings.language, code);
  for (const code of ['xx', 'EN', 'ku', 5, null]) assert.equal(validateState({ ...structuredClone(v140), settings: { ...v140.settings, language: code } }).settings.language, 'en', String(code));
  const older = { ...v140.settings }; delete older.language;
  assert.equal(validateState({ ...structuredClone(v140), settings: older }).settings.language, 'ar', 'Settings from before the language option were Arabic');
  assert.equal(validateState({ ...structuredClone(v140), settings: 'broken' }).settings.language, 'en');
});

test('a fresh install picks the first of Windows\' preferred languages that the app has, else English', () => {
  const { matchLocale } = require('../ui/lib/translate');
  assert.equal(matchLocale([]), 'en');
  assert.equal(matchLocale(undefined), 'en');
  assert.equal(matchLocale(['en-US']), 'en');
  assert.equal(matchLocale(['ar-IQ', 'en-US']), 'ar');
  assert.equal(matchLocale(['ar']), 'ar');
  assert.equal(matchLocale(['ar-SA']), 'ar');
  assert.equal(matchLocale(['en-GB', 'ar-IQ']), 'en', 'The most preferred language wins');
  assert.equal(matchLocale(['ku-Arab-IQ', 'ar-IQ', 'en-US']), 'ar', 'A language the app lacks moves on to the next');
  assert.equal(matchLocale(['ku-IQ', 'fa-IR']), 'en', 'None of them: English');
  assert.deepEqual(['es-419', 'es-ES', 'fr-CA', 'de-AT', 'ru-RU', 'ja-JP', 'tr-TR', 'hi-IN', 'id-ID'].map(tag => matchLocale([tag])), ['es', 'es', 'fr', 'de', 'ru', 'ja', 'tr', 'hi', 'id']);
  assert.equal(matchLocale(['pt-BR']), 'pt-BR');
  assert.equal(matchLocale(['pt-PT']), 'pt-BR', 'Portuguese is Brazilian Portuguese');
  assert.equal(matchLocale(['pt']), 'pt-BR');
  for (const tag of ['zh-CN', 'zh-Hans-CN', 'zh-Hans', 'zh-SG', 'zh', 'zh-Hans-HK', 'ZH_cn']) assert.equal(matchLocale([tag]), 'zh-CN', tag);
  for (const tag of ['zh-TW', 'zh-Hant-TW', 'zh-HK', 'zh-Hant', 'zh-MO']) assert.equal(matchLocale([tag]), 'en', tag + ': Traditional Chinese is not Simplified');
  assert.equal(matchLocale(['zh-Hant-TW', 'ja-JP']), 'ja');
  assert.equal(matchLocale([' AR-iq ']), 'ar', 'Case and spaces do not matter');
  assert.equal(matchLocale([null, 5, '', 'fr-FR']), 'fr', 'Entries that are not tags are skipped');
  assert.equal(matchLocale('de-DE'), 'de', 'A single tag works too');
  for (const { code } of LOCALES) assert.equal(matchLocale([code]), code, 'Every shipped code matches itself');
});

test('the system language comes from Electron\'s preferred system languages, and reaches a fresh data folder only', () => {
  const os = require('node:os');
  const { systemLanguage, startupControlsLocale } = require('../src/main/i18n');
  const { Store } = require('../src/core/store');
  assert.equal(systemLanguage({ getPreferredSystemLanguages: () => ['ar-IQ', 'en-US'] }), 'ar');
  assert.equal(systemLanguage({ getPreferredSystemLanguages: () => ['fr-CA', 'en-US'] }), 'fr');
  assert.equal(systemLanguage({ getPreferredSystemLanguages: () => [] }), 'en');
  assert.equal(systemLanguage({ getPreferredSystemLanguages: () => { throw new Error('unavailable'); } }), 'en');
  assert.equal(systemLanguage({}), 'en', 'An Electron without the API: English');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-first-run-'));
  assert.equal(new Store(dir, { language: 'ar' }).state.settings.language, 'ar', 'A fresh install starts in the system language');
  assert.equal(new Store(dir).state.settings.language, 'en', 'Without one, English');
  assert.equal(startupControlsLocale(dir, 'fr'), 'fr', 'Native fields of a fresh install follow the system language too');
  const store = new Store(dir, { language: 'de' });
  store.change(state => { state.settings.language = 'en'; });
  assert.equal(new Store(dir, { language: 'ar' }).state.settings.language, 'en', 'A saved language is never replaced by the system one');
  assert.equal(startupControlsLocale(dir, 'ar'), 'en-US');
  store.change(state => { state.settings.language = 'ja'; });
  assert.equal(new Store(dir, { language: 'ar' }).state.settings.language, 'ja');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Arabic month names follow the Windows region unless chosen, and digits are Western unless Arabic-Indic were chosen', () => {
  const { dateLocale, regionOf, LEVANT_REGIONS } = require('../ui/lib/translate');
  const { systemRegion, createI18n } = require('../src/main/i18n');
  assert.deepEqual(LEVANT_REGIONS, ['IQ', 'SY', 'LB', 'JO', 'PS']);
  for (const region of ['IQ', 'SY', 'LB', 'JO', 'iq']) assert.equal(dateLocale('ar', { region }), 'ar-IQ-u-nu-latn', region);
  for (const region of ['SA', 'AE', 'KW', 'EG', 'MA', 'US', '']) assert.equal(dateLocale('ar', { region }), 'ar-EG-u-nu-latn', region || 'no region');
  assert.equal(dateLocale('ar', { months: 'standard', region: 'IQ' }), 'ar-EG-u-nu-latn', 'A choice beats the region');
  assert.equal(dateLocale('ar', { months: 'levant', region: 'SA' }), 'ar-IQ-u-nu-latn');
  assert.equal(dateLocale('ar', { digits: 'arab', region: 'IQ' }), 'ar-IQ-u-nu-arab');
  assert.equal(dateLocale('ar', { digits: 'roman' }), 'ar-EG-u-nu-latn');
  for (const { code, intl } of LOCALES.slice(2)) assert.equal(dateLocale(code, { months: 'levant', digits: 'arab', region: 'IQ' }), intl + '-u-nu-latn', 'Other languages are unchanged');
  const month = tag => new Date(2026, 10, 3).toLocaleDateString(tag, { month: 'long' });
  assert.equal(month(dateLocale('ar', { region: 'IQ' })), 'تشرين الثاني');
  assert.equal(month(dateLocale('ar', { region: 'SA' })), 'نوفمبر');
  assert.deepEqual(['en-IQ', 'ar-Arab-SY', 'ar_LB', 'ar', 'zh-Hans', '', null].map(regionOf), ['IQ', 'SY', 'LB', '', '', '', '']);
  assert.equal(systemRegion({ getSystemLocale: () => 'en-IQ', getPreferredSystemLanguages: () => ['en-US'] }), 'IQ', 'The regional format first');
  assert.equal(systemRegion({ getSystemLocale: () => { throw new Error('not ready'); }, getPreferredSystemLanguages: () => ['ar-JO'] }), 'JO');
  assert.equal(systemRegion({ getSystemLocale: () => 'ar', getPreferredSystemLanguages: () => ['ar'] }), '');
  assert.equal(systemRegion({}), '');
  const settings = { language: 'ar', arabicMonths: 'auto', digits: 'latn' };
  const i18n = createI18n(() => settings.language, () => ({ months: settings.arabicMonths, digits: settings.digits, region: 'IQ' }));
  assert.equal(i18n.localeTag(), 'ar-IQ-u-nu-latn');
  settings.digits = 'arab';
  assert.equal(i18n.tr('{count} items', { count: 12 }), '١٢ items', 'Counts in main-process text follow the digits too');
  assert.equal(createI18n(() => 'ar').localeTag(), 'ar-EG-u-nu-latn', 'No region known: standard month names');
});

test('user text in a sentence is isolated, so its direction cannot reorder the punctuation around it', () => {
  const { translate, isolate } = require('../ui/lib/translate');
  const ar = { 'Completed "{title}"': 'أُنجزت «{title}»' };
  const text = translate(ar, {}, 'ar', 'Completed "{title}"', { title: isolate('Call Bob!') });
  assert.equal(text, 'أُنجزت «' + String.fromCharCode(0x2068) + 'Call Bob!' + String.fromCharCode(0x2069) + '»');
  assert.equal(isolate(undefined), String.fromCharCode(0x2068, 0x2069));
});

test('file sizes use the unit names and decimal mark of the locale, with Western digits', () => {
  const { formatSize } = require('../ui/lib/translate');
  assert.equal(formatSize(1572864, 'en-US-u-nu-latn'), '1.5 MB');
  assert.equal(formatSize(1572864, 'de-DE-u-nu-latn'), '1,5 MB');
  assert.equal(formatSize(1536, 'fr-FR-u-nu-latn').replace(/\s/g, ' '), '1,5 ko');
  assert.match(formatSize(1572864, 'ru-RU-u-nu-latn'), /^1,5\sМБ$/);
  assert.match(formatSize(5, 'ar-IQ-u-nu-latn'), /^5 /);
  assert.doesNotMatch(formatSize(1572864, 'ar-IQ-u-nu-latn'), /[٠-٩]/);
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
