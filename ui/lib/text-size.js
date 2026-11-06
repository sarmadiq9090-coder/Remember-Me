// Text size (Settings → Appearance, and Ctrl+= / Ctrl+- / Ctrl+0 in every window). The saved size is a
// percentage; the pages show it as data-text-size on <html>, which sets --text-scale (styles.css), and every
// font size is multiplied by it. Loaded as a plain script by the three pages, and required as a module by
// src/core/tasks.js, the settings handler, src/main/windows.js and the tests.
(function (root) {
  const TEXT_SIZES = [100, 115, 130, 150];
  const DEFAULT_TEXT_SIZE = 100;
  // A saved or sent size, or the default for anything else.
  function normalizeTextSize(value) { return TEXT_SIZES.includes(value) ? value : DEFAULT_TEXT_SIZE; }
  // The size after Ctrl+= (step 1), Ctrl+- (step -1) or Ctrl+0 (step 0), kept within the list.
  function stepTextSize(current, step) {
    if (step === 0) return DEFAULT_TEXT_SIZE;
    const index = TEXT_SIZES.indexOf(normalizeTextSize(current)) + Math.sign(step);
    return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, index))];
  }
  // Electron's before-input-event input (or a keydown event): 1, -1 or 0 for the text size shortcuts,
  // null for anything else. Ctrl+Shift+= types "+", and the number pad keys work too.
  function textSizeStep(input) {
    const control = input.control ?? input.ctrlKey, alt = input.alt ?? input.altKey, meta = input.meta ?? input.metaKey;
    if (!control || alt || meta || (input.type && input.type !== 'keyDown')) return null;
    const { key, code } = input;
    if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') return 1;
    if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') return -1;
    if (key === '0' || code === 'Digit0' || code === 'Numpad0') return 0;
    return null;
  }
  // A window's size grown with the text, so the alert and quick-add windows still fit their content;
  // src/core/placement.js keeps the result inside the screen's work area.
  function scaledSize(size, textSize) {
    const scale = normalizeTextSize(textSize) / 100;
    return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  }
  function applyTextSize(textSize) { root.document.documentElement.dataset.textSize = String(normalizeTextSize(textSize)); }
  const api = { TEXT_SIZES, DEFAULT_TEXT_SIZE, normalizeTextSize, stepTextSize, textSizeStep, scaledSize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { Object.assign(root, { TEXT_SIZES, DEFAULT_TEXT_SIZE, normalizeTextSize, stepTextSize, textSizeStep, scaledSize, applyTextSize }); applyTextSize(root.waqt?.textSize); }
})(this);
