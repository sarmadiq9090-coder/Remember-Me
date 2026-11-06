'use strict';
// Natural dates in quick add: "tomorrow 5pm", «بكرة 5 العصر», «كل يوم 7 الصبح». parseWhen() finds
// the phrase (natural-dates-ar.js for Arabic, natural-dates-en.js for English), works out the time,
// and returns the title without the phrase. Nothing is guessed: when the phrase allows more than one
// time (AM or PM, this week or next, no time at all), dueAt is null and options lists the choices
// for the person to pick. Local and offline, like the rest of the app.
const { parseArabic } = require('./natural-dates-ar');
const { parseEnglish } = require('./natural-dates-en');

const MAX_TEXT = 200;
// The choices offered when a phrase names a day but no time: morning, noon and evening.
const DEFAULT_TIMES = [[9, 0], [12, 0], [18, 0]];
const MAX_OPTIONS = 4;
const DAY_MS = 86400000;

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Whole days between two local dates, also across a daylight-saving change.
const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
const at = (today, days, [hour, minute]) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hour, minute);
function monthsAhead(now, months) {
  const target = new Date(now.getFullYear(), now.getMonth() + months, 1);
  target.setDate(Math.min(now.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return target;
}

// Turns a reading into a time, or into the choices to ask about. weekStart (0, 1 or 6, from
// Settings) decides whether "next Thursday" can mean this week's Thursday.
function resolve(reading, { now, weekStart }) {
  const out = { repeat: 'none', dueAt: null, options: [], ask: null };
  if (reading.repeat) Object.assign(out, reading.repeat);
  if (reading.instant) {
    const due = reading.instant.at ? new Date(reading.instant.at) : new Date(now.getTime() + reading.instant.minutes * 60000);
    due.setSeconds(0, 0);
    return { ...out, dueAt: due.toISOString(), options: [due.toISOString()] };
  }
  const today = startOfDay(now), weekday = now.getDay(), date = reading.date, time = reading.time;
  let times = null;
  if (time) times = time.meridiem ? [[time.hour, time.minute]] : time.hour === 12 ? [[12, time.minute], [0, time.minute]] : [[time.hour, time.minute], [time.hour + 12, time.minute]];
  else if (date?.keepTime || date?.months) times = [[now.getHours(), now.getMinutes()]];
  // days: the candidate days, counted from today. first: take the first of them still ahead
  // (a repeat, or a time with no day: today, or tomorrow once it has passed).
  let days, first = false, step = 1;
  if (!date) { days = [0, 1]; first = true; }
  else if (date.days) { days = Array.from({ length: 8 }, (_, i) => i).filter(i => date.days.includes((weekday + i) % 7)); first = true; }
  else if ('offset' in date) days = [date.offset];
  else if (date.ymd) days = [daysBetween(today, new Date(...date.ymd))];
  else if (date.months) days = [daysBetween(today, monthsAhead(now, date.months))];
  else {
    step = 7;
    const ahead = (date.weekday - weekday + 7) % 7, next = ahead || 7, place = (weekday - weekStart + 7) % 7;
    if (date.mod === 'repeat') { days = [ahead, ahead + 7]; first = true; }
    else if (date.mod === 'this') days = [ahead];
    else if (date.mod === 'next') days = place + next < 7 ? [next, next + 7] : [next];
    else if (date.mod === 'nextWeek') days = [7 - place + (date.weekday - weekStart + 7) % 7];
    else days = ahead === 0 ? [0, 7] : [ahead];
  }
  // A night hour after a named day («الخميس 2 بالليل», «بكرة نص الليل») can mean that day's early
  // morning or the night after it, so both are offered.
  if (reading.late && !first) days = [...new Set(days.flatMap(d => [d, d + 1]))];
  const ahead = d => d > now;
  const build = (list, clock) => {
    if (first) return clock.map(c => list.map(d => at(today, d, c)).find(ahead)).filter(Boolean);
    return list.flatMap(d => clock.map(c => at(today, d, c))).filter(ahead);
  };
  // No time and an open day: morning or evening of each day, all with their dates.
  const clock = times || (days.length > 1 && !first ? [DEFAULT_TIMES[0], DEFAULT_TIMES[2]] : DEFAULT_TIMES);
  let options = build(days, clock), ask = null;
  if (!times) ask = days.length > 1 && !first ? 'choose' : 'time';
  if (!options.length) {
    // The day and time have passed («اليوم 5 العصر» in the evening): offer the next one instead.
    options = build(days.map(d => d + step), clock);
    ask = 'past';
  }
  options = [...new Set(options.slice(0, MAX_OPTIONS * 2).map(d => d.getTime()))].sort((a, b) => a - b).slice(0, MAX_OPTIONS).map(t => new Date(t).toISOString());
  if (!ask && options.length > 1) ask = time && !time.meridiem ? (days.length > 1 && !first ? 'choose' : 'meridiem') : 'day';
  return { ...out, options, ask, dueAt: !ask && options.length === 1 ? options[0] : null };
}

// Words left hanging once the phrase is cut out: "Call mom at", «موعد الطبيب في».
const CONNECTORS = /^(?:at|on|by|in|for|from|due|this|next|the|في|على|علي|ع|عند|الساعه|الساعة|يوم|من|ب|و|-|–|,|،|:)$/iu;
function cutTitle(text, spans) {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
  const pieces = [];
  let from = 0;
  for (const [s, e] of sorted) { pieces.push(text.slice(from, Math.max(from, s))); from = Math.max(from, e); }
  pieces.push(text.slice(from));
  const words = pieces.map(piece => piece.split(/\s+/).filter(Boolean));
  words.forEach((list, i) => {
    if (i < words.length - 1) while (list.length && CONNECTORS.test(list.at(-1))) list.pop();
    if (i > 0) while (list.length && CONNECTORS.test(list[0])) list.shift();
  });
  const title = words.flat().join(' ').replace(/^[\s,،:;–-]+|[\s,،:;–-]+$/gu, '');
  return title || text.trim();
}

// The quick-add reading of a title, or null when it holds no date or time. Returns
// { title, dueAt, options, ask, repeat, repeatDays?, repeatEvery? }: ask is null when dueAt is
// certain, else 'meridiem' (AM or PM), 'day' (this week or next), 'time' (no time given),
// 'choose' (both) or 'past' (that time has gone; options holds the next one).
function parseWhen(text, { now = new Date(), weekStart = 6 } = {}) {
  const typed = String(text ?? '').slice(0, MAX_TEXT);
  if (!typed.trim()) return null;
  const reading = parseArabic(typed) || parseEnglish(typed, now);
  if (!reading) return null;
  const when = resolve(reading, { now, weekStart: [0, 1, 6].includes(weekStart) ? weekStart : 6 });
  return { title: cutTitle(typed, reading.spans), ...when };
}

module.exports = { parseWhen, MAX_TEXT };
