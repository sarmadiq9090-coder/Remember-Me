'use strict';
// CSV and iCalendar import/export for moving tasks between Remember Me and other apps.
// Parsers return plain task inputs; core.importTasks validates and saves them.
const MAX_ITEMS = 5000;
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const COLUMNS = ['title', 'notes', 'due', 'repeat', 'priority', 'tags', 'completed'];
const HEADERS = { title: ['title', 'subject', 'name', 'task', 'العنوان', 'المهمة'], notes: ['notes', 'body', 'description', 'details', 'التفاصيل', 'الملاحظات'], due: ['due', 'due date', 'date', 'start', 'reminder', 'الموعد'], repeat: ['repeat', 'التكرار'], priority: ['priority', 'الأولوية'], tags: ['tags', 'labels', 'category', 'الوسوم'] };

// Spreadsheet apps run cells that start with these characters as formulas.
const formula = /^[=+\-@\t\r]/;
function csvCell(value) {
  let text = String(value ?? '');
  if (formula.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function toCSV(tasks) {
  const rows = tasks.filter(t => !t.deletedAt).map(t => [t.title, t.body, t.dueAt || '', t.repeat === 'none' ? '' : t.repeat, t.priority, (t.tags || []).join('; '), t.completedAt || '']);
  // The byte order mark makes Excel read Arabic text as UTF-8.
  return '\ufeff' + [COLUMNS, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
function parseCSVRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function fromCSV(text) {
  const [header = [], ...rows] = parseCSVRows(text);
  const index = {};
  header.forEach((name, i) => { const key = Object.keys(HEADERS).find(k => HEADERS[k].includes(name.trim().toLowerCase())); if (key && !(key in index)) index[key] = i; });
  if (!('title' in index)) throw new Error('no title column');
  const unguard = value => (value || '').replace(/^'(?=[=+\-@\t\r])/, '');
  return rows.slice(0, MAX_ITEMS).map(row => {
    const get = key => unguard(row[index[key]]).trim();
    const due = get('due'), parsed = due ? Date.parse(due) : NaN;
    return { title: get('title'), body: get('notes'), dueAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null, repeat: get('repeat') || 'none', priority: get('priority') || 'normal', tags: get('tags').split(/[;,،]/).map(t => t.trim()).filter(Boolean) };
  });
}

function icsText(value) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
// Lines longer than 75 octets are folded with a leading space, never inside a UTF-8 character.
function fold(line) {
  const out = []; let current = '', bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) { out.push(current); current = ''; bytes = 0; }
    current += ch; bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}
const stamp = iso => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function rrule(t) {
  switch (t.repeat) {
    case 'daily': return 'FREQ=DAILY';
    case 'weekly': return 'FREQ=WEEKLY';
    case 'days': return 'FREQ=WEEKLY;BYDAY=' + (t.repeatDays || []).map(d => DAYS[d]).join(',');
    case 'interval': return 'FREQ=DAILY;INTERVAL=' + t.repeatEvery;
    case 'monthly': return 'FREQ=MONTHLY';
    case 'yearly': return 'FREQ=YEARLY';
    default: return '';
  }
}
function toICS(tasks, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Remember Me//Tasks//AR', 'CALSCALE:GREGORIAN'];
  for (const t of tasks.filter(t => t.dueAt && !t.completedAt && !t.deletedAt)) {
    const start = t.repeat === 'monthly' || t.repeat === 'yearly' ? t.repeatFrom || t.scheduleAt || t.dueAt : t.scheduleAt || t.dueAt;
    lines.push('BEGIN:VEVENT', `UID:${t.id}@remember-me`, `DTSTAMP:${stamp(now.toISOString())}`, `DTSTART:${stamp(new Date(start).toISOString())}`, 'DURATION:PT15M', `SUMMARY:${icsText(t.title)}`);
    if (t.body) lines.push(`DESCRIPTION:${icsText(t.body)}`);
    if (t.tags?.length) lines.push(`CATEGORIES:${t.tags.map(icsText).join(',')}`);
    if (rrule(t)) lines.push('RRULE:' + rrule(t));
    if (t.remindBefore) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(t.title)}`, `TRIGGER:-PT${t.remindBefore}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
function icsUnescape(value) { return value.replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c)); }
// Times with Z are UTC; times with a TZID or no zone are read as local time; dates are all-day at 09:00.
function icsDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '09', mi = '00', s = '00', z] = m;
  const date = z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)) : new Date(+y, mo - 1, +d, +h, +mi, +s);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function repeatFrom(rule) {
  const parts = Object.fromEntries(rule.split(';').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
  const every = parseInt(parts.INTERVAL || '1', 10);
  if (parts.FREQ === 'DAILY') return every > 1 ? { repeat: 'interval', repeatEvery: every } : { repeat: 'daily' };
  if (parts.FREQ === 'WEEKLY' && every === 1) {
    const days = (parts.BYDAY || '').split(',').map(d => DAYS.indexOf(d.replace(/^[+-]?\d+/, ''))).filter(d => d >= 0);
    return days.length > 1 ? { repeat: 'days', repeatDays: days } : { repeat: 'weekly' };
  }
  if (parts.FREQ === 'MONTHLY' && every === 1 && !parts.BYDAY) return { repeat: 'monthly' };
  if (parts.FREQ === 'YEARLY' && every === 1) return { repeat: 'yearly' };
  return { repeat: 'none' }; // A rule this app cannot express is imported once rather than guessed.
}
function fromICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const items = []; let current = null, depth = 0;
  for (const line of lines) {
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const [name] = line.slice(0, colon).split(';'), value = line.slice(colon + 1);
    const key = name.toUpperCase();
    if (key === 'BEGIN' && /^(VEVENT|VTODO)$/i.test(value)) { current = { title: '', body: '', dueAt: null, repeat: 'none', tags: [] }; depth = 0; continue; }
    if (!current) continue;
    if (key === 'BEGIN') { depth++; continue; }
    if (key === 'END') { if (depth) { depth--; continue; } if (/^(VEVENT|VTODO)$/i.test(value)) { items.push(current); current = null; if (items.length >= MAX_ITEMS) break; } continue; }
    if (depth) { if (key === 'TRIGGER') { const m = /^-PT?(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value); if (m) current.remindBefore = (+(m[1] || 0)) * 60 + (+(m[2] || 0)); } continue; }
    if (key === 'SUMMARY') current.title = icsUnescape(value).trim();
    else if (key === 'DESCRIPTION') current.body = icsUnescape(value).trim();
    else if ((key === 'DTSTART' || key === 'DUE') && !current.dueAt) current.dueAt = icsDate(value);
    else if (key === 'RRULE') Object.assign(current, repeatFrom(value));
    else if (key === 'CATEGORIES') current.tags = value.split(',').map(t => icsUnescape(t).trim()).filter(Boolean);
    else if (key === 'STATUS' && /^(COMPLETED|CANCELLED)$/i.test(value)) current.skip = true;
  }
  return items.filter(i => !i.skip).map(({ skip, ...item }) => item);
}
module.exports = { MAX_ITEMS, toCSV, fromCSV, toICS, fromICS };
