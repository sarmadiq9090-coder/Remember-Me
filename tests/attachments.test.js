const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Store, saveTask, completeTask, validateState, initialState } = require('../src/core');
const { importFiles, attachmentPath, attachmentIds, resolveAttachment, validateAttachment, exportBackup } = require('../src/attachments');
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
  assert.throws(() => resolveAttachment(state, root, record.id), /غير موجود/);
});
test('programs, scripts, installers and disk images are revealed instead of opened, whatever their case or double extension', () => {
  const { opensAsProgram } = require('../src/attachments');
  for (const name of ['setup.exe', 'SETUP.EXE', 'تقرير.pdf.exe', 'run.Bat', 'a.cmd', 'a.ps1', 'a.psm1', 'a.vbs', 'a.js', 'a.jse', 'a.wsf', 'a.hta', 'a.msi', 'a.msp',
    'a.scr', 'a.lnk', 'a.url', 'a.reg', 'a.cpl', 'a.pif', 'a.jar', 'a.chm', 'a.appx', 'a.msix', 'a.appref-ms', 'a.settingcontent-ms', 'a.library-ms', 'a.scf',
    'a.iso', 'a.img', 'a.vhdx', 'a.xll', 'a.py', 'a.wsb', 'a.rdp', 'invoice' + String.fromCharCode(0x202e) + 'fdp.exe', 'photo' + String.fromCharCode(0x202e) + 'gpj.txt']) assert.equal(opensAsProgram(name), true, name);
  for (const name of ['خطة.pdf', 'جدول.xlsx', 'a.XLSM', 'a.docx', 'a.txt', 'a.csv', 'a.png', 'exe.pdf', 'archive.zip', 'README', 'a.exe.pdf']) assert.equal(opensAsProgram(name), false, name);
});
