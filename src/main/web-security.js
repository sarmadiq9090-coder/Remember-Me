'use strict';
// Guards for every web page the app creates. index.js applies secureContents() to each new
// webContents (app 'web-contents-created'), so every window gets it, including ones added later.

// No new windows, no navigation away from the bundled page (in any frame) and no webviews. The pages
// never navigate; links to the web go through main (the About links, the problem report).
function secureContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) contents.on(event, e => e.preventDefault());
}

// webPreferences shared by every window. Spellcheck is off: Chromium's spellchecker can download
// Hunspell dictionaries from Google's servers, and the app makes no network requests the user didn't ask for.
const PAGE_PREFERENCES = Object.freeze({ contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false });

// Web pages open in the default browser only as https:// addresses; anything else (file:, a custom
// protocol, a mistyped address) is refused before Windows sees it.
function isHttpsUrl(url) {
  if (typeof url !== 'string') return false;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}
// Electron's shell with openExternal limited to https. The IPC handlers and the problem report use this one.
function httpsShell(shell) {
  return {
    openExternal: async url => { if (!isHttpsUrl(url)) throw new Error('only https addresses open in the browser'); return shell.openExternal(url); },
    openPath: target => shell.openPath(target),
    showItemInFolder: target => shell.showItemInFolder(target),
  };
}
module.exports = { PAGE_PREFERENCES, secureContents, isHttpsUrl, httpsShell };
