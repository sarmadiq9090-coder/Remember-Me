'use strict';
// Reads Arabic date and time phrases in a quick-add title: Modern Standard Arabic and everyday
// Iraqi, Gulf and Levantine speech, with Arabic-Indic or Western (123) digits.
// «بكرة 5 العصر», «باچر الصبح», «بعد ساعتين», «الخميس الجاي 8 بالليل», «كل يوم 7 الصبح», «بعد بكرة»,
// «اليوم المغرب». Returns a reading for resolve() in natural-dates.js, or null when there is none.
// Nothing here guesses a day or AM/PM: what is unclear is left open, and resolve() asks.

// Letters are compared after normalize(): no diacritics or tatweel, أ/إ/آ → ا, ى → ي, ة → ه,
// چ → ج, گ → ك, ڤ → ف, and Arabic-Indic or Persian digits → 0-9. map[i] is the typed index of
// normalized character i, so the matched words can be cut out of the title exactly as typed.
const LETTERS = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ة': 'ه', 'چ': 'ج', 'گ': 'ك', 'ک': 'ك', 'ڤ': 'ف', '٫': ':', '،': ',' };
function normalize(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i], code = c.charCodeAt(0);
    if (MARKS.test(c)) continue;
    const n = code >= 0x0660 && code <= 0x0669 ? String(code - 0x0660) : code >= 0x06F0 && code <= 0x06F9 ? String(code - 0x06F0) : LETTERS[c] ?? c.toLowerCase();
    out += n; map.push(i);
  }
  map.push(text.length);
  return { text: out, map };
}

const MARKS = /[\u064B-\u065F\u0670\u0640]/;
const L = '(?<![\\p{L}\\p{N}])', R = '(?![\\p{L}\\p{N}])';
const alt = list => list.slice().sort((a, b) => b.length - a.length).join('|');
// Number words for counts and hours, in the normalized spelling.
const NUMBER_WORDS = [
  [1, ['واحد', 'واحده']], [2, ['اثنين', 'اتنين', 'ثنين', 'اثنتين', 'ثنتين']], [3, ['ثلاث', 'ثلاثه', 'تلات', 'تلاته']],
  [4, ['اربع', 'اربعه']], [5, ['خمس', 'خمسه']], [6, ['ست', 'سته']], [7, ['سبع', 'سبعه']],
  [8, ['ثمان', 'ثماني', 'ثمانيه', 'ثمن', 'ثمنيه', 'تمن', 'تمنيه', 'تمانيه', 'ثمانه']], [9, ['تسع', 'تسعه']], [10, ['عشر', 'عشره']],
  // Ordinal hours, as in «الساعة الخامسة».
  [1, ['الواحده']], [2, ['الثانيه']], [3, ['الثالثه']], [4, ['الرابعه']], [5, ['الخامسه']], [6, ['السادسه']], [7, ['السابعه']],
  [8, ['الثامنه']], [9, ['التاسعه']], [10, ['العاشره']],
  [11, ['الحاديه عشره', 'الحاديه عشر', 'احدعشر', 'احد عشر', 'احدعش', 'حدعش', 'حداش', 'احداش']], [12, ['اثنا عشر', 'اثني عشر', 'اثنعش', 'اطنعش', 'ثنعش', 'اتناش', 'طنعش', 'الثانيه عشره', 'الثانيه عشر']],
];
const WORD_VALUE = new Map(NUMBER_WORDS.flatMap(([value, words]) => words.map(word => [word, value])));
const NUMBER = `\\d{1,2}|${alt([...WORD_VALUE.keys()].map(w => w.replace(/ /g, '\\s+')))}`;
const numberValue = text => (/^\d+$/.test(text) ? Number(text) : WORD_VALUE.get(text.replace(/\s+/g, ' ')));

