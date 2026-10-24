const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const assets = path.join(__dirname, '../assets');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngSize(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG), 'PNG signature');
  assert.equal(buffer.toString('latin1', 12, 16), 'IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), rgba: buffer[25] === 6 };
}

test('icon.ico holds a sharp image for every size Windows asks for, 16 to 256 px', () => {
  const ico = fs.readFileSync(path.join(assets, 'icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1, 'Icon, not cursor');
  const count = ico.readUInt16LE(4), sizes = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + 16 * i, size = ico[entry] || 256, length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal(ico[entry + 1] || 256, size, 'Square');
    assert.equal(ico.readUInt16LE(entry + 6), 32, '32-bit color');
    assert.ok(offset + length <= ico.length, 'Entry inside the file');
    const png = pngSize(ico.subarray(offset, offset + length));
    assert.deepEqual(png, { width: size, height: size, rgba: true }, `Entry ${size} is a ${size}×${size} RGBA PNG`);
    sizes.push(size);
  }
  assert.deepEqual(sizes, [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]);
  assert.deepEqual(pngSize(fs.readFileSync(path.join(assets, 'icon.png'))), { width: 256, height: 256, rgba: true });
});

test('tray images exist at 1x, 1.5x and 2x, normal and waiting', () => {
  for (const name of ['tray', 'tray-waiting']) {
    for (const [suffix, size] of [['', 16], ['@1.5x', 24], ['@2x', 32]]) {
      assert.deepEqual(pngSize(fs.readFileSync(path.join(assets, `${name}${suffix}.png`))), { width: size, height: size, rgba: true }, `${name}${suffix}.png`);
    }
  }
});

test('the main process uses the ICO for windows and the tray images for the tray', () => {
  // The main process source, however it is split into files.
  const mainDir = path.join(__dirname, '../src/main');
  const main = fs.readdirSync(mainDir, { recursive: true }).map(String).filter(name => name.endsWith('.js')).map(name => fs.readFileSync(path.join(mainDir, name), 'utf8')).join('\n');
  assert.match(main, /assets\/icon\.ico/);
  assert.match(main, /'tray-waiting\.png' : 'tray\.png'/);
  assert.doesNotMatch(main, /new Tray\(nativeImage\.createFromPath\(icon\)\)/, 'The tray no longer downsamples the 256 px PNG');
});
