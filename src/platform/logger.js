'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 1024 * 1024, FILES = 3;
// Text in «», "" or '' may be a task title, a file name or a path containing one; it is never logged.
// As a backstop, an unquoted Windows or network path is dropped up to the end of the text.
function redact(text) {
  return String(text ?? '').replace(/«[^»]*»/g, '«…»').replace(/"[^"]*"/g, '"…"').replace(/'[^']*'/g, "'…'")
    .replace(/(?:(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\)[^\n]*/g, '…').slice(0, 500);
}
function describe(error) {
  if (!error) return {};
  const frames = String(error.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 3)
    // Code locations only, as file:line:column. Everything from the first folder to the last separator
    // goes, so folder names with spaces or brackets (a Windows user name, "Remember Me") never stay.
    .map(line => line.trim().replace(/(?:file:\/+)?(?:[A-Za-z]:)?[\\/].*[\\/]/, ''));
  // A UserError's untranslated template keeps its {placeholders}, so no path or name is filled in.
  return { error: redact(error.key ?? error.message ?? error), ...(error.code ? { code: String(error.code) } : {}), ...(frames.length ? { at: frames } : {}) };
}
// One JSON line per event in <data folder>/logs/remember-me.log, rotated at 1 MB with three files kept,
// so users can attach it to a bug report. Callers pass ids, counts and outcomes only: never titles,
// bodies or file names. Logging never throws.
function createLogger(directory, { maxBytes = MAX_BYTES, files = FILES, clock = () => new Date() } = {}) {
  const folder = path.join(directory, 'logs'), file = path.join(folder, 'remember-me.log');
  function rotate() {
    for (let i = files - 1; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i}`);
    }
  }
  function write(level, event, details = {}) {
    try {
      const line = JSON.stringify({ time: clock().toISOString(), level, event, ...details }) + '\n';
      fs.mkdirSync(folder, { recursive: true });
      let size = 0;
      try { size = fs.statSync(file).size; } catch { /* first line */ }
      if (size && size + Buffer.byteLength(line) > maxBytes) rotate();
      fs.appendFileSync(file, line, 'utf8');
    } catch { /* a full disk or a locked file must never break the app */ }
  }
  return {
    folder, file,
    info: (event, details) => write('info', event, details),
    warn: (event, error, details) => write('warn', event, { ...details, ...describe(error) }),
    error: (event, error, details) => write('error', event, { ...details, ...describe(error) }),
  };
}
// Used where no data folder is known yet, and by modules that are given no logger.
const silent = { info() {}, warn() {}, error() {} };
module.exports = { createLogger, redact, silent };
