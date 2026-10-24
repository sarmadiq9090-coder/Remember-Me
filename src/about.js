'use strict';
// The only pages the About card can open. The window sends one of these IDs, never a URL; the
// main process maps it to the exact address here before calling shell.openExternal.
const REPO = 'https://github.com/sarmadiq9090-coder/Remember-Me';
const LINKS = new Map([
  ['github', 'https://github.com/sarmadiq9090-coder'],
  ['repo', REPO],
  ['releases', `${REPO}/releases`],
  ['issues', `${REPO}/issues/new/choose`],
  ['privacy', `${REPO}#privacy`],
  ['license', `${REPO}/blob/main/LICENSE`],
]);
function linkUrl(id) {
  if (typeof id !== 'string' || !LINKS.has(id)) throw new Error('Unknown link.');
  return LINKS.get(id);
}
// Windows 11 still reports itself as 10.0; build 22000 and later is Windows 11.
function windowsVersion(release) {
  const [major, minor, build] = String(release).split('.').map(Number);
  const name = major === 10 && build >= 22000 ? '11' : major === 10 ? '10' : `${major}.${minor}`;
  return `${name} (${release})`;
}
// Text for "Copy diagnostic info": versions and display settings only. It never includes tasks,
// notes, attachments, file names or paths, so it is safe to paste into a public issue.
function diagnostics({ version, packaged, versions, windows, arch, language, theme }) {
  return [
    `Remember Me ${version}${packaged ? '' : ' (development build)'}`,
    `Electron ${versions.electron} • Chromium ${versions.chrome} • Node ${versions.node}`,
    `Windows ${windowsVersion(windows)} ${arch}`,
    `UI language: ${language}`,
    `Theme: ${theme}`,
  ].join('\n');
}
module.exports = { LINKS, linkUrl, windowsVersion, diagnostics };
