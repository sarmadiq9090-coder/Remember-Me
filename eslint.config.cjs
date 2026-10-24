'use strict';
const js = require('@eslint/js');
const globals = require('globals');

// eslint:recommended plus a few safety rules. No formatting rules: style is left as it is.
const safety = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-proto': 'error',
  'no-caller': 'error',
};
// ui/ scripts are classic <script> files that share one global scope, loaded in this order by
// index.html and alert.html; these are the names one file defines and another uses.
const uiShared = {
  uiLanguage: 'writable', english: 'readonly', originalText: 'readonly', originalAttrs: 'readonly', tr: 'readonly', setLanguage: 'readonly',
  icons: 'readonly', icon: 'readonly', hydrateIcons: 'readonly', esc: 'readonly', locale: 'readonly', num: 'readonly',
  localDateValue: 'readonly', isToday: 'readonly', timeLabel: 'readonly', dateLabel: 'readonly', api: 'readonly', fileSize: 'readonly',
  fileBadge: 'readonly', isImageFile: 'readonly', photoMarkup: 'readonly', previewCache: 'readonly', hydratePreviews: 'readonly',
  fileMarkup: 'readonly', normalizeSearch: 'readonly', matchesSearch: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/**', 'release/**', 'ui/dark.css'] },
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
    files: ['tests/*-desktop.cjs', 'tests/desktop-smoke.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...uiShared } },
    // Top-level functions are used by the other ui scripts, so only unused locals are reported.
    rules: { ...safety, 'no-unused-vars': ['error', { vars: 'local' }], 'no-redeclare': ['error', { builtinGlobals: false }] },
  },
];
