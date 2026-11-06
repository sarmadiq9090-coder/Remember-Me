const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Updates, updateSource, createUpdater, CHECK_EVERY, FEED } = require('../src/platform/updates');
const { setLoginItem, startupTaskExtension, appUserModelId, APP_USER_MODEL_ID, STARTUP_TASK_ID, STARTUP_SETTINGS } = require('../src/platform/login-item');
const { packageFamilyName, storeDataFolder, STORE_ITEMS } = require('../src/platform/data-folder');
const { createHandlers } = require('../src/main/handlers');
const { checkRequest } = require('../src/main/ipc');
const { saveTask } = require('../src/core/tasks');
const { Store } = require('../src/core/store');
const store = require('../tools/store.cjs');
const logos = require('../tools/store-logos.cjs');
const { LOCALES } = require('../ui/lib/translate');
const root = path.join(__dirname, '..');
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// --- Updates: Microsoft Store updates the Store package, so electron-updater must never run there.

function fakeTimers() {
  let now = 0, id = 0;
  const pending = new Map();
  const add = (fn, ms, every) => { pending.set(++id, { fn, at: now + ms, every }); return id; };
  return {
    now: () => now, pending,
    setTimeout: (fn, ms) => add(fn, ms), setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: key => pending.delete(key), clearInterval: key => pending.delete(key),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const [key, timer] = [...pending].sort((a, b) => a[1].at - b[1].at)[0] || [];
        if (!timer || timer.at > end) break;
        now = timer.at;
        if (timer.every) timer.at += timer.every; else pending.delete(key);
        await timer.fn();
      }
      now = end;
    },
  };
}
class CountingUpdater extends EventEmitter {
  constructor() { super(); this.checks = 0; this.installs = 0; }
  async checkForUpdates() { this.checks++; return { isUpdateAvailable: true, updateInfo: { version: '9.0.0' }, downloadPromise: Promise.resolve([]) }; }
  quitAndInstall() { this.installs++; }
}

test('the Store package is recognised before anything else, and other copies keep their update source', () => {
  const exists = () => true, missing = () => false, execPath = 'C:\\Apps\\Remember Me\\Remember Me.exe';
  assert.equal(updateSource({ windowsStore: true, packaged: true, execPath, exists }), 'store');
  assert.equal(updateSource({ windowsStore: true, packaged: true, execPath, exists: missing }), 'store');
  assert.equal(updateSource({ windowsStore: undefined, packaged: true, execPath, exists }), 'github', 'installed by the NSIS installer');
  assert.equal(updateSource({ windowsStore: false, packaged: true, execPath, exists: missing }), 'elsewhere', 'portable or Scoop');
  assert.equal(updateSource({ packaged: false, execPath, exists: missing }), 'github', 'development build');
});

test('a Store copy never loads electron-updater; an installed copy gets the configured one', async () => {
  const load = () => { throw new Error('electron-updater must not be loaded'); };
  for (const [source, testMode] of [['store', false], ['elsewhere', false], ['github', true], ['store', true]]) {
    const updater = createUpdater({ source, testMode, load });
    assert.equal(await updater.checkForUpdates(), null, source);
    assert.doesNotThrow(() => updater.quitAndInstall());
  }
  const real = Object.assign(new EventEmitter(), { setFeedURL(feed) { this.feed = feed; } });
  assert.equal(createUpdater({ source: 'github', load: () => real }), real);
  assert.deepEqual(real.feed, FEED);
  assert.equal(real.autoInstallOnAppQuit, false);
});

