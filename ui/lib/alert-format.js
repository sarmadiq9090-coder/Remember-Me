// Time logic for the reminder alert: snooze presets, overdue age and the due day, in local time.
// Loaded as a plain script by alert.html and required as a module by the tests.
(function (root) {
  const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
  // The order is also the 1-6 keyboard shortcuts. 'pick' opens the date field instead of a time.
  const SNOOZE_PRESETS = ['10m', '1h', 'evening', 'tomorrow', 'week', 'pick'];
  const EVENING = 18, EVENING_CUTOFF = 17, MORNING = 9;
  // When a preset snoozes to, or null when it does not apply now (this evening after 17:00).
  function snoozeTime(preset, now = new Date()) {
    const at = (days, hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0, 0);
    switch (preset) {
      case '10m': return new Date(now.getTime() + 10 * MINUTE);
      case '1h': return new Date(now.getTime() + HOUR);
      case 'evening': return now.getHours() >= EVENING_CUTOFF ? null : at(0, EVENING);
      case 'tomorrow': return at(1, MORNING);
      // Same wall-clock time a week later, also across a DST change.
      case 'week': { const next = new Date(now); next.setDate(next.getDate() + 7); return next; }
      default: return null;
    }
  }
  // A reminder is overdue once it is more than a minute late.
  function isOverdue(dueAt, now = new Date()) { return !!dueAt && now.getTime() - Date.parse(dueAt) >= MINUTE; }
  // How long ago it was due, such as "26 hr. ago", in the interface language.
  function overdueAge(dueAt, now, intl) {
    const late = Math.max(0, now.getTime() - Date.parse(dueAt));
    const format = new Intl.RelativeTimeFormat(intl, { numeric: 'always', style: 'short' });
    if (late < HOUR) return format.format(-Math.max(1, Math.round(late / MINUTE)), 'minute');
    if (late < 2 * DAY) return format.format(-Math.round(late / HOUR), 'hour');
    return format.format(-Math.round(late / DAY), 'day');
  }
  // "yesterday", "today", "tomorrow" or a short date, plus the time.
  function dueWhen(dueAt, now, intl) {
    const due = new Date(dueAt);
    const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(due) - startOf(now)) / DAY);
    const day = Math.abs(days) <= 1 ? new Intl.RelativeTimeFormat(intl, { numeric: 'auto' }).format(days, 'day')
      : due.toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short', ...(due.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
    return { day, time: due.toLocaleTimeString(intl, { hour: 'numeric', minute: '2-digit' }) };
  }
  // Keys that act on the reminder: Enter and Space (which also press a focused button), 1-6 and S.
  function isShortcut(e) { return e.key === 'Enter' || e.key === ' ' || /^(Digit|Numpad)[1-6]$/.test(e.code || '') || e.code === 'KeyS'; }
  // The alert appears without taking focus, but focus can still land on it while the user types
  // elsewhere. Shortcuts act only after the user has interacted with the window: a pointer press,
  // or a navigation key (Tab, the arrows, Home/End/Page Up/Page Down, or Alt after Alt+Tab).
  // Letters, Shift and Backspace are typing, not interaction. Held keys never act.
  // reset() when the window loses focus or another reminder moves in.
  const NAVIGATION_KEYS = new Set(['Tab', 'Alt', 'AltGraph', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
  function createInteractionGuard() {
    let engaged = false;
    return {
      get engaged() { return engaged; },
      reset() { engaged = false; },
      pointer() { engaged = true; },
      key(e) { if (!e.repeat && NAVIGATION_KEYS.has(e.key)) engaged = true; },
      allows(e) { return engaged && !e.repeat; },
    };
  }
  const api = { SNOOZE_PRESETS, snoozeTime, isOverdue, overdueAge, dueWhen, isShortcut, createInteractionGuard };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, { SNOOZE_PRESETS, snoozeTime, isOverdue, overdueAge, dueWhen, isShortcut, createInteractionGuard });
})(this);
