'use strict';
// When a repeating task comes back: the occurrence after a given one, in local time.
const DAY = 86400000;
function monthsLater(start, months) {
  const next = new Date(start.getFullYear(), start.getMonth() + months, 1, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  next.setDate(Math.min(start.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}
// The first occurrence after both `value` (the current one) and `now`, in local time.
function nextOccurrence(value, repeat, now, rule = {}) {
  const current = new Date(value);
  if (repeat === 'monthly' || repeat === 'yearly') {
    const start = new Date(rule.repeatFrom || value), step = repeat === 'yearly' ? 12 : 1;
    const elapsed = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
    const behind = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
    let months = Math.max(Math.floor(elapsed / step) * step + step, Math.floor((behind - 1) / step) * step);
    let next = monthsLater(start, months);
    while (next <= now || next <= current) next = monthsLater(start, months += step);
    return next.toISOString();
  }
  // Each occurrence is a calendar day plus the series' time of day, rebuilt every time: when a
  // spring-forward gap pushes one occurrence an hour later, the next one is back at the usual time.
  const time = new Date(rule.repeatFrom || value);
  const on = (from, days) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  if (repeat === 'days') {
    const days = rule.repeatDays?.length ? rule.repeatDays : [current.getDay()];
    // After a long gap, restart from yesterday instead of walking every day.
    const from = now - current > 8 * DAY ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) : current;
    let offset = 0, next;
    do next = on(from, ++offset); while (!days.includes(next.getDay()) || next <= now || next <= current);
    return next.toISOString();
  }
  const step = repeat === 'weekly' ? 7 : repeat === 'interval' ? rule.repeatEvery || 2 : 1;
  let offset = step;
  const behind = Math.floor((now - on(current, offset)) / DAY);
  if (behind > 0) offset += Math.floor(behind / step) * step;
  let next = on(current, offset);
  while (next <= now || next <= current) next = on(current, offset += step);
  return next.toISOString();
}
module.exports = { nextOccurrence };
