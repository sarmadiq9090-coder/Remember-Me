// Locale registry and message lookup shared by the windows (as a plain script) and the main
// process and tests (as a module). English is the source language: message keys are the English
// text, ui/locales/<code>.json holds the translations, and a missing entry falls back to English.
(function (root) {
  // name is the language's own name (endonym), as shown in the language picker.
  // chromium is the locale Chromium starts with (its .pak is kept in the packaged app). It sets how
  // native date, time and number fields look. Chromium's Arabic always shows Arabic-Indic digits
  // there (it turns ar-u-nu-latn and ar-MA back into ar), so Arabic uses en-GB: digits 0-9 and
  // day/month order, like the rest of the app.
  const LOCALES = [
    { code: 'en', name: 'English', dir: 'ltr', intl: 'en-US', chromium: 'en-US', weekStart: 0 },
    { code: 'ar', name: 'العربية', dir: 'rtl', intl: 'ar-IQ', chromium: 'en-GB', weekStart: 6 },
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
  // The interface language for a fresh install: the first of Windows' preferred languages (BCP 47
  // tags, most preferred first, e.g. 'ar-IQ', 'zh-Hans-CN', 'es-419') that the app has, else English.
  // A language matches by its main part ('ar-SA' is Arabic); Portuguese is pt-BR, and Chinese only in
  // Simplified script (Traditional moves on to the next preferred language).
  function matchLocale(tags) {
    for (const tag of Array.isArray(tags) ? tags : [tags]) {
      if (typeof tag !== 'string') continue;
      const [language, ...rest] = tag.trim().toLowerCase().split(/[-_]/);
      if (language === 'pt') return 'pt-BR';
      if (language === 'zh') {
        if (rest.includes('hant') || (!rest.includes('hans') && rest.some(part => ['tw', 'hk', 'mo'].includes(part)))) continue;
        return 'zh-CN';
      }
      const found = LOCALES.find(l => l.code === language);
      if (found) return found.code;
    }
    return DEFAULT;
  }
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
  // Arabic month names differ by country: Iraq and the Levant say «تشرين الثاني», Egypt and the Gulf «نوفمبر».
  // months is 'levant', 'standard' or 'auto' (from the Windows region); digits is 'latn' (0-9, the default) or
  // 'arab' (Arabic-Indic, the Arabic interface only). Returns the locale every date, time and count uses.
  const LEVANT_REGIONS = ['IQ', 'SY', 'LB', 'JO', 'PS'];
  const ARABIC_MONTHS = ['auto', 'levant', 'standard'], DIGITS = ['latn', 'arab'];
  // The region of a BCP 47 tag ('en-IQ', 'ar-Arab-IQ', 'ar_SY'), or '' when it has none.
  function regionOf(tag) {
    const part = String(tag ?? '').split(/[-_]/).slice(1).find(p => /^[A-Za-z]{2}$/.test(p));
    return part ? part.toUpperCase() : '';
  }
  function levantMonths(months, region) { return months === 'levant' || (months !== 'standard' && LEVANT_REGIONS.includes(String(region || '').toUpperCase())); }
  function dateLocale(code, { months = 'auto', digits = 'latn', region = '' } = {}) {
    const locale = findLocale(code);
    if (locale.code !== 'ar') return locale.intl + '-u-nu-latn';
    return (levantMonths(months, region) ? 'ar-IQ' : 'ar-EG') + '-u-nu-' + (digits === 'arab' ? 'arab' : 'latn');
  }
  // Wraps user text (a title, a file name) placed in a sentence in first-strong isolate marks, so its
  // own direction never reorders the punctuation around it, e.g. "Call Bob!" in an Arabic sentence.
  const FSI = String.fromCharCode(0x2068), PDI = String.fromCharCode(0x2069);
  function isolate(text) { return FSI + String(text ?? '') + PDI; }
  // A file size in the locale's own unit names and decimal mark, e.g. "1,5 MB" in German.
  function formatSize(bytes, intl) {
    const [value, unit] = bytes < 1024 ? [bytes, 'byte'] : bytes < 1048576 ? [bytes / 1024, 'kilobyte'] : [bytes / 1048576, 'megabyte'];
    return new Intl.NumberFormat(intl, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
  }
  const api = { LOCALES, DEFAULT, ARABIC_MONTHS, DIGITS, LEVANT_REGIONS, findLocale, matchLocale, regionOf, dateLocale, format, translate, isolate, formatSize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, { LOCALES, findLocale, translate, isolate, formatSize });
})(this);
