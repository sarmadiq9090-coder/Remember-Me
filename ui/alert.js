// The sticky reminder window: one reminder at a time from the queue, with Done, snooze presets,
// Skip for repeats, Snooze all and Open task. Every action carries the due time that was shown,
// so the main process ignores it if that occurrence was already handled.
let tasks = [], index = 0, shownId = null, busy = false;
const $ = id => document.getElementById(id);
const MARK = String.fromCharCode(1);
const current = () => tasks[index];
const repeating = task => !!task && task.id !== '__preview' && task.repeat && task.repeat !== 'none';
async function refreshAlert() {
  try {
    await setLanguage(await api('language'));
    tasks = await api('alerts');
    // After the last Done the window stays briefly so it can be undone; show that instead of an empty card.
    document.body.classList.toggle('all-done', !tasks.length);
    $('alert-all-done').hidden = !!tasks.length;
    if (!tasks.length) { shownId = null; return; }
    const kept = tasks.findIndex(t => t.id === shownId);
    index = kept >= 0 ? kept : Math.min(index, tasks.length - 1);
    render();
  } catch (e) { $('alert-error').textContent = e.message; }
}
function whenText(iso, now) { return tr('{day}, {time}', dueWhen(iso, now, locale())); }
// Renders the shown reminder. Labels are rebuilt each time so they follow the language and the clock.
function render() {
  const task = current(); if (!task) return;
  const now = new Date(), intl = locale(), changed = task.id !== shownId;
  shownId = task.id;
  const overdue = task.id !== '__preview' && isOverdue(task.dueAt, now);
  $('alert-shell').classList.toggle('overdue', overdue);
  $('alert-queue').hidden = tasks.length < 2;
  $('alert-position').textContent = tr('{index} of {count}', { index: index + 1, count: tasks.length });
  const chips = [];
  if (task.id === '__preview') chips.push(['', tr('Alert preview • no real reminder is created')]);
  else chips.push(overdue ? ['red', tr('Overdue · {age}', { age: overdueAge(task.dueAt, now, intl) })] : ['', tr('Due now')]);
  if (task.priority === 'high') chips.push(['amber', tr('High priority')]);
  else if (task.priority === 'medium') chips.push(['amber', tr('Medium')]);
  if (repeating(task)) chips.push(['', '↻ ' + repeatLabel(task)]);
  if (task.snoozeCount) chips.push(['', tr('Snoozed {count}×', { count: task.snoozeCount })]);
  $('alert-chips').innerHTML = chips.map(([kind, text]) => `<span class="chip ${kind}">${esc(text)}</span>`).join('');
  $('alert-title').textContent = task.title;
  $('alert-title').title = task.title;
  // "Due {when}" with the time emphasised, red when overdue.
  const [before, after = ''] = tr('Due {when}', { when: MARK }).split(MARK);
  const when = document.createElement('b'); when.textContent = whenText(task.dueAt, now);
  $('alert-time').replaceChildren(before, when, after);
  $('alert-note').textContent = task.body || '';
  $('alert-note').hidden = !task.body;
  renderFiles(task);
  $('alert-nudge').hidden = !(task.snoozeCount >= 3);
  if (task.snoozeCount >= 3) $('alert-nudge').textContent = tr('You have snoozed this {count} times. Maybe choose a better time?', { count: task.snoozeCount });
  $('alert-next-time').hidden = !task.next;
  if (task.next) $('alert-next-time').textContent = tr('Next: {when}', { when: whenText(task.next, now) });
  renderPresets(now);
  $('alert-skip').hidden = !repeating(task);
  $('alert-snooze-all').hidden = tasks.length < 2;
  $('alert-snooze-all').textContent = tr('Snooze all {count} · {duration}', { count: tasks.length, duration: tr('1 hour') });
  $('alert-prev').disabled = busy || index === 0;
  $('alert-next').disabled = busy || index === tasks.length - 1;
  if (changed) {
    $('alert-error').textContent = '';
    closePicker();
    // Screen readers announce each newly shown reminder without the window taking focus first.
    $('alert-live').textContent = `${task.title}. ${$('alert-time').textContent}`;
    $('alert-complete').focus({ preventScroll: true });
  }
}
// The six "Remind me again" choices, numbered for the 1-6 keys. The grid is drawn here rather than
// by the page translator because its labels and tooltips depend on the clock.
function presetLabel(preset, now) {
  switch (preset) {
    case '10m': return tr('10 min');
    case '1h': return tr('1 hour');
    case 'evening': return tr('This evening');
    case 'tomorrow': return tr('Tomorrow {time}', { time: timeLabel(snoozeTime('tomorrow', now)) });
    case 'week': return tr('Next week');
    default: return tr('Pick a time…');
  }
}
function renderPresets(now) {
  const grid = $('snooze-grid'), open = !$('snooze-form').hidden;
  if (!grid.children.length) grid.innerHTML = SNOOZE_PRESETS.map((preset, i) => `<button type="button" data-preset="${preset}"${preset === 'pick' ? ' aria-controls="snooze-form"' : ''}><span></span><kbd>${i + 1}</kbd></button>`).join('');
  for (const button of grid.children) {
    const preset = button.dataset.preset, at = snoozeTime(preset, now), off = preset !== 'pick' && !at;
    button.firstChild.textContent = presetLabel(preset, now);
    button.disabled = busy || off;
    if (preset === 'pick') button.setAttribute('aria-expanded', String(open));
    button.title = off ? tr('Only before {time}', { time: timeLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17)) }) : at ? whenText(at.toISOString(), now) : '';
  }
}
// Attachments as compact chips; images get a small thumbnail when there is room for one.
function renderFiles(task) {
  const files = task.files || [];
  $('alert-files').hidden = !files.length;
  const thumbnails = !task.body && files.length <= 3;
  $('alert-files').innerHTML = files.map(file => `<button type="button" class="alert-file" data-file-id="${esc(file.id)}" title="${esc(tr('Open') + ' ' + file.name)}">${thumbnails && isImageFile(file) ? `<img alt="" data-thumb="${esc(file.id)}">` : `<span class="file-badge">${esc(fileBadge(file.name))}</span>`}<bdi>${esc(file.name)}</bdi></button>`).join('');
  for (const img of $('alert-files').querySelectorAll('[data-thumb]')) api('imagePreview', { id: img.dataset.thumb }).then(src => { if (src && img.isConnected) img.src = src; }).catch(() => {});
}
function move(step) {
  if (busy || !tasks.length) return;
  index = Math.max(0, Math.min(tasks.length - 1, index + step));
  render();
}
function openPicker() {
  $('snooze-form').hidden = false;
  document.querySelector('[data-preset="pick"]').setAttribute('aria-expanded', 'true');
  if (!$('snooze-until').value) $('snooze-until').value = localDateValue(Date.now() + 3600000);
  $('snooze-until').focus();
}
function closePicker() {
  $('snooze-form').hidden = true;
  $('snooze-until').value = '';
  document.querySelector('[data-preset="pick"]').setAttribute('aria-expanded', 'false');
}
async function act(action, until) {
  const task = current();
  if (!task || busy) return;
  busy = true; render();
  const shown = task.id;
  try {
    // The due time lets the main process ignore a second click on a reminder that was already handled.
    await api(action, { id: shown, until, expectedDueAt: task.dueAt ?? null });
    if (action === 'complete') { const info = await api('undoable'); if (info) showUndo(info); }
    await refreshAlert();
    // Another reminder took this place: pause briefly so a repeated click cannot act on it unseen.
    if (current() && current().id !== shown) await new Promise(resolve => setTimeout(resolve, 600));
  } catch (e) { $('alert-error').textContent = e.message; }
  finally { busy = false; render(); }
}
async function snoozeAll(until) {
  if (busy || tasks.length < 2) return;
  busy = true; render();
  try { for (const task of [...tasks]) await api('snooze', { id: task.id, until, expectedDueAt: task.dueAt ?? null }); await refreshAlert(); }
  catch (e) { $('alert-error').textContent = e.message; }
  finally { busy = false; render(); }
}
let undoTimer;
function showUndo(info) {
  $('alert-undo-text').textContent = tr('Completed "{title}"', { title: info.title });
  Object.assign($('alert-undo').dataset, { id: info.id, copyId: info.copyId });
  $('alert-undo').hidden = false;
  clearTimeout(undoTimer); undoTimer = setTimeout(() => { $('alert-undo').hidden = true; }, Math.max(0, info.until - Date.now()));
}
$('alert-undo-button').addEventListener('click', async () => {
  const { id, copyId } = $('alert-undo').dataset;
  $('alert-undo').hidden = true;
  try { await api('undoComplete', { id, copyId }); await refreshAlert(); } catch (e) { $('alert-error').textContent = e.message; }
});
$('alert-complete').addEventListener('click', () => act('complete'));
$('alert-skip').addEventListener('click', () => act('skip'));
$('alert-prev').addEventListener('click', () => move(-1));
$('alert-next').addEventListener('click', () => move(1));
$('snooze-grid').addEventListener('click', e => {
  const button = e.target.closest('[data-preset]'); if (!button || button.disabled) return;
  if (button.dataset.preset === 'pick') return $('snooze-form').hidden ? openPicker() : closePicker();
  act('snooze', snoozeTime(button.dataset.preset, new Date()).toISOString());
});
$('snooze-form').addEventListener('submit', e => {
  e.preventDefault();
  const d = new Date($('snooze-until').value);
  if (!Number.isFinite(d.getTime())) { $('alert-error').textContent = tr('Choose a valid time.'); return; }
  act('snooze', d.toISOString());
});
$('alert-snooze-all').addEventListener('click', () => snoozeAll(snoozeTime('1h', new Date()).toISOString()));
$('alert-open').addEventListener('click', async () => {
  const task = current();
  try { await api('open', task && task.id !== '__preview' ? { id: task.id } : undefined); } catch (e) { $('alert-error').textContent = e.message; }
});
$('alert-files').addEventListener('click', async e => {
  const file = e.target.closest('[data-file-id]'); if (!file) return;
  try { await api('openAttachment', { id: file.dataset.fileId }); } catch (err) { $('alert-error').textContent = err.message; }
});
// Enter is Done, 1-6 the presets, S skips a repeat, arrows move through the queue (mirrored in
// right-to-left languages). Escape never closes the alert; it only closes the date picker.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); if (!$('snooze-form').hidden) closePicker(); return; }
  if (e.ctrlKey || e.altKey || e.metaKey || !current() || e.target.closest?.('input, form')) return;
  const digit = /^(Digit|Numpad)([1-6])$/.exec(e.code);
  if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); act('complete'); }
  else if (digit) { e.preventDefault(); document.querySelectorAll('[data-preset]')[Number(digit[2]) - 1].click(); }
  else if (e.code === 'KeyS' && !$('alert-skip').hidden) { e.preventDefault(); act('skip'); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move((e.key === 'ArrowRight') === (document.dir !== 'rtl') ? 1 : -1); }
});
// Keeps the overdue age and "This evening" current while the alert stays open.
setInterval(() => { if (!busy && current()) render(); }, 30000);
window.waqt.onUpdate(refreshAlert);
refreshAlert();
