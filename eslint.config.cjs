'use strict';
const fs = require('node:fs');
const path = require('node:path');
const js = require('@eslint/js');
const globals = require('globals');

// eslint:recommended plus a few safety rules. No formatting rules: style is left as it is.
// Globs are folder-agnostic so files can move between folders without editing this config.
const safety = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-proto': 'error',
  'no-caller': 'error',
  'no-restricted-properties': ['error',
    { object: 'document', property: 'write', message: 'Build DOM nodes or escaped markup instead.' },
    { object: 'document', property: 'writeln', message: 'Build DOM nodes or escaped markup instead.' }],
  'no-restricted-syntax': ['error',
    { selector: "CallExpression[callee.name='require'][arguments.0.value=/^(node:)?child_process$/]", message: 'The app never starts other programs.' },
    { selector: 'Property[key.name=/^(nodeIntegration|nodeIntegrationInWorker|nodeIntegrationInSubFrames|webviewTag|allowRunningInsecureContent)$/][value.value=true]', message: 'Windows stay isolated from Node.js.' },
    { selector: 'Property[key.name=/^(contextIsolation|sandbox|webSecurity)$/][value.value=false]', message: 'Windows stay sandboxed and context-isolated.' }],
};

// Classic <script> files in ui/ share one global scope. Every name declared at the top level of any
// of them is a global for the others, collected here so moving or splitting files needs no edits.
function splitTopLevel(list) {
  const parts = []; let depth = 0, quote = '', start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  return [...parts, list.slice(start)];
}
function scriptGlobals(folder) {
  const names = {};
  const files = fs.existsSync(folder) ? fs.readdirSync(folder, { recursive: true }).filter(name => String(name).endsWith('.js')) : [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(folder, String(file)), 'utf8');
    for (const [, name] of text.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names[name] = 'readonly';
    // Wrapped scripts export through Object.assign(root | window | globalThis, { ... }) or window.name = ...
    for (const [, list] of text.matchAll(/Object\.assign\((?:root|window|globalThis|self),\s*\{([^}]*)\}\)/g)) for (const name of list.match(/[A-Za-z_$][\w$]*/g) || []) names[name] = 'readonly';
    for (const [, name] of text.matchAll(/^\s*(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=/gm)) names[name] = 'readonly';
    for (const [, kind, list] of text.matchAll(/^(let|const|var)\s+([^;\n]*)/gm)) {
      for (const part of splitTopLevel(list)) {
        const name = part.match(/^\s*([A-Za-z_$][\w$]*)/)?.[1];
        if (name) names[name] = kind === 'const' ? 'readonly' : 'writable';
      }
    }
  }
  return names;
}

module.exports = [
  { ignores: ['**/node_modules/**', 'release/**', 'screenshots/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: safety,
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: safety,
  },
  {
    // Playwright runs these callbacks inside the app's pages.
    files: ['**/*-desktop.cjs', '**/desktop-*.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...scriptGlobals(path.join(__dirname, 'ui')) } },
    // Top-level names are used by the other ui scripts, so only unused locals are reported.
    rules: { 'no-unused-vars': ['error', { vars: 'local' }], 'no-redeclare': ['error', { builtinGlobals: false }] },
  },
  {
    // Pages split into ES modules later get browser globals and normal module scoping.
    files: ['ui/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
  },
];
