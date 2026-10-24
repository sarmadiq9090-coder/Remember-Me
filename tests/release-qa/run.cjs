// Release QA: drives the packaged desktop-test build through realistic scenarios in English,
// Arabic and Russian. Build it first, then run with WAQT_EXECUTABLE pointing at the exe:
//   WAQT_BUILD_FOLDER=qa WAQT_DESKTOP_TEST_BUILD=1 pnpm run package
//   WAQT_EXECUTABLE="release/qa/Remember Me-win32-x64/Remember Me.exe" pnpm test:release-qa
// Every launch uses WAQT_TEST=1 and a new temporary data folder, and dialogs and shell calls are
// stubbed in the main process, so nothing touches real data, folders or the browser.
const { results } = require('./harness.cjs');
const scenarios = ['start-and-repeats', 'alert', 'alert-live', 'notes-themes-about', 'attachments-backups', 'translations', 'native-fields'];
(async () => {
  for (const name of scenarios) { console.log(`\n# ${name}`); await require(`./${name}.cjs`)(); }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
