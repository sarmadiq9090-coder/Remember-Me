// Draws the app and tray icons into assets/ and the preview sheet docs/icon-preview.png.
// Run with Electron, which rasterises the SVG in a hidden window through
// tools/build-assets-preload.cjs (no image libraries needed):
//   electron tools/build-assets.cjs
// tests/icons.test.js checks the output.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const assets = path.join(__dirname, '../assets');
const preview = path.join(__dirname, '../docs/icon-preview.png');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
// Sizes up to this one use the simplified glyph; larger ones use the full mark.
const SMALL = 32;
const TRAY = { 'tray.png': 16, 'tray@1.5x.png': 24, 'tray@2x.png': 32 };

// The full mark: purple rounded square, white bell with rays and clapper, green check badge.
const gradient = '<defs><linearGradient id="p" x2="1" y2="1"><stop stop-color="#9879df"/><stop offset="1" stop-color="#6550b1"/></linearGradient></defs>';
const full = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${gradient}<rect x="8" y="8" width="240" height="240" rx="68" fill="url(#p)"/><path d="M78 151c13-14 11-32 12-52 1-21 16-38 38-38s37 17 38 38c1 20-1 38 12 52l9 11c4 6 0 13-7 13H76c-7 0-11-7-7-13z" fill="#fff"/><path d="M111 190c4 18 30 18 34 0" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M128 50v10M67 87l-9-10m131 10 9-10" fill="none" stroke="#d9c9f6" stroke-width="10" stroke-linecap="round"/><circle cx="187" cy="169" r="35" fill="#bfe3cb" stroke="#7860bc" stroke-width="7"/><path d="m172 169 10 10 20-23" fill="none" stroke="#447958" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// The simplified glyph for 16-32 px, drawn on a 16-unit grid: the square fills the whole icon,
// the bell is heavier and has no rays, and the badge is larger with a white check. Edges of the
// bell sit on whole pixels at 16 and 32 px.
function small(size, { waiting = false } = {}) {
  const dot = waiting ? '<circle cx="12.5" cy="3.5" r="3.25" fill="#e8590c" stroke="#6550b1" stroke-width="1"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">${gradient}<rect width="16" height="16" rx="3.5" fill="url(#p)"/><rect x="6" y="1.5" width="2" height="2" rx=".75" fill="#fff"/><path d="M3 6.5a4 4 0 0 1 8 0V9l1 1v1H2v-1l1-1z" fill="#fff"/><path d="M5.5 12h3a1.5 1.5 0 0 1-3 0z" fill="#fff"/><circle cx="12" cy="12" r="3.5" fill="#2f9a5e" stroke="#6550b1" stroke-width="1"/><path d="m10.4 12 1.1 1.1 2.1-2.3" fill="none" stroke="#fff" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>${dot}</svg>`;
}
// The full mark with the waiting dot, for the rare tray scale above 2x.
function sized(svg, size) { return svg.replace('width="256" height="256"', `width="${size}" height="${size}"`); }

// A multi-image ICO with PNG-compressed entries (supported by Windows Vista and later).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry); header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(image => image.png)]);
}

const png = dataUrl => Buffer.from(dataUrl.split(',')[1], 'base64');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const jobs = {
    icons: ICO_SIZES.map(size => ({ size, svg: size <= SMALL ? small(size) : sized(full, size) })),
    trays: Object.entries(TRAY).flatMap(([name, size]) => [{ name, size, svg: small(size) }, { name: name.replace('tray', 'tray-waiting'), size, svg: small(size, { waiting: true }) }]),
  };
  ipcMain.handle('build-assets:jobs', () => jobs);
  const done = new Promise(resolve => ipcMain.once('build-assets:done', (event, result) => resolve(result)));
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'build-assets-preload.cjs') } });
  await win.loadURL('data:text/html,<!doctype html><title>assets</title>');
  const { icons, trays, sheet, error } = await done;
  if (error) throw new Error(error);
  fs.writeFileSync(path.join(assets, 'icon.svg'), full);
  fs.writeFileSync(path.join(assets, 'icon-small.svg'), small(16));
  fs.writeFileSync(path.join(assets, 'icon.png'), png(icons.at(-1).src));
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico(icons.map(({ size, src }) => ({ size, png: png(src) }))));
  for (const { name, src } of trays) fs.writeFileSync(path.join(assets, name), png(src));
  fs.mkdirSync(path.dirname(preview), { recursive: true });
  fs.writeFileSync(preview, png(sheet));
  console.log('Wrote icon.ico (' + ICO_SIZES.join(', ') + '), icon.png, icon.svg, icon-small.svg,', trays.map(t => t.name).join(', '), 'and docs/icon-preview.png');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
