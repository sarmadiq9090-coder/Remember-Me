const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Loads the browser scripts that format dates, the way index.html and alert.html do.
function loadUi(language) {
  const context = vm.createContext({ document: { querySelectorAll: () => [], documentElement: { dataset: {} } } });
  for (const file of ['i18n.js', 'shared.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui', file), 'utf8'), context, { filename: file });
  vm.runInContext(`uiLanguage = ${JSON.stringify(language)};`, context);
  return code => vm.runInContext(code, context);
}
// Arabic-Indic (U+0660-U+0669) and Extended Arabic-Indic (U+06F0-U+06F9) digits.
const easternDigits = /[٠-٩۰-۹]/;

test('dates, times and counts use Western digits in Arabic as well as English', () => {
  for (const language of ['ar', 'en']) {
    const run = loadUi(language);
    const labels = run(`[
      timeLabel(new Date(2026, 9, 24, 21, 5)), dateLabel(new Date(2027, 1, 14, 21, 5).toISOString()), dateLabel(new Date().toISOString()),
      new Date(2026, 11, 31).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), num(1234)
    ]`);
    for (const label of labels) {
      assert.doesNotMatch(label, easternDigits, `${language}: ${label}`);
      assert.match(label, /[0-9]/, `${language}: ${label}`);
    }
  }
  const arabic = loadUi('ar');
  assert.match(arabic('timeLabel(new Date(2026, 9, 24, 21, 5))'), /9:05/);
  assert.match(arabic(`dateLabel(new Date(2027, 1, 14, 21, 5).toISOString())`), /14/);
  assert.equal(arabic('locale()'), 'ar-IQ-u-nu-latn');
});
