// Time logic for the reminder alert and the task rows: snooze presets, overdue age and the due day,
// in local time. Loaded as a plain script by alert.html and index.html, and required as a module by
// src/core/tasks.js (to validate saved presets) and the tests.
(function (root) {
  const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, DAY_MINUTES = DAY / MINUTE;
  // The six "Remind me again" choices, in the order of the 1-6 keys. Each is one of:
  //   { kind: 'in', minutes }     that long from now (whole days keep the wall-clock time)
  //   { kind: 'today', time }     today at HH:MM, until an hour before it
  //   { kind: 'tomorrow', time }  tomorrow at HH:MM
  //   { kind: 'week' }            the same time next week
  //   { kind: 'pick' }            opens the date field instead of a time
  // The defaults are the choices v1.5.0 shipped with; Settings can change them (issue #20).
  const DEFAULT_SNOOZE_PRESETS = Object.freeze([{ kind: 'in', minutes: 10 }, { kind: 'in', minutes: 60 }, { kind: 'today', time: '18:00' }, { kind: 'tomorrow', time: '09:00' }, { kind: 'week' }, { kind: 'pick' }].map(Object.freeze));
  const SNOOZE_KINDS = ['in', 'today', 'tomorrow', 'week', 'pick'];
  // Up to 30 days ahead; anything later is a new due date rather than a snooze.
  const MAX_SNOOZE_MINUTES = 30 * DAY_MINUTES;
  const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/, TODAY_EARLIEST = '01:00';
  // A clean copy of one preset, or null when it is not a valid one.
  function checkSnoozePreset(value) {
    if (!value || typeof value !== 'object' || !SNOOZE_KINDS.includes(value.kind)) return null;
    if (value.kind === 'in') return Number.isInteger(value.minutes) && value.minutes >= 1 && value.minutes <= MAX_SNOOZE_MINUTES ? { kind: 'in', minutes: value.minutes } : null;
    // A time today closes an hour before it, so one before 01:00 could never be chosen.
    if (value.kind === 'today' || value.kind === 'tomorrow') return typeof value.time === 'string' && TIME.test(value.time) && (value.kind === 'tomorrow' || value.time >= TODAY_EARLIEST) ? { kind: value.kind, time: value.time } : null;
    return { kind: value.kind };
  }
  // Always six presets: anything but a list of six keeps the defaults, and an invalid slot falls
  // back to that slot's default, so the 1-6 keys never lose a choice.
  function normalizeSnoozePresets(value) {
    const list = Array.isArray(value) && value.length === DEFAULT_SNOOZE_PRESETS.length ? [...value] : DEFAULT_SNOOZE_PRESETS;
    return list.map((preset, i) => checkSnoozePreset(preset) || { ...DEFAULT_SNOOZE_PRESETS[i] });
  }
  const clock = time => TIME.exec(time).slice(1, 3).map(Number);
  // When a preset snoozes to, or null when it does not apply now (today's time is less than an hour away).
  function snoozeTime(preset, now = new Date()) {
    const at = (days, [hour, minute]) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, minute, 0, 0);
    const later = days => { const next = new Date(now); next.setDate(next.getDate() + days); return next; };
    switch (preset?.kind) {
      // Whole days keep the wall-clock time, also across a DST change.
      case 'in': return preset.minutes % DAY_MINUTES === 0 ? later(preset.minutes / DAY_MINUTES) : new Date(now.getTime() + preset.minutes * MINUTE);
      case 'today': { const today = at(0, clock(preset.time)); return now.getTime() >= today.getTime() - HOUR ? null : today; }
      case 'tomorrow': return at(1, clock(preset.time));
      case 'week': return later(7);
      default: return null;
    }
  }
  // The last moment a "today" preset can be chosen, named in its tooltip once it is unavailable.
  function snoozeCutoff(preset, now = new Date()) {
    const [hour, minute] = clock(preset.time);
    return new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime() - HOUR);
  }
  const unitText = (unit, value, intl) => new Intl.NumberFormat(intl, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
  // A length of time such as "10 minutes", "2 hours" or "3 days" in the interface language.
  function durationText(minutes, intl) {
    if (minutes % DAY_MINUTES === 0) return unitText('day', minutes / DAY_MINUTES, intl);
    return minutes % 60 === 0 ? unitText('hour', minutes / 60, intl) : unitText('minute', minutes, intl);
  }
  // A reminder is overdue once it is more than a minute late.
  function isOverdue(dueAt, now = new Date()) { return !!dueAt && now.getTime() - Date.parse(dueAt) >= MINUTE; }
  // How late it is: whole minutes under an hour, hours under two days, then days.
  function lateness(dueAt, now) {
    // Rounded first, so 59.5 minutes reads "1 hour" rather than "60 minutes".
    const late = Math.max(0, now.getTime() - Date.parse(dueAt)), minutes = Math.round(late / MINUTE), hours = Math.round(late / HOUR);
    if (minutes < 60) return ['minute', Math.max(1, minutes)];
    if (hours < 48) return ['hour', hours];
    return ['day', Math.round(late / DAY)];
  }
  // How long ago it was due, such as "26 hr. ago", in the interface language.
  function overdueAge(dueAt, now, intl) {
    const [unit, value] = lateness(dueAt, now);
    return new Intl.RelativeTimeFormat(intl, { numeric: 'always', style: 'short' }).format(-value, unit);
  }
  // How late it is as a length of time, such as "2 hours", for "Overdue by {duration}" on task rows.
  function overdueFor(dueAt, now, intl) { const [unit, value] = lateness(dueAt, now); return unitText(unit, value, intl); }
  // "yesterday", "today", "tomorrow" or a short date, plus the time.
  function dueWhen(dueAt, now, intl) {
    const due = new Date(dueAt);
    const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(due) - startOf(now)) / DAY);
    const day = Math.abs(days) <= 1 ? new Intl.RelativeTimeFormat(intl, { numeric: 'auto' }).format(days, 'day')
      : due.toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short', ...(due.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
    return { day, time: due.toLocaleTimeString(intl, { hour: 'numeric', minute: '2-digit' }) };
  }
  // The day and time a snooze button leads to, for its preview ("→ Today 18:00"). The day starts the
  // phrase, so it gets a capital letter. Null for a preset without a time (Pick a time, or too late today).
  function snoozePreview(preset, now, intl) {
    const at = snoozeTime(preset, now);
    if (!at) return null;
    const { day, time } = dueWhen(at.toISOString(), now, intl);
    return { day: day.charAt(0).toLocaleUpperCase(intl) + day.slice(1), time };
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
  const api = { DEFAULT_SNOOZE_PRESETS, MAX_SNOOZE_MINUTES, checkSnoozePreset, normalizeSnoozePresets, snoozeTime, snoozeCutoff, durationText, isOverdue, overdueAge, overdueFor, dueWhen, snoozePreview, isShortcut, createInteractionGuard };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, { DEFAULT_SNOOZE_PRESETS, MAX_SNOOZE_MINUTES, checkSnoozePreset, normalizeSnoozePresets, snoozeTime, snoozeCutoff, durationText, isOverdue, overdueAge, overdueFor, dueWhen, snoozePreview, isShortcut, createInteractionGuard });
})(this);
