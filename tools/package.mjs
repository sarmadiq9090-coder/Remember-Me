import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = require('../package.json').version;
const paths = await packager({
  dir: root, name: 'Waqt', executableName: 'Waqt', out: path.join(root, 'release', process.env.WAQT_BUILD_FOLDER || `v${version}`),
  platform: 'win32', arch: 'x64', electronVersion: require('electron/package.json').version,
  electronZipDir: process.env.WAQT_ELECTRON_ZIP_DIR || undefined,
  icon: path.join(root, 'assets/icon.ico'), overwrite: true, asar: true, prune: false,
  ignore: [/^\/(node_modules|release|tests|tools|screenshots|\.tools|\.git)(\/|$)/, /\.lnk$/, /pnpm-lock\.yaml$/],
  win32metadata: { CompanyName: 'sarmadiq9090-coder', FileDescription: 'ذكرني | Remember Me — Tasks and reminders', ProductName: 'ذكرني | Remember Me', InternalName: 'Waqt' },
});
console.log('Ready:', paths.join('\n'));
