const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SELF, APPS, LINK_IDS, parseApps, appList, appLinkUrl, isAppPage, isStorePage } = require('../src/platform/more-apps');
const { ABOUT_LINK_IDS, isStoreUrl } = require('../src/platform/about');
const { checkRequest } = require('../src/main/ipc');
const { createHandlers } = require('../src/main/handlers');
const root = path.join(__dirname, '..');
const vendored = JSON.parse(fs.readFileSync(path.join(root, 'assets/apps.json'), 'utf8'));

test('the vendored apps.json is schema 1, names its source commit, and lists the other apps without Remember Me', () => {
  assert.equal(vendored.schema, 1);
  assert.ok(vendored.apps.some(app => app.id === SELF), 'The site list includes Remember Me itself');
  assert.match(fs.readFileSync(path.join(root, 'assets/apps.source.txt'), 'utf8'), /^sarmadiq9090-coder\.github\.io [0-9a-f]{40} data\/apps\.json\r?\n$/);
  assert.ok(APPS.length >= 1);
  assert.ok(APPS.every(app => app.id !== SELF), 'Self is left out');
  assert.deepEqual(APPS.map(app => app.id), vendored.apps.filter(app => app.id !== SELF).map(app => app.id), 'Every other app, in the file\'s order');
  for (const app of APPS) for (const field of ['name', 'tagline', 'description']) {
    assert.ok(app[field].ar && app[field].en, `${app.id} ${field}`);
    assert.match(app[field].ar, /[\u0600-\u06ff]|^[A-Za-z]+$/, `${app.id} ${field}.ar is Arabic or a Latin brand name`);
  }
});

test('a coming-soon app has only its page: no Store link even when its listing says live', () => {
  const soon = APPS.filter(app => app.comingSoon);
  assert.ok(soon.length >= 1, 'InstaConvert is coming soon in the vendored list');
  for (const app of soon) {
    assert.equal(app.store, null);
    assert.ok(!LINK_IDS.has(`store:${app.id}`));
    assert.throws(() => appLinkUrl(`store:${app.id}`, 'en'), /Unknown link/);
  }
  const data = { schema: 1, apps: [{ ...vendored.apps.find(app => app.status === 'coming-soon'), store: { id: '9ABCDEFGHJKL', live: true } }] };
  assert.equal(parseApps(data)[0].store, null);
  assert.equal(appList(parseApps(data))[0].store, null);
});

test('a Store page is offered only for a released app whose listing is live', () => {
  const base = vendored.apps.find(app => app.id === 'instafind');
  const live = parseApps({ schema: 1, apps: [{ ...base, store: { id: '9MTK4KMFQ657', live: true } }] });
  assert.equal(live[0].store, 'ms-windows-store://pdp/?productid=9MTK4KMFQ657');
  assert.equal(appLinkUrl('store:instafind', 'ar', live), 'ms-windows-store://pdp/?productid=9MTK4KMFQ657');
  assert.equal(parseApps({ schema: 1, apps: [{ ...base, store: { id: '9MTK4KMFQ657', live: false } }] })[0].store, null);
  assert.equal(parseApps({ schema: 1, apps: [{ ...base, store: null }] })[0].store, null);
  assert.equal(parseApps({ schema: 1, apps: [{ ...base, store: { id: 'x&y=1', live: true } }] })[0].store, null, 'A malformed Store ID gives no link');
  for (const app of APPS) assert.equal(!!app.store, vendored.apps.find(a => a.id === app.id).store?.live === true && !app.comingSoon, app.id);
});

