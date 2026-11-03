// Quick add from anywhere (issue #82): the global shortcut and the optional due time. Loaded as a plain
// script by index.html (Settings) and quickadd.html, and required as a module by src/core/tasks.js,
// the settings handler and the tests.
(function (root) {
  const DEFAULT_QUICK_ADD_SHORTCUT = 'Ctrl+Alt+R';
  const MODIFIERS = ['Ctrl', 'Alt', 'Shift'];
  const KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space)$/;
  // A shortcut as Electron's accelerator, in a fixed order: "Ctrl+Alt+R". It needs two of Ctrl, Alt
  // and Shift (one of them Ctrl or Alt) and a letter, digit, F1-F12 or Space, so it never takes a plain
  // key, a capital letter, Ctrl+C-style shortcuts every app uses, or this app's own Ctrl+N and Ctrl+K.
  // Returns null for anything else.
  function normalizeAccelerator(value) {
    if (typeof value !== 'string' || value.length > 40) return null;
    const parts = value.split('+').map(part => part.trim()), key = parts.pop()?.toUpperCase().replace(/^SPACE$/, 'Space');
    const mods = parts.map(part => ({ control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }[part.toLowerCase()]));
    if (!key || !KEY.test(key) || mods.some(mod => !mod) || new Set(mods).size !== mods.length) return null;
    if (mods.length < 2 || !(mods.includes('Ctrl') || mods.includes('Alt'))) return null;
    return [...MODIFIERS.filter(mod => mods.includes(mod)), key].join('+');
  }
  // The shortcut a keydown event spells, by physical key (e.code), so it works in any keyboard layout.
  // null while only modifiers are held, for keys a shortcut can't use, or with the Windows key.
  function acceleratorFromKey(event) {
    if (!event || event.metaKey) return null;
    const code = String(event.code || ''), key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) || code === 'Space' ? code : '';
    if (!key) return null;
    return normalizeAccelerator([event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+'));
  }
  // The due time for a typed "HH:MM": today, or tomorrow when that time has passed. Empty means no due time.
  function quickAddDueAt(time, now = new Date()) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    const at = day => new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, Number(match[1]), Number(match[2]));
    const today = at(0);
    return (today > now ? today : at(1)).toISOString();
  }
  const api = { DEFAULT_QUICK_ADD_SHORTCUT, normalizeAccelerator, acceleratorFromKey, quickAddDueAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, { DEFAULT_QUICK_ADD_SHORTCUT, normalizeAccelerator, acceleratorFromKey, quickAddDueAt });
})(this);
