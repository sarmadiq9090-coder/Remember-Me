const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
build({
  projectDir: root,
  prepackaged: path.join(root, 'release', `v${version}`, 'Waqt-win32-x64'),
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  publish: 'never',
  config: {
    extends: null,
    appId: 'com.waqt.reminder', productName: 'ذكرني - Remember Me',
    executableName: 'Waqt',
    directories: { output: path.join(root, 'release/installer') },
    compression: 'normal',
    win: { icon: path.join(root, 'assets/icon.ico'), signAndEditExecutable: false },
    nsis: {
      oneClick: false, perMachine: false, allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true, createStartMenuShortcut: true,
      shortcutName: 'ذكرني', uninstallDisplayName: 'ذكرني',
      deleteAppDataOnUninstall: false, runAfterFinish: false,
      artifactName: 'Remember-Me-Setup-${version}-x64.exe',
      installerIcon: path.join(root, 'assets/icon.ico'),
      uninstallerIcon: path.join(root, 'assets/icon.ico'),
      installerLanguages: ['ar_SA', 'en_US'], displayLanguageSelector: true,
    },
  },
}).then(files => files.forEach(file => console.log(file))).catch(error => { console.error(error.message); process.exitCode = 1; });
