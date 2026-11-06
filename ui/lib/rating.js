// The one-time Microsoft Store rating request (issue: council Store review). Shared by the main window (as a
// plain script) and the tests (as a module). Only the Store version asks, once, after a first real success:
// a reminder completed, or five reminders set. "Not now" counts as the answer, so it never asks again.
(function (root) {
  const RATING_REMINDERS = 5;
  // state is the main window's state: tasks without deleted ones, settings and windowsStore.
  function ratingDue(state) {
    if (!state || state.windowsStore !== true || state.settings?.ratingAsked === true) return false;
    const reminders = (state.tasks || []).filter(task => task && task.dueAt && !task.deletedAt);
    return reminders.some(task => task.completedAt) || reminders.length >= RATING_REMINDERS;
  }
  const api = { RATING_REMINDERS, ratingDue };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, { ratingDue });
})(this);