test('only https://fastkiwi.app pages and ms-windows-store://pdp product pages can open', () => {
  for (const app of APPS) {
    for (const lang of ['ar', 'en']) assert.ok(isAppPage(app.url[lang]), app.url[lang]);
    assert.equal(appLinkUrl(`app:${app.id}`, 'ar'), app.url.ar);
    for (const lang of ['en', 'fr', 'zh-CN', undefined]) assert.equal(appLinkUrl(`app:${app.id}`, lang), app.url.en, 'Every other language opens the English page');
    if (app.store) assert.ok(isStorePage(app.store) && isStoreUrl(app.store));
  }
  for (const url of ['http://fastkiwi.app/', 'https://fastkiwi.app.evil.com/', 'https://evil.com/?https://fastkiwi.app/', 'https://user@fastkiwi.app/', 'https://fastkiwi.app:444/', 'file:///C:/x', 'data:text/html,x', ' https://fastkiwi.app/', null])
    assert.equal(isAppPage(url), false, String(url));
  for (const url of ['ms-windows-store://pdp/?productid=9NGB1F7T7JG', 'ms-windows-store://pdp/?productid=9NGB1F7T7JGN&x=1', 'ms-windows-store://pdp/?ProductId=x', 'https://apps.microsoft.com/detail/9NGB1F7T7JGN'])
    assert.equal(isStorePage(url), false, url);
  // An entry whose page is off the whitelist is left out of the list altogether.
  const base = vendored.apps.find(app => app.id === 'lemon');
  assert.deepEqual(parseApps({ schema: 1, apps: [{ ...base, url: { ar: 'https://example.com/', en: base.url.en } }] }), []);
  assert.deepEqual(parseApps({ schema: 1, apps: [{ ...base, name: { ar: '<b>x</b>', en: 'Lemon' } }] }), [], 'Texts are plain text');
  assert.throws(() => parseApps({ schema: 2, apps: [] }), /schema 1/);
  for (const link of ['app:remember-me', 'app:', 'app:../x', 'store:lemon', 'https://fastkiwi.app/', 'moreApps', null]) assert.throws(() => appLinkUrl(link, 'en'), /Unknown link/, String(link));
});

test('the About card sends app:<id> and store:<id> IDs only; main opens the page or the Store', async () => {
  for (const id of LINK_IDS) { assert.ok(ABOUT_LINK_IDS.has(id), id); assert.deepEqual(checkRequest('openLink', { link: id }), { link: id }); }
  for (const link of ['app:remember-me', 'store:instaconvert', 'app:https://fastkiwi.app/', 'store:lemon']) assert.throws(() => checkRequest('openLink', { link }), /Unknown link/, link);
  assert.throws(() => checkRequest('otherApps', {}, { fromAlert: true }), /Request not allowed/);
  assert.throws(() => checkRequest('otherApps', {}, { fromQuickAdd: true }), /Request not allowed/);
  const browsed = [], stored = [];
  let language = 'ar';
  const ctx = { electron: { shell: { openExternal: async url => { browsed.push(url); } } }, tr: t => t, language: () => language, openStoreLink: async url => { stored.push(url); } };
  const { openLink, otherApps } = createHandlers(ctx);
  const first = APPS[0];
  await openLink.run({ link: `app:${first.id}` });
  language = 'de';
  await openLink.run({ link: `app:${first.id}` });
  assert.deepEqual(browsed, [first.url.ar, first.url.en]);
  assert.deepEqual(stored, []);
  const list = otherApps.run();
  assert.deepEqual(list.map(app => app.page), APPS.map(app => `app:${app.id}`));
  assert.ok(list.every(app => !('url' in app)), 'The window gets IDs, never addresses');
  assert.ok(otherApps.readOnly);
});

test('the list is embedded: nothing fetches apps.json or icons at run time', () => {
  const code = ['src/platform/more-apps.js', 'src/main/handlers/about.js', 'ui/main/settings-cards.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(code, /\bfetch\(|net\.request|https\.get|XMLHttpRequest|fastkiwi\.app\/data|<img/);
  assert.match(fs.readFileSync(path.join(root, 'tools/package.mjs'), 'utf8'), /'\/assets'/, 'assets/ (with apps.json) is packaged');
});
