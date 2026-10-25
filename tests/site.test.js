// The website in site/: current version, working local links, nothing loaded from other hosts,
// matching language alternates, valid structured data and the page-weight budget.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = path.join(__dirname, '..', 'site');
const { version } = require('../package.json');
const BASE = 'https://sarmadiq9090-coder.github.io/Remember-Me/';
const PAGES = { 'index.html': { lang: 'en', url: BASE }, 'ar/index.html': { lang: 'ar', url: BASE + 'ar/' } };
const read = file => fs.readFileSync(path.join(site, file), 'utf8');
const attrs = (html, name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map(m => m[1]);
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(m => m[0]);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
// A local URL from a page, as a file in site/ ("/Remember-Me/..." is the site root on GitHub Pages).
function localFile(page, url) {
  const clean = url.split(/[?#]/)[0];
  const resolved = clean.startsWith('/Remember-Me/') ? clean.slice('/Remember-Me/'.length) : path.posix.join(path.posix.dirname(page), clean);
  return clean.endsWith('/') ? path.posix.join(resolved, 'index.html') : resolved;
}

test('the pages show the version and installer name in package.json', () => {
  for (const page of Object.keys(PAGES)) {
    const html = read(page);
    assert.match(html, new RegExp(`"softwareVersion": "${version.replace(/\./g, '\\.')}"`), page);
    assert.ok(html.includes(`Remember-Me-Setup-${version}-x64.exe`), page);
    for (const other of html.matchAll(/(?:Version|الإصدار) (\d+\.\d+\.\d+)|Setup-(\d+\.\d+\.\d+)/g)) assert.equal(other[1] || other[2], version, `${page}: ${other[0]}`);
  }
});

test('every local link and image exists, and every in-page anchor has a target', () => {
  for (const page of [...Object.keys(PAGES), '404.html']) {
    const html = read(page);
    const ids = new Set(attrs(html, 'id'));
    for (const url of [...attrs(html, 'href'), ...attrs(html, 'src'), ...attrs(html, 'srcset')]) {
      if (/^(https?:|mailto:)/.test(url)) continue;
      if (url.startsWith('#')) { assert.ok(ids.has(url.slice(1)), `${page}: ${url}`); continue; }
      assert.ok(fs.existsSync(path.join(site, localFile(page, url))), `${page}: ${url}`);
    }
  }
});

test('nothing is loaded from another host: no trackers, fonts or CDNs', () => {
  for (const page of [...Object.keys(PAGES), '404.html']) {
    const html = read(page);
    for (const tag of [...tags(html, 'script'), ...tags(html, 'img'), ...tags(html, 'source'), ...tags(html, 'iframe')]) {
      const src = attr(tag, 'src') ?? attr(tag, 'srcset');
      if (tag.startsWith('<script')) assert.ok(!src && attr(tag, 'type') === 'application/ld+json', `${page}: ${tag}`);
      else assert.ok(src && !/^(https?:)?\/\//.test(src), `${page}: ${tag}`);
    }
    for (const tag of tags(html, 'link').filter(t => /rel="(stylesheet|icon|apple-touch-icon|preload|modulepreload)"/.test(t))) assert.ok(!/^(https?:)?\/\//.test(attr(tag, 'href')), `${page}: ${tag}`);
  }
  assert.doesNotMatch(read('assets/site.css'), /@import|url\((?!"?data:)/);
});

test('each page has a canonical URL, alternates for every language and a sitemap entry', () => {
  const sitemap = read('sitemap.xml');
  for (const [page, { lang, url }] of Object.entries(PAGES)) {
    const html = read(page);
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`), page);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), page);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`), page);
    for (const other of Object.values(PAGES)) assert.ok(html.includes(`<link rel="alternate" hreflang="${other.lang}" href="${other.url}">`), `${page} → ${other.lang}`);
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${BASE}">`), page);
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), url);
    for (const property of ['og:title', 'og:description', 'og:image', 'twitter:card', 'twitter:image']) assert.match(html, new RegExp(`(property|name)="${property}" content="[^"]+"`), `${page}: ${property}`);
    const description = html.match(/<meta name="description" content="([^"]*)">/)[1];
    assert.ok(description.length >= 80 && description.length <= 170, `${page}: description is ${description.length} characters`);
  }
  assert.ok(read('robots.txt').includes(`Sitemap: ${BASE}sitemap.xml`));
});

test('the structured data describes a free Windows productivity app', () => {
  for (const page of Object.keys(PAGES)) {
    const json = JSON.parse(read(page).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(json['@type'], 'SoftwareApplication');
    assert.equal(json.applicationCategory, 'ProductivityApplication');
    assert.match(json.operatingSystem, /Windows/);
    assert.equal(json.offers.price, '0');
    assert.equal(json.softwareVersion, version);
    assert.equal(json.inLanguage.length, 12);
  }
});

test('the preview images are 1200×630 PNGs and every screenshot has a WebP copy', () => {
  for (const name of ['og-image.png', 'og-image-ar.png']) {
    const png = fs.readFileSync(path.join(site, name));
    assert.equal(png.toString('latin1', 1, 4), 'PNG', name);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], name);
  }
  for (const shot of fs.readdirSync(path.join(__dirname, '..', 'docs', 'screenshots'))) {
    const webp = fs.readFileSync(path.join(site, 'images', shot.replace(/\.png$/, '.webp')));
    assert.equal(webp.toString('latin1', 8, 12), 'WEBP', shot);
  }
});

test('the pages stay under 200 KB without screenshots', () => {
  for (const page of Object.keys(PAGES)) {
    const files = [page, 'assets/site.css', 'images/icon.svg'];
    const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(site, file)).size, 0);
    assert.ok(bytes < 200 * 1024, `${page}: ${bytes} bytes`);
  }
});
