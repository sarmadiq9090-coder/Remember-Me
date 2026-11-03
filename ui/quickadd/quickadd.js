// The quick-add window (issue #82), opened by the global shortcut from any app: a title and an optional
// time, saved as a new task. Enter saves, Escape closes, and so does clicking elsewhere while it is empty.
let quickSaving = false;
const quickField = id => document.getElementById(id);
async function applyQuickLook() {
  try {
    const look = await api('language');
    await setLanguage(look); applyPalette(look.palette);
    document.title = tr('Remember Me • Quick add');
    renderQuickDue();
  } catch (error) { showQuickMessage(error.message, true); } finally { showPage(); }
}
function quickDue() { return quickAddDueAt(quickField('quickadd-time').value); }
// "Due Today, 5:30 PM", or tomorrow when that time has passed today.
function renderQuickDue() { const due = quickDue(); quickField('quickadd-due').textContent = due ? tr('Due {when}', { when: dateLabel(due) }) : tr('No due date'); }
function showQuickMessage(text, error = false) { const message = quickField('quickadd-message'); message.textContent = text; message.classList.toggle('error', error); }
quickField('quickadd-time').addEventListener('input', renderQuickDue);
quickField('quickadd-form').addEventListener('submit', async e => {
  e.preventDefault();
  // A second Enter while the first add is still saving would create the task twice.
  if (quickSaving) return;
  quickSaving = true; quickField('quickadd-save').disabled = true; showQuickMessage('');
  try {
    await api('quickAdd', { title: quickField('quickadd-title').value, dueAt: quickDue() });
    showQuickMessage(tr('Task saved. Your next step is in place.'));
    setTimeout(() => window.close(), 700);
  } catch (error) { showQuickMessage(error.message, true); quickSaving = false; quickField('quickadd-save').disabled = false; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); window.close(); } });
// Typed text is never thrown away by a stray click: only an empty window closes when it loses focus.
window.addEventListener('blur', () => { if (!quickSaving && !quickField('quickadd-title').value.trim()) window.close(); });
window.waqt.onUpdate(applyQuickLook);
applyQuickLook().then(() => quickField('quickadd-title').focus());
