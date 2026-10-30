// The main window's scripts are plain <script> files that index.html loads in order and that share one
// global scope, as the single app.js did; later files use what earlier ones declare. This one holds:
// page state, refresh() from the main process, toasts, switching views and storage usage.
let state, trash = [], view = 'today', filter = 'all', query = '', pendingDelete, toastTimer;
let taskAttachments = [], noteAttachments = [];
let originalTaskDue = null, originalTaskDueValue = '', originalTaskUpdatedAt, originalTaskRepeat = 'none', originalTaskRule = '';
// The repeat details the editor shows, compared on save to tell whether the schedule was edited.
const repeatRuleKey = () => JSON.stringify([repeatDays, $('task-every').value, $('task-before').value]);
const $ = id => document.getElementById(id);
// Marks a message key for tools/i18n-keys.cjs without translating it yet.
const msg = key => key;
// Breadcrumb, title, description and list heading of each view, as message keys.
const views = {
  today: [msg("Today@nav"), msg("Your day, at your pace"), msg("One small step at a time. Set your priorities and leave the reminders to us."), msg("Today's tasks")],
  upcoming: [msg("Upcoming"), msg("Plan what comes next"), msg("Give each task its time. We will remind you when it is due."), msg("Upcoming tasks")],
  all: [msg("All tasks"), msg("Everything on your mind"), msg("One place for your tasks, from idea to completion."), msg("All tasks")],
  completed: [msg("Completed"), msg("Steps worth celebrating"), msg("These small things made a difference in your day."), msg("Completed tasks")],
  notes: [msg("My notes"), msg("Your ideas, in their place"), msg("Write an idea, keep a detail, or clear your mind."), ""],
  trash: [msg("Trash"), msg("Recently deleted"), msg("Deleted items stay here for 30 days, then are removed for good."), ""],
  settings: [msg("Settings"), msg("Remember Me, your way"), msg("Small details that make the space feel yours."), ""],
};
// An optional action adds a button: Undo (also Ctrl+Z), or one named by label, such as Restart now. The message
// stays up longer then, and while the pointer or focus is on it. After an undo, focus returns to the mark (see focusMark).
let toastUndo = null, toastDelay = 0;
function toast(message, action, { label, mark } = {}) {
  const el = $('toast'); el.textContent = message; toastUndo = null;
  if (action) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'toast-action'; button.textContent = label || tr("Undo");
    let ran = false;
    const run = async () => {
      if (ran) return; ran = true;
      hideToast();
      try { await action(); await refresh(); restoreFocus(mark); } catch (e) { toast(e.message); }
    };
    if (!label) {
      toastUndo = run;
      const kbd = document.createElement('kbd'); kbd.textContent = 'Ctrl Z'; button.append(' ', kbd); button.setAttribute('aria-keyshortcuts', 'Control+Z');
    }
    button.addEventListener('click', run);
    el.append(' ', button);
  }
  el.hidden = false; toastDelay = action ? 10000 : 4500; holdToast();
}
function hideToast() { clearTimeout(toastTimer); $('toast').hidden = true; toastUndo = null; }
function holdToast() { const el = $('toast'); clearTimeout(toastTimer); if (!el.hidden && !el.matches(':hover, :focus-within')) toastTimer = setTimeout(hideToast, toastDelay); }
for (const type of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) $('toast').addEventListener(type, () => setTimeout(holdToast));
document.addEventListener('keydown', e => {
  const typing = e.target.matches?.('textarea, input:not([type=checkbox], [type=radio], [type=button])');
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyZ' && toastUndo && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); toastUndo(); }
});
async function refresh() {
  try {
    state = await api('state');
    // Deleted items only appear in the trash view; every other view works on the rest.
    trash = [...state.tasks.filter(t => t.deletedAt).map(item => ({ kind: 'Task', item })), ...state.notes.filter(n => n.deletedAt).map(item => ({ kind: 'Note', item }))].sort((a, b) => Date.parse(b.item.deletedAt) - Date.parse(a.item.deletedAt));
    state.tasks = state.tasks.filter(t => !t.deletedAt); state.notes = state.notes.filter(n => !n.deletedAt);
    await setLanguage(state.settings.language);
    // While a palette choice is being saved, an older refresh must not switch the page back.
    if (!appearanceSaving) applyPalette(state.settings.palette);
    // Shown before rendering: nothing in a hidden page can take the focus.
    showPage();
    render();
    // The tray's New task, or Open task or Reschedule in the alert, asked for an editor.
    const open = state.openTask;
    if (open && !document.querySelector('dialog[open]')) {
      const task = open.task === 'new' ? null : state.tasks.find(t => t.id === open.task);
      if (open.task === 'new' || (task && !task.completedAt)) openTaskEditor(task || undefined, { focus: open.field });
    }
  } catch (e) { toast(e.message); } finally { showPage(); }
}
function todayEnd() { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
function todayTasks() { return state.tasks.filter(t => !t.completedAt && (!t.dueAt || Date.parse(t.dueAt) <= todayEnd())); }
function setView(next) {
  view = next; filter = 'all'; query = ''; $('search').value = ''; render();
  if (next === 'settings') loadStorage();
}
let storage = null;
async function loadStorage() { try { storage = await api('storage'); } catch { storage = null; } renderStorage(); }
function renderStorage() {
  $('storage-usage').textContent = storage ? tr("Attachments: {attachments} • Local backups: {backups}", { attachments: fileSize(storage.attachments), backups: fileSize(storage.backups) }) : '';
  $('clean-orphans').hidden = !storage?.orphans;
  if (storage?.orphans) $('clean-orphans').textContent = tr("Clean up {count} unused attachments ({value})", { count: storage.orphans, value: fileSize(storage.orphanBytes) });
}
