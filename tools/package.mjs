import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = require('../package.json').version;
// Only the app itself goes into app.asar: never docs, CI files, worktrees or local data.
const bundled = ['/package.json', '/LICENSE', '/src', '/ui', '/assets'];
const ignore = file => !!file && !bundled.some(entry => file === entry || file.startsWith(entry + '/'));
// Chromium's own strings (date pickers, form messages) are kept for the app's two languages;
// other system languages fall back to en-US.
const locales = new Set(['ar.pak', 'en-US.pak']);
async function pruneLocales({ buildPath }) {
  const folder = path.join(buildPath, 'locales');
  for (const name of await fs.readdir(folder)) if (!locales.has(name)) await fs.rm(path.join(folder, name));
}
const paths = await packager({
  dir: root, name: 'Remember Me', executableName: 'Remember Me', out: path.join(root, 'release', process.env.WAQT_BUILD_FOLDER || `v${version}`),
  platform: 'win32', arch: 'x64', electronVersion: require('electron/package.json').version,
  electronZipDir: process.env.WAQT_ELECTRON_ZIP_DIR || undefined,
  icon: path.join(root, 'assets/icon.ico'), overwrite: true, asar: true, prune: false, ignore, afterExtract: [pruneLocales],
  win32metadata: { CompanyName: 'sarmadiq9090-coder', FileDescription: 'Remember Me', ProductName: 'Remember Me', InternalName: 'Remember Me' },
});
console.log('Ready:', paths.join('\n'));
