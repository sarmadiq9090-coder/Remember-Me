// Writes the Scoop manifest and the Chocolatey package sources for a release.
//   node tools/package-managers.mjs --sums release/installer/SHA256SUMS.txt --out release/package-managers
//   node tools/package-managers.mjs --sums SHA256SUMS.txt --version 1.5.0 --out docs/distribution
// The hash always comes from a release's SHA256SUMS.txt (see tools/winget-manifest.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256From, installerName } from './winget-manifest.mjs';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export const ID = 'remember-me';
const REPO = 'https://github.com/sarmadiq9090-coder/Remember-Me';
const SUMMARY = 'Tasks, notes and reminders for Windows, with alerts that stay on screen until you deal with them.';
const download = version => `${REPO}/releases/download/v${version}/${installerName(version)}`;

// ScoopInstaller/Extras style: the NSIS installer is unpacked with 7-Zip instead of run, as for
// other electron-builder apps. Removing the uninstaller also turns off the app's own updater in
// this copy (src/platform/updates.js), so Scoop alone updates it.
export function scoopManifest({ version, sha256 }) {
  return {
    version,
    description: SUMMARY,
    homepage: REPO,
    license: 'MIT',
    notes: 'Your tasks, notes and settings are kept in %APPDATA%\\Remember Me, so they survive updates and uninstalling. Scoop updates this copy; the app\'s own updater is off.',
    architecture: {
      '64bit': {
        url: `${download(version)}#/dl.7z`,
        hash: sha256.toLowerCase(),
        pre_install: 'Expand-7zipArchive "$dir\\`$PLUGINSDIR\\app-64.7z" "$dir"',
      },
    },
    post_install: 'Remove-Item "$dir\\`$*", "$dir\\Uninstall*.exe" -Recurse -Force',
    shortcuts: [['Remember Me.exe', 'Remember Me']],
    checkver: { github: REPO },
    autoupdate: {
      architecture: { '64bit': { url: `${REPO}/releases/download/v$version/Remember-Me-Setup-$version-x64.exe#/dl.7z` } },
      hash: { url: '$baseurl/SHA256SUMS.txt', regex: '$sha256\\s+$basename' },
    },
  };
}

const xml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// The community repository's package: it downloads the release installer (nothing is embedded,
// so no VERIFICATION.txt) and runs it silently for the current user.
export function chocolateyPackage({ version, sha256 }) {
  const description = `${SUMMARY}

Remember Me is an open-source (MIT) task, note and reminder app for 64-bit Windows, in 12 interface languages, including a full right-to-left Arabic interface. It runs without an account and keeps all data on your PC.

## Features
- Sticky reminders above the taskbar that stay until you choose **Done** or snooze them
- Recurring tasks, notes, file attachments and search
- Verified backups, optionally copied to a synced Google Drive folder
- Optional automatic updates from GitHub Releases, only after you allow them

## Notes
- The installer installs per user, in \`%LOCALAPPDATA%\\Programs\\Remember Me\`, for the account whose administrator rights Chocolatey runs with.
- Your data is kept in \`%APPDATA%\\Remember Me\` and is not removed on uninstall.
- If you allow it, the app updates itself from GitHub Releases; \`choco upgrade remember-me\` works as well.`;
  const nuspec = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">
  <metadata>
    <id>${ID}</id>
    <version>${version}</version>
    <packageSourceUrl>${REPO}/tree/main/docs/distribution/chocolatey</packageSourceUrl>
    <owners>${xml(pkg.author)}</owners>
    <title>Remember Me</title>
    <authors>${xml(pkg.author)}</authors>
    <projectUrl>${REPO}</projectUrl>
    <iconUrl>https://raw.githubusercontent.com/sarmadiq9090-coder/Remember-Me/v${version}/assets/icon.png</iconUrl>
    <copyright>Copyright (c) 2026 ${xml(pkg.author)}</copyright>
    <licenseUrl>${REPO}/blob/main/LICENSE</licenseUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <projectSourceUrl>${REPO}</projectSourceUrl>
    <docsUrl>${REPO}#readme</docsUrl>
    <bugTrackerUrl>${REPO}/issues</bugTrackerUrl>
    <tags>remember-me reminder reminders todo tasks notes productivity arabic foss</tags>
    <summary>${xml(SUMMARY)}</summary>
    <description>${xml(description)}</description>
    <releaseNotes>${REPO}/releases/tag/v${version}</releaseNotes>
  </metadata>
  <files>
    <file src="tools\\**" target="tools" />
  </files>
</package>
`;
  const install = `$ErrorActionPreference = 'Stop'

# Downloads the release installer and runs it silently. It installs for the current user.
$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = '${download(version)}'
  checksum64     = '${sha256.toLowerCase()}'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
  softwareName   = 'Remember Me'
}
Install-ChocolateyPackage @packageArgs
`;
  const uninstall = `$ErrorActionPreference = 'Stop'

# Runs the app's own uninstaller silently. Data in %APPDATA%\\Remember Me is kept.
[array]$keys = Get-UninstallRegistryKey -SoftwareName 'Remember Me'
if ($keys.Count -eq 1) {
  $packageArgs = @{
    packageName    = $env:ChocolateyPackageName
    fileType       = 'exe'
    file           = $keys[0].UninstallString -replace '^"([^"]+)".*$', '$1'
    silentArgs     = '/currentuser /S'
    validExitCodes = @(0)
  }
  Uninstall-ChocolateyPackage @packageArgs
} elseif ($keys.Count -eq 0) {
  Write-Warning "$env:ChocolateyPackageName has already been uninstalled by other means."
} else {
  Write-Warning "$($keys.Count) matches found; to avoid removing the wrong program, nothing was uninstalled."
  $keys | ForEach-Object { Write-Warning "- $($_.DisplayName)" }
}
`;
  return { [`${ID}.nuspec`]: nuspec, 'tools/chocolateyinstall.ps1': install, 'tools/chocolateyuninstall.ps1': uninstall };
}

// Every file, by path under the output folder.
export function packageFiles({ version, sha256 }) {
  const files = { [`scoop/${ID}.json`]: JSON.stringify(scoopManifest({ version, sha256 }), null, 4) + '\n' };
  for (const [name, text] of Object.entries(chocolateyPackage({ version, sha256 }))) files[`chocolatey/${name}`] = text;
  return files;
}

function argument(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const version = argument('--version') || pkg.version;
  const sums = argument('--sums');
  if (!sums) throw new Error('Pass --sums with the release\'s SHA256SUMS.txt.');
  const out = argument('--out') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'release', 'package-managers');
  const sha256 = sha256From(fs.readFileSync(sums, 'utf8'), version);
  for (const [name, text] of Object.entries(packageFiles({ version, sha256 }))) {
    fs.mkdirSync(path.dirname(path.join(out, name)), { recursive: true });
    fs.writeFileSync(path.join(out, name), text);
  }
  console.log(`Wrote the Scoop manifest and Chocolatey package for ${version} to ${out}`);
}