// Weekdays (0 = Sunday), written with ال or after يوم / كل.
const WEEKDAYS = [['احد'], ['اثنين', 'اتنين', 'ثنين'], ['ثلاثاء', 'ثلاثا', 'ثلاثه', 'تلاتاء', 'تلاتا', 'تلات', 'ثلثاء'],
  ['اربعاء', 'اربعا', 'اربعه'], ['خميس'], ['جمعه'], ['سبت']];
const WEEKDAY = alt(WEEKDAYS.flat());
const weekdayOf = word => WEEKDAYS.findIndex(forms => forms.includes(word));
const NEXT = alt(['الجاي', 'الجايه', 'الجاييه', 'الياي', 'اليايه', 'القادم', 'القادمه', 'المقبل', 'المقبله', 'اللي جاي', 'الي جاي', 'اللي ياي']);
const THIS = alt(['هذا', 'هذي', 'هاي', 'هاد', 'هذه', 'هادا', 'هاذا']);
const PAST = alt(['الماضي', 'الماضيه', 'اللي فات', 'الي فات', 'الفايت', 'الفات', 'اللي راح']);

// Times of day. hour(h) turns a 1-12 hour into 0-23 for that part of the day; at is the time used
// when the phrase names only the part of the day, and late marks hours that belong to the next day.
const PERIODS = [
  { words: ['الفجر', 'فجرا', 'بالفجر'], at: 5, hour: h => (h === 12 ? 0 : h) },
  { words: ['الصبح', 'الصباح', 'بالصبح', 'بالصباح', 'صباحا', 'صباح', 'صبحا', 'ص', 'am', 'a.m.'], at: 9, hour: h => (h === 12 ? 0 : h) },
  { words: ['الضحي', 'ضحي', 'بالضحي'], at: 10, hour: h => (h === 12 ? 0 : h) },
  { words: ['الظهر', 'ظهرا', 'بالظهر', 'الضهر', 'ضهرا', 'بالضهر', 'الظهريه', 'الضهريه'], at: 12, hour: h => (h >= 11 ? h : h + 12) },
  { words: ['بعد الظهر', 'بعد الضهر'], at: 15, hour: h => (h === 12 ? 12 : h + 12) },
  { words: ['العصر', 'عصرا', 'بالعصر', 'العصريه', 'عصريه'], at: 16, hour: h => (h === 12 ? 12 : h + 12) },
  { words: ['المغرب', 'بالمغرب', 'مغربا'], at: 18, hour: h => (h === 12 ? 12 : h + 12) },
  { words: ['المسا', 'المساء', 'بالمسا', 'بالمساء', 'مساء', 'مساءا', 'مسا', 'العشيه', 'عشيه', 'م', 'pm', 'p.m.'], at: 18, hour: h => (h === 12 ? 12 : h + 12) },
  { words: ['العشا', 'العشاء', 'بالعشا', 'بالعشاء'], at: 20, hour: h => (h >= 6 && h < 12 ? h + 12 : h === 12 ? 0 : h), late: h => h < 6 || h === 12 },
  { words: ['الليل', 'بالليل', 'ليلا', 'بليل'], at: 21, hour: h => (h >= 6 && h < 12 ? h + 12 : h === 12 ? 0 : h), late: h => h < 6 || h === 12 },
  { words: ['نص الليل', 'نصف الليل', 'منتصف الليل', 'بنص الليل'], at: 0, late: () => true, hour: h => (h === 12 ? 0 : h) },
];
const periodOf = word => PERIODS.find(p => p.words.includes(word.replace(/\s+/g, ' ')));
// One-letter and Latin marks only count right after a number.
const PERIOD_ALONE = alt(PERIODS.flatMap(p => p.words).filter(w => w.length > 2 && !/^[a-z.]+$/.test(w)).map(w => w.replace(/ /g, '\\s+')));
const PERIOD_AFTER = alt(PERIODS.flatMap(p => p.words).map(w => w.replace(/ /g, '\\s+').replace(/\./g, '\\.')));

