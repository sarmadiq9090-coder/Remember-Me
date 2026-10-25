// Builds the website's images in site/: WebP copies of docs/screenshots, the app icon as SVG and as
// a 180 px touch icon, and the 1200×630 social preview images (og-image.png, og-image-ar.png).
// Run with Electron, which draws everything in hidden windows (no image libraries needed):
//   pnpm run site-assets
// Run `pnpm run screenshots` first when the interface changed. tests/site.test.js checks the output.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const root = path.join(__dirname, '..');
const site = path.join(root, 'site');
const shots = path.join(root, 'docs', 'screenshots');
const SCREENSHOTS = ['main-en', 'alert-en', 'notes-en', 'dark-en', 'main-ar', 'alert-ar'];
const QUALITY = 0.9;

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const fromDataUrl = url => Buffer.from(url.split(',')[1], 'base64');
const icon = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
const esc = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The social preview: the icon, name, tagline and facts on the left, the reminder window on the right.
function preview({ lang, dir, name, tagline, facts, alert }) {
  return `<!doctype html><html lang="${lang}" dir="${dir}"><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    html,body{width:1200px;height:630px;overflow:hidden}
    body{font-family:"Segoe UI",Tahoma,sans-serif;color:#fff;background:radial-gradient(circle at 85% 20%,#5b4a9a 0,transparent 55%),linear-gradient(135deg,#2e2d41,#1d1b2b);display:flex;align-items:center;gap:56px;padding:0 72px}
    .text{flex:1}
    img.icon{width:132px;height:132px;display:block;margin-bottom:28px}
    h1{font-size:78px;font-weight:700;letter-spacing:-1px;line-height:1.05}
    p{font-size:34px;line-height:1.3;color:#e2dbf3;margin-top:18px;max-width:640px}
    ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
    li{font-size:24px;font-weight:600;padding:8px 18px;border-radius:999px;background:#ffffff1f;color:#f3eefc}
    img.shot{width:360px;border-radius:14px;box-shadow:0 30px 60px #0008;flex:none}
  </style><body><div class="text"><img class="icon" src="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}" alt="">
    <h1>${esc(name)}</h1><p>${esc(tagline)}</p><ul>${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <img class="shot" src="${require('node:url').pathToFileURL(path.join(shots, alert + '.png'))}" alt=""></body></html>`;
}
const PREVIEWS = {
  'og-image.png': { lang: 'en', dir: 'ltr', name: 'Remember Me', tagline: 'Reminders for Windows that stay on screen until you deal with them.', facts: ['Free', 'Open source', 'No account', '12 languages'], alert: 'alert-en' },
  'og-image-ar.png': { lang: 'ar', dir: 'rtl', name: 'ذكرني', tagline: 'تذكيرات لويندوز تبقى على الشاشة حتى تتعامل معها.', facts: ['مجاني', 'مفتوح المصدر', 'بلا حساب', '12 لغة'], alert: 'alert-ar' },
};

async function capture(html) {
  const page = path.join(os.tmpdir(), `remember-me-preview-${process.pid}.html`);
  const win = new BrowserWindow({ show: false, width: 1200, height: 630, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  try {
    // Too large for a data: URL, so the page is loaded from a temporary file.
    fs.writeFileSync(page, html);
    await win.loadFile(page);
    await new Promise(resolve => setTimeout(resolve, 800));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
    const { width, height } = image.getSize();
    return (width === 1200 && height === 630 ? image : image.resize({ width: 1200, height: 630, quality: 'best' })).toPNG();
  } finally { win.destroy(); fs.rmSync(page, { force: true }); }
}

app.disableHardwareAcceleration();
// Windows open and close one after another; closing the last one must not quit the app.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  fs.mkdirSync(path.join(site, 'images'), { recursive: true });
  const jobs = {
    images: SCREENSHOTS.map(name => ({ name, src: dataUrl(path.join(shots, name + '.png'), 'image/png'), quality: QUALITY })),
    icons: [{ name: 'icon-180.png', svg: icon, size: 180 }],
  };
  ipcMain.handle('site-assets:jobs', () => jobs);
  const done = new Promise(resolve => ipcMain.once('site-assets:done', (event, result) => resolve(result)));
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'build-site-assets-preload.cjs') } });
  await win.loadURL('data:text/html,<!doctype html><title>site assets</title>');
  const { images, icons, error } = await done;
  win.destroy();
  if (error) throw new Error(error);
  for (const { name, src } of images) fs.writeFileSync(path.join(site, 'images', name + '.webp'), fromDataUrl(src));
  for (const { name, src } of icons) fs.writeFileSync(path.join(site, 'images', name), fromDataUrl(src));
  fs.writeFileSync(path.join(site, 'images', 'icon.svg'), icon);
  for (const [name, options] of Object.entries(PREVIEWS)) fs.writeFileSync(path.join(site, name), await capture(preview(options)));
  console.log(`Wrote ${images.length} screenshots, the icons and ${Object.keys(PREVIEWS).length} preview images to site/`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
