const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// ui/lib/focus.js keeps keyboard focus when a list is rebuilt (QC R24, R26). It only walks elements, so a small
// stand-in for the DOM is enough: elements with attributes, children, tabIndex and focus().
class Element {
  constructor(localName, attrs = {}, children = []) {
    Object.assign(this, { localName, attrs, children: [], parentElement: null, hidden: false, disabled: 'disabled' in attrs });
    for (const child of children) this.append(child);
  }
  append(child) { child.parentElement = this; this.children.push(child); }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get classList() { return (this.attrs.class || '').split(' ').filter(Boolean); }
  get id() { return this.attrs.id || ''; }
  get dataset() { return Object.fromEntries(Object.entries(this.attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v])); }
  get tabIndex() { return 'tabindex' in this.attrs ? Number(this.attrs.tabindex) : ['button', 'input'].includes(this.localName) ? 0 : -1; }
  get isConnected() { return document.body.contains(this); }
  contains(el) { for (; el; el = el.parentElement) if (el === this) return true; return false; }
  closest() { return null; }
  focus() { document.activeElement = this; }
}
const document = { body: new Element('body'), activeElement: null, addEventListener() {}, getElementById: id => all(document.body).find(el => el.id === id) || null };
const all = el => [el, ...el.children.flatMap(all)];
const context = vm.createContext({ document });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/lib/focus.js'), 'utf8'), context);
const { focusKey, restoreFocus } = context;

// A task row: complete check, edit target, edit and delete buttons.
const row = id => new Element('article', { class: 'task-row', 'data-id': id }, [
  new Element('button', { class: 'task-check', 'data-action': 'complete' }),
  new Element('div', { class: 'task-edit-target', 'data-action': 'edit', tabindex: '0' }),
  new Element('div', { class: 'task-actions' }, [new Element('button', { class: 'icon-button', 'data-action': 'edit' }), new Element('button', { class: 'icon-button', 'data-action': 'delete' })]),
]);
const fallback = new Element('h1', { id: 'page-title', tabindex: '-1' });
// Builds a list, focuses a control in it, then "rebuilds" it with new elements, as innerHTML does.
function rebuild(before, after, pick) {
  const list = new Element('div', { id: 'task-list' }, before);
  document.body = new Element('body', {}, [fallback, list]);
  pick(list).focus();
  const key = focusKey(list);
  list.children = []; for (const el of after) list.append(el);
  document.activeElement = document.body;
  restoreFocus(key, fallback);
  return document.activeElement;
}
const rowOf = el => { for (; el; el = el.parentElement) if (el.attrs['data-id']) return el; return null; };
const describe = el => [rowOf(el)?.attrs['data-id'] ?? null, el.localName, el.attrs['data-action'] || el.attrs.class];

test('the same control in the same task keeps focus after a rebuild', () => {
  const focused = rebuild([row('a'), row('b'), row('c')], [row('c'), row('a'), row('b')], list => list.children[1].children[2].children[1]);
  assert.deepEqual(describe(focused), ['b', 'button', 'delete']);
  // The edit target and the edit button share data-action but are different controls.
  assert.deepEqual(describe(rebuild([row('a')], [row('a')], list => list.children[0].children[1])), ['a', 'div', 'edit']);
});

test('when the task is gone, the same control of the task now in its place takes focus', () => {
  assert.deepEqual(describe(rebuild([row('a'), row('b'), row('c')], [row('a'), row('c')], list => list.children[1].children[0])), ['c', 'button', 'complete']);
  assert.deepEqual(describe(rebuild([row('a'), row('b')], [row('a')], list => list.children[1].children[0])), ['a', 'button', 'complete'], 'The last task falls back to the one before');
  assert.equal(rebuild([row('a')], [], list => list.children[0].children[0]), fallback, 'An empty list focuses the fallback');
});

test('rows without ids are matched by the control, wherever it moved', () => {
  const day = (d, pressed) => new Element('button', { 'data-day': String(d), 'aria-pressed': String(pressed) });
  const focused = rebuild([0, 1, 2].map(d => day(d, false)), [2, 0, 1].map(d => day(d, d === 1)), list => list.children[1]);
  assert.equal(focused.attrs['data-day'], '1');
  // A removed attachment: the next file's remove button, matched by its classes.
  const file = id => new Element('div', { class: 'attachment-item' }, [new Element('button', { class: 'attachment-open', 'data-file-id': id }), new Element('button', { class: 'attachment-remove icon-button', 'data-remove-file': id })]);
  const next = rebuild([file('x'), file('y')], [file('y')], list => list.children[0].children[1]);
  assert.deepEqual([next.attrs.class, next.attrs['data-remove-file']], ['attachment-remove icon-button', 'y']);
});

test('focus the user moved elsewhere is left alone, and disabled controls are skipped', () => {
  const list = new Element('div', {}, [row('a')]), other = new Element('button', { id: 'search' });
  document.body = new Element('body', {}, [list, other]);
  list.children[0].children[0].focus();
  const key = focusKey(list);
  other.focus(); restoreFocus(key, fallback);
  assert.equal(document.activeElement, other);
  const busy = row('a'); busy.children[0].disabled = true;
  assert.deepEqual(describe(rebuild([row('a')], [busy], l => l.children[0].children[0])), ['a', 'div', 'edit']);
  assert.equal(focusKey(new Element('div')), null, 'No key when focus is outside the block');
});
