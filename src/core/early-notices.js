'use strict';
const LIMIT = 20;

// Shows each "Coming up" notice once per task and due time. `show(task)` displays one and returns
// the notification, or null when none was shown.
// - While reminders are paused, notices are recorded without being shown, so resuming doesn't
//   bring a burst of them for tasks that came close during the pause.
// - Shown notifications are kept referenced (up to LIMIT, until closed, clicked or due), since a
//   garbage-collected Electron Notification stops delivering its click.
function createEarlyNotices({ show, clock = () => Date.now(), limit = LIMIT }) {
  const announced = new Map(); // "id:dueAt" -> due time in ms
  const live = new Map(); // notification -> due time in ms
  function keep(notification, due) {
    live.set(notification, due);
    const forget = () => live.delete(notification);
    notification.on('close', forget);
    notification.on('click', forget);
    while (live.size > limit) live.delete(live.keys().next().value);
  }
  return {
    announce(tasks, { silent = false } = {}) {
      const now = clock();
      for (const [key, due] of announced) if (due <= now) announced.delete(key);
      for (const [notification, due] of live) if (due <= now) live.delete(notification);
      for (const task of tasks) {
        const key = task.id + ':' + task.dueAt, due = Date.parse(task.dueAt);
        if (announced.has(key)) continue;
        announced.set(key, due);
        if (silent) continue;
        const notification = show(task);
        if (notification) keep(notification, due);
      }
    },
    get size() { return { announced: announced.size, live: live.size }; },
  };
}
module.exports = { createEarlyNotices, LIMIT };
