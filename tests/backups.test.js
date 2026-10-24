const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, saveTask } = require('../src/core');
const { importFiles, exportBackup, attachmentPath, BACKUP_INFO } = require('../src/attachments');
const { readBackup, restoreBackup } = require('../src/backups');

async function setup(title, bytes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-backups-'));
  const data = path.join(root, 'data'); const store = new Store(data);
  const source = path.join(root, 'مرفق.pdf'); fs.writeFileSync(source, bytes);
  const [record] = await importFiles(data, [source]);
  store.change(s => { s.attachments.push(record); saveTask(s, { title, attachments: [record.id] }); });
  return { root, data, store, record };
}

test('every backup records SHA-256 checksums and whether the app made it automatically', async () => {
  const { root, data, store, record } = await setup('مهمة', Buffer.from('pdf bytes'));
  const manual = await exportBackup(store.state, data, root);
  const auto = await exportBackup(store.state, data, root, { kind: 'automatic' });
  const info = JSON.parse(fs.readFileSync(path.join(manual, BACKUP_INFO), 'utf8'));
  assert.equal(info.kind, 'manual');
  assert.equal(JSON.parse(fs.readFileSync(path.join(auto, BACKUP_INFO), 'utf8')).kind, 'automatic');
  assert.deepEqual(Object.keys(info.files).sort(), [`attachments/${record.id}/${record.name}`, 'data.json'].sort());
  const backup = await readBackup(manual);
  assert.equal(backup.verified, true);
  assert.equal(backup.state.tasks[0].title, 'مهمة');
});

test('damaged, incomplete or foreign backups are refused before anything is restored', async () => {
  const { root, data, store, record } = await setup('مهمة', Buffer.from('original'));
  const folder = await exportBackup(store.state, data, root);
  fs.writeFileSync(attachmentPath(folder, record), 'tampered');  // same size, different bytes
  await assert.rejects(readBackup(folder), /تالفة/);
  await assert.rejects(readBackup(folder, { text: (ar, en) => en }), /damaged/);
  const second = await exportBackup(store.state, data, root);
  fs.appendFileSync(path.join(second, 'data.json'), ' ');
  await assert.rejects(readBackup(second), /data\.json/);
  const third = await exportBackup(store.state, data, root);
  fs.unlinkSync(attachmentPath(third, record));
  await assert.rejects(readBackup(third), /ناقصة/);
  await assert.rejects(readBackup(root), /لا يحتوي/);
  const traversal = path.join(root, 'evil'); fs.mkdirSync(traversal);
  fs.writeFileSync(path.join(traversal, 'data.json'), JSON.stringify({ ...store.state, attachments: [{ ...record, name: '..\\..\\x.exe' }] }));
  await assert.rejects(readBackup(traversal), /غير صالح/);
});

test('backups from before checksums still restore, reported as unverified', async () => {
  const { root, data, store } = await setup('قديمة', Buffer.from('old'));
  const folder = await exportBackup(store.state, data, root);
  fs.unlinkSync(path.join(folder, BACKUP_INFO));
  const backup = await readBackup(folder);
  assert.equal(backup.verified, false);
  assert.equal(backup.state.tasks[0].title, 'قديمة');
});

test('restoring replaces the data and files, after saving a safety copy of the current data', async () => {
  const before = await setup('الحالية', Buffer.from('current file'));
  const other = await setup('من النسخة', Buffer.from('file from the backup'));
  const folder = await exportBackup(other.store.state, other.data, other.root);
  const { safety } = await restoreBackup(before.data, before.store, await readBackup(folder));
  assert.deepEqual(before.store.state.tasks.map(t => t.title), ['من النسخة']);
  assert.deepEqual(new Store(before.data).state.tasks.map(t => t.title), ['من النسخة'], 'Restored data is on disk');
  assert.equal(fs.readFileSync(attachmentPath(before.data, other.record), 'utf8'), 'file from the backup');
  const undo = await readBackup(safety);
  assert.equal(undo.verified, true);
  assert.equal(undo.kind, 'safety');
  assert.deepEqual(undo.state.tasks.map(t => t.title), ['الحالية'], 'The previous data can be restored again');
  assert.ok(path.basename(safety).startsWith('Waqt-before-restore-'));
});

test('rotation keeps the newest automatic copies locally and in Drive, and never touches manual or older backups', async () => {
  const { DriveBackup } = require('../src/drive-backup');
  const { root, data, store } = await setup('مهمة', Buffer.from('x'));
  const sync = path.join(root, 'Drive'); fs.mkdirSync(sync);
  const drive = new DriveBackup(data, () => store.state);
  await drive.configure(sync);
  const pause = () => new Promise(r => setTimeout(r, 5));
  for (let i = 0; i < 5; i++) { await drive.run(); await pause(); }
  const local = path.join(data, 'backups');
  const manual = await exportBackup(store.state, data, local); await pause();
  const legacy = await exportBackup(store.state, data, sync); fs.unlinkSync(path.join(legacy, BACKUP_INFO));
  assert.equal(fs.readdirSync(local).length, 6); assert.equal(fs.readdirSync(sync).length, 6);
  assert.deepEqual(await drive.expired(0), [], 'Keeping everything is the default');
  assert.equal(drive.status().keep, 0);
  assert.equal((await drive.expired(2)).length, 6, 'Three old automatic copies in each place');
  const removed = await drive.setKeep(2);
  assert.equal(removed.length, 6);
  for (const folder of [local, sync]) {
    const left = fs.readdirSync(folder).map(name => path.join(folder, name));
    assert.equal(left.length, 3);
    assert.ok(left.includes(folder === local ? drive.status().lastLocalPath : drive.status().lastDrivePath), 'The newest copy stays');
  }
  assert.ok(fs.existsSync(manual) && fs.existsSync(legacy));
  assert.equal(new DriveBackup(data, () => store.state).status().keep, 2, 'The choice is saved');
  await drive.run();
  assert.equal(fs.readdirSync(local).length, 3, 'Each new copy retires the oldest automatic one');
  for (const keep of [-1, 1.5, '5', 101]) await assert.rejects(drive.setKeep(keep));
});
