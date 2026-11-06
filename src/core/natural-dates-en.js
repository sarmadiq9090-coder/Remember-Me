'use strict';
// Reads English date and time phrases in a quick-add title with chrono-node (MIT, pinned in
// package.json; it runs locally and never touches the network): "tomorrow 5pm", "in 2 hours",
// "next Thursday 8pm", "every day 7am". Repeats ("every …") are read here, chrono-node reads the rest.
// Returns a reading for resolve() in natural-dates.js, or null. AM/PM and "next <day>" are left
// open when unclear, so resolve() asks.
const chrono = require('chrono-node');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY = '(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?s?';
const dayOf = word => DAYS.findIndex(d => d.startsWith(word.toLowerCase().replace(/s$/, '').slice(0, 3)));
const COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const COUNT = `\\d{1,3}|${Object.keys(COUNTS).join('|')}`;
const count = text => COUNTS[text.toLowerCase()] ?? Number(text);
// The time used when a phrase names only the part of the day. The same hours as the Arabic rules.
const PERIOD_AT = { morning: 9, noon: 12, afternoon: 15, evening: 18, tonight: 21, night: 21, midnight: 0 };
const PERIOD = /\b(morning|noon|afternoon|evening|tonight|night|midnight)\b/i;

const REPEATS = [
  [/\bevery\s+other\s+day\b/i, () => ({ repeat: 'interval', repeatEvery: 2 })],
  [new RegExp(`\\bevery\\s+(${COUNT})\\s+(days?|weeks?)\\b`, 'i'), m => {
    const days = count(m[1]) * (/week/i.test(m[2]) ? 7 : 1);
    return days < 1 || days > 365 ? null : days === 1 ? { repeat: 'daily' } : days === 7 ? { repeat: 'weekly' } : { repeat: 'interval', repeatEvery: days };
  }],
  [/\b(?:(?:every|each)\s+(?:week|work\s?)days?|on\s+weekdays|weekdays)\b/i, () => ({ repeat: 'days', repeatDays: [1, 2, 3, 4, 5] })],
  [new RegExp(`\\b(?:every|each)\\s+(${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i'), m => {
    const days = [...new Set(m[1].split(/\s*(?:,|and|&)\s*/i).map(dayOf).filter(d => d >= 0))].sort();
    if (!days.length) return null;
    return days.length === 1 ? { repeat: 'weekly', weekday: days[0] } : { repeat: 'days', repeatDays: days };
  }],
  [/\b(?:every|each)\s+(morning|afternoon|evening|night)\b/i, m => ({ repeat: 'daily', period: m[1].toLowerCase() })],
  [/\b(?:every\s*day|each\s+day|daily)\b/i, () => ({ repeat: 'daily' })],
  [/\b(?:(?:every|each)\s+week|weekly)\b/i, () => ({ repeat: 'weekly' })],
  [/\b(?:(?:every|each)\s+month|monthly)\b/i, () => ({ repeat: 'monthly' })],
  [/\b(?:(?:every|each)\s+year|yearly|annually)\b/i, () => ({ repeat: 'yearly' })],
];
// "8 in the evening" and "10 at night" are written as "8pm" for chrono-node, which reads only "evening".
const PART_OF_DAY = /\b(\d{1,2})(?::(\d{2}))?\s+(?:o'?clock\s+)?(in\s+the\s+(morning|afternoon|evening)|at\s+night|tonight)\b/gi;
// Short day names alone ("I sat down", "wed") are too often plain words.
const SHORT_DAY = /^(?:on\s+)?(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\.?$/i;

function parseEnglish(text, now = new Date()) {
  if (!/[a-z]/i.test(text)) return null;
  const spans = [], reading = { date: null, time: null, instant: null, repeat: null, late: false };
  let rest = text;
  const blank = (s, e) => { rest = rest.slice(0, s) + ' '.repeat(e - s) + rest.slice(e); };
  for (const [pattern, read] of REPEATS) {
    const m = pattern.exec(rest);
    const repeat = m && read(m);
    if (!repeat) continue;
    const { weekday, period, ...rule } = repeat;
    reading.repeat = rule;
    if (weekday !== undefined) reading.date = { weekday, mod: 'repeat' };
    if (rule.repeatDays) reading.date = { days: rule.repeatDays };
    if (period) reading.period = period;
    spans.push([m.index, m.index + m[0].length]); blank(m.index, m.index + m[0].length);
    break;
  }
  const rewritten = [];
  rest = rest.replace(PART_OF_DAY, (all, hour, minute, part, when, offset) => {
    const pm = !/morning/i.test(part) && !(/night/i.test(part) && Number(hour) < 5);
    const short = `${hour}${minute ? ':' + minute : ''}${pm ? 'pm' : 'am'}`;
    rewritten.push([offset, offset + all.length]);
    return short.padEnd(all.length, ' ');
  });
  const results = chrono.parse(rest, now, { forwardDate: true }).filter(r => {
    const known = r.start.knownValues, phrase = r.text.trim();
    if (/^(?:now|today's|todays)$/i.test(phrase) || SHORT_DAY.test(phrase)) return false;
    return 'day' in known || 'weekday' in known || r.start.isCertain('hour') || PERIOD.test(phrase);
  });
  const result = results[0];
  if (!result && !reading.repeat) return null;
  if (result) {
    const s = result.index, e = s + result.text.length;
    // A rewritten "8 in the evening" is cut from the title whole.
    const whole = rewritten.reduce(([a, b], [x, y]) => (x < b && y > a ? [Math.min(a, x), Math.max(b, y)] : [a, b]), [s, e]);
    spans.push(whole);
    readResult(result, reading);
  }
  if (!reading.time && reading.period) reading.time = { hour: PERIOD_AT[reading.period], minute: 0, meridiem: true };
  delete reading.period;
  reading.spans = spans;
  return reading;
}

function readResult(result, reading) {
  const { start } = result, phrase = result.text.toLowerCase();
  const known = start.knownValues;
  // "in 2 hours", "30 minutes from now": an exact moment.
  if (/\b(?:min(?:ute)?s?|h(?:ou)?rs?)\b/.test(phrase) && /\b(?:in|within|after|from now|later)\b/.test(phrase)) {
    reading.instant = { at: start.date().toISOString() };
    return;
  }
  const relativeDays = /\b(?:in|within|after|from now|later)\b/.test(phrase) && /\b(?:days?|weeks?|months?|years?)\b/.test(phrase);
  if (reading.date?.mod === 'repeat' || reading.date?.days) { /* the repeat already says which days */ }
  else if ('weekday' in known && !('day' in known)) {
    const mod = /\bnext\s+week\b/.test(phrase) ? 'nextWeek' : /\bnext\b/.test(phrase) ? 'next' : /\b(?:this|coming)\b/.test(phrase) ? 'this' : null;
    reading.date = { weekday: known.weekday, mod };
  } else if ('day' in known || relativeDays || /\bnext\s+(?:week|month|year)\b/.test(phrase)) {
    reading.date = { ymd: [start.get('year'), start.get('month') - 1, start.get('day')], keepTime: relativeDays };
  }
  if (start.isCertain('hour')) {
    const hour = start.get('hour');
    const meridiem = start.isCertain('meridiem') || hour === 0 || hour > 12 || /\b(?:noon|midnight|tonight)\b/.test(phrase) || /\b0\d:\d\d\b/.test(phrase);
    reading.time = { hour, minute: start.get('minute') ?? 0, meridiem };
  } else {
    const period = PERIOD.exec(phrase);
    if (period) reading.period = period[1];
  }
}

module.exports = { parseEnglish };