const re = source => new RegExp(source, 'gu');
const RULES = {
  // «كل خميس», «كل يوم أحد وأربعاء», «كل الاثنين والخميس»
  everyWeekday: re(`${L}كل\\s+(?:يوم\\s+)?((?:ال)?(?:${WEEKDAY})(?:\\s*(?:و|,)\\s*(?:يوم\\s+)?(?:ال)?(?:${WEEKDAY}))*)${R}`),
  everyN: re(`${L}كل\\s+(${NUMBER})\\s*(ايام|يوم|اسابيع|اسبوع)${R}`),
  everyTwo: re(`${L}كل\\s+(يومين|اسبوعين)${R}`),
  // «كل يوم», «يوميا», «كل صباح», «كل ليله»
  daily: re(`${L}(?:كل\\s+(?:يوم|(صباح|ليله|مسا|مساء|عصر|ظهر))|يوميا)${R}`),
  weekly: re(`${L}(?:كل\\s+اسبوع|اسبوعيا)${R}`),
  monthly: re(`${L}(?:كل\\s+شهر|شهريا)${R}`),
  yearly: re(`${L}(?:كل\\s+(?:سنه|عام)|سنويا)${R}`),
  // «بعد بكرة», «عقب باچر», «بعد غد»
  afterTomorrow: re(`${L}(?:بعد|عقب)\\s+(?:بكره|بكرا|باجر|باكر|غدا|غد|الغد)${R}`),
  // «بعد ساعتين», «بعد نص ساعة», «كمان 10 دقايق», «بعد 3 أيام», «بعد أسبوع»
  relative: re(`${L}(?:بعد|كمان|خلال)\\s+(?:حوالي\\s+)?(?:(نص|نصف|ربع)\\s*ساعه|(ساعتين|ساعتان|ساعه|دقيقتين|دقيقتان|دقيقه|يومين|يومان|يوم|اسبوعين|اسبوع|شهرين|شهر)|(${NUMBER})\\s*(ساعات|ساعه|دقايق|دقائق|دقيقه|ايام|يوم|اسابيع|اسبوع|اشهر|شهور|شهر))(?:\\s*(?:و\\s*(نص|نصف|ربع)|الا\\s*(ربع)))?${R}`),
  tomorrow: re(`${L}(?:و|ب|وب)?(?:بكره|بكرا|باجر|باكر|غدا|الغد|غدوه)${R}`),
  tonight: re(`${L}(?:و|ب)?(?:الليله|هالليله)${R}`),
  today: re(`${L}(?:و|ب)?(?:اليوم|هاليوم)${R}`),
  // «الخميس الجاي», «يوم الأحد», «هالجمعة», «الخميس من الأسبوع الجاي», «السبت هذا»
  weekday: re(`${L}(?:(${THIS})\\s+)?(?:(?:في|ب)?يوم\\s+)?(?:(?:و|ب|ف|ل)?(ال|هال)(${WEEKDAY})|(?<=يوم\\s+)(${WEEKDAY}))(?:\\s+(?:(${NEXT})|(${THIS})|(?:(?:من|في|ب)\\s*)?(?:ال)?اسبوع\\s+(${NEXT})|(${PAST})))?${R}`),
  nextWeek: re(`${L}(?:ال)?اسبوع\\s+(?:${NEXT})${R}`),
  // «5 العصر», «الساعة 8», «7:30 الصبح», «خمسة ونص المغرب», «عالساعة 4 إلا ربع», «10م»
  time: re(`${L}((?:(?:على|علي|ع|ب)\\s*)?(?:ال)?ساعه\\s*|(?:على|علي)\\s+|عال)?(${NUMBER})(?:\\s*[:.]\\s*(\\d{2}))?(?:\\s*(?:و\\s*(نص|نصف|ربع|ثلث)|(?:الا|غير)\\s*(ربع|ثلث)|و\\s*(\\d{1,2})\\s*(?:دقيقه|دقايق|دقائق)?))?(?:\\s*(${PERIOD_AFTER}))?(?![\\p{L}\\p{N}])`),
  period: re(`${L}(${PERIOD_ALONE})${R}`),
};
const DAY_IN_LIST = new RegExp(`(?<![\\p{L}])(?:و)?(?:ال)?(${WEEKDAY})(?![\\p{L}])`, 'gu');
const FRACTION = { 'نص': 30, 'نصف': 30, 'ربع': 15, 'ثلث': 20 };

