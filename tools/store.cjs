'use strict';
// Builds the Microsoft Store package (MSIX, written as an .appx file) from the folder tools/package.mjs
// wrote, with the same electron-builder settings as the NSIS installer (tools/installer.cjs):
//
//   pnpm run package
//   pnpm run store                  the identity in store/identity.json; refused while it is a placeholder
//   pnpm run store -- --dry-run     test identity (CN=FastKiwiTest), only to check that the package builds
//   node tools/store.cjs --identity-status   prints "ready" or "placeholder" (used by .github/workflows/store.yml)
//
// The Store signs the package itself, so nothing is signed here. electron-builder builds appx only on
// Windows (makeappx.exe and makepri.exe come with its Windows kit). See docs/distribution/microsoft-store.md.
const fs = require('node:fs');
const path = require('node:path');
const { root, version, prepackaged, common, report } = require('./installer.cjs');
const { writeStoreLogos } = require('./store-logos.cjs');
const { startupTaskExtension } = require('../src/platform/login-item.js');
const { LOCALES } = require('../ui/lib/translate.js');

const IDENTITY_FILE = path.join(root, 'store', 'identity.json');
// Obvious test values for --dry-run. A package with them can't be uploaded to the Store.
const DRY_RUN_IDENTITY = { identityName: 'FastKiwiTest.RememberMe', publisher: 'CN=FastKiwiTest', publisherDisplayName: 'FastKiwi Test' };
// Windows 10 1809 (October 2018 Update) or later; tested up to Windows 11 24H2.
const MIN_VERSION = '10.0.17763.0', MAX_VERSION_TESTED = '10.0.26100.0';
// The manifest's Application Id. It names the app inside the package (its AppUserModelID is
// <family name>!RememberMe), so it must never change once the app is in the Store.
const APPLICATION_ID = 'RememberMe';
// Every interface language, as the manifest's resource languages; the first is the default.
const LANGUAGES = LOCALES.map(locale => locale.code === 'en' ? 'en-US' : locale.code);

class IdentityError extends Error {}
const placeholder = value => typeof value !== 'string' || !value.trim() || /^todo/i.test(value.trim());
// Checks store/identity.json. Throws IdentityError with what to fix; with dryRun the test identity is used.
function readIdentity(file = IDENTITY_FILE, { dryRun = false } = {}) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const displayName = typeof saved.displayName === 'string' && saved.displayName.trim() ? saved.displayName.trim() : 'Remember Me';
  if (dryRun) return { ...DRY_RUN_IDENTITY, displayName, dryRun: true };
  const missing = ['identityName', 'publisher', 'publisherDisplayName'].filter(key => placeholder(saved[key]));
  if (missing.length) {
    throw new IdentityError(`store/identity.json still has a placeholder for ${missing.join(', ')}. Copy the values from Partner Center > Remember Me Reminders > Product management > Product identity (Package/Identity/Name, Package/Identity/Publisher and Package/Properties/PublisherDisplayName), or run with --dry-run to build a test package. See docs/distribution/microsoft-store.md.`);
  }
  const identity = { identityName: saved.identityName.trim(), publisher: saved.publisher.trim(), publisherDisplayName: saved.publisherDisplayName.trim(), displayName, dryRun: false };
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identity.identityName)) throw new IdentityError(`store/identity.json: identityName "${identity.identityName}" must be 3 to 50 letters, digits, dots or dashes, exactly as Partner Center shows Package/Identity/Name.`);
  if (!/^CN=[^,]+/.test(identity.publisher)) throw new IdentityError(`store/identity.json: publisher "${identity.publisher}" must start with CN=, exactly as Partner Center shows Package/Identity/Publisher.`);
  return identity;
}
function identityStatus(file = IDENTITY_FILE) {
  try { readIdentity(file); return 'ready'; } catch (error) { if (error instanceof IdentityError) return 'placeholder'; throw error; }
}

// The electron-builder config for the appx target. resources is the build resources folder, holding
// appx/ (the logos) and the manifest's extra extensions.
function storeConfig(identity, resources) {
  return {
    ...common,
    directories: { output: path.join(root, 'release', 'store'), buildResources: resources },
    // No latest.yml or app-update.yml: the Store updates this package, never electron-updater.
    publish: null,
    appx: {
      identityName: identity.identityName, publisher: identity.publisher, publisherDisplayName: identity.publisherDisplayName,
      displayName: identity.displayName, applicationId: APPLICATION_ID,
      languages: LANGUAGES,
      // Behind the tile logos, which carry their own rounded plate; Windows shows the user's accent colour.
      backgroundColor: 'transparent', showNameOnTiles: true,
      minVersion: MIN_VERSION, maxVersionTested: MAX_VERSION_TESTED,
      // electron-builder's own startup task is enabled by default (TaskId SlackStartup); this one waits
      // for the user to turn it on in Windows, like the installer version's Start with Windows switch.
      addAutoLaunchExtension: false,
      customExtensionsPath: path.join(resources, 'extensions.xml'),
      // runFullTrust is added by electron-builder: the app is a Win32 desktop app.
      electronUpdaterAware: false,
      artifactName: identity.dryRun ? 'Remember-Me-${version}-x64-dry-run.${ext}' : 'Remember-Me-${version}-x64.${ext}',
    },
  };
}
// Writes the logos and extensions.xml into the build resources folder.
function prepareResources(identity, resources = path.join(root, 'release', 'store-resources')) {
  const logos = writeStoreLogos(path.join(root, 'assets', 'icon.png'), path.join(resources, 'appx'), path.join(root, 'assets', 'icon.ico'), path.join(root, 'store', 'logos'));
  fs.writeFileSync(path.join(resources, 'extensions.xml'), startupTaskExtension(`app\\${common.productName}.exe`, identity.displayName));
  return { resources, logos };
}

function main(args) {
  const dryRun = args.includes('--dry-run');
  if (args.includes('--identity-status')) { console.log(identityStatus()); return; }
  let identity;
  try { identity = readIdentity(IDENTITY_FILE, { dryRun }); }
  catch (error) { if (!(error instanceof IdentityError)) throw error; console.error(error.message); process.exit(1); }
  if (dryRun) console.log(`Dry run: building with the test identity ${identity.identityName} (${identity.publisher}). This package can't be uploaded to the Store.`);
  if (!fs.existsSync(path.join(prepackaged, `${common.productName}.exe`))) {
    console.error(`${path.relative(root, prepackaged)} is missing. Run \`pnpm run package\` first.`);
    process.exit(1);
  }
  const { resources, logos } = prepareResources(identity);
  console.log(`Store logos: ${logos.length} files in ${path.relative(root, path.join(resources, 'appx'))}`);
  if (process.platform === 'linux') {
    console.error('electron-builder builds appx packages only on Windows (it runs makeappx.exe and makepri.exe). The logos and settings were checked; build the package on Windows or with the Store workflow (.github/workflows/store.yml).');
    process.exit(1);
  }
  const { build, Platform, Arch } = require('electron-builder');
  return report(build({ projectDir: root, prepackaged, targets: Platform.WINDOWS.createTarget('appx', Arch.x64), publish: 'never', config: storeConfig(identity, resources) }));
}
module.exports = { IDENTITY_FILE, DRY_RUN_IDENTITY, MIN_VERSION, APPLICATION_ID, LANGUAGES, IdentityError, readIdentity, identityStatus, storeConfig, prepareResources, version };
// pnpm passes a literal `--` through, so `pnpm run store -- --dry-run` works.
if (require.main === module) main(process.argv.slice(2).filter(arg => arg !== '--'));
