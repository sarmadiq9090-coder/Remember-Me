const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { NEW_ISSUE, scrub, cleanLine, readLogTail, buildReport } = require('../src/platform/problem-report');
const { createLogger } = require('../src/platform/logger');
const { createProblems, REPEATED, WINDOW_MS } = require('../src/main/problems');

const HOME = 'C:\\Users\\Sam Lee', DATA = 'C:\\Users\\Sam Lee\\AppData\\Roaming\\Remember Me';
const FOLDERS = [[DATA, '<data folder>'], [HOME, '<user folder>']];
const base = { version: '1.6.0', packaged: true, windows: '10.0.26200', arch: 'x64', language: 'ar', theme: 'dark', folders: FOLDERS };
const line = (event, extra = {}) => JSON.stringify({ time: '2026-10-30T10:00:00.000Z', level: 'info', event, ...extra });
const params = url => new URL(url).searchParams;

test('scrub removes the data folder, the user profile and other users’ folders in every spelling', () => {
  for (const text of [`${DATA}\\data.json`, DATA.replace(/\\/g, '/') + '/x', DATA.replace(/\\/g, '\\\\'), 'file:///' + DATA.replace(/\\/g, '/').toLowerCase()]) {
    const clean = scrub(`failed at ${text}`, FOLDERS);
    assert.doesNotMatch(clean, /Sam|Users|Roaming/i, text);
  }
  assert.equal(scrub(`in ${HOME}`, FOLDERS), 'in <user folder>');
  assert.doesNotMatch(scrub('see D:/Users/Other/file.txt and C:\\Users\\bob', []), /Other|bob/);
  assert.doesNotMatch(scrub('\\\\server\\share\\Sam\\notes.txt', []), /Sam|notes/);
  assert.equal(scrub('could not save «Buy milk» or "Plan.docx"', []), 'could not save «…» or "…"');
});

test('log lines keep the logger’s fields and lose paths, quoted text and anything that is not its JSON', () => {
  const clean = JSON.parse(cleanLine(line('action-failed', { level: 'warn', action: 'saveTask', error: `ENOENT: open '${DATA}\\attachments\\x.pdf'`, at: [`save (${DATA}\\app\\store.js:10:5)`], count: 3, ok: false }), FOLDERS));
  assert.equal(clean.event, 'action-failed');
  assert.equal(clean.count, 3);
  assert.equal(clean.ok, false);
  assert.doesNotMatch(JSON.stringify(clean), /Sam|x\.pdf|attachments/);
  assert.equal(cleanLine('C:\\Users\\Sam\\secret.txt was opened', FOLDERS), null);
  assert.equal(cleanLine('[1,2]', FOLDERS), null);
  assert.equal(cleanLine(JSON.stringify({ time: 'x' }), FOLDERS), null, 'A line without an event is left out');
  assert.doesNotMatch(cleanLine(JSON.stringify({ event: 'x', nested: { title: 'Buy milk' }, 'bad key!': 'Buy milk' }), FOLDERS), /milk/);
});

test('the report opens issues/new with the version, Windows, language, theme and the newest log lines', () => {
  const lines = Array.from({ length: 40 }, (_, i) => line('tick', { n: i }));
  const report = buildReport({ ...base, kind: 'crash', cause: 'render-process-gone: crashed', lines });
  assert.ok(report.url.startsWith(NEW_ISSUE + '?'));
  const { title, body } = Object.fromEntries(params(report.url));
  assert.equal(title, 'Crash (render-process-gone: crashed) in Remember Me 1.6.0');
  assert.equal(body, report.body);
  for (const text of ['- Remember Me 1.6.0', '- Windows 11 (10.0.26200) x64', '- UI language: ar', '- Theme: dark', '### What happened?', 'Recent log lines (30 of 30, redacted)']) assert.ok(body.includes(text), text);
  assert.ok(body.includes('"n":39') && body.includes('"n":10') && !body.includes('"n":9}'), 'Only the newest 30 lines');
  assert.equal(report.truncated, false);
  assert.equal(report.lines, 30);
});

