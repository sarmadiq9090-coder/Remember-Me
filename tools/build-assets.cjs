const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.WAQT_SHARP || 'sharp');
const folder = path.join(__dirname, '../assets');
fs.mkdirSync(folder, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="p" x2="1" y2="1"><stop stop-color="#9879df"/><stop offset="1" stop-color="#6550b1"/></linearGradient></defs><rect x="8" y="8" width="240" height="240" rx="68" fill="url(#p)"/><path d="M78 151c13-14 11-32 12-52 1-21 16-38 38-38s37 17 38 38c1 20-1 38 12 52l9 11c4 6 0 13-7 13H76c-7 0-11-7-7-13z" fill="#fff"/><path d="M111 190c4 18 30 18 34 0" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M128 50v10M67 87l-9-10m131 10 9-10" fill="none" stroke="#d9c9f6" stroke-width="10" stroke-linecap="round"/><circle cx="187" cy="169" r="35" fill="#bfe3cb" stroke="#7860bc" stroke-width="7"/><path d="m172 169 10 10 20-23" fill="none" stroke="#447958" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Tray icon while reminders are waiting: the same mark with a large dot that stays visible at 16 px.
const waiting = svg.replace('</svg>', '<circle cx="196" cy="60" r="50" fill="#e8590c" stroke="#fff" stroke-width="12"/></svg>');
(async () => {
  fs.writeFileSync(path.join(folder, 'icon.svg'), svg);
  fs.writeFileSync(path.join(folder, 'tray-waiting.png'), await sharp(Buffer.from(waiting)).resize(256, 256).png().toBuffer());
  const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(folder, 'icon.png'), png);
  const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(folder, 'icon.ico'), Buffer.concat([header, png]));
})();
