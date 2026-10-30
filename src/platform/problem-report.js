'use strict';
const fs = require('node:fs');
const { redact } = require('./logger');
const { windowsVersion } = require('./about');
// "Report this problem" opens a new GitHub issue in the browser, filled in from here. Nothing is sent
// by the app: the user reads the issue and submits it, or closes the tab.
const NEW_ISSUE = 'https://github.com/sarmadiq9090-coder/Remember-Me/issues/new';
const MAX_URL = 7000, LOG_LINES = 30;
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A folder as a pattern that matches it with either separator, a doubled backslash (as in JSON) or a
// file:/// prefix, in any case, so "C:\Users\Sam" and "c:/users/sam" both go.
function folderPattern(folder) {
  const parts = String(folder).split(/[\\/]+/).filter(Boolean).map(escapeRegExp);
  return parts.length ? new RegExp(`(?:file:/+)?${parts.join(String.raw`(?:\\{1,2}|/)`)}`, 'gi') : null;
}
// Removes the data folder, the user profile and any other C:\Users\<name> path, then applies the
// log's own redaction, which also drops quoted text and any remaining drive or network path.
function scrub(text, folders = []) {
  let value = String(text ?? '');
  for (const [folder, label] of folders) { const pattern = folder && folderPattern(folder); if (pattern) value = value.replace(pattern, label); }
  value = value.replace(/(?:file:\/+)?[A-Za-z]:(?:\\{1,2}|\/)(?:Users|Documents and Settings)(?:\\{1,2}|\/)[^\\/\s"']+/gi, '<user>');
  return redact(value);
}
// Keeps a log line's time, level and event; other values only as numbers, booleans and redacted
// text. Lines that are not the logger's JSON are left out, so nothing the logger did not write gets in.
function cleanLine(line, folders) {
  let entry;
  try { entry = JSON.parse(line); } catch { return null; }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const clean = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!/^[A-Za-z][\w-]{0,40}$/.test(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) clean[key] = value;
    else if (typeof value === 'string') clean[key] = scrub(value, folders).slice(0, 300);
    else if (Array.isArray(value)) clean[key] = value.slice(0, 5).map(item => scrub(typeof item === 'string' ? item : JSON.stringify(item), folders).slice(0, 200));
  }
  return clean.event ? JSON.stringify(clean) : null;
}
// The newest lines of the rotating log (remember-me.log, then remember-me.log.1 if it is short).
function readLogTail(file, count = LOG_LINES) {
  const lines = [];
  for (const name of [file, `${file}.1`]) {
    try {
      const text = fs.readFileSync(name, 'utf8');
      lines.unshift(...text.split('\n').filter(line => line.trim()));
    } catch { /* no log yet */ }
    if (lines.length >= count) break;
  }
  return lines.slice(-count);
}
// What the issue says happened.
const KINDS = { crash: 'Crash', errors: 'Repeated errors', manual: 'Problem' };
function issueUrl(title, body) { return `${NEW_ISSUE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`; }
// The issue's title and body, and the URL that opens it. The log is cut from the oldest line until
// the URL fits in maxUrl characters, and the body then says how many lines were left out.
function buildReport({ version, packaged, windows, arch, language, theme, kind = 'manual', cause = '', lines = [], folders = [], maxUrl = MAX_URL }) {
  const clean = lines.slice(-LOG_LINES).map(line => cleanLine(line, folders)).filter(Boolean);
  const reason = cause ? scrub(cause, folders).slice(0, 80) : '';
  const title = `${KINDS[kind] || KINDS.manual}${reason ? ` (${reason})` : ''} in Remember Me ${version}`;
  const head = [
    '### What happened?', '', '<!-- What were you doing when it happened? Please do not paste task or note text. -->', '',
    '### Details', '',
    `- Remember Me ${version}${packaged ? '' : ' (development build)'}`,
    `- Windows ${windows ? windowsVersion(windows) : 'unknown'} ${arch || ''}`.trimEnd(),
    `- UI language: ${language}`,
    `- Theme: ${theme}`,
    ...(reason ? [`- ${KINDS[kind] || KINDS.manual}: ${reason}`] : []), '',
  ];
  const body = (kept, total) => {
    const log = !total ? ['_The app log is empty._'] : [
      `### Recent log lines (${kept.length} of ${total}, redacted)`, '',
      ...(kept.length < total ? [`_Truncated: the ${total - kept.length} oldest lines were left out to keep the link short._`, ''] : []),
      '```', ...kept, '```',
    ];
    return [...head, ...log, '', '_Made by Remember Me. Nothing was sent until you submitted this issue. Tasks, notes, file names and paths are never included._'].join('\n');
  };
  let kept = clean;
  for (;;) {
    const text = body(kept, clean.length), url = issueUrl(title, text);
    // With every log line gone and still too long (a tiny maxUrl), cut the URL without splitting a %XX escape.
    if (url.length <= maxUrl || !kept.length) return { title, body: text, url: url.length <= maxUrl ? url : url.slice(0, maxUrl).replace(/%[0-9A-F]?$/i, ''), truncated: kept.length < clean.length, lines: kept.length };
    kept = kept.slice(1);
  }
}
module.exports = { NEW_ISSUE, MAX_URL, LOG_LINES, scrub, cleanLine, readLogTail, buildReport };
