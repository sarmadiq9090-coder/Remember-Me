const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveTask } = require('../src/core/tasks');
const { Store } = require('../src/core/store');
const { migrateDataFolder } = require('../src/platform/data-folder');
const now = () => new Date('2026-10-24T08:30:00.000Z');
const locked = (from, to) => { const error = new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`); error.code = 'EPERM'; throw error; };

// Fields newer versions keep in drive-backup.json; the migration must carry them over unchanged.
const driveExtras = { skipped: [{ id: 'x', name: 'gone.pdf' }], snapshotAt: '2026-10-20T10:00:00.000Z', snapshotHash: 'ab12', keep: 5 };
// An %APPDATA% with a v1.4 data folder: tasks, an attachment, a backup and Drive settings.
function setup() {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-appdata-'));
  const legacy = path.join(appData, 'Waqt');
  const store = new Store(legacy);
  store.change(s => { saveTask(s, { title: 'مهمة قديمة' }); });
  store.change(s => { saveTask(s, { title: 'Second task' }); });
  fs.mkdirSync(path.join(legacy, 'attachments', 'a'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'attachments', 'a', 'file.pdf'), 'pdf bytes');
  const backup = path.join(legacy, 'backups', 'Waqt-backup-2026-01-01T00-00-00-000Z');
  fs.mkdirSync(backup, { recursive: true });
  fs.copyFileSync(path.join(legacy, 'data.json'), path.join(backup, 'data.json'));
  fs.writeFileSync(path.join(legacy, 'drive-backup.json'), JSON.stringify({ folder: path.join(appData, 'Drive'), lastLocalPath: backup, pending: true, ...driveExtras }));
  return { appData, legacy, folder: path.join(appData, 'Remember Me'), snapshot: snapshot(legacy) };
}
function snapshot(folder) {
  const files = {};
  const walk = prefix => { for (const e of fs.readdirSync(path.join(folder, prefix), { withFileTypes: true })) { const name = path.join(prefix, e.name); if (e.isDirectory()) walk(name); else files[name] = fs.readFileSync(path.join(folder, name), 'utf8'); } };
  walk('');
  return files;
}
const withoutDrive = files => Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'drive-backup.json'));

test('a fresh install uses %APPDATA%\\Remember Me and creates nothing else', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-fresh-'));
  const result = migrateDataFolder(appData, { now });
  assert.deepEqual(result, { folder: path.join(appData, 'Remember Me'), migrated: 'none' });
  assert.deepEqual(fs.readdirSync(appData), []);
  assert.equal(new Store(result.folder).state.tasks.length, 0);
});

test('the v1.4 Waqt folder is renamed as a whole, with the Drive settings pointing at the new place', () => {
  const { appData, legacy, folder, snapshot: before } = setup();
  const result = migrateDataFolder(appData, { now });
  assert.equal(result.migrated, 'renamed');
  assert.equal(result.folder, folder);
  assert.equal(fs.existsSync(legacy), false);
  assert.deepEqual(withoutDrive(snapshot(folder)), withoutDrive(before));
  assert.deepEqual(new Store(folder).state.tasks.map(t => t.title), ['مهمة قديمة', 'Second task']);
  const drive = JSON.parse(fs.readFileSync(path.join(folder, 'drive-backup.json'), 'utf8'));
  assert.equal(drive.lastLocalPath, path.join(folder, 'backups', 'Waqt-backup-2026-01-01T00-00-00-000Z'));
  assert.equal(drive.folder, path.join(appData, 'Drive'));
  assert.deepEqual({ skipped: drive.skipped, snapshotAt: drive.snapshotAt, snapshotHash: drive.snapshotHash, keep: drive.keep, pending: drive.pending }, { ...driveExtras, pending: true });
  assert.equal(migrateDataFolder(appData, { now }).migrated, 'none', 'Later starts leave everything alone');
});

test('a locked Waqt folder is copied, checked and kept as Waqt.migrated-<time>, never deleted', () => {
  const { appData, legacy, folder, snapshot: before } = setup();
  const rename = (from, to) => from === legacy && to === folder ? locked(from, to) : fs.renameSync(from, to);
  const result = migrateDataFolder(appData, { now, rename });
  assert.equal(result.migrated, 'copied');
  const kept = path.join(appData, 'Waqt.migrated-2026-10-24T08-30-00-000Z');
  assert.equal(result.legacy, kept);
  assert.deepEqual(snapshot(kept), before, 'The old folder keeps every file unchanged');
  assert.deepEqual(withoutDrive(snapshot(folder)), withoutDrive(before));
  const drive = JSON.parse(fs.readFileSync(path.join(folder, 'drive-backup.json'), 'utf8'));
  assert.equal(drive.lastLocalPath, path.join(folder, 'backups', 'Waqt-backup-2026-01-01T00-00-00-000Z'));
  assert.deepEqual([drive.skipped, drive.snapshotAt, drive.snapshotHash], [driveExtras.skipped, driveExtras.snapshotAt, driveExtras.snapshotHash]);
  assert.equal(fs.existsSync(folder + '.migrating'), false);
});

test('when the old folder stays locked after copying, the new folder still wins and the old one is left as it is', () => {
  const { appData, legacy, folder, snapshot: before } = setup();
  const rename = (from, to) => from === legacy ? locked(from, to) : fs.renameSync(from, to);
  const result = migrateDataFolder(appData, { now, rename });
  assert.deepEqual([result.migrated, result.folder, result.legacy], ['copied', folder, legacy]);
  assert.deepEqual(snapshot(legacy), before);
  assert.equal(migrateDataFolder(appData, { now, rename }).migrated, 'none');
});

test('a copy interrupted halfway is discarded and the untouched Waqt folder keeps being used', () => {
  const { appData, legacy, folder, snapshot: before } = setup();
  const rename = (from, to) => from === legacy ? locked(from, to) : fs.renameSync(from, to);
  // The copy stops after data.json, as if the disk filled up or the PC lost power.
  const copy = (from, to) => { fs.mkdirSync(to); fs.copyFileSync(path.join(from, 'data.json'), path.join(to, 'data.json')); };
  const result = migrateDataFolder(appData, { now, rename, copy });
  assert.deepEqual([result.migrated, result.folder], ['failed', legacy]);
  assert.match(result.error.message, /missing files/);
  assert.deepEqual(snapshot(legacy), before);
  assert.equal(fs.existsSync(folder), false);
  assert.equal(fs.existsSync(folder + '.migrating'), false);
  // A copy left behind by a crash during an earlier start is thrown away and the move is redone.
  copy(legacy, folder + '.migrating');
  const retry = migrateDataFolder(appData, { now });
  assert.equal(retry.migrated, 'renamed');
  assert.deepEqual(withoutDrive(snapshot(folder)), withoutDrive(before));
  assert.equal(fs.existsSync(folder + '.migrating'), false);
});

test('a damaged data.json is never accepted as a finished copy', () => {
  const { appData, legacy, snapshot: before } = setup();
  const rename = (from, to) => from === legacy ? locked(from, to) : fs.renameSync(from, to);
  const copy = (from, to) => { fs.cpSync(from, to, { recursive: true }); const file = path.join(to, 'data.json'); fs.writeFileSync(file, '{' + ' '.repeat(fs.statSync(file).size - 1)); };
  const result = migrateDataFolder(appData, { now, rename, copy });
  assert.deepEqual([result.migrated, result.folder], ['failed', legacy]);
  assert.deepEqual(snapshot(legacy), before);
});

test('when both folders hold data the new one wins and the old one is untouched', () => {
  const { appData, legacy, folder, snapshot: before } = setup();
  new Store(folder).change(s => { saveTask(s, { title: 'New data' }); });
  const result = migrateDataFolder(appData, { now });
  assert.deepEqual(result, { folder, migrated: 'none' });
  assert.deepEqual(snapshot(legacy), before);
  assert.deepEqual(new Store(folder).state.tasks.map(t => t.title), ['New data']);
});

test('an empty Remember Me folder does not hide the old data; it is set aside, not deleted', () => {
  const { appData, folder, snapshot: before } = setup();
  fs.mkdirSync(path.join(folder, 'GPUCache'), { recursive: true });
  const result = migrateDataFolder(appData, { now });
  assert.equal(result.migrated, 'renamed');
  assert.deepEqual(withoutDrive(snapshot(folder)), withoutDrive(before));
  assert.ok(fs.existsSync(path.join(appData, 'Remember Me.unused-2026-10-24T08-30-00-000Z', 'GPUCache')));
});
