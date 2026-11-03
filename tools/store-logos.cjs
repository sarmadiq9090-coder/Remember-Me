'use strict';
// Draws the Microsoft Store package logos from assets/icon.png (256 px), in plain Node: the PNG is
// decoded, scaled down with an area average (in premultiplied alpha, so the rounded corners stay
// clean) and centered on a transparent tile. Where assets/icon.ico has the exact size (16 to 256 px,
// drawn from the SVG at that size, with the simpler glyph at 32 px and below), that image is used. Nothing is ever scaled up, so a size whose icon would be
// larger than 256 px is left out; Windows then uses the nearest larger scale it has.
//
// electron-builder's appx target maps every file of <buildResources>/appx into the package's assets
// folder and, because the names carry .scale-/.targetsize- qualifiers, builds resources.pri with
// makepri so Windows picks the right size for each display.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// [name, tile width, tile height, icon size as a share of the tile height]
// Square44x44Logo is the taskbar, Start list and title bar icon; its targetsize files are used at
// exact pixel sizes, and the altform-unplated ones on the taskbar without the tile plate.
const TILES = [
  ['StoreLogo', 50, 50, 1],
  ['Square44x44Logo', 44, 44, 1],
  ['Square150x150Logo', 150, 150, 0.6],
  ['Wide310x150Logo', 310, 150, 0.6],
];
const SCALES = [100, 125, 150, 200, 400];
const TARGET_SIZES = [16, 24, 32, 48, 256];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) { let c = 0xffffffff; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// 8-bit RGBA or RGB, not interlaced: what tools/build-assets.cjs writes.
function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error('Not a PNG file.');
  let width, height, colorType;
  const idat = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at), type = buffer.toString('latin1', at + 4, at + 8), body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); colorType = body[9];
      if (body[8] !== 8 || ![2, 6].includes(colorType) || body[12] !== 0) throw new Error('Only 8-bit RGB or RGBA PNGs without interlacing are supported.');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3, stride = width * channels, raw = zlib.inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(width * height * 4), line = Buffer.alloc(stride), previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predictor === undefined) throw new Error('Unknown PNG filter.');
      line[x] = (row[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      line.copy(data, (y * width + x) * 4, x * channels, x * channels + 3);
      data[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    line.copy(previous);
  }
  return { width, height, data };
}

function encodePng({ width, height, data }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (type, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length); head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// For each target pixel, the source pixels it covers and how much of each.
function weights(from, to) {
  const ratio = from / to;
  return Array.from({ length: to }, (_, i) => {
    const start = i * ratio, end = start + ratio, list = [];
    for (let s = Math.floor(start); s < Math.min(from, Math.ceil(end)); s++) list.push([s, (Math.min(end, s + 1) - Math.max(start, s)) / ratio]);
    return list;
  });
}
// Area-average downscale in premultiplied alpha.
function scaleDown(image, size) {
  if (size > image.width || size > image.height) throw new Error(`The icon would be scaled up to ${size} px.`);
  const wx = weights(image.width, size), wy = weights(image.height, size);
  const rows = new Float64Array(image.height * size * 4);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < size; x++) {
      for (const [sx, w] of wx[x]) {
        const i = (y * image.width + sx) * 4, alpha = image.data[i + 3] / 255, o = (y * size + x) * 4;
        rows[o] += image.data[i] * alpha * w; rows[o + 1] += image.data[i + 1] * alpha * w; rows[o + 2] += image.data[i + 2] * alpha * w; rows[o + 3] += alpha * w;
      }
    }
  }
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [sy, w] of wy[y]) { const o = (sy * size + x) * 4; r += rows[o] * w; g += rows[o + 1] * w; b += rows[o + 2] * w; a += rows[o + 3] * w; }
      const o = (y * size + x) * 4;
      if (a > 0) { data[o] = Math.round(r / a); data[o + 1] = Math.round(g / a); data[o + 2] = Math.round(b / a); }
      data[o + 3] = Math.round(a * 255);
    }
  }
  return { width: size, height: size, data };
}
function centered(icon, width, height) {
  const data = Buffer.alloc(width * height * 4), left = Math.floor((width - icon.width) / 2), top = Math.floor((height - icon.height) / 2);
  for (let y = 0; y < icon.height; y++) icon.data.copy(data, ((top + y) * width + left) * 4, y * icon.width * 4, (y + 1) * icon.width * 4);
  return { width, height, data };
}

// The PNG images inside an .ico file, by width (tools/build-assets.cjs writes only PNG entries).
function icoImages(buffer) {
  const images = new Map();
  for (let i = 0; i < buffer.readUInt16LE(4); i++) {
    const entry = 6 + 16 * i, size = buffer.readUInt32LE(entry + 8), offset = buffer.readUInt32LE(entry + 12);
    const png = buffer.subarray(offset, offset + size);
    if (png.subarray(1, 4).toString('latin1') !== 'PNG') continue;
    const image = decodePng(png);
    if (image.width === image.height) images.set(image.width, image);
  }
  return images;
}

// Every logo file the package gets: { name, width, height, icon } with icon the icon's pixel size.
function logoFiles(maxIcon = 256) {
  const files = [];
  for (const [name, width, height, share] of TILES) {
    for (const scale of SCALES) {
      const w = Math.round(width * scale / 100), h = Math.round(height * scale / 100), icon = Math.round(h * share);
      if (icon <= maxIcon) files.push({ name: `${name}.scale-${scale}.png`, width: w, height: h, icon });
    }
  }
  for (const size of TARGET_SIZES) {
    for (const suffix of ['', '_altform-unplated']) files.push({ name: `Square44x44Logo.targetsize-${size}${suffix}.png`, width: size, height: size, icon: size });
  }
  return files;
}

// Writes the logos into folder (emptied first) and returns their names. ico is optional.
function writeStoreLogos(source, folder, ico = null) {
  const image = decodePng(fs.readFileSync(source));
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const icons = ico ? icoImages(fs.readFileSync(ico)) : new Map();
  return logoFiles(Math.min(image.width, image.height)).map(({ name, width, height, icon }) => {
    if (!icons.has(icon)) icons.set(icon, icon === image.width ? image : scaleDown(image, icon));
    fs.writeFileSync(path.join(folder, name), encodePng(centered(icons.get(icon), width, height)));
    return name;
  });
}
module.exports = { TILES, SCALES, TARGET_SIZES, decodePng, encodePng, scaleDown, icoImages, logoFiles, writeStoreLogos };
