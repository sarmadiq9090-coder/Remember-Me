const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { saveTask, completeTask, validateState, initialState } = require('../src/core/tasks');
const { Store } = require('../src/core/store');
const { importFiles, attachmentPath, attachmentIds, resolveAttachment, validateAttachment, exportBackup } = require('../src/data/attachments');
test('attachments survive moving the original, restarting, recurrence and full backup export', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-attachments-'));
  const store = new Store(path.join(root, 'data'));
  const source = path.join(root, 'ملاحظات.pdf');
  const bytes = Buffer.from('%PDF-1.4\nTest PDF attachment bytes\n%%EOF');
  fs.writeFileSync(source, bytes);
  const [record] = await importFiles(path.dirname(store.file), [source]);
  store.change(s => { s.attachments.push(record); saveTask(s, { title: 'تذكير بملف', attachments: [record.id], dueAt: new Date(2026, 9, 24, 9).toISOString(), repeat: 'daily' }); });
  fs.renameSync(source, path.join(root, 'renamed.pdf'));
  let reopened = new Store(path.dirname(store.file));
  assert.deepEqual(fs.readFileSync(resolveAttachment(reopened.state, path.dirname(store.file), record.id).file), bytes);
  const id = reopened.state.tasks[0].id;
  reopened.change(s => completeTask(s, id, new Date(2026, 9, 24, 10)));
  reopened.change(s => { saveTask(s, { ...s.tasks.find(t => t.id === id), attachments: [] }); });
  assert.deepEqual(reopened.state.tasks.find(t => t.completedAt).attachments, [record.id], 'Removing from next occurrence must retain completed occurrence');
  assert.ok(fs.existsSync(attachmentPath(path.dirname(store.file), record)));
  const backup = await exportBackup(reopened.state, path.dirname(store.file), root);
  const restored = new Store(backup);
  assert.deepEqual(fs.readFileSync(resolveAttachment(restored.state, backup, record.id).file), bytes);
  assert.equal(restored.state.tasks.length, 2);
});
test('old data without attachments migrates without losing tasks or notes', () => {
  const state = initialState(); saveTask(state, { title: 'قديمة' });
  delete state.attachments; delete state.tasks[0].attachments;
  state.notes.push({ id: randomUUID(), title: 'ملاحظة قديمة', body: 'باقية' });
  validateState(state);
  assert.deepEqual(state.attachments, []);
  assert.deepEqual(state.tasks[0].attachments, []);
  assert.deepEqual(state.notes[0].attachments, []);
  assert.equal(state.notes[0].body, 'باقية');
});
test('path traversal, unregistered references and oversize attachments are rejected', async () => {
  assert.throws(() => validateAttachment({ id: randomUUID(), name: '../secret.pdf', size: 10 }));
  assert.throws(() => validateAttachment({ id: '../escape', name: 'safe.pdf', size: 10 }));
  assert.throws(() => validateAttachment({ id: randomUUID(), name: 'file.pdf:secret', size: 10 }));
  assert.throws(() => attachmentIds(Array.from({ length: 21 }, () => randomUUID())));
  const state = initialState(); saveTask(state, { title: 'bad', attachments: [randomUUID()] });
  assert.throws(() => validateState(state));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-size-test-'));
  const source = path.join(root, 'large.pdf');
  const fd = fs.openSync(source, 'w'); fs.ftruncateSync(fd, 50 * 1024 * 1024 + 1); fs.closeSync(fd);
  await assert.rejects(importFiles(root, [source]), /50/);
  fs.unlinkSync(source);
  assert.ok(!fs.existsSync(path.join(root, 'attachments')));
});
test('multi-selection validates all files before copying and missing files are reported', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-import-test-'));
  const source = path.join(root, 'sample.xlsx'); fs.writeFileSync(source, 'test');
  await assert.rejects(importFiles(root, [source, path.join(root, 'missing.pdf')]));
  assert.ok(!fs.existsSync(path.join(root, 'attachments')));
  const [record] = await importFiles(root, [source]);
  const state = initialState(); state.attachments.push(record);
  fs.unlinkSync(attachmentPath(root, record));
  assert.throws(() => resolveAttachment(state, root, record.id), /missing/);
});
test('programs, scripts, installers and disk images are revealed instead of opened, whatever their case or double extension', () => {
  const { opensAsProgram } = require('../src/data/attachments');
  for (const name of ['setup.exe', 'SETUP.EXE', 'تقرير.pdf.exe', 'run.Bat', 'a.cmd', 'a.ps1', 'a.psm1', 'a.vbs', 'a.js', 'a.jse', 'a.wsf', 'a.hta', 'a.msi', 'a.msp',
    'a.scr', 'a.lnk', 'a.url', 'a.reg', 'a.cpl', 'a.pif', 'a.jar', 'a.chm', 'a.appx', 'a.msix', 'a.appref-ms', 'a.settingcontent-ms', 'a.library-ms', 'a.scf',
    'a.iso', 'a.img', 'a.vhdx', 'a.xll', 'a.py', 'a.wsb', 'a.rdp', 'schedule.theme', 'a.THEMEPACK', 'a.deskthemepack', 'a.desktopthemepackfile', 'a.msstyles', 'update.msu', 'a.pyzw', 'a.vsix', 'a.vsto', 'invoice' + String.fromCharCode(0x202e) + 'fdp.exe', 'photo' + String.fromCharCode(0x202e) + 'gpj.txt']) assert.equal(opensAsProgram(name), true, name);
  for (const name of ['خطة.pdf', 'جدول.xlsx', 'a.XLSM', 'a.docx', 'a.txt', 'a.csv', 'a.png', 'exe.pdf', 'archive.zip', 'README', 'a.exe.pdf']) assert.equal(opensAsProgram(name), false, name);
});
test('storage usage counts orphaned attachments, and cleanup removes only files no task or note uses', async () => {
  const { storageUsage, removeOrphans } = require('../src/data/attachments');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-orphans-'));
  const data = path.join(root, 'data'); const store = new Store(data);
  const files = ['used.pdf', 'detached.pdf', 'draft.pdf', 'history.pdf'].map(name => { const f = path.join(root, name); fs.writeFileSync(f, name.repeat(100)); return f; });
  const [used, detached, draft, history] = await importFiles(data, files);
  store.change(s => {
    s.attachments.push(used, detached, draft, history);
    saveTask(s, { title: 'مستخدم', attachments: [used.id] });
    const t = saveTask(s, { title: 'سيُفصل', attachments: [detached.id, history.id], dueAt: '2026-10-24T09:00:00Z', repeat: 'daily' });
    completeTask(s, t.id, new Date('2026-10-24T10:00:00Z'));
    saveTask(s, { ...t, attachments: [] });
  });
  const stray = path.join(data, 'attachments', randomUUID()); fs.mkdirSync(stray); fs.writeFileSync(path.join(stray, 'left.txt'), 'x');
  const unrelated = path.join(data, 'attachments', 'my notes'); fs.mkdirSync(unrelated);
  const usage = await storageUsage(store.state, data);
  assert.equal(usage.orphans, 2, 'The never-saved draft file and the stray folder; files kept by completed history count as used');
  assert.equal(usage.orphanBytes, draft.size + 1);
  assert.ok(usage.attachments >= used.size + detached.size + draft.size + history.size);
  await removeOrphans(store, data);
  assert.deepEqual(store.state.attachments.map(a => a.name).sort(), ['detached.pdf', 'history.pdf', 'used.pdf']);
  assert.ok(!fs.existsSync(attachmentPath(data, draft)) && !fs.existsSync(stray));
  for (const record of [used, detached, history]) assert.ok(fs.existsSync(attachmentPath(data, record)));
  assert.ok(fs.existsSync(unrelated), 'Folders the app did not create are left alone');
  assert.equal((await storageUsage(new Store(data).state, data)).orphans, 0);
});
test('a missing attachment file is skipped and reported, while invalid paths still stop the backup', async () => {
  const { readBackup } = require('../src/data/backups');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-missing-'));
  const data = path.join(root, 'data'); const store = new Store(data);
  const files = ['kept.pdf', 'gone.pdf'].map(name => { const f = path.join(root, name); fs.writeFileSync(f, name); return f; });
  const [kept, gone] = await importFiles(data, files);
  store.change(s => { s.attachments.push(kept, gone); saveTask(s, { title: 'مهمة الملفين', attachments: [kept.id, gone.id] }); });
  fs.unlinkSync(attachmentPath(data, gone));
  const skipped = [];
  const folder = await exportBackup(store.state, data, root, { skipped });
  assert.deepEqual(skipped.map(({ name, itemTitle }) => ({ name, itemTitle })), [{ name: 'gone.pdf', itemTitle: 'مهمة الملفين' }]);
  assert.deepEqual(fs.readFileSync(attachmentPath(folder, kept)), Buffer.from('kept.pdf'));
  const backup = await readBackup(folder);
  assert.deepEqual(backup.state.tasks[0].attachments, [kept.id], 'The copied data.json drops the missing file so the backup can be restored');
  assert.equal(backup.verified, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'backup.json'))).skipped[0].name, 'gone.pdf');
  assert.equal(store.state.tasks[0].attachments.length, 2, 'The live data is not changed');

  const linked = path.join(root, 'linked'); const linkedStore = new Store(linked);
  const [target] = await importFiles(linked, [files[0]]);
  linkedStore.change(s => { s.attachments.push(target); saveTask(s, { title: 'link', attachments: [target.id] }); });
  fs.rmSync(path.dirname(attachmentPath(linked, target)), { recursive: true });
  fs.mkdirSync(attachmentPath(linked, target), { recursive: true }); // a folder where the file should be
  await assert.rejects(exportBackup(linkedStore.state, linked, root), /Invalid/);
  const bad = { ...linkedStore.state, attachments: [{ ...target, name: '../escape.pdf' }] };
  await assert.rejects(exportBackup(bad, linked, root), /Invalid/);
});