test('in the Store package nothing is ever checked, downloaded or installed, even with consent', async () => {
  const timers = fakeTimers(), updater = new CountingUpdater();
  let quits = 0, backups = 0, changes = 0;
  const updates = new Updates({ updater, timers, clock: timers.now, source: 'store', available: true, version: '1.6.2', consent: () => true,
    backup: async () => { backups++; }, prepareQuit() {}, quit: () => { quits++; }, onChange: () => { changes++; } });
  updates.start();
  assert.equal(timers.pending.size, 0, 'no background check is scheduled');
  updates.consentChanged();
  await timers.advance(5 * CHECK_EVERY);
  assert.deepEqual(await updates.check(), updates.status(), '"Check now" only reports the status');
  assert.equal(updater.checks, 0);
  assert.equal(await updates.restart(), false);
  let prevented = false;
  assert.equal(updates.beforeQuit({ preventDefault: () => { prevented = true; } }), false);
  assert.equal(prevented, false, 'quitting is never held up for an update');
  assert.deepEqual({ installs: updater.installs, quits, backups, changes }, { installs: 0, quits: 0, backups: 0, changes: 0 });
  const status = updates.status();
  assert.equal(status.source, 'store');
  assert.equal(status.available, false, 'the window asks no update consent');
  assert.equal(status.banner, false);
});

test('the installer version still checks GitHub as before', async () => {
  const timers = fakeTimers(), updater = new CountingUpdater();
  const updates = new Updates({ updater, timers, clock: timers.now, version: '1.6.2', consent: () => true, backup: async () => {}, prepareQuit() {}, quit() {} });
  updates.start();
  await timers.advance(60 * 1000);
  assert.equal(updater.checks, 1);
  assert.equal(updates.status().source, 'github');
  assert.equal(updates.status().available, true);
});

// --- Start with Windows: a startup task in the package, which the user turns on in Windows.

test('the Store version never writes the Run key; the installer version does', () => {
  const calls = [];
  const app = { setLoginItemSettings: settings => calls.push(settings) };
  assert.equal(setLoginItem(app, true, 'C:\\Store\\app\\Remember Me.exe', { windowsStore: true }), false);
  assert.deepEqual(calls, []);
  assert.equal(setLoginItem(app, true, 'C:\\Apps\\Remember Me.exe'), true);
  assert.deepEqual(calls, [{ openAtLogin: true, path: 'C:\\Apps\\Remember Me.exe', args: ['--background'] }]);
});

