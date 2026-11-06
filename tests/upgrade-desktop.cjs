// Upgrade test (.github/workflows/desktop.yml, job "upgrade"): installs the previous release as a user
// would, gives it realistic Arabic data, installs the new build over it, and checks that the tasks, notes,
// attachment, settings and language are all still there and the app runs. Then it uninstalls and checks
// that the data folder is kept and start with Windows is removed. It changes the real %APPDATA%\Remember Me,
// the HKCU uninstall and Run keys and the install folder, so run it only on a CI runner or a throwaway VM
// without Remember Me:
//   node tests/upgrade-desktop.cjs <old Remember-Me-Setup-x.y.z-x64.exe> <new Remember-Me-Setup-x.y.z-x64.exe>
// The new installer must be built from a desktop-test package (WAQT_DESKTOP_TEST_BUILD=1) so Playwright can
// attach. The old one is the published release, whose fuses forbid that, so it is checked through its log.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process'); // eslint-disable-line no-restricted-syntax -- the test runs the installers; the app itself never starts programs
const { FOLDER } = require('../src/platform/data-folder');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const [oldInstaller, newInstaller] = process.argv.slice(2).map(file => file && path.resolve(file));
if (process.platform !== 'win32' || !oldInstaller || !newInstaller) {
  console.error('Usage (Windows only): node tests/upgrade-desktop.cjs <old installer> <new installer>');
  process.exit(2);
}
const oldVersion = /Setup-(\d+\.\d+\.\d+)-x64\.exe$/.exec(oldInstaller)?.[1];
const dataDir = path.join(process.env.APPDATA, FOLDER);
const logFile = path.join(dataDir, 'logs', 'remember-me.log');
const shots = path.join(root, 'screenshots');
const EXE = 'Remember Me.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const failures = [];
function step(name, detail = '') { console.log(`OK   ${name}${detail ? ' — ' + detail : ''}`); }
function fail(name, detail) { failures.push(name); console.log(`FAIL ${name} — ${detail}`); }
function expect(name, ok, detail = '') { if (ok) step(name, typeof ok === 'string' ? ok : ''); else fail(name, detail); return ok; }

