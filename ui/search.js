// Search matching that ignores Arabic diacritics, tatweel and common spelling variants.
// Loaded as a plain script in the UI and required as a module by the tests.
(function (root) {
  const char = code => String.fromCharCode(code);
  const range = (from, to) => char(from) + '-' + char(to);
  // Harakat and Quranic marks, superscript alef, and tatweel.
  const marks = new RegExp('[' + range(0x0610, 0x061a) + range(0x064b, 0x065f) + char(0x0670) + range(0x06d6, 0x06ed) + char(0x0640) + ']', 'g');
  const variants = [
    [new RegExp('[' + char(0x0622) + char(0x0623) + char(0x0625) + char(0x0671) + ']', 'g'), char(0x0627)], // آ أ إ ٱ → ا
    [new RegExp(char(0x0629), 'g'), char(0x0647)], // ة → ه
    [new RegExp('[' + char(0x0649) + char(0x0626) + ']', 'g'), char(0x064a)], // ى ئ → ي
    [new RegExp(char(0x0624), 'g'), char(0x0648)], // ؤ → و
  ];
  function normalizeSearch(text) {
    let value = String(text ?? '').normalize('NFKC').toLowerCase().replace(marks, '');
    for (const [pattern, replacement] of variants) value = value.replace(pattern, replacement);
    return value.replace(/\s+/g, ' ').trim();
  }
  const cache = new WeakMap();
  // True when every word of the query appears in the item's title or body.
  function matchesSearch(item, query) {
    const words = normalizeSearch(query).split(' ').filter(Boolean);
    if (!words.length) return true;
    let text = cache.get(item);
    if (text === undefined) { text = normalizeSearch(item.title + ' ' + (item.body || '')); cache.set(item, text); }
    return words.every(word => text.includes(word));
  }
  if (typeof module === 'object' && module.exports) module.exports = { normalizeSearch, matchesSearch };
  else Object.assign(root, { normalizeSearch, matchesSearch });
})(this);
