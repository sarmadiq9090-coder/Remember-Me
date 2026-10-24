const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, redact } = require('../src/platform/logger');
const { saveTask } = require('../src/core/tasks');
const { Store } = require('../src/core/store');
const { DriveBackup } = require('../src/data/drive-backup');
const { importFiles, attachmentPath } = require('../src/data/attachments');

test('the log rotates at its size limit and keeps three files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-log-'));
  const log = createLogger(dir, { maxBytes: 2000 });
  for (let i = 0; i < 100; i++) log.info('tick', { i });
  const names = fs.readdirSync(log.folder).sort();
  assert.deepEqual(names, ['remember-me.log', 'remember-me.log.1', 'remember-me.log.2']);
  for (const name of names) assert.ok(fs.statSync(path.join(log.folder, name)).size <= 2000, name);
  const last = fs.readFileSync(log.file, 'utf8').trim().split('\n').map(line => JSON.parse(line)).at(-1);
  assert.deepEqual([last.level, last.event, last.i], ['info', 'tick', 99]);
  assert.ok(Number.isFinite(Date.parse(last.time)));
});

test('error messages lose quoted titles, file names and paths, and logging never throws', () => {
  assert.equal(redact('ملف «فاتورة الكهرباء.pdf» غير موجود'), 'ملف «…» غير موجود');
  assert.equal(redact('The backup is damaged: "diary.pdf" does not match'), 'The backup is damaged: "…" does not match');
  assert.equal(redact("ENOENT: no such file or directory, open 'C:\\Users\\me\\AppData\\Roaming\\Waqt\\attachments\\x\\secret.pdf'"), "ENOENT: no such file or directory, open '…'");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-log-'));
  const log = createLogger(dir);
  const error = Object.assign(new Error('تعذّر فتح «مذكرات خاصة»'), { code: 'EPERM' });
  log.error('action-failed', error, { action: 'openAttachment' });
  const entry = JSON.parse(fs.readFileSync(log.file, 'utf8'));
  assert.deepEqual([entry.event, entry.action, entry.code, entry.error], ['action-failed', 'openAttachment', 'EPERM', 'تعذّر فتح «…»']);
  assert.ok(entry.at.every(frame => frame.startsWith('at ')), 'Only code locations from the stack');
  assert.ok(entry.at.some(frame => /\(logger\.test\.js:\d+:\d+\)/.test(frame)), entry.at.join());
  assert.ok(entry.at.every(frame => !frame.includes(os.homedir()) && !frame.includes('\\')), 'No folders, so no user name');
  fs.writeFileSync(path.join(dir, 'blocked'), 'a file where a folder should be');
  assert.doesNotThrow(() => createLogger(path.join(dir, 'blocked')).error('x', new Error('y')));
});

test('a Drive backup is logged with counts only, never task titles or attachment names', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-log-drive-'));
  const data = path.join(root, 'data'), sync = path.join(root, 'Drive');
  fs.mkdirSync(sync);
  const store = new Store(data);
  const source = path.join(root, 'كشف الحساب السري.pdf'); fs.writeFileSync(source, 'x');
  const [record] = await importFiles(data, [source]);
  store.change(s => { s.attachments.push(record); saveTask(s, { title: 'موعد الطبيب الخاص', body: 'تفاصيل شخصية', attachments: [record.id] }); });
  fs.unlinkSync(attachmentPath(data, record));
  const log = createLogger(data);
  const backup = new DriveBackup(data, () => store.state, () => {}, { log });
  await backup.configure(sync);
  await backup.run();
  fs.renameSync(sync, sync + '.away');
  await assert.rejects(backup.run());
  const text = fs.readFileSync(log.file, 'utf8');
  const events = text.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(e => e.event), ['drive-backup', 'drive-backup-failed']);
  assert.equal(events[0].skipped, 1);
  for (const secret of ['الطبيب', 'شخصية', 'كشف الحساب', 'Drive.away', root]) assert.ok(!text.includes(secret), secret);
});

test('stack frames keep only the file name, even when folders contain spaces or brackets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-log-frames-'));
  const log = createLogger(dir);
  const error = new Error('x');
  error.stack = ['Error: x',
    String.raw`    at saveTask (C:\Users\John Smith\AppData\Local\Programs\Remember Me\resources\app.asar\src\core\tasks.js:10:5)`,
    String.raw`    at C:\Users\Ali (Work)\AppData\Local\Programs\Remember Me\resources\app.asar\src\main\ipc.js:3:7`,
    '    at load (file:///C:/Users/John Smith/Remember Me/ui/main/boot.js:1:2)'].join('\n');
  log.warn('action-failed', error);
  const entry = JSON.parse(fs.readFileSync(log.file, 'utf8'));
  assert.deepEqual(entry.at, ['at saveTask (tasks.js:10:5)', 'at ipc.js:3:7', 'at load (boot.js:1:2)']);
  assert.ok(!/John|Smith|Ali|Work|Remember Me/.test(JSON.stringify(entry)), JSON.stringify(entry));
});

test('unquoted paths and the file names of the two data-folder errors never reach the log', () => {
  const { UserError } = require('../src/core/errors');
  assert.equal(redact(String.raw`Could not read: C:\Users\John Smith\AppData\Roaming\Remember Me`), 'Could not read: …');
  assert.equal(redact(String.raw`Shared at \\server\John Smith\data`), 'Shared at …');
  assert.equal(redact('Update failed: https://github.com/owner/repo/releases'), 'Update failed: https://github.com/owner/repo/releases', 'Web addresses stay');
  assert.equal(redact(String.raw`The copy of "attachments\a1\Salary review.pdf" is incomplete.`), 'The copy of "…" is incomplete.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-log-user-'));
  const log = createLogger(dir);
  log.error('start-failed', new UserError('Could not read the data or its backup. The files were left unchanged in: "{folder}"', { folder: String.raw`C:\Users\John Smith\AppData\Roaming\Remember Me` }));
  const entry = JSON.parse(fs.readFileSync(log.file, 'utf8'));
  assert.equal(entry.error, 'Could not read the data or its backup. The files were left unchanged in: "…"');
  assert.ok(!fs.readFileSync(log.file, 'utf8').includes('John'));
});
