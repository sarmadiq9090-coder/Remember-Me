const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialState, saveTask, importTasks, dueTasks } = require('../src/core/tasks');
const { toCSV, fromCSV, toICS, fromICS } = require('../src/data/interchange');

test('CSV export round-trips Arabic, quotes, commas and line breaks, and defuses spreadsheet formulas', () => {
  const s = initialState();
  saveTask(s, { title: 'مراجعة، "الخطة"', body: 'سطر أول\nسطر ثانٍ', dueAt: '2026-11-01T09:00:00.000Z', repeat: 'daily', priority: 'high', tags: ['عمل', 'مهم'] });
  saveTask(s, { title: '=HYPERLINK("http://x","click")', body: '+1' });
  const csv = toCSV(s.tasks);
  assert.ok(csv.startsWith('﻿'), 'BOM so Excel reads UTF-8');
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""click"")"`) && csv.includes(",'+1,"), 'Formulas are prefixed with an apostrophe');
  const back = fromCSV(csv);
  assert.deepEqual(back.map(t => [t.title, t.body, t.dueAt, t.repeat, t.priority, t.tags]), [
    ['مراجعة، "الخطة"', 'سطر أول\nسطر ثانٍ', '2026-11-01T09:00:00.000Z', 'daily', 'high', ['عمل', 'مهم']],
    ['=HYPERLINK("http://x","click")', '+1', null, 'none', 'normal', []],
  ]);
  assert.deepEqual(fromCSV('العنوان,الموعد\r\nمهمة,2026-11-02T10:00:00Z\r\n').map(t => [t.title, t.dueAt]), [['مهمة', '2026-11-02T10:00:00.000Z']], 'Arabic headers');
  assert.throws(() => fromCSV('a,b\n1,2'), /title/);
});

test('iCalendar export writes events with repeat rules and alarms, folded and escaped', () => {
  const s = initialState();
  saveTask(s, { title: 'اجتماع; أسبوعي, مهم', body: 'جدول\nالأعمال', dueAt: '2026-11-01T09:00:00.000Z', repeat: 'days', repeatDays: [0, 4], remindBefore: 15 });
  saveTask(s, { title: 'كل ثلاثة أيام '.repeat(8), dueAt: '2026-11-01T09:00:00.000Z', repeat: 'interval', repeatEvery: 3 });
  saveTask(s, { title: 'بلا موعد' });
  const ics = toICS(s.tasks, new Date('2026-10-24T00:00:00Z'));
  assert.ok(ics.includes('SUMMARY:اجتماع\\; أسبوعي\\, مهم') && ics.includes('DESCRIPTION:جدول\\nالأعمال'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=SU,TH') && ics.includes('RRULE:FREQ=DAILY;INTERVAL=3') && ics.includes('TRIGGER:-PT15M'));
  assert.ok(ics.includes('DTSTART:20261101T090000Z'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'Tasks without a time are not calendar events');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'Folded to 75 octets: ' + line);
  const back = fromICS(ics);
  assert.deepEqual(back.map(t => [t.title.slice(0, 12), t.repeat, t.repeatDays || t.repeatEvery || null]), [['اجتماع; أسبو', 'days', [0, 4]], ['كل ثلاثة أيا', 'interval', 3]]);
  assert.equal(back[0].remindBefore, 15);
});

test('iCalendar import reads common calendar exports and skips what it cannot express', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Dentist', 'DTSTART;TZID=Asia/Baghdad:20261105T163000', 'DESCRIPTION:Bring the ', ' card', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261201', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Every other week', 'DTSTART:20261101T080000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2', 'END:VEVENT',
    'BEGIN:VTODO', 'SUMMARY:Done already', 'STATUS:COMPLETED', 'END:VTODO', 'END:VCALENDAR'].join('\r\n');
  const items = fromICS(ics);
  assert.deepEqual(items.map(i => i.title), ['Dentist', 'Holiday', 'Every other week']);
  assert.equal(items[0].body, 'Bring the card', 'Folded lines are joined');
  assert.equal(new Date(items[0].dueAt).getHours(), 16, 'TZID times are read as local time');
  assert.equal(new Date(items[1].dueAt).getHours(), 9, 'All-day dates get a morning reminder');
  assert.equal(items[2].repeat, 'none', 'An unsupported rule is imported once instead of guessed');
});

test('importing never floods the alert queue: past one-time items are skipped and past repeats resume', () => {
  const s = initialState(), now = new Date('2026-10-24T12:00:00Z');
  const result = importTasks(s, [
    { title: 'قادم', dueAt: '2026-10-25T09:00:00.000Z' },
    { title: 'فائت', dueAt: '2026-10-01T09:00:00.000Z' },
    { title: 'يومي قديم', dueAt: '2026-01-01T09:00:00.000Z', repeat: 'daily' },
    { title: '', dueAt: '2026-10-25T09:00:00.000Z' },
    { title: 'x'.repeat(500) },
    { title: 'سيئ', dueAt: 'not a date' },
  ], now);
  assert.deepEqual(result, { added: 3, skipped: 3 });
  assert.equal(dueTasks(s, now).length, 0);
  const daily = s.tasks.find(t => t.title === 'يومي قديم');
  assert.ok(Date.parse(daily.dueAt) > now.getTime() && daily.scheduleAt === daily.dueAt);
  assert.equal(s.tasks.find(t => t.title.startsWith('xxx')).title.length, 200);
});
