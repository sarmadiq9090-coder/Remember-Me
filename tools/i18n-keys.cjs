// Lists every message key the app uses, so tests can check that ui/locales/en.json has them all
// and report what each translation is missing. Run `node tools/i18n-keys.cjs` to print the
// keys missing from each locale.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const literal = String.raw`(['"])((?:\\.|(?!\1).)*)\1`;
const unescape = text => text.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
const SCRIPTS = ['ui/app.js', 'ui/alert.js', 'ui/shared.js', 'ui/i18n.js', 'src/main/index.js'];
// The data modules throw English messages that the main process translates. Messages for users
// start with a capital letter; lowercase ones ('invalid kind') are for developers only.
const MODULES = ['src/core/tasks.js', 'src/data/attachments.js', 'src/data/backups.js', 'src/data/drive-backup.js', 'src/main/ipc.js'];
const PAGES = ['ui/index.html', 'ui/alert.html'];
function collectKeys() {
  const keys = new Set();
  for (const file of SCRIPTS) for (const m of read(file).matchAll(new RegExp(String.raw`\b(?:tr|msg)\(\s*` + literal, 'g'))) keys.add(unescape(m[2]));
  for (const file of MODULES) {
    const source = read(file), userFacing = key => /^[A-Z]/.test(key) && keys.add(key);
    for (const m of source.matchAll(new RegExp(String.raw`new (?:User)?Error\(\s*` + literal, 'g'))) userFacing(unescape(m[2]));
    for (const m of source.matchAll(new RegExp(String.raw`config\.error = (?:error\.message \|\| )?` + literal, 'g'))) userFacing(unescape(m[2]));
  }
  for (const file of PAGES) {
    const html = read(file).replace(/<(script|style|kbd|code)\b[\s\S]*?<\/\1>/g, '');
    for (const m of html.matchAll(/\bdata-i18n="([^"]+)"/g)) keys.add(m[1]);
    for (const m of html.matchAll(/\b(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) keys.add(m[1]);
    for (const m of html.replace(/<[^>]*data-i18n="[^"]*"[^>]*>[^<]*/g, '').matchAll(/>([^<>]+)</g)) if (/[A-Za-z]/.test(m[1])) keys.add(m[1].trim());
  }
  return [...keys].filter(key => key.trim()).sort();
}
function loadLocale(code) { return JSON.parse(read(`ui/locales/${code}.json`)); }
module.exports = { collectKeys, loadLocale };
if (require.main === module) {
  const { LOCALES } = require('../ui/translate');
  const keys = collectKeys(), en = loadLocale('en');
  console.log(`${keys.length} keys; missing from en.json: ${keys.filter(k => !(k in en)).join(' | ') || 'none'}`);
  for (const { code } of LOCALES.slice(1)) { let messages = {}; try { messages = loadLocale(code); } catch { /* not created yet */ } const missing = Object.keys(en).filter(k => !(k in messages)); console.log(`${code}: ${missing.length} missing`); }
}
