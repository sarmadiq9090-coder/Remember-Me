'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { LOCALES, DEFAULT: DEFAULT_LOCALE, findLocale, translate } = require('../../ui/lib/translate');

// The main process's interface text (tray, dialogs, notifications, errors), in the saved language.
function createI18n(savedLanguage) {
  function language() { const code = savedLanguage(); return LOCALES.some(l => l.code === code) ? code : DEFAULT_LOCALE; }
  // The same locale the windows use, including a chosen digit style.
  // Dates and times always use Western digits (0-9), in Arabic too, so the layout never shifts.
  function localeTag() { return findLocale(language()).intl + '-u-nu-latn'; }
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
  return { language, localeTag, messages, tr, errorText };
}
module.exports = { createI18n };
