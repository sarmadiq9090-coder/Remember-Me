'use strict';
// The only pages the About card can open. The window sends one of these IDs, never a URL; the
// main process maps it to the exact address here before calling shell.openExternal.
const REPO = 'https://github.com/sarmadiq9090-coder/Remember-Me';
const SUPPORT_EMAIL = 'mailto:support@fastkiwi.app';
const LINKS = new Map([
  ['github', 'https://github.com/sarmadiq9090-coder'],
  ['repo', REPO],
  ['releases', `${REPO}/releases`],
  ['issues', `${REPO}/issues/new/choose`],
  // Support on fastkiwi.app, which needs no GitHub account: the page in English or in Arabic (the card sends
  // supportAr in the Arabic interface), and the support e-mail address, the only mailto: the app opens.
  ['support', 'https://fastkiwi.app/support/'],
  ['supportAr', 'https://fastkiwi.app/ar/support/'],
  ['email', SUPPORT_EMAIL],
  ['privacy', `${REPO}#privacy`],
  ['license', `${REPO}/blob/main/LICENSE`],
]);
// Microsoft Store pages. They are not https, so the main process opens them through openStoreLink, which
// accepts only ms-windows-store: addresses. 9NGB1F7T7JGN is the Store ID of Remember Me Reminders.
const STORE_PRODUCT_ID = '9NGB1F7T7JGN';
const STORE_LINKS = new Map([
  ['moreApps', 'ms-windows-store://publisher/?name=FastKiwi'],
  ['rate', `ms-windows-store://review/?ProductId=${STORE_PRODUCT_ID}`],
]);
function isStoreUrl(url) { return typeof url === 'string' && /^ms-windows-store:\/\/(publisher|review)\/\?/.test(url); }
function linkUrl(id) {
  if (typeof id !== 'string' || !LINKS.has(id)) throw new Error('Unknown link.');
  return LINKS.get(id);
}
// The IDs the About card may send: its web pages and the Store's "More from FastKiwi" page.
const ABOUT_LINK_IDS = new Set([...LINKS.keys(), 'moreApps']);
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
module.exports = { LINKS, STORE_LINKS, STORE_PRODUCT_ID, ABOUT_LINK_IDS, SUPPORT_EMAIL, linkUrl, isStoreUrl, windowsVersion, diagnostics };
