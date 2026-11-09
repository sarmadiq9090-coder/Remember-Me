'use strict';
// "More from FastKiwi" in About: the other FastKiwi apps, from the copy of the website's data/apps.json
// in assets/ (refreshed by tools/sync-apps.cjs; assets/apps.source.txt names the commit). The list is
// embedded: nothing is fetched while the app runs, neither the list nor icons. The window sends a link ID
// (`app:<id>` for the app's page, `store:<id>` for its Microsoft Store page), never a URL; the addresses
// below are checked once when the file is read, and again before anything opens.
const SELF = 'remember-me';
const STORE_ID = /^[0-9A-Z]{12}$/;
const APP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Only pages on https://fastkiwi.app open in the browser.
function isAppPage(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === 'fastkiwi.app' && !parsed.username && !parsed.password && url.startsWith('https://fastkiwi.app/');
  } catch { return false; }
}
function storeUrl(id) { return `ms-windows-store://pdp/?productid=${id}`; }
function isStorePage(url) { return typeof url === 'string' && /^ms-windows-store:\/\/pdp\/\?productid=[0-9A-Z]{12}$/.test(url); }
const text = value => (typeof value === 'string' && value.trim() && !/[<>\n\r]/.test(value) ? value : null);
const pair = value => (value && text(value.ar) && text(value.en) ? { ar: value.ar, en: value.en } : null);
// The other apps, in the file's order. An entry with a missing text or an address outside the
// whitelist is left out. A Store page is kept only for a released app whose listing is live.
function parseApps(data, self = SELF) {
  if (!data || data.schema !== 1 || !Array.isArray(data.apps)) throw new Error('apps.json: expected schema 1 with an apps list');
  const apps = [];
  for (const app of data.apps) {
    if (!app || typeof app.id !== 'string' || !APP_ID.test(app.id) || app.id === self) continue;
    if (!['released', 'coming-soon'].includes(app.status)) continue;
    const name = pair(app.name), tagline = pair(app.tagline), description = pair(app.description);
    if (!name || !tagline || !description || !app.url || !isAppPage(app.url.ar) || !isAppPage(app.url.en)) continue;
    const live = app.status === 'released' && app.store && app.store.live === true && typeof app.store.id === 'string' && STORE_ID.test(app.store.id);
    apps.push({ id: app.id, comingSoon: app.status === 'coming-soon', name, tagline, description, url: { ar: app.url.ar, en: app.url.en }, store: live ? storeUrl(app.store.id) : null });
  }
  return apps;
}
const APPS = parseApps(require('../../assets/apps.json'));
const LINK_IDS = new Set(APPS.flatMap(app => [`app:${app.id}`, ...(app.store ? [`store:${app.id}`] : [])]));
// What the About card shows: texts in Arabic and English (the card picks one), and the link IDs.
function appList(apps = APPS) {
  return apps.map(({ id, comingSoon, name, tagline, description, store }) => ({ id, comingSoon, name, tagline, description, page: `app:${id}`, store: store ? `store:${id}` : null }));
}
// The exact address for a link ID: the Arabic page in the Arabic interface, else the English one.
function appLinkUrl(link, language, apps = APPS) {
  const match = typeof link === 'string' && /^(app|store):([a-z0-9-]+)$/.exec(link);
  const app = match && apps.find(a => a.id === match[2]);
  if (!app) throw new Error('Unknown link.');
  const url = match[1] === 'store' ? app.store : app.url[language === 'ar' ? 'ar' : 'en'];
  if (match[1] === 'store' ? !isStorePage(url) : !isAppPage(url)) throw new Error('Unknown link.');
  return url;
}
module.exports = { SELF, APPS, LINK_IDS, parseApps, appList, appLinkUrl, isAppPage, isStorePage, storeUrl };
