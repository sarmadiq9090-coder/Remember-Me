// Refreshes assets/apps.json, the "More from FastKiwi" list in About, from the website repository
// (sarmadiq9090-coder.github.io, data/apps.json; see docs/apps-data.md there), and records the
// commit it came from in assets/apps.source.txt. The app embeds the copy and never fetches the list
// or any icon while it runs. With the site repository checked out next to this one at the commit you
// want, run (one line), then commit both files:
//   node tools/sync-apps.cjs ../sarmadiq9090-coder.github.io/data/apps.json $(git -C ../sarmadiq9090-coder.github.io rev-parse HEAD)
const fs = require('node:fs');
const path = require('node:path');
const { parseApps } = require('../src/platform/more-apps');
const root = path.join(__dirname, '..');
const [source, commit] = process.argv.slice(2);
if (!source || !/^[0-9a-f]{40}$/.test(commit || '')) {
  console.error('Usage: node tools/sync-apps.cjs <site repo>/data/apps.json <full commit SHA of the site repo>');
  process.exit(1);
}
const text = fs.readFileSync(source, 'utf8');
// Refuse a file the app could not read, so a broken list never reaches a release.
parseApps(JSON.parse(text));
fs.writeFileSync(path.join(root, 'assets', 'apps.json'), text);
fs.writeFileSync(path.join(root, 'assets', 'apps.source.txt'), `sarmadiq9090-coder.github.io ${commit} data/apps.json\n`);
console.log(`assets/apps.json updated from ${commit}`);
