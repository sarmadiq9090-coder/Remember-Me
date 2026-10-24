// Locale registry and message lookup shared by the windows (as a plain script) and the main
// process and tests (as a module). English is the source language: message keys are the English
// text, ui/locales/<code>.json holds the translations, and a missing entry falls back to English.
(function (root) {
  // name is the language's own name (endonym), as shown in the language picker.
  // chromium is the Chromium .pak kept in the packaged app for native strings in that language.
  const LOCALES = [
    { code: 'en', name: 'English', dir: 'ltr', intl: 'en-US', chromium: 'en-US', weekStart: 0 },
    { code: 'ar', name: 'العربية', dir: 'rtl', intl: 'ar-IQ', chromium: 'ar', weekStart: 6 },
    { code: 'es', name: 'Español', dir: 'ltr', intl: 'es-ES', chromium: 'es', weekStart: 1 },
    { code: 'fr', name: 'Français', dir: 'ltr', intl: 'fr-FR', chromium: 'fr', weekStart: 1 },
    { code: 'de', name: 'Deutsch', dir: 'ltr', intl: 'de-DE', chromium: 'de', weekStart: 1 },
    { code: 'pt-BR', name: 'Português (Brasil)', dir: 'ltr', intl: 'pt-BR', chromium: 'pt-BR', weekStart: 0 },
    { code: 'ru', name: 'Русский', dir: 'ltr', intl: 'ru-RU', chromium: 'ru', weekStart: 1 },
    { code: 'zh-CN', name: '中文 (简体)', dir: 'ltr', intl: 'zh-CN', chromium: 'zh-CN', weekStart: 1 },
    { code: 'ja', name: '日本語', dir: 'ltr', intl: 'ja-JP', chromium: 'ja', weekStart: 0 },
    { code: 'tr', name: 'Türkçe', dir: 'ltr', intl: 'tr-TR', chromium: 'tr', weekStart: 1 },
    { code: 'hi', name: 'हिन्दी', dir: 'ltr', intl: 'hi-IN', chromium: 'hi', weekStart: 0 },
    { code: 'id', name: 'Bahasa Indonesia', dir: 'ltr', intl: 'id-ID', chromium: 'id', weekStart: 1 },
  ];
  const DEFAULT = 'en';
  function findLocale(code) { return LOCALES.find(l => l.code === code) || LOCALES[0]; }
  function format(template, params) {
    return params ? String(template).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : String(template);
  }
  // A message is a string, or an object of plural forms (zero, one, two, few, many, other)
  // chosen by Intl.PluralRules for params.count. display formats numbers for the chosen digits.
  function translate(messages, fallback, intl, key, params, display = String) {
    let entry = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : fallback && Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key;
    if (entry && typeof entry === 'object') {
      const form = new Intl.PluralRules(intl).select(Number(params?.count) || 0);
      entry = entry[form] ?? entry.other ?? (typeof fallback?.[key] === 'object' ? fallback[key].other : key);
    }
    if (!params) return format(entry);
    const shown = {};
    for (const [name, value] of Object.entries(params)) shown[name] = typeof value === 'number' ? display(value) : value;
    return format(entry, shown);
  }
  // Wraps user text (a title, a file name) placed in a sentence in first-strong isolate marks, so its
  // own direction never reorders the punctuation around it, e.g. "Call Bob!" in an Arabic sentence.
  const FSI = String.fromCharCode(0x2068), PDI = String.fromCharCode(0x2069);
  function isolate(text) { return FSI + String(text ?? '') + PDI; }
  const api = { LOCALES, DEFAULT, findLocale, format, translate, isolate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, { LOCALES, findLocale, translate, isolate });
})(this);
