'use strict';
// Reads the palette tokens from ui/theme.css, so window backgrounds and tests use the colors the pages use.
const fs = require('node:fs');
const path = require('node:path');
const FILE = path.join(__dirname, '../ui/theme.css');

// { palette: { light: { token: value }, dark: { ... } } } for every rule that names [data-palette=...].
// attribute 'data-paper' reads the note papers instead; a bare [attribute] rule is listed under '*'.
function parseTheme(css, attribute = 'data-palette') {
  const selector = new RegExp(`\\[${attribute}(?:=([\\w-]+))?\\]`, 'g');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const palettes = {};
  const visit = (text, dark) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      if (head.startsWith('@media')) {
        let depth = 1, j = open + 1;
        while (depth && j < text.length) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
        visit(text.slice(open + 1, j - 1), dark || /prefers-color-scheme:\s*dark/.test(head));
        i = j;
        continue;
      }
      const close = text.indexOf('}', open);
      for (const [, id = '*'] of head.matchAll(selector)) {
        const tokens = ((palettes[id] ??= { light: {}, dark: {} })[dark ? 'dark' : 'light']);
        for (const declaration of text.slice(open + 1, close).split(';')) {
          const colon = declaration.indexOf(':');
          const name = declaration.slice(0, colon).trim();
          if (colon > 0 && name.startsWith('--')) tokens[name.slice(2)] = declaration.slice(colon + 1).trim();
        }
      }
      i = close + 1;
    }
  };
  visit(css, false);
  return palettes;
}
let cache;
function palettes() { return (cache ??= parseTheme(fs.readFileSync(FILE, 'utf8'))); }
// Background colors for BrowserWindow, so a window never flashes another theme before its page paints.
function windowColors(palette, dark) {
  const all = palettes();
  const tokens = (all[palette] || all.lavender)[dark ? 'dark' : 'light'];
  return { main: tokens.bg, alert: tokens.surface };
}
module.exports = { FILE, parseTheme, palettes, windowColors };
