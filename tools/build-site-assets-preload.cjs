// Preload of tools/build-site-assets.cjs's hidden window. It asks the main process for the
// screenshots and icons, re-encodes the screenshots as WebP and draws the icons at their size on
// a canvas, and sends the results back as data URLs. Main never runs code in the page.
/* global document, Image, window */
const { ipcRenderer } = require('electron');
const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
async function draw(src, width, height, type, quality) {
  const img = await load(src);
  const canvas = Object.assign(document.createElement('canvas'), { width: width ?? img.naturalWidth, height: height ?? img.naturalHeight });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const jobs = await ipcRenderer.invoke('site-assets:jobs');
    const images = [];
    for (const { name, src, quality } of jobs.images) images.push({ name, src: await draw(src, null, null, 'image/webp', quality) });
    const icons = [];
    for (const { name, svg, size } of jobs.icons) icons.push({ name, src: await draw('data:image/svg+xml;base64,' + btoa(svg), size, size, 'image/png') });
    ipcRenderer.send('site-assets:done', { images, icons });
  } catch (error) {
    ipcRenderer.send('site-assets:done', { error: String(error?.stack || error) });
  }
});
