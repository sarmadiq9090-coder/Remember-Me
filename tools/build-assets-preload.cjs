// Preload of tools/build-assets.cjs's hidden window. It asks the main process for the SVGs, draws
// each at its exact pixel size on a canvas, lays out the preview sheet, and sends the PNGs back
// as data URLs. Main never runs code in the page.
/* global document, Image */
const { ipcRenderer } = require('electron');
const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
async function rasterise(svg, size) {
  const img = await load('data:image/svg+xml;base64,' + btoa(svg));
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}
// Every ICO size at 1:1, then the small sizes magnified 4x and the tray icons at 1:1 and 4x,
// on a light and a dark taskbar color.
async function sheet(icons, trays) {
  const themes = [['Light taskbar', '#f3f3f3', '#1b1b1b'], ['Dark taskbar', '#202020', '#f3f3f3']];
  const width = 1000, block = 540, canvas = Object.assign(document.createElement('canvas'), { width, height: block * themes.length });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const draw = async (src, x, bottom, size) => ctx.drawImage(await load(src), x, bottom - size, size, size);
  for (const [index, [title, background, ink]] of themes.entries()) {
    const top = index * block;
    ctx.fillStyle = background; ctx.fillRect(0, top, width, block);
    ctx.fillStyle = ink; ctx.font = '600 18px Segoe UI'; ctx.fillText(title, 24, top + 36);
    ctx.font = '12px Segoe UI';
    let x = 24;
    for (const { size, src } of icons) { await draw(src, x, top + 316, size); ctx.fillText(String(size), x, top + 336); x += size + 22; }
    x = 24;
    for (const { size, src } of icons.filter(i => i.size <= 32)) { await draw(src, x, top + 500, size * 4); ctx.fillText(`${size} ×4`, x, top + 520); x += size * 4 + 22; }
    x += 18;
    for (const { size, src } of trays) { await draw(src, x, top + 500, size); x += size + 12; }
    ctx.fillText('tray 1x, 1.5x, 2x', x - 200, top + 520);
    x += 18;
    for (const { name, src } of trays.filter(t => t.size === 16)) { await draw(src, x, top + 500, 64); ctx.fillText(name.replace('.png', '') + ' ×4', x, top + 520); x += 64 + 40; }
  }
  return canvas.toDataURL('image/png');
}
(async () => {
  try {
    const { icons, trays } = await ipcRenderer.invoke('build-assets:jobs');
    for (const item of [...icons, ...trays]) item.src = await rasterise(item.svg, item.size);
    ipcRenderer.send('build-assets:done', { icons, trays, sheet: await sheet(icons, trays) });
  } catch (error) { ipcRenderer.send('build-assets:done', { error: String(error?.stack || error) }); }
})();
