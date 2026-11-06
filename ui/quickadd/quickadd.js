// The quick-add window (issue #82), opened by the global shortcut from any app: a title and an optional
// time, saved as a new task. Enter saves, Escape closes, and so does clicking elsewhere while it is empty.
let quickSaving = false, quickWeekStart = 6;
const quickField = id => document.getElementById(id);
// A date typed in the title («بكرة 5 العصر», "tomorrow 5pm") shows in a chip under it (ui/lib/when-chip.js).
// A time chosen in the time field wins, so the chip steps aside while that field has a value.
const quickWhen = createWhenChip({ input: quickField('quickadd-title'), chip: quickField('quickadd-when'), weekStart: () => quickWeekStart,
  skip: () => !!quickField('quickadd-time').value, onRender: () => renderQuickDue() });
async function applyQuickLook() {
  try {
    const look = await api('language');
    await setLanguage(look); applyPalette(look.palette); applyTextSize(look.textSize);
    quickWeekStart = look.weekStart;
    document.title = tr('Remember Me • Quick add');
    quickWhen.render();
  } catch (error) { showQuickMessage(error.message, true); } finally { showPage(); }
}
function quickDue() { return quickAddDueAt(quickField('quickadd-time').value); }
// "Due Today, 5:30 PM", or tomorrow when that time has passed today. Empty while the chip shows the time.
function renderQuickDue() {
  const due = quickDue(), chip = !quickField('quickadd-when').hidden;
  quickField('quickadd-due').textContent = due ? tr('Due {when}', { when: dateLabel(due) }) : chip ? '' : tr('No due date');
}
function showQuickMessage(text, error = false) { const message = quickField('quickadd-message'); message.textContent = text; message.classList.toggle('error', error); }
quickField('quickadd-time').addEventListener('input', () => quickWhen.render());
quickField('quickadd-form').addEventListener('submit', async e => {
  e.preventDefault();
  // A second Enter while the first add is still saving would create the task twice.
  if (quickSaving) return;
  quickSaving = true; quickField('quickadd-save').disabled = true; showQuickMessage('');
  try {
    const typed = await quickWhen.take();
    if (typed.wait) { showQuickMessage(typed.wait); quickSaving = false; quickField('quickadd-save').disabled = false; return; }
    await api('quickAdd', typed.dueAt ? typed : { title: typed.title, dueAt: quickDue() });
    showQuickMessage(tr('Task saved. Your next step is in place.'));
    setTimeout(() => window.close(), 700);
  } catch (error) { showQuickMessage(error.message, true); quickSaving = false; quickField('quickadd-save').disabled = false; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); window.close(); } });
// Typed text is never thrown away by a stray click: only an empty window closes when it loses focus.
window.addEventListener('blur', () => { if (!quickSaving && !quickField('quickadd-title').value.trim()) window.close(); });
window.waqt.onUpdate(applyQuickLook);
applyQuickLook().then(() => quickField('quickadd-title').focus());
