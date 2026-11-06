'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { LOCALES, DEFAULT: DEFAULT_LOCALE, findLocale, matchLocale, regionOf, dateLocale: localeFor, translate } = require('../../ui/lib/translate');
const { validateState } = require('../core/tasks');

// The main process's interface text (tray, dialogs, notifications, errors), in the saved language.
// look() returns { months, region }: the saved Arabic month names and the Windows region.
function createI18n(savedLanguage, look = () => ({})) {
  function language() { const code = savedLanguage(); return LOCALES.some(l => l.code === code) ? code : DEFAULT_LOCALE; }
  // The locale for dates, times and counts, the same the windows use: Western digits (0-9) always, in
  // Arabic too, so the layout never shifts, and Arabic month names by region.
  function dateLocale() { return localeFor(language(), look()); }
  const localeTag = dateLocale;
  // Interface text comes from ui/locales/<code>.json, read once per language; English is the fallback.
  const messageCache = new Map();
  function messages(code) {
    if (!messageCache.has(code)) {
      let data = {};
      try { data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ui/locales', code + '.json'), 'utf8')); } catch (error) { console.error('Locale ' + code + ' could not be read:', error.message); }
      messageCache.set(code, data);
    }
    return messageCache.get(code);
  }
  function tr(key, params) { const code = language(); return translate(messages(code), messages(DEFAULT_LOCALE), findLocale(code).intl, key, params, n => n.toLocaleString(localeTag())); }
  // Errors from the data modules are English; known ones are shown in the interface language.
  function errorText(error) { return error?.key ? tr(error.key, error.params) : tr(String(error?.message || error)); }
  return { language, localeTag, dateLocale, messages, tr, errorText };
}
// The language a fresh install starts in: the first of Windows' preferred languages that the app has,
// else English. app.getPreferredSystemLanguages() reads Windows' own list (Settings > Time & language),
// works before ready and, unlike app.getLocale(), is not changed by the --lang switch the app sets.
function systemLanguage(app) {
  let tags = [];
  try { tags = app.getPreferredSystemLanguages(); } catch { /* not available: English */ }
  return matchLocale(tags);
}
// The Windows region ('IQ', 'SA'…), for the Arabic month names: from the regional format (getSystemLocale,
// after ready), else from the preferred languages ('ar-IQ'). '' when neither has one.
function systemRegion(app) {
  const tags = [];
  try { tags.push(app.getSystemLocale()); } catch { /* before ready, or not available */ }
  try { tags.push(...app.getPreferredSystemLanguages()); } catch { /* not available */ }
  for (const tag of tags) { const region = regionOf(tag); if (region) return region; }
  return '';
}
// The Chromium locale for the language saved in the data folder, read before the app is ready:
// Chromium takes its locale only at startup, and it decides how native date, time and number
// fields look. A missing or unreadable file means the fresh-install language, as the Store would load.
function startupControlsLocale(folder, firstRunLanguage = DEFAULT_LOCALE) {
  for (const name of ['data.json', 'data.json.bak']) {
    try { return findLocale(validateState(JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'))).settings.language).chromium; } catch { /* try the next */ }
  }
  return findLocale(firstRunLanguage).chromium;
}
module.exports = { createI18n, systemLanguage, systemRegion, startupControlsLocale };
