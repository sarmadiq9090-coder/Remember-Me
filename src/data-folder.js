'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateState } = require('./core/tasks');
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
// Every file below folder with its size, keyed by its relative path.
function inventory(folder, prefix = '', files = new Map()) {
  for (const entry of fs.readdirSync(path.join(folder, prefix), { withFileTypes: true })) {
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) inventory(folder, name, files);
    else if (entry.isFile()) files.set(name, fs.statSync(path.join(folder, name)).size);
  }
  return files;
}
function verifyCopy(source, copy) {
  const expected = inventory(source), actual = inventory(copy);
  if (expected.size !== actual.size) throw new Error('The copied data folder is missing files.');
  for (const [name, size] of expected) if (actual.get(name) !== size) throw new Error(`The copy of ${name} is incomplete.`);
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
module.exports = { FOLDER, LEGACY, migrateDataFolder };
