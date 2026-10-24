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
// An optional undo callback adds an Undo button (also Ctrl+Z) and keeps the message up longer. The message
// stays while the pointer or focus is on it. After an undo, focus returns to the mark (see focusMark).
let toastUndo = null, toastDelay = 0;
function toast(message, undo, mark) {
  const el = $('toast'); el.textContent = message; toastUndo = null;
  if (undo) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'toast-action'; button.textContent = tr("Undo");
    const kbd = document.createElement('kbd'); kbd.textContent = 'Ctrl Z'; button.append(' ', kbd); button.setAttribute('aria-keyshortcuts', 'Control+Z');
    const run = toastUndo = async () => {
      if (toastUndo !== run) return;
      hideToast();
      try { await undo(); await refresh(); restoreFocus(mark); } catch (e) { toast(e.message); }
    };
    button.addEventListener('click', run);
    el.append(' ', button);
  }
  el.hidden = false; toastDelay = undo ? 10000 : 4500; holdToast();
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
    render();
    // The tray's New task, or Open task in the alert, asked for an editor.
    if (state.openTask && !document.querySelector('dialog[open]')) {
      const task = state.openTask === 'new' ? null : state.tasks.find(t => t.id === state.openTask);
      if (state.openTask === 'new' || (task && !task.completedAt)) openTaskEditor(task || undefined);
    }
  } catch (e) { toast(e.message); }
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
  $('storage-usage').textContent = storage ? `${tr("Attachments")}: ${fileSize(storage.attachments)} • ${tr("Local backups")}: ${fileSize(storage.backups)}` : '';
  $('clean-orphans').hidden = !storage?.orphans;
  if (storage?.orphans) $('clean-orphans').textContent = tr("Clean up {count} unused attachments ({value})", { count: storage.orphans, value: fileSize(storage.orphanBytes) });
}
