// Builds the Chocolatey package (<id>.<version>.nupkg) from docs/distribution/chocolatey without
// choco, for publishing from a PC where Chocolatey isn't installed.
//   node tools/chocolatey-pack.mjs [--src docs/distribution/chocolatey] [--out release/chocolatey]
// A .nupkg is a ZIP in the Open Packaging Conventions layout that `choco pack` writes: the nuspec
// at the root (without its <files> list), the package files, [Content_Types].xml, _rels/.rels and
// package/services/metadata/core-properties/<id>.psmdcp. The output is the same for the same
// input: fixed timestamps, and part names derived from the content.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const xml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unxml = text => String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function field(nuspec, name) {
  const match = new RegExp(`<${name}>([^]*?)</${name}>`).exec(nuspec);
  return match ? unxml(match[1]) : '';
}

// The package's parts as [name, bytes], in the order choco pack writes them.
export function nupkgEntries({ nuspec, files }) {
  const id = field(nuspec, 'id'), version = field(nuspec, 'version');
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || !/^\d+(\.\d+){1,3}$/.test(version)) throw new Error('The nuspec needs a lower-case id and a numeric version.');
  // The <files> list only tells pack what to include; the packed manifest doesn't carry it.
  const manifest = nuspec.replace(/\s*<files>[^]*?<\/files>/, '');
  const digest = createHash('sha256').update(manifest);
  for (const [name, text] of Object.entries(files)) digest.update(name).update(text);
  const hash = digest.digest('hex');
  const psmdcp = `package/services/metadata/core-properties/${hash.slice(0, 32)}.psmdcp`;
  const properties = `<?xml version="1.0" encoding="utf-8"?><coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:creator>${xml(field(nuspec, 'authors'))}</dc:creator><dc:description>${xml(field(nuspec, 'description'))}</dc:description><dc:identifier>${xml(id)}</dc:identifier><version>${xml(version)}</version><keywords>${xml(field(nuspec, 'tags'))}</keywords><dc:title>${xml(field(nuspec, 'title'))}</dc:title><lastModifiedBy>Remember Me tools/chocolatey-pack.mjs</lastModifiedBy></coreProperties>`;
  const rels = `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/${id}.nuspec" Id="R${hash.slice(32, 48)}" /><Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="/${psmdcp}" Id="R${hash.slice(48, 64)}" /></Relationships>`;
  const extensions = [...new Set([`${id}.nuspec`, ...Object.keys(files)].map(name => path.posix.extname(name).slice(1).toLowerCase()))].filter(Boolean);
  const types = `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />${extensions.map(ext => `<Default Extension="${ext}" ContentType="application/octet" />`).join('')}<Default Extension="psmdcp" ContentType="application/vnd.openxmlformats-package.core-properties+xml" /></Types>`;
  return [
    ['_rels/.rels', rels],
    [`${id}.nuspec`, manifest],
    ...Object.entries(files),
    [psmdcp, properties],
    ['[Content_Types].xml', types],
  ].map(([name, text]) => [name, Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8')]);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
export function crc32(bytes) { let c = -1; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }

// A plain ZIP (deflate, UTF-8 names, no directory entries), dated 2026-01-01 00:00.
export function zip(entries) {
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8'), packed = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// Reads a ZIP written by zip() (for the tests): [{ name, data }] from the central directory.
export function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  const entries = [];
  for (let i = 0, at = buffer.readUInt32LE(end + 16); i < count; i++) {
    const method = buffer.readUInt16LE(at + 10), crc = buffer.readUInt32LE(at + 16), size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28), extra = buffer.readUInt16LE(at + 30), comment = buffer.readUInt16LE(at + 32), local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    entries.push({ name, data });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

// The package source in a folder: the one .nuspec, and everything under tools/.
export function readPackageSource(folder) {
  const nuspecName = fs.readdirSync(folder).find(name => name.endsWith('.nuspec'));
  if (!nuspecName) throw new Error(`No .nuspec in ${folder}`);
  const files = {};
  for (const name of fs.readdirSync(path.join(folder, 'tools')).sort()) files[`tools/${name}`] = fs.readFileSync(path.join(folder, 'tools', name), 'utf8').replace(/\r\n/g, '\n');
  return { nuspec: fs.readFileSync(path.join(folder, nuspecName), 'utf8').replace(/\r\n/g, '\n'), files };
}
export function packFolder(folder) {
  const source = readPackageSource(folder);
  return { name: `${field(source.nuspec, 'id')}.${field(source.nuspec, 'version')}.nupkg`, bytes: zip(nupkgEntries(source)) };
}

function argument(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = argument('--src') || path.join(root, 'docs', 'distribution', 'chocolatey');
  const out = argument('--out') || path.join(root, 'release', 'chocolatey');
  const { name, bytes } = packFolder(src);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, name), bytes);
  console.log(`Wrote ${path.join(out, name)} (${bytes.length} bytes)`);
}