function parseArabic(text) {
  if (!/[؀-ۿ]/.test(text)) return null;
  const { text: n, map } = normalize(text);
  const used = [];             // normalized [start, end) of every phrase taken, also ignored ones
  const spans = [];            // the phrases that are part of the date, cut from the title
  const reading = { date: null, time: null, instant: null, repeat: null, late: false };
  const free = (s, e) => !used.some(([a, b]) => s < b && e > a);
  // Runs one rule over the parts of the text no other rule took. take() returns false to skip a match.
  const each = (rule, take) => {
    for (const m of n.matchAll(rule)) {
      const s = m.index, e = s + m[0].length;
      if (!free(s, e)) continue;
      const kept = take(m, s, e);
      if (kept === false) continue;
      used.push([s, e]);
      if (kept !== 'ignore') spans.push([s, e]);
    }
  };
  // Counted repeats first: «كل ثلاثة أيام» is every three days, not every Tuesday («الثلاثة»).
  each(RULES.everyN, m => {
    const count = numberValue(m[1]) * (/اسبوع|اسابيع/.test(m[2]) ? 7 : 1);
    if (reading.repeat || !count || count > 365) return false;
    reading.repeat = count === 1 ? { repeat: 'daily' } : count === 7 ? { repeat: 'weekly' } : { repeat: 'interval', repeatEvery: count };
  });
  each(RULES.everyTwo, m => { if (reading.repeat) return false; reading.repeat = { repeat: 'interval', repeatEvery: m[1] === 'يومين' ? 2 : 14 }; });
  each(RULES.everyWeekday, m => {
    if (reading.repeat) return false;
    const days = [...new Set([...m[1].matchAll(DAY_IN_LIST)].map(x => weekdayOf(x[1])).filter(d => d >= 0))].sort();
    if (!days.length) return false;
    reading.repeat = days.length === 1 ? { repeat: 'weekly' } : { repeat: 'days', repeatDays: days };
    reading.date = days.length === 1 ? { weekday: days[0], mod: 'repeat' } : { days };
  });
  each(RULES.daily, m => {
    if (reading.repeat) return false;
    reading.repeat = { repeat: 'daily' };
    if (m[1]) reading.period = { 'صباح': PERIODS[1], 'ليله': PERIODS[9], 'مسا': PERIODS[7], 'مساء': PERIODS[7], 'عصر': PERIODS[5], 'ظهر': PERIODS[3] }[m[1]];
  });
  for (const [rule, repeat] of [[RULES.weekly, 'weekly'], [RULES.monthly, 'monthly'], [RULES.yearly, 'yearly']]) each(rule, () => { if (reading.repeat) return false; reading.repeat = { repeat }; });

  const setDate = date => { if (reading.date) return false; reading.date = date; };
  each(RULES.afterTomorrow, () => setDate({ offset: 2 }));
  each(RULES.relative, m => {
    if (reading.instant || reading.date) return false;
    const unit = m[2] || m[4];
    const count = m[1] ? 1 : m[3] ? numberValue(m[3]) : /^(ساعتين|ساعتان|دقيقتين|دقيقتان|يومين|يومان|اسبوعين|شهرين)$/.test(unit) ? 2 : 1;
    if (!count) return false;
    const extra = m[5] ? FRACTION[m[5]] : m[6] ? -15 : 0;
    if (/ساع/.test(unit) || m[1]) { reading.instant = { minutes: m[1] ? FRACTION[m[1]] : count * 60 + extra }; return; }
    if (/دقي|دقا/.test(unit)) { reading.instant = { minutes: count }; return; }
    if (/شهر|اشهر|شهور/.test(unit)) { reading.date = { months: count }; return; }
    reading.date = { offset: count * (/اسبوع|اسابيع/.test(unit) ? 7 : 1), keepTime: true };
  });
  each(RULES.tomorrow, () => setDate({ offset: 1 }));
  each(RULES.tonight, () => { if (setDate({ offset: 0 }) === false) return false; reading.period ??= PERIODS[9]; });
  each(RULES.today, () => setDate({ offset: 0 }));
  each(RULES.weekday, m => {
    // A past day («الخميس الماضي») is not a reminder time: leave it in the title.
    if (m[8]) return 'ignore';
    const day = weekdayOf(m[3] || m[4]);
    if (day < 0) return false;
    if (reading.date?.mod === 'repeat') return reading.date.weekday === day ? undefined : false;
    if (reading.date) return false;
    reading.date = { weekday: day, mod: m[7] ? 'nextWeek' : m[5] ? 'next' : m[1] || m[6] || m[2] === 'هال' ? 'this' : null };
  });
  each(RULES.nextWeek, () => setDate({ offset: 7 }));

  // A bare number is a time only when it is clearly one: after «الساعة» or «على», with minutes or a
  // part of the day, or right after a day word («بكرة 5»). «اشتري 5 كيلو» keeps its number.
  const afterDay = s => spans.some(([, e]) => e <= s && /^\s*(?:(?:على|علي|ع|في)\s+)?$/u.test(n.slice(e, s)));
  each(RULES.time, (m, s) => {
    if (reading.time || reading.instant) return false;
    let hour = numberValue(m[2].replace(/\s+/g, ' ')), minute = m[3] ? Number(m[3]) : 0;
    if (hour === undefined) return false;
    const fraction = m[4] ? FRACTION[m[4]] : m[5] ? -FRACTION[m[5]] : m[6] ? Number(m[6]) : 0;
    // «كل ليلة 10», «الليلة 10»: the part of the day named before the number applies to it.
    const named = m[7] ? periodOf(m[7]) : null, period = named || reading.period || null;
    const clear = m[1] || m[3] || m[4] || m[5] || m[6] || named;
    if (!clear && !afterDay(s)) return false;
    // Words are 1-12; a typed 0-23 hour is a 24-hour time.
    if (hour > 23 || minute > 59 || fraction > 59) return false;
    minute += fraction;
    if (minute < 0) { minute += 60; hour = (hour + 23) % 24; }
    if (period && hour >= 1 && hour <= 12) {
      reading.late = !!period.late?.(hour);
      hour = period.hour(hour);
    } else if (period && hour === 0) reading.late = !!period.late?.(12);
    const certain = !!period || hour === 0 || hour > 12 || (!!m[3] && /^0\d$/.test(m[2]));
    reading.time = { hour, minute, meridiem: certain };
    if (period) reading.period = null;
  });
  each(RULES.period, m => {
    if (reading.time || reading.instant) return false;
    const period = periodOf(m[1]);
    if (!period) return false;
    reading.period = period;
  });
  if (!reading.time && reading.period) {
    reading.time = { hour: reading.period.at, minute: 0, meridiem: true };
    reading.late = !!reading.period.late?.(reading.period.at);
  }
  delete reading.period;
  if (!spans.length || (!reading.date && !reading.time && !reading.instant && !reading.repeat)) return null;
  // A cut phrase takes its trailing marks with it («مساءً»).
  const end = i => { while (i < text.length && MARKS.test(text[i])) i++; return i; };
  reading.spans = spans.map(([s, e]) => [map[s], end(map[e - 1] + 1)]);
  return reading;
}

module.exports = { parseArabic, normalize };
