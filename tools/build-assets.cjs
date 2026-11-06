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
const TRAY = { 'tray.png': 16, 'tray@1.5x.png': 24, 'tray@2x.png': 32 };

// The art is FastKiwi brand v2 (sarmadiq9090-coder.github.io, brand/icons/remember-me), copied into
// tools/icon-art/: a lavender bell on the forest tile with the lime seed (256 grid), and hand-tuned
// 16, 20, 24 and 32 px drawings without the seed. The brand's Store/MSIX set is in store/logos/.
const art = name => fs.readFileSync(path.join(__dirname, 'icon-art', name), 'utf8').trim();
const full = art('remember-me.svg');
const GRIDS = [16, 20, 24, 32];
const grid = Object.fromEntries(GRIDS.map(size => [size, art(`remember-me-${size}.svg`)]));
// The brand's rule for which drawing each size uses: 16-17 the 16 grid, 18-21 the 20 grid,
// 22-27 the 24 grid, 28-40 the 32 grid, 41 and larger the full mark.
const gridFor = size => size <= 17 ? 16 : size <= 21 ? 20 : size <= 27 ? 24 : 32;
// The hand-tuned drawing for 16 to 40 px, the full mark above. waiting adds the orange dot of the
// waiting tray icon at the top right, drawn on the 16 grid and scaled with it.
function sized(svg, size) { return svg.replace(/ width="\d+" height="\d+"/, ` width="${size}" height="${size}"`); }
function small(size, { waiting = false } = {}) {
  const g = gridFor(size), svg = sized(grid[g], size);
  if (!waiting) return svg;
  const dot = `<g transform="scale(${g / 16})"><circle cx="12.5" cy="3.5" r="3.25" fill="#e8590c" stroke="#123B2A" stroke-width="1"/></g>`;
  return svg.replace('</svg>', dot + '</svg>');
}
const iconSvg = size => size <= 40 ? small(size) : sized(full, size);

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
    icons: ICO_SIZES.map(size => ({ size, svg: iconSvg(size) })),
    trays: Object.entries(TRAY).flatMap(([name, size]) => [{ name, size, svg: small(size) }, { name: name.replace('tray', 'tray-waiting'), size, svg: small(size, { waiting: true }) }]),
  };
  ipcMain.handle('build-assets:jobs', () => jobs);
  const done = new Promise(resolve => ipcMain.once('build-assets:done', (event, result) => resolve(result)));
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'build-assets-preload.cjs') } });
  await win.loadURL('data:text/html,<!doctype html><title>assets</title>');
  const { icons, trays, sheet, error } = await done;
  if (error) throw new Error(error);
  fs.writeFileSync(path.join(assets, 'icon.svg'), full + '\n');
  fs.writeFileSync(path.join(assets, 'icon-small.svg'), grid[16] + '\n');
  fs.writeFileSync(path.join(assets, 'icon.png'), png(icons.at(-1).src));
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico(icons.map(({ size, src }) => ({ size, png: png(src) }))));
  for (const { name, src } of trays) fs.writeFileSync(path.join(assets, name), png(src));
  fs.mkdirSync(path.dirname(preview), { recursive: true });
  fs.writeFileSync(preview, png(sheet));
  console.log('Wrote icon.ico (' + ICO_SIZES.join(', ') + '), icon.png, icon.svg, icon-small.svg,', trays.map(t => t.name).join(', '), 'and docs/icon-preview.png');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
