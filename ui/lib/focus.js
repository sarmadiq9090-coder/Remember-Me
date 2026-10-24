// Keeps keyboard focus when a block of the main window is rebuilt from markup. The focused control is
// remembered by its id, or by its row (the block's child that holds it, matched by data-id or else by
// position) plus its tag, data-* attributes and classes. After the rebuild the same control in the same row
// takes focus. If the row is gone, the matching control in the row now in its place does (the next task after
// a completed one), and failing that the fallback, so focus never drops to <body>.
const markups = new WeakMap();
function focusSignature(el) { return [el.localName, ...[...el.attributes].filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value}`).sort()].join(' '); }
function focusLook(el) { return [el.localName, ...[...el.classList].sort()].join(' '); }
function focusable(el) { return el.tabIndex >= 0 && !el.disabled && !el.hidden; }
function descendants(el) { return [el, ...[...el.children].flatMap(descendants)]; }
function focusKey(root) {
  const el = document.activeElement;
  if (!root || !el || el === root || !root.contains(el)) return null;
  if (el.id) return { id: el.id };
  let row = el;
  while (row.parentElement !== root) row = row.parentElement;
  return { root, rowId: row.dataset.id, index: [...root.children].indexOf(row), signature: focusSignature(el), look: focusLook(el) };
}
// Acts only when focus was lost (it is on <body>), so it never moves focus the user has placed elsewhere.
function restoreFocus(key, fallback) {
  const active = document.activeElement;
  if (!key || (active && active !== document.body && active.isConnected)) return;
  let target = key.id ? document.getElementById(key.id) : null;
  if (key.root) {
    const rows = [...key.root.children];
    const row = (key.rowId && rows.find(r => r.dataset.id === key.rowId)) || rows[Math.min(key.index, rows.length - 1)];
    const candidates = row ? descendants(row).filter(focusable) : [];
    // Rows without an id (weekdays, tag filters) are found by the control's own attributes first, wherever it moved.
    target = (!key.rowId && descendants(key.root).find(el => focusable(el) && focusSignature(el) === key.signature))
      || candidates.find(el => focusSignature(el) === key.signature) || candidates.find(el => focusLook(el) === key.look) || candidates[0];
  }
  (target && focusable(target) ? target : fallback)?.focus({ preventScroll: true });
}
// Rebuilds a block and puts focus back where it was.
function replaceMarkup(el, html, fallback) {
  const key = focusKey(el);
  el.innerHTML = html; markups.set(el, html); el.dataset.rebuilt = '';
  hydrateIcons(el);
  restoreFocus(key, fallback);
}
// The same, but only when the markup changed: the 30-second refresh then leaves an unchanged list alone.
function setMarkup(el, html, fallback) { if (markups.get(el) !== html) replaceMarkup(el, html, fallback); }
// Where focus is now, if a rebuild could replace it: dialogs and the Undo toast return there afterwards.
function focusMark() { return focusKey(document.activeElement?.closest?.('[data-rebuilt]')); }
// A dialog gives focus back to the control that opened it, or to that control's replacement after a refresh.
function showDialog(dialog) { dialog.returnFocus = focusMark(); dialog.showModal(); }
// When the opener is gone, focus is left on a control inside the closed dialog; that counts as lost.
document.addEventListener('close', e => {
  if (e.target.localName !== 'dialog') return;
  if (e.target.contains(document.activeElement)) document.activeElement.blur();
  restoreFocus(e.target.returnFocus);
}, true);
