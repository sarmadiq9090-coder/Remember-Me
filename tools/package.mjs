import { packager } from '@electron/packager';
// @electron/fuses 2 is ESM-only, so it is imported rather than loaded with require().
import { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options, FuseState } from '@electron/fuses';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = require('../package.json').version;
const { FEED, UPDATER_CACHE } = require('../src/platform/updates.js');
// Only the app itself goes into app.asar: never docs, CI files, worktrees or local data.
const bundled = ['/package.json', '/LICENSE', '/src', '/ui', '/assets'];
const ignore = file => !!file && !bundled.some(entry => file === entry || file.startsWith(entry + '/'));
// Chromium's own strings (date pickers, context menus) are kept for every interface language in
// ui/lib/translate.js, so the list cannot drift from the app's; other system languages use en-US.
const locales = new Set(require('../ui/lib/translate.js').LOCALES.map(l => l.chromium + '.pak'));
async function pruneLocales({ buildPath }) {
  const folder = path.join(buildPath, 'locales');
  for (const name of await fs.readdir(folder)) if (!locales.has(name)) await fs.rm(path.join(folder, name));
}
// pnpm links packages instead of nesting them, so the runtime dependencies (electron-updater and
// what it needs) are copied into the app as one flat node_modules folder.
function findPackage(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (path.basename(dir) !== 'node_modules' && existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
    if (path.dirname(dir) === dir) throw new Error(`The runtime dependency ${name} is not installed.`);
  }
}
function runtimePackages(names, from, found = new Map()) {
  for (const name of names) {
    const dir = findPackage(name, from);
    const { version: packageVersion, dependencies = {} } = require(path.join(dir, 'package.json'));
    if (found.has(name)) {
      if (found.get(name).packageVersion !== packageVersion) throw new Error(`Two versions of ${name} are needed; a flat node_modules cannot hold both.`);
      continue;
    }
    found.set(name, { dir, packageVersion });
    runtimePackages(Object.keys(dependencies), dir, found);
  }
  return found;
}
async function copyRuntimeDependencies({ buildPath }) {
  for (const [name, { dir }] of runtimePackages(Object.keys(require('../package.json').dependencies || {}), root)) {
    await fs.cp(dir, path.join(buildPath, 'node_modules', name), { recursive: true, filter: source => !path.relative(dir, source).split(path.sep).includes('node_modules') });
  }
}
const paths = await packager({
  dir: root, name: 'Remember Me', executableName: 'Remember Me', out: path.join(root, 'release', process.env.WAQT_BUILD_FOLDER || `v${version}`),
  platform: 'win32', arch: 'x64', electronVersion: require('electron/package.json').version,
  electronZipDir: process.env.WAQT_ELECTRON_ZIP_DIR || undefined,
  icon: path.join(root, 'assets/icon.ico'), overwrite: true, asar: true, prune: false, ignore, afterExtract: [pruneLocales], afterCopy: [copyRuntimeDependencies],
  // The publisher matches package.json's author (the installer's Publisher and winget), and the
  // copyright line is LICENSE's own.
  appCopyright: (await fs.readFile(path.join(root, 'LICENSE'), 'utf8')).match(/^Copyright .+$/m)[0].trim(),
  win32metadata: { CompanyName: require('../package.json').author, FileDescription: 'Remember Me', ProductName: 'Remember Me', InternalName: 'Remember Me' },
});
// electron-updater reads its feed and cache folder from resources/app-update.yml. electron-builder
// only writes that file when it packages the app itself, so it is written here.
// CODE SIGNING: once releases are signed, add `publisherName: <certificate subject CN>` so updates
// signed by anyone else are refused.
const updateConfig = Object.entries({ ...FEED, updaterCacheDirName: UPDATER_CACHE }).map(([key, value]) => `${key}: ${value}\n`).join('');
for (const folder of paths) await fs.writeFile(path.join(folder, 'resources', 'app-update.yml'), updateConfig);
// Electron fuses: the shipped exe can't be run as a plain Node.js interpreter, take NODE_OPTIONS
// or --inspect, or load app code from outside its checked app.asar. Packager writes the asar
// integrity resource the exe checks. Playwright attaches through --inspect, so a build for the
// desktop tests (WAQT_DESKTOP_TEST_BUILD=1) keeps only that fuse on. Fuses are set before
// electron-builder (and later code signing) touch the exe.
const desktopTestBuild = process.env.WAQT_DESKTOP_TEST_BUILD === '1';
const fuses = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: desktopTestBuild,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};
for (const folder of paths) {
  const exe = path.join(folder, 'Remember Me.exe');
  await flipFuses(exe, { version: FuseVersion.V1, ...fuses });
  const wire = await getCurrentFuseWire(exe);
  for (const [fuse, on] of Object.entries(fuses)) {
    if (wire[fuse] !== (on ? FuseState.ENABLE : FuseState.DISABLE)) throw new Error(`Fuse ${FuseV1Options[fuse]} was not set in ${exe}.`);
  }
}
console.log(`Fuses set${desktopTestBuild ? ' (desktop test build: --inspect allowed)' : ''}.`);
console.log('Ready:', paths.join('\n'));
