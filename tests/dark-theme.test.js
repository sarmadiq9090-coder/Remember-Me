const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { generate, darken, read, target } = require('../tools/dark-theme.cjs');

test('ui/dark.css is up to date with the light stylesheets', () => {
  assert.equal(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), generate(read()), 'Run: node tools/dark-theme.cjs');
});

test('dark colors invert surfaces and text but keep accents and focus rings', () => {
  const lightness = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2; };
  assert.ok(lightness(darken('#ffffff', 'background')) < 0.15);
  assert.ok(lightness(darken('#f0ebfa', 'background')) < 0.2, 'Tinted light surfaces become dark');
  assert.ok(lightness(darken('#252839', 'text')) > 0.8);
  assert.equal(darken('#7960ca', 'background'), '#7960ca', 'Purple buttons stay purple');
  assert.equal(darken('#ac93e4', 'border'), '#ac93e4', 'Accent borders stay visible');
  const focus = generate(['.a{outline:3px solid #bba6f4;color:#252839}']);
  assert.ok(!focus.includes('outline') && /color:#[0-9a-f]{6}/.test(focus), 'Focus rings keep their light-theme color');
  assert.match(generate(['@media(max-width:900px){.a{background:#fff}}']), /^@media\(max-width:900px\)\{@media \(prefers-color-scheme:dark\)\{\.a\{background:#[0-9a-f]{6}\}\}\}$/m);
});
