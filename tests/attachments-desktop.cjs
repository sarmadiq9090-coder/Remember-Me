const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require(process.env.WAQT_PLAYWRIGHT || 'playwright');
const JSZip = require(process.env.WAQT_JSZIP || 'jszip');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'waqt-files-ui-'));
const dataDir = path.join(temp, 'data');
const exe = process.env.WAQT_EXECUTABLE || require('electron');
const errors = [];
let app;
async function launch() {
  app = await electron.launch({ executablePath: exe, args: process.env.WAQT_EXECUTABLE ? [] : [root], env: { ...process.env, WAQT_TEST: '1', WAQT_DATA_DIR: dataDir }, timeout: 60000 });
  await app.firstWindow();
  let page;
  for (let i = 0; i < 80; i++) {
    page = app.windows().find(p => p.url().endsWith('/index.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await page.waitForFunction(() => document.getElementById('date-label')?.textContent);
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openPath = async file => { globalThis.__opened.push(file); return ''; }; });
  return page;
}
async function pick(paths) { await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, paths); }
async function call(page, action, payload) {
  const result = await page.evaluate(({ action, payload }) => window.waqt.call(action, payload), { action, payload });
  assert.ok(result.ok, result.error); return result.value;
}
async function waitAlert() {
  for (let i = 0; i < 80; i++) { const p = app.windows().find(p => p.url().endsWith('/alert.html')); if (p) { await p.waitForFunction(() => document.getElementById('alert-title')?.textContent); p.on('pageerror', e => errors.push(e.message)); return p; } await new Promise(r => setTimeout(r, 100)); }
  throw new Error('No alert');
}
function pdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', '<< /Length 42 >>\nstream\nBT /F1 18 Tf 40 340 Td (Waqt PDF) Tj ET\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let data = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(data)); data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = Buffer.byteLength(data); data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(data);
}
(async () => {
  try {
    const pdfPath = path.join(temp, 'خطة العمل.pdf'), xlsxPath = path.join(temp, 'جدول المتابعة.xlsx'), textPath = path.join(temp, 'تفاصيل.txt');
    fs.writeFileSync(pdfPath, pdf()); fs.writeFileSync(textPath, 'تفاصيل الملاحظة', 'utf8');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tasks" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Waqt</t></is></c></row></sheetData></worksheet>');
    fs.writeFileSync(xlsxPath, await zip.generateAsync({ type: 'nodebuffer' }));
    let page = await launch();
    await page.locator('#new-task').click();
    await page.locator('#task-title').fill('مراجعة الملفات قبل الاجتماع');
    await page.locator('#task-body').fill('اقرأ ملف PDF وحدّث جدول Excel، ثم دوّن ملاحظاتك.');
    await pick([pdfPath, xlsxPath, textPath]);
    await page.locator('#task-attach').click();
    await page.waitForFunction(() => document.querySelectorAll('#task-files .attachment-item').length === 3);
    await page.locator('#task-files [data-file-id]').nth(1).click();
    let opened = await app.evaluate(() => globalThis.__opened);
    assert.equal(opened.length, 1);
    assert.deepEqual(fs.readFileSync(opened[0]), fs.readFileSync(xlsxPath));
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('#task-dialog').screenshot({ path: path.join(root, 'screenshots/task-attachments.png') });
    await page.locator('#task-form button[type=submit]').click();
    await page.locator('[data-view="notes"]').click();
    await page.locator('#page-add').click();
    await page.locator('#note-title').fill('ملفات وملاحظات الاجتماع');
    await page.locator('#note-body').fill('ملاحظتي مكتوبة بجانب المرفقات.');
    await pick([pdfPath, xlsxPath]);
    await page.locator('#note-attach').click();
    await page.waitForFunction(() => document.querySelectorAll('#note-files .attachment-item').length === 2);
    await page.locator('#note-form button[type=submit]').click();
    await page.locator('.note-card [data-file-id]').first().click();
    opened = await app.evaluate(() => globalThis.__opened);
    assert.deepEqual(fs.readFileSync(opened[1]), fs.readFileSync(pdfPath));
    let state = await call(page, 'state');
    assert.equal(state.tasks[0].attachments.length, 3);
    assert.equal(state.notes[0].attachments.length, 2);
    assert.notEqual(state.tasks[0].attachments[0], state.notes[0].attachments[0], 'Same filename has independent managed copies');
    fs.renameSync(pdfPath, pdfPath + '.moved'); fs.renameSync(xlsxPath, xlsxPath + '.moved'); fs.unlinkSync(textPath);
    await app.close(); page = await launch();
    await page.locator('[data-view="notes"]').click();
    await page.locator('.note-card [data-file-id]').first().click();
    opened = await app.evaluate(() => globalThis.__opened);
    assert.ok(fs.existsSync(opened[0]), 'Attachment available after original moved and app restarted');
    await page.locator('.note-edit-target').click();
    await page.locator('#note-files [data-remove-file]').first().click();
    await page.locator('#note-form button[type=submit]').click();
    state = await call(page, 'state');
    assert.equal(state.notes[0].attachments.length, 1);
    assert.equal(state.tasks[0].attachments.length, 3, 'Removing a note attachment does not remove task files');
    await call(page, 'saveTask', { ...state.tasks[0], dueAt: new Date(Date.now() - 1000).toISOString() });
    const alert = await waitAlert();
    assert.equal(await alert.locator('#alert-files [data-file-id]').count(), 3);
    await alert.locator('#alert-files [data-file-id]').nth(1).click();
    opened = await app.evaluate(() => globalThis.__opened);
    assert.ok(opened.at(-1).endsWith('.xlsx'));
    await alert.screenshot({ path: path.join(root, 'screenshots/reminder-attachments.png') });
    assert.equal(await alert.evaluate(() => document.getElementById('alert-complete').getBoundingClientRect().bottom < window.innerHeight), true, 'Complete button remains visible');
    assert.equal(await alert.evaluate(() => document.getElementById('snooze-until').getBoundingClientRect().bottom < window.innerHeight), true, 'Custom snooze remains visible with attachments');
    await alert.locator('#alert-complete').click();
    await page.locator('[data-view="settings"]').click();
    await pick([temp]);
    const backup = await call(page, 'export');
    const backed = JSON.parse(fs.readFileSync(path.join(backup, 'data.json'), 'utf8'));
    assert.equal(backed.attachments.length, 4);
    for (const a of backed.attachments) assert.ok(fs.existsSync(path.join(backup, 'attachments', a.id, a.name)));
    // A missing association reports a visible error instead of claiming the document opened.
    await app.evaluate(({ shell }) => { shell.openPath = async () => 'No association'; });
    await page.locator('[data-view="notes"]').click();
    await page.locator('.note-card [data-file-id]').click();
    await page.locator('#toast').filter({ hasText: 'تعذّر فتح الملف' }).waitFor();
    const forbidden = await page.evaluate(() => window.waqt.call('openAttachment', { id: '../outside' }));
    assert.equal(forbidden.ok, false);
    assert.deepEqual(errors, []);
    console.log('PASS: PDF/Excel/text selection, editor attachments, copied bytes, Arabic names, open handoff from draft/note/alert, remove, restart, moved originals, backup including files, missing association and invalid ID.');
  } finally { if (app) await app.close().catch(() => {}); console.log('Isolated attachment test data:', temp); }
})().catch(error => { console.error(error); process.exitCode = 1; });
