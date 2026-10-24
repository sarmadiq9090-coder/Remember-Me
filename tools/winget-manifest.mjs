// Writes the winget manifests (version, installer, defaultLocale en-US) for a release.
//   node tools/winget-manifest.mjs --sums release/installer/SHA256SUMS.txt --out release/winget
//   node tools/winget-manifest.mjs --version 1.5.0 --out docs/distribution/winget/1.5.0
// Without --sums the installer hash is a placeholder, so the files can't be submitted by mistake.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export const IDENTIFIER = 'Sarmad.RememberMe';
export const PLACEHOLDER = 'REPLACE_WITH_SHA256_FROM_SHA256SUMS';
// The installer's Apps & features key: electron-builder's UUID v5 of the appId com.waqt.reminder.
export const PRODUCT_CODE = 'a92ab8ea-9a18-5b57-8667-052d208c8425';
const REPO = 'https://github.com/sarmadiq9090-coder/Remember-Me';
const SCHEMA = '1.12.0';
export const installerName = version => `Remember-Me-Setup-${version}-x64.exe`;

// The installer's SHA-256 from a SHA256SUMS.txt written by the release workflow.
export function sha256From(sums, version) {
  const name = installerName(version);
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *]?(.+)$/.exec(line.trim());
    if (match && match[2] === name) return match[1].toUpperCase();
  }
  throw new Error(`SHA256SUMS.txt has no line for ${name}.`);
}

export function manifests({ version, sha256 = PLACEHOLDER, releaseDate }) {
  const header = type => `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${SCHEMA}.schema.json\n\nPackageIdentifier: ${IDENTIFIER}\nPackageVersion: ${version}\n`;
  const footer = type => `ManifestType: ${type}\nManifestVersion: ${SCHEMA}\n`;
  return {
    [`${IDENTIFIER}.yaml`]: `${header('version')}DefaultLocale: en-US\n${footer('version')}`,
    [`${IDENTIFIER}.installer.yaml`]: `${header('installer')}InstallerLocale: en-US
InstallerType: nullsoft
Scope: user
InstallModes:
- interactive
- silent
- silentWithProgress
UpgradeBehavior: install
ProductCode: ${PRODUCT_CODE}
${releaseDate ? `ReleaseDate: ${releaseDate}\n` : ''}AppsAndFeaturesEntries:
- DisplayName: Remember Me
  Publisher: ${pkg.author}
  ProductCode: ${PRODUCT_CODE}
InstallationMetadata:
  DefaultInstallLocation: '%LocalAppData%\\Programs\\Remember Me'
Installers:
- Architecture: x64
  InstallerUrl: ${REPO}/releases/download/v${version}/${installerName(version)}
  InstallerSha256: ${sha256}
${footer('installer')}`,
    [`${IDENTIFIER}.locale.en-US.yaml`]: `${header('defaultLocale')}PackageLocale: en-US
Publisher: ${pkg.author}
PublisherUrl: https://github.com/sarmadiq9090-coder
PublisherSupportUrl: ${REPO}/issues
Author: ${pkg.author}
PackageName: Remember Me
PackageUrl: ${REPO}
License: MIT
LicenseUrl: ${REPO}/blob/main/LICENSE
ShortDescription: Tasks, notes and reminders for Windows, with alerts that stay on screen until you deal with them.
Description: Remember Me is an offline-first task, note and reminder app in 12 interface languages, including Arabic with a right-to-left layout. Each reminder stays in a window above the taskbar until you mark it done or snooze it, and your data stays on your PC.
Moniker: remember-me
Tags:
- arabic
- notes
- productivity
- reminder
- tasks
- todo
ReleaseNotesUrl: ${REPO}/releases/tag/v${version}
${footer('defaultLocale')}`,
  };
}

function argument(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const version = argument('--version') || pkg.version;
  const sums = argument('--sums');
  const out = argument('--out') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'release', 'winget');
  const sha256 = sums ? sha256From(fs.readFileSync(sums, 'utf8'), version) : PLACEHOLDER;
  const releaseDate = argument('--date') || (sums ? new Date().toISOString().slice(0, 10) : undefined);
  fs.mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(manifests({ version, sha256, releaseDate }))) fs.writeFileSync(path.join(out, name), text);
  console.log(`Wrote the ${IDENTIFIER} ${version} manifests to ${out}${sums ? '' : ' (placeholder hash)'}`);
}