test("the installer version keeps its AppUserModelID; the Store version uses its package identity's", () => {
  assert.equal(APP_USER_MODEL_ID, 'com.waqt.reminder');
  assert.equal(appUserModelId(), 'com.waqt.reminder');
  assert.equal(appUserModelId({ windowsStore: false }), 'com.waqt.reminder');
  assert.equal(appUserModelId({ windowsStore: true }), null);
  assert.match(fs.readFileSync(path.join(root, 'tools/installer.cjs'), 'utf8'), new RegExp(`appId: '${APP_USER_MODEL_ID.replace(/\./g, '\\.')}'`), 'Same as the installer appId');
  const main = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8');
  assert.match(main, /const userModelId = appUserModelId\(\{ windowsStore \}\);\s*if \(userModelId\) app\.setAppUserModelId\(userModelId\);/);
  assert.equal((main.match(/setAppUserModelId\(/g) || []).length, 1, 'No other call sets it unconditionally');
});

test('the package declares a startup task that stays off until the user turns it on', () => {
  const xml = startupTaskExtension('app\\Remember Me.exe', 'Remember "Me" & <you>');
  assert.match(xml, /<desktop:Extension Category="windows\.startupTask" Executable="app\\Remember Me\.exe" EntryPoint="Windows\.FullTrustApplication">/);
  assert.match(xml, new RegExp(`<desktop:StartupTask TaskId="${STARTUP_TASK_ID}" Enabled="false" DisplayName="Remember &quot;Me&quot; &amp; &lt;you&gt;" />`));
  assert.match(xml, /<\/desktop:Extension>/);
  assert.equal(STARTUP_SETTINGS, 'ms-settings:startupapps');
});

test('the Startup apps page opens only in the Store version, and the page learns which version it is', async () => {
  let opened = 0;
  const ctx = { electron: {}, tr: text => text, windowsStore: false, openStartupSettings: async () => { opened++; } };
  const handlers = createHandlers(ctx);
  assert.doesNotThrow(() => checkRequest('openStartupSettings', {}));
  await assert.rejects(handlers.openStartupSettings.run({}), /only the Microsoft Store version/);
  ctx.windowsStore = true;
  await handlers.openStartupSettings.run({});
  assert.equal(opened, 1);
  Object.assign(ctx, { store: { state: { settings: {} }, recovered: false }, app: { getPath: () => 'C:\\data', isPackaged: true },
    driveBackup: { status: () => ({}) }, updates: { status: () => ({ source: 'store' }) }, quickAdd: { status: () => ({}) }, takeOpenRequest: () => null });
  assert.equal(handlers.state.run({}).windowsStore, true);
  ctx.windowsStore = undefined;
  assert.equal(handlers.state.run({}).windowsStore, false);
  assert.equal(handlers.state.run({}).importedFromInstaller, false);
  ctx.importedFromInstaller = true;
  assert.equal(handlers.state.run({}).importedFromInstaller, true, "After copying the installer version's data, the page suggests uninstalling it");
});

test("the Store version's startup help names the entry as Windows lists it, in every language", () => {
  // Windows' Startup apps page shows the startup task's DisplayName, which tools/store.cjs takes from
  // store/identity.json ("Remember Me Reminders"), not "Remember Me". These texts appear only in the Store version.
  const { displayName } = store.readIdentity(store.IDENTITY_FILE);
  const { loadLocale } = require('../tools/i18n-keys.cjs');
  const keys = Object.keys(loadLocale('en')).filter(key => /Startup apps|Apps → Startup/.test(key));
  assert.equal(keys.length, 3);
  for (const { code } of LOCALES) {
    const messages = loadLocale(code);
    for (const key of keys) assert.ok(messages[key]?.includes(displayName), `${code}: "${key}" names ${displayName}`);
  }
  const page = fs.readFileSync(path.join(root, 'ui/index.html'), 'utf8');
  assert.ok(page.includes(`Startup, turn on ${displayName}.`), 'The settings row names it too');
});

// --- Data folder: the Store version copies the installer version's data into its package folder.

const FAMILY = 'FastKiwi.RememberMeReminders_sm1xjmj6v76yc';
const storeExe = (drive = 'C:') => `${drive}\\Program Files\\WindowsApps\\FastKiwi.RememberMeReminders_1.6.2.0_x64__sm1xjmj6v76yc\\app\\Remember Me.exe`;

test('the package family name comes from the WindowsApps install folder', () => {
  assert.equal(packageFamilyName(storeExe()), FAMILY);
  assert.equal(packageFamilyName(storeExe('D:').replace('Program Files\\', '')), FAMILY, 'apps moved to another drive');
  assert.equal(packageFamilyName('C:\\Program Files\\WindowsApps\\FastKiwi.RememberMeReminders_1.6.2.0_x64_~_sm1xjmj6v76yc\\app\\Remember Me.exe'), FAMILY, 'with a resource id');
  for (const other of ['C:\\Users\\me\\AppData\\Local\\Programs\\Remember Me\\Remember Me.exe', 'C:\\dev\\remember-me\\app\\Remember Me.exe', '', undefined]) assert.equal(packageFamilyName(other), null, String(other));
});

function storeSetup({ source = 'Remember Me' } = {}) {
  const home = tmp('remember-me-store-');
  const appData = path.join(home, 'Roaming'), localAppData = path.join(home, 'Local');
  const packageFolder = path.join(localAppData, 'Packages', FAMILY);
  fs.mkdirSync(packageFolder, { recursive: true });
  const old = path.join(appData, source);
  const data = new Store(old);
  data.change(s => { saveTask(s, { title: 'من نسخة المثبّت' }); });
  fs.mkdirSync(path.join(old, 'attachments', 'a'), { recursive: true });
  fs.writeFileSync(path.join(old, 'attachments', 'a', 'photo.png'), 'png bytes');
  const backup = path.join(old, 'backups', 'RememberMe-backup-2026-11-01T00-00-00-000Z');
  fs.mkdirSync(backup, { recursive: true });
  fs.copyFileSync(path.join(old, 'data.json'), path.join(backup, 'data.json'));
  fs.writeFileSync(path.join(old, 'drive-backup.json'), JSON.stringify({ folder: path.join(home, 'Drive'), lastLocalPath: backup }));
  // Chromium's own files, which the Store version doesn't need.
  fs.mkdirSync(path.join(old, 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(old, 'Cache', 'data_0'), 'cache');
  return { home, appData, localAppData, old, folder: path.join(packageFolder, 'LocalState', 'Remember Me'), backup };
}
const listing = folder => fs.readdirSync(folder, { recursive: true }).map(String).sort();

test("the first Store start copies the installer version's data and leaves the original untouched", () => {
  const { appData, localAppData, old, folder, backup } = storeSetup();
  const before = listing(old), original = fs.readFileSync(path.join(old, 'data.json'), 'utf8');
  const result = storeDataFolder(appData, { localAppData, execPath: storeExe() });
  assert.deepEqual(result, { folder, migrated: 'imported', store: 'package' });
  assert.deepEqual(listing(old), before);
  assert.equal(fs.readFileSync(path.join(old, 'data.json'), 'utf8'), original);
  assert.equal(new Store(folder).state.tasks[0].title, 'من نسخة المثبّت');
  assert.equal(fs.readFileSync(path.join(folder, 'attachments', 'a', 'photo.png'), 'utf8'), 'png bytes');
  assert.deepEqual(fs.readdirSync(folder).sort(), STORE_ITEMS.filter(name => fs.existsSync(path.join(old, name))).sort(), "only the app's own files, not Chromium's cache");
  const drive = JSON.parse(fs.readFileSync(path.join(folder, 'drive-backup.json'), 'utf8'));
  assert.equal(drive.lastLocalPath, path.join(folder, path.relative(old, backup)));
  assert.ok(!fs.existsSync(folder + '.importing'));
  // Later starts use the package folder as it is, even when the installer version changed its data since.
  fs.writeFileSync(path.join(old, 'data.json'), original.replace('من نسخة المثبّت', 'changed later'));
  assert.deepEqual(storeDataFolder(appData, { localAppData, execPath: storeExe() }), { folder, migrated: 'none', store: 'package' });
  assert.equal(new Store(folder).state.tasks[0].title, 'من نسخة المثبّت');
});

test('a v1.4 Waqt folder is imported too, and a fresh Store install starts empty', () => {
  const waqt = storeSetup({ source: 'Waqt' });
  assert.equal(storeDataFolder(waqt.appData, { localAppData: waqt.localAppData, execPath: storeExe() }).migrated, 'imported');
  assert.equal(new Store(waqt.folder).state.tasks.length, 1);
  const fresh = tmp('remember-me-store-fresh-');
  fs.mkdirSync(path.join(fresh, 'Local', 'Packages', FAMILY), { recursive: true });
  const result = storeDataFolder(path.join(fresh, 'Roaming'), { localAppData: path.join(fresh, 'Local'), execPath: storeExe() });
  assert.deepEqual(result, { folder: path.join(fresh, 'Local', 'Packages', FAMILY, 'LocalState', 'Remember Me'), migrated: 'none', store: 'package' });
});

test('if the copy fails, the Store version keeps using the old folder and tries again next start', () => {
  const { appData, localAppData, old, folder } = storeSetup();
  const before = listing(old);
  const result = storeDataFolder(appData, { localAppData, execPath: storeExe(), copy: () => { const error = new Error('EBUSY: resource busy or locked'); error.code = 'EBUSY'; throw error; } });
  assert.equal(result.folder, old);
  assert.equal(result.migrated, 'failed');
  assert.match(result.error.message, /EBUSY/);
  assert.ok(!fs.existsSync(folder) && !fs.existsSync(folder + '.importing'));
  assert.deepEqual(listing(old), before);
  assert.equal(storeDataFolder(appData, { localAppData, execPath: storeExe() }).migrated, 'imported');
});

test('an unknown package layout falls back to the installer behaviour', () => {
  const { appData, localAppData, old } = storeSetup();
  const result = storeDataFolder(appData, { localAppData, execPath: 'C:\\dev\\Remember Me.exe' });
  assert.deepEqual(result, { folder: old, migrated: 'none', store: 'appdata' });
});

// --- tools/store.cjs: identity and electron-builder settings.

function identityFile(values) {
  const file = path.join(tmp('remember-me-identity-'), 'identity.json');
  fs.writeFileSync(file, JSON.stringify(values));
  return file;
}
const REAL = { identityName: 'FastKiwi.RememberMeReminders', publisher: 'CN=8EFD6949-D088-481F-886D-82300679C5E5', publisherDisplayName: 'FastKiwi' };

test('the Store build refuses a placeholder identity, except in a dry run with test values', () => {
  const placeholder = identityFile({ ...REAL, identityName: 'TODO-reserve-the-name-in-Partner-Center' });
  assert.throws(() => store.readIdentity(placeholder), error => error instanceof store.IdentityError && /placeholder for identityName/.test(error.message) && /--dry-run/.test(error.message));
  assert.equal(store.identityStatus(placeholder), 'placeholder');
  assert.deepEqual(store.readIdentity(placeholder, { dryRun: true }), { ...store.DRY_RUN_IDENTITY, displayName: 'Remember Me', dryRun: true });
  assert.equal(store.DRY_RUN_IDENTITY.publisher, 'CN=FastKiwiTest');
  for (const key of ['publisher', 'publisherDisplayName']) assert.throws(() => store.readIdentity(identityFile({ ...REAL, [key]: '' })), new RegExp(`placeholder for ${key}`));
  assert.throws(() => store.readIdentity(identityFile({ ...REAL, identityName: 'Remember Me' })), /3 to 50 letters/);
  assert.throws(() => store.readIdentity(identityFile({ ...REAL, publisher: 'FastKiwi' })), /must start with CN=/);
  const ready = identityFile({ ...REAL, displayName: 'Remember Me - Reminders' });
  assert.deepEqual(store.readIdentity(ready), { ...REAL, displayName: 'Remember Me - Reminders', dryRun: false });
  assert.equal(store.identityStatus(ready), 'ready');
});

test("the repository's identity file holds the reserved Store identity", () => {
  // Partner Center > Product identity. The package's DisplayName must be the reserved name.
  assert.deepEqual(store.readIdentity(), { ...REAL, displayName: 'Remember Me Reminders', dryRun: false });
  assert.equal(store.identityStatus(), 'ready');
});

test('the appx settings: identity, every interface language, Windows 10 1809, no updater files, our startup task', () => {
  const identity = { ...REAL, displayName: 'Remember Me', dryRun: false };
  const config = store.storeConfig(identity, '/resources');
  assert.equal(config.appId, 'com.waqt.reminder');
  assert.equal(config.publish, null);
  assert.equal(config.directories.buildResources, '/resources');
  const appx = config.appx;
  assert.deepEqual([appx.identityName, appx.publisher, appx.publisherDisplayName, appx.displayName], [REAL.identityName, REAL.publisher, REAL.publisherDisplayName, 'Remember Me']);
  assert.equal(appx.applicationId, 'RememberMe');
  assert.equal(appx.languages[0], 'en-US');
  assert.equal(appx.languages[1], 'ar');
  assert.equal(appx.languages.length, LOCALES.length);
  assert.equal(appx.minVersion, '10.0.17763.0');
  assert.equal(appx.addAutoLaunchExtension, false);
  assert.equal(appx.customExtensionsPath, path.join('/resources', 'extensions.xml'));
  assert.equal(appx.electronUpdaterAware, false);
  assert.ok(appx.backgroundColor);
  assert.equal(appx.artifactName, 'Remember-Me-${version}-x64.${ext}');
  assert.match(store.storeConfig({ ...identity, dryRun: true }, '/resources').appx.artifactName, /dry-run/);
});

// --- Logos generated from assets/icon.png.

test('every Store logo is generated at its exact size, without scaling the icon up', () => {
  const folder = path.join(tmp('remember-me-logos-'), 'appx');
  const names = logos.writeStoreLogos(path.join(root, 'assets', 'icon.png'), folder, path.join(root, 'assets', 'icon.ico'));
  assert.deepEqual(fs.readdirSync(folder).sort(), [...names].sort());
  for (const required of ['StoreLogo.scale-100.png', 'Square44x44Logo.scale-100.png', 'Square150x150Logo.scale-100.png', 'Wide310x150Logo.scale-100.png',
    'StoreLogo.scale-200.png', 'Square44x44Logo.scale-200.png', 'Square150x150Logo.scale-200.png', 'Wide310x150Logo.scale-200.png',
    'Square44x44Logo.targetsize-16_altform-unplated.png', 'Square44x44Logo.targetsize-256.png']) assert.ok(names.includes(required), required);
  for (const { name, width, height, icon } of logos.logoFiles()) {
    assert.ok(icon <= 256, name);
    const image = logos.decodePng(fs.readFileSync(path.join(folder, name)));
    assert.deepEqual([image.width, image.height], [width, height], name);
    // Transparent corners around the centered icon; the center is opaque.
    assert.ok(image.data[3] < 16, `${name} corner`);
    assert.equal(image.data[((height >> 1) * width + (width >> 1)) * 4 + 3], 255, `${name} center`);
  }
});

test('the brand logos in store/logos replace the generated ones and add the unplated taskbar symbols', () => {
  const folder = path.join(tmp('remember-me-brand-logos-'), 'appx'), art = path.join(root, 'store', 'logos');
  const names = logos.writeStoreLogos(path.join(root, 'assets', 'icon.png'), folder, path.join(root, 'assets', 'icon.ico'), art);
  assert.deepEqual(fs.readdirSync(folder).sort(), [...names].sort());
  const replaced = fs.readdirSync(art).filter(name => fs.readFileSync(path.join(folder, name)).equals(fs.readFileSync(path.join(art, name))));
  assert.deepEqual(fs.readdirSync(art).filter(name => !replaced.includes(name)), ['StoreLogo.scale-125.png'], 'Only the brand file of the wrong size is left out');
  for (const { name, width, height } of logos.logoFiles()) {
    const image = logos.decodePng(fs.readFileSync(path.join(folder, name)));
    assert.deepEqual([image.width, image.height], [width, height], name);
  }
  for (const size of [16, 24, 32, 48, 256]) {
    for (const suffix of ['', '_altform-unplated', '_altform-lightunplated']) assert.ok(names.includes(`Square44x44Logo.targetsize-${size}${suffix}.png`), `${size}${suffix}`);
    // The taskbar symbol has no tile: its corner is transparent where the plated logo is opaque inside the rounded edge.
    const unplated = logos.decodePng(fs.readFileSync(path.join(art, `Square44x44Logo.targetsize-${size}_altform-unplated.png`)));
    const plated = logos.decodePng(fs.readFileSync(path.join(art, `Square44x44Logo.targetsize-${size}.png`)));
    const at = (Math.round(size * 0.12) * size + Math.round(size * 0.12)) * 4 + 3;
    assert.equal(unplated.data[at], 0, `${size} unplated`); assert.equal(plated.data[at], 255, `${size} plated`);
  }
});

test('the PNG helpers round-trip and average colours without dark fringes', () => {
  const size = 8, data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set(i % 2 ? [121, 96, 202, 255] : [0, 0, 0, 0], i * 4);
  const image = { width: size, height: size, data };
  assert.deepEqual(logos.decodePng(logos.encodePng(image)), image);
  const small = logos.scaleDown(image, 2);
  for (let i = 0; i < 4; i++) assert.deepEqual([...small.data.subarray(i * 4, i * 4 + 4)], [121, 96, 202, 128]);
  assert.throws(() => logos.scaleDown(image, 16), /scaled up/);
});
