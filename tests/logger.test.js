const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, redact } = require('../src/logger');
const { Store, saveTask } = require('../src/core');
const { DriveBackup } = require('../src/drive-backup');
const { importFiles, attachmentPath } = require('../src/attachments');

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
