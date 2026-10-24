const fs = require('node:fs');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const { FEED } = require('../src/updates.js');
// The license page shows the privacy notice (installer/privacy-<lang>.txt) above the MIT license,
// in the language chosen for the installer. electron-builder finds license_<lang>.txt in the build
// resources folder; NSIS needs CRLF line endings and a UTF-8 byte order mark for Arabic.
const resources = path.join(root, 'release', 'installer-resources');
fs.mkdirSync(resources, { recursive: true });
const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
for (const [language, source] of [['en_US', 'privacy-en.txt'], ['ar_SA', 'privacy-ar.txt']]) {
  const text = `${fs.readFileSync(path.join(root, 'installer', source), 'utf8')}\n${license}`.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(path.join(resources, `license_${language}.txt`), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));
}
build({
  projectDir: root,
  prepackaged: path.join(root, 'release', `v${version}`, 'Remember Me-win32-x64'),
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  // Never upload: the release workflow publishes the files itself.
  publish: 'never',
  config: {
    extends: null,
    // package.json holds a semver range; use the exact installed version, as tools/package.mjs does.
    electronVersion: require('electron/package.json').version,
    // The appId predates the Remember Me name. Keep it: a new appId would install side by side
    // instead of upgrading v1.4.0, and would break update continuity.
    appId: 'com.waqt.reminder', productName: 'Remember Me',
    executableName: 'Remember Me',
    directories: { output: path.join(root, 'release/installer'), buildResources: resources },
    // Makes electron-builder write latest.yml and the installer's .blockmap for the app's updater.
    publish: [FEED],
    compression: 'maximum',
    win: { icon: path.join(root, 'assets/icon.ico'), signAndEditExecutable: false },
    nsis: {
      oneClick: false, perMachine: false, allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true, createStartMenuShortcut: true,
      shortcutName: 'Remember Me', uninstallDisplayName: 'Remember Me',
      deleteAppDataOnUninstall: false, runAfterFinish: false,
      artifactName: 'Remember-Me-Setup-${version}-x64.exe',
      installerIcon: path.join(root, 'assets/icon.ico'),
      uninstallerIcon: path.join(root, 'assets/icon.ico'),
      installerLanguages: ['ar_SA', 'en_US'], displayLanguageSelector: true,
      // Says on the uninstaller's first page that the data folder is kept.
      include: path.join(root, 'installer', 'installer.nsh'),
    },
  },
}).then(files => files.forEach(file => console.log(file))).catch(error => { console.error(error.message); process.exitCode = 1; });
