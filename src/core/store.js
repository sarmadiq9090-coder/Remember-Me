'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { UserError } = require('./errors');
const { initialState, validateState } = require('./tasks');
// data.json on disk: every change is validated, the previous file is kept as data.json.bak, and the
// new one is written to a temporary file, flushed and renamed into place.
// Antivirus scanners, the search indexer and sync clients briefly lock new files on Windows.
const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);
function renameWithRetry(from, to, attempts = 10) {
  for (let i = 1; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (error) {
      if (!LOCKED.has(error.code) || i >= attempts) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * i);
    }
  }
}
function writeDurable(file, text) {
  const temporary = file + '.tmp';
  const fd = fs.openSync(temporary, 'w');
  try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  renameWithRetry(temporary, file);
}
function copyDurable(from, to) {
  fs.copyFileSync(from, to);
  const fd = fs.openSync(to, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
class Store {
  constructor(directory) {
    this.file = path.join(directory, 'data.json');
    fs.mkdirSync(directory, { recursive: true });
    this.recovered = false;
    if (!fs.existsSync(this.file)) { this.state = initialState(); return; }
    try { this.state = validateState(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch {
      try {
        this.state = validateState(JSON.parse(fs.readFileSync(this.file + '.bak', 'utf8')));
        fs.copyFileSync(this.file, this.file + '.damaged-' + Date.now());
        writeDurable(this.file, JSON.stringify(this.state, null, 2));
        this.recovered = true;
      } catch { throw new UserError('Could not read the data or its backup. The files were left unchanged in: "{folder}"', { folder: directory }); }
    }
  }
  change(fn) {
    const draft = structuredClone(this.state);
    const result = fn(draft);
    this.commit(draft);
    return result;
  }
  // Swaps in a complete state, such as one restored from a backup.
  replace(next) { this.commit(structuredClone(next)); }
  commit(draft) {
    validateState(draft);
    if (fs.existsSync(this.file)) copyDurable(this.file, this.file + '.bak');
    writeDurable(this.file, JSON.stringify(draft, null, 2));
    this.state = draft;
  }
}
module.exports = { Store, writeDurable, renameWithRetry };
