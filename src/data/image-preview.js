'use strict';
const fs = require('node:fs');
const { resolveAttachment } = require('./attachments');
const imagePattern = /\.(png|jpe?g|webp|gif|bmp|ico|avif)$/i;
function isImage(record) { return imagePattern.test(record.name); }
function createPreviewService(nativeImage) {
  const cache = new Map();
  return async (state, directory, id) => {
    const { file, record } = resolveAttachment(state, directory, id);
    if (!isImage(record)) return null;
    const stat = fs.statSync(file);
    const key = `${id}:${stat.mtimeMs}:${stat.size}`;
    if (cache.has(key)) return cache.get(key);
    let image;
    try { image = await nativeImage.createThumbnailFromPath(file, { width: 1100, height: 800 }); } catch { /* Fall back to Chromium's raster decoder. */ }
    if (!image || image.isEmpty()) image = nativeImage.createFromPath(file);
    if (image.isEmpty()) return null;
    const size = image.getSize();
    if (size.width > 1100 || size.height > 800) image = image.resize({ width: Math.max(1, Math.round(size.width * Math.min(1100 / size.width, 800 / size.height))), height: Math.max(1, Math.round(size.height * Math.min(1100 / size.width, 800 / size.height))) });
    const data = image.toDataURL();
    if (cache.size >= 60) cache.delete(cache.keys().next().value);
    cache.set(key, data);
    return data;
  };
}
module.exports = { isImage, createPreviewService };
