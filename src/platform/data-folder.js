'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateState } = require('../core/tasks');
const FOLDER = 'Remember Me';
// Versions up to 1.4 kept their data in %APPDATA%\Waqt, the app's original internal name.
const LEGACY = 'Waqt';
const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);
const stamp = date => date.toISOString().replace(/[:.]/g, '-');
const hasData = folder => ['data.json', 'data.json.bak'].some(name => fs.existsSync(path.join(folder, name)));

function renameWithRetry(rename, from, to, attempts = 5) {
  for (let i = 1; ; i++) {
    try { return rename(from, to); }
    catch (error) {
      if (!LOCKED.has(error.code) || i >= attempts) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * i);
    }
  }
}
// Every file below folder with its size, keyed by its relative path. `only` limits the top level to those names.
function inventory(folder, prefix = '', files = new Map(), only = null) {
  for (const entry of fs.readdirSync(path.join(folder, prefix), { withFileTypes: true })) {
    if (only && !prefix && !only.includes(entry.name)) continue;
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) inventory(folder, name, files);
    else if (entry.isFile()) files.set(name, fs.statSync(path.join(folder, name)).size);
  }
  return files;
}
function verifyCopy(source, copy, only = null) {
  const expected = inventory(source, '', new Map(), only), actual = inventory(copy);
  if (expected.size !== actual.size) throw new Error('The copied data folder is missing files.');
  for (const [name, size] of expected) if (actual.get(name) !== size) throw new Error(`The copy of "${name}" is incomplete.`);
  const data = path.join(copy, 'data.json');
  if (fs.existsSync(data)) validateState(JSON.parse(fs.readFileSync(data, 'utf8')));
}
// drive-backup.json remembers the latest local backup by its full path. `at` is where the file
// is now, `folder` where the data folder will end up.
function moveDrivePaths(at, folder, legacy) {
  const file = path.join(at, 'drive-backup.json');
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const local = config.lastLocalPath;
    if (typeof local !== 'string' || !local.toLowerCase().startsWith(legacy.toLowerCase() + path.sep)) return;
    config.lastLocalPath = path.join(folder, local.slice(legacy.length + 1));
    fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
  } catch { /* Missing or unreadable: DriveBackup reports and recovers from that itself. */ }
}

// Returns the data folder to use, moving %APPDATA%\Waqt to %APPDATA%\Remember Me the first time.
// The old folder is never deleted: it is renamed as a whole, or copied, checked and then renamed
// to Waqt.migrated-<time>. If anything fails the old folder is used as it is and the move is
// retried on the next start.
function migrateDataFolder(appData, { rename = fs.renameSync, copy = (from, to) => fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false }), now = () => new Date() } = {}) {
  const folder = path.join(appData, FOLDER), legacy = path.join(appData, LEGACY);
  const staging = folder + '.migrating';
  if (fs.existsSync(folder) && (hasData(folder) || !fs.existsSync(legacy) || !hasData(legacy))) return { folder, migrated: 'none' };
  if (!fs.existsSync(legacy)) return { folder, migrated: 'none' };
  try {
    // A new folder without any data, such as one left by a development build, must not hide the old data.
    if (fs.existsSync(folder)) renameWithRetry(rename, folder, `${folder}.unused-${stamp(now())}`);
    // A copy left by an interrupted earlier attempt is incomplete; the old folder is still the original.
    fs.rmSync(staging, { recursive: true, force: true });
    try {
      renameWithRetry(rename, legacy, folder);
      moveDrivePaths(folder, folder, legacy);
      return { folder, migrated: 'renamed' };
    } catch (error) { if (!LOCKED.has(error.code)) throw error; }
    try {
      copy(legacy, staging);
      verifyCopy(legacy, staging);
      moveDrivePaths(staging, folder, legacy);
      renameWithRetry(rename, staging, folder);
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw error;
    }
    const kept = `${legacy}.migrated-${stamp(now())}`;
    // If the old folder is still locked it stays as it is; the new folder wins from now on.
    try { renameWithRetry(rename, legacy, kept); return { folder, migrated: 'copied', legacy: kept }; }
    catch { return { folder, migrated: 'copied', legacy }; }
  } catch (error) {
    return { folder: legacy, migrated: 'failed', error };
  }
}

// The Microsoft Store (MSIX) version keeps its data in its package's own folder,
// %LOCALAPPDATA%\Packages\<package family name>\LocalState\Remember Me. Inside a package, Windows
// virtualizes %APPDATA%: new files land in a hidden per-package copy that File Explorer, other
// programs and the installer version can't see. The package folder is real, so Settings shows
// a path that File Explorer opens. Windows removes it when the Store app is uninstalled or reset.
const STORE_ITEMS = ['data.json', 'data.json.bak', 'attachments', 'backups', 'drive-backup.json', 'logs'];
// A Store package is installed in ...\WindowsApps\<Name>_<Version>_<Arch>_<ResourceId>_<PublisherId>\app\,
// and its family name is <Name>_<PublisherId>. Returns null for any other layout.
function packageFamilyName(execPath) {
  const parts = String(execPath).split(/[\\/]/);
  if (parts.length < 3 || parts[parts.length - 2].toLowerCase() !== 'app') return null;
  const match = /^([A-Za-z0-9.-]{3,50})_\d+(?:\.\d+){3}_[A-Za-z0-9]+_[^_]*_([a-z0-9]{13})$/.exec(parts[parts.length - 3]);
  return match ? `${match[1]}_${match[2]}` : null;
}
// Returns the data folder for the Store version. The first time, the data of an installer version on
// this PC (%APPDATA%\Remember Me, or %APPDATA%\Waqt from v1.4) is copied in and checked: only the app's
// own files (STORE_ITEMS), never Chromium's caches. The original is never changed or deleted, so the
// installer version keeps working with it. If the copy fails, the Store version uses %APPDATA% as it is
// (virtualized, but it still sees the installer version's files) and tries again on the next start.
function storeDataFolder(appData, { localAppData = path.join(appData, '..', 'Local'), execPath, copy = (from, to) => fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false }), rename = fs.renameSync, now = () => new Date() } = {}) {
  const family = packageFamilyName(execPath);
  const packageFolder = family && localAppData ? path.join(localAppData, 'Packages', family) : null;
  // Not a Store layout we know (a package registered from a folder, say): behave like the installer version.
  if (!packageFolder || !fs.existsSync(packageFolder)) return { ...migrateDataFolder(appData, { rename, now }), store: 'appdata' };
  const folder = path.join(packageFolder, 'LocalState', FOLDER);
  if (hasData(folder)) return { folder, migrated: 'none', store: 'package' };
  const source = [path.join(appData, FOLDER), path.join(appData, LEGACY)].find(hasData);
  if (!source) return { folder, migrated: 'none', store: 'package' };
  const staging = folder + '.importing';
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    const items = STORE_ITEMS.filter(name => fs.existsSync(path.join(source, name)));
    for (const name of items) copy(path.join(source, name), path.join(staging, name));
    verifyCopy(source, staging, items);
    moveDrivePaths(staging, folder, source);
    if (fs.existsSync(folder)) renameWithRetry(rename, folder, `${folder}.unused-${stamp(now())}`);
    renameWithRetry(rename, staging, folder);
    return { folder, migrated: 'imported', store: 'package' };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    return { folder: source, migrated: 'failed', error, store: 'appdata' };
  }
}
module.exports = { FOLDER, LEGACY, STORE_ITEMS, migrateDataFolder, packageFamilyName, storeDataFolder };
