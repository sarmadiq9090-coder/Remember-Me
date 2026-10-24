const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Guards moves between folders: every relative require/import, every page script and stylesheet,
// and every fixed path the main process builds from __dirname must point at a file that exists.
const root = path.join(__dirname, '..');
function files(folder, pattern) {
  return fs.readdirSync(path.join(root, folder), { recursive: true }).map(String)
    .filter(name => pattern.test(name) && !name.split(path.sep).includes('node_modules')).map(name => path.join(root, folder, name));
}
const code = ['src', 'tools', 'tests', 'ui'].flatMap(folder => files(folder, /\.(c|m)?js$/));

test('every relative require and import resolves', () => {
  const missing = [];
  for (const file of code) {
    const text = fs.readFileSync(file, 'utf8');
    const specs = [...text.matchAll(/require\(\s*'(\.{1,2}\/[^']+)'\s*\)/g), ...text.matchAll(/(?:^|\s)(?:import|export)\s[^'"]*?from\s+'(\.{1,2}\/[^']+)'/gm), ...text.matchAll(/import\(\s*'(\.{1,2}\/[^']+)'\s*\)/g)].map(m => m[1]);
    for (const spec of specs) {
      try { require.resolve(path.resolve(path.dirname(file), spec)); }
      catch { missing.push(`${path.relative(root, file)} -> ${spec}`); }
    }
  }
  assert.deepEqual(missing, []);
});

test('every script and stylesheet the pages load exists', () => {
  const missing = [];
  for (const page of files('ui', /\.html$/)) {
    const html = fs.readFileSync(page, 'utf8');
    for (const [, src] of html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)) {
      if (/^[a-z]+:/i.test(src)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(page), src))) missing.push(`${path.relative(root, page)} -> ${src}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('fixed paths the main process builds from __dirname exist', () => {
  const missing = [];
  for (const file of files('src', /\.js$/)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, args] of text.matchAll(/path\.join\(__dirname((?:\s*,\s*'[^']*')+)\s*\)/g)) {
      const parts = [...args.matchAll(/'([^']*)'/g)].map(m => m[1]);
      const target = path.join(path.dirname(file), ...parts);
      if (!fs.existsSync(target)) missing.push(`${path.relative(root, file)} -> ${parts.join('/')}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(fs.existsSync(path.join(root, require(path.join(root, 'package.json')).main)), 'package.json main exists');
});