test('a manual report has an empty "What happened?" section and the same diagnostics', () => {
  const report = buildReport({ ...base, packaged: false, lines: [] });
  assert.equal(report.title, 'Problem in Remember Me 1.6.0');
  assert.match(report.body, /### What happened\?\n\n<!--[^\n]*-->\n\n### Details/);
  assert.match(report.body, /development build/);
  assert.match(report.body, /The app log is empty/);
});

test('a long log is cut from the oldest line to keep the URL short, and the issue says so', () => {
  const lines = Array.from({ length: 30 }, (_, i) => line('action-failed', { n: i, error: 'x'.repeat(280) }));
  const report = buildReport({ ...base, lines });
  assert.ok(report.url.length <= 7000, String(report.url.length));
  assert.equal(report.truncated, true);
  assert.ok(report.lines > 0 && report.lines < 30);
  assert.match(report.body, new RegExp(`Recent log lines \\(${report.lines} of 30, redacted\\)`));
  assert.match(report.body, new RegExp(`Truncated: the ${30 - report.lines} oldest lines were left out`));
  assert.ok(report.body.includes('"n":29'), 'The newest line stays');
  assert.ok(buildReport({ ...base, lines, maxUrl: 3000 }).url.length <= 3000);
});

test('nothing from a task, note or attachment, or a user path, reaches the report', () => {
  const log = createLogger(fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-report-')));
  log.error('attach-failed', new Error(`Could not copy «Tax return 2026» from ${HOME}\\Documents\\tax.pdf`), { id: 'abc' });
  log.warn('open-failed', Object.assign(new Error(`EPERM: '${DATA}\\attachments\\x'`), { code: 'EPERM' }));
  const report = buildReport({ ...base, kind: 'errors', cause: `failed in ${DATA}`, lines: [...readLogTail(log.file), `${HOME}\\Desktop\\diary.txt`] });
  const decoded = decodeURIComponent(report.url);
  for (const secret of ['Tax return', 'tax.pdf', 'Sam', 'Users', 'diary', 'AppData']) assert.ok(!decoded.includes(secret), secret);
  assert.match(report.body, /"event":"attach-failed"/);
  assert.match(report.body, /"code":"EPERM"/);
});

test('readLogTail reads the newest lines, continuing into the rotated file', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-tail-')), file = path.join(folder, 'remember-me.log');
  fs.writeFileSync(`${file}.1`, ['a', 'b', 'c'].join('\n') + '\n');
  fs.writeFileSync(file, ['d', 'e'].join('\n') + '\n');
  assert.deepEqual(readLogTail(file, 4), ['b', 'c', 'd', 'e']);
  assert.deepEqual(readLogTail(file, 2), ['d', 'e']);
  assert.deepEqual(readLogTail(path.join(folder, 'missing.log')), []);
});

// A main-process context with fake Electron parts.
function fakeContext({ answer = 0 } = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-problems-'));
  const app = Object.assign(new EventEmitter(), { getVersion: () => '1.6.0', isPackaged: true, isReady: () => true, getPath: () => folder });
  const opened = [], asked = [];
  const ctx = { app, log: createLogger(folder), testMode: false, quitting: false, language: () => 'en', tr: text => text,
    store: { state: { settings: { theme: 'light' } } },
    electron: { shell: { openExternal: async url => { opened.push(url); } }, dialog: { showMessageBox: async (win, options) => { asked.push(options); return { response: answer }; } } } };
  return { ctx, opened, asked, processEvents: new EventEmitter() };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a renderer crash is logged and offers a report once; Report opens the pre-filled issue', async () => {
  const { ctx, opened, asked, processEvents } = fakeContext();
  createProblems(ctx, { processEvents }).install();
  ctx.app.emit('render-process-gone', {}, {}, { reason: 'crashed', exitCode: 5 });
  await settle(); await settle();
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].buttons, ['Report this problem', 'Not now']);
  assert.equal(opened.length, 1);
  assert.equal(params(opened[0]).get('title'), 'Crash (render-process-gone: crashed) in Remember Me 1.6.0');
  assert.match(params(opened[0]).get('body'), /"event":"render-process-gone".*"reason":"crashed"/);
  ctx.app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 1 });
  await settle();
  assert.equal(asked.length, 1, 'Asked once per run');
  assert.match(fs.readFileSync(ctx.log.file, 'utf8'), /"event":"child-process-gone".*"type":"GPU"/);
});

test('a clean exit is only logged, and repeated errors within 10 minutes offer a report', async () => {
  let time = 0;
  const { ctx, opened, asked, processEvents } = fakeContext({ answer: 1 });
  createProblems(ctx, { processEvents, now: () => time }).install();
  ctx.app.emit('render-process-gone', {}, {}, { reason: 'clean-exit', exitCode: 0 });
  processEvents.emit('unhandledRejection', new Error('one'));
  time += WINDOW_MS;
  for (let i = 1; i < REPEATED; i++) processEvents.emit('unhandledRejection', 'two');
  await settle();
  assert.equal(asked.length, 0, 'The first error has aged out');
  time += 1000;
  ctx.log.error('trash-purge-failed', new Error('three'));
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(asked[0].message, 'Remember Me ran into several errors.');
  assert.equal(opened.length, 0, 'Not now opens nothing');
  const log = fs.readFileSync(ctx.log.file, 'utf8');
  assert.match(log, /"level":"warn","event":"render-process-gone"/);
  assert.match(log, /"event":"unhandled-rejection"/);
});

test('an uncaught exception is logged; test runs never show the dialog; a manual report always opens', async () => {
  const { ctx, opened, asked, processEvents } = fakeContext();
  ctx.testMode = true;
  const problems = createProblems(ctx, { processEvents });
  problems.install();
  processEvents.emit('uncaughtException', new Error('boom'));
  await settle();
  assert.equal(asked.length, 0);
  assert.match(fs.readFileSync(ctx.log.file, 'utf8'), /"level":"error","event":"uncaught-exception","error":"boom"/);
  await problems.openReport();
  assert.equal(opened.length, 1);
  assert.equal(params(opened[0]).get('title'), 'Problem in Remember Me 1.6.0');
  assert.match(params(opened[0]).get('body'), /- Theme: light/);
});