function pwsh(command) {
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`pwsh failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
// Apps & features entries called Remember Me, for this user and for the machine. One appId means one entry.
function uninstallEntries() {
  const out = pwsh(`$keys = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    @(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Remember Me*' } | ForEach-Object {
      [pscustomobject]@{ key = ($_.PSPath -replace '^.*::', ''); name = $_.DisplayName; version = $_.DisplayVersion; uninstall = $_.UninstallString; quiet = $_.QuietUninstallString } }) | ConvertTo-Json -AsArray -Compress`);
  return JSON.parse(out || '[]');
}
// The uninstaller's path, from UninstallString ("C:\...\Uninstall Remember Me.exe" /currentuser).
const uninstallerOf = entry => /^"([^"]+)"/.exec(entry.uninstall)?.[1] || entry.uninstall.split(' /')[0];
// Start with Windows entries (HKCU Run) that start Remember Me.
function runEntries() {
  const out = pwsh(`$run = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue
    @(if ($run) { $run.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and "$($_.Value)" -like '*${EXE}*' } | ForEach-Object { [pscustomobject]@{ name = $_.Name; value = "$($_.Value)" } } }) | ConvertTo-Json -AsArray -Compress`);
  return JSON.parse(out || '[]');
}
function removeRunEntries() {
  for (const { name } of runEntries()) pwsh(`Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${name.replace(/'/g, "''")}'`);
}
const running = () => spawnSync('tasklist', ['/FI', `IMAGENAME eq ${EXE}`, '/NH'], { encoding: 'utf8' }).stdout.includes(EXE);
async function stopApp() {
  spawnSync('taskkill', ['/F', '/T', '/IM', EXE], { stdio: 'ignore' });
  for (let i = 0; i < 100 && running(); i++) await sleep(100);
  if (running()) throw new Error('Remember Me is still running');
}
function install(installer) {
  // /S: silent, for the current user, as electron-updater runs it. Upgrading runs the old uninstaller first.
  const result = spawnSync(installer, ['/S'], { stdio: 'inherit', timeout: 300000 });
  if (result.status !== 0) throw new Error(`${path.basename(installer)} exited with ${result.status ?? result.error}`);
}
function logLines() {
  try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { return []; }
}
async function waitForLog(test, seconds = 60) {
  for (let i = 0; i < seconds * 4; i++) {
    const found = logLines().find(test);
    if (found) return found;
    await sleep(250);
  }
  return null;
}

// What a user of the previous version has: Arabic interface, dark Ocean theme, own snooze choices, start
// with Windows, repeating and plain tasks with tags, steps, an early reminder and an attachment, a finished
// task, notes in two paper styles, one item in the trash and one whose 30 days in the trash are over.
function seedData() {
  const now = Date.now(), hour = 36e5, day = 24 * hour;
  const iso = t => new Date(Math.round(t / 60000) * 60000).toISOString();
  const attachment = { id: randomUUID(), name: 'جدول الأسبوع.txt', addedAt: iso(now - 2 * day) };
  const content = Buffer.from('السبت: مراجعة الخطة\nالأحد: الاتصال بالعائلة\n', 'utf8');
  fs.mkdirSync(path.join(dataDir, 'attachments', attachment.id), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'attachments', attachment.id, attachment.name), content);
  attachment.size = content.length;
  const stamps = age => ({ createdAt: iso(now - age), updatedAt: iso(now - age / 2) });
  const task = (id, title, fields = {}) => ({ id, title, body: '', priority: 'normal', category: 'personal', dueAt: null, repeat: 'none', scheduleAt: null,
    attachments: [], completedAt: null, snoozedAt: null, ...stamps(5 * day), ...fields });
  const weekly = iso(now + 2 * day), daily = iso(now + day + 3 * hour);
  const data = {
    version: 1,
    tasks: [
      task('upgrade-weekly', 'مراجعة خطة الأسبوع', { body: 'تحديد ثلاث أولويات والعمل على أهمها أولًا.', priority: 'high', category: 'work', dueAt: weekly, scheduleAt: weekly, repeat: 'weekly',
        remindBefore: 15, tags: ['عمل', 'تخطيط'], checklist: [{ id: 'step-1', text: 'مراجعة المهام المفتوحة', done: true }, { id: 'step-2', text: 'اختيار ثلاث أولويات', done: false }], attachments: [attachment.id] }),
      task('upgrade-daily', 'قراءة عشر صفحات', { priority: 'medium', category: 'study', dueAt: daily, scheduleAt: daily, repeat: 'daily', snoozeCount: 2 }),
      task('upgrade-plain', 'الاتصال بالطبيب لتأكيد الموعد'),
      task('upgrade-english', 'Renew the car insurance', { body: 'Compare two quotes first.', dueAt: iso(now + 6 * day), tags: ['home'] }),
      task('upgrade-done', 'دفع فاتورة الكهرباء', { completedAt: iso(now - 3 * hour) }),
      task('upgrade-trash', 'مهمة محذوفة منذ أيام', { deletedAt: iso(now - 5 * day) }),
    ],
    notes: [
      { id: 'upgrade-note-ideas', title: 'أفكار للأسبوع القادم', body: 'أخصص وقتًا للقراءة.\nأرتب مساحة العمل.\nأجعل البداية بسيطة.', color: 'green', style: 'sticky', attachments: [], ...stamps(3 * day) },
      { id: 'upgrade-note-list', title: 'قائمة المشتريات', body: 'حليب، خبز، تمر', color: 'yellow', style: 'lined', attachments: [], ...stamps(day) },
      { id: 'upgrade-note-expired', title: 'ملاحظة انتهت مدتها في سلة المحذوفات', body: '', color: 'cream', attachments: [], ...stamps(60 * day), deletedAt: iso(now - 40 * day) },
    ],
    attachments: [attachment],
    settings: { sound: false, startAtLogin: true, alertSide: 'left', language: 'ar', weekStart: 6, theme: 'dark', palette: 'ocean', autoUpdate: false, pausedUntil: null, remindAgain: 5,
      snoozePresets: [{ kind: 'in', minutes: 5 }, { kind: 'in', minutes: 30 }, { kind: 'today', time: '20:00' }, { kind: 'tomorrow', time: '08:00' }, { kind: 'week' }, { kind: 'pick' }] },
  };
  fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(data, null, 2));
  return { attachment, attachmentHash: sha256(path.join(dataDir, 'attachments', attachment.id, attachment.name)) };
}
// Every field the previous version saved must come back unchanged (the new version may add fields).
function differences(before, after) {
  const out = [];
  for (const kind of ['tasks', 'notes', 'attachments']) {
    const now = new Map(after[kind].map(item => [item.id, item]));
    if (after[kind].length !== before[kind].length) out.push(`${kind}: ${before[kind].length} before, ${after[kind].length} after`);
    for (const item of before[kind]) {
      const next = now.get(item.id);
      if (!next) { out.push(`${kind} ${item.id} is missing`); continue; }
      for (const [key, value] of Object.entries(item)) if (JSON.stringify(next[key]) !== JSON.stringify(value)) out.push(`${kind} ${item.id}.${key}: ${JSON.stringify(value)} → ${JSON.stringify(next[key])}`);
    }
  }
  for (const [key, value] of Object.entries(before.settings)) if (JSON.stringify(after.settings[key]) !== JSON.stringify(value)) out.push(`settings.${key}: ${JSON.stringify(value)} → ${JSON.stringify(after.settings[key])}`);
  return out;
}

(async () => {
  if (fs.existsSync(dataDir) || uninstallEntries().length) throw new Error(`Remember Me is already on this PC (${dataDir}); run this test on a clean runner or VM.`);
  fs.mkdirSync(shots, { recursive: true });

  // 1. The previous release, installed and started once with the data.
  install(oldInstaller);
  const [oldEntry] = uninstallEntries();
  expect(`v${oldVersion} installs`, oldEntry?.version === oldVersion && `${oldEntry.name} ${oldEntry.version}`, JSON.stringify(uninstallEntries()));
  const installDir = path.dirname(uninstallerOf(oldEntry));
  const exe = path.join(installDir, EXE);
  if (!fs.existsSync(exe)) throw new Error(`${exe} is missing after installing v${oldVersion}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const { attachment, attachmentHash } = seedData();
  const seeded = readJson(path.join(dataDir, 'data.json'));
  const env = { ...process.env };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'WAQT_TEST', 'WAQT_DATA_DIR']) delete env[key];
  spawn(exe, [], { detached: true, stdio: 'ignore', env, cwd: installDir }).unref();
  const oldStart = await waitForLog(line => line.event === 'start' && line.version === oldVersion);
  expect(`v${oldVersion} starts with the data`, oldStart && oldStart.tasks === seeded.tasks.length && oldStart.notes === seeded.notes.length && oldStart.attachments === 1
    && `${oldStart.tasks} tasks, ${oldStart.notes} notes, ${oldStart.attachments} attachment`, JSON.stringify(oldStart));
  // Its 30-day trash purge saves data.json, so the file the new version reads was written by the old one.
  const purged = await waitForLog(line => line.event === 'trash-purged', 30);
  expect(`v${oldVersion} saves the data itself`, purged?.count === 1 && fs.existsSync(path.join(dataDir, 'data.json.bak')) && 'expired trash purged, data.json.bak kept', JSON.stringify(purged));
  const oldRun = await (async () => { for (let i = 0; i < 40; i++) { const found = runEntries(); if (found.length) return found; await sleep(250); } return []; })();
  expect(`v${oldVersion} registers start with Windows`, oldRun.length === 1 && oldRun[0].value, JSON.stringify(oldRun));
  await sleep(5000);
  expect(`v${oldVersion} keeps running`, running(), 'the process exited');
  const oldProblems = logLines().filter(line => line.level === 'error' || line.event === 'data-recovered-from-bak');
  expect(`v${oldVersion} logs no errors`, !oldProblems.length, JSON.stringify(oldProblems));
  // A user quits from the tray before installing; the old app has no window for Playwright, so it is stopped.
  await stopApp();
  const before = readJson(path.join(dataDir, 'data.json'));
  const beforeHash = sha256(path.join(dataDir, 'data.json'));
  if (before.notes.some(note => note.id === 'upgrade-note-expired')) throw new Error('The expired note is still there');

  // 2. The new installer over it.
  install(newInstaller);
  const entries = uninstallEntries();
  expect('one Remember Me in Apps & features', entries.length === 1 && entries[0].key === oldEntry.key && `${entries[0].name} ${entries[0].version}, same key (appId)`, JSON.stringify(entries));
  expect(`Apps & features shows ${version}`, entries[0]?.version === version, JSON.stringify(entries));
  expect('installed in the same folder', fs.existsSync(exe) && path.dirname(uninstallerOf(entries[0])) === installDir && installDir, JSON.stringify(entries));
  // The old uninstaller runs with --updated here, so start with Windows must survive the upgrade.
  const upgradedRun = runEntries();
  expect('the upgrade keeps start with Windows', upgradedRun.length === 1 && upgradedRun[0].value, JSON.stringify(upgradedRun));
  expect('the installer leaves the data alone', sha256(path.join(dataDir, 'data.json')) === beforeHash && fs.existsSync(path.join(dataDir, 'attachments', attachment.id, attachment.name)) && 'data.json and the attachment unchanged');

  // 3. The new version, started as a user would (no test mode), with the real data folder.
  process.env.WAQT_EXECUTABLE = exe;
  const { launch } = require('./release-qa/harness.cjs');
  const s = await launch({ dataDir, testMode: false });
  try {
    const state = await s.value('state');
    expect('the new version runs from the install folder', state.packaged && state.dataPath.toLowerCase() === dataDir.toLowerCase() && !state.recovered && state.dataPath, JSON.stringify({ packaged: state.packaged, dataPath: state.dataPath, recovered: state.recovered }));
    const changed = differences(before, state);
    expect('every task, note, attachment and setting is unchanged', !changed.length && `${state.tasks.length} tasks, ${state.notes.length} notes, ${state.attachments.length} attachment, ${Object.keys(before.settings).length} settings`, changed.join('; '));
    expect('the language is kept', state.settings.language === 'ar' && 'ar', state.settings.language);
    const page = await s.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.documentElement.dataset.palette || '', document.title]);
    expect('the interface is Arabic, right to left, in the Ocean palette', page[0] === 'ar' && page[1] === 'rtl' && page[2] === 'ocean' && page.join(' · '), page.join(' · '));
    await s.page.locator('[data-view="all"]').click();
    const active = before.tasks.filter(t => !t.completedAt && !t.deletedAt);
    await s.page.waitForFunction(count => document.querySelectorAll('#task-list .task-row').length === count, active.length, { timeout: 10000 }).catch(() => {});
    const rows = await s.page.locator('#task-list .task-row').allTextContents();
    expect('All tasks lists every task', rows.length === active.length && active.every(t => rows.some(row => row.includes(t.title))) && `${rows.length} rows`, rows.join(' | '));
    await s.page.screenshot({ path: path.join(shots, 'upgrade-tasks.png') });
    await s.page.locator('[data-view="notes"]').click();
    const notes = await s.page.locator('#notes-list .note-card').allTextContents();
    const liveNotes = before.notes.filter(n => !n.deletedAt);
    expect('Notes lists every note', notes.length === liveNotes.length && liveNotes.every(n => notes.some(card => card.includes(n.title))) && `${notes.length} notes`, notes.join(' | '));
    await s.page.screenshot({ path: path.join(shots, 'upgrade-notes.png') });
    await s.page.locator('[data-view="settings"]').click();
    const language = await s.page.locator('#setting-language').inputValue();
    expect('Settings shows Arabic', language === 'ar', language);
    const attachmentFile = path.join(dataDir, 'attachments', attachment.id, attachment.name);
    expect('the attachment file is intact', sha256(attachmentFile) === attachmentHash && state.attachments.some(a => a.id === attachment.id && a.size === attachment.size) && 'same bytes and record', 'checksum or record changed');
    const start = await waitForLog(line => line.event === 'start' && line.version === version, 20);
    expect(`v${version} logs its start with the data`, start && start.tasks === before.tasks.length && start.notes === before.notes.length && start.packaged === true && `${start.tasks} tasks, ${start.notes} notes`, JSON.stringify(start));
    // refreshLoginItem points start with Windows at the installed exe again, leaving one entry.
    const run = runEntries();
    expect('start with Windows still points at the app', run.length === 1 && run[0].value.toLowerCase().includes(exe.toLowerCase()) && run[0].value.includes('--background') && run[0].value, JSON.stringify(run));
    await sleep(5000);
    expect('the new version keeps running', running() && !s.errors.length && 'no page errors', s.errors.join('; ') || 'the process exited');
  } finally {
    await s.close();
    await stopApp().catch(() => {});
  }
  const problems = logLines().filter(line => line.level === 'error' || line.event === 'data-recovered-from-bak');
  expect('no errors in the log', !problems.length, JSON.stringify(problems));
  const after = readJson(path.join(dataDir, 'data.json'));
  const changedOnDisk = differences(before, after);
  expect('data.json is intact after quitting', !changedOnDisk.length && 'every saved field unchanged', changedOnDisk.join('; '));

  // 4. Uninstall: the app goes, the data stays (deleteAppDataOnUninstall: false).
  const uninstaller = uninstallerOf(entries[0] || oldEntry);
  // The NSIS uninstaller copies itself to %TEMP% and returns at once, so wait for it to finish.
  spawnSync(uninstaller, ['/S'], { stdio: 'inherit', timeout: 120000 });
  for (let i = 0; i < 240 && (uninstallEntries().length || fs.existsSync(exe)); i++) await sleep(500);
  expect('the uninstaller removes the app', !uninstallEntries().length && !fs.existsSync(exe) && 'no Apps & features entry, no exe', JSON.stringify(uninstallEntries()));
  expect('the uninstaller keeps the data folder', fs.existsSync(path.join(dataDir, 'data.json')) && sha256(path.join(dataDir, 'attachments', attachment.id, attachment.name)) === attachmentHash && dataDir);
  // installer/installer.nsh (customUnInstall) removes the HKCU Run value, which would otherwise point at the deleted exe.
  const leftRun = runEntries();
  expect('the uninstaller removes start with Windows', !leftRun.length && 'no Run entry left', JSON.stringify(leftRun));
  removeRunEntries();

  console.log(failures.length ? `\n${failures.length} upgrade checks failed: ${failures.join(', ')}` : `\nUpgrade from v${oldVersion} to v${version}: every check passed`);
  process.exitCode = failures.length ? 1 : 0;
})().catch(async error => {
  console.error(error);
  await stopApp().catch(() => {});
  process.exitCode = 1;
});
